'use client';

import { useState, useEffect } from 'react';
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
  Divider,
  Card,
  Badge,
  Tooltip,
  Switch,
  Flex,
  Box,
  Title
} from '@mantine/core';
import { useForm } from '@mantine/form';
import {
  IconPlus,
  IconTrash,
  IconAlertCircle,
  IconEdit,
  IconCheck,
  IconX,
  IconWand,
  IconInfoCircle,
  IconRefresh,
  IconLock,
  IconLockOpen
} from '@tabler/icons-react';
import { api } from '~/trpc/react';
import { formatCurrency, getWeeksOfMonth } from '~/lib/date-utils';

interface CategorySettingsProps {
  opened: boolean;
  onClose: () => void;
  categories: Array<{ id: string; name: string; allocation: number }>;
  monthlyBudget?: number | null;
  onSuccess?: () => void;
}

export function CategorySettings({ opened, onClose, categories, monthlyBudget = 100000, onSuccess }: CategorySettingsProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoHelp, setAutoHelp] = useState(true);
  const [editingCategory, setEditingCategory] = useState<string | null>(null);

  const form = useForm({
    initialValues: {
      categories: categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        allocation: Math.round(cat.allocation), // Redondear a números enteros
        isEditing: false,
        isLocked: false, // Nueva propiedad para bloquear categorías
      })),
    },
  });

  // Actualizar el formulario cuando cambien las categorías
  useEffect(() => {
    form.setValues({
      categories: categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        allocation: Math.round(cat.allocation), // Redondear a números enteros
        isEditing: false,
        isLocked: false,
      })),
    });
  }, [categories]);

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

  const updateCategory = api.budget.updateCategory.useMutation({
    onSuccess: () => {
      onSuccess?.();
    },
  });

  const deleteCategory = api.budget.deleteCategory.useMutation({
    onSuccess: () => {
      onSuccess?.();
    },
    onError: (error) => {
      console.error('Error al eliminar categoría:', error);
      alert('Error al eliminar la categoría. Por favor, inténtalo de nuevo.');
    },
  });

  const totalAllocation = form.values.categories.reduce((sum, cat) => sum + cat.allocation, 0);
  const isValid = totalAllocation === 100;
  const difference = 100 - totalAllocation;

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

  // Función de ayuda automática para redistribuir porcentajes
  const handleAutoRedistribute = () => {
    const categories = form.values.categories;
    if (categories.length === 0) return;

    const currentTotal = categories.reduce((sum, cat) => sum + cat.allocation, 0);
    if (currentTotal === 100) return; // Ya está en 100%

    // Separar categorías bloqueadas y no bloqueadas
    const lockedCategories = categories.filter(cat => cat.isLocked);
    const unlockedCategories = categories.filter(cat => !cat.isLocked);

    // Calcular el total de las categorías bloqueadas
    const lockedTotal = lockedCategories.reduce((sum, cat) => sum + cat.allocation, 0);
    const availableForDistribution = 100 - lockedTotal;

    if (unlockedCategories.length === 0) {
      // Si todas están bloqueadas, no se puede redistribuir
      return;
    }

    // Redistribuir solo las categorías no bloqueadas
    const unlockedTotal = unlockedCategories.reduce((sum, cat) => sum + cat.allocation, 0);
    const factor = availableForDistribution / unlockedTotal;

    const redistributedUnlocked = unlockedCategories.map(cat => ({
      ...cat,
      allocation: Math.round(cat.allocation * factor)
    }));

    // Ajustar el último elemento no bloqueado para que sume exactamente el disponible
    const newUnlockedTotal = redistributedUnlocked.reduce((sum, cat) => sum + cat.allocation, 0);
    const adjustment = availableForDistribution - newUnlockedTotal;
    if (adjustment !== 0 && redistributedUnlocked.length > 0) {
      redistributedUnlocked[redistributedUnlocked.length - 1]!.allocation += adjustment;
    }

    // Combinar categorías bloqueadas y redistribuidas
    const allCategories = [...lockedCategories, ...redistributedUnlocked];
    form.setValues({ categories: allCategories });
  };

  // Función para sugerir asignación automática
  const handleSuggestAllocation = (index: number) => {
    const categories = form.values.categories;
    const currentCategory = categories[index];

    if (!currentCategory || currentCategory.isLocked) return;

    // Calcular el porcentaje disponible (excluyendo la categoría actual)
    const availablePercentage = 100 - categories.reduce((sum, cat, i) =>
      i === index ? sum : sum + cat.allocation, 0
    );

    if (availablePercentage > 0) {
      const suggestedAllocation = Math.round(Math.max(availablePercentage, 1));
      form.setFieldValue(`categories.${index}.allocation`, suggestedAllocation);
    }
  };

  const handleAddCategory = () => {
    const availablePercentage = 100 - totalAllocation;
    const suggestedAllocation = Math.min(availablePercentage * 0.3, 20);

    form.insertListItem('categories', {
      id: `temp-${Date.now()}`,
      name: '',
      allocation: Math.max(Math.round(suggestedAllocation), 1),
      isEditing: true,
    });
  };

  const handleRemoveCategory = (index: number) => {
    const category = form.values.categories[index];
    if (!category) return;

    // Si es una categoría temporal, simplemente la eliminamos del formulario
    if (category.id.startsWith('temp-')) {
      form.removeListItem('categories', index);
      return;
    }

    // Si es una categoría real, la eliminamos de la base de datos
    deleteCategory.mutate(category.id, {
      onSuccess: () => {
        form.removeListItem('categories', index);

        // Si está habilitada la ayuda automática, redistribuir
        if (autoHelp && form.values.categories.length > 1) {
          setTimeout(() => handleAutoRedistribute(), 100);
        }
      },
    });
  };

  const handleCreateNewCategory = async (index: number) => {
    const category = form.values.categories[index];
    if (category && category.name.trim() && category.allocation > 0) {
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

  const handleEditCategory = (index: number) => {
    setEditingCategory(form.values.categories[index]?.id || null);
  };

  const handleSaveCategory = async (index: number) => {
    const category = form.values.categories[index];
    if (category && !category.id.startsWith('temp-')) {
      try {
        await updateCategory.mutateAsync({
          id: category.id,
          data: {
            name: category.name,
            allocation: category.allocation,
          },
        });
        setEditingCategory(null);
      } catch (error) {
        console.error('Error al actualizar categoría:', error);
      }
    }
  };

  const handleCancelEdit = (index: number) => {
    const originalCategory = categories.find(cat => cat.id === form.values.categories[index]?.id);
    if (originalCategory) {
      form.setFieldValue(`categories.${index}.name`, originalCategory.name);
      form.setFieldValue(`categories.${index}.allocation`, Math.round(originalCategory.allocation));
    }
    setEditingCategory(null);
  };

  // Función para bloquear/desbloquear categorías
  const handleToggleLock = (index: number) => {
    const currentLocked = form.values.categories[index]?.isLocked || false;
    form.setFieldValue(`categories.${index}.isLocked`, !currentLocked);
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
          {/* Header con información de estado */}
          <Card withBorder p="md">
            <Flex justify="space-between" align="center" mb="sm">
              <Title order={4}>Distribución del Presupuesto</Title>
              <Badge
                color={isValid ? 'green' : totalAllocation > 100 ? 'red' : 'yellow'}
                variant="light"
              >
                {isValid ? (
                  <Group gap="xs">
                    <IconCheck size={12} />
                    <Text size="xs">100%</Text>
                  </Group>
                ) : (
                  <Group gap="xs">
                    <IconX size={12} />
                    <Text size="xs">{totalAllocation.toFixed(1)}%</Text>
                  </Group>
                )}
              </Badge>
            </Flex>

            <Progress
              value={Math.min(totalAllocation, 100)}
              color={isValid ? 'green' : totalAllocation > 100 ? 'red' : 'yellow'}
              size="lg"
              radius="xl"
              mb="sm"
            />

            <Group justify="space-between" align="center">
              <Text size="sm" c={isValid ? 'green' : totalAllocation > 100 ? 'red' : 'yellow'}>
                {isValid
                  ? 'Distribución perfecta ✓'
                  : totalAllocation > 100
                    ? `Excede por ${(totalAllocation - 100).toFixed(1)}%`
                    : `Faltan ${(100 - totalAllocation).toFixed(1)}%`
                }
              </Text>

              {!isValid && (
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconWand size={14} />}
                  onClick={handleAutoRedistribute}
                >
                  Auto-redistribuir
                </Button>
              )}
            </Group>
          </Card>

          {/* Opciones de ayuda */}
          <Card withBorder p="sm">
            <Group justify="space-between" align="center">
              <Group gap="xs">
                <IconInfoCircle size={16} />
                <Text size="sm" fw={500}>Ayuda Automática</Text>
              </Group>
              <Switch
                label="Redistribución automática"
                checked={autoHelp}
                onChange={(event) => setAutoHelp(event.currentTarget.checked)}
                size="sm"
              />
            </Group>
            {autoHelp && (
              <Text size="xs" c="dimmed" mt="xs">
                Al eliminar categorías, los porcentajes se redistribuirán automáticamente para mantener 100%.
                Las categorías bloqueadas (🔒) mantendrán su porcentaje fijo.
              </Text>
            )}
          </Card>

          {/* Lista de categorías */}
          <Stack gap="sm">
            <Text size="sm" fw={500}>Categorías</Text>
            {form.values.categories.map((category, index) => {
              const isEditing = editingCategory === category.id || category.id.startsWith('temp-');
              const isNew = category.id.startsWith('temp-');

              return (
                <Card key={category.id} withBorder p="sm">
                  <Group align="flex-end">
                    <TextInput
                      label="Nombre"
                      placeholder="Nombre de la categoría"
                      style={{ flex: 1 }}
                      {...form.getInputProps(`categories.${index}.name`)}
                      disabled={!isEditing}
                    />

                    <NumberInput
                      label="Asignación (%)"
                      placeholder="0"
                      min={0}
                      max={100}
                      step={1}
                      allowDecimal={false}
                      style={{ width: 120 }}
                      {...form.getInputProps(`categories.${index}.allocation`)}
                      disabled={category.isLocked}
                    />

                    {/* Botones de acción */}
                    <Group gap="xs">
                      {/* Botón de bloqueo/desbloqueo */}
                      <Tooltip label={category.isLocked ? "Desbloquear categoría" : "Bloquear categoría"}>
                        <ActionIcon
                          color={category.isLocked ? "orange" : "gray"}
                          variant="light"
                          onClick={() => handleToggleLock(index)}
                        >
                          {category.isLocked ? <IconLock size={16} /> : <IconLockOpen size={16} />}
                        </ActionIcon>
                      </Tooltip>

                      {isEditing ? (
                        <>
                          {isNew ? (
                            <Button
                              size="xs"
                              onClick={() => handleCreateNewCategory(index)}
                              disabled={!category.name.trim() || category.allocation <= 0}
                            >
                              Crear
                            </Button>
                          ) : (
                            <>
                              <Tooltip label="Guardar cambios">
                                <ActionIcon
                                  color="green"
                                  variant="light"
                                  onClick={() => handleSaveCategory(index)}
                                  disabled={!category.name.trim() || category.allocation <= 0}
                                >
                                  <IconCheck size={16} />
                                </ActionIcon>
                              </Tooltip>
                              <Tooltip label="Cancelar">
                                <ActionIcon
                                  color="gray"
                                  variant="light"
                                  onClick={() => handleCancelEdit(index)}
                                >
                                  <IconX size={16} />
                                </ActionIcon>
                              </Tooltip>
                            </>
                          )}
                        </>
                      ) : (
                        <Tooltip label="Editar categoría">
                          <ActionIcon
                            color="blue"
                            variant="light"
                            onClick={() => handleEditCategory(index)}
                          >
                            <IconEdit size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}

                      <Tooltip label={form.values.categories.length <= 1 ? "No se puede eliminar la última categoría" : "Eliminar categoría"}>
                        <ActionIcon
                          color="red"
                          variant="light"
                          onClick={() => handleRemoveCategory(index)}
                          disabled={form.values.categories.length <= 1 || deleteCategory.isPending}
                          loading={deleteCategory.isPending}
                        >
                          <IconTrash size={16} />
                        </ActionIcon>
                      </Tooltip>

                      {!isValid && !isEditing && !category.isLocked && (
                        <Tooltip label="Sugerir asignación">
                          <ActionIcon
                            color="yellow"
                            variant="light"
                            onClick={() => handleSuggestAllocation(index)}
                          >
                            <IconRefresh size={16} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  </Group>

                  {/* Mostrar información adicional */}
                  <Group justify="space-between" align="center" mt="xs">
                    {category.allocation > 0 && monthlyBudget && (() => {
                      const currentDate = new Date();
                      const monthInfo = getWeeksOfMonth(currentDate.getFullYear(), currentDate.getMonth() + 1, monthlyBudget);
                      const weeklyAmount = (category.allocation / 100) * monthlyBudget / monthInfo.totalWeeks;
                      return (
                        <Text size="xs" c="dimmed">
                          ≈ {formatCurrency(weeklyAmount)} semanal
                        </Text>
                      );
                    })()}
                    {category.isLocked && (
                      <Badge size="xs" color="orange" variant="light">
                        <Group gap={4}>
                          <IconLock size={10} />
                          <Text size="xs">Bloqueada</Text>
                        </Group>
                      </Badge>
                    )}
                  </Group>
                </Card>
              );
            })}
          </Stack>

          <Divider />

          <div className='flex flex-col gap-2'>
            <Text size="sm" fw={500}>Total: {formatCurrency(monthlyBudget || 0)} mensual</Text>
          </div>
          <div>
            <Group justify="space-between">
              <Button
                variant="outline"
                leftSection={<IconPlus size={16} />}
                onClick={handleAddCategory}
                disabled={totalAllocation >= 100}
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

          </div>
        </Stack>
      </form>
    </Modal>
  );
}
