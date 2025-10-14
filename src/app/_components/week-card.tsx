'use client';

import { useState } from 'react';
import { Card, Progress, Badge, Group, Text, Stack, Button, ActionIcon, Collapse, Modal } from '@mantine/core';
import { IconCalendar, IconTrendingUp, IconTrendingDown, IconX, IconChevronDown, IconChevronUp, IconLockOpen } from '@tabler/icons-react';
import { formatCurrency, formatDate, getTrafficLightColor } from '~/lib/date-utils';
import type { WeekResponse } from '~/lib/validations';
import { WeekExpensesDetails } from './week-expenses-details';

interface WeekCardProps {
  week: WeekResponse;
  onCloseWeek?: (weekId: string) => void;
  onReopenWeek?: (weekId: string) => void;
  onViewDetails?: (weekId: string) => void;
  isCurrentWeek?: boolean;
  budgetMode?: 'simple' | 'categorized';
  onExpenseUpdate?: () => void; // Callback para actualizar el dashboard
}

export function WeekCard({ week, onCloseWeek, onReopenWeek, onViewDetails, isCurrentWeek, budgetMode, onExpenseUpdate }: WeekCardProps) {
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [detailsModalOpened, setDetailsModalOpened] = useState(false);
  const [reopenModalOpened, setReopenModalOpened] = useState(false);
  const percentageRemaining = 100 - week.percentageUsed;
  const trafficLightColor = getTrafficLightColor(week.percentageUsed);
  
  const rolloverAmount = week.weeklyBudget - week.spentAmount;
  const rolloverText = rolloverAmount > 0 
    ? `+${formatCurrency(rolloverAmount)}` 
    : formatCurrency(rolloverAmount);
  
  const handleReopenConfirm = () => {
    setReopenModalOpened(false);
    onReopenWeek?.(week.id);
  };
  
  const getTrafficLightBadge = () => {
    const colorMap = {
      green: 'green',
      yellow: 'yellow', 
      red: 'red'
    };
    
    return (
      <Badge color={colorMap[trafficLightColor]} variant="light">
        {percentageRemaining.toFixed(1)}% restante
      </Badge>
    );
  };

  const getProgressColor = () => {
    const colorMap = {
      green: 'green',
      yellow: 'yellow',
      red: 'red'
    };
    return colorMap[trafficLightColor];
  };

  return (
    <Card 
      shadow="sm" 
      padding="lg" 
      radius="md" 
      withBorder
      style={{
        opacity: week.isClosed ? 0.7 : 1,
        borderColor: week.isClosed ? '#868e96' : undefined,
        backgroundColor: week.isClosed ? '#f8f9fa' : undefined,
      }}
    >
      <Group justify="space-between" mb="xs">
        <Group>
          <IconCalendar size={16} />
          <Text fw={500}>Semana {week.weekNumber}</Text>
          {isCurrentWeek && (
            <Badge color="blue" variant="light" size="sm">
              Actual
            </Badge>
          )}
          {week.isClosed && (
            <Badge color="gray" variant="filled" size="sm">
              Cerrada
            </Badge>
          )}
        </Group>
        {getTrafficLightBadge()}
      </Group>

      <Text size="sm" c="dimmed" mb="md">
        {formatDate(week.startDate)} - {formatDate(week.endDate)}
      </Text>

      <Stack gap="xs" mb="md">
        <Group justify="space-between">
          <Text size="sm">Presupuesto semanal:</Text>
          <Text size="sm" fw={500}>
            {formatCurrency(week.weeklyBudget)}
          </Text>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm">Gastado:</Text>
          <Text size="sm" fw={500} c={week.spentAmount > week.weeklyBudget ? 'red' : 'dark'}>
            {formatCurrency(week.spentAmount)}
          </Text>
        </Group>

        <Group justify="space-between">
          <Text size="sm">Restante:</Text>
          <Text 
            size="sm" 
            fw={500} 
            c={week.weeklyBudget - week.spentAmount < 0 ? 'red' : 'green'}
          >
            {formatCurrency(week.weeklyBudget - week.spentAmount)}
          </Text>
        </Group>

        {week.isClosed && (
          <Group justify="space-between">
            <Text size="sm">Rollover transferido:</Text>
            <Group gap="xs">
              {week.weeklyBudget - week.spentAmount > 0 ? (
                <IconTrendingUp size={16} color="green" />
              ) : week.weeklyBudget - week.spentAmount < 0 ? (
                <IconTrendingDown size={16} color="red" />
              ) : null}
              <Text 
                size="sm" 
                fw={500} 
                c={week.weeklyBudget - week.spentAmount > 0 ? 'green' : week.weeklyBudget - week.spentAmount < 0 ? 'red' : 'gray'}
              >
                {week.weeklyBudget - week.spentAmount > 0 ? '+' : ''}{formatCurrency(week.weeklyBudget - week.spentAmount)}
              </Text>
            </Group>
          </Group>
        )}
        
        {!week.isClosed && (
          <Group justify="space-between">
            <Text size="sm">Rollover proyectado:</Text>
            <Group gap="xs">
              {week.weeklyBudget - week.spentAmount > 0 ? (
                <IconTrendingUp size={16} color="green" />
              ) : week.weeklyBudget - week.spentAmount < 0 ? (
                <IconTrendingDown size={16} color="red" />
              ) : null}
              <Text 
                size="sm" 
                fw={500} 
                c={week.weeklyBudget - week.spentAmount > 0 ? 'green' : week.weeklyBudget - week.spentAmount < 0 ? 'red' : 'dark'}
              >
                {week.weeklyBudget - week.spentAmount > 0 ? '+' : ''}{formatCurrency(week.weeklyBudget - week.spentAmount)}
              </Text>
            </Group>
          </Group>
        )}
      </Stack>

      <div>
        <Progress
          value={week.percentageUsed}
          color={getProgressColor()}
          size="lg"
          radius="xl"
          mb="md"
        />
        <Text size="sm" ta="center" mt="xs">
          {week.percentageUsed.toFixed(1)}%
        </Text>
      </div>

      {week.categories && week.categories.length > 0 && (
        <Stack gap="xs" mb="md">
          <Group justify="space-between" align="center">
            <Text size="sm" fw={500}>Por categorías:</Text>
            {week.categories.length > 3 && (
              <Button
                variant="subtle"
                size="xs"
                rightSection={categoriesExpanded ? <IconChevronUp size={12} /> : <IconChevronDown size={12} />}
                onClick={() => setCategoriesExpanded(!categoriesExpanded)}
              >
                {categoriesExpanded ? 'Contraer' : 'Expandir'}
              </Button>
            )}
          </Group>
          
          {week.categories
            .sort((a, b) => (b.allocatedAmount - b.spentAmount) - (a.allocatedAmount - a.spentAmount))
            .slice(0, 3)
            .map((category) => (
            <Group key={category.id} justify="space-between">
              <Text size="xs" c="dimmed">{category.name}:</Text>
              <Text size="xs">
                {formatCurrency(category.spentAmount)} / {formatCurrency(category.allocatedAmount)}
              </Text>
            </Group>
          ))}
          
          <Collapse in={categoriesExpanded}>
            <Stack gap="xs" mt="xs">
              {week.categories
                .sort((a, b) => (b.allocatedAmount - b.spentAmount) - (a.allocatedAmount - a.spentAmount))
                .slice(3)
                .map((category) => (
                <Group key={category.id} justify="space-between">
                  <Text size="xs" c="dimmed">{category.name}:</Text>
                  <Text size="xs">
                    {formatCurrency(category.spentAmount)} / {formatCurrency(category.allocatedAmount)}
                  </Text>
                </Group>
              ))}
            </Stack>
          </Collapse>
          
          {!categoriesExpanded && week.categories.length > 3 && (
            <Text size="xs" c="dimmed">
              +{week.categories.length - 3} categorías más
            </Text>
          )}
        </Stack>
      )}

      <Group justify="space-between">
        <Button
          variant="light"
          size="xs"
          onClick={() => setDetailsModalOpened(true)}
        >
          Ver detalles
        </Button>
        
        {!week.isClosed && (
          <Button
            variant="filled"
            size="xs"
            color="orange"
            onClick={() => onCloseWeek?.(week.id)}
          >
            Cerrar semana
          </Button>
        )}
        
        {week.isClosed && (
          <Button
            variant="outline"
            size="xs"
            color="orange"
            leftSection={<IconLockOpen size={14} />}
            onClick={() => setReopenModalOpened(true)}
          >
            Reabrir semana
          </Button>
        )}
      </Group>

      <WeekExpensesDetails
        opened={detailsModalOpened}
        onClose={() => setDetailsModalOpened(false)}
        weekId={week.id}
        weekNumber={week.weekNumber}
        startDate={week.startDate}
        endDate={week.endDate}
        budgetMode={budgetMode}
        onExpenseUpdate={onExpenseUpdate}
      />

      <Modal
        opened={reopenModalOpened}
        onClose={() => setReopenModalOpened(false)}
        title="⚠️ Reabrir semana cerrada"
        size="md"
      >
        <Stack gap="md">
          <Text size="sm">
            ¿Estás seguro de que quieres reabrir la <strong>Semana {week.weekNumber}</strong>?
          </Text>
          <Text size="sm" c="orange" fw={500}>
            ⚠️ Advertencias importantes:
          </Text>
          <Stack gap="xs" pl="md">
            <Text size="sm">
              • El rollover de <strong>{rolloverText}</strong> que se transfirió a las siguientes semanas será revertido
            </Text>
            <Text size="sm">
              • Los presupuestos de las semanas siguientes se recalcularán automáticamente
            </Text>
            <Text size="sm">
              • Esta acción afectará el balance general de tus semanas
            </Text>
            <Text size="sm">
              • Podrás seguir agregando gastos a esta semana
            </Text>
          </Stack>
          <Text size="sm" c="dimmed">
            Solo reabrir si necesitas corregir o agregar gastos a esta semana.
          </Text>
          
          <Group justify="flex-end" mt="md">
            <Button
              variant="outline"
              onClick={() => setReopenModalOpened(false)}
            >
              Cancelar
            </Button>
            <Button
              color="orange"
              onClick={handleReopenConfirm}
            >
              Sí, reabrir semana.
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}
