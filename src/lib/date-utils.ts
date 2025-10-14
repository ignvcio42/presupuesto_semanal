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
  // Crear fechas al mediodía para evitar problemas de zona horaria
  const monthStart = startOfMonth(new Date(year, month - 1, 1, 12, 0, 0));
  const monthEnd = endOfMonth(new Date(year, month - 1, 1, 12, 0, 0));
  
  const weeks: WeekInfo[] = [];
  let currentDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Lunes como inicio de semana
  
  let weekNumber = 1;
  
  // Crear las semanas que intersectan con el mes
  while (currentDate <= monthEnd) {
    const weekStart = currentDate;
    const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
    
    // Solo incluir semanas que tengan al menos un día del mes
    // Verificar que la semana intersecte con el mes
    if (weekStart <= monthEnd && weekEnd >= monthStart) {
      const weekStartInMonth = weekStart < monthStart ? monthStart : weekStart;
      const weekEndInMonth = weekEnd > monthEnd ? monthEnd : weekEnd;
      
      // Normalizar las fechas al mediodía para evitar problemas de zona horaria
      const normalizedStart = new Date(weekStartInMonth.getFullYear(), weekStartInMonth.getMonth(), weekStartInMonth.getDate(), 12, 0, 0);
      const normalizedEnd = new Date(weekEndInMonth.getFullYear(), weekEndInMonth.getMonth(), weekEndInMonth.getDate(), 12, 0, 0);
      
      weeks.push({
        weekNumber,
        startDate: normalizedStart,
        endDate: normalizedEnd,
        weeklyBudget: 0, // Se calculará después
      });
      weekNumber++;
    }
    
    // Avanzar a la siguiente semana
    currentDate = addWeeks(currentDate, 1);
    
    // Si la nueva fecha ya no intersecta con el mes, salir
    if (currentDate > monthEnd) {
      break;
    }
  }
  
  // Calcular el presupuesto por semana basado en el número REAL de semanas del mes
  const weeklyBudget = weeks.length > 0 ? totalBudget / weeks.length : 0;
  
  // Actualizar el presupuesto de cada semana
  weeks.forEach(week => {
    week.weeklyBudget = weeklyBudget;
  });
  
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
  const monthInfo = getWeeksOfMonth(year, month, 0);
  
  // Buscar en qué semana está la fecha actual
  for (const week of monthInfo.weeks) {
    if (isWithinInterval(now, { start: week.startDate, end: week.endDate })) {
      return week.weekNumber;
    }
  }
  
  // Si no está en ninguna semana del mes, determinar la semana más cercana
  const currentWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  
  for (const week of monthInfo.weeks) {
    const weekStart = startOfWeek(week.startDate, { weekStartsOn: 1 });
    if (currentWeekStart.getTime() === weekStart.getTime()) {
      return week.weekNumber;
    }
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
 * Crea una fecha en la zona horaria local sin problemas de UTC
 */
export function createLocalDate(year?: number, month?: number, day?: number): Date {
  if (year !== undefined && month !== undefined && day !== undefined) {
    // Crear fecha al mediodía para evitar problemas de zona horaria
    return new Date(year, month - 1, day, 12, 0, 0);
  }
  // Para la fecha actual, crear en zona horaria local al mediodía
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}

/**
 * Convierte una fecha a zona horaria local
 */
export function toLocalDate(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Crear nueva fecha al mediodía usando los componentes locales para evitar problemas de UTC
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
}

/**
 * Crea una fecha desde un string en formato YYYY-MM-DD (como viene de DateInput)
 */
export function createDateFromString(dateString: string): Date {
  const parts = dateString.split('-').map(Number);
  const year = parts[0] ?? new Date().getFullYear();
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  // Crear fecha al mediodía para evitar problemas de zona horaria
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * Crea una fecha desde un Date object del DateInput, normalizando la zona horaria
 */
export function createDateFromDateInput(date: Date): Date {
  // El DateInput puede devolver fechas en UTC que se interpretan mal en zona horaria local
  // Por ejemplo: seleccionar Oct 13 puede devolver "Oct 12 21:00" en Chile (UTC-3)
  // Si la hora es >= 21 (9 PM), probablemente es el día siguiente en UTC
  const hour = date.getHours();
  const dayOffset = hour >= 21 ? 1 : 0;
  
  return new Date(
    date.getFullYear(), 
    date.getMonth(), 
    date.getDate() + dayOffset, 
    12, 0, 0
  );
}

/**
 * Encuentra la semana correcta para una fecha específica
 */
export function findWeekForDate(date: Date, year: number, month: number): WeekInfo | null {
  const monthInfo = getWeeksOfMonth(year, month, 0);
  
  // Buscar la semana que contiene esta fecha
  for (const week of monthInfo.weeks) {
    if (isWithinInterval(date, { start: week.startDate, end: week.endDate })) {
      return week;
    }
  }
  
  return null;
}

/**
 * Valida si una fecha pertenece a una semana específica
 */
export function isDateInWeekRange(date: Date, weekStart: Date, weekEnd: Date): boolean {
  return isWithinInterval(date, { start: weekStart, end: weekEnd });
}

/**
 * Formatea una fecha para mostrar sin problemas de zona horaria
 */
export function formatDateSafe(date: Date | string, formatStr = 'dd/MM/yyyy'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Usar los componentes locales para evitar problemas de UTC
  const localDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return format(localDate, formatStr, { locale: es });
}

/**
 * Obtiene las categorías predeterminadas con sus porcentajes sugeridos
 */
export function getDefaultCategories() {
  return [
    { name: 'Comida personal', minPercentage: 30, maxPercentage: 35, suggestedPercentage: 40 },
    { name: 'Transporte/Bencina', minPercentage: 10, maxPercentage: 15, suggestedPercentage: 2 },
    { name: 'Gustos pequeños', minPercentage: 10, maxPercentage: 15, suggestedPercentage: 40 },
    { name: 'Suplementos', minPercentage: 5, maxPercentage: 10, suggestedPercentage: 5 },
    { name: 'Otros', minPercentage: 5, maxPercentage: 10, suggestedPercentage: 13 },
  ];
}
