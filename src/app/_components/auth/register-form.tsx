'use client';

import { useState } from 'react';
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
import { IconAlertCircle, IconUser, IconLock, IconMail } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { api } from '~/trpc/react';

interface RegisterFormProps {
  onSwitchToSignIn?: () => void;
}

export function RegisterForm({ onSwitchToSignIn }: RegisterFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const form = useForm({
    initialValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
    validate: {
      name: (value) => (value.length < 2 ? 'El nombre debe tener al menos 2 caracteres' : null),
      email: (value) => (/^\S+@\S+$/.test(value) ? null : 'Email inválido'),
      password: (value) => (value.length < 6 ? 'La contraseña debe tener al menos 6 caracteres' : null),
      confirmPassword: (value, values) => 
        value !== values.password ? 'Las contraseñas no coinciden' : null,
    },
  });

  const registerMutation = api.auth.register.useMutation({
    onSuccess: () => {
      notifications.show({
        title: 'Cuenta creada',
        message: 'Tu cuenta ha sido creada exitosamente. Ahora puedes iniciar sesión.',
        color: 'green',
      });
      if (onSwitchToSignIn) {
        onSwitchToSignIn();
      }
    },
    onError: (error) => {
      setError(error.message || 'Error al crear la cuenta');
      notifications.show({
        title: 'Error',
        message: error.message || 'Error al crear la cuenta',
        color: 'red',
        icon: <IconAlertCircle size={16} />,
      });
    },
  });

  const handleSubmit = async (values: typeof form.values) => {
    setIsLoading(true);
    setError('');

    try {
      console.log('Intentando registrar usuario:', values);
      
      const result = await registerMutation.mutateAsync({
        name: values.name,
        email: values.email,
        password: values.password,
      });
      console.log('Usuario registrado exitosamente:', result);
    } catch (error) {
      console.error('Error al registrar usuario:', error);
      // Error handled in onError callback
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card withBorder p="xl" style={{ maxWidth: 400, width: '100%' }}>
      <Stack gap="md">
        <Group justify="center">
          <Title order={2} ta="center">
            Crear Cuenta
          </Title>
        </Group>

        <Text size="sm" c="dimmed" ta="center">
          Crea tu cuenta para comenzar a gestionar tu presupuesto
        </Text>

        {error && (
          <Alert icon={<IconAlertCircle size={16} />} color="red" variant="light">
            {error}
          </Alert>
        )}

        <form onSubmit={form.onSubmit(handleSubmit)}>
          <Stack gap="md">
            <TextInput
              label="Nombre completo"
              placeholder="Tu nombre"
              leftSection={<IconUser size={16} />}
              {...form.getInputProps('name')}
            />

            <TextInput
              label="Email"
              placeholder="tu@email.com"
              leftSection={<IconMail size={16} />}
              {...form.getInputProps('email')}
            />

            <PasswordInput
              label="Contraseña"
              placeholder="Tu contraseña"
              leftSection={<IconLock size={16} />}
              {...form.getInputProps('password')}
            />

            <PasswordInput
              label="Confirmar contraseña"
              placeholder="Confirma tu contraseña"
              leftSection={<IconLock size={16} />}
              {...form.getInputProps('confirmPassword')}
            />

            <Button
              type="submit"
              loading={isLoading}
              fullWidth
              size="md"
            >
              Crear Cuenta
            </Button>
          </Stack>
        </form>

        {onSwitchToSignIn && (
          <>
            <Divider label="o" labelPosition="center" />
            <Group justify="center">
              <Text size="sm" c="dimmed">
                ¿Ya tienes cuenta?{' '}
                <Text
                  component="button"
                  variant="link"
                  size="sm"
                  onClick={onSwitchToSignIn}
                  style={{ cursor: 'pointer' }}
                >
                  Inicia sesión aquí
                </Text>
              </Text>
            </Group>
          </>
        )}
      </Stack>
    </Card>
  );
}
