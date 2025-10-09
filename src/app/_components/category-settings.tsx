'use client';

import { useState } from 'react';
import {
  Modal,
  Button,
  Stack,
  Text,
  NumberInput,
  Group,
  Alert,
  Progress,
  ActionIcon,
  TextInput,
  Divider
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPlus, IconTrash, IconAlertCircle } from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatCurrency } from '~/lib/date-utils';

interface CategorySettingsProps {
  opened: boolean;
  onClose: () => void;
  categories: Array<{ id: string; name: string; allocation: number }>;
  onSuccess?: () => void;
}

export function CategorySettings({ opened, onClose, categories, onSuccess }: CategorySettingsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm({
    initialValues: {
      categories: categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        allocation: cat.allocation,
      })),
    },
  });

  const updateAllocations = api.budget.updateCategoryAllocations.useMutation({
    onSuccess: () => {
      onSuccess?.();
      onClose();
    },
  });

  const createCategory = api.budget.createCategory.useMutation({
    onSuccess: () => {
      onSuccess?.();
    },
  });

  const deleteCategory = api.budget.deleteCategory.useMutation({
    onSuccess: () => {
      onSuccess?.();
    },
  });

  const totalAllocation = form.values.categories.reduce((sum, cat) => sum + cat.allocation, 0);
  const isValid = Math.abs(totalAllocation - 100) < 0.01;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await updateAllocations.mutateAsync({
        allocations: form.values.categories.map(cat => ({
          categoryId: cat.id,
          allocation: cat.allocation,
        })),
      });
    } catch (error) {
      console.error('Error al actualizar asignaciones:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCategory = () => {
    form.insertListItem('categories', {
      id: `temp-${Date.now()}`,
      name: '',
      allocation: 0,
    });
  };

  const handleRemoveCategory = (index: number) => {
    const category = form.values.categories[index];
    if (!category) return;
    
    if (category.id.startsWith('temp-')) {
      form.removeListItem('categories', index);
    } else {
      deleteCategory.mutate(category.id);
      form.removeListItem('categories', index);
    }
  };

  const handleCreateNewCategory = async (index: number) => {
    const category = form.values.categories[index];
    if (!category) return;
    
    if (category.name.trim() && category.allocation > 0) {
      try {
        await createCategory.mutateAsync({
          name: category.name,
          allocation: category.allocation,
        });
        form.removeListItem('categories', index);
      } catch (error) {
        console.error('Error al crear categoría:', error);
      }
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Configuración de Categorías"
      size="lg"
    >
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <Alert
            icon={<IconAlertCircle size={16} />}
            title="Distribución del Presupuesto"
            color="blue"
          >
            <Text size="sm">
              La suma de todas las asignaciones debe ser exactamente 100%.
              Actual: {totalAllocation.toFixed(1)}%
            </Text>
          </Alert>

          <Progress
            value={Math.min(totalAllocation, 100)}
            color={isValid ? 'green' : totalAllocation > 100 ? 'red' : 'yellow'}
            size="lg"
            radius="xl"
          />
          <Text size="sm" ta="center" c="dimmed">
            {totalAllocation.toFixed(1)}%
          </Text>

          {form.values.categories.map((category, index) => (
            <Group key={category.id} align="flex-end">
              <TextInput
                label="Nombre"
                placeholder="Nombre de la categoría"
                style={{ flex: 1 }}
                {...form.getInputProps(`categories.${index}.name`)}
                disabled={!category.id.startsWith('temp-')}
              />
              
              <NumberInput
                label="Asignación (%)"
                placeholder="0"
                min={0}
                max={100}
                step={0.1}
                style={{ width: 120 }}
                {...form.getInputProps(`categories.${index}.allocation`)}
              />

              <ActionIcon
                color="red"
                variant="light"
                onClick={() => handleRemoveCategory(index)}
                disabled={form.values.categories.length <= 1}
              >
                <IconTrash size={16} />
              </ActionIcon>

              {category.id.startsWith('temp-') && (
                <Button
                  size="xs"
                  onClick={() => handleCreateNewCategory(index)}
                  disabled={!category.name.trim() || category.allocation <= 0}
                >
                  Crear
                </Button>
              )}
            </Group>
          ))}

          <Divider />

          <Group justify="space-between">
            <Button
              variant="outline"
              leftSection={<IconPlus size={16} />}
              onClick={handleAddCategory}
            >
              Agregar Categoría
            </Button>

            <Group>
              <Button
                variant="outline"
                onClick={onClose}
                disabled={isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                loading={isSubmitting}
                disabled={!isValid}
              >
                Guardar Cambios
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
