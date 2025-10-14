import { z } from 'zod';
import { createTRPCRouter, publicProcedure, protectedProcedure } from '~/server/api/trpc';
import type { createTRPCContext } from '~/server/api/trpc';
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
  calculateBudgetPercentage, 
  getTrafficLightColor,
  calculateRollover,
  getDefaultCategories,
  findWeekForDate,
  isDateInWeekRange,
} from '~/lib/date-utils';

// ============================================
// TIPOS
// ============================================

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

// ============================================
// FUNCIONES HELPER CENTRALIZADAS
// ============================================

/**
 * Busca la primera semana ABIERTA (isClosed: false) después de la semana especificada
 * y aplica el rollover a ella. Esta es la función clave para la lógica correcta de rollover.
 */
async function applyRolloverToNextOpenWeek(
  ctx: Context,
  weekId: string,
  rolloverAmount: number,
  userId: string,
  budgetMode: string
) {
  if (rolloverAmount === 0) return;

  const currentWeek = await ctx.db.week.findUnique({
    where: { id: weekId },
  });

  if (!currentWeek) return;

  // Buscar la PRIMERA semana ABIERTA después de esta
  const nextOpenWeek = await ctx.db.week.findFirst({
    where: {
      userId: userId,
      weekNumber: { gt: currentWeek.weekNumber },
      monthlyHistoryId: currentWeek.monthlyHistoryId,
      isClosed: false, // ¡CRÍTICO! Solo semanas abiertas
    },
    orderBy: { weekNumber: 'asc' },
  });

  if (nextOpenWeek) {
    // Aplicar el rollover a la primera semana abierta
    await ctx.db.week.update({
      where: { id: nextOpenWeek.id },
      data: {
        weeklyBudget: {
          increment: rolloverAmount,
        },
      },
    });

    // Actualizar las asignaciones por categoría si es modo categorizado
    if (budgetMode === 'categorized') {
      const categories = await ctx.db.category.findMany({
        where: { userId: userId },
      });

      await Promise.all(
        categories.map((category: { id: string; allocation: number }) =>
          ctx.db.weekCategory.updateMany({
            where: {
              weekId: nextOpenWeek.id,
              categoryId: category.id,
            },
            data: {
              allocatedAmount: {
                increment: (rolloverAmount * category.allocation) / 100,
              },
            },
          })
        )
      );
    }
  } else {
    // Si no hay semana abierta en el mismo mes, buscar en el siguiente mes
    const currentDate = new Date();
    const nextMonth = currentDate.getMonth() + 1 === 12 ? 1 : currentDate.getMonth() + 2;
    const nextYear = currentDate.getMonth() + 1 === 12 ? currentDate.getFullYear() + 1 : currentDate.getFullYear();
    
    // Buscar en el siguiente mes
    const nextMonthOpenWeek = await ctx.db.week.findFirst({
      where: {
        userId: userId,
        monthlyHistory: {
          userId: userId,
          year: nextYear,
          month: nextMonth,
        },
        isClosed: false,
      },
      orderBy: { weekNumber: 'asc' },
    });

    if (nextMonthOpenWeek) {
      // Aplicar el rollover a la primera semana abierta del siguiente mes
      await ctx.db.week.update({
        where: { id: nextMonthOpenWeek.id },
        data: {
          weeklyBudget: {
            increment: rolloverAmount,
          },
        },
      });

      // Actualizar las asignaciones por categoría si es modo categorizado
      if (budgetMode === 'categorized') {
        const categories = await ctx.db.category.findMany({
          where: { userId: userId },
        });

        await Promise.all(
          categories.map((category: { id: string; allocation: number }) =>
            ctx.db.weekCategory.updateMany({
              where: {
                weekId: nextMonthOpenWeek.id,
                categoryId: category.id,
              },
              data: {
                allocatedAmount: {
                  increment: (rolloverAmount * category.allocation) / 100,
                },
              },
            })
          )
        );
      }
    }
  }
}

/**
 * Recalcula TODOS los rollovers del mes en cascada desde la primera semana.
 * IMPORTANTE: Solo el rollover de la ÚLTIMA semana cerrada se aplica a la primera semana abierta.
 */
async function recalculateAllRollovers(
  ctx: Context,
  monthlyHistoryId: string,
  userId: string,
  budgetMode: string,
  baseWeeklyBudget: number
) {
  // Obtener todas las semanas del mes en orden
  const weeks = await ctx.db.week.findMany({
    where: {
      monthlyHistoryId: monthlyHistoryId,
      userId: userId,
    },
    orderBy: { weekNumber: 'asc' },
  });

  // Encontrar la última semana cerrada
  let lastClosedWeek = null;
  let lastClosedWeekRollover = 0;

  // Primero, recalcular los rollovers de todas las semanas cerradas
  for (const week of weeks) {
    if (week.isClosed) {
      // Para semanas cerradas, recalcular su presupuesto y rollover correctamente
      // Si es la primera semana cerrada, usa el presupuesto base
      // Si no, necesitamos aplicar el rollover de la semana anterior cerrada
      
      // Encontrar todas las semanas cerradas anteriores a esta
      const previousClosedWeeks = weeks.filter(
        w => w.isClosed && w.weekNumber < week.weekNumber
      );
      
      // Calcular el presupuesto correcto para esta semana cerrada
      let correctWeeklyBudget = baseWeeklyBudget;
      
      if (previousClosedWeeks.length > 0) {
        // Obtener la última semana cerrada anterior
        const prevClosedWeek = previousClosedWeeks[previousClosedWeeks.length - 1];
        if (prevClosedWeek) {
          const prevRollover = calculateRollover(prevClosedWeek.weeklyBudget, prevClosedWeek.spentAmount);
          correctWeeklyBudget = baseWeeklyBudget + prevRollover;
        }
      }
      
      // Actualizar el presupuesto de la semana cerrada si es necesario
      if (Math.abs(week.weeklyBudget - correctWeeklyBudget) > 0.01) {
        await ctx.db.week.update({
          where: { id: week.id },
          data: {
            weeklyBudget: correctWeeklyBudget,
          },
        });
      }
      
      // Calcular el rollover de esta semana
      const rollover = calculateRollover(correctWeeklyBudget, week.spentAmount);
      
      // Actualizar el rollover de la semana cerrada
      await ctx.db.week.update({
        where: { id: week.id },
        data: {
          rolloverAmount: rollover,
        },
      });

      // Esta es la última semana cerrada hasta ahora
      lastClosedWeek = week;
      lastClosedWeekRollover = rollover;
    }
  }

  // Ahora actualizar las semanas abiertas
  let firstOpenWeek = true;
  for (const week of weeks) {
    if (!week.isClosed) {
      let newWeeklyBudget;
      
      if (firstOpenWeek && lastClosedWeek) {
        // Solo la PRIMERA semana abierta recibe el rollover de la ÚLTIMA semana cerrada
        newWeeklyBudget = baseWeeklyBudget + lastClosedWeekRollover;
        firstOpenWeek = false;
      } else {
        // Todas las demás semanas abiertas usan el presupuesto base
        newWeeklyBudget = baseWeeklyBudget;
      }
      
      await ctx.db.week.update({
        where: { id: week.id },
        data: {
          weeklyBudget: newWeeklyBudget,
          rolloverAmount: 0, // Las semanas abiertas no tienen rollover propio
        },
      });

      // Actualizar las asignaciones por categoría según el modo
      if (budgetMode === 'categorized') {
        const categories = await ctx.db.category.findMany({
          where: { userId: userId },
        });

        // Obtener las asignaciones actuales para mantener el spentAmount
        const existingAllocations = await ctx.db.weekCategory.findMany({
          where: { weekId: week.id },
        });

        // Actualizar cada asignación
        for (const category of categories) {
          const existingAllocation = existingAllocations.find(
            (a) => a.categoryId === category.id
          );

          if (existingAllocation) {
            await ctx.db.weekCategory.update({
              where: { id: existingAllocation.id },
              data: {
                allocatedAmount: (newWeeklyBudget * category.allocation) / 100,
                // Mantener spentAmount sin cambios
              },
            });
          } else {
            // Crear si no existe
            await ctx.db.weekCategory.create({
              data: {
                weekId: week.id,
                categoryId: category.id,
                allocatedAmount: (newWeeklyBudget * category.allocation) / 100,
                spentAmount: 0,
              },
            });
          }
        }
      } else {
        // Si el modo es simple, eliminar todas las asignaciones de categorías
        await ctx.db.weekCategory.deleteMany({
          where: { weekId: week.id },
        });
      }
    }
  }

  // Recalcular el total rollover del mes (suma de todos los rollovers de semanas cerradas)
  const totalRollover = weeks
    .filter((w) => w.isClosed)
    .reduce((sum, w) => {
      if (w.id === lastClosedWeek?.id) {
        return sum + lastClosedWeekRollover;
      }
      // Para otras semanas cerradas, recalcular su rollover
      const prevClosedWeeks = weeks.filter(
        prev => prev.isClosed && prev.weekNumber < w.weekNumber
      );
      let correctBudget = baseWeeklyBudget;
      if (prevClosedWeeks.length > 0) {
        const prevWeek = prevClosedWeeks[prevClosedWeeks.length - 1];
        if (prevWeek) {
          const prevRollover = calculateRollover(prevWeek.weeklyBudget, prevWeek.spentAmount);
          correctBudget = baseWeeklyBudget + prevRollover;
        }
      }
      return sum + calculateRollover(correctBudget, w.spentAmount);
    }, 0);

  await ctx.db.monthlyHistory.update({
    where: { id: monthlyHistoryId },
    data: {
      totalRollover: totalRollover,
    },
  });
}

