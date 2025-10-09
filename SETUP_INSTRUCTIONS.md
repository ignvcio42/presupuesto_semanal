# Presupuesto Semanal - Instrucciones de Configuración

## 🚀 Configuración Inicial

### 1. Instalar Dependencias

```bash
npm install @mantine/core @mantine/hooks @mantine/dates @mantine/notifications @mantine/charts @mantine/form @tabler/icons-react date-fns
```

### 2. Configurar Base de Datos

```bash
# Generar el cliente de Prisma
npx prisma generate

# Crear y aplicar la migración
npx prisma migrate dev --name init-budget-schema

# (Opcional) Abrir Prisma Studio para ver los datos
npx prisma studio
```

### 3. Ejecutar la Aplicación

```bash
npm run dev
```

La aplicación estará disponible en `http://localhost:3000`

## 📋 Funcionalidades Implementadas

### ✅ Características Principales

- **Presupuesto Mensual**: Configuración del monto libre mensual
- **Dos Modos de Presupuesto**:
  - **Semanal Simple**: Solo controla que no te pases del presupuesto semanal
  - **Por Categorías**: Distribuye el presupuesto mensual por porcentajes a categorías

### ✅ Categorías Predeterminadas

- **Polola**: 30-35% (sugerido: 32.5%)
- **Comida personal**: 30-35% (sugerido: 32.5%)
- **Transporte/Bencina**: 10-15% (sugerido: 12.5%)
- **Gustos pequeños**: 10-15% (sugerido: 12.5%)
- **Suplementos**: 5-10% (sugerido: 7.5%)
- **Otros**: 5-10% (sugerido: 7.5%)

### ✅ Sistema de Semáforo

- **🟢 Verde**: >50% del presupuesto restante
- **🟡 Amarillo**: 20-50% del presupuesto restante  
- **🔴 Rojo**: ≤20% del presupuesto restante

### ✅ Funcionalidades de Semana

- **Cálculo Automático**: Divide el presupuesto mensual en semanas
- **Rollover**: El excedente o déficit se transfiere a la siguiente semana
- **Cierre de Semana**: Permite cerrar una semana y aplicar el rollover
- **Seguimiento por Categoría**: Control individual por cada categoría

### ✅ Historial y Analíticas

- **Historial Mensual**: Guarda el historial de cada mes
- **Top Categorías**: Muestra en qué gastas más
- **Estadísticas por Semana**: Progreso semanal con semáforo
- **Promedio Diario**: Cálculo del gasto promedio por día
- **Cumplimiento**: Análisis de cumplimiento del presupuesto

## 🎨 Componentes UI

### Cards de Semana
- Muestra el progreso semanal
- Indicador de semáforo
- Información de rollover
- Botones para cerrar semana y ver detalles

### Formulario de Gastos
- Agregar gastos por categoría
- Validación de montos
- Selección de fecha
- Resumen del gasto

### Barras de Progreso
- Progreso por categoría
- Indicadores visuales de estado
- Alertas cuando te pasas del presupuesto

### Historial Mensual
- Dashboard completo con métricas
- Gráficos de progreso
- Tablas de estadísticas
- Análisis de tendencias

## 🔧 Configuración Técnica

### Stack Tecnológico
- **Frontend**: Next.js 14, React 18, TypeScript
- **UI**: Mantine (componentes), Tailwind CSS (estilos)
- **Backend**: tRPC, Prisma ORM
- **Base de Datos**: SQLite (desarrollo)
- **Validaciones**: Zod
- **Fechas**: date-fns con zona horaria America/Santiago

### Estructura de Base de Datos

```prisma
User {
  id, monthlyBudget, budgetMode, categories, expenses, weeks, monthlyHistory
}

Category {
  id, name, allocation, user, expenses, weekCategories
}

Expense {
  id, amount, description, date, category, user, week
}

Week {
  id, weekNumber, startDate, endDate, weeklyBudget, 
  spentAmount, rolloverAmount, isClosed, user, expenses, weekCategories
}

WeekCategory {
  id, allocatedAmount, spentAmount, category, week
}

MonthlyHistory {
  id, year, month, totalBudget, totalSpent, totalRollover, weeks, user
}
```

## 📱 Uso de la Aplicación

### 1. Configuración Inicial
1. Abre la aplicación
2. Configura tu presupuesto mensual
3. Selecciona el modo (Simple o Por Categorías)
4. Si eliges "Por Categorías", ajusta los porcentajes

### 2. Gestión Diaria
1. Agrega gastos usando el formulario
2. Revisa el progreso en las cards de semana
3. Monitorea el semáforo de cada categoría
4. Cierra la semana cuando termine

### 3. Análisis Mensual
1. Ve al tab "Historial"
2. Revisa las estadísticas del mes
3. Analiza en qué categorías gastas más
4. Compara el cumplimiento semanal

## 🚨 Notas Importantes

### Zona Horaria
- La aplicación usa la zona horaria `America/Santiago`
- Todas las fechas se manejan en tiempo local de Chile

### Formato de Moneda
- Formato CLP (Chilean Peso)
- Separador de miles: punto (.)
- Separador decimal: coma (,)

### Rollover
- **Positivo**: Se suma a la siguiente semana
- **Negativo**: Se descuenta de la siguiente semana
- Solo se aplica al cerrar la semana

### Validaciones
- Presupuesto mensual mínimo: $1.000 CLP
- Suma de categorías debe ser exactamente 100%
- Montos de gastos deben ser mayores a 0

## 🔄 Próximas Mejoras

- [ ] Autenticación de usuarios
- [ ] Exportación de datos (PDF, Excel)
- [ ] Notificaciones push
- [ ] App móvil
- [ ] Integración con bancos
- [ ] Metas de ahorro
- [ ] Comparación entre meses
- [ ] Alertas de presupuesto

## 🐛 Solución de Problemas

### Error: "Prisma client not generated"
```bash
npx prisma generate
```

### Error: "Database not migrated"
```bash
npx prisma migrate dev
```

### Error: "Mantine styles not loading"
Verifica que los imports de CSS estén en `layout.tsx`:
```typescript
import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
```

## 📞 Soporte

Si encuentras algún problema o tienes sugerencias, puedes:
1. Revisar los logs de la consola del navegador
2. Verificar la base de datos con Prisma Studio
3. Revisar los logs del servidor en la terminal

¡Disfruta gestionando tu presupuesto semanal! 💰
