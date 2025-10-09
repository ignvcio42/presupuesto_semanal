'use client';

import { useState } from 'react';
import {
  Modal,
  Title,
  Text,
  Stack,
  Group,
  Badge,
  Button,
  ActionIcon,
  Alert,
  Table,
  Menu,
  NumberInput,
  TextInput,
  Select
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { 
  IconDots, 
  IconEdit, 
  IconTrash, 
  IconPlus,
  IconAlertCircle
} from '@tabler/icons-react';
import { DateInput } from '@mantine/dates';
import { api } from '~/trpc/react';
import { formatCurrency, formatDate } from '~/lib/date-utils';
import type { WeekResponse } from '~/lib/validations';
import type { CreateExpenseInput, UpdateExpenseInput } from '~/lib/validations';

interface WeekExpensesProps {
  week: WeekResponse;
  categories: Array<{ id: string; name: string; allocation: number }>;
  opened: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function WeekExpenses({ week, categories, opened, onClose, onSuccess }: WeekExpensesProps) {
  const [editingExpense, setEditingExpense] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);

  // Queries
  const { data: expenses, refetch: refetchExpenses } = api.budget.getExpenses.useQuery({
    weekId: week.id,
  });

  // Mutations
  const deleteExpense = api.budget.deleteExpense.useMutation({
    onSuccess: () => {
      refetchExpenses();
      onSuccess?.();
    },
  });

  const updateExpense = api.budget.updateExpense.useMutation({
    onSuccess: () => {
      refetchExpenses();
      setEditingExpense(null);
      onSuccess?.();
    },
  });

  const createExpense = api.budget.createExpense.useMutation({
    onSuccess: () => {
      refetchExpenses();
      setShowAddForm(false);
      onSuccess?.();
    },
  });

  const editForm = useForm<UpdateExpenseInput>({
    initialValues: {
      amount: 0,
      description: '',
      date: new Date(),
      categoryId: '',
    },
  });

  const addForm = useForm<CreateExpenseInput>({
    initialValues: {
      amount: 0,
      description: '',
      date: new Date(),
      categoryId: categories[0]?.id || '',
    },
  });

  const handleEdit = (expense: any) => {
    setEditingExpense(expense.id);
    editForm.setValues({
      amount: expense.amount,
      description: expense.description,
      date: expense.date,
      categoryId: expense.categoryId,
    });
  };

  const handleSaveEdit = async (values: UpdateExpenseInput) => {
    if (editingExpense) {
      await updateExpense.mutateAsync({
        id: editingExpense,
        data: values,
      });
    }
  };

  const handleAddExpense = async (values: CreateExpenseInput) => {
    await createExpense.mutateAsync(values);
  };

  const handleDelete = async (expenseId: string) => {
    if (confirm('¿Estás seguro de que quieres eliminar este gasto?')) {
      await deleteExpense.mutateAsync(expenseId);
    }
  };

  const categoryOptions = categories.map(category => ({
    value: category.id,
    label: category.name,
  }));

  const getCategoryName = (categoryId: string) => {
    return categories.find(c => c.id === categoryId)?.name || 'Desconocida';
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Gastos - Semana ${week.weekNumber}`}
      size="lg"
    >
      <Stack gap="md">
        {/* Resumen de la semana */}
        <Alert icon={<IconAlertCircle size={16} />} color="blue">
          <Group justify="space-between">
            <div>
              <Text size="sm" fw={500}>
                {formatDate(week.startDate)} - {formatDate(week.endDate)}
              </Text>
              <Text size="sm" c="dimmed">
                Presupuesto: {formatCurrency(week.weeklyBudget)} | 
                Gastado: {formatCurrency(week.spentAmount)} | 
                Restante: {formatCurrency(week.weeklyBudget - week.spentAmount)}
              </Text>
            </div>
            <Badge color={week.spentAmount > week.weeklyBudget ? 'red' : 'green'}>
              {((week.spentAmount / week.weeklyBudget) * 100).toFixed(1)}%
            </Badge>
          </Group>
        </Alert>

        {/* Botón agregar gasto */}
        {!showAddForm && (
          <Button
            leftSection={<IconPlus size={16} />}
            onClick={() => setShowAddForm(true)}
            variant="light"
          >
            Agregar Gasto
          </Button>
        )}

        {/* Formulario agregar gasto */}
        {showAddForm && (
          <form onSubmit={addForm.onSubmit(handleAddExpense)}>
            <Stack gap="md" p="md" style={{ border: '1px solid #e9ecef', borderRadius: '8px' }}>
              <Title order={5}>Nuevo Gasto</Title>
              
              <NumberInput
                label="Monto"
                placeholder="Ingresa el monto"
                leftSection="$"
                min={1}
                step={100}
                thousandSeparator="."
                decimalSeparator=","
                {...addForm.getInputProps('amount')}
              />

              <TextInput
                label="Descripción"
                placeholder="¿En qué gastaste?"
                {...addForm.getInputProps('description')}
              />

              <DateInput
                label="Fecha"
                placeholder="Selecciona la fecha"
                valueFormat="DD/MM/YYYY"
                {...addForm.getInputProps('date')}
              />

              <Select
                label="Categoría"
                placeholder="Selecciona una categoría"
                data={categoryOptions}
                {...addForm.getInputProps('categoryId')}
              />

              <Group>
                <Button type="submit" loading={createExpense.isPending}>
                  Agregar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setShowAddForm(false)}
                >
                  Cancelar
                </Button>
              </Group>
            </Stack>
          </form>
        )}

        {/* Lista de gastos */}
        {expenses && expenses.length > 0 ? (
          <Table>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Descripción</Table.Th>
                <Table.Th>Categoría</Table.Th>
                <Table.Th>Monto</Table.Th>
                <Table.Th>Fecha</Table.Th>
                <Table.Th>Acciones</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {expenses.map((expense) => (
                <Table.Tr key={expense.id}>
                  {editingExpense === expense.id ? (
                    // Modo edición
                    <Table.Td colSpan={5}>
                      <form onSubmit={editForm.onSubmit(handleSaveEdit)}>
                        <Group>
                          <TextInput
                            placeholder="Descripción"
                            style={{ flex: 1 }}
                            {...editForm.getInputProps('description')}
                          />
                          <Select
                            data={categoryOptions}
                            style={{ width: 150 }}
                            {...editForm.getInputProps('categoryId')}
                          />
                          <NumberInput
                            placeholder="Monto"
                            leftSection="$"
                            style={{ width: 120 }}
                            {...editForm.getInputProps('amount')}
                          />
                          <DateInput
                            valueFormat="DD/MM/YYYY"
                            style={{ width: 120 }}
                            {...editForm.getInputProps('date')}
                          />
                          <Button type="submit" size="xs" loading={updateExpense.isPending}>
                            Guardar
                          </Button>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => setEditingExpense(null)}
                          >
                            Cancelar
                          </Button>
                        </Group>
                      </form>
                    </Table.Td>
                  ) : (
                    // Modo visualización
                    <>
                      <Table.Td>{expense.description}</Table.Td>
                      <Table.Td>
                        <Badge variant="light" size="sm">
                          {getCategoryName(expense.categoryId)}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{formatCurrency(expense.amount)}</Table.Td>
                      <Table.Td>{formatDate(expense.date)}</Table.Td>
                      <Table.Td>
                        <Menu shadow="md" width={200}>
                          <Menu.Target>
                            <ActionIcon variant="subtle" color="gray">
                              <IconDots size={16} />
                            </ActionIcon>
                          </Menu.Target>

                          <Menu.Dropdown>
                            <Menu.Item
                              leftSection={<IconEdit size={14} />}
                              onClick={() => handleEdit(expense)}
                            >
                              Editar
                            </Menu.Item>
                            <Menu.Item
                              leftSection={<IconTrash size={14} />}
                              color="red"
                              onClick={() => handleDelete(expense.id)}
                            >
                              Eliminar
                            </Menu.Item>
                          </Menu.Dropdown>
                        </Menu>
                      </Table.Td>
                    </>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        ) : (
          <Alert icon={<IconAlertCircle size={16} />} title="Sin gastos">
            No hay gastos registrados para esta semana.
          </Alert>
        )}
      </Stack>
    </Modal>
  );
}