/**
 * Recalcula el rollover de una semana cerrada y ajusta la próxima semana abierta
 * si el rollover cambió (por modificación o eliminación de gastos)
 */
async function recalculateAndApplyRollover(
  ctx: Context,
  weekId: string,
  userId: string,
  budgetMode: string
) {
  const week = await ctx.db.week.findUnique({
    where: { id: weekId },
  });

  if (!week || !week.isClosed) return;

  // Obtener el usuario para saber el presupuesto base
  const user = await ctx.db.user.findUnique({
    where: { id: userId },
  });

  if (!user) return;

  // Obtener el historial mensual para saber cuántas semanas tiene el mes
  const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
    where: { id: week.monthlyHistoryId },
    include: {
      weeks: {
        orderBy: { weekNumber: 'asc' },
      },
    },
  });

  if (!monthlyHistory) return;

  // Calcular el presupuesto semanal base
  const baseWeeklyBudget = (user.monthlyBudget || 0) / monthlyHistory.weeks.length;

  // Recalcular TODOS los rollovers del mes en cascada
  await recalculateAllRollovers(
    ctx,
    monthlyHistory.id,
    userId,
    budgetMode,
    baseWeeklyBudget
  );
}

/**
 * Crea una semana con asignaciones de categorías
 */
async function createWeekWithCategories(
  ctx: Context,
  userId: string,
  weekInfo: { weekNumber: number; startDate: Date; endDate: Date; weeklyBudget: number },
  monthlyHistoryId: string,
  budgetMode: string,
  rolloverToApply = 0
) {
  const dbWeek = await ctx.db.week.create({
    data: {
      userId: userId,
      weekNumber: weekInfo.weekNumber,
      startDate: weekInfo.startDate,
      endDate: weekInfo.endDate,
      weeklyBudget: weekInfo.weeklyBudget + rolloverToApply,
      rolloverAmount: 0,
      monthlyHistoryId: monthlyHistoryId,
    },
  });

  // Crear asignaciones por categoría si es modo categorizado
  if (budgetMode === 'categorized') {
    const categories = await ctx.db.category.findMany({
      where: { userId: userId },
    });

    await Promise.all(
      categories.map((category: { id: string; allocation: number }) =>
        ctx.db.weekCategory.create({
          data: {
            categoryId: category.id,
            weekId: dbWeek.id,
            allocatedAmount: ((weekInfo.weeklyBudget + rolloverToApply) * category.allocation) / 100,
          },
        })
      )
    );
  }

  return dbWeek;
}

/**
 * Asegura que la semana 1 existe y todas las semanas del mes están creadas
 */
async function ensureWeek1Exists(ctx: Context, userId: string, year: number, month: number, monthlyBudget: number, userBudgetMode: string) {
  const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
    where: {
      userId_year_month: {
        userId: userId,
        year: year,
        month: month,
      },
    },
  });

  if (!monthlyHistory) {
    // Si no existe historial mensual, crear todo el mes usando el modo del usuario
    const monthInfo = getWeeksOfMonth(year, month, monthlyBudget);
    
    const newMonthlyHistory = await ctx.db.monthlyHistory.create({
      data: {
        userId: userId,
        year,
        month,
        totalBudget: monthlyBudget,
        totalSpent: 0,
        totalRollover: 0,
        budgetMode: userBudgetMode, // Usar el modo del usuario
      },
    });

    // Crear todas las semanas
    for (const week of monthInfo.weeks) {
      await createWeekWithCategories(
        ctx,
        userId,
        week,
        newMonthlyHistory.id,
        userBudgetMode, // Usar el modo del usuario
        0
      );
    }
    
    return;
  }

  // Verificar que todas las semanas del mes existan
  const monthInfo = getWeeksOfMonth(year, month, monthlyBudget);
  const existingWeeks = await ctx.db.week.findMany({
    where: {
      userId: userId,
      monthlyHistoryId: monthlyHistory.id,
    },
  });

  // Crear semanas faltantes
  for (const weekInfo of monthInfo.weeks) {
    const existingWeek = existingWeeks.find(w => w.weekNumber === weekInfo.weekNumber);
    
    if (!existingWeek) {
      await createWeekWithCategories(
        ctx,
        userId,
        weekInfo,
        monthlyHistory.id,
        monthlyHistory.budgetMode,
        0
      );
    }
  }
}

/**
 * Recupera semanas faltantes
 */
async function recoverMissingWeeks(ctx: Context, userId: string, year: number, month: number, monthlyBudget: number) {
  const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
    where: {
      userId_year_month: {
        userId: userId,
        year: year,
        month: month,
      },
    },
  });

  if (!monthlyHistory) return;

  const monthInfo = getWeeksOfMonth(year, month, monthlyBudget);
  const existingWeeks = await ctx.db.week.findMany({
    where: {
      userId: userId,
      monthlyHistoryId: monthlyHistory.id,
    },
  });

  // Crear semanas faltantes
  for (const weekInfo of monthInfo.weeks) {
    const existingWeek = existingWeeks.find((w) => w.weekNumber === weekInfo.weekNumber);
    
    if (!existingWeek) {
      await createWeekWithCategories(
        ctx,
        userId,
        weekInfo,
        monthlyHistory.id,
        monthlyHistory.budgetMode,
        0
      );
    }
  }
}

