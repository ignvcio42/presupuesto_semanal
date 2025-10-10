import { z } from 'zod';
import { createTRPCRouter, publicProcedure } from '~/server/api/trpc';
import { 
  createUserSchema, 
  updateUserSchema, 
  createCategorySchema, 
  updateCategorySchema,
  createExpenseSchema,
  updateExpenseSchema,
  closeWeekSchema,
  getMonthDataSchema,
  updateCategoryAllocationsSchema,
} from '~/lib/validations';
import { 
  getWeeksOfMonth, 
  getCurrentWeek, 
  calculateBudgetPercentage, 
  getTrafficLightColor,
  calculateRollover,
  getDefaultCategories,
} from '~/lib/date-utils';

export const budgetRouter = createTRPCRouter({
  // Usuario
  createUser: publicProcedure
    .input(createUserSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.create({
        data: {
          monthlyBudget: input.monthlyBudget,
          budgetMode: input.budgetMode,
        },
      });

      // Crear categorías predeterminadas si el modo es 'categorized'
      if (input.budgetMode === 'categorized') {
        const defaultCategories = getDefaultCategories();
        await ctx.db.category.createMany({
          data: defaultCategories.map(cat => ({
            name: cat.name,
            allocation: cat.suggestedPercentage,
            userId: user.id,
          })),
        });
      }

      return user;
    }),

  updateUser: publicProcedure
    .input(updateUserSchema)
    .mutation(async ({ ctx, input }) => {
      // Por simplicidad, asumimos que hay un solo usuario
      const user = await ctx.db.user.findFirst();
      if (!user) throw new Error('Usuario no encontrado');

      const updatedUser = await ctx.db.user.update({
        where: { id: user.id },
        data: input,
      });

      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;

      // Si se cambió el modo de presupuesto, eliminar todas las asignaciones por categoría
      if (input.budgetMode && input.budgetMode !== user.budgetMode) {
        // Eliminar todas las asignaciones por categoría existentes
        await ctx.db.weekCategory.deleteMany({
          where: {
            week: {
              userId: user.id,
              startDate: {
                gte: new Date(year, month - 1, 1),
                lt: new Date(year, month, 1),
              },
            },
          },
        });

        // Si se cambió a modo categorizado, crear las categorías predeterminadas
        if (input.budgetMode === 'categorized') {
          const existingCategories = await ctx.db.category.findMany({
            where: { userId: user.id },
          });

          if (existingCategories.length === 0) {
            const defaultCategories = getDefaultCategories();
            await ctx.db.category.createMany({
              data: defaultCategories.map(cat => ({
                name: cat.name,
                allocation: cat.suggestedPercentage,
                userId: user.id,
              })),
            });
          }
        }
      }

      // Si se actualizó el presupuesto mensual o se cambió el modo, actualizar las semanas existentes
      if ((input.monthlyBudget && input.monthlyBudget > 0) || (input.budgetMode && input.budgetMode !== user.budgetMode)) {
        // Buscar el historial mensual actual
        const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
          where: {
            userId_year_month: {
              userId: user.id,
              year,
              month,
            },
          },
          include: {
            weeks: {
              include: {
                weekCategories: true,
              },
            },
          },
        });

        if (monthlyHistory) {
          // Actualizar el presupuesto total del historial
          const budgetToUse = input.monthlyBudget || user.monthlyBudget || 0;
          await ctx.db.monthlyHistory.update({
            where: { id: monthlyHistory.id },
            data: { totalBudget: budgetToUse },
          });

          // Recalcular las semanas con el nuevo presupuesto (o el actual si no se cambió)
          const monthInfo = getWeeksOfMonth(year, month, budgetToUse);
          
          // Actualizar cada semana existente
          for (let i = 0; i < monthlyHistory.weeks.length; i++) {
            const existingWeek = monthlyHistory.weeks[i];
            const newWeekInfo = monthInfo.weeks[i];
            
            if (existingWeek && newWeekInfo) {
              // Calcular el rollover basado en el presupuesto original y el gasto
              const originalWeeklyBudget = (user.monthlyBudget || 0) / 4.33; // Presupuesto semanal base
              const currentRollover = existingWeek.weeklyBudget - originalWeeklyBudget;
              
              // Calcular el nuevo presupuesto semanal manteniendo el rollover existente
              const newWeeklyBudget = newWeekInfo.weeklyBudget + currentRollover;
              
              // Actualizar la semana
              await ctx.db.week.update({
                where: { id: existingWeek.id },
                data: {
                  weeklyBudget: newWeeklyBudget,
                },
              });

              // Actualizar las asignaciones por categoría según el modo
              if (input.budgetMode === 'categorized') {
                const categories = await ctx.db.category.findMany({
                  where: { userId: user.id },
                });

                // Eliminar asignaciones existentes
                await ctx.db.weekCategory.deleteMany({
                  where: { weekId: existingWeek.id },
                });

                // Crear nuevas asignaciones
                await Promise.all(
                  categories.map(category =>
                    ctx.db.weekCategory.create({
                      data: {
                        categoryId: category.id,
                        weekId: existingWeek.id,
                        allocatedAmount: (newWeeklyBudget * category.allocation) / 100,
                      },
                    })
                  )
                );
              } else if (input.budgetMode === 'simple') {
                // Eliminar todas las asignaciones por categoría para modo simple
                await ctx.db.weekCategory.deleteMany({
                  where: { weekId: existingWeek.id },
                });
              }
            }
          }
        } else {
          // Si no existe historial, crear las semanas del mes actual
          const budgetToUse = input.monthlyBudget || user.monthlyBudget || 0;
          const monthInfo = getWeeksOfMonth(year, month, budgetToUse);
          
          // Crear el historial mensual
          const newMonthlyHistory = await ctx.db.monthlyHistory.create({
            data: {
              userId: user.id,
              year,
              month,
              totalBudget: budgetToUse,
              totalSpent: 0,
              totalRollover: 0,
            },
          });

          // Crear las semanas
          for (const week of monthInfo.weeks) {
            const dbWeek = await ctx.db.week.create({
              data: {
                userId: user.id,
                weekNumber: week.weekNumber,
                startDate: week.startDate,
                endDate: week.endDate,
                weeklyBudget: week.weeklyBudget,
                monthlyHistoryId: newMonthlyHistory.id,
              },
            });

            // Si el modo es por categorías, crear las asignaciones por categoría
            if (input.budgetMode === 'categorized') {
              const categories = await ctx.db.category.findMany({
                where: { userId: user.id },
              });

              await Promise.all(
                categories.map(category =>
                  ctx.db.weekCategory.create({
                    data: {
                      categoryId: category.id,
                      weekId: dbWeek.id,
                      allocatedAmount: (week.weeklyBudget * category.allocation) / 100,
                    },
                  })
                )
              );
            }
          }
        }
      }

      return updatedUser;
    }),

  getUser: publicProcedure
    .query(async ({ ctx }) => {
      let user = await ctx.db.user.findFirst();
      
      if (!user) {
        // Crear usuario por defecto
        user = await ctx.db.user.create({
          data: {
            monthlyBudget: 100000, // $100.000 CLP por defecto
            budgetMode: 'categorized',
          },
        });

        // Crear categorías predeterminadas
        const defaultCategories = getDefaultCategories();
        await ctx.db.category.createMany({
          data: defaultCategories.map(cat => ({
            name: cat.name,
            allocation: cat.suggestedPercentage,
            userId: user!.id,
          })),
        });

        // Crear las semanas del mes actual
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const monthInfo = getWeeksOfMonth(year, month, 100000);
        
        // Crear el historial mensual
        const monthlyHistory = await ctx.db.monthlyHistory.create({
          data: {
            userId: user.id,
            year,
            month,
            totalBudget: 100000,
            totalSpent: 0,
            totalRollover: 0,
          },
        });

        // Crear las semanas
        for (const week of monthInfo.weeks) {
          // Buscar si hay rollover de la semana anterior para aplicar
          let rolloverToApply = 0;
          if (week.weekNumber > 1) {
            const previousWeek = await ctx.db.week.findFirst({
              where: {
                userId: user.id,
                weekNumber: week.weekNumber - 1,
                monthlyHistoryId: monthlyHistory.id,
              },
            });
            
            if (previousWeek && previousWeek.isClosed) {
              rolloverToApply = previousWeek.rolloverAmount;
            }
          }

          const dbWeek = await ctx.db.week.create({
            data: {
              userId: user.id,
              weekNumber: week.weekNumber,
              startDate: week.startDate,
              endDate: week.endDate,
              weeklyBudget: week.weeklyBudget + rolloverToApply,
              rolloverAmount: 0, // La primera semana no tiene rollover
              monthlyHistoryId: monthlyHistory.id,
            },
          });

          // Crear las asignaciones por categoría
          const categories = await ctx.db.category.findMany({
            where: { userId: user.id },
          });

          await Promise.all(
            categories.map(category =>
              ctx.db.weekCategory.create({
                data: {
                  categoryId: category.id,
                  weekId: dbWeek.id,
                  allocatedAmount: ((week.weeklyBudget + rolloverToApply) * category.allocation) / 100,
                },
              })
            )
          );
        }
      }

      return user;
    }),

  // Categorías
  getCategories: publicProcedure
    .query(async ({ ctx }) => {
      const user = await ctx.db.user.findFirst();
      if (!user) return [];

      return await ctx.db.category.findMany({
        where: { userId: user.id },
        orderBy: { name: 'asc' },
      });
    }),

  createCategory: publicProcedure
    .input(createCategorySchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst();
      if (!user) throw new Error('Usuario no encontrado');

      return await ctx.db.category.create({
        data: {
          ...input,
          userId: user.id,
        },
      });
    }),

  updateCategory: publicProcedure
    .input(z.object({ id: z.string(), data: updateCategorySchema }))
    .mutation(async ({ ctx, input }) => {
      return await ctx.db.category.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  deleteCategory: publicProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst();
      if (!user) throw new Error('Usuario no encontrado');

      // Verificar que la categoría existe y pertenece al usuario
      const category = await ctx.db.category.findUnique({
        where: { id: input },
      });

      if (!category) throw new Error('Categoría no encontrada');
      if (category.userId !== user.id) throw new Error('Categoría no pertenece al usuario');

      // Eliminar gastos asociados a esta categoría
      await ctx.db.expense.updateMany({
        where: { categoryId: input },
        data: { categoryId: null },
      });

      // Eliminar asignaciones por categoría de las semanas
      await ctx.db.weekCategory.deleteMany({
        where: { categoryId: input },
      });

      // Eliminar la categoría
      return await ctx.db.category.delete({
        where: { id: input },
      });
    }),

  updateCategoryAllocations: publicProcedure
    .input(updateCategoryAllocationsSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst();
      if (!user) throw new Error('Usuario no encontrado');

      // Actualizar todas las asignaciones
      await Promise.all(
        input.allocations.map(({ categoryId, allocation }) =>
          ctx.db.category.update({
            where: { id: categoryId },
            data: { allocation },
          })
        )
      );

      // Recalcular las asignaciones por categoría de todas las semanas existentes
      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;

      // Buscar el historial mensual actual
      const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
        where: {
          userId_year_month: {
            userId: user.id,
            year,
            month,
          },
        },
        include: {
          weeks: {
            include: {
              weekCategories: true,
            },
          },
        },
      });

      if (monthlyHistory) {
        // Actualizar cada semana existente
        for (const week of monthlyHistory.weeks) {
          // Eliminar asignaciones existentes
          await ctx.db.weekCategory.deleteMany({
            where: { weekId: week.id },
          });

          // Crear nuevas asignaciones con los porcentajes actualizados
          await Promise.all(
            input.allocations.map(({ categoryId, allocation }) =>
              ctx.db.weekCategory.create({
                data: {
                  categoryId,
                  weekId: week.id,
                  allocatedAmount: (week.weeklyBudget * allocation) / 100,
                },
              })
            )
          );
        }
      }

      return { success: true };
    }),

  // Gastos
  getExpenses: publicProcedure
    .input(z.object({ 
      weekId: z.string().optional(),
      categoryId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst();
      if (!user) return [];

      return await ctx.db.expense.findMany({
        where: {
          userId: user.id,
          ...(input.weekId && { weekId: input.weekId }),
          ...(input.categoryId && { categoryId: input.categoryId }),
        },
        include: {
          category: true,
        },
        orderBy: { date: 'desc' },
      });
    }),

  createExpense: publicProcedure
    .input(createExpenseSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst();
      if (!user) throw new Error('Usuario no encontrado');

      // Validar que la categoría existe si se proporciona categoryId
      if (input.categoryId) {
        const category = await ctx.db.category.findUnique({
          where: { id: input.categoryId },
        });
        if (!category) {
          throw new Error('Categoría no encontrada');
        }
        if (category.userId !== user.id) {
          throw new Error('Categoría no pertenece al usuario');
        }
      }

      // Encontrar la semana correspondiente a la fecha del gasto
      const expenseDate = input.date;
      const year = expenseDate.getFullYear();
      const month = expenseDate.getMonth() + 1;

      const monthInfo = getWeeksOfMonth(year, month, user.monthlyBudget || 0);
      const week = monthInfo.weeks.find(w => 
        expenseDate >= w.startDate && expenseDate <= w.endDate
      );

      if (!week) throw new Error('No se pudo encontrar la semana para esta fecha');

      // Buscar o crear la semana en la base de datos
      let dbWeek = await ctx.db.week.findFirst({
        where: {
          userId: user.id,
          weekNumber: week.weekNumber,
          startDate: week.startDate,
        },
      });

      if (!dbWeek) {
        // Crear el historial mensual si no existe
        let monthlyHistory = await ctx.db.monthlyHistory.findUnique({
          where: {
            userId_year_month: {
              userId: user.id,
              year,
              month,
            },
          },
        });

        if (!monthlyHistory) {
          monthlyHistory = await ctx.db.monthlyHistory.create({
            data: {
              userId: user.id,
              year,
              month,
              totalBudget: user.monthlyBudget || 0,
              totalSpent: 0,
              totalRollover: 0,
            },
          });
        }

        // Buscar si hay rollover de la semana anterior para aplicar
        let rolloverToApply = 0;
        if (week.weekNumber > 1) {
          const previousWeek = await ctx.db.week.findFirst({
            where: {
              userId: user.id,
              weekNumber: week.weekNumber - 1,
              monthlyHistoryId: monthlyHistory.id,
            },
          });
          
          if (previousWeek && previousWeek.isClosed) {
            rolloverToApply = previousWeek.rolloverAmount;
          }
        }

        dbWeek = await ctx.db.week.create({
          data: {
            userId: user.id,
            weekNumber: week.weekNumber,
            startDate: week.startDate,
            endDate: week.endDate,
            weeklyBudget: week.weeklyBudget + rolloverToApply,
            monthlyHistoryId: monthlyHistory.id,
          },
        });

        // Crear asignaciones por categoría para esta semana (solo si el modo es categorizado)
        if (user.budgetMode === 'categorized') {
          const categories = await ctx.db.category.findMany({
            where: { userId: user.id },
          });

          await Promise.all(
            categories.map(category =>
              ctx.db.weekCategory.create({
                data: {
                  categoryId: category.id,
                  weekId: dbWeek!.id,
                  allocatedAmount: ((week.weeklyBudget + rolloverToApply) * category.allocation) / 100,
                },
              })
            )
          );
        }
      }

      // Crear el gasto
      const expense = await ctx.db.expense.create({
        data: {
          ...input,
          userId: user.id,
          weekId: dbWeek!.id,
        },
      });

      // Actualizar el monto gastado en la semana
      await ctx.db.week.update({
        where: { id: dbWeek!.id },
        data: {
          spentAmount: {
            increment: input.amount,
          },
        },
      });

      // Actualizar el monto gastado en la categoría de la semana (solo si hay categoría)
      if (input.categoryId) {
        await ctx.db.weekCategory.updateMany({
          where: {
            weekId: dbWeek!.id,
            categoryId: input.categoryId,
          },
          data: {
            spentAmount: {
              increment: input.amount,
            },
          },
        });
      }

      // Actualizar el total gastado en el historial mensual
      await ctx.db.monthlyHistory.update({
        where: { id: dbWeek!.monthlyHistoryId },
        data: {
          totalSpent: {
            increment: input.amount,
          },
        },
      });

      // Si la semana ya está cerrada, recalcular el rollover y ajustar la siguiente semana
      if (dbWeek.isClosed) {
        const newRollover = calculateRollover(dbWeek.weeklyBudget, dbWeek.spentAmount + input.amount);
        const oldRollover = dbWeek.rolloverAmount;
        const rolloverDifference = newRollover - oldRollover;

        // Actualizar el rollover de la semana actual
        await ctx.db.week.update({
          where: { id: dbWeek.id },
          data: {
            rolloverAmount: newRollover,
          },
        });

        // Si hay diferencia en el rollover, ajustar la siguiente semana
        if (rolloverDifference !== 0) {
          const nextWeek = await ctx.db.week.findFirst({
            where: {
              userId: user.id,
              weekNumber: dbWeek.weekNumber + 1,
              monthlyHistoryId: dbWeek.monthlyHistoryId,
            },
          });

          if (nextWeek) {
            // Ajustar el presupuesto de la siguiente semana
            await ctx.db.week.update({
              where: { id: nextWeek.id },
              data: {
                weeklyBudget: {
                  increment: rolloverDifference,
                },
              },
            });

            // Actualizar las asignaciones por categoría si es modo categorizado
            if (user.budgetMode === 'categorized') {
              const categories = await ctx.db.category.findMany({
                where: { userId: user.id },
              });

              await Promise.all(
                categories.map(category =>
                  ctx.db.weekCategory.updateMany({
                    where: {
                      weekId: nextWeek.id,
                      categoryId: category.id,
                    },
                    data: {
                      allocatedAmount: {
                        increment: (rolloverDifference * category.allocation) / 100,
                      },
                    },
                  })
                )
              );
            }
          }

          // Actualizar el historial mensual
          await ctx.db.monthlyHistory.update({
            where: { id: dbWeek.monthlyHistoryId },
            data: {
              totalRollover: {
                increment: rolloverDifference,
              },
            },
          });
        }
      }

      return expense;
    }),

  updateExpense: publicProcedure
    .input(z.object({ id: z.string(), data: updateExpenseSchema }))
    .mutation(async ({ ctx, input }) => {
      const expense = await ctx.db.expense.findUnique({
        where: { id: input.id },
        include: { week: true },
      });

      if (!expense) throw new Error('Gasto no encontrado');

      const oldAmount = expense.amount;
      const newAmount = input.data.amount || oldAmount;

      // Actualizar el gasto
      const updatedExpense = await ctx.db.expense.update({
        where: { id: input.id },
        data: input.data,
      });

      // Actualizar los montos en la semana si cambió el monto
      if (oldAmount !== newAmount && expense.week) {
        const difference = newAmount - oldAmount;
        
        await ctx.db.week.update({
          where: { id: expense.week.id },
          data: {
            spentAmount: {
              increment: difference,
            },
          },
        });

        // Actualizar la categoría de la semana (solo si hay categoría)
        if (expense.categoryId) {
          await ctx.db.weekCategory.updateMany({
            where: {
              weekId: expense.week.id,
              categoryId: expense.categoryId,
            },
            data: {
              spentAmount: {
                increment: difference,
              },
            },
          });
        }

        // Actualizar el total gastado en el historial mensual
        await ctx.db.monthlyHistory.update({
          where: { id: expense.week.monthlyHistoryId },
          data: {
            totalSpent: {
              increment: difference,
            },
          },
        });

        // Si la semana está cerrada, recalcular el rollover
        if (expense.week.isClosed) {
          const updatedWeek = await ctx.db.week.findUnique({
            where: { id: expense.week.id },
          });

          if (updatedWeek) {
            const newRollover = calculateRollover(updatedWeek.weeklyBudget, updatedWeek.spentAmount);
            const oldRollover = updatedWeek.rolloverAmount;
            const rolloverDifference = newRollover - oldRollover;

            // Actualizar el rollover de la semana actual
            await ctx.db.week.update({
              where: { id: expense.week.id },
              data: {
                rolloverAmount: newRollover,
              },
            });

            // Si hay diferencia en el rollover, ajustar la siguiente semana
            if (rolloverDifference !== 0) {
              const nextWeek = await ctx.db.week.findFirst({
                where: {
                  userId: expense.week.userId,
                  weekNumber: expense.week.weekNumber + 1,
                  monthlyHistoryId: expense.week.monthlyHistoryId,
                },
              });

              if (nextWeek) {
                // Ajustar el presupuesto de la siguiente semana
                await ctx.db.week.update({
                  where: { id: nextWeek.id },
                  data: {
                    weeklyBudget: {
                      increment: rolloverDifference,
                    },
                  },
                });

                // Actualizar las asignaciones por categoría si es modo categorizado
                const user = await ctx.db.user.findUnique({
                  where: { id: expense.week.userId },
                });

                if (user?.budgetMode === 'categorized') {
                  const categories = await ctx.db.category.findMany({
                    where: { userId: expense.week.userId },
                  });

                  await Promise.all(
                    categories.map(category =>
                      ctx.db.weekCategory.updateMany({
                        where: {
                          weekId: nextWeek.id,
                          categoryId: category.id,
                        },
                        data: {
                          allocatedAmount: {
                            increment: (rolloverDifference * category.allocation) / 100,
                          },
                        },
                      })
                    )
                  );
                }
              }

              // Actualizar el historial mensual
              await ctx.db.monthlyHistory.update({
                where: { id: expense.week.monthlyHistoryId },
                data: {
                  totalRollover: {
                    increment: rolloverDifference,
                  },
                },
              });
            }
          }
        }
      }

      return updatedExpense;
    }),

  deleteExpense: publicProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const expense = await ctx.db.expense.findUnique({
        where: { id: input },
        include: { week: true },
      });

      if (!expense) throw new Error('Gasto no encontrado');

      // Eliminar el gasto
      await ctx.db.expense.delete({
        where: { id: input },
      });

      // Actualizar los montos en la semana
      if (expense.week) {
        await ctx.db.week.update({
          where: { id: expense.week.id },
          data: {
            spentAmount: {
              decrement: expense.amount,
            },
          },
        });

        // Actualizar la categoría de la semana (solo si hay categoría)
        if (expense.categoryId) {
          await ctx.db.weekCategory.updateMany({
            where: {
              weekId: expense.week.id,
              categoryId: expense.categoryId,
            },
            data: {
              spentAmount: {
                decrement: expense.amount,
              },
            },
          });
        }

        // Actualizar el total gastado en el historial mensual
        await ctx.db.monthlyHistory.update({
          where: { id: expense.week.monthlyHistoryId },
          data: {
            totalSpent: {
              decrement: expense.amount,
            },
          },
        });

        // Si la semana está cerrada, recalcular el rollover
        if (expense.week.isClosed) {
          const updatedWeek = await ctx.db.week.findUnique({
            where: { id: expense.week.id },
          });

          if (updatedWeek) {
            const newRollover = calculateRollover(updatedWeek.weeklyBudget, updatedWeek.spentAmount);
            const oldRollover = updatedWeek.rolloverAmount;
            const rolloverDifference = newRollover - oldRollover;

            // Actualizar el rollover de la semana actual
            await ctx.db.week.update({
              where: { id: expense.week.id },
              data: {
                rolloverAmount: newRollover,
              },
            });

            // Si hay diferencia en el rollover, ajustar la siguiente semana
            if (rolloverDifference !== 0) {
              const nextWeek = await ctx.db.week.findFirst({
                where: {
                  userId: expense.week.userId,
                  weekNumber: expense.week.weekNumber + 1,
                  monthlyHistoryId: expense.week.monthlyHistoryId,
                },
              });

              if (nextWeek) {
                // Ajustar el presupuesto de la siguiente semana
                await ctx.db.week.update({
                  where: { id: nextWeek.id },
                  data: {
                    weeklyBudget: {
                      increment: rolloverDifference,
                    },
                  },
                });

                // Actualizar las asignaciones por categoría si es modo categorizado
                const user = await ctx.db.user.findUnique({
                  where: { id: expense.week.userId },
                });

                if (user?.budgetMode === 'categorized') {
                  const categories = await ctx.db.category.findMany({
                    where: { userId: expense.week.userId },
                  });

                  await Promise.all(
                    categories.map(category =>
                      ctx.db.weekCategory.updateMany({
                        where: {
                          weekId: nextWeek.id,
                          categoryId: category.id,
                        },
                        data: {
                          allocatedAmount: {
                            increment: (rolloverDifference * category.allocation) / 100,
                          },
                        },
                      })
                    )
                  );
                }
              }

              // Actualizar el historial mensual
              await ctx.db.monthlyHistory.update({
                where: { id: expense.week.monthlyHistoryId },
                data: {
                  totalRollover: {
                    increment: rolloverDifference,
                  },
                },
              });
            }
          }
        }
      }

      return { success: true };
    }),

  // Semanas
  getWeeks: publicProcedure
    .input(getMonthDataSchema)
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst();
      if (!user) return [];

      const monthInfo = getWeeksOfMonth(input.year, input.month, user.monthlyBudget || 0);
      const currentDate = new Date();
      
      // Aplicar rollovers pendientes antes de consultar
      const closedWeeksWithRollover = await ctx.db.week.findMany({
        where: {
          userId: user.id,
          isClosed: true,
          rolloverAmount: {
            not: 0,
          },
          startDate: {
            gte: monthInfo.weeks[0]?.startDate,
            lte: monthInfo.weeks[monthInfo.weeks.length - 1]?.endDate,
          },
        },
        orderBy: { weekNumber: 'asc' },
      });

      // Aplicar rollovers pendientes
      for (const closedWeek of closedWeeksWithRollover) {
        const nextWeek = await ctx.db.week.findFirst({
          where: {
            userId: user.id,
            weekNumber: closedWeek.weekNumber + 1,
            monthlyHistoryId: closedWeek.monthlyHistoryId,
          },
        });

        if (nextWeek) {
          // Verificar si el rollover ya se aplicó
          const expectedBudget = (user.monthlyBudget || 0) / 4.33; // Presupuesto semanal base
          const rolloverApplied = Math.abs(nextWeek.weeklyBudget - (expectedBudget + closedWeek.rolloverAmount)) < 1;

          if (!rolloverApplied) {
            // Aplicar el rollover
            await ctx.db.week.update({
              where: { id: nextWeek.id },
              data: {
                weeklyBudget: {
                  increment: closedWeek.rolloverAmount,
                },
              },
            });

            // Actualizar asignaciones por categoría si es modo categorizado
            if (user.budgetMode === 'categorized') {
              const categories = await ctx.db.category.findMany({
                where: { userId: user.id },
              });

              await Promise.all(
                categories.map(category =>
                  ctx.db.weekCategory.updateMany({
                    where: {
                      weekId: nextWeek.id,
                      categoryId: category.id,
                    },
                    data: {
                      allocatedAmount: {
                        increment: (closedWeek.rolloverAmount * category.allocation) / 100,
                      },
                    },
                  })
                )
              );
            }

            // Resetear el rollover de la semana cerrada ya que se aplicó
            await ctx.db.week.update({
              where: { id: closedWeek.id },
              data: {
                rolloverAmount: 0,
              },
            });
          }
        }
      }

      // Auto-cerrar semanas vencidas antes de consultar
      const openWeeks = await ctx.db.week.findMany({
        where: {
          userId: user.id,
          isClosed: false,
          endDate: {
            lt: currentDate,
          },
          startDate: {
            gte: monthInfo.weeks[0]?.startDate,
            lte: monthInfo.weeks[monthInfo.weeks.length - 1]?.endDate,
          },
        },
        orderBy: { weekNumber: 'asc' },
      });

      // Cerrar semanas vencidas automáticamente
      for (const week of openWeeks) {
        const rollover = calculateRollover(week.weeklyBudget, week.spentAmount);
        
        await ctx.db.week.update({
          where: { id: week.id },
          data: {
            isClosed: true,
            rolloverAmount: rollover,
          },
        });

        // Buscar la siguiente semana para aplicar el rollover
        const nextWeek = await ctx.db.week.findFirst({
          where: {
            userId: user.id,
            weekNumber: week.weekNumber + 1,
            monthlyHistoryId: week.monthlyHistoryId,
          },
        });

        if (nextWeek && rollover !== 0) {
          // Aplicar el rollover a la siguiente semana
          await ctx.db.week.update({
            where: { id: nextWeek.id },
            data: {
              weeklyBudget: {
                increment: rollover,
              },
            },
          });

          // Actualizar las asignaciones por categoría si es modo categorizado
          if (user.budgetMode === 'categorized') {
            const categories = await ctx.db.category.findMany({
              where: { userId: user.id },
            });

            await Promise.all(
              categories.map(category =>
                ctx.db.weekCategory.updateMany({
                  where: {
                    weekId: nextWeek.id,
                    categoryId: category.id,
                  },
                  data: {
                    allocatedAmount: {
                      increment: (rollover * category.allocation) / 100,
                    },
                  },
                })
              )
            );
          }

          // Resetear el rollover de la semana actual ya que se aplicó
          await ctx.db.week.update({
            where: { id: week.id },
            data: {
              rolloverAmount: 0,
            },
          });
        }

        // Actualizar el historial mensual
        await ctx.db.monthlyHistory.update({
          where: { id: week.monthlyHistoryId },
          data: {
            totalSpent: {
              increment: week.spentAmount,
            },
            totalRollover: {
              increment: rollover,
            },
          },
        });
      }
      
      const weeks = await ctx.db.week.findMany({
        where: {
          userId: user.id,
          startDate: {
            gte: monthInfo.weeks[0]?.startDate,
            lte: monthInfo.weeks[monthInfo.weeks.length - 1]?.endDate,
          },
        },
        include: {
          weekCategories: {
            include: {
              category: true,
            },
          },
        },
        orderBy: { weekNumber: 'asc' },
      });

      return weeks.map(week => {
        const percentageUsed = calculateBudgetPercentage(week.spentAmount, week.weeklyBudget);
        const trafficLightColor = getTrafficLightColor(percentageUsed);

        return {
          ...week,
          percentageUsed,
          trafficLightColor,
          categories: week.weekCategories.map(wc => ({
            id: wc.category.id,
            name: wc.category.name,
            allocatedAmount: wc.allocatedAmount,
            spentAmount: wc.spentAmount,
            percentageUsed: calculateBudgetPercentage(wc.spentAmount, wc.allocatedAmount),
          })),
        };
      });
    }),

  closeWeek: publicProcedure
    .input(closeWeekSchema)
    .mutation(async ({ ctx, input }) => {
      const week = await ctx.db.week.findUnique({
        where: { id: input.weekId },
        include: { monthlyHistory: true },
      });

      if (!week) throw new Error('Semana no encontrada');

      const rollover = calculateRollover(week.weeklyBudget, week.spentAmount);

      // Marcar la semana como cerrada y guardar el rollover
      await ctx.db.week.update({
        where: { id: input.weekId },
        data: {
          isClosed: true,
          rolloverAmount: rollover,
        },
      });

      // Buscar la siguiente semana para aplicar el rollover
      const nextWeek = await ctx.db.week.findFirst({
        where: {
          userId: week.userId,
          weekNumber: week.weekNumber + 1,
          monthlyHistoryId: week.monthlyHistoryId,
        },
      });

      if (nextWeek) {
        // Aplicar el rollover a la siguiente semana
        await ctx.db.week.update({
          where: { id: nextWeek.id },
          data: {
            weeklyBudget: {
              increment: rollover,
            },
          },
        });

        // Actualizar las asignaciones por categoría si es modo categorizado
        const user = await ctx.db.user.findUnique({
          where: { id: week.userId },
        });

        if (user?.budgetMode === 'categorized') {
          const categories = await ctx.db.category.findMany({
            where: { userId: week.userId },
          });

          await Promise.all(
            categories.map(category =>
              ctx.db.weekCategory.updateMany({
                where: {
                  weekId: nextWeek.id,
                  categoryId: category.id,
                },
                data: {
                  allocatedAmount: {
                    increment: (rollover * category.allocation) / 100,
                  },
                },
              })
            )
          );
        }

        // Resetear el rollover de la semana actual ya que se aplicó
        await ctx.db.week.update({
          where: { id: input.weekId },
          data: {
            rolloverAmount: 0,
          },
        });
      }

      // Actualizar el historial mensual
      await ctx.db.monthlyHistory.update({
        where: { id: week.monthlyHistoryId },
        data: {
          totalSpent: {
            increment: week.spentAmount,
          },
          totalRollover: {
            increment: rollover,
          },
        },
      });

      return { success: true, rollover };
    }),

  // Historial mensual
  getMonthlyHistory: publicProcedure
    .input(getMonthDataSchema)
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst();
      if (!user) return null;

      const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
        where: {
          userId_year_month: {
            userId: user.id,
            year: input.year,
            month: input.month,
          },
        },
        include: {
          weeks: {
            include: {
              weekCategories: {
                include: {
                  category: true,
                },
              },
            },
            orderBy: { weekNumber: 'asc' },
          },
        },
      });

      if (!monthlyHistory) return null;

      // Calcular estadísticas
      const allExpenses = await ctx.db.expense.findMany({
        where: {
          userId: user.id,
          weekId: {
            in: monthlyHistory.weeks.map(w => w.id),
          },
        },
        include: {
          category: true,
        },
      });

      // Top categorías por gasto
      const categoryTotals = allExpenses.reduce((acc, expense) => {
        if (expense.category) {
          const categoryName = expense.category.name;
          if (!acc[categoryName]) {
            acc[categoryName] = 0;
          }
          acc[categoryName] += expense.amount;
        }
        return acc;
      }, {} as Record<string, number>);

      const topCategories = Object.entries(categoryTotals)
        .map(([categoryName, totalSpent]) => ({
          categoryName,
          totalSpent,
          percentage: (totalSpent / monthlyHistory.totalSpent) * 100,
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent);

      // Estadísticas por semana
      const weeklyStats = monthlyHistory.weeks.map(week => {
        const percentageUsed = calculateBudgetPercentage(week.spentAmount, week.weeklyBudget);
        const trafficLightColor = getTrafficLightColor(percentageUsed);
        
        return {
          weekNumber: week.weekNumber,
          spent: week.spentAmount,
          trafficLightColor,
        };
      });

      // Promedio diario
      const daysInMonth = new Date(input.year, input.month, 0).getDate();
      const averageDailySpending = monthlyHistory.totalSpent / daysInMonth;

      return {
        ...monthlyHistory,
        topCategories,
        weeklyStats,
        averageDailySpending,
      };
    }),

   getAllMonthlyHistory: publicProcedure
     .query(async ({ ctx }) => {
       const user = await ctx.db.user.findFirst();
       if (!user) return [];

       return await ctx.db.monthlyHistory.findMany({
         where: { userId: user.id },
         orderBy: [
           { year: 'desc' },
           { month: 'desc' },
         ],
       });
     }),

   // Función para recalcular el historial mensual
   recalculateMonthlyHistory: publicProcedure
     .input(getMonthDataSchema)
     .mutation(async ({ ctx, input }) => {
       const user = await ctx.db.user.findFirst();
       if (!user) throw new Error('Usuario no encontrado');

       // Buscar el historial mensual
       const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
         where: {
           userId_year_month: {
             userId: user.id,
             year: input.year,
             month: input.month,
           },
         },
         include: {
           weeks: true,
         },
       });

       if (!monthlyHistory) throw new Error('Historial mensual no encontrado');

       // Calcular el total gastado real sumando todos los gastos
       const allExpenses = await ctx.db.expense.findMany({
         where: {
           userId: user.id,
           weekId: {
             in: monthlyHistory.weeks.map(w => w.id),
           },
         },
       });

       const realTotalSpent = allExpenses.reduce((sum, expense) => sum + expense.amount, 0);

       // Actualizar el historial mensual con el total real
       const updatedHistory = await ctx.db.monthlyHistory.update({
         where: { id: monthlyHistory.id },
         data: {
           totalSpent: realTotalSpent,
         },
       });

       return {
         success: true,
         previousTotal: monthlyHistory.totalSpent,
         newTotal: realTotalSpent,
         difference: realTotalSpent - monthlyHistory.totalSpent,
       };
     }),

   // Utilidad para crear semanas manualmente
   createWeeksForCurrentMonth: publicProcedure
     .mutation(async ({ ctx }) => {
       const user = await ctx.db.user.findFirst();
       if (!user) throw new Error('Usuario no encontrado');

       const currentDate = new Date();
       const year = currentDate.getFullYear();
       const month = currentDate.getMonth() + 1;

       // Verificar si ya existen semanas para este mes
       const existingWeeks = await ctx.db.week.findMany({
         where: {
           userId: user.id,
           startDate: {
             gte: new Date(year, month - 1, 1),
             lt: new Date(year, month, 1),
           },
         },
       });

       if (existingWeeks.length > 0) {
         return { message: 'Las semanas ya existen para este mes', weeks: existingWeeks.length };
       }

       const monthInfo = getWeeksOfMonth(year, month, user.monthlyBudget || 0);
       
       // Crear el historial mensual
       const monthlyHistory = await ctx.db.monthlyHistory.create({
         data: {
           userId: user.id,
           year,
           month,
           totalBudget: user.monthlyBudget || 0,
           totalSpent: 0,
           totalRollover: 0,
         },
       });

       // Crear las semanas
       for (const week of monthInfo.weeks) {
         // Buscar si hay rollover de la semana anterior para aplicar
         let rolloverToApply = 0;
         if (week.weekNumber > 1) {
           const previousWeek = await ctx.db.week.findFirst({
             where: {
               userId: user.id,
               weekNumber: week.weekNumber - 1,
               monthlyHistoryId: monthlyHistory.id,
             },
           });
           
           if (previousWeek && previousWeek.isClosed) {
             rolloverToApply = previousWeek.rolloverAmount;
           }
         }

         const dbWeek = await ctx.db.week.create({
           data: {
             userId: user.id,
             weekNumber: week.weekNumber,
             startDate: week.startDate,
             endDate: week.endDate,
             weeklyBudget: week.weeklyBudget + rolloverToApply,
             rolloverAmount: 0, // Las semanas nuevas no tienen rollover
             monthlyHistoryId: monthlyHistory.id,
           },
         });

         // Si el modo es por categorías, crear las asignaciones por categoría
         if (user.budgetMode === 'categorized') {
           const categories = await ctx.db.category.findMany({
             where: { userId: user.id },
           });

           await Promise.all(
             categories.map(category =>
               ctx.db.weekCategory.create({
                 data: {
                   categoryId: category.id,
                   weekId: dbWeek.id,
                   allocatedAmount: ((week.weeklyBudget + rolloverToApply) * category.allocation) / 100,
                 },
               })
             )
           );
         }
       }

       return { message: 'Semanas creadas exitosamente', weeks: monthInfo.weeks.length };
     }),

   // Auto-cerrar semanas y aplicar rollovers
   autoCloseWeeks: publicProcedure
     .mutation(async ({ ctx }) => {
       const user = await ctx.db.user.findFirst();
       if (!user) throw new Error('Usuario no encontrado');

       const currentDate = new Date();
       const year = currentDate.getFullYear();
       const month = currentDate.getMonth() + 1;

       // Buscar semanas abiertas que deberían estar cerradas (fecha de fin pasada)
       const openWeeks = await ctx.db.week.findMany({
         where: {
           userId: user.id,
           isClosed: false,
           endDate: {
             lt: currentDate,
           },
           startDate: {
             gte: new Date(year, month - 1, 1),
             lt: new Date(year, month, 1),
           },
         },
         orderBy: { weekNumber: 'asc' },
       });

       let closedWeeks = 0;
       let appliedRollovers = 0;

       for (const week of openWeeks) {
         // Cerrar la semana automáticamente
         const rollover = calculateRollover(week.weeklyBudget, week.spentAmount);
         
         await ctx.db.week.update({
           where: { id: week.id },
           data: {
             isClosed: true,
             rolloverAmount: rollover,
           },
         });

         closedWeeks++;

         // Buscar la siguiente semana para aplicar el rollover
         const nextWeek = await ctx.db.week.findFirst({
           where: {
             userId: user.id,
             weekNumber: week.weekNumber + 1,
             monthlyHistoryId: week.monthlyHistoryId,
           },
         });

         if (nextWeek && rollover !== 0) {
           // Aplicar el rollover a la siguiente semana
           await ctx.db.week.update({
             where: { id: nextWeek.id },
             data: {
               weeklyBudget: {
                 increment: rollover,
               },
             },
           });

           // Actualizar las asignaciones por categoría si es modo categorizado
           if (user.budgetMode === 'categorized') {
             const categories = await ctx.db.category.findMany({
               where: { userId: user.id },
             });

             await Promise.all(
               categories.map(category =>
                 ctx.db.weekCategory.updateMany({
                   where: {
                     weekId: nextWeek.id,
                     categoryId: category.id,
                   },
                   data: {
                     allocatedAmount: {
                       increment: (rollover * category.allocation) / 100,
                     },
                   },
                 })
               )
             );
           }

           // Resetear el rollover de la semana actual ya que se aplicó
           await ctx.db.week.update({
             where: { id: week.id },
             data: {
               rolloverAmount: 0,
             },
           });

           appliedRollovers++;
         }

         // Actualizar el historial mensual
         await ctx.db.monthlyHistory.update({
           where: { id: week.monthlyHistoryId },
           data: {
             totalSpent: {
               increment: week.spentAmount,
             },
             totalRollover: {
               increment: rollover,
             },
           },
         });
       }

       return { 
         message: `Se cerraron ${closedWeeks} semanas automáticamente y se aplicaron ${appliedRollovers} rollovers`,
         closedWeeks,
         appliedRollovers 
       };
     }),

   // Aplicar rollovers pendientes
   applyPendingRollovers: publicProcedure
     .mutation(async ({ ctx }) => {
       const user = await ctx.db.user.findFirst();
       if (!user) throw new Error('Usuario no encontrado');

       const currentDate = new Date();
       const year = currentDate.getFullYear();
       const month = currentDate.getMonth() + 1;

       // Buscar semanas cerradas con rollover que no se han aplicado
       const closedWeeks = await ctx.db.week.findMany({
         where: {
           userId: user.id,
           isClosed: true,
           rolloverAmount: {
             not: 0,
           },
           startDate: {
             gte: new Date(year, month - 1, 1),
             lt: new Date(year, month, 1),
           },
         },
         orderBy: { weekNumber: 'asc' },
       });

       let appliedRollovers = 0;

       for (const closedWeek of closedWeeks) {
         // Buscar la siguiente semana
         const nextWeek = await ctx.db.week.findFirst({
           where: {
             userId: user.id,
             weekNumber: closedWeek.weekNumber + 1,
             monthlyHistoryId: closedWeek.monthlyHistoryId,
           },
         });

         if (nextWeek) {
           // Verificar si el rollover ya se aplicó (comparando presupuestos)
           const expectedBudget = nextWeek.weeklyBudget - closedWeek.rolloverAmount;
           const originalBudget = (user.monthlyBudget || 0) / 4.33; // Presupuesto semanal base

           // Si la diferencia es significativa, aplicar el rollover
           if (Math.abs(nextWeek.weeklyBudget - (originalBudget + closedWeek.rolloverAmount)) > 1) {
             await ctx.db.week.update({
               where: { id: nextWeek.id },
               data: {
                 weeklyBudget: {
                   increment: closedWeek.rolloverAmount,
                 },
               },
             });

             // Actualizar asignaciones por categoría si es modo categorizado
             if (user.budgetMode === 'categorized') {
               const categories = await ctx.db.category.findMany({
                 where: { userId: user.id },
               });

               await Promise.all(
                 categories.map(category =>
                   ctx.db.weekCategory.updateMany({
                     where: {
                       weekId: nextWeek.id,
                       categoryId: category.id,
                     },
                     data: {
                       allocatedAmount: {
                         increment: (closedWeek.rolloverAmount * category.allocation) / 100,
                       },
                     },
                   })
                 )
               );
             }

             // Resetear el rollover de la semana cerrada ya que se aplicó
             await ctx.db.week.update({
               where: { id: closedWeek.id },
               data: {
                 rolloverAmount: 0,
               },
             });

             appliedRollovers++;
           }
         }
       }

       return { 
         message: appliedRollovers > 0 
           ? `Se aplicaron ${appliedRollovers} rollovers pendientes`
           : 'No hay rollovers pendientes',
         appliedRollovers 
       };
     }),

   // Reiniciar todo el presupuesto
   resetBudget: publicProcedure
     .mutation(async ({ ctx }) => {
       const user = await ctx.db.user.findFirst();
       if (!user) throw new Error('Usuario no encontrado');

       // Eliminar todos los gastos
       await ctx.db.expense.deleteMany({
         where: { userId: user.id },
       });

       // Eliminar todas las asignaciones por categoría
       await ctx.db.weekCategory.deleteMany({
         where: {
           week: { userId: user.id },
         },
       });

       // Eliminar todas las semanas
       await ctx.db.week.deleteMany({
         where: { userId: user.id },
       });

       // Eliminar todo el historial mensual
       await ctx.db.monthlyHistory.deleteMany({
         where: { userId: user.id },
       });

       // Eliminar todas las categorías
       await ctx.db.category.deleteMany({
         where: { userId: user.id },
       });

       // Crear categorías predeterminadas si el modo es categorizado
       if (user.budgetMode === 'categorized') {
         const defaultCategories = getDefaultCategories();
         await ctx.db.category.createMany({
           data: defaultCategories.map(cat => ({
             name: cat.name,
             allocation: cat.suggestedPercentage,
             userId: user.id,
           })),
         });
       }

       // Crear las semanas del mes actual
       const currentDate = new Date();
       const year = currentDate.getFullYear();
       const month = currentDate.getMonth() + 1;
       const monthInfo = getWeeksOfMonth(year, month, user.monthlyBudget || 0);
       
       // Crear el historial mensual
       const monthlyHistory = await ctx.db.monthlyHistory.create({
         data: {
           userId: user.id,
           year,
           month,
           totalBudget: user.monthlyBudget || 0,
           totalSpent: 0,
           totalRollover: 0,
         },
       });

       // Crear las semanas
       for (const week of monthInfo.weeks) {
         // Buscar si hay rollover de la semana anterior para aplicar
         let rolloverToApply = 0;
         if (week.weekNumber > 1) {
           const previousWeek = await ctx.db.week.findFirst({
             where: {
               userId: user.id,
               weekNumber: week.weekNumber - 1,
               monthlyHistoryId: monthlyHistory.id,
             },
           });
           
           if (previousWeek && previousWeek.isClosed) {
             rolloverToApply = previousWeek.rolloverAmount;
           }
         }

         const dbWeek = await ctx.db.week.create({
           data: {
             userId: user.id,
             weekNumber: week.weekNumber,
             startDate: week.startDate,
             endDate: week.endDate,
             weeklyBudget: week.weeklyBudget + rolloverToApply,
             rolloverAmount: 0, // Las semanas reiniciadas no tienen rollover
             monthlyHistoryId: monthlyHistory.id,
           },
         });

         // Crear las asignaciones por categoría si es modo categorizado
         if (user.budgetMode === 'categorized') {
           const categories = await ctx.db.category.findMany({
             where: { userId: user.id },
           });

           await Promise.all(
             categories.map(category =>
               ctx.db.weekCategory.create({
                 data: {
                   categoryId: category.id,
                   weekId: dbWeek.id,
                   allocatedAmount: ((week.weeklyBudget + rolloverToApply) * category.allocation) / 100,
                 },
               })
             )
           );
         }
       }

       return { 
         message: 'Presupuesto reiniciado exitosamente',
         weeksCreated: monthInfo.weeks.length 
       };
     }),
 });
