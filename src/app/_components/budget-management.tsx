'use client';

import { useState } from 'react';
import {
  Modal,
  Title,
  Text,
  Stack,
  Group,
  Button,
  Alert,
  NumberInput,
  Divider,
  ActionIcon,
  Menu
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { 
  IconSettings, 
  IconRefresh, 
  IconAlertTriangle,
  IconDots,
  IconEdit,
  IconTrash
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatCurrency, getMonthName } from '~/lib/date-utils';

interface BudgetManagementProps {
  opened: boolean;
  onClose: () => void;
  currentBudget: number;
  currentMonth: number;
  currentYear: number;
  onSuccess?: () => void;
}

export function BudgetManagement({ 
  opened, 
  onClose, 
  currentBudget, 
  currentMonth, 
  currentYear,
  onSuccess 
}: BudgetManagementProps) {
  const [activeAction, setActiveAction] = useState<'update' | 'reset' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateForm = useForm({
    initialValues: {
      newBudget: currentBudget,
    },
    validate: {
      newBudget: (value) => (value < 1000 ? 'El presupuesto debe ser al menos $1.000 CLP' : null),
    },
  });

  const updateBudget = api.budget.updateUser.useMutation({
    onSuccess: () => {
      onSuccess?.();
      setActiveAction(null);
      onClose();
    },
  });

  const resetMonth = api.budget.resetMonth.useMutation({
    onSuccess: () => {
      onSuccess?.();
      setActiveAction(null);
      onClose();
    },
  });

  const handleUpdateBudget = async (values: typeof updateForm.values) => {
    setIsSubmitting(true);
    try {
      await updateBudget.mutateAsync({
        monthlyBudget: values.newBudget,
      });
    } catch (error) {
      console.error('Error al actualizar presupuesto:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetMonth = async () => {
    if (confirm('¿Estás seguro de que quieres reiniciar el mes? Esta acción eliminará todos los gastos y no se puede deshacer.')) {
      setIsSubmitting(true);
      try {
        await resetMonth.mutateAsync({
          year: currentYear,
          month: currentMonth,
        });
      } catch (error) {
        console.error('Error al reiniciar mes:', error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleClose = () => {
    setActiveAction(null);
    updateForm.reset();
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title="Gestión del Presupuesto"
      size="md"
    >
      <Stack gap="md">
        {/* Información actual */}
        <Alert icon={<IconSettings size={16} />} color="blue">
          <Text size="sm">
            <strong>Mes actual:</strong> {getMonthName(currentMonth)} {currentYear}
          </Text>
          <Text size="sm">
            <strong>Presupuesto actual:</strong> {formatCurrency(currentBudget)}
          </Text>
        </Alert>

        {/* Opciones disponibles */}
        {!activeAction && (
          <Stack gap="md">
            <Title order={4}>¿Qué quieres hacer?</Title>
            
            <Button
              variant="light"
              leftSection={<IconEdit size={16} />}
              onClick={() => setActiveAction('update')}
              fullWidth
            >
              Modificar Presupuesto Mensual
            </Button>

            <Button
              variant="light"
              color="orange"
              leftSection={<IconRefresh size={16} />}
              onClick={() => setActiveAction('reset')}
              fullWidth
            >
              Reiniciar Mes Actual
            </Button>
          </Stack>
        )}

        {/* Formulario actualizar presupuesto */}
        {activeAction === 'update' && (
          <form onSubmit={updateForm.onSubmit(handleUpdateBudget)}>
            <Stack gap="md">
              <Title order={4}>Modificar Presupuesto</Title>
              
              <Alert icon={<IconAlertTriangle size={16} />} color="yellow">
                <Text size="sm">
                  Al modificar el presupuesto, se recalcularán automáticamente:
                </Text>
                <ul>
                  <li>Los presupuestos semanales</li>
                  <li>Las asignaciones por categoría</li>
                  <li>Los porcentajes de uso</li>
                </ul>
              </Alert>

              <NumberInput
                label="Nuevo Presupuesto Mensual"
                placeholder="Ingresa el nuevo monto"
                leftSection="$"
                min={1000}
                step={10000}
                thousandSeparator="."
                decimalSeparator=","
                {...updateForm.getInputProps('newBudget')}
              />

              <Group>
                <Button
                  variant="outline"
                  onClick={() => setActiveAction(null)}
                  disabled={isSubmitting}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  loading={isSubmitting}
                  disabled={!updateForm.isValid()}
                >
                  Actualizar Presupuesto
                </Button>
              </Group>
            </Stack>
          </form>
        )}

        {/* Confirmación reiniciar mes */}
        {activeAction === 'reset' && (
          <Stack gap="md">
            <Title order={4}>Reiniciar Mes</Title>
            
            <Alert icon={<IconAlertTriangle size={16} />} color="red">
              <Text size="sm" fw={500} mb="xs">
                ¡ATENCIÓN! Esta acción eliminará:
              </Text>
              <ul>
                <li>Todos los gastos del mes actual</li>
                <li>El historial de semanas</li>
                <li>Los rollovers acumulados</li>
              </ul>
              <Text size="sm" mt="xs">
                <strong>Esta acción no se puede deshacer.</strong>
              </Text>
            </Alert>

            <Text size="sm" c="dimmed">
              El mes se reiniciará con el presupuesto actual y las categorías configuradas.
            </Text>

            <Group>
              <Button
                variant="outline"
                onClick={() => setActiveAction(null)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                color="red"
                onClick={handleResetMonth}
                loading={isSubmitting}
              >
                Sí, Reiniciar Mes
              </Button>
            </Group>
          </Stack>
        )}

        <Divider />

        <Group justify="flex-end">
          <Button variant="outline" onClick={handleClose}>
            Cerrar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
