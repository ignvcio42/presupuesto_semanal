'use client';

import { Card, Text, Stack, Group, Button, Badge } from '@mantine/core';
import { api } from '~/trpc/react';

export function DebugInfo() {
  const { data: user } = api.budget.getUser.useQuery();
  const { data: categories } = api.budget.getCategories.useQuery();
  const { data: weeks } = api.budget.getWeeks.useQuery({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  const createWeeks = api.budget.createWeeksForCurrentMonth.useMutation();
  const applyRollovers = api.budget.applyPendingRollovers.useMutation();
  const autoCloseWeeks = api.budget.autoCloseWeeks.useMutation();
  const resetBudget = api.budget.resetBudget.useMutation();

  return (
    <Card shadow="sm" padding="lg" radius="md" withBorder>
      <Text fw={500} mb="md">Debug Info</Text>
      <Stack gap="xs">
        <Group justify="space-between">
          <Text size="sm">Usuario:</Text>
          <Badge color={user ? 'green' : 'red'}>
            {user ? 'Existe' : 'No existe'}
          </Badge>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm">Presupuesto:</Text>
          <Text size="sm">{user?.monthlyBudget || 'No configurado'}</Text>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm">Modo:</Text>
          <Text size="sm">{user?.budgetMode || 'No configurado'}</Text>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm">Categorías:</Text>
          <Badge color={categories && categories.length > 0 ? 'green' : 'red'}>
            {categories?.length || 0}
          </Badge>
        </Group>
        
        <Group justify="space-between">
          <Text size="sm">Semanas:</Text>
          <Badge color={weeks && weeks.length > 0 ? 'green' : 'red'}>
            {weeks?.length || 0}
          </Badge>
        </Group>
        
        <Stack gap="xs">
          <Group>
            <Button
              size="xs"
              variant="light"
              onClick={() => createWeeks.mutate()}
              loading={createWeeks.isPending}
            >
              Crear Semanas
            </Button>
            <Button
              size="xs"
              variant="light"
              color="orange"
              onClick={() => applyRollovers.mutate()}
              loading={applyRollovers.isPending}
            >
              Aplicar Rollovers
            </Button>
          </Group>
          <Button
            size="xs"
            variant="light"
            color="green"
            onClick={() => autoCloseWeeks.mutate()}
            loading={autoCloseWeeks.isPending}
            fullWidth
          >
            Auto-Cerrar Semanas Vencidas
          </Button>
          <Button
            size="xs"
            variant="light"
            color="red"
            onClick={() => {
              if (confirm('¿Reiniciar todo el presupuesto? Esto eliminará todos los datos.')) {
                resetBudget.mutate();
              }
            }}
            loading={resetBudget.isPending}
            fullWidth
          >
            Reiniciar Todo
          </Button>
        </Stack>
      </Stack>
    </Card>
  );
}
