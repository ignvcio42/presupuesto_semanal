'use client';

import { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  Group,
  Badge,
  Button,
  Grid,
  Paper,
  ThemeIcon,
  Alert,
  Select,
  ActionIcon
} from '@mantine/core';
import { 
  IconCalendar, 
  IconTrendingUp, 
  IconTrendingDown,
  IconChartBar,
  IconArrowLeft,
  IconArrowRight
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatCurrency, getMonthName } from '~/lib/date-utils';

interface MonthSelectorProps {
  currentYear: number;
  currentMonth: number;
  onMonthSelect: (year: number, month: number) => void;
  onBackToCurrent: () => void;
}

export function MonthSelector({ 
  currentYear, 
  currentMonth, 
  onMonthSelect, 
  onBackToCurrent 
}: MonthSelectorProps) {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);

  const { data: allHistory } = api.budget.getAllMonthlyHistory.useQuery();

  // Generar opciones de años (últimos 3 años)
  const currentYearNum = new Date().getFullYear();
  const yearOptions = Array.from({ length: 3 }, (_, i) => ({
    value: (currentYearNum - i).toString(),
    label: (currentYearNum - i).toString(),
  }));

  // Generar opciones de meses
  const monthOptions = Array.from({ length: 12 }, (_, i) => ({
    value: (i + 1).toString(),
    label: getMonthName(i + 1),
  }));

  const handleMonthSelect = () => {
    onMonthSelect(selectedYear, selectedMonth);
  };

  const getStatusColor = (totalSpent: number, totalBudget: number) => {
    const percentage = (totalSpent / totalBudget) * 100;
    if (percentage <= 80) return 'green';
    if (percentage <= 100) return 'yellow';
    return 'red';
  };

  const getStatusIcon = (totalSpent: number, totalBudget: number) => {
    const percentage = (totalSpent / totalBudget) * 100;
    if (percentage <= 100) return <IconTrendingUp size={16} />;
    return <IconTrendingDown size={16} />;
  };

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header */}
        <Group justify="space-between">
          <div>
            <Title order={1}>Historial de Meses</Title>
            <Text c="dimmed">
              Selecciona un mes para ver su historial o continúa con el mes actual
            </Text>
          </div>
          
          <Button
            variant="light"
            leftSection={<IconArrowLeft size={16} />}
            onClick={onBackToCurrent}
          >
            Volver al Mes Actual
          </Button>
        </Group>

        {/* Month Selector */}
        <Card shadow="sm" padding="lg" radius="md" withBorder>
          <Title order={3} mb="md">Seleccionar Mes</Title>
          <Group>
            <Select
              label="Año"
              data={yearOptions}
              value={selectedYear.toString()}
              onChange={(value) => setSelectedYear(parseInt(value || '2024'))}
            />
            <Select
              label="Mes"
              data={monthOptions}
              value={selectedMonth.toString()}
              onChange={(value) => setSelectedMonth(parseInt(value || '1'))}
            />
            <Button
              onClick={handleMonthSelect}
              style={{ alignSelf: 'flex-end' }}
            >
              Ver Historial
            </Button>
          </Group>
        </Card>

        {/* History List */}
        {allHistory && allHistory.length > 0 ? (
          <Grid>
            {allHistory.map((history) => (
              <Grid.Col key={history.id} span={{ base: 12, md: 6, lg: 4 }}>
                <Card shadow="sm" padding="lg" radius="md" withBorder>
                  <Group justify="space-between" mb="md">
                    <div>
                      <Title order={4}>
                        {getMonthName(history.month)} {history.year}
                      </Title>
                      <Text size="sm" c="dimmed">
                        {formatCurrency(history.totalSpent)} de {formatCurrency(history.totalBudget)}
                      </Text>
                    </div>
                    
                    <Badge
                      color={getStatusColor(history.totalSpent, history.totalBudget)}
                      variant="light"
                      leftSection={getStatusIcon(history.totalSpent, history.totalBudget)}
                    >
                      {((history.totalSpent / history.totalBudget) * 100).toFixed(1)}%
                    </Badge>
                  </Group>

                  <Stack gap="xs" mb="md">
                    <Group justify="space-between">
                      <Text size="sm">Presupuesto:</Text>
                      <Text size="sm" fw={500}>
                        {formatCurrency(history.totalBudget)}
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm">Gastado:</Text>
                      <Text size="sm" fw={500}>
                        {formatCurrency(history.totalSpent)}
                      </Text>
                    </Group>
                    <Group justify="space-between">
                      <Text size="sm">Rollover:</Text>
                      <Text 
                        size="sm" 
                        fw={500}
                        c={history.totalRollover > 0 ? 'green' : history.totalRollover < 0 ? 'red' : 'dark'}
                      >
                        {formatCurrency(Math.abs(history.totalRollover))}
                      </Text>
                    </Group>
                  </Stack>

                  <Button
                    variant="light"
                    fullWidth
                    onClick={() => onMonthSelect(history.year, history.month)}
                  >
                    Ver Detalles
                  </Button>
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        ) : (
          <Alert icon={<IconChartBar size={16} />} title="Sin historial">
            <Text>
              Aún no tienes meses completados en tu historial. 
              Comienza a usar la aplicación para generar tu primer historial mensual.
            </Text>
          </Alert>
        )}

        {/* Current Month Card */}
        <Card shadow="sm" padding="lg" radius="md" withBorder style={{ borderColor: '#228be6' }}>
          <Group justify="space-between" mb="md">
            <div>
              <Title order={4} c="blue">
                {getMonthName(currentMonth)} {currentYear} (Actual)
              </Title>
              <Text size="sm" c="dimmed">
                Mes en curso - Continúa gestionando tu presupuesto
              </Text>
            </div>
            
            <Badge color="blue" variant="light">
              En Progreso
            </Badge>
          </Group>

          <Button
            variant="filled"
            color="blue"
            fullWidth
            onClick={onBackToCurrent}
          >
            Continuar con el Mes Actual
          </Button>
        </Card>
      </Stack>
    </Container>
  );
}