/**
 * Recalcula los montos gastados basándose en los gastos reales para preservar el historial
 */
async function recalculateSpentAmounts(ctx: Context, userId: string, year: number, month: number) {
  // Obtener todas las semanas del mes
  const weeks = await ctx.db.week.findMany({
    where: {
      userId: userId,
      monthlyHistory: {
        userId: userId,
        year: year,
        month: month,
      },
    },
  });

  // Recalcular el monto gastado de cada semana basándose en los gastos reales
  for (const week of weeks) {
    const expenses = await ctx.db.expense.findMany({
      where: {
        weekId: week.id,
      },
    });

    const realSpentAmount = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    // Solo actualizar si hay diferencia para evitar updates innecesarios
    if (Math.abs(week.spentAmount - realSpentAmount) > 0.01) {
      await ctx.db.week.update({
        where: { id: week.id },
        data: {
          spentAmount: realSpentAmount,
        },
      });

      // Recalcular también las categorías si es necesario
      const weekCategories = await ctx.db.weekCategory.findMany({
        where: {
          weekId: week.id,
        },
      });

      for (const weekCategory of weekCategories) {
        const categoryExpenses = await ctx.db.expense.findMany({
          where: {
            weekId: week.id,
            categoryId: weekCategory.categoryId,
          },
        });

        const realCategorySpent = categoryExpenses.reduce((sum, expense) => sum + expense.amount, 0);

        if (Math.abs(weekCategory.spentAmount - realCategorySpent) > 0.01) {
          await ctx.db.weekCategory.update({
            where: { id: weekCategory.id },
            data: {
              spentAmount: realCategorySpent,
            },
          });
        }
      }
    }
  }
}

/**
 * Valida y corrige las fechas de las semanas existentes automáticamente
 */
async function validateAndFixExistingWeeks(ctx: Context, userId: string, year: number, month: number, monthlyBudget: number, userBudgetMode: string) {
  // Obtener las semanas actuales de la base de datos
  const existingWeeks = await ctx.db.week.findMany({
    where: {
      userId: userId,
      monthlyHistory: {
        userId: userId,
        year: year,
        month: month,
      },
    },
    orderBy: { weekNumber: 'asc' },
  });

  // Obtener el historial mensual para acceder al budgetMode
  const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
    where: {
      userId_year_month: {
        userId: userId,
        year: year,
        month: month,
      },
    },
  });

  if (!monthlyHistory) return;

  // Obtener las semanas correctas según el cálculo
  const monthInfo = getWeeksOfMonth(year, month, monthlyBudget);
  
  // Verificar y corregir fechas de semanas existentes
  for (const existingWeek of existingWeeks) {
    const correctWeek = monthInfo.weeks.find(w => w.weekNumber === existingWeek.weekNumber);
    
    if (correctWeek) {
      // Verificar si las fechas son correctas
      const startDateMatch = existingWeek.startDate.getTime() === correctWeek.startDate.getTime();
      const endDateMatch = existingWeek.endDate.getTime() === correctWeek.endDate.getTime();
      
      if (!startDateMatch || !endDateMatch) {
        // Corregir las fechas manteniendo el rollover existente y los gastos
        const currentRollover = existingWeek.weeklyBudget - (monthlyBudget / monthInfo.weeks.length);
        
        await ctx.db.week.update({
          where: { id: existingWeek.id },
          data: {
            startDate: correctWeek.startDate,
            endDate: correctWeek.endDate,
            weeklyBudget: correctWeek.weeklyBudget + currentRollover,
            // NO tocar spentAmount ni isClosed para preservar el historial
          },
        });
      }
    }
  }

  // Crear semanas faltantes
  for (const correctWeek of monthInfo.weeks) {
    const existingWeek = existingWeeks.find(w => w.weekNumber === correctWeek.weekNumber);
    
    if (!existingWeek) {
      await createWeekWithCategories(
        ctx,
        userId,
        correctWeek,
        monthlyHistory.id,
        monthlyHistory.budgetMode,
        0
      );
    }
  }
}

/**
 * Auto-cierra semanas vencidas y recalcula todos los rollovers en cascada
 */
async function autoCloseExpiredWeeks(ctx: Context, userId: string, year: number, month: number) {
  const currentDate = new Date();

  // Buscar semanas abiertas que hayan terminado
  const openWeeks = await ctx.db.week.findMany({
    where: {
      userId: userId,
      isClosed: false,
      endDate: {
        lt: currentDate,
      },
      monthlyHistory: {
        userId: userId,
        year: year,
        month: month,
      },
    },
    orderBy: { weekNumber: 'asc' },
  });

  if (openWeeks.length === 0) return; // No hay semanas para cerrar

  // Obtener el historial mensual y el usuario
  const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
    where: {
      userId_year_month: {
        userId: userId,
        year: year,
        month: month,
      },
    },
    include: {
      weeks: {
        orderBy: { weekNumber: 'asc' },
      },
    },
  });

  if (!monthlyHistory) return;

  const user = await ctx.db.user.findUnique({
    where: { id: userId },
  });

  if (!user) return;

  const budgetMode = monthlyHistory.budgetMode ?? 'simple';

  // Cerrar todas las semanas vencidas
  for (const week of openWeeks) {
    const rollover = calculateRollover(week.weeklyBudget, week.spentAmount);
    
    // Cerrar la semana
    await ctx.db.week.update({
      where: { id: week.id },
      data: {
        isClosed: true,
        rolloverAmount: rollover,
      },
    });

    // Actualizar el historial mensual
    await ctx.db.monthlyHistory.update({
      where: { id: week.monthlyHistoryId },
      data: {
        totalSpent: {
          increment: week.spentAmount,
        },
      },
    });
  }

  // Calcular el presupuesto semanal base
  const baseWeeklyBudget = (user.monthlyBudget || 0) / monthlyHistory.weeks.length;

  // Recalcular TODOS los rollovers del mes en cascada
  await recalculateAllRollovers(
    ctx,
    monthlyHistory.id,
    userId,
    budgetMode,
    baseWeeklyBudget
  );
}

// ============================================
// ROUTER PRINCIPAL
// ============================================

