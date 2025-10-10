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
}

export function WeekExpensesDetails({ 
  opened, 
  onClose, 
  weekId, 
  weekNumber, 
  startDate, 
  endDate 
}: WeekExpensesDetailsProps) {
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      setEditingExpense(null);
    },
  });

  const deleteExpense = api.budget.deleteExpense.useMutation({
    onSuccess: () => {
      refetchExpenses();
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
      categoryId: (value) => (!value ? 'Selecciona una categoría' : null),
    },
  });

  const handleEditExpense = (expense: Expense) => {
    setEditingExpense(expense);
    editForm.setValues({
      amount: expense.amount,
      description: expense.description,
      date: expense.date,
      categoryId: expense.category?.id || '',
    });
  };

  const handleUpdateExpense = async (values: CreateExpenseInput) => {
    if (!editingExpense) return;

    setIsSubmitting(true);
    try {
      await updateExpense.mutateAsync({
        id: editingExpense.id,
        data: values,
      });
    } catch (error) {
      console.error('Error al actualizar gasto:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    if (!confirm('¿Estás seguro de que quieres eliminar este gasto?')) return;

    try {
      await deleteExpense.mutateAsync(expenseId);
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
            <Badge color="blue" variant="light">
              {expenses.length} gasto{expenses.length !== 1 ? 's' : ''}
            </Badge>
          </Group>
          <Group justify="space-between" mt="xs">
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
                        {formatDate(expense.date)}
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
                    >
                      <IconEdit size={14} />
                    </ActionIcon>
                    <ActionIcon
                      variant="light"
                      color="red"
                      size="sm"
                      onClick={() => handleDeleteExpense(expense.id)}
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

        {/* Formulario de edición */}
        {editingExpense && (
          <>
            <Divider label="Editar gasto" labelPosition="center" />
            <Card withBorder p="md">
              <form onSubmit={editForm.onSubmit(handleUpdateExpense)}>
                <Stack gap="md">
                  <Group justify="space-between" align="center">
                    <Text fw={600}>Editando gasto</Text>
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      onClick={() => setEditingExpense(null)}
                    >
                      <IconX size={16} />
                    </ActionIcon>
                  </Group>

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

                  <Select
                    label="Categoría"
                    placeholder="Selecciona una categoría"
                    data={categoryOptions}
                    {...editForm.getInputProps('categoryId')}
                  />

                  <Group justify="flex-end" mt="md">
                    <Button
                      variant="outline"
                      onClick={() => setEditingExpense(null)}
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
            </Card>
          </>
        )}
      </Stack>
    </Modal>
  );
}
