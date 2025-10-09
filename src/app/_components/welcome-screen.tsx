'use client';

import { useState } from 'react';
import {
  Container,
  Title,
  Text,
  Card,
  Stack,
  NumberInput,
  Select,
  Button,
  Group,
  Alert,
  Badge,
  Grid,
  Paper,
  ThemeIcon,
  Divider
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { 
  IconCurrency, 
  IconChartBar, 
  IconCalendar, 
  IconTrendingUp,
  IconAlertCircle,
  IconCheck
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatCurrency, getMonthName } from '~/lib/date-utils';

interface WelcomeScreenProps {
  onSetupComplete: () => void;
}

export function WelcomeScreen({ onSetupComplete }: WelcomeScreenProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    initialValues: {
      monthlyBudget: 0,
      budgetMode: 'categorized' as 'simple' | 'categorized',
    },
    validate: {
      monthlyBudget: (value) => (value < 1000 ? 'El presupuesto debe ser al menos $1.000 CLP' : null),
    },
  });

  const utils = api.useUtils();
  
  const updateUser = api.budget.updateUser.useMutation({
    onSuccess: async () => {
      // Refrescar todos los datos relacionados
      await utils.budget.getUser.invalidate();
      await utils.budget.getCategories.invalidate();
      await utils.budget.getWeeks.invalidate();
      onSetupComplete();
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setIsSubmitting(true);
    try {
      await updateUser.mutateAsync(values);
    } catch (error) {
      console.error('Error al configurar presupuesto:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Container size="md" py="xl">
      <Stack align="center" gap="xl">
        {/* Header */}
        <Stack align="center" gap="md">
          <ThemeIcon size={80} radius="xl" color="blue" variant="light">
            <IconCurrency size={40} />
          </ThemeIcon>
          <Title order={1} ta="center">
            ¡Bienvenido a Finanzas Claras!
          </Title>
          <Text size="lg" c="dimmed" ta="center" maw={600}>
            Tu compañero para gestionar tu presupuesto semanal de manera inteligente. 
            Configura tu presupuesto y comienza a tomar control de tus finanzas.
          </Text>
        </Stack>

        {/* Setup Form */}
        <Card shadow="lg" padding="xl" radius="md" withBorder style={{ width: '100%', maxWidth: 500 }}>
          <form onSubmit={form.onSubmit(handleSubmit)}>
            <Stack gap="lg">
              <div>
                <Title order={3} mb="md">Configura tu Presupuesto</Title>
                <Text c="dimmed" mb="lg">
                  Ingresa tu monto libre mensual (después de descontar gastos fijos y ahorro)
                </Text>
              </div>

              <NumberInput
                label="Monto Libre Mensual"
                placeholder="Ej: 150000"
                leftSection="$"
                min={1000}
                step={10000}
                thousandSeparator="."
                decimalSeparator=","
                size="lg"
                {...form.getInputProps('monthlyBudget')}
              />

              <Select
                label="Modo de Presupuesto"
                description="Elige cómo quieres gestionar tu presupuesto"
                data={[
                  { 
                    value: 'simple', 
                    label: 'Semanal Simple'
                  },
                  { 
                    value: 'categorized', 
                    label: 'Por Categorías'
                  },
                ]}
                size="lg"
                {...form.getInputProps('budgetMode')}
              />

              {form.values.budgetMode === 'categorized' && (
                <Alert icon={<IconAlertCircle size={16} />} color="blue">
                  <Text size="sm">
                    <strong>Modo Por Categorías:</strong> Te ayudaremos a distribuir tu presupuesto 
                    en categorías como Polola, Comida, Transporte, etc. Podrás ajustar los 
                    porcentajes según tus necesidades.
                  </Text>
                </Alert>
              )}

              {form.values.budgetMode === 'simple' && (
                <Alert icon={<IconCheck size={16} />} color="green">
                  <Text size="sm">
                    <strong>Modo Semanal Simple:</strong> Solo necesitas controlar que no te pases 
                    del presupuesto semanal. Perfecto para empezar de manera sencilla.
                  </Text>
                </Alert>
              )}

              <Button
                type="submit"
                size="lg"
                loading={isSubmitting}
                disabled={!form.isValid()}
                fullWidth
              >
                Comenzar a Gestionar mi Presupuesto
              </Button>
            </Stack>
          </form>
        </Card>

        {/* Features Preview */}
        <Grid mt="xl" w="100%">
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Paper p="md" withBorder ta="center">
              <ThemeIcon size={50} radius="xl" color="green" variant="light" mx="auto" mb="md">
                <IconChartBar size={24} />
              </ThemeIcon>
              <Title order={4} mb="sm">Seguimiento Semanal</Title>
              <Text size="sm" c="dimmed">
                Controla tu gasto semana a semana con nuestro sistema de semáforo
              </Text>
            </Paper>
          </Grid.Col>
          
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Paper p="md" withBorder ta="center">
              <ThemeIcon size={50} radius="xl" color="yellow" variant="light" mx="auto" mb="md">
                <IconCalendar size={24} />
              </ThemeIcon>
              <Title order={4} mb="sm">Historial Completo</Title>
              <Text size="sm" c="dimmed">
                Mantén un registro de todos tus meses y analiza tus patrones de gasto
              </Text>
            </Paper>
          </Grid.Col>
          
          <Grid.Col span={{ base: 12, md: 4 }}>
            <Paper p="md" withBorder ta="center">
              <ThemeIcon size={50} radius="xl" color="blue" variant="light" mx="auto" mb="md">
                <IconTrendingUp size={24} />
              </ThemeIcon>
              <Title order={4} mb="sm">Rollover Inteligente</Title>
              <Text size="sm" c="dimmed">
                El excedente o déficit se transfiere automáticamente a la siguiente semana
              </Text>
            </Paper>
          </Grid.Col>
        </Grid>
      </Stack>
    </Container>
  );
}