export const budgetRouter = createTRPCRouter({
  // ============================================
  // GESTIÓN DE USUARIOS
  // ============================================
  
  createUser: publicProcedure
    .input(createUserSchema)
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.create({
        data: {
          name: 'Usuario Demo',
          email: 'demo@example.com',
          password: 'demo123',
          role: 'user',
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

  getUser: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      let user = await ctx.db.user.findUnique({
        where: { id: userId }
      });
      
      if (!user) {
        // Crear usuario con valores predeterminados
        user = await ctx.db.user.create({
          data: {
            id: userId,
            name: ctx.session.user.name || 'Usuario',
            email: ctx.session.user.email || 'usuario@example.com',
            password: 'temp',
            role: 'user',
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

        // Crear semanas del mes actual
        const currentDate = new Date();
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth() + 1;
        const monthInfo = getWeeksOfMonth(year, month, 100000);
        
        const monthlyHistory = await ctx.db.monthlyHistory.create({
          data: {
            userId: userId,
            year,
            month,
            totalBudget: 100000,
            totalSpent: 0,
            totalRollover: 0,
            budgetMode: 'categorized', // Usar el mismo modo que el usuario
          },
        });

        for (const week of monthInfo.weeks) {
          await createWeekWithCategories(
            ctx,
            userId,
            week,
            monthlyHistory.id,
            'categorized', // Usar el mismo modo que el usuario
            0
          );
        }
      }

      return user;
    }),

  updateUser: protectedProcedure
    .input(updateUserSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const user = await ctx.db.user.findUnique({
        where: { id: userId }
      });
      if (!user) throw new Error('Usuario no encontrado');

      const updatedUser = await ctx.db.user.update({
        where: { id: userId },
        data: input,
      });

      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;

      // Si se cambió el modo de presupuesto, eliminar todas las asignaciones por categoría
      if (input.budgetMode && input.budgetMode !== user.budgetMode) {
        await ctx.db.weekCategory.deleteMany({
          where: {
            week: {
              userId: userId,
              startDate: {
                gte: new Date(year, month - 1, 1),
                lt: new Date(year, month, 1),
              },
            },
          },
        });
      }

      // Crear categorías predeterminadas si el modo es 'categorized' y no existen categorías
      const budgetModeToUse = input.budgetMode || user.budgetMode;
      if (budgetModeToUse === 'categorized') {
        const existingCategories = await ctx.db.category.findMany({
          where: { userId: userId },
        });

        if (existingCategories.length === 0) {
          const defaultCategories = getDefaultCategories();
          await ctx.db.category.createMany({
            data: defaultCategories.map(cat => ({
              name: cat.name,
              allocation: cat.suggestedPercentage,
              userId: userId,
            })),
          });
        }
      }

      // Si se actualizó el presupuesto mensual o se cambió el modo, actualizar las semanas existentes
      if ((input.monthlyBudget && input.monthlyBudget > 0) || (input.budgetMode && input.budgetMode !== user.budgetMode)) {
        const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
          where: {
            userId_year_month: {
              userId: userId,
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
          const budgetToUse = input.monthlyBudget || user.monthlyBudget || 0;
          await ctx.db.monthlyHistory.update({
            where: { id: monthlyHistory.id },
            data: { totalBudget: budgetToUse },
          });

          const monthInfo = getWeeksOfMonth(year, month, budgetToUse);
          
          // Actualizar cada semana existente
          for (let i = 0; i < monthlyHistory.weeks.length; i++) {
            const existingWeek = monthlyHistory.weeks[i];
            const newWeekInfo = monthInfo.weeks[i];
            
            if (existingWeek && newWeekInfo) {
              // Calcular el rollover acumulado actual
              const numWeeks = monthInfo.weeks.length;
              const oldWeeklyBudget = (user.monthlyBudget || 0) / numWeeks;
              const currentRollover = existingWeek.weeklyBudget - oldWeeklyBudget;
              
              // Nuevo presupuesto semanal manteniendo el rollover
              const newWeeklyBudget = newWeekInfo.weeklyBudget + currentRollover;
              
              await ctx.db.week.update({
                where: { id: existingWeek.id },
                data: {
                  weeklyBudget: newWeeklyBudget,
                },
              });

              // Actualizar las asignaciones por categoría según el modo
              if (input.budgetMode === 'categorized') {
                const categories = await ctx.db.category.findMany({
                  where: { userId: userId },
                });

                await ctx.db.weekCategory.deleteMany({
                  where: { weekId: existingWeek.id },
                });

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
                await ctx.db.weekCategory.deleteMany({
                  where: { weekId: existingWeek.id },
                });
              }
            }
          }
        } else {
          // Crear historial y semanas si no existen
          const budgetToUse = input.monthlyBudget || user.monthlyBudget || 0;
          const monthInfo = getWeeksOfMonth(year, month, budgetToUse);
          const budgetModeToUse = input.budgetMode || user.budgetMode || 'simple';
          
          const newMonthlyHistory = await ctx.db.monthlyHistory.create({
            data: {
              userId: userId,
              year,
              month,
              totalBudget: budgetToUse,
              totalSpent: 0,
              totalRollover: 0,
              budgetMode: budgetModeToUse,
            },
          });

          for (const week of monthInfo.weeks) {
            await createWeekWithCategories(
              ctx,
              userId,
              week,
              newMonthlyHistory.id,
              budgetModeToUse,
              0
            );
          }
        }
      }

      return updatedUser;
    }),

  // ============================================
  // GESTIÓN DE CATEGORÍAS
  // ============================================
  
  getCategories: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session.user.id;

      return await ctx.db.category.findMany({
        where: { userId },
        orderBy: { name: 'asc' },
      });
    }),

  createCategory: protectedProcedure
    .input(createCategorySchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return await ctx.db.category.create({
        data: {
          ...input,
          userId: userId,
        },
      });
    }),

  updateCategory: protectedProcedure
    .input(z.object({ id: z.string(), data: updateCategorySchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      
      const category = await ctx.db.category.findUnique({
        where: { id: input.id }
      });
      
      if (!category || category.userId !== userId) {
        throw new Error('Categoría no encontrada o no pertenece al usuario');
      }

      return await ctx.db.category.update({
        where: { id: input.id },
        data: input.data,
      });
    }),

  deleteCategory: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const category = await ctx.db.category.findUnique({
        where: { id: input },
      });

      if (!category) throw new Error('Categoría no encontrada');
      if (category.userId !== userId) throw new Error('Categoría no pertenece al usuario');

      // Eliminar gastos asociados a esta categoría
      await ctx.db.expense.updateMany({
        where: { categoryId: input },
        data: { categoryId: null },
      });

      // Eliminar asignaciones por categoría de las semanas
      await ctx.db.weekCategory.deleteMany({
        where: { categoryId: input },
      });

      return await ctx.db.category.delete({
        where: { id: input },
      });
    }),

  updateCategoryAllocations: protectedProcedure
    .input(updateCategoryAllocationsSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

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

        const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
          where: {
            userId_year_month: {
              userId: userId,
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
        for (const week of monthlyHistory.weeks) {
          await ctx.db.weekCategory.deleteMany({
            where: { weekId: week.id },
          });

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

  // ============================================
  // GESTIÓN DE GASTOS
  // ============================================
  
  getExpenses: protectedProcedure
    .input(z.object({ 
      weekId: z.string().optional(),
      categoryId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      return await ctx.db.expense.findMany({
        where: {
          userId: userId,
          ...(input.weekId && { weekId: input.weekId }),
          ...(input.categoryId && { categoryId: input.categoryId }),
        },
        include: {
          category: true,
        },
        orderBy: { date: 'desc' },
      });
    }),

  createExpense: protectedProcedure
    .input(createExpenseSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const user = await ctx.db.user.findUnique({
        where: { id: userId }
      });
      if (!user) throw new Error('Usuario no encontrado');

      // Validar categoría si se proporciona
      if (input.categoryId) {
        const category = await ctx.db.category.findUnique({
          where: { id: input.categoryId },
        });
        if (!category || category.userId !== userId) {
          throw new Error('Categoría no encontrada o no pertenece al usuario');
        }
      }

      // Encontrar la semana correspondiente a la fecha del gasto
      const expenseDate = input.date;
      const year = expenseDate.getFullYear();
      const month = expenseDate.getMonth() + 1;

      // Usar la nueva función para encontrar la semana correcta
      const week = findWeekForDate(expenseDate, year, month);

      if (!week) throw new Error('No se pudo encontrar la semana para esta fecha');

      // Buscar o crear la semana en la base de datos
      let dbWeek = await ctx.db.week.findFirst({
        where: {
          userId: userId,
          weekNumber: week.weekNumber,
          monthlyHistory: {
            userId: userId,
            year: year,
            month: month,
          },
        },
      });

      if (!dbWeek) {
        // Crear el historial mensual si no existe
        let monthlyHistory = await ctx.db.monthlyHistory.findUnique({
          where: {
            userId_year_month: {
              userId: userId,
              year,
              month,
            },
          },
        });

        if (!monthlyHistory) {
          // Usar explícitamente el budgetMode del usuario
          const userBudgetMode = user.budgetMode || 'simple';
          
          monthlyHistory = await ctx.db.monthlyHistory.create({
            data: {
              userId: userId,
              year,
              month,
              totalBudget: user.monthlyBudget || 0,
              totalSpent: 0,
              totalRollover: 0,
              budgetMode: userBudgetMode,
            },
          });
        } else {
          // Si el historial mensual ya existe pero tiene un modo diferente al del usuario,
          // actualizarlo para que coincida con el modo del usuario
          const userBudgetMode = user.budgetMode || 'simple';
          if (monthlyHistory.budgetMode !== userBudgetMode) {
            await ctx.db.monthlyHistory.update({
              where: { id: monthlyHistory.id },
              data: { budgetMode: userBudgetMode },
            });
            monthlyHistory.budgetMode = userBudgetMode;
          }
        }

        dbWeek = await createWeekWithCategories(
          ctx,
          userId,
          week,
          monthlyHistory.id,
          monthlyHistory.budgetMode,
          0
        );
      }

      // Crear el gasto
      const expense = await ctx.db.expense.create({
        data: {
          ...input,
          userId: userId,
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

      // Si la semana está cerrada, recalcular rollover y aplicar a próxima semana ABIERTA
      if (dbWeek!.isClosed) {
        await recalculateAndApplyRollover(ctx, dbWeek!.id, userId, user.budgetMode ?? 'categorized');
      }

      return expense;
    }),

  updateExpense: protectedProcedure
    .input(z.object({ id: z.string(), data: updateExpenseSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const expense = await ctx.db.expense.findUnique({
        where: { id: input.id },
        include: { week: true },
      });

      if (!expense) throw new Error('Gasto no encontrado');
      if (expense.userId !== userId) throw new Error('Gasto no pertenece al usuario');

      const oldAmount = expense.amount;
      const newAmount = input.data.amount || oldAmount;

      // Actualizar el gasto
      const updatedExpense = await ctx.db.expense.update({
        where: { id: input.id },
        data: input.data,
      });

      // Actualizar montos si cambió el monto
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

        // Si la semana está cerrada, recalcular rollover y aplicar a próxima semana ABIERTA
        if (expense.week.isClosed) {
                const user = await ctx.db.user.findUnique({
            where: { id: userId },
          });
          await recalculateAndApplyRollover(ctx, expense.week.id, userId, user?.budgetMode || 'categorized');
        }
      }

      return updatedExpense;
    }),

  deleteExpense: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const expense = await ctx.db.expense.findUnique({
        where: { id: input },
        include: { week: true },
      });

      if (!expense) throw new Error('Gasto no encontrado');
      if (expense.userId !== userId) throw new Error('Gasto no pertenece al usuario');

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

        // Si la semana está cerrada, recalcular rollover y aplicar a próxima semana ABIERTA
        if (expense.week.isClosed) {
                const user = await ctx.db.user.findUnique({
            where: { id: userId },
          });
          await recalculateAndApplyRollover(ctx, expense.week.id, userId, user?.budgetMode || 'categorized');
        }
      }

      return { success: true };
    }),

  // ============================================
  // GESTIÓN DE SEMANAS
  // ============================================
  
  getWeeks: protectedProcedure
    .input(getMonthDataSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const user = await ctx.db.user.findUnique({
        where: { id: userId }
      });
      if (!user) return [];

      // AUTO-CORRECCIÓN: Verificar y recuperar todas las semanas del mes
      await ensureWeek1Exists(ctx, userId, input.year, input.month, user.monthlyBudget || 0, user.budgetMode || 'simple');

  // AUTO-CORRECCIÓN: Validar y corregir fechas de semanas existentes
  await validateAndFixExistingWeeks(ctx, userId, input.year, input.month, user.monthlyBudget || 0, user.budgetMode || 'simple');

  // AUTO-CORRECCIÓN: Recalcular montos gastados basándose en gastos reales
  await recalculateSpentAmounts(ctx, userId, input.year, input.month);

  // AUTO-CORRECCIÓN: Auto-cerrar semanas vencidas antes de consultar
  await autoCloseExpiredWeeks(ctx, userId, input.year, input.month);

      // Obtener el historial mensual para acceder al budgetMode
      const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
        where: {
          userId_year_month: {
            userId: userId,
            year: input.year,
            month: input.month,
          },
        },
        include: {
          weeks: {
            orderBy: { weekNumber: 'asc' },
          },
        },
      });

      // AUTO-CORRECCIÓN: Recalcular todos los rollovers en cascada
      if (monthlyHistory && monthlyHistory.weeks.length > 0) {
        const baseWeeklyBudget = (user.monthlyBudget || 0) / monthlyHistory.weeks.length;
        await recalculateAllRollovers(
          ctx,
          monthlyHistory.id,
          userId,
          monthlyHistory.budgetMode ?? 'simple',
          baseWeeklyBudget
        );
      }

      // Obtener las semanas de la base de datos (ahora con rollovers recalculados)
      const weeks = await ctx.db.week.findMany({
        where: {
          userId: userId,
          monthlyHistory: {
            userId: userId,
            year: input.year,
            month: input.month,
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

      return {
        weeks: weeks.map(week => {
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
        }),
        budgetMode: monthlyHistory?.budgetMode ?? 'simple',
      };
    }),

  closeWeek: protectedProcedure
    .input(closeWeekSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const week = await ctx.db.week.findUnique({
        where: { id: input.weekId },
        include: { 
          monthlyHistory: {
            include: {
              weeks: {
                orderBy: { weekNumber: 'asc' },
              },
            },
          },
        },
      });

      if (!week) throw new Error('Semana no encontrada');
      if (week.userId !== userId) throw new Error('Semana no pertenece al usuario');

      const rollover = calculateRollover(week.weeklyBudget, week.spentAmount);

      // Marcar la semana como cerrada y guardar el rollover
      await ctx.db.week.update({
        where: { id: input.weekId },
        data: {
          isClosed: true,
          rolloverAmount: rollover,
        },
      });

      // Obtener usuario para saber el modo y presupuesto
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
      });

      if (!user) throw new Error('Usuario no encontrado');

      // Actualizar el historial mensual
      await ctx.db.monthlyHistory.update({
        where: { id: week.monthlyHistoryId },
        data: {
          totalSpent: {
            increment: week.spentAmount,
          },
        },
      });

      // Calcular el presupuesto semanal base
      const baseWeeklyBudget = (user.monthlyBudget || 0) / week.monthlyHistory.weeks.length;

      // Recalcular TODOS los rollovers del mes en cascada
      await recalculateAllRollovers(
        ctx,
        week.monthlyHistoryId,
        userId,
        user.budgetMode || 'categorized',
        baseWeeklyBudget
      );

      return { success: true, rollover };
    }),

  reopenWeek: protectedProcedure
    .input(z.object({ weekId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const week = await ctx.db.week.findUnique({
        where: { id: input.weekId },
        include: { 
          monthlyHistory: {
            include: {
              weeks: {
                orderBy: { weekNumber: 'asc' },
              },
            },
          },
        },
      });

      if (!week) throw new Error('Semana no encontrada');
      if (week.userId !== userId) throw new Error('Semana no pertenece al usuario');
      if (!week.isClosed) throw new Error('La semana ya está abierta');

      // Marcar la semana como abierta y resetear el rollover
      await ctx.db.week.update({
        where: { id: input.weekId },
        data: {
          isClosed: false,
          rolloverAmount: 0,
        },
      });

      // Obtener usuario para saber el modo y presupuesto
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
      });

      if (!user) throw new Error('Usuario no encontrado');

      // Actualizar el historial mensual (restar el gasto que se había sumado al cerrar)
      await ctx.db.monthlyHistory.update({
        where: { id: week.monthlyHistoryId },
        data: {
          totalSpent: {
            decrement: week.spentAmount,
          },
        },
      });

      // Calcular el presupuesto semanal base
      const baseWeeklyBudget = (user.monthlyBudget || 0) / week.monthlyHistory.weeks.length;

      // Recalcular TODOS los rollovers del mes en cascada
      await recalculateAllRollovers(
        ctx,
        week.monthlyHistoryId,
        userId,
        user.budgetMode || 'simple',
        baseWeeklyBudget
      );

      return { success: true, message: 'Semana reabierta exitosamente' };
    }),

  // ============================================
  // HISTORIAL Y ESTADÍSTICAS
  // ============================================
  
  getMonthlyHistory: protectedProcedure
    .input(getMonthDataSchema)
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const user = await ctx.db.user.findUnique({
        where: { id: userId }
      });
      if (!user) return null;

      // AUTO-CORRECCIÓN: Verificar y recuperar todas las semanas del mes
      await ensureWeek1Exists(ctx, userId, input.year, input.month, user.monthlyBudget || 0, user.budgetMode || 'simple');

      // AUTO-CORRECCIÓN: Validar y corregir fechas de semanas existentes
      await validateAndFixExistingWeeks(ctx, userId, input.year, input.month, user.monthlyBudget || 0, user.budgetMode || 'simple');

      // AUTO-CORRECCIÓN: Recalcular montos gastados basándose en gastos reales
      await recalculateSpentAmounts(ctx, userId, input.year, input.month);

      const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
        where: {
          userId_year_month: {
            userId: userId,
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
          userId: userId,
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
          percentage: monthlyHistory.totalSpent > 0 ? (totalSpent / monthlyHistory.totalSpent) * 100 : 0,
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

   getAllMonthlyHistory: protectedProcedure
     .query(async ({ ctx }) => {
       const userId = ctx.session.user.id;

       return await ctx.db.monthlyHistory.findMany({
         where: { userId: userId },
         orderBy: [
           { year: 'desc' },
           { month: 'desc' },
         ],
       });
     }),

   recalculateMonthlyHistory: protectedProcedure
     .input(getMonthDataSchema)
     .mutation(async ({ ctx, input }) => {
       const userId = ctx.session.user.id;

       const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
         where: {
           userId_year_month: {
             userId: userId,
             year: input.year,
             month: input.month,
           },
         },
         include: {
           weeks: true,
         },
       });

       if (!monthlyHistory) throw new Error('Historial mensual no encontrado');

      // Calcular el total gastado real
       const allExpenses = await ctx.db.expense.findMany({
         where: {
           userId: userId,
           weekId: {
             in: monthlyHistory.weeks.map(w => w.id),
           },
         },
       });

      const realTotalSpent = allExpenses.reduce((sum, expense) => sum + expense.amount, 0);

      // Actualizar el historial mensual
      await ctx.db.monthlyHistory.update({
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

  // ============================================
  // GESTIÓN DE MODO DE PRESUPUESTO POR MES
  // ============================================

  updateMonthlyBudgetMode: protectedProcedure
    .input(z.object({
      year: z.number(),
      month: z.number(),
      budgetMode: z.enum(['simple', 'categorized']),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      
      // Buscar o crear el historial mensual
      let monthlyHistory = await ctx.db.monthlyHistory.findUnique({
        where: {
          userId_year_month: {
            userId: userId,
            year: input.year,
            month: input.month,
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

      if (!monthlyHistory) {
        // Si no existe, crear el historial mensual
        const user = await ctx.db.user.findUnique({
          where: { id: userId }
        });
        if (!user) throw new Error('Usuario no encontrado');

        const monthInfo = getWeeksOfMonth(input.year, input.month, user.monthlyBudget || 0);
        
        const newMonthlyHistory = await ctx.db.monthlyHistory.create({
          data: {
            userId: userId,
            year: input.year,
            month: input.month,
            totalBudget: user.monthlyBudget || 0,
            totalSpent: 0,
            totalRollover: 0,
            budgetMode: input.budgetMode,
          },
        });
        
        monthlyHistory = {
          ...newMonthlyHistory,
          weeks: [],
        };

        // Crear todas las semanas
        for (const week of monthInfo.weeks) {
          await createWeekWithCategories(
            ctx,
            userId,
            week,
            newMonthlyHistory.id,
            input.budgetMode,
            0
          );
        }
      } else {
        // Si existe, actualizar el modo
        await ctx.db.monthlyHistory.update({
          where: { id: monthlyHistory.id },
          data: { budgetMode: input.budgetMode },
        });

        // Si se cambió a modo categorizado, crear las asignaciones por categoría
        if (input.budgetMode === 'categorized') {
          const categories = await ctx.db.category.findMany({
            where: { userId: userId },
          });

          // Si no hay categorías, crear las predeterminadas
          if (categories.length === 0) {
            const defaultCategories = getDefaultCategories();
            await ctx.db.category.createMany({
              data: defaultCategories.map(cat => ({
                name: cat.name,
                allocation: cat.suggestedPercentage,
                userId: userId,
              })),
            });
            
            // Obtener las categorías recién creadas
            const newCategories = await ctx.db.category.findMany({
              where: { userId: userId },
            });
            categories.push(...newCategories);
          }

          // Crear asignaciones por categoría para todas las semanas
          for (const week of monthlyHistory.weeks) {
            // Eliminar asignaciones existentes
            await ctx.db.weekCategory.deleteMany({
              where: { weekId: week.id },
            });

            // Crear nuevas asignaciones
            await Promise.all(
              categories.map(category =>
                ctx.db.weekCategory.create({
                  data: {
                    categoryId: category.id,
                    weekId: week.id,
                    allocatedAmount: (week.weeklyBudget * category.allocation) / 100,
                  },
                })
              )
            );
          }
        } else if (input.budgetMode === 'simple') {
          // Si se cambió a modo simple, eliminar todas las asignaciones por categoría
          await ctx.db.weekCategory.deleteMany({
            where: {
              weekId: {
                in: monthlyHistory.weeks.map(w => w.id),
              },
            },
          });
        }
      }

      return { success: true };
    }),

  // ============================================
  // UTILIDADES
  // ============================================
  
   createWeeksForCurrentMonth: protectedProcedure
     .mutation(async ({ ctx }) => {
       const userId = ctx.session.user.id;
       const user = await ctx.db.user.findUnique({
         where: { id: userId }
       });
       if (!user) throw new Error('Usuario no encontrado');

       const currentDate = new Date();
       const year = currentDate.getFullYear();
       const month = currentDate.getMonth() + 1;

       // Verificar si ya existen semanas para este mes
       const existingWeeks = await ctx.db.week.findMany({
         where: {
           userId: userId,
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
       
       const monthlyHistory = await ctx.db.monthlyHistory.create({
         data: {
           userId: userId,
           year,
           month,
           totalBudget: user.monthlyBudget || 0,
           totalSpent: 0,
          totalRollover: 0,
          budgetMode: user.budgetMode || 'simple',
        },
       });

      for (const week of monthInfo.weeks) {
        await createWeekWithCategories(
          ctx,
          userId,
          week,
          monthlyHistory.id,
          user.budgetMode || 'simple',
          0
        );
      }

      return { message: 'Semanas creadas exitosamente', weeks: monthInfo.weeks.length };
     }),

   autoCloseWeeks: protectedProcedure
     .mutation(async ({ ctx }) => {
       const userId = ctx.session.user.id;
       const user = await ctx.db.user.findUnique({
         where: { id: userId }
       });
       if (!user) throw new Error('Usuario no encontrado');

      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1;

      await autoCloseExpiredWeeks(ctx, userId, year, month);

      return { 
        message: 'Semanas vencidas cerradas automáticamente',
      };
     }),

   applyPendingRollovers: protectedProcedure
     .mutation(async ({ ctx }) => {
       const userId = ctx.session.user.id;
       const user = await ctx.db.user.findUnique({
         where: { id: userId }
       });
       if (!user) throw new Error('Usuario no encontrado');

       const currentDate = new Date();
       const year = currentDate.getFullYear();
       const month = currentDate.getMonth() + 1;

      // Buscar semanas cerradas con rollover pendiente
       const closedWeeks = await ctx.db.week.findMany({
         where: {
           userId: userId,
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

      for (const closedWeek of closedWeeks) {
        await applyRolloverToNextOpenWeek(ctx, closedWeek.id, closedWeek.rolloverAmount, userId, user.budgetMode ?? 'categorized');
        
        // Resetear el rollover después de aplicar
        await ctx.db.week.update({
          where: { id: closedWeek.id },
          data: { rolloverAmount: 0 },
        });
      }

       return { 
        message: closedWeeks.length > 0 
          ? `Se aplicaron ${closedWeeks.length} rollovers pendientes`
           : 'No hay rollovers pendientes',
        appliedRollovers: closedWeeks.length
       };
     }),

   resetBudget: protectedProcedure
     .mutation(async ({ ctx }) => {
       const userId = ctx.session.user.id;
       const user = await ctx.db.user.findUnique({
         where: { id: userId }
       });
       if (!user) throw new Error('Usuario no encontrado');

      // Eliminar todo
       await ctx.db.expense.deleteMany({
         where: { userId: userId },
       });

       await ctx.db.weekCategory.deleteMany({
         where: {
           week: { userId: userId },
         },
       });

       await ctx.db.week.deleteMany({
         where: { userId: userId },
       });

       await ctx.db.monthlyHistory.deleteMany({
         where: { userId: userId },
       });

       await ctx.db.category.deleteMany({
         where: { userId: userId },
       });

      // Crear categorías predeterminadas si es modo categorizado
       if (user.budgetMode === 'categorized') {
         const defaultCategories = getDefaultCategories();
         await ctx.db.category.createMany({
           data: defaultCategories.map(cat => ({
             name: cat.name,
             allocation: cat.suggestedPercentage,
             userId: userId,
           })),
         });
       }

      // Crear semanas del mes actual
       const currentDate = new Date();
       const year = currentDate.getFullYear();
       const month = currentDate.getMonth() + 1;
       const monthInfo = getWeeksOfMonth(year, month, user.monthlyBudget || 0);
       
       const monthlyHistory = await ctx.db.monthlyHistory.create({
         data: {
           userId: userId,
           year,
           month,
           totalBudget: user.monthlyBudget || 0,
           totalSpent: 0,
          totalRollover: 0,
          budgetMode: user.budgetMode || 'simple',
        },
       });

      for (const week of monthInfo.weeks) {
        await createWeekWithCategories(
          ctx,
          userId,
          week,
          monthlyHistory.id,
          user.budgetMode || 'simple',
          0
        );
      }

      return { 
        message: 'Presupuesto reiniciado exitosamente',
        weeksCreated: monthInfo.weeks.length 
      };
     }),

  recoverMissingWeeks: protectedProcedure
    .input(getMonthDataSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const user = await ctx.db.user.findUnique({
        where: { id: userId }
      });
      if (!user) throw new Error('Usuario no encontrado');

      await recoverMissingWeeks(ctx, userId, input.year, input.month, user.monthlyBudget || 0);
      
      return { 
        success: true, 
        message: 'Semanas faltantes recuperadas exitosamente' 
      };
    }),

  validateAndFixWeeks: protectedProcedure
    .input(getMonthDataSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const user = await ctx.db.user.findUnique({
        where: { id: userId }
      });
      if (!user) throw new Error('Usuario no encontrado');

      // Obtener las semanas actuales de la base de datos
      const existingWeeks = await ctx.db.week.findMany({
        where: {
          userId: userId,
          monthlyHistory: {
            userId: userId,
            year: input.year,
            month: input.month,
          },
        },
        orderBy: { weekNumber: 'asc' },
      });

      // Obtener las semanas correctas según el cálculo
      const monthInfo = getWeeksOfMonth(input.year, input.month, user.monthlyBudget || 0);
      
      let fixedWeeks = 0;
      let createdWeeks = 0;

      // Verificar y corregir fechas de semanas existentes
      for (const existingWeek of existingWeeks) {
        const correctWeek = monthInfo.weeks.find(w => w.weekNumber === existingWeek.weekNumber);
        
        if (correctWeek) {
          // Verificar si las fechas son correctas
          const startDateMatch = existingWeek.startDate.getTime() === correctWeek.startDate.getTime();
          const endDateMatch = existingWeek.endDate.getTime() === correctWeek.endDate.getTime();
          
          if (!startDateMatch || !endDateMatch) {
            // Corregir las fechas
            await ctx.db.week.update({
              where: { id: existingWeek.id },
              data: {
                startDate: correctWeek.startDate,
                endDate: correctWeek.endDate,
                weeklyBudget: correctWeek.weeklyBudget,
              },
            });
            fixedWeeks++;
          }
        }
      }

      // Crear semanas faltantes
      for (const correctWeek of monthInfo.weeks) {
        const existingWeek = existingWeeks.find(w => w.weekNumber === correctWeek.weekNumber);
        
        if (!existingWeek) {
          const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
            where: {
              userId_year_month: {
                userId: userId,
                year: input.year,
                month: input.month,
              },
            },
          });

          if (monthlyHistory) {
            await createWeekWithCategories(
              ctx,
              userId,
              correctWeek,
              monthlyHistory.id,
              'simple',
              0
            );
            createdWeeks++;
          }
        }
      }

      return { 
        success: true, 
        message: `Semanas validadas y corregidas: ${fixedWeeks} corregidas, ${createdWeeks} creadas`,
        fixedWeeks,
        createdWeeks
      };
    }),

  forceRecalculateRollovers: protectedProcedure
    .input(getMonthDataSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
      });
      if (!user) throw new Error('Usuario no encontrado');

      // Obtener el historial mensual
      const monthlyHistory = await ctx.db.monthlyHistory.findUnique({
        where: {
          userId_year_month: {
            userId: userId,
            year: input.year,
            month: input.month,
          },
        },
        include: {
          weeks: {
            orderBy: { weekNumber: 'asc' },
          },
        },
      });

      if (!monthlyHistory) throw new Error('Historial mensual no encontrado');

      // Calcular el presupuesto semanal base
      const baseWeeklyBudget = (user.monthlyBudget || 0) / monthlyHistory.weeks.length;

      // Recalcular TODOS los rollovers del mes en cascada
      await recalculateAllRollovers(
        ctx,
        monthlyHistory.id,
        userId,
        monthlyHistory.budgetMode ?? 'simple',
        baseWeeklyBudget
      );

      // Obtener las semanas actualizadas para mostrar en el resultado
      const updatedWeeks = await ctx.db.week.findMany({
        where: {
          monthlyHistoryId: monthlyHistory.id,
        },
        orderBy: { weekNumber: 'asc' },
      });

      return {
        success: true,
        message: 'Rollovers recalculados exitosamente',
        weeks: updatedWeeks.map((w) => ({
          weekNumber: w.weekNumber,
          weeklyBudget: w.weeklyBudget,
          spentAmount: w.spentAmount,
          rolloverAmount: w.rolloverAmount,
          isClosed: w.isClosed,
        })),
      };
    }),

  fixAllBudgetModes: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
      });
      if (!user) throw new Error('Usuario no encontrado');

      const userBudgetMode = user.budgetMode || 'simple';

      // Obtener todos los historiales mensuales del usuario
      const monthlyHistories = await ctx.db.monthlyHistory.findMany({
        where: { userId: userId },
      });

      let updatedCount = 0;

      // Actualizar todos los historiales mensuales que tengan un modo diferente
      for (const history of monthlyHistories) {
        if (history.budgetMode !== userBudgetMode) {
          await ctx.db.monthlyHistory.update({
            where: { id: history.id },
            data: { budgetMode: userBudgetMode },
          });
          updatedCount++;

          // Si se cambió a modo simple, eliminar todas las asignaciones de categorías
          if (userBudgetMode === 'simple') {
            await ctx.db.weekCategory.deleteMany({
              where: {
                week: {
                  monthlyHistoryId: history.id,
                },
              },
            });
          }
          // Si se cambió a modo categorizado, crear las asignaciones si no existen
          else if (userBudgetMode === 'categorized') {
            const categories = await ctx.db.category.findMany({
              where: { userId: userId },
            });

            const weeks = await ctx.db.week.findMany({
              where: { monthlyHistoryId: history.id },
            });

            for (const week of weeks) {
              // Eliminar asignaciones existentes
              await ctx.db.weekCategory.deleteMany({
                where: { weekId: week.id },
              });

              // Crear nuevas asignaciones
              for (const category of categories) {
                await ctx.db.weekCategory.create({
                  data: {
                    weekId: week.id,
                    categoryId: category.id,
                    allocatedAmount: (week.weeklyBudget * category.allocation) / 100,
                    spentAmount: 0,
                  },
                });
              }
            }
          }
        }
      }

      return {
        success: true,
        message: `Se corrigieron ${updatedCount} historiales mensuales`,
        updatedCount,
        currentMode: userBudgetMode,
      };
    }),

  fixWeekDatesTimezone: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
      });
      if (!user) throw new Error('Usuario no encontrado');

      // Obtener todas las semanas del usuario
      const weeks = await ctx.db.week.findMany({
        where: { userId: userId },
        include: {
          monthlyHistory: true,
        },
      });

      let updatedCount = 0;

      // Agrupar semanas por mes
      const weeksByMonth = new Map<string, typeof weeks>();
      for (const week of weeks) {
        const key = `${week.monthlyHistory.year}-${week.monthlyHistory.month}`;
        if (!weeksByMonth.has(key)) {
          weeksByMonth.set(key, []);
        }
        weeksByMonth.get(key)!.push(week);
      }

      // Recalcular y actualizar fechas para cada mes
      for (const [key, monthWeeks] of weeksByMonth.entries()) {
        const [year, month] = key.split('-').map(Number);
        if (!year || !month) continue;

        // Obtener las fechas correctas
        const monthInfo = getWeeksOfMonth(year, month, user.monthlyBudget || 0);

        // Actualizar cada semana con las fechas correctas
        for (const week of monthWeeks) {
          const correctWeek = monthInfo.weeks.find(w => w.weekNumber === week.weekNumber);
          if (correctWeek) {
            // Verificar si las fechas son diferentes
            const startChanged = week.startDate.getTime() !== correctWeek.startDate.getTime();
            const endChanged = week.endDate.getTime() !== correctWeek.endDate.getTime();

            if (startChanged || endChanged) {
              await ctx.db.week.update({
                where: { id: week.id },
                data: {
                  startDate: correctWeek.startDate,
                  endDate: correctWeek.endDate,
                },
              });
              updatedCount++;
            }
          }
        }
      }

      return {
        success: true,
        message: `Se actualizaron ${updatedCount} semanas con fechas corregidas`,
        updatedCount,
      };
    }),

  // ============================================
  // CONSULTAS DE ADMINISTRADOR
  // ============================================
  
  getAdminStats: publicProcedure
    .query(async ({ ctx }) => {
      const users = await ctx.db.user.findMany({
        include: {
          expenses: true,
        },
      });

      const totalUsers = users.length;
      const totalBudget = users.reduce((sum, user) => sum + (user.monthlyBudget || 0), 0);
      const totalSpent = users.reduce((sum, user) => {
        const userSpent = user.expenses.reduce((expenseSum, expense) => expenseSum + expense.amount, 0);
        return sum + userSpent;
      }, 0);

      return {
        totalUsers,
        totalBudget,
        totalSpent,
      };
    }),

  getAllUsers: publicProcedure
    .query(async ({ ctx }) => {
      const users = await ctx.db.user.findMany({
        include: {
          expenses: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        monthlyBudget: user.monthlyBudget,
        totalSpent: user.expenses.reduce((sum, expense) => sum + expense.amount, 0),
        createdAt: user.createdAt,
      }));
    }),

  deleteUser: publicProcedure
    .input(z.string())
    .mutation(async ({ ctx, input }) => {
      const userId = input;

      const user = await ctx.db.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Eliminar en orden correcto
      await ctx.db.expense.deleteMany({
        where: { userId }
      });

      await ctx.db.weekCategory.deleteMany({
        where: {
          week: { userId }
        }
      });

      await ctx.db.week.deleteMany({
        where: { userId }
      });

      await ctx.db.monthlyHistory.deleteMany({
        where: { userId }
      });

      await ctx.db.category.deleteMany({
        where: { userId }
      });

      await ctx.db.user.delete({
        where: { id: userId }
      });

      return { success: true, message: 'Usuario eliminado correctamente' };
    }),
 });
