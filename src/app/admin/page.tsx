'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Container,
  Title,
  Grid,
  Card,
  Text,
  Group,
  Badge,
  Stack,
  Alert,
  Table,
  Progress,
  Center,
  Loader,
  ActionIcon,
  Modal,
  Button,
} from '@mantine/core';
import { IconUsers, IconTrendingUp, IconAlertCircle, IconShield, IconTrash, IconChartPie, IconEdit, IconEye, IconUser } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';
import { formatCurrency } from '~/lib/date-utils';
import { Header } from '~/app/_components/header';

export default function AdminDashboard() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [deleteModalOpened, setDeleteModalOpened] = useState(false);
  const [userToDelete, setUserToDelete] = useState<any>(null);
  const [roleModalOpened, setRoleModalOpened] = useState(false);
  const [userToChangeRole, setUserToChangeRole] = useState<any>(null);
  const [userDetailsModalOpened, setUserDetailsModalOpened] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);

  // Verificar si es admin
  useEffect(() => {
    console.log('Admin page - Status:', status, 'Session:', session);
    
    if (status === 'loading') return;
    
    if (!session) {
      console.log('Admin page - No session, redirecting to signin');
      router.push('/auth/signin');
      return;
    }
    
    console.log('Admin page - User role:', session.user.role);
    
    if (session.user.role !== 'admin') {
      console.log('Admin page - Not admin, redirecting to home');
      router.push('/');
      return;
    }
    
    console.log('Admin page - Access granted');
  }, [session, status, router]);

  const { data: adminStats, isLoading: statsLoading } = api.budget.getAdminStats.useQuery(
    undefined,
    { enabled: session?.user.role === 'admin' }
  );

  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = api.budget.getAllUsers.useQuery(
    undefined,
    { enabled: session?.user.role === 'admin' }
  );

  const { data: userExpenses, isLoading: expensesLoading } = api.budget.getUserExpenses.useQuery(
    { userId: selectedUser?.id },
    { enabled: !!selectedUser }
  );

  const deleteUser = api.budget.deleteUser.useMutation({
    onSuccess: () => {
      refetchUsers();
      setDeleteModalOpened(false);
      setUserToDelete(null);
      notifications.show({
        title: 'Usuario eliminado',
        message: 'El usuario se ha eliminado correctamente',
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Error al eliminar usuario',
        color: 'red',
      });
    },
  });

  const handleDeleteUser = (user: any) => {
    setUserToDelete(user);
    setDeleteModalOpened(true);
  };

  const confirmDeleteUser = async () => {
    if (!userToDelete) return;
    await deleteUser.mutateAsync(userToDelete.id);
  };

  const createAdmin = api.auth.createAdmin.useMutation({
    onSuccess: () => {
      refetchUsers();
      notifications.show({
        title: 'Admin creado',
        message: 'El usuario administrador se ha creado correctamente',
        color: 'green',
      });
    },
    onError: (error) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Error al crear administrador',
        color: 'red',
      });
    },
  });

  const changeUserRole = api.budget.changeUserRole.useMutation({
    onSuccess: () => {
      refetchUsers();
      setRoleModalOpened(false);
      setUserToChangeRole(null);
      notifications.show({
        title: 'Rol actualizado',
        message: 'El rol del usuario se ha actualizado correctamente',
        color: 'green',
      });
    },
    onError: (error: any) => {
      notifications.show({
        title: 'Error',
        message: error.message || 'Error al cambiar rol',
        color: 'red',
      });
    },
  });

  const handleCreateAdmin = () => {
    createAdmin.mutateAsync({
      name: 'Administrador',
      email: 'admin@presupuesto.com',
      password: 'admin123',
    });
  };

  const handleChangeRole = (user: any) => {
    setUserToChangeRole(user);
    setRoleModalOpened(true);
  };

  const confirmChangeRole = async () => {
    if (!userToChangeRole) return;
    const newRole = userToChangeRole.role === 'admin' ? 'user' : 'admin';
    await changeUserRole.mutateAsync({
      userId: userToChangeRole.id,
      role: newRole,
    });
  };

  const handleViewUserDetails = (user: any) => {
    setSelectedUser(user);
    setUserDetailsModalOpened(true);
  };

  // Análisis de gastos por categoría
  const getCategoryAnalysis = (expenses: any[]) => {
    if (!expenses || expenses.length === 0) return [];
    
    const categoryTotals = expenses.reduce((acc, expense) => {
      const categoryName = expense.category?.name || 'Sin categoría';
      acc[categoryName] = (acc[categoryName] || 0) + expense.amount;
      return acc;
    }, {});

    return Object.entries(categoryTotals)
      .map(([name, amount]) => ({ name, amount: amount as number }))
      .sort((a, b) => b.amount - a.amount);
  };

  if (status === 'loading' || statsLoading || usersLoading) {
    return (
      <>
        <Header />
        <Container size="xl" py="xl">
          <Center style={{ minHeight: '50vh' }}>
            <Loader size="lg" />
          </Center>
        </Container>
      </>
    );
  }

  if (!session || session.user.role !== 'admin') {
    return (
      <>
        <Header />
        <Container size="xl" py="xl">
          <Alert icon={<IconAlertCircle size={16} />} color="red">
            No tienes permisos para acceder a esta página.
          </Alert>
        </Container>
      </>
    );
  }

  return (
    <>
      <Header />
      <Container size="xl" py="xl">
        <Stack gap="xl">
          {/* Header */}
          <Group justify="space-between">
            <div>
              <Title order={1}>
                <Group gap="sm">
                  <IconShield size={32} />
                  Panel de Administración
                </Group>
              </Title>
              <Text c="dimmed" size="lg">
                Gestión y métricas de usuarios
              </Text>
            </div>
            <Badge color="red" size="lg" variant="light">
              Administrador
            </Badge>
          </Group>

          {/* Estadísticas generales */}
          <Grid>
            <Grid.Col span={{ base: 12, md: 4 }}>
              <Card withBorder p="lg">
                <Group justify="space-between">
                  <div>
                    <Text size="sm" c="dimmed" tt="uppercase" fw={700}>
                      Total Usuarios
                    </Text>
                    <Text size="xl" fw={700}>
                      {adminStats?.totalUsers || 0}
                    </Text>
                  </div>
                  <IconUsers size={32} color="blue" />
                </Group>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 4 }}>
              <Card withBorder p="lg">
                <Group justify="space-between">
                  <div>
                    <Text size="sm" c="dimmed" tt="uppercase" fw={700}>
                      Presupuesto Total
                    </Text>
                    <Text size="xl" fw={700}>
                      {formatCurrency(adminStats?.totalBudget || 0)}
                    </Text>
                  </div>
                  <IconTrendingUp size={32} color="green" />
                </Group>
              </Card>
            </Grid.Col>

            <Grid.Col span={{ base: 12, md: 4 }}>
              <Card withBorder p="lg">
                <Group justify="space-between">
                  <div>
                    <Text size="sm" c="dimmed" tt="uppercase" fw={700}>
                      Gasto Total
                    </Text>
                    <Text size="xl" fw={700} c="red">
                      {formatCurrency(adminStats?.totalSpent || 0)}
                    </Text>
                  </div>
                  <IconAlertCircle size={32} color="red" />
                </Group>
              </Card>
            </Grid.Col>
          </Grid>

          {/* Lista de usuarios */}
          <Card withBorder>
            <Stack gap="md">
              <Group justify="space-between">
                <Title order={3}>Usuarios Registrados</Title>
                {!users?.some(u => u.role === 'admin') && (
                  <Button
                    variant="outline"
                    color="red"
                    size="sm"
                    onClick={handleCreateAdmin}
                    loading={createAdmin.isPending}
                  >
                    Crear Admin
                  </Button>
                )}
              </Group>
              
              {/* Desktop Table */}
              <div className="hidden md:block">
                <Table>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Usuario</Table.Th>
                      <Table.Th>Email</Table.Th>
                      <Table.Th>Rol</Table.Th>
                      <Table.Th>Presupuesto</Table.Th>
                      <Table.Th>Gastado</Table.Th>
                      <Table.Th>Progreso</Table.Th>
                      <Table.Th>Acciones</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {users?.map((user) => {
                      const progress = user.monthlyBudget 
                        ? (user.totalSpent / user.monthlyBudget) * 100 
                        : 0;
                      
                      return (
                        <Table.Tr key={user.id}>
                          <Table.Td>
                            <Group gap="xs">
                              {user.role === 'admin' && <IconShield size={16} color="red" />}
                              {user.role === 'user' && <IconUser size={16} color="blue" />}
                              <Text fw={500}>{user.name}</Text>
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c="dimmed">{user.email}</Text>
                          </Table.Td>
                          <Table.Td>
                            <Badge 
                              color={user.role === 'admin' ? 'red' : 'blue'}
                              variant="light"
                              size="sm"
                            >
                              {user.role === 'admin' ? 'Admin' : 'Usuario'}
                            </Badge>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm">
                              {user.monthlyBudget ? formatCurrency(user.monthlyBudget) : 'No configurado'}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="sm" c="red">
                              {formatCurrency(user.totalSpent)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Progress 
                              value={progress} 
                              size="sm" 
                              color={progress > 100 ? 'red' : progress > 80 ? 'yellow' : 'green'}
                            />
                            <Text size="xs" c="dimmed" mt={2}>
                              {progress.toFixed(1)}%
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Group gap="xs">
                              <ActionIcon
                                variant="light"
                                color="blue"
                                size="sm"
                                onClick={() => handleViewUserDetails(user)}
                              >
                                <IconEye size={14} />
                              </ActionIcon>
                              <ActionIcon
                                variant="light"
                                color="orange"
                                size="sm"
                                onClick={() => handleChangeRole(user)}
                                loading={changeUserRole.isPending}
                              >
                                <IconEdit size={14} />
                              </ActionIcon>
                              {user.role !== 'admin' && (
                                <ActionIcon
                                  variant="light"
                                  color="red"
                                  size="sm"
                                  onClick={() => handleDeleteUser(user)}
                                  loading={deleteUser.isPending}
                                >
                                  <IconTrash size={14} />
                                </ActionIcon>
                              )}
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden">
                <Stack gap="sm">
                  {users?.map((user) => {
                    const progress = user.monthlyBudget 
                      ? (user.totalSpent / user.monthlyBudget) * 100 
                      : 0;
                    
                    return (
                      <Card key={user.id} withBorder p="sm">
                        <Stack gap="xs">
                          <Group justify="space-between" align="flex-start">
                            <div>
                              <Group gap="xs">
                                {user.role === 'admin' && <IconShield size={14} color="red" />}
                                <Text fw={500} size="sm">{user.name}</Text>
                              </Group>
                              <Text size="xs" c="dimmed">{user.email}</Text>
                            </div>
                            <Group gap="xs">
                              <Badge 
                                color={user.role === 'admin' ? 'red' : 'blue'}
                                variant="light"
                                size="xs"
                              >
                                {user.role === 'admin' ? 'Admin' : 'Usuario'}
                              </Badge>
                              <ActionIcon
                                color="blue"
                                variant="light"
                                size="sm"
                                onClick={() => handleViewUserDetails(user)}
                              >
                                <IconEye size={14} />
                              </ActionIcon>
                              <ActionIcon
                                color="orange"
                                variant="light"
                                size="sm"
                                onClick={() => handleChangeRole(user)}
                                loading={changeUserRole.isPending}
                              >
                                <IconEdit size={14} />
                              </ActionIcon>
                              {user.role !== 'admin' && (
                                <ActionIcon
                                  color="red"
                                  variant="light"
                                  size="sm"
                                  onClick={() => handleDeleteUser(user)}
                                  loading={deleteUser.isPending}
                                >
                                  <IconTrash size={14} />
                                </ActionIcon>
                              )}
                            </Group>
                          </Group>
                          
                          <Group justify="space-between" align="center">
                            <div>
                              <Text size="xs" c="dimmed">Presupuesto</Text>
                              <Text size="sm" fw={500}>
                                {user.monthlyBudget ? formatCurrency(user.monthlyBudget) : 'No configurado'}
                              </Text>
                            </div>
                            <div>
                              <Text size="xs" c="dimmed">Gastado</Text>
                              <Text size="sm" fw={500} c="red">
                                {formatCurrency(user.totalSpent)}
                              </Text>
                            </div>
                          </Group>
                          
                          <div>
                            <Group justify="space-between" align="center" mb="xs">
                              <Text size="xs" c="dimmed">Progreso</Text>
                              <Text size="xs" c="dimmed">
                                {progress.toFixed(1)}%
                              </Text>
                            </Group>
                            <Progress 
                              value={progress} 
                              size="sm" 
                              color={progress > 100 ? 'red' : progress > 80 ? 'yellow' : 'green'}
                            />
                          </div>
                        </Stack>
                      </Card>
                    );
                  })}
                </Stack>
              </div>
            </Stack>
          </Card>
        </Stack>

        {/* Modal de confirmación para eliminar usuario */}
        <Modal
          opened={deleteModalOpened}
          onClose={() => {
            setDeleteModalOpened(false);
            setUserToDelete(null);
          }}
          title="Confirmar eliminación de usuario"
          size="sm"
        >
          <Stack gap="md">
            <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
              <Text size="sm">
                ¿Estás seguro de que quieres eliminar este usuario?
              </Text>
              <Text size="xs" c="dimmed" mt="xs">
                Esta acción eliminará TODOS los datos del usuario: gastos, categorías, semanas e historial.
              </Text>
            </Alert>

            {userToDelete && (
              <Card withBorder p="sm">
                <Group justify="space-between">
                  <Text size="sm" fw={500}>
                    {userToDelete.name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {userToDelete.email}
                  </Text>
                </Group>
                <Badge size="xs" variant="light" color="blue" mt="xs">
                  {userToDelete.role === 'admin' ? 'Admin' : 'Usuario'}
                </Badge>
              </Card>
            )}

            <Group justify="flex-end" mt="md">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteModalOpened(false);
                  setUserToDelete(null);
                }}
                disabled={deleteUser.isPending}
              >
                Cancelar
              </Button>
              <Button
                color="red"
                onClick={confirmDeleteUser}
                loading={deleteUser.isPending}
              >
                Eliminar Usuario
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Modal de cambio de rol */}
        <Modal
          opened={roleModalOpened}
          onClose={() => {
            setRoleModalOpened(false);
            setUserToChangeRole(null);
          }}
          title="Cambiar rol de usuario"
          size="sm"
        >
          <Stack gap="md">
            <Alert icon={<IconShield size={16} />} color="orange" variant="light">
              <Text size="sm">
                ¿Estás seguro de que quieres cambiar el rol de este usuario?
              </Text>
              <Text size="xs" c="dimmed" mt="xs">
                {userToChangeRole?.role === 'admin' 
                  ? 'El usuario perderá permisos de administrador.'
                  : 'El usuario obtendrá permisos de administrador.'
                }
              </Text>
            </Alert>

            {userToChangeRole && (
              <Card withBorder p="sm">
                <Group justify="space-between">
                  <Text size="sm" fw={500}>
                    {userToChangeRole.name}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {userToChangeRole.email}
                  </Text>
                </Group>
                <Group mt="xs">
                  <Text size="xs" c="dimmed">Rol actual:</Text>
                  <Badge size="xs" variant="light" color="blue">
                    {userToChangeRole.role === 'admin' ? 'Admin' : 'Usuario'}
                  </Badge>
                  <Text size="xs" c="dimmed">→</Text>
                  <Badge size="xs" variant="light" color="orange">
                    {userToChangeRole.role === 'admin' ? 'Usuario' : 'Admin'}
                  </Badge>
                </Group>
              </Card>
            )}

            <Group justify="flex-end" mt="md">
              <Button
                variant="outline"
                onClick={() => {
                  setRoleModalOpened(false);
                  setUserToChangeRole(null);
                }}
                disabled={changeUserRole.isPending}
              >
                Cancelar
              </Button>
              <Button
                color="orange"
                onClick={confirmChangeRole}
                loading={changeUserRole.isPending}
              >
                Cambiar Rol
              </Button>
            </Group>
          </Stack>
        </Modal>

        {/* Modal de detalles del usuario */}
        <Modal
          opened={userDetailsModalOpened}
          onClose={() => {
            setUserDetailsModalOpened(false);
            setSelectedUser(null);
          }}
          title="Análisis de gastos del usuario"
          size="lg"
        >
          {selectedUser && (
            <Stack gap="md">
              {/* Información del usuario */}
              <Card withBorder p="sm">
                <Group justify="space-between">
                  <div>
                    <Text fw={500}>{selectedUser.name}</Text>
                    <Text size="sm" c="dimmed">{selectedUser.email}</Text>
                  </div>
                  <Badge color={selectedUser.role === 'admin' ? 'red' : 'blue'} variant="light">
                    {selectedUser.role === 'admin' ? 'Admin' : 'Usuario'}
                  </Badge>
                </Group>
                <Group mt="sm" justify="space-between">
                  <div>
                    <Text size="xs" c="dimmed">Presupuesto mensual</Text>
                    <Text size="sm" fw={500}>
                      {selectedUser.monthlyBudget ? formatCurrency(selectedUser.monthlyBudget) : 'No configurado'}
                    </Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">Total gastado</Text>
                    <Text size="sm" fw={500} c="red">
                      {formatCurrency(selectedUser.totalSpent)}
                    </Text>
                  </div>
                </Group>
              </Card>

              {/* Lista de gastos */}
              {expensesLoading ? (
                <Center py="xl">
                  <Loader size="sm" />
                </Center>
              ) : (
                <>
                  <Title order={4}>
                    <Group gap="sm">
                      <IconChartPie size={20} />
                      Gastos del usuario ({userExpenses?.length || 0})
                    </Group>
                  </Title>
                  
                  {userExpenses && userExpenses.length > 0 ? (
                    <Stack gap="xs">
                      {userExpenses.map((expense, index) => (
                        <Group key={index} justify="space-between" align="center" p="sm" style={{ 
                          border: '1px solid #e9ecef', 
                          borderRadius: '6px',
                          backgroundColor: index % 2 === 0 ? '#f8f9fa' : 'white'
                        }}>
                          <div style={{ flex: 1 }}>
                            <Text size="sm" fw={500}>{expense.description}</Text>
                            <Group gap="xs" mt={2}>
                              <Text size="xs" c="dimmed">
                                {expense.category?.name || 'Sin categoría'}
                              </Text>
                              <Text size="xs" c="dimmed">•</Text>
                              <Text size="xs" c="dimmed">
                                {new Date(expense.createdAt).toLocaleDateString('es-ES', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric'
                                })}
                              </Text>
                            </Group>
                          </div>
                          <Text size="sm" fw={600} c="red">
                            {formatCurrency(expense.amount)}
                          </Text>
                        </Group>
                      ))}
                    </Stack>
                  ) : (
                    <Alert color="gray">
                      <Text size="sm">Este usuario no tiene gastos registrados.</Text>
                    </Alert>
                  )}
                </>
              )}
            </Stack>
          )}
        </Modal>
      </Container>
    </>
  );
}
