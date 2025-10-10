'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Card,
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Title,
  Text,
  Alert,
  Group,
  Divider,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertCircle, IconUser, IconLock } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';

interface SignInFormProps {
  onSwitchToRegister?: () => void;
}

export function SignInForm({ onSwitchToRegister }: SignInFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const utils = api.useUtils();

  const form = useForm({
    initialValues: {
      email: '',
      password: '',
    },
    validate: {
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Email inválido'),
      password: (value) => (value.length < 6 ? 'La contraseña debe tener al menos 6 caracteres' : null),
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setIsLoading(true);
    setError('');

    try {
      const result = await signIn('credentials', {
        email: values.email,
        password: values.password,
        redirect: false,
      });

      if (result?.error) {
        setError('Email o contraseña incorrectos');
        notifications.show({
          title: 'Error de autenticación',
          message: 'Email o contraseña incorrectos',
          color: 'red',
          icon: <IconAlertCircle size={16} />,
        });
      } else {
        // Limpiar cache antes de redirigir
        await utils.invalidate();
        
        notifications.show({
          title: 'Bienvenido',
          message: 'Has iniciado sesión correctamente',
          color: 'green',
        });
        router.push('/');
        router.refresh();
      }
    } catch (error) {
      setError('Error al iniciar sesión');
      notifications.show({
        title: 'Error',
        message: 'Error al iniciar sesión. Inténtalo de nuevo.',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card withBorder p="xl" style={{ maxWidth: 400, width: '100%' }}>
      <Stack gap="md">
        <Group justify="center">
          <Title order={2} ta="center">
            Iniciar Sesión
          </Title>
        </Group>

        <Text size="sm" c="dimmed" ta="center">
          Ingresa tus credenciales para acceder a tu presupuesto
        </Text>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput
              label="Email"
              placeholder="tu@email.com"
              leftSection={<IconUser size={16} />}
              {...form.getInputProps('email')}
            />

            <PasswordInput
              label="Contraseña"
              placeholder="Tu contraseña"
              leftSection={<IconLock size={16} />}
              {...form.getInputProps('password')}
            />

            <Button
              type="submit"
              loading={isLoading}
              fullWidth
              size="md"
            >
              Iniciar Sesión
            </Button>
          </Stack>
        </form>

        {onSwitchToRegister && (
          <>
            <Divider label="o" labelPosition="center" />
            <Group justify="center">
              <Text size="sm" c="dimmed">
                ¿No tienes cuenta?{' '}
                <Text
                  component="button"
                  variant="link"
                  size="sm"
                  onClick={onSwitchToRegister}
                  style={{ cursor: 'pointer' }}
                >
                  Regístrate aquí
                </Text>
              </Text>
            </Group>
          </>
        )}
      </Stack>
    </Card>
  );
}
