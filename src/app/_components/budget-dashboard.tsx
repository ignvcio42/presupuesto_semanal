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
  Divider,
  Affix,
  Transition,
  rem
} from '@mantine/core';
import { 
  IconSettings, 
  IconCalendar, 
  IconAlertCircle,
  IconChartBar,
  IconHistory,
  IconPlus
} from '@tabler/icons-react';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';
import { WeekCard } from './week-card';
import { ExpenseForm } from './expense-form';
import { CategoryProgress } from './category-progress';
import { MonthlyHistory } from './monthly-history';
import { CategorySettings } from './category-settings';
import { MonthSelector } from './month-selector';
import { Header } from './header';
import { DebugInfo } from './debug-info';
import { formatCurrency, getMonthName, getCurrentWeek } from '~/lib/date-utils';

export function BudgetDashboard() {
  const [settingsOpened, setSettingsOpened] = useState(false);
  const [categorySettingsOpened, setCategorySettingsOpened] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>('current');
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [showMonthSelector, setShowMonthSelector] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expenseFormOpened, setExpenseFormOpened] = useState(false);
  
  // Refetch automático cuando se cambia a la pestaña de historial
  const handleTabChange = async (value: string | null) => {
    setActiveTab(value);
    
    // Si se cambia a historial, hacer refetch automático completo
    if (value === 'history') {
      try {
        // Invalidar todas las queries relacionadas con budget
        await utils.budget.invalidate();
        
        // También hacer refetch manual para asegurar
        await Promise.all([
          refetchWeeks(),
          refetchUser(),
          refetchCategories(),
        ]);
      } catch (error) {
        console.error('Error al actualizar datos del historial:', error);
      }
    }
  };
  
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  
  // Usar el mes seleccionado o el actual
  const displayYear = selectedYear ?? currentYear;
  const displayMonth = selectedMonth ?? currentMonth;

  // Queries con límite de reintentos
  const { data: user, refetch: refetchUser, error: userError } = api.budget.getUser.useQuery(undefined, {
    retry: 2,
    retryDelay: 1000,
  });
  const { data: categories, refetch: refetchCategories, error: categoriesError } = api.budget.getCategories.useQuery(undefined, {
    retry: 2,
    retryDelay: 1000,
  });
  const { data: weeksData, refetch: refetchWeeks, error: weeksError } = api.budget.getWeeks.useQuery({
    year: displayYear,
    month: displayMonth,
  }, {
    retry: 2,
    retryDelay: 1000,
  });
  
  const weeks = Array.isArray(weeksData) ? weeksData : weeksData?.weeks ?? [];
  const monthlyBudgetMode = Array.isArray(weeksData) ? 'simple' : weeksData?.budgetMode ?? 'simple';
  
  // Utils para invalidación
  const utils = api.useUtils();


  // Mutations
  const updateUser = api.budget.updateUser.useMutation({
    onSuccess: () => {
      void refetchUser();
      void refetchWeeks();
      void refetchCategories();
      setSettingsOpened(false);
    },
  });

  const closeWeek = api.budget.closeWeek.useMutation({
    onSuccess: () => {
      void refetchWeeks();
      notifications.show({
        title: 'Semana cerrada',
        message: 'La semana ha sido cerrada exitosamente',
        color: 'green',
      });
    },
  });

  const reopenWeek = api.budget.reopenWeek.useMutation({
    onSuccess: () => {
      void refetchWeeks();
      notifications.show({
        title: 'Semana reabierta',
        message: 'La semana ha sido reabierta exitosamente y los rollovers han sido recalculados',
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message,
        color: 'red',
      });
    },
  });

  const createWeeks = api.budget.createWeeksForCurrentMonth.useMutation({
    onSuccess: () => {
      void refetchWeeks();
      void refetchUser();
    },
  });

  const resetBudget = api.budget.resetBudget.useMutation({
    onSuccess: () => {
      void refetchUser();
      void refetchWeeks();
      void refetchCategories();
      setSettingsOpened(false);
    },
  });

  const recoverMissingWeeks = api.budget.recoverMissingWeeks.useMutation({
    onSuccess: () => {
      void refetchWeeks();
      notifications.show({
        title: 'Semanas recuperadas',
        message: 'Las semanas faltantes han sido recuperadas exitosamente',
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message,
        color: 'red',
      });
    },
  });

  const updateMonthlyBudgetMode = api.budget.updateMonthlyBudgetMode.useMutation({
    onSuccess: () => {
      void refetchWeeks();
      void refetchCategories();
      notifications.show({
        title: 'Modo actualizado',
        message: 'El modo de presupuesto del mes ha sido actualizado exitosamente',
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message,
        color: 'red',
      });
    },
  });

  // Función para recargar todos los datos
  const handleRefreshData = async () => {
    setIsRefreshing(true);
    try {
      // Recargar todos los datos sin perder la configuración
      await Promise.all([
        refetchUser(),
        refetchWeeks(),
        refetchCategories(),
      ]);
      
      // Mostrar notificación de éxito
      notifications.show({
        title: 'Datos actualizados',
        message: 'Todos los datos se han recargado correctamente',
        color: 'green',
        icon: <IconSettings size={16} />,
      });
    } catch (error) {
      console.error('Error al recargar datos:', error);
      notifications.show({
        title: 'Error',
        message: 'No se pudieron recargar los datos. Inténtalo de nuevo.',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  const settingsForm = useForm({
    initialValues: {
      monthlyBudget: user?.monthlyBudget ?? 0,
    },
  });

  const handleCloseWeek = async (weekId: string) => {
    const week = weeks.find((w: any) => w.id === weekId);
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

  const handleReopenWeek = async (weekId: string) => {
    await reopenWeek.mutateAsync({ weekId });
  };

  const handleUpdateSettings = async (values: typeof settingsForm.values) => {
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
  const currentWeek = weeks.find((w: any) => w.weekNumber === currentWeekNumber);
  
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

  // Mostrar error si alguna query falla
  if (userError || categoriesError || weeksError) {
    return (
      <Container size="xl" py="xl">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Error al cargar datos</h2>
          <p className="text-gray-600 mb-4">
            {userError?.message || categoriesError?.message || weeksError?.message || 'Error desconocido'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Recargar página
          </button>
        </div>
      </Container>
    );
  }

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
    <>
      <Header />
      <Container size="xl" py={{ base: "md", sm: "xl" }}>
        <Stack gap="md" mb="xl">
          {/* Header principal */}
          <Group justify="space-between" align="flex-start" wrap="wrap">
            <div style={{ minWidth: 0, flex: 1 }}>
              <Title 
                order={1} 
                size="h1"
                style={{ wordBreak: "break-word" }}
              >
                Presupuesto Semanal
              </Title>
              <Group gap="md" align="center" mt="xs" wrap="wrap">
                <Text c="dimmed" size="md">
                  {getMonthName(displayMonth)} {displayYear}
                </Text>
                {selectedYear && selectedMonth && (
                  <Badge color="blue" variant="light" size="sm">
                    Historial
                  </Badge>
                )}
              </Group>
            </div>
            
            {/* Botones de acción - Desktop */}
            <Group className="hidden sm:flex" gap="sm">
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
              
              <Select
                value={monthlyBudgetMode}
                onChange={(value) => {
                  if (value && (value === 'simple' || value === 'categorized')) {
                    updateMonthlyBudgetMode.mutate({
                      year: displayYear,
                      month: displayMonth,
                      budgetMode: value,
                    });
                  }
                }}
                data={[
                  { value: 'simple', label: 'Modo Simple' },
                  { value: 'categorized', label: 'Modo Categorías' },
                ]}
                size="sm"
                w={150}
              />
              
              {monthlyBudgetMode === 'categorized' && (
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

          {/* Información del presupuesto - Mobile */}
          <Group justify="space-between" className="sm:hidden" wrap="wrap">
            <Badge color="blue" variant="light" size="md" style={{ flexShrink: 0 }}>
              {formatCurrency(user.monthlyBudget || 0)} mensual
            </Badge>
            
            <Group gap="xs" wrap="nowrap">
              <Button
                variant="light"
                size="xs"
                onClick={() => setShowMonthSelector(true)}
              >
                Historial
              </Button>
              
              {monthlyBudgetMode === 'categorized' && (
                <Button
                  variant="light"
                  size="xs"
                  onClick={() => setCategorySettingsOpened(true)}
                >
                  Categorías
                </Button>
              )}
              
              <ActionIcon
                variant="light"
                size="md"
                onClick={() => setSettingsOpened(true)}
              >
                <IconSettings size={18} />
              </ActionIcon>
            </Group>
          </Group>
          
          {/* Selector de modo - Mobile */}
          <Group justify="center" className="sm:hidden">
            <Select
              value={monthlyBudgetMode}
              onChange={(value) => {
                if (value && (value === 'simple' || value === 'categorized')) {
                  updateMonthlyBudgetMode.mutate({
                    year: displayYear,
                    month: displayMonth,
                    budgetMode: value,
                  });
                }
              }}
              data={[
                { value: 'simple', label: 'Modo Simple' },
                { value: 'categorized', label: 'Modo Categorías' },
              ]}
              size="sm"
              w="100%"
              maw={250}
            />
          </Group>
        </Stack>

       {/* Debug Info - Solo para administradores */}
       {user?.role === 'admin' && <DebugInfo />}

      <Tabs value={activeTab} onChange={handleTabChange} mb="xl">
        <Tabs.List>
          <Tabs.Tab 
            value="current" 
            leftSection={<IconCalendar size={16} />}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Semana Actual</span>
            <span className="sm:hidden">Actual</span>
          </Tabs.Tab>
          <Tabs.Tab 
            value="month" 
            leftSection={<IconChartBar size={16} />}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Vista Mensual</span>
            <span className="sm:hidden">Mensual</span>
          </Tabs.Tab>
          <Tabs.Tab 
            value="history" 
            leftSection={<IconHistory size={16} />}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Historial</span>
            <span className="sm:hidden">Historial</span>
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="current" pt="md">
          {weeks && weeks.length > 0 ? (
            currentWeek ? (
              <>
                {/* Botón flotante para mobile */}
                <Affix position={{ bottom: rem(20), right: rem(20) }}>
                  <Transition transition="slide-up" mounted={true}>
                    {(transitionStyles) => (
                      <ActionIcon
                        size="xl"
                        radius="xl"
                        variant="filled"
                        color="blue"
                        style={transitionStyles}
                        onClick={() => setExpenseFormOpened(true)}
                        className="md:hidden"
                      >
                        <IconPlus size={24} />
                      </ActionIcon>
                    )}
                  </Transition>
                </Affix>

                <Grid>
                  {/* Columna principal - Semana actual */}
                  <Grid.Col span={{ base: 12, lg: 8 }}>
                    <Stack gap="md">
                      <WeekCard
                        week={currentWeek}
                        onCloseWeek={handleCloseWeek}
                        onReopenWeek={handleReopenWeek}
                        isCurrentWeek={true}
                        budgetMode={monthlyBudgetMode as 'simple' | 'categorized'}
                        onExpenseUpdate={() => {
                          void refetchWeeks();
                          void refetchCategories();
                        }}
                      />
                      
                      {monthlyBudgetMode === 'categorized' && (
                        <CategoryProgress
                          categories={currentWeek.categories}
                          totalBudget={currentWeek.weeklyBudget}
                          totalSpent={currentWeek.spentAmount}
                        />
                      )}
                    </Stack>
                  </Grid.Col>
                  
                  {/* Columna lateral - Formulario y resumen (solo desktop) */}
                  <Grid.Col span={{ base: 12, lg: 4 }} className="hidden lg:block">
                    <Stack gap="md">
                      <ExpenseForm
                        categories={categories}
                        budgetMode={monthlyBudgetMode as 'simple' | 'categorized' | undefined}
                        onSuccess={() => {
                          void refetchWeeks();
                          void refetchCategories();
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

                {/* Modal del formulario de gastos para mobile */}
                <ExpenseForm
                  categories={categories}
                  budgetMode={monthlyBudgetMode as 'simple' | 'categorized' | undefined}
                  opened={expenseFormOpened}
                  onClose={() => setExpenseFormOpened(false)}
                  onSuccess={() => {
                    void refetchWeeks();
                    void refetchCategories();
                    setExpenseFormOpened(false);
                  }}
                />
              </>
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
              {weeks.map((week: any) => (
                <Grid.Col key={week.id} span={{ base: 12, md: 6, lg: 4 }}>
                  <WeekCard
                    week={week}
                    onCloseWeek={handleCloseWeek}
                    onReopenWeek={handleReopenWeek}
                    isCurrentWeek={week.weekNumber === currentWeekNumber}
                    budgetMode={monthlyBudgetMode as 'simple' | 'categorized'}
                    onExpenseUpdate={() => {
                      void refetchWeeks();
                      void refetchCategories();
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
                    void refetchWeeks();
                    void refetchUser();
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
                <Button 
                  variant="light"
                  color="blue"
                  loading={recoverMissingWeeks.isPending}
                  onClick={() => recoverMissingWeeks.mutate({
                    year: displayYear,
                    month: displayMonth,
                  })}
                >
                  Recuperar Semanas Faltantes
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


            <Divider />

            <Group justify="space-between" mt="md">
              <Group>
                <Button
                  variant="outline"
                  color="blue"
                  onClick={handleRefreshData}
                  loading={isRefreshing}
                  leftSection={<IconSettings size={16} />}
                >
                  Recargar Datos
                </Button>
                {user?.role === 'admin' && <Button
                  variant="outline"
                  color="red"
                  onClick={handleResetBudget}
                  loading={resetBudget.isPending}
                >
                  Reiniciar Todo
                </Button>
                }
              </Group>
              
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
          void refetchCategories();
          void refetchWeeks();
        }}
      />
    </Container>
    </>
  );
}
