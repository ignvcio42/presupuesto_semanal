'use client';

import React, { useState } from 'react';
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
import { formatCurrency, createLocalDate, createDateFromString, createDateFromDateInput, findWeekForDate } from '~/lib/date-utils';
import type { CreateExpenseInput } from '~/lib/validations';

interface ExpenseFormProps {
  categories: Array<{ id: string; name: string; allocation: number }>;
  budgetMode?: 'simple' | 'categorized';
  onSuccess?: () => void;
  opened?: boolean;
  onClose?: () => void;
}

export function ExpenseForm({ categories, budgetMode = 'categorized', onSuccess, opened: externalOpened, onClose }: ExpenseFormProps) {
  const [internalOpened, setInternalOpened] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Usar el estado externo si se proporciona, sino usar el interno
  const opened = externalOpened !== undefined ? externalOpened : internalOpened;
  const setOpened = onClose ? onClose : setInternalOpened;

  const form = useForm<CreateExpenseInput>({
    initialValues: {
      amount: 1,
      description: '',
      date: createLocalDate(),
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

  // Actualizar el categoryId cuando cambien las categorías (solo en modo categorizado)
  React.useEffect(() => {
    if (budgetMode === 'categorized' && categories.length > 0 && !form.values.categoryId && categories[0]) {
      form.setFieldValue('categoryId', categories[0].id);
    } else if (budgetMode === 'simple') {
      // Limpiar categoryId cuando se cambia a modo simple
      form.setFieldValue('categoryId', '');
    }
  }, [categories, budgetMode]); // Removido 'form' de las dependencias

  // Debug: mostrar el estado del formulario
  // console.log('Form values:', form.values);
  // console.log('Form errors:', form.errors);
  // console.log('Form isValid:', form.isValid());

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

  // Verificar si la fecha seleccionada es de una semana pasada
  const selectedDate = form.values.date instanceof Date ? form.values.date : new Date(form.values.date);
  const today = createLocalDate(); // Usar función que maneja zona horaria local
  
  // Normalizar la fecha seleccionada para evitar problemas de zona horaria
  // El DateInput puede devolver fechas como "Oct 12 21:00" cuando seleccionas Oct 13
  // debido a problemas de UTC. Necesitamos corregir esto.
  const selectedDateNormalized = createDateFromDateInput(selectedDate);
  
  // Obtener el año y mes de ambas fechas
  const selectedYear = selectedDateNormalized.getFullYear();
  const selectedMonth = selectedDateNormalized.getMonth() + 1;
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;
  
  // Encontrar la semana de la fecha seleccionada y la semana actual
  const selectedWeek = findWeekForDate(selectedDateNormalized, selectedYear, selectedMonth);
  const currentWeek = findWeekForDate(today, todayYear, todayMonth);
  
  // Determinar si es una semana pasada comparando las semanas, no los días
  let isPastWeek = false;
  if (selectedWeek && currentWeek) {
    // Si están en el mismo mes y año, comparar el número de semana
    if (selectedYear === todayYear && selectedMonth === todayMonth) {
      isPastWeek = selectedWeek.weekNumber < currentWeek.weekNumber;
    } 
    // Si la fecha seleccionada es de un mes/año anterior, es semana pasada
    else if (selectedYear < todayYear || (selectedYear === todayYear && selectedMonth < todayMonth)) {
      isPastWeek = true;
    }
  }
  
  // Debug logs
  console.log('Date validation debug:', {
    selectedDate: selectedDate,
    selectedDateNormalized: selectedDateNormalized,
    today: today,
    selectedYear: selectedYear,
    selectedMonth: selectedMonth,
    todayYear: todayYear,
    todayMonth: todayMonth,
    selectedWeek: selectedWeek,
    currentWeek: currentWeek,
    isPastWeek: isPastWeek,
  });

  const handleSubmit = async (values: CreateExpenseInput) => {
    // Validación adicional antes de enviar
    if (values.amount <= 0 || !values.description.trim()) {
      console.error('Formulario inválido:', values);
      return;
    }

    // Solo validar categoría si el modo es categorizado
    if (budgetMode === 'categorized' && !values.categoryId) {
      console.error('Formulario inválido: categoría requerida en modo categorizado', values);
      return;
    }

    // Convertir la fecha a objeto Date si es string y asegurar zona horaria local
    let finalDate: Date;
    if (values.date instanceof Date) {
      // Normalizar la fecha usando createDateFromDateInput para corregir problemas de UTC
      finalDate = createDateFromDateInput(values.date);
    } else if (typeof values.date === 'string') {
      // Si es un string, crear fecha desde el string
      finalDate = createDateFromString(values.date);
    } else {
      finalDate = createLocalDate();
    }

    const expenseData = {
      ...values,
      date: finalDate,
      // No enviar categoryId si está en modo simple
      categoryId: budgetMode === 'simple' ? undefined : values.categoryId,
    };

    setIsSubmitting(true);
    try {
      await createExpense.mutateAsync(expenseData);
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

  // Si se proporciona opened y onClose, renderizar solo el modal
  if (externalOpened !== undefined && onClose) {
    return (
      <Modal
        opened={opened}
        onClose={() => setOpened(false)}
        title="Agregar Gasto"
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
              value={form.values.date}
              onChange={(value) => {
                console.log('DateInput onChange - raw value:', value);
                const dateValue = value ? createDateFromDateInput(new Date(value)) : createLocalDate();
                console.log('DateInput onChange - normalized dateValue:', dateValue);
                form.setFieldValue('date', dateValue);
              }}
            />

            {budgetMode === 'categorized' && (
              <Select
                label="Categoría"
                placeholder="Selecciona una categoría"
                data={categoryOptions}
                {...form.getInputProps('categoryId')}
              />
            )}

            {isPastWeek && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Gasto en semana pasada"
                color="orange"
              >
                <Text size="sm">
                  Estás agregando un gasto a una semana que ya pasó. Esto ajustará automáticamente 
                  el rollover y afectará el presupuesto de la siguiente semana.
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
                disabled={
                  isSubmitting || 
                  form.values.amount < 1 || 
                  !form.values.description.trim() || 
                  (budgetMode === 'categorized' && !form.values.categoryId)
                }
              >
                Agregar Gasto
              </Button>
            </Group>
          </Stack>
        </form>
      </Modal>
    );
  }

  // Renderizado normal con botón + modal
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
              value={form.values.date}
              onChange={(value) => {
                console.log('DateInput onChange - raw value:', value);
                const dateValue = value ? createDateFromDateInput(new Date(value)) : createLocalDate();
                console.log('DateInput onChange - normalized dateValue:', dateValue);
                form.setFieldValue('date', dateValue);
              }}
            />

            {budgetMode === 'categorized' && (
              <Select
                label="Categoría"
                placeholder="Selecciona una categoría"
                data={categoryOptions}
                {...form.getInputProps('categoryId')}
              />
            )}

            {form.values.amount > 0 && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Resumen del gasto"
                color="blue"
              >
                <Text size="sm">
                  <strong>{formatCurrency(form.values.amount)}</strong>
                  {budgetMode === 'categorized' && form.values.categoryId && (
                    <> en <strong>{categories.find(c => c.id === form.values.categoryId)?.name}</strong></>
                  )}
                </Text>
              </Alert>
            )}

            {isPastWeek && (
              <Alert
                icon={<IconAlertCircle size={16} />}
                title="Gasto en semana pasada"
                color="orange"
              >
                <Text size="sm">
                  Estás agregando un gasto a una semana que ya pasó. Esto ajustará automáticamente 
                  el rollover y afectará el presupuesto de la siguiente semana.
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
                variant="outline"
                color="orange"
                onClick={() => {
                  // console.log('Testing form submit with values:', form.values);
                  handleSubmit(form.values);
                }}
                disabled={isSubmitting}
              >
                Test Submit
              </Button>
              <Button
                type="submit"
                loading={isSubmitting}
                disabled={
                  isSubmitting || 
                  form.values.amount < 1 || 
                  !form.values.description.trim() || 
                  (budgetMode === 'categorized' && !form.values.categoryId)
                }
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
