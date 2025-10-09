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
  SimpleGrid
} from '@mantine/core';
import {
  IconCalendar,
  IconTrendingUp,
  IconTrendingDown,
  IconChartBar,
  IconAlertCircle,
  IconTarget,
  IconCurrency,
  IconCalendarStats
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatCurrency, getMonthName } from '~/lib/date-utils';
import type { MonthlyHistoryResponse } from '~/lib/validations';

interface MonthlyHistoryProps {
  year: number;
  month: number;
}

export function MonthlyHistory({ year, month }: MonthlyHistoryProps) {
  const { data: monthlyHistory, isLoading } = api.budget.getMonthlyHistory.useQuery({
    year,
    month,
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
          <Title order={1}>Historial Mensual</Title>
          <Text c="dimmed">
            {getMonthName(month)} {year}
          </Text>
        </div>
      </Group>

      {/* Resumen General */}
      <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} mb="xl">
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">Presupuesto Total</Text>
              <Text fw={700} size="xl">{formatCurrency(totalBudget)}</Text>
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
            </div>
            <ThemeIcon color={totalSpent > totalBudget ? 'red' : 'green'} size={38} radius="md">
              <IconChartBar size={20} />
            </ThemeIcon>
          </Group>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">Rollover Total</Text>
              <Text 
                fw={700} 
                size="xl" 
                c={totalRollover > 0 ? 'green' : totalRollover < 0 ? 'red' : 'dark'}
              >
                {formatCurrency(Math.abs(totalRollover))}
              </Text>
            </div>
            <ThemeIcon 
              color={totalRollover > 0 ? 'green' : totalRollover < 0 ? 'red' : 'gray'} 
              size={38} 
              radius="md"
            >
              {totalRollover > 0 ? <IconTrendingUp size={20} /> : <IconTrendingDown size={20} />}
            </ThemeIcon>
          </Group>
        </Card>

        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Group justify="space-between">
            <div>
              <Text size="sm" c="dimmed">Promedio Diario</Text>
              <Text fw={700} size="xl">
                {formatCurrency(monthlyHistory.averageDailySpending)}
              </Text>
            </div>
            <ThemeIcon color="orange" size={38} radius="md">
              <IconCalendarStats size={20} />
            </ThemeIcon>
          </Group>
        </Card>
      </SimpleGrid>

      <Grid>
        {/* Top Categorías */}
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
                  </Group>
                </div>
              ))}
            </Stack>
          </Card>
        </Grid.Col>

        {/* Estadísticas por Semana */}
        <Grid.Col span={{ base: 12, md: 6 }}>
          <Card shadow="sm" padding="lg" radius="md" withBorder>
            <Title order={3} mb="md">Estadísticas por Semana</Title>
            <Table>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Semana</Table.Th>
                  <Table.Th>Gastado</Table.Th>
                  <Table.Th>Estado</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {monthlyHistory.weeklyStats.map((week) => {
                  const color = getTrafficLightColor((week.spent / (totalBudget / 4.33)) * 100);
                  return (
                    <Table.Tr key={week.weekNumber}>
                      <Table.Td>
                        <Text fw={500}>Semana {week.weekNumber}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Text>{formatCurrency(week.spent)}</Text>
                      </Table.Td>
                      <Table.Td>
                        <Badge 
                          color={color} 
                          variant="light"
                          leftSection={getStatusIcon(color)}
                        >
                          {color === 'green' ? 'Bien' : color === 'yellow' ? 'Cuidado' : 'Alerta'}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Card>
        </Grid.Col>
      </Grid>

      {/* Progreso General del Mes */}
      <Card shadow="sm" padding="lg" radius="md" withBorder mt="xl">
        <Title order={3} mb="md">Progreso General del Mes</Title>
        <Stack gap="md">
          <Group justify="space-between">
            <Text fw={500}>Uso del Presupuesto</Text>
            <Badge 
              color={getTrafficLightColor(percentageUsed)} 
              variant="light"
              size="lg"
            >
              {percentageUsed.toFixed(1)}%
            </Badge>
          </Group>
          
          <Progress
            value={Math.min(percentageUsed, 100)}
            color={getTrafficLightColor(percentageUsed)}
            size="xl"
            radius="xl"
          />
          <Text size="sm" ta="center" c="dimmed">
            {percentageUsed.toFixed(1)}%
          </Text>
          
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {formatCurrency(totalSpent)} de {formatCurrency(totalBudget)}
            </Text>
            <Text size="sm" c="dimmed">
              {totalSpent > totalBudget 
                ? `Te pasaste por ${formatCurrency(totalSpent - totalBudget)}`
                : `Te quedan ${formatCurrency(totalBudget - totalSpent)}`
              }
            </Text>
          </Group>
        </Stack>
      </Card>

      {/* Detalles de Semanas */}
      <Card shadow="sm" padding="lg" radius="md" withBorder mt="xl">
        <Title order={3} mb="md">Detalles por Semana</Title>
        <Stack gap="md">
          {monthlyHistory.weeks.map((week) => (
            <Paper key={week.id} p="md" withBorder>
              <Group justify="space-between" mb="md">
                <div>
                  <Text fw={500}>Semana {week.weekNumber}</Text>
                  <Text size="sm" c="dimmed">
                    {formatCurrency(week.spentAmount)} de {formatCurrency(week.weeklyBudget)}
                  </Text>
                </div>
                <Badge 
                  color={getTrafficLightColor((week.spentAmount / week.weeklyBudget) * 100)} 
                  variant="light"
                >
                  {((week.spentAmount / week.weeklyBudget) * 100).toFixed(1)}%
                </Badge>
              </Group>
              
              <Progress
                value={Math.min((week.spentAmount / week.weeklyBudget) * 100, 100)}
                color={getTrafficLightColor((week.spentAmount / week.weeklyBudget) * 100)}
                size="md"
                radius="xl"
              />
              
              {week.rolloverAmount !== 0 && (
                <Group mt="xs">
                  <Text size="sm" c="dimmed">Rollover:</Text>
                  <Text 
                    size="sm" 
                    fw={500}
                    c={week.rolloverAmount > 0 ? 'green' : 'red'}
                  >
                    {week.rolloverAmount > 0 ? '+' : ''}{formatCurrency(week.rolloverAmount)}
                  </Text>
                </Group>
              )}
            </Paper>
          ))}
        </Stack>
      </Card>
    </Container>
  );
}
