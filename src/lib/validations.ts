import { z } from 'zod';

// Esquemas de validación para el presupuesto semanal

export const createUserSchema = z.object({
  monthlyBudget: z.number().min(1000, 'El presupuesto mensual debe ser al menos $1.000 CLP'),
  budgetMode: z.enum(['simple', 'categorized']).default('categorized'),
});

export const updateUserSchema = z.object({
  monthlyBudget: z.number().min(1000).optional(),
  budgetMode: z.enum(['simple', 'categorized']).optional(),
});

export const createCategorySchema = z.object({
  name: z.string().min(1, 'El nombre de la categoría es requerido').max(50, 'El nombre no puede exceder 50 caracteres'),
  allocation: z.number().min(0, 'La asignación debe ser al menos 0%').max(100, 'La asignación no puede exceder 100%'),
});

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  allocation: z.number().min(0).max(100).optional(),
});

export const createExpenseSchema = z.object({
  amount: z.number().min(1, 'El monto debe ser mayor a 0'),
  description: z.string().min(1, 'La descripción es requerida').max(200, 'La descripción no puede exceder 200 caracteres'),
  date: z.date(),
  categoryId: z.string().uuid('ID de categoría inválido').optional(),
});

export const updateExpenseSchema = z.object({
  amount: z.number().min(1).optional(),
  description: z.string().min(1).max(200).optional(),
  date: z.date().optional(),
  categoryId: z.string().uuid().optional(),
});

export const closeWeekSchema = z.object({
  weekId: z.string().uuid('ID de semana inválido'),
});

export const getMonthDataSchema = z.object({
  year: z.number().int().min(2020).max(2030),
  month: z.number().int().min(1).max(12),
});

export const updateCategoryAllocationsSchema = z.object({
  allocations: z.array(z.object({
    categoryId: z.string().uuid(),
    allocation: z.number().min(0).max(100),
  })).refine(
    (allocations) => {
      const total = allocations.reduce((sum, item) => sum + item.allocation, 0);
      return Math.abs(total - 100) < 0.01; // Permitir pequeñas diferencias por redondeo
    },
    {
      message: 'La suma de todas las asignaciones debe ser 100%',
    }
  ),
});

// Tipos TypeScript derivados de los esquemas
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type CloseWeekInput = z.infer<typeof closeWeekSchema>;
export type GetMonthDataInput = z.infer<typeof getMonthDataSchema>;
export type UpdateCategoryAllocationsInput = z.infer<typeof updateCategoryAllocationsSchema>;

// Esquemas para respuestas de la API
export const weekResponseSchema = z.object({
  id: z.string(),
  weekNumber: z.number(),
  startDate: z.date(),
  endDate: z.date(),
  weeklyBudget: z.number(),
  spentAmount: z.number(),
  rolloverAmount: z.number(),
  isClosed: z.boolean(),
  trafficLightColor: z.enum(['green', 'yellow', 'red']),
  percentageUsed: z.number(),
  categories: z.array(z.object({
    id: z.string(),
    name: z.string(),
    allocatedAmount: z.number(),
    spentAmount: z.number(),
    percentageUsed: z.number(),
  })),
});

export const monthlyHistoryResponseSchema = z.object({
  id: z.string(),
  year: z.number(),
  month: z.number(),
  totalBudget: z.number(),
  totalSpent: z.number(),
  totalRollover: z.number(),
  weeks: z.array(weekResponseSchema),
  topCategories: z.array(z.object({
    categoryName: z.string(),
    totalSpent: z.number(),
    percentage: z.number(),
  })),
  weeklyStats: z.array(z.object({
    weekNumber: z.number(),
    spent: z.number(),
    trafficLightColor: z.enum(['green', 'yellow', 'red']),
  })),
  averageDailySpending: z.number(),
});

export type WeekResponse = z.infer<typeof weekResponseSchema>;
export type MonthlyHistoryResponse = z.infer<typeof monthlyHistoryResponseSchema>;
