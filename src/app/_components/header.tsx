'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Group,
  Text,
  Menu,
  Avatar,
  Badge,
  Container,
  Box,
} from '@mantine/core';
import {
  IconLogout,
  IconUser,
  IconSettings,
  IconDashboard,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';

export function Header() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = api.useUtils();

  const handleSignOut = async () => {
    try {
      // Limpiar todo el cache de TRPC antes de cerrar sesión
      await utils.invalidate();
      
      await signOut({ redirect: false });
      notifications.show({
        title: 'Sesión cerrada',
        message: 'Has cerrado sesión correctamente',
        color: 'blue',
      });
      router.push('/auth/signin');
    } catch {
      notifications.show({
        title: 'Error',
        message: 'Error al cerrar sesión',
        color: 'red',
      });
    }
  };

  if (status === 'loading') {
    return (
      <Box p="md" style={{ height: 60, borderBottom: '1px solid #e9ecef' }}>
        <Container size="xl">
          <Group justify="space-between" align="center" h="100%">
            <Text fw={700} size="lg">
              Presupuesto Semanal
            </Text>
            <Text size="sm" c="dimmed">
              Cargando...
            </Text>
          </Group>
        </Container>
      </Box>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <Box p="md" style={{ height: 60, borderBottom: '1px solid #e9ecef' }}>
      <Container size="xl">
        <Group justify="space-between" align="center" h="100%">
          <Group>
            <Text fw={700} size="lg">
              <a href="/">Presupuesto Semanal</a>
            </Text>
            {session.user.role === 'admin' && (
              <Badge color="red" variant="light">
                Admin
              </Badge>
            )}
          </Group>

          <Group>
            <Text size="sm" c="dimmed">
              Hola, {session.user.name}
            </Text>
            
            <Menu shadow="md" width={300}>
              <Menu.Target>
                <Avatar
                  size="sm"
                  radius="xl"
                  style={{ cursor: 'pointer' }}
                >
                  {session.user.name?.charAt(0).toUpperCase()}
                </Avatar>
              </Menu.Target>

              <Menu.Dropdown>
                <Menu.Label>Cuenta</Menu.Label>
                <Menu.Item leftSection={<IconUser size={14} />}>
                  {session.user.email}
                </Menu.Item>
                
                {session.user.role === 'admin' && (
                  <Menu.Item 
                    leftSection={<IconDashboard size={14} />}
                    onClick={() => router.push('/admin')}
                  >
                    Panel de Admin
                  </Menu.Item>
                )}
                
                <Menu.Item leftSection={<IconSettings size={14} />}>
                  Configuración
                </Menu.Item>

                <Menu.Divider />

                <Menu.Item
                  leftSection={<IconLogout size={14} />}
                  onClick={handleSignOut}
                  color="red"
                >
                  Cerrar Sesión
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>
        </Group>
      </Container>
    </Box>
  );
}
