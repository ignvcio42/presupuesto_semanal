'use client';

import { Card, Progress, Badge, Group, Text, Stack, Button, ActionIcon, Menu, Tooltip } from '@mantine/core';
import { IconCalendar, IconTrendingUp, IconTrendingDown, IconX, IconDots, IconEdit, IconTrash, IconInfoCircle } from '@tabler/icons-react';
import { formatCurrency, formatDate, getTrafficLightColor } from '~/lib/date-utils';
import type { WeekResponse } from '~/lib/validations';

interface WeekCardProps {
  week: WeekResponse;
  onCloseWeek?: (weekId: string) => void;
  onViewDetails?: (weekId: string) => void;
  onViewExpenses?: (weekId: string) => void;
  isCurrentWeek?: boolean;
  showCloseButton?: boolean;
}

export function WeekCard({ week, onCloseWeek, onViewDetails, onViewExpenses, isCurrentWeek, showCloseButton = true }: WeekCardProps) {
  const percentageRemaining = 100 - week.percentageUsed;
  const trafficLightColor = getTrafficLightColor(week.percentageUsed);
  
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
    <Card shadow="sm" padding="lg" radius="md" withBorder style={{ height: '100%' }}>
      <Group justify="space-between" mb="md">
        <Text fw={700} size="lg">Semana {week.weekNumber}</Text>
        <Group gap="xs">
          <div style={{ 
            width: 12, 
            height: 12, 
            borderRadius: '50%', 
            backgroundColor: getTrafficLightColor(week.percentageUsed) === 'green' ? '#51cf66' : 
                            getTrafficLightColor(week.percentageUsed) === 'yellow' ? '#ffd43b' : '#ff6b6b' 
          }} />
          <Menu shadow="md" width={200}>
            <Menu.Target>
              <ActionIcon variant="subtle" color="gray" size="sm">
                <IconDots size={16} />
              </ActionIcon>
            </Menu.Target>

            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconEdit size={14} />}
                onClick={() => onViewExpenses?.(week.id)}
              >
                Ver/Editar Gastos
              </Menu.Item>
              {onViewDetails && (
                <Menu.Item
                  leftSection={<IconCalendar size={14} />}
                  onClick={() => onViewDetails(week.id)}
                >
                  Ver Detalles
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      <Text size="sm" c="dimmed" mb="md">
        {formatDate(week.startDate, 'd')} - {formatDate(week.endDate, 'd')} de {formatDate(week.startDate, 'MMM')}
      </Text>

      <Stack gap="md">
        <div>
          <Text fw={700} size="xl" mb="xs">
            {formatCurrency(week.weeklyBudget - week.spentAmount)}
          </Text>
          <Text size="sm" c="dimmed">
            Restante de {formatCurrency(week.weeklyBudget)}
          </Text>
        </div>

        <Progress
          value={week.percentageUsed}
          color={getProgressColor()}
          size="md"
          radius="xl"
          style={{ backgroundColor: '#f1f3f4' }}
        />

        <Group justify="space-between">
          <Text size="sm">Gastado: {formatCurrency(week.spentAmount)}</Text>
          <Text size="sm" c="dimmed">
            {week.percentageUsed.toFixed(1)}% del presupuesto
          </Text>
        </Group>

        {week.rolloverAmount > 0 && (
          <Group gap="xs" mt="xs">
            <IconTrendingUp size={16} color="green" />
            <Text size="sm" c="green">
              {formatCurrency(week.rolloverAmount)} de la semana anterior
            </Text>
          </Group>
        )}

        {week.rolloverAmount < 0 && (
          <Group gap="xs" mt="xs">
            <IconTrendingDown size={16} color="red" />
            <Text size="sm" c="red">
              Déficit de {formatCurrency(Math.abs(week.rolloverAmount))}
            </Text>
          </Group>
        )}

        {isCurrentWeek && (
          <Badge color="blue" variant="light" size="sm" style={{ alignSelf: 'flex-start' }}>
            Semana Actual
          </Badge>
        )}

        {week.isClosed && (
          <Badge color="gray" variant="light" size="sm" style={{ alignSelf: 'flex-start' }}>
            Cerrada
          </Badge>
        )}

        {!week.isClosed && showCloseButton && (
          <Tooltip 
            label="Cierra esta semana manualmente. El rollover se aplicará a la siguiente semana."
            position="top"
            withArrow
          >
            <Button
              variant="light"
              color="orange"
              size="xs"
              onClick={() => onCloseWeek?.(week.id)}
              style={{ alignSelf: 'flex-start' }}
              leftSection={<IconInfoCircle size={14} />}
            >
              Cerrar Semana
            </Button>
          </Tooltip>
        )}
      </Stack>
    </Card>
  );
}
