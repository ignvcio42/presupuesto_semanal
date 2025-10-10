'use client';

import { useState } from 'react';
import { 
  Container, 
  Title, 
  Grid, 
  Card, 
  Text, 
  Group, 
  Button, 
  Stack,
  Alert,
  Tabs,
  Badge,
  ActionIcon,
  Modal,
  NumberInput,
  Select,
  Switch,
  Divider
} from '@mantine/core';
import { 
  IconSettings, 
  IconCalendar, 
  IconTrendingUp, 
  IconAlertCircle,
  IconChartBar,
  IconHistory
} from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { api } from '~/trpc/react';
import { WeekCard } from './week-card';
import { ExpenseForm } from './expense-form';
import { CategoryProgress } from './category-progress';
import { MonthlyHistory } from './monthly-history';
import { CategorySettings } from './category-settings';
import { MonthSelector } from './month-selector';
// import { DebugInfo } from './debug-info';
import { formatCurrency, getMonthName, getCurrentWeek } from '~/lib/date-utils';

export function BudgetDashboard() {
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [categorySettingsOpened, setCategorySettingsOpened] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>('current');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [showMonthSelector, setShowMonthSelector] = useState(false);
  
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  
  // Usar el mes seleccionado o el actual
  const displayYear = selectedYear || currentYear;
  const displayMonth = selectedMonth || currentMonth;

  // Queries
  const { data: user, refetch: refetchUser } = api.budget.getUser.useQuery();
  const { data: categories, refetch: refetchCategories } = api.budget.getCategories.useQuery();
  const { data: weeks, refetch: refetchWeeks } = api.budget.getWeeks.useQuery({
    year: displayYear,
    month: displayMonth,
  });

  // Mutations
  const updateUser = api.budget.updateUser.useMutation({
    onSuccess: () => {
      refetchUser();
      refetchWeeks();
      refetchCategories();
      setSettingsOpened(false);
    },
  });

  const closeWeek = api.budget.closeWeek.useMutation({
    onSuccess: () => {
      refetchWeeks();
    },
  });

  const createWeeks = api.budget.createWeeksForCurrentMonth.useMutation({
    onSuccess: () => {
      refetchWeeks();
      refetchUser();
    },
  });

  const resetBudget = api.budget.resetBudget.useMutation({
    onSuccess: () => {
      refetchUser();
      refetchWeeks();
      refetchCategories();
      setSettingsOpened(false);
    },
  });

  const settingsForm = useForm({
    initialValues: {
      monthlyBudget: user?.monthlyBudget || 0,
      budgetMode: (user?.budgetMode as 'simple' | 'categorized') || 'categorized',
    },
  });

  // Detectar si el modo cambió
  const modeChanged = settingsForm.values.budgetMode !== user?.budgetMode;

  const handleCloseWeek = async (weekId: string) => {
    const week = weeks?.find(w => w.id === weekId);
    if (!week) return;

    const rollover = week.weeklyBudget - week.spentAmount;
    const rolloverText = rollover > 0 
      ? `Se transferirán ${formatCurrency(rollover)} a la siguiente semana`
      : rollover < 0 
      ? `Se descontarán ${formatCurrency(Math.abs(rollover))} de la siguiente semana`
      : 'No hay rollover (gastaste exactamente el presupuesto)';

    const message = `¿Estás seguro de que quieres cerrar la Semana ${week.weekNumber}?\n\n` +
      `Presupuesto: ${formatCurrency(week.weeklyBudget)}\n` +
      `Gastado: ${formatCurrency(week.spentAmount)}\n` +
      `Rollover: ${rolloverText}\n\n` +
      `Esta acción no se puede deshacer.`;

    if (confirm(message)) {
      await closeWeek.mutateAsync({ weekId });
    }
  };

  const handleUpdateSettings = async (values: typeof settingsForm.values) => {
    // Si el modo cambió, mostrar advertencia
    if (modeChanged) {
      const confirmed = confirm(
        '⚠️ ADVERTENCIA: Cambiar el modo de presupuesto eliminará todas las asignaciones por categoría de las semanas actuales.\n\n' +
        'Esto significa que perderás el progreso de las categorías en las semanas de este mes.\n\n' +
        '¿Estás seguro de que quieres continuar?'
      );
      
      if (!confirmed) {
        return;
      }
    }
    
    await updateUser.mutateAsync(values);
  };

  const handleResetBudget = async () => {
    const confirmed = confirm(
      '⚠️ ADVERTENCIA: Esto eliminará TODOS los datos del presupuesto:\n\n' +
      '• Todos los gastos registrados\n' +
      '• Todo el historial de meses\n' +
      '• Todas las semanas y su progreso\n' +
      '• Todas las categorías personalizadas\n\n' +
      'Solo se mantendrá la configuración actual (presupuesto mensual y modo).\n\n' +
      '¿Estás SEGURO de que quieres reiniciar todo?'
    );
    
    if (confirmed) {
      await resetBudget.mutateAsync();
    }
  };

  const currentWeekNumber = getCurrentWeek(displayYear, displayMonth);
  const currentWeek = weeks?.find(w => w.weekNumber === currentWeekNumber);
  
  const handleMonthSelect = (year: number, month: number) => {
    setSelectedYear(year);
    setSelectedMonth(month);
    setShowMonthSelector(false);
    setActiveTab('current');
  };
  
  const handleBackToCurrent = () => {
    setSelectedYear(null);
    setSelectedMonth(null);
    setShowMonthSelector(false);
    setActiveTab('current');
  };

  if (!user || !categories || !weeks) {
    return (
      <Container size="xl" py="xl">
        <Text>Cargando...</Text>
      </Container>
    );
  }

  // Si se está mostrando el selector de meses
  if (showMonthSelector) {
    return (
      <MonthSelector
        currentYear={currentYear}
        currentMonth={currentMonth}
        onMonthSelect={handleMonthSelect}
        onBackToCurrent={handleBackToCurrent}
      />
    );
  }

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={1}>Presupuesto Semanal</Title>
          <Group gap="md" align="center">
            <Text c="dimmed">
              {getMonthName(displayMonth)} {displayYear}
            </Text>
            {selectedYear && selectedMonth && (
              <Badge color="blue" variant="light" size="sm">
                Historial
              </Badge>
            )}
          </Group>
        </div>
        
         <Group>
           <Button
             variant="light"
             size="sm"
             onClick={() => setShowMonthSelector(true)}
           >
             Ver Historial
           </Button>
           
           <Badge color="blue" variant="light" size="lg">
             {formatCurrency(user.monthlyBudget || 0)} mensual
           </Badge>
           
           {user.budgetMode === 'categorized' && (
             <Button
               variant="light"
               size="sm"
               onClick={() => setCategorySettingsOpened(true)}
             >
               Configurar Categorías
             </Button>
           )}
           
           <ActionIcon
             variant="light"
             size="lg"
             onClick={() => setSettingsOpened(true)}
           >
             <IconSettings size={20} />
           </ActionIcon>
         </Group>
       </Group>

       {/* Debug Info - Temporal
       <DebugInfo /> */}

      <Tabs value={activeTab} onChange={setActiveTab} mb="xl">
        <Tabs.List>
          <Tabs.Tab value="current" leftSection={<IconCalendar size={16} />}>
            Semana Actual
          </Tabs.Tab>
          <Tabs.Tab value="month" leftSection={<IconChartBar size={16} />}>
            Vista Mensual
          </Tabs.Tab>
          <Tabs.Tab value="history" leftSection={<IconHistory size={16} />}>
            Historial
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="current" pt="md">
          {weeks && weeks.length > 0 ? (
            currentWeek ? (
              <Grid>
                <Grid.Col span={{ base: 12, md: 8 }}>
                  <Stack gap="md">
                    <WeekCard
                      week={currentWeek}
                      onCloseWeek={handleCloseWeek}
                      isCurrentWeek={true}
                      budgetMode={user?.budgetMode as 'simple' | 'categorized'}
                      onExpenseUpdate={() => {
                        refetchWeeks();
                        refetchCategories();
                      }}
                    />
                    
                    {user.budgetMode === 'categorized' && (
                      <CategoryProgress
                        categories={currentWeek.categories}
                        totalBudget={currentWeek.weeklyBudget}
                        totalSpent={currentWeek.spentAmount}
                      />
                    )}
                  </Stack>
                </Grid.Col>
                
                <Grid.Col span={{ base: 12, md: 4 }}>
                  <Stack gap="md">
                    <ExpenseForm
                      categories={categories}
                      budgetMode={user?.budgetMode as 'simple' | 'categorized' | undefined}
                      onSuccess={() => {
                        refetchWeeks();
                        refetchCategories();
                      }}
                    />
                    
                    <Card shadow="sm" padding="lg" radius="md" withBorder>
                      <Text fw={500} mb="md">Resumen Semanal</Text>
                      <Stack gap="xs">
                        <Group justify="space-between">
                          <Text size="sm">Presupuesto:</Text>
                          <Text size="sm" fw={500}>
                            {formatCurrency(currentWeek.weeklyBudget)}
                          </Text>
                        </Group>
                        <Group justify="space-between">
                          <Text size="sm">Gastado:</Text>
                          <Text size="sm" fw={500}>
                            {formatCurrency(currentWeek.spentAmount)}
                          </Text>
                        </Group>
                        <Group justify="space-between">
                          <Text size="sm">Restante:</Text>
                          <Text 
                            size="sm" 
                            fw={500}
                            c={currentWeek.weeklyBudget - currentWeek.spentAmount < 0 ? 'red' : 'green'}
                          >
                            {formatCurrency(currentWeek.weeklyBudget - currentWeek.spentAmount)}
                          </Text>
                        </Group>
                      </Stack>
                    </Card>
                  </Stack>
                </Grid.Col>
              </Grid>
            ) : (
              <Alert icon={<IconAlertCircle size={16} />} title="Semana no encontrada">
                No se encontró la semana actual para {getMonthName(displayMonth)} {displayYear}.
              </Alert>
            )
          ) : (
             <Alert icon={<IconAlertCircle size={16} />} title="No hay semanas configuradas">
               <Text mb="md">
                 No se encontraron semanas para {getMonthName(displayMonth)} {displayYear}. 
                 Esto puede suceder si:
               </Text>
               <ul>
                 <li>No has configurado tu presupuesto mensual</li>
                 <li>Las semanas aún no se han creado</li>
                 <li>Hay un problema con la configuración</li>
               </ul>
               <Group mt="md">
                 <Button 
                   variant="light" 
                   onClick={() => {
                     refetchWeeks();
                     refetchUser();
                   }}
                 >
                   Recargar Datos
                 </Button>
                 <Button 
                   variant="filled"
                   loading={createWeeks.isPending}
                   onClick={() => createWeeks.mutate()}
                 >
                   Crear Semanas
                 </Button>
               </Group>
             </Alert>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="month" pt="md">
          {weeks && weeks.length > 0 ? (
            <Grid>
              {weeks.map((week) => (
                <Grid.Col key={week.id} span={{ base: 12, md: 6, lg: 4 }}>
                  <WeekCard
                    week={week}
                    onCloseWeek={handleCloseWeek}
                    isCurrentWeek={week.weekNumber === currentWeekNumber}
                    budgetMode={user?.budgetMode as 'simple' | 'categorized'}
                    onExpenseUpdate={() => {
                      refetchWeeks();
                      refetchCategories();
                    }}
                  />
                </Grid.Col>
              ))}
            </Grid>
          ) : (
            <Alert icon={<IconAlertCircle size={16} />} title="No hay semanas configuradas">
              <Text mb="md">
                No se encontraron semanas para {getMonthName(displayMonth)} {displayYear}.
              </Text>
              <Group>
                <Button 
                  variant="light" 
                  onClick={() => {
                    refetchWeeks();
                    refetchUser();
                  }}
                >
                  Recargar Datos
                </Button>
                <Button 
                  variant="filled"
                  loading={createWeeks.isPending}
                  onClick={() => createWeeks.mutate()}
                >
                  Crear Semanas
                </Button>
              </Group>
            </Alert>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="history" pt="md">
          <MonthlyHistory year={displayYear} month={displayMonth} />
        </Tabs.Panel>
      </Tabs>

      {/* Modal de Configuración */}
      <Modal
        opened={settingsOpened}
        onClose={() => setSettingsOpened(false)}
        title="Configuración del Presupuesto"
        size="md"
      >
        <form onSubmit={settingsForm.onSubmit(handleUpdateSettings)}>
          <Stack gap="md">
            <NumberInput
              label="Presupuesto Mensual"
              placeholder="Ingresa tu presupuesto mensual"
              leftSection="$"
              min={1000}
              step={10000}
              thousandSeparator="."
              decimalSeparator=","
              {...settingsForm.getInputProps('monthlyBudget')}
            />

            <Select
              label="Modo de Presupuesto"
              data={[
                { value: 'simple', label: 'Semanal Simple' },
                { value: 'categorized', label: 'Por Categorías' },
              ]}
              {...settingsForm.getInputProps('budgetMode')}
            />

            {modeChanged && (
              <Alert icon={<IconAlertCircle size={16} />} color="orange" title="Advertencia">
                <Text size="sm">
                  Cambiar el modo de presupuesto eliminará todas las asignaciones por categoría 
                  de las semanas actuales. Perderás el progreso de las categorías en este mes.
                </Text>
              </Alert>
            )}

            <Divider />

            <Group justify="space-between" mt="md">
              <Button
                variant="outline"
                color="red"
                onClick={handleResetBudget}
                loading={resetBudget.isPending}
              >
                Reiniciar Todo
              </Button>
              
              <Group>
                <Button
                  variant="outline"
                  onClick={() => setSettingsOpened(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" loading={updateUser.isPending}>
                  Guardar
                </Button>
              </Group>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Modal de Configuración de Categorías */}
      <CategorySettings
        opened={categorySettingsOpened}
        onClose={() => setCategorySettingsOpened(false)}
        categories={categories}
        monthlyBudget={user?.monthlyBudget}
        onSuccess={() => {
          refetchCategories();
          refetchWeeks();
        }}
      />
    </Container>
  );
}
