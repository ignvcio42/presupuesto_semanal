'use client';

import { 
  Container, 
  Title, 
  Text, 
  Grid, 
  Group, 
  Badge,
  Stack,
  Button
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { WeekCard } from './week-card';
import { formatCurrency } from '~/lib/date-utils';
import type { WeekResponse } from '~/lib/validations';

interface WeeklySummaryProps {
  weeks: WeekResponse[];
  monthlyBudget: number;
  onViewDetails?: (weekId: string) => void;
  onViewExpenses?: (weekId: string) => void;
  onCloseWeek?: (weekId: string) => void;
  onAddExpense?: () => void;
}

export function WeeklySummary({ weeks, monthlyBudget, onViewDetails, onViewExpenses, onCloseWeek, onAddExpense }: WeeklySummaryProps) {
  const totalSpent = weeks.reduce((sum, week) => sum + week.spentAmount, 0);
  const remainingBudget = monthlyBudget - totalSpent;

  return (
    <Container size="xl" py="xl">
      <Stack gap="xl">
        {/* Header con presupuesto mensual */}
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={2} mb="xs">Presupuesto mensual restante</Title>
            <Text fw={700} size="2rem" c="blue">
              {formatCurrency(remainingBudget)}
            </Text>
            <Text size="sm" c="dimmed">
              de {formatCurrency(monthlyBudget)}
            </Text>
          </div>
          {onAddExpense && (
            <Button
              leftSection={<IconPlus size={16} />}
              onClick={onAddExpense}
              size="md"
            >
              Añadir Gasto
            </Button>
          )}
        </Group>

        {/* Título del resumen semanal */}
        <Title order={2} c="dark" fw={600}>
          Resumen Semanal
        </Title>

        {/* Cards de semanas */}
        <Grid>
          {weeks.map((week) => {
            // Determinar si es la semana actual basándose en la fecha
            const now = new Date();
            const isCurrentWeek = now >= week.startDate && now <= week.endDate;
            
            return (
              <Grid.Col key={week.id} span={{ base: 12, md: 6, lg: 4 }}>
                <WeekCard
                  week={week}
                  onViewDetails={onViewDetails}
                  onViewExpenses={onViewExpenses}
                  onCloseWeek={onCloseWeek}
                  isCurrentWeek={isCurrentWeek}
                  showCloseButton={true}
                />
              </Grid.Col>
            );
          })}
        </Grid>

        {/* Resumen adicional si hay semanas cerradas */}
        {weeks.some(w => w.isClosed) && (
          <Group justify="center" mt="xl">
            <Badge size="lg" variant="light" color="gray">
              {weeks.filter(w => w.isClosed).length} semana(s) cerrada(s)
            </Badge>
          </Group>
        )}
      </Stack>
    </Container>
  );
}
