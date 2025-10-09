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

      // Si se actualizó el presupuesto mensual, actualizar las semanas existentes
      if (input.monthlyBudget && input.monthlyBudget > 0) {
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
          // Actualizar el presupuesto total del historial
          await ctx.db.monthlyHistory.update({
            where: { id: monthlyHistory.id },
            data: { totalBudget: input.monthlyBudget },
          });

          // Recalcular las semanas con el nuevo presupuesto
          const monthInfo = getWeeksOfMonth(year, month, input.monthlyBudget);
          
          // Actualizar cada semana existente
          for (let i = 0; i < monthlyHistory.weeks.length; i++) {
            const existingWeek = monthlyHistory.weeks[i];
            const newWeekInfo = monthInfo.weeks[i];
            
            if (existingWeek && newWeekInfo) {
              // Calcular el nuevo presupuesto semanal manteniendo el rollover existente
              const newWeeklyBudget = newWeekInfo.weeklyBudget + (existingWeek.rolloverAmount || 0);
              
              // Actualizar la semana
              await ctx.db.week.update({
                where: { id: existingWeek.id },
                data: {
                  weeklyBudget: newWeeklyBudget,
                },
              });

              // Actualizar las asignaciones por categoría si es modo categorizado
              if (user.budgetMode === 'categorized') {
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
              }
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

        dbWeek = await ctx.db.week.create({
          data: {
            userId: user.id,
            weekNumber: week.weekNumber,
            startDate: week.startDate,
            endDate: week.endDate,
            weeklyBudget: week.weeklyBudget,
            monthlyHistoryId: monthlyHistory.id,
          },
        });

        // Crear asignaciones por categoría para esta semana
        const categories = await ctx.db.category.findMany({
          where: { userId: user.id },
        });

        await Promise.all(
          categories.map(category =>
            ctx.db.weekCategory.create({
              data: {
                categoryId: category.id,
                weekId: dbWeek!.id,
                allocatedAmount: (week.weeklyBudget * category.allocation) / 100,
              },
            })
          )
        );
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

      // Actualizar el monto gastado en la categoría de la semana
      await ctx.db.weekCategory.updateMany({
        where: {
          weekId: dbWeek.id,
          categoryId: input.categoryId,
        },
        data: {
          spentAmount: {
            increment: input.amount,
          },
        },
      });

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

        // Actualizar la categoría de la semana
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

        // Actualizar la categoría de la semana
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

      return { success: true };
    }),

  // Semanas
  getWeeks: publicProcedure
    .input(getMonthDataSchema)
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst();
      if (!user) return [];

      const monthInfo = getWeeksOfMonth(input.year, input.month, user.monthlyBudget || 0);
      
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
        const categoryName = expense.category.name;
        if (!acc[categoryName]) {
          acc[categoryName] = 0;
        }
        acc[categoryName] += expense.amount;
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

  // Gestión del presupuesto
  resetMonth: publicProcedure
    .input(z.object({
      year: z.number().int().min(2020).max(2030),
      month: z.number().int().min(1).max(12),
    }))
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
          weeks: {
            include: {
              expenses: true,
              weekCategories: true,
            },
          },
        },
      });

      if (!monthlyHistory) {
        throw new Error('No se encontró el historial del mes especificado');
      }

      // Eliminar todos los gastos del mes
      await ctx.db.expense.deleteMany({
        where: {
          weekId: {
            in: monthlyHistory.weeks.map(w => w.id),
          },
        },
      });

      // Eliminar todas las asignaciones por categoría
      await ctx.db.weekCategory.deleteMany({
        where: {
          weekId: {
            in: monthlyHistory.weeks.map(w => w.id),
          },
        },
      });

      // Eliminar todas las semanas
      await ctx.db.week.deleteMany({
        where: {
          monthlyHistoryId: monthlyHistory.id,
        },
      });

      // Eliminar el historial mensual
      await ctx.db.monthlyHistory.delete({
        where: { id: monthlyHistory.id },
      });

      // Recrear el mes con el presupuesto actual
      const monthInfo = getWeeksOfMonth(input.year, input.month, user.monthlyBudget || 0);
      
      // Crear nuevo historial mensual
      const newMonthlyHistory = await ctx.db.monthlyHistory.create({
        data: {
          userId: user.id,
          year: input.year,
          month: input.month,
          totalBudget: user.monthlyBudget || 0,
          totalSpent: 0,
          totalRollover: 0,
        },
      });

      // Crear las semanas
      let previousWeekRollover = 0;
      for (const week of monthInfo.weeks) {
        const adjustedWeeklyBudget = week.weeklyBudget + previousWeekRollover;
        
        const dbWeek = await ctx.db.week.create({
          data: {
            userId: user.id,
            weekNumber: week.weekNumber,
            startDate: week.startDate,
            endDate: week.endDate,
            weeklyBudget: adjustedWeeklyBudget,
            rolloverAmount: previousWeekRollover,
            monthlyHistoryId: newMonthlyHistory.id,
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
                  allocatedAmount: (adjustedWeeklyBudget * category.allocation) / 100,
                },
              })
            )
          );
        }

        previousWeekRollover = 0;
      }

      return { success: true };
    }),
});
