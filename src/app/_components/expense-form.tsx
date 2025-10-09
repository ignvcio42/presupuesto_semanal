'use client';

import { useState } from 'react';
import { 
  Modal, 
  Button, 
  TextInput, 
  NumberInput, 
  Select, 
  Group, 
  Stack, 
  Text,
  ActionIcon,
  Alert
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { DateInput } from '@mantine/dates';
import { IconPlus, IconAlertCircle } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatCurrency } from '~/lib/date-utils';
import type { CreateExpenseInput } from '~/lib/validations';

interface ExpenseFormProps {
  categories: Array<{ id: string; name: string; allocation: number }>;
  onSuccess?: () => void;
}

export function ExpenseForm({ categories, onSuccess }: ExpenseFormProps) {
  const [opened, setOpened] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<CreateExpenseInput>({
    initialValues: {
      amount: 0,
      description: '',
      date: new Date(),
      categoryId: categories[0]?.id || '',
    },
    validate: {
      amount: (value) => (value <= 0 ? 'El monto debe ser mayor a 0' : null),
      description: (value) => (!value.trim() ? 'La descripción es requerida' : null),
      categoryId: (value) => (!value ? 'Selecciona una categoría' : null),
    },
  });

  const createExpense = api.budget.createExpense.useMutation({
    onSuccess: () => {
      form.reset();
      setOpened(false);
      onSuccess?.();
    },
    onError: (error) => {
      console.error('Error al crear gasto:', error);
    },
  });

  const handleSubmit = async (values: CreateExpenseInput) => {
    setIsSubmitting(true);
    try {
      await createExpense.mutateAsync(values);
    } catch (error) {
      console.error('Error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryOptions = categories.map(category => ({
    value: category.id,
    label: `${category.name} (${category.allocation}%)`,
  }));

  return (
    <>
      <Button
        leftSection={<IconPlus size={16} />}
        onClick={() => setOpened(true)}
        variant="filled"
      >
        Agregar Gasto
      </Button>

      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Agregar Nuevo Gasto"
        size="md"
      >
        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <NumberInput
              label="Monto"
              placeholder="Ingresa el monto"
              leftSection="$"
              min={1}
              step={100}
              thousandSeparator="."
              decimalSeparator=","
              {...form.getInputProps('amount')}
            />

            <TextInput
              label="Descripción"
              placeholder="¿En qué gastaste?"
              {...form.getInputProps('description')}
            />

            <DateInput
              label="Fecha"
              placeholder="Selecciona la fecha"
              valueFormat="DD/MM/YYYY"
              {...form.getInputProps('date')}
            />

            <Select
              label="Categoría"
              placeholder="Selecciona una categoría"
              data={categoryOptions}
              {...form.getInputProps('categoryId')}
            />

            {form.values.amount > 0 && form.values.categoryId && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Resumen del gasto"
                color="blue"
              >
                <Text size="sm">
                  <strong>{formatCurrency(form.values.amount)}</strong> en{' '}
                  <strong>{categories.find(c => c.id === form.values.categoryId)?.name}</strong>
                </Text>
              </Alert>
            )}

            <Group justify="flex-end" mt="md">
              <Button
                variant="outline"
                onClick={() => setOpened(false)}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={isSubmitting}
                disabled={!form.isValid()}
              >
                Agregar Gasto
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
