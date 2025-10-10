'use client';

import { Card, Progress, Stack, Text, Group, Badge } from '@mantine/core';
import { formatCurrency, getTrafficLightColor } from '~/lib/date-utils';

interface CategoryProgressProps {
  categories: Array<{
    id: string;
    name: string;
    allocatedAmount: number;
    spentAmount: number;
    percentageUsed: number;
  }>;
  totalBudget: number;
  totalSpent: number;
}

export function CategoryProgress({ categories, totalBudget, totalSpent }: CategoryProgressProps) {
  const getProgressColor = (percentage: number) => {
    const trafficLightColor = getTrafficLightColor(percentage);
    const colorMap = {
      green: 'green',
      yellow: 'yellow',
      red: 'red'
    };
    return colorMap[trafficLightColor];
  };

  const getStatusBadge = (percentage: number) => {
    const trafficLightColor = getTrafficLightColor(percentage);
    const colorMap = {
      green: 'green',
      yellow: 'yellow',
      red: 'red'
    };
    
    const statusMap = {
      green: 'Bien',
      yellow: 'Cuidado',
      red: 'Alerta'
    };

    return (
      <Badge color={colorMap[trafficLightColor]} variant="light" size="sm">
        {statusMap[trafficLightColor]}
      </Badge>
    );
  };

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Text fw={500} mb="md">Progreso por Categorías</Text>
      
      <Stack gap="md">
        {categories.map((category) => (
          <div key={category.id}>
            <Group justify="space-between" mb="xs">
              <Group>
                <Text size="sm" fw={500}>{category.name}</Text>
                {getStatusBadge(category.percentageUsed)}
              </Group>
              <Text size="xs" c="dimmed">
                {category.percentageUsed.toFixed(1)}%
              </Text>
            </Group>
            
            <Progress
              value={Math.min(category.percentageUsed, 100)}
              color={getProgressColor(category.percentageUsed)}
              size="md"
              radius="xl"
              mb="xs"
            />
            
            <Group justify="space-between">
              <div className='flex gap-10 items-center'>
              <Text size="xs" c="dimmed">
                Gastado: {formatCurrency(category.spentAmount)}
              </Text>
              <Text size="xs" c="dimmed">
                Restante: {formatCurrency(category.allocatedAmount - category.spentAmount)}
              </Text>
              </div>
              <Text size="xs" c="dimmed">
                Presupuesto: {formatCurrency(category.allocatedAmount)}
              </Text>
            </Group>
            
            {category.spentAmount > category.allocatedAmount && (
              <Text size="xs" c="red" mt="xs">
                ⚠️ Te has pasado por {formatCurrency(category.spentAmount - category.allocatedAmount)}
              </Text>
            )}
          </div>
        ))}
      </Stack>

      <Group justify="space-between" mt="lg" pt="md" style={{ borderTop: '1px solid #e9ecef' }}>
        <Text size="sm" fw={500}>Total:</Text>
        <Group>
          <Text size="sm" c="dimmed">
            {formatCurrency(totalSpent)} / {formatCurrency(totalBudget)}
          </Text>
          <Badge 
            color={getProgressColor((totalSpent / totalBudget) * 100)} 
            variant="light"
          >
            {((totalSpent / totalBudget) * 100).toFixed(1)}%
          </Badge>
        </Group>
      </Group>
    </Card>
  );
}
