import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addWeeks, isWithinInterval } from 'date-fns';
import { es } from 'date-fns/locale';

// Zona horaria de Santiago
export const SANTIAGO_TIMEZONE = 'America/Santiago';

export interface WeekInfo {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  weeklyBudget: number;
}

export interface MonthInfo {
  year: number;
  month: number;
  totalWeeks: number;
  weeks: WeekInfo[];
  totalBudget: number;
}

/**
 * Obtiene las semanas de un mes específico
 */
export function getWeeksOfMonth(year: number, month: number, totalBudget: number): MonthInfo {
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  
  const weeks: WeekInfo[] = [];
  let currentDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Lunes como inicio de semana
  
  let weekNumber = 1;
  
  // Continuar mientras la semana actual tenga al menos un día dentro del mes
  while (currentDate <= monthEnd) {
    const weekStart = currentDate;
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    
    // Solo incluir semanas que tengan al menos un día del mes
    // Verificar que el inicio de la semana esté dentro del mes
    if (weekStart <= monthEnd) {
      const weekEndInMonth = weekEnd > monthEnd ? monthEnd : weekEnd;
      
      weeks.push({
        weekNumber,
        startDate: weekStart,
        endDate: weekEndInMonth,
        weeklyBudget: totalBudget / 4.33, // Promedio de semanas por mes
      });
      weekNumber++;
    }
    
    // Avanzar a la siguiente semana
    currentDate = addWeeks(currentDate, 1);
    
    // Si la nueva fecha ya no tiene días en el mes, salir
    if (currentDate > monthEnd) {
      break;
    }
  }
  
  return {
    year,
    month,
    totalWeeks: weeks.length,
    weeks,
    totalBudget,
  };
}

/**
 * Obtiene la semana actual basada en la fecha
 */
export function getCurrentWeek(year: number, month: number): number {
  const now = new Date();
  const monthStart = startOfMonth(new Date(year, month - 1, 1));
  const monthEnd = endOfMonth(monthStart);
  
  let currentDate = startOfWeek(monthStart, { weekStartsOn: 1 });
  let weekNumber = 1;
  
  while (currentDate <= monthEnd) {
    if (isWithinInterval(now, { start: currentDate, end: endOfWeek(currentDate, { weekStartsOn: 1 }) })) {
      return weekNumber;
    }
    currentDate = addWeeks(currentDate, 1);
    weekNumber++;
  }
  
  return 1; // Fallback
}

/**
 * Formatea una fecha para mostrar en la UI
 */
export function formatDate(date: Date, formatStr = 'dd/MM/yyyy'): string {
  return format(date, formatStr, { locale: es });
}

/**
 * Formatea un monto en CLP
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    minimumFractionDigits: 0,
  }).format(amount);
}

/**
 * Calcula el porcentaje de uso del presupuesto
 */
export function calculateBudgetPercentage(spent: number, budget: number): number {
  if (budget === 0) return 0;
  return Math.min((spent / budget) * 100, 100);
}

/**
 * Determina el color del semáforo basado en el porcentaje restante
 */
export function getTrafficLightColor(percentageUsed: number): 'green' | 'yellow' | 'red' {
  const percentageRemaining = 100 - percentageUsed;
  
  if (percentageRemaining > 50) return 'green';
  if (percentageRemaining >= 20) return 'yellow';
  return 'red';
}

/**
 * Obtiene el nombre del mes en español
 */
export function getMonthName(month: number): string {
  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  return months[month - 1] ?? '';
}

/**
 * Verifica si una fecha está dentro de una semana específica
 */
export function isDateInWeek(date: Date, weekStart: Date, weekEnd: Date): boolean {
  return isWithinInterval(date, { start: weekStart, end: weekEnd });
}

/**
 * Calcula el rollover para la siguiente semana
 */
export function calculateRollover(allocated: number, spent: number): number {
  return allocated - spent;
}

/**
 * Obtiene las categorías predeterminadas con sus porcentajes sugeridos
 */
export function getDefaultCategories() {
  return [
    { name: 'Comida personal', minPercentage: 30, maxPercentage: 35, suggestedPercentage: 40 },
    { name: 'Transporte/Bencina', minPercentage: 10, maxPercentage: 15, suggestedPercentage: 2 },
    { name: 'Gustos pequeños', minPercentage: 10, maxPercentage: 15, suggestedPercentage: 40 },
    { name: 'Suplementos', minPercentage: 5, maxPercentage: 10, suggestedPercentage: 7.5 },
    { name: 'Otros', minPercentage: 5, maxPercentage: 10, suggestedPercentage: 13 },
  ];
}
