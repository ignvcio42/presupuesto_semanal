'use client';

import { useState } from 'react';
import {
  Container,
  Title,
  Card,
  Text,
  Group,
  Stack,
  Badge,
  Grid,
  Progress,
  Table,
  Select,
  Button,
  Alert,
  Divider,
  Paper,
  ThemeIcon,
  SimpleGrid,
  Tabs,
  Flex,
  Box,
  RingProgress,
  Center,
  ActionIcon,
  Tooltip
} from '@mantine/core';
import {
  IconCalendar,
  IconTrendingUp,
  IconTrendingDown,
  IconChartBar,
  IconAlertCircle,
  IconTarget,
  IconCurrency,
  IconCalendarStats,
  IconChartLine,
  IconChartPie,
  IconClock,
  IconArrowUp,
  IconArrowDown,
  IconMinus,
  IconInfoCircle,
  IconRefresh
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatCurrency, getMonthName } from '~/lib/date-utils';
import type { MonthlyHistoryResponse } from '~/lib/validations';

interface MonthlyHistoryProps {
  year: number;
  month: number;
}

export function MonthlyHistory({ year, month }: MonthlyHistoryProps) {
  const { data: monthlyHistory, isLoading, refetch } = api.budget.getMonthlyHistory.useQuery({
    year,
    month,
  });

  const recalculateMutation = api.budget.recalculateMonthlyHistory.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  if (isLoading) {
    return (
      <Container size="xl" py="xl">
        <Text>Cargando historial...</Text>
      </Container>
    );
  }

  if (!monthlyHistory) {
    return (
      <Container size="xl" py="xl">
        <Alert icon={<IconAlertCircle size={16} />} title="Sin datos">
          No hay datos disponibles para {getMonthName(month)} {year}.
        </Alert>
      </Container>
    );
  }

  const totalBudget = monthlyHistory.totalBudget;
  const totalSpent = monthlyHistory.totalSpent;
  const totalRollover = monthlyHistory.totalRollover;
  const percentageUsed = (totalSpent / totalBudget) * 100;
  const daysInMonth = new Date(year, month, 0).getDate();

  // Análisis avanzados
  const weeklyBudget = totalBudget / 4.33;
  const weeks = monthlyHistory.weeks;
  
  // Análisis de tendencias semanales
  const weeklyAnalysis = weeks.map((week, index) => {
    const weeklyPercentage = (week.spentAmount / week.weeklyBudget) * 100;
    const previousWeek = index > 0 ? weeks[index - 1] : null;
    const change = previousWeek ? week.spentAmount - previousWeek.spentAmount : 0;
    
    // Calcular cambio porcentual de forma segura
    let changePercentage = 0;
    if (previousWeek && previousWeek.spentAmount > 0) {
      changePercentage = (change / previousWeek.spentAmount) * 100;
    } else if (previousWeek && previousWeek.spentAmount === 0 && week.spentAmount > 0) {
      changePercentage = 100; // De 0 a algo positivo = 100% de aumento
    } else if (previousWeek && previousWeek.spentAmount === 0 && week.spentAmount === 0) {
      changePercentage = 0; // De 0 a 0 = sin cambio
    }
    
    return {
      ...week,
      weeklyPercentage,
      change,
      changePercentage,
      isIncreasing: change > 0,
      isDecreasing: change < 0,
      isStable: change === 0,
    };
  });

  // Estadísticas de patrones
  const averageWeeklySpending = totalSpent / weeks.length;
  const highestSpendingWeek = weeklyAnalysis.reduce((max, week) => 
    week.spentAmount > max.spentAmount ? week : max
  );
  const lowestSpendingWeek = weeklyAnalysis.reduce((min, week) => 
    week.spentAmount < min.spentAmount ? week : min
  );

  // Análisis de consistencia
  const weeklyVariance = weeklyAnalysis.reduce((sum, week) => 
    sum + Math.pow(week.spentAmount - averageWeeklySpending, 2), 0
  ) / weeks.length;
  const consistencyScore = Math.max(0, 100 - (Math.sqrt(weeklyVariance) / averageWeeklySpending) * 100);

  // Predicción de fin de mes
  const currentWeek = weeklyAnalysis.find(w => !w.isClosed) || weeklyAnalysis[weeklyAnalysis.length - 1];
  const remainingWeeks = weeks.filter(w => !w.isClosed).length;
  const projectedMonthlySpending = totalSpent + (averageWeeklySpending * remainingWeeks);
  const projectedOverspend = projectedMonthlySpending - totalBudget;

  const getTrafficLightColor = (percentage: number) => {
    const remaining = 100 - percentage;
    if (remaining > 50) return 'green';
    if (remaining >= 20) return 'yellow';
    return 'red';
  };

  const getStatusIcon = (color: string) => {
    const iconMap = {
      green: <IconTrendingUp size={16} />,
      yellow: <IconTarget size={16} />,
      red: <IconTrendingDown size={16} />
    };
    return iconMap[color as keyof typeof iconMap] || <IconTarget size={16} />;
  };

  return (
    <Container size="xl" py="xl">
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={1}>Análisis Mensual</Title>
          <Text c="dimmed">
            {getMonthName(month)} {year} - Dashboard Analítico
          </Text>
        </div>
        <Group>
          <Tooltip label="Recalcular datos">
            <ActionIcon
              variant="light"
              color="blue"
              onClick={() => recalculateMutation.mutate({ year, month })}
              loading={recalculateMutation.isPending}
            >
              <IconRefresh size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>

      {/* Métricas Clave */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="xl">
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">Presupuesto Total</Text>
              <Text fw={700} size="xl">{formatCurrency(totalBudget)}</Text>
              <Text size="xs" c="dimmed">Presupuesto mensual</Text>
            </div>
            <ThemeIcon color="blue" size={38} radius="md">
              <IconCurrency size={20} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">Total Gastado</Text>
              <Text fw={700} size="xl" c={totalSpent > totalBudget ? 'red' : 'dark'}>
                {formatCurrency(totalSpent)}
              </Text>
              <Text size="xs" c="dimmed">
                {percentageUsed.toFixed(1)}% del presupuesto
              </Text>
            </div>
            <ThemeIcon color={totalSpent > totalBudget ? 'red' : 'green'} size={38} radius="md">
              <IconChartBar size={20} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">Promedio Semanal</Text>
              <Text fw={700} size="xl">
                {formatCurrency(averageWeeklySpending)}
              </Text>
              <Text size="xs" c="dimmed">
                {((averageWeeklySpending / weeklyBudget) * 100).toFixed(1)}% del presupuesto semanal
              </Text>
            </div>
            <ThemeIcon color="orange" size={38} radius="md">
              <IconCalendarStats size={20} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">Consistencia</Text>
              <Text fw={700} size="xl">
                {consistencyScore.toFixed(0)}%
              </Text>
              <Text size="xs" c="dimmed">
                {consistencyScore > 80 ? 'Muy consistente' : 
                 consistencyScore > 60 ? 'Consistente' : 
                 consistencyScore > 40 ? 'Variable' : 'Muy variable'}
              </Text>
            </div>
            <ThemeIcon color={consistencyScore > 80 ? 'green' : consistencyScore > 60 ? 'yellow' : 'red'} size={38} radius="md">
              <IconTarget size={20} />
            </ThemeIcon>
          </Group>
        </Card>
      </SimpleGrid>

      {/* Dashboard con Tabs */}
      <Tabs defaultValue="weekly-trends" mb="xl">
        <Tabs.List>
          <Tabs.Tab 
            value="weekly-trends" 
            leftSection={<IconChartLine size={16} />}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Tendencias Semanales</span>
            <span className="sm:hidden">Tendencias</span>
          </Tabs.Tab>
          <Tabs.Tab 
            value="categories" 
            leftSection={<IconChartPie size={16} />}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Análisis por Categorías</span>
            <span className="sm:hidden">Categorías</span>
          </Tabs.Tab>
          <Tabs.Tab 
            value="predictions" 
            leftSection={<IconTarget size={16} />}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Predicciones</span>
            <span className="sm:hidden">Predicciones</span>
          </Tabs.Tab>
          <Tabs.Tab 
            value="insights" 
            leftSection={<IconInfoCircle size={16} />}
            className="text-xs sm:text-sm"
          >
            <span className="hidden sm:inline">Insights</span>
            <span className="sm:hidden">Insights</span>
          </Tabs.Tab>
        </Tabs.List>

        {/* Tendencias Semanales */}
        <Tabs.Panel value="weekly-trends" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 8 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={3} mb="md">Evolución Semanal del Gasto</Title>
                <Stack gap="md">
                  {weeklyAnalysis.map((week, index) => (
                    <Paper key={week.id} p="md" withBorder>
                      <Group justify="space-between" mb="sm">
                        <div>
                          <Text fw={500}>Semana {week.weekNumber}</Text>
                          <Text size="sm" c="dimmed">
                            {formatCurrency(week.spentAmount)} de {formatCurrency(week.weeklyBudget)}
                          </Text>
                        </div>
                        <Group>
                          {index > 0 && (
                            <Badge 
                              variant="light" 
                              color={week.isIncreasing ? 'red' : week.isDecreasing ? 'green' : 'gray'}
                              leftSection={
                                week.isIncreasing ? <IconArrowUp size={12} /> :
                                week.isDecreasing ? <IconArrowDown size={12} /> :
                                <IconMinus size={12} />
                              }
                            >
                              {week.changePercentage > 0 ? '+' : ''}
                              {week.changePercentage === 100 && weeks[index - 1]?.spentAmount === 0 
                                ? 'Nuevo' 
                                : `${week.changePercentage.toFixed(1)}%`
                              }
                            </Badge>
                          )}
                          <Badge 
                            color={getTrafficLightColor(week.weeklyPercentage)} 
                            variant="light"
                          >
                            {week.weeklyPercentage.toFixed(1)}%
                          </Badge>
                        </Group>
                      </Group>
                      
                      <Progress
                        value={Math.min(week.weeklyPercentage, 100)}
                        color={getTrafficLightColor(week.weeklyPercentage)}
                        size="md"
                        radius="xl"
                        mb="sm"
                      />
                      
                      <Group justify="space-between">
                        <Text size="xs" c="dimmed">
                          {week.isClosed ? 'Semana cerrada' : 'Semana activa'}
                        </Text>
                        {week.rolloverAmount !== 0 && (
                          <Text 
                            size="xs" 
                            fw={500}
                            c={week.rolloverAmount > 0 ? 'green' : 'red'}
                          >
                            Rollover: {week.rolloverAmount > 0 ? '+' : ''}{formatCurrency(week.rolloverAmount)}
                          </Text>
                        )}
                      </Group>
                    </Paper>
                  ))}
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 4 }}>
              <Stack gap="md">
                {/* Semana con Mayor Gasto */}
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Title order={4} mb="md">Mayor Gasto</Title>
                  <Group>
                    <ThemeIcon color="red" size={48} radius="md">
                      <IconTrendingUp size={24} />
                    </ThemeIcon>
                    <div>
                      <Text fw={500}>Semana {highestSpendingWeek.weekNumber}</Text>
                      <Text size="lg" fw={700}>
                        {formatCurrency(highestSpendingWeek.spentAmount)}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {((highestSpendingWeek.spentAmount / weeklyBudget) * 100).toFixed(1)}% del presupuesto semanal
                      </Text>
                    </div>
                  </Group>
                </Card>

                {/* Semana con Menor Gasto */}
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Title order={4} mb="md">Menor Gasto</Title>
                  <Group>
                    <ThemeIcon color="green" size={48} radius="md">
                      <IconTrendingDown size={24} />
                    </ThemeIcon>
                    <div>
                      <Text fw={500}>Semana {lowestSpendingWeek.weekNumber}</Text>
                      <Text size="lg" fw={700}>
                        {formatCurrency(lowestSpendingWeek.spentAmount)}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {((lowestSpendingWeek.spentAmount / weeklyBudget) * 100).toFixed(1)}% del presupuesto semanal
                      </Text>
                    </div>
                  </Group>
                </Card>

                {/* Consistencia */}
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Title order={4} mb="md">Consistencia</Title>
                  <Center>
                    <RingProgress
                      size={120}
                      thickness={12}
                      sections={[
                        { value: consistencyScore, color: consistencyScore > 80 ? 'green' : consistencyScore > 60 ? 'yellow' : 'red' }
                      ]}
                      label={
                        <Center>
                          <Text size="lg" fw={700}>
                            {consistencyScore.toFixed(0)}%
                          </Text>
                        </Center>
                      }
                    />
                  </Center>
                  <Text ta="center" size="sm" c="dimmed" mt="sm">
                    {consistencyScore > 80 ? 'Muy consistente' : 
                     consistencyScore > 60 ? 'Consistente' : 
                     consistencyScore > 40 ? 'Variable' : 'Muy variable'}
                  </Text>
                </Card>
              </Stack>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        {/* Análisis por Categorías */}
        <Tabs.Panel value="categories" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={3} mb="md">Top Categorías por Gasto</Title>
                <Stack gap="md">
                  {monthlyHistory.topCategories.map((category, index) => (
                    <div key={category.categoryName}>
                      <Group justify="space-between" mb="xs">
                        <Group>
                          <Badge variant="light" size="sm">
                            #{index + 1}
                          </Badge>
                          <Text fw={500}>{category.categoryName}</Text>
                        </Group>
                        <Text size="sm" c="dimmed">
                          {category.percentage.toFixed(1)}%
                        </Text>
                      </Group>
                      <Progress
                        value={category.percentage}
                        color="blue"
                        size="md"
                        radius="xl"
                      />
                      <Group justify="space-between" mt="xs">
                        <Text size="xs" c="dimmed">
                          {formatCurrency(category.totalSpent)}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {((category.totalSpent / totalSpent) * 100).toFixed(1)}% del total
                        </Text>
                      </Group>
                    </div>
                  ))}
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={3} mb="md">Distribución por Categorías</Title>
                <Center>
                  <RingProgress
                    size={200}
                    thickness={20}
                    sections={monthlyHistory.topCategories.map((category, index) => ({
                      value: category.percentage,
                      color: (['blue', 'green', 'orange', 'red', 'purple', 'cyan'][index % 6] as any)
                    }))}
                    label={
                      <Center>
                        <Text size="lg" fw={700}>
                          {monthlyHistory.topCategories.length}
                        </Text>
                        <Text size="sm" c="dimmed">
                          categorías
                        </Text>
                      </Center>
                    }
                  />
                </Center>
                <Stack gap="xs" mt="md">
                  {monthlyHistory.topCategories.map((category, index) => (
                    <Group key={category.categoryName} justify="space-between">
                      <Group>
                        <Box
                          w={12}
                          h={12}
                          style={{
                            backgroundColor: ['blue', 'green', 'orange', 'red', 'purple', 'cyan'][index % 6]
                          }}
                        />
                        <Text size="sm">{category.categoryName}</Text>
                      </Group>
                      <Text size="sm" fw={500}>
                        {formatCurrency(category.totalSpent)}
                      </Text>
                    </Group>
                  ))}
                </Stack>
              </Card>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        {/* Predicciones */}
        <Tabs.Panel value="predictions" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={3} mb="md">Predicción de Fin de Mes</Title>
                <Stack gap="md">
                  <Group justify="space-between">
                    <Text>Gasto actual:</Text>
                    <Text fw={500}>{formatCurrency(totalSpent)}</Text>
                  </Group>
                  <Group justify="space-between">
                    <Text>Proyección mensual:</Text>
                    <Text fw={500} c={projectedMonthlySpending > totalBudget ? 'red' : 'green'}>
                      {formatCurrency(projectedMonthlySpending)}
                    </Text>
                  </Group>
                  <Group justify="space-between">
                    <Text>Diferencia proyectada:</Text>
                    <Text 
                      fw={500} 
                      c={projectedOverspend > 0 ? 'red' : projectedOverspend < 0 ? 'green' : 'gray'}
                    >
                      {projectedOverspend > 0 ? '+' : ''}{formatCurrency(projectedOverspend)}
                    </Text>
                  </Group>
                  <Divider />
                  <Alert 
                    color={projectedOverspend > 0 ? 'red' : projectedOverspend < 0 ? 'green' : 'blue'}
                    variant="light"
                  >
                    <Text size="sm">
                      {projectedOverspend > 0 
                        ? `⚠️ Proyección: Te pasarás por ${formatCurrency(projectedOverspend)}`
                        : projectedOverspend < 0
                        ? `✅ Proyección: Te quedarás con ${formatCurrency(Math.abs(projectedOverspend))}`
                        : `🎯 Proyección: Gastarás exactamente el presupuesto`
                      }
                    </Text>
                  </Alert>
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={3} mb="md">Recomendaciones</Title>
                <Stack gap="md">
                  {projectedOverspend > 0 && (
                    <Alert color="red" variant="light">
                      <Text size="sm" fw={500}>Reducir gastos</Text>
                      <Text size="xs">
                        Para mantenerte dentro del presupuesto, reduce {formatCurrency(projectedOverspend / remainingWeeks)} por semana.
                      </Text>
                    </Alert>
                  )}
                  
                  {consistencyScore < 60 && (
                    <Alert color="yellow" variant="light">
                      <Text size="sm" fw={500}>Mejorar consistencia</Text>
                      <Text size="xs">
                        Tu gasto es muy variable. Intenta mantener un ritmo más constante.
                      </Text>
                    </Alert>
                  )}

                  {highestSpendingWeek.spentAmount > weeklyBudget * 1.2 && (
                    <Alert color="orange" variant="light">
                      <Text size="sm" fw={500}>Controlar picos de gasto</Text>
                      <Text size="xs">
                        La semana {highestSpendingWeek.weekNumber} gastaste {((highestSpendingWeek.spentAmount / weeklyBudget) * 100).toFixed(1)}% del presupuesto semanal.
                      </Text>
                    </Alert>
                  )}

                  {totalSpent < totalBudget * 0.5 && (
                    <Alert color="green" variant="light">
                      <Text size="sm" fw={500}>Buen control</Text>
                      <Text size="xs">
                        Vas muy bien con el presupuesto. Mantén este ritmo.
                      </Text>
                    </Alert>
                  )}
                </Stack>
              </Card>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>

        {/* Insights */}
        <Tabs.Panel value="insights" pt="md">
          <Grid>
            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={3} mb="md">Patrones de Gasto</Title>
                <Stack gap="md">
                  <Paper p="md" withBorder>
                    <Group justify="space-between" mb="sm">
                      <Text fw={500}>Tendencia semanal</Text>
                      <Badge 
                        color={weeklyAnalysis[weeklyAnalysis.length - 1]?.isIncreasing ? 'red' : 'green'}
                        variant="light"
                      >
                        {weeklyAnalysis[weeklyAnalysis.length - 1]?.isIncreasing ? 'Aumentando' : 'Disminuyendo'}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {weeklyAnalysis[weeklyAnalysis.length - 1]?.isIncreasing 
                        ? 'Los gastos han aumentado en las últimas semanas'
                        : 'Los gastos han disminuido en las últimas semanas'
                      }
                    </Text>
                  </Paper>

                  <Paper p="md" withBorder>
                    <Group justify="space-between" mb="sm">
                      <Text fw={500}>Eficiencia del presupuesto</Text>
                      <Badge 
                        color={percentageUsed > 100 ? 'red' : percentageUsed > 80 ? 'yellow' : 'green'}
                        variant="light"
                      >
                        {percentageUsed > 100 ? 'Excedido' : percentageUsed > 80 ? 'Alto' : 'Óptimo'}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {percentageUsed > 100 
                        ? 'Has excedido el presupuesto mensual'
                        : percentageUsed > 80
                        ? 'Estás cerca del límite del presupuesto'
                        : 'Tienes buen margen en el presupuesto'
                      }
                    </Text>
                  </Paper>

                  <Paper p="md" withBorder>
                    <Group justify="space-between" mb="sm">
                      <Text fw={500}>Consistencia</Text>
                      <Badge 
                        color={consistencyScore > 80 ? 'green' : consistencyScore > 60 ? 'yellow' : 'red'}
                        variant="light"
                      >
                        {consistencyScore > 80 ? 'Excelente' : consistencyScore > 60 ? 'Buena' : 'Mejorable'}
                      </Badge>
                    </Group>
                    <Text size="sm" c="dimmed">
                      {consistencyScore > 80 
                        ? 'Mantienes un gasto muy consistente semana a semana'
                        : consistencyScore > 60
                        ? 'Tu gasto es relativamente consistente'
                        : 'Tu gasto varía mucho entre semanas'
                      }
                    </Text>
                  </Paper>
                </Stack>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 6 }}>
              <Card shadow="sm" padding="lg" radius="md" withBorder>
                <Title order={3} mb="md">Resumen Ejecutivo</Title>
                <Stack gap="md">
                  <div>
                    <Text size="sm" c="dimmed">Mes actual</Text>
                    <Text fw={500}>{getMonthName(month)} {year}</Text>
                  </div>
                  
                  <div>
                    <Text size="sm" c="dimmed">Estado general</Text>
                    <Text fw={500} c={percentageUsed > 100 ? 'red' : percentageUsed > 80 ? 'yellow' : 'green'}>
                      {percentageUsed > 100 ? 'Presupuesto excedido' : 
                       percentageUsed > 80 ? 'Cerca del límite' : 
                       'Buen control'}
                    </Text>
                  </div>

                  <div>
                    <Text size="sm" c="dimmed">Categoría principal</Text>
                    <Text fw={500}>
                      {monthlyHistory.topCategories[0]?.categoryName || 'Sin datos'}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {monthlyHistory.topCategories[0]?.percentage.toFixed(1)}% del total
                    </Text>
                  </div>

                  <div>
                    <Text size="sm" c="dimmed">Semana más costosa</Text>
                    <Text fw={500}>Semana {highestSpendingWeek.weekNumber}</Text>
                    <Text size="xs" c="dimmed">
                      {formatCurrency(highestSpendingWeek.spentAmount)}
                    </Text>
                  </div>

                  <div>
                    <Text size="sm" c="dimmed">Promedio diario</Text>
                    <Text fw={500}>{formatCurrency(monthlyHistory.averageDailySpending)}</Text>
                    <Text size="xs" c="dimmed">
                      {((monthlyHistory.averageDailySpending / (totalBudget / daysInMonth)) * 100).toFixed(1)}% del presupuesto diario
                    </Text>
                  </div>
                </Stack>
              </Card>
            </Grid.Col>
          </Grid>
        </Tabs.Panel>
      </Tabs>
    </Container>
  );
}
