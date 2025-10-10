'use client';

import React, { useState } from 'react';
import {
  Modal,
  Stack,
  Group,
  Text,
  Button,
  ActionIcon,
  Card,
  Badge,
  Alert,
  Divider,
  ScrollArea,
  Loader,
  Center,
  NumberInput,
  TextInput,
  Select,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useForm } from '@mantine/form';
import { DateInput } from '@mantine/dates';
import { 
  IconEdit, 
  IconTrash, 
  IconX, 
  IconAlertCircle,
  IconCalendar,
  IconTag,
  IconCurrencyDollar
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatCurrency, formatDate } from '~/lib/date-utils';
import type { CreateExpenseInput } from '~/lib/validations';

interface Expense {
  id: string;
  amount: number;
  description: string;
  date: Date;
  category: {
    id: string;
    name: string;
  } | null;
}

interface WeekExpensesDetailsProps {
  opened: boolean;
  onClose: () => void;
  weekId: string;
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  budgetMode?: 'simple' | 'categorized';
  onExpenseUpdate?: () => void; // Callback para actualizar el dashboard
}

export function WeekExpensesDetails({ 
  opened, 
  onClose, 
  weekId, 
  weekNumber, 
  startDate, 
  endDate,
  budgetMode = 'categorized',
  onExpenseUpdate
}: WeekExpensesDetailsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [editModalOpened, setEditModalOpened] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState<Expense | null>(null);

  // Obtener gastos de la semana
  const { data: expenses = [], refetch: refetchExpenses, isLoading } = api.budget.getExpenses.useQuery(
    { weekId },
    { enabled: opened }
  );

  // Obtener categorías para el formulario de edición
  const { data: categories = [] } = api.budget.getCategories.useQuery();

  // Mutaciones
  const updateExpense = api.budget.updateExpense.useMutation({
    onSuccess: () => {
      refetchExpenses();
      setEditModalOpened(false);
      setExpenseToEdit(null);
      onExpenseUpdate?.(); // Actualizar el dashboard principal
      
      // Mostrar notificación de éxito
      notifications.show({
        title: 'Gasto actualizado',
        message: 'El gasto se ha actualizado correctamente',
        color: 'green',
        icon: <IconEdit size={16} />,
      });
    },
    onError: (error) => {
      console.error('Error al actualizar gasto:', error);
      notifications.show({
        title: 'Error',
        message: 'No se pudo actualizar el gasto. Inténtalo de nuevo.',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const deleteExpense = api.budget.deleteExpense.useMutation({
    onSuccess: () => {
      refetchExpenses();
      onExpenseUpdate?.(); // Actualizar el dashboard principal
      setDeleteModalOpened(false);
      setExpenseToDelete(null);
      
      // Mostrar notificación de éxito
      notifications.show({
        title: 'Gasto eliminado',
        message: 'El gasto se ha eliminado correctamente',
        color: 'green',
        icon: <IconTrash size={16} />,
      });
    },
    onError: (error) => {
      console.error('Error al eliminar gasto:', error);
      notifications.show({
        title: 'Error',
        message: 'No se pudo eliminar el gasto. Inténtalo de nuevo.',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  // Formulario para editar gasto
  const editForm = useForm<CreateExpenseInput>({
    initialValues: {
      amount: 1,
      description: '',
      date: new Date(),
      categoryId: '',
    },
    validate: {
      amount: (value) => (value <= 0 ? 'El monto debe ser mayor a 0' : null),
      description: (value) => (!value.trim() ? 'La descripción es requerida' : null),
      categoryId: (value) => {
        // Solo validar categoría si el modo es categorizado
        if (budgetMode === 'categorized' && !value) {
          return 'Selecciona una categoría';
        }
        return null;
      },
    },
  });

  const handleEditExpense = (expense: Expense) => {
    setExpenseToEdit(expense);
    setEditModalOpened(true);
    editForm.setValues({
      amount: expense.amount,
      description: expense.description,
      date: expense.date,
      categoryId: expense.category?.id || '',
    });
  };

  const handleUpdateExpense = async (values: CreateExpenseInput) => {
    if (!expenseToEdit) return;

    setIsSubmitting(true);
    try {
      const updateData = {
        ...values,
        // No enviar categoryId si está en modo simple
        categoryId: budgetMode === 'simple' ? undefined : values.categoryId,
      };
      
      await updateExpense.mutateAsync({
        id: expenseToEdit.id,
        data: updateData,
      });
      
      // Mostrar mensaje de éxito
      // El refetch y actualización del dashboard se hace automáticamente en onSuccess
    } catch (error) {
      console.error('Error al actualizar gasto:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = (expense: Expense) => {
    setExpenseToDelete(expense);
    setDeleteModalOpened(true);
  };

  const confirmDeleteExpense = async () => {
    if (!expenseToDelete) return;

    try {
      await deleteExpense.mutateAsync(expenseToDelete.id);
    } catch (error) {
      console.error('Error al eliminar gasto:', error);
    }
  };

  const categoryOptions = categories.map(category => ({
    value: category.id,
    label: `${category.name} (${category.allocation}%)`,
  }));

  const totalSpent = expenses.reduce((sum, expense) => sum + expense.amount, 0);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group>
          <IconCalendar size={20} />
          <Text fw={600}>Gastos - Semana {weekNumber}</Text>
        </Group>
      }
      size="lg"
      scrollAreaComponent={ScrollArea.Autosize}
    >
      <Stack gap="md">
        {/* Información de la semana */}
        <Card withBorder p="sm">
          <Group justify="space-between">
            <Text size="sm" c="dimmed">
              {formatDate(startDate)} - {formatDate(endDate)}
            </Text>
            <Group>
              {(updateExpense.isPending || deleteExpense.isPending) && (
                <Loader size="xs" />
              )}
              <Badge color="blue" variant="light">
                {expenses.length} gasto{expenses.length !== 1 ? 's' : ''}
              </Badge>
            </Group>
          </Group>
          <Group justify="space-start" mt="xs">
            <Text size="sm">Total gastado:</Text>
            <Text size="sm" fw={600} c="red">
              {formatCurrency(totalSpent)}
            </Text>
          </Group>
        </Card>

        {/* Lista de gastos */}
        {isLoading ? (
          <Center py="xl">
            <Loader />
          </Center>
        ) : expenses.length === 0 ? (
          <Alert icon={<IconAlertCircle size={16} />} color="gray">
            No hay gastos registrados para esta semana.
          </Alert>
        ) : (
          <Stack gap="xs">
            {expenses.map((expense) => (
              <Card key={expense.id} withBorder p="sm">
                <Group justify="space-between" align="flex-start">
                  <Stack gap="xs" style={{ flex: 1 }}>
                    <Group gap="xs">
                      <IconCurrencyDollar size={16} color="red" />
                      <Text fw={600} size="sm">
                        {formatCurrency(expense.amount)}
                      </Text>
                    </Group>
                    
                    <Text size="sm" c="dark">
                      {expense.description}
                    </Text>
                    
                    <Group gap="xs">
                      <IconCalendar size={14} color="gray" />
                      <Text size="xs" c="dimmed">
                        {formatDate(expense.date, 'dd/MM/yyyy')} - ({expense.date.toLocaleDateString('es-ES', { 
                          weekday: 'long', 
                          day: 'numeric', 
                          month: 'long', 
                        })}{' '}{expense.date.toLocaleTimeString('es-ES', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })})
                      </Text>
                      {expense.category && (
                        <>
                          <IconTag size={14} color="gray" />
                          <Badge size="xs" variant="light" color="blue">
                            {expense.category.name}
                          </Badge>
                        </>
                      )}
                    </Group>
                  </Stack>
                  
                  <Group gap="xs">
                    <ActionIcon
                      variant="light"
                      color="blue"
                      size="sm"
                      onClick={() => handleEditExpense(expense)}
                      loading={updateExpense.isPending}
                    >
                      <IconEdit size={14} />
                    </ActionIcon>
                    <ActionIcon
                      variant="light"
                      color="red"
                      size="sm"
                      onClick={() => handleDeleteExpense(expense)}
                      loading={deleteExpense.isPending}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Group>
              </Card>
            ))}
          </Stack>
        )}

      </Stack>

      {/* Modal de edición de gasto */}
      <Modal
        opened={editModalOpened}
        onClose={() => {
          setEditModalOpened(false);
          setExpenseToEdit(null);
          editForm.reset();
        }}
        title="Editar gasto"
        size="md"
      >
        <form onSubmit={editForm.onSubmit(handleUpdateExpense)}>
          <Stack gap="md">
            {expenseToEdit && (
              <Card withBorder p="sm" bg="gray.0">
                <Group justify="space-between">
                  <Text size="sm" fw={500}>
                    Editando: {formatCurrency(expenseToEdit.amount)}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {expenseToEdit.description}
                  </Text>
                </Group>
                {expenseToEdit.category && (
                  <Badge size="xs" variant="light" color="blue" mt="xs">
                    {expenseToEdit.category.name}
                  </Badge>
                )}
              </Card>
            )}

            <NumberInput
              label="Monto"
              placeholder="Ingresa el monto"
              leftSection="$"
              min={1}
              step={100}
              thousandSeparator="."
              decimalSeparator=","
              {...editForm.getInputProps('amount')}
            />

            <TextInput
              label="Descripción"
              placeholder="¿En qué gastaste?"
              {...editForm.getInputProps('description')}
            />

            <DateInput
              label="Fecha"
              placeholder="Selecciona la fecha"
              valueFormat="DD/MM/YYYY"
              {...editForm.getInputProps('date')}
            />

            {budgetMode === 'categorized' && (
              <Select
                label="Categoría"
                placeholder="Selecciona una categoría"
                data={categoryOptions}
                {...editForm.getInputProps('categoryId')}
              />
            )}

            <Group justify="flex-end" mt="md">
              <Button
                variant="outline"
                onClick={() => {
                  setEditModalOpened(false);
                  setExpenseToEdit(null);
                  editForm.reset();
                }}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={isSubmitting}
                disabled={!editForm.isValid()}
              >
                Actualizar Gasto
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>

      {/* Modal de confirmación para eliminar gasto */}
      <Modal
        opened={deleteModalOpened}
        onClose={() => {
          setDeleteModalOpened(false);
          setExpenseToDelete(null);
        }}
        title="Confirmar eliminación"
        size="sm"
      >
        <Stack gap="md">
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            <Text size="sm">
              ¿Estás seguro de que quieres eliminar este gasto?
            </Text>
          </Alert>

          {expenseToDelete && (
            <Card withBorder p="sm">
              <Group justify="space-between">
                <Text size="sm" fw={500}>
                  {formatCurrency(expenseToDelete.amount)}
                </Text>
                <Text size="sm" c="dimmed">
                  {expenseToDelete.description}
                </Text>
              </Group>
              {expenseToDelete.category && (
                <Badge size="xs" variant="light" color="blue" mt="xs">
                  {expenseToDelete.category.name}
                </Badge>
              )}
            </Card>
          )}

          <Group justify="flex-end" mt="md">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteModalOpened(false);
                setExpenseToDelete(null);
              }}
              disabled={deleteExpense.isPending}
            >
              Cancelar
            </Button>
            <Button
              color="red"
              onClick={confirmDeleteExpense}
              loading={deleteExpense.isPending}
            >
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Modal>
  );
}
