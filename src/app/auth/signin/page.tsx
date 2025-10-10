'use client';

import { useState } from 'react';
import { Container, Center, Stack, Title, Text } from '@mantine/core';
import { SignInForm } from '~/app/_components/auth/signin-form';
import { RegisterForm } from '~/app/_components/auth/register-form';

export default function AuthPage() {
  const [isSignIn, setIsSignIn] = useState(true);

  return (
    <Container size="sm" py="xl">
      <Center style={{ minHeight: '100vh' }}>
        <Stack gap="xl" align="center">
          <Stack gap="xs" align="center">
            <Title order={1} ta="center">
              Presupuesto Semanal
            </Title>
            <Text size="lg" c="dimmed" ta="center">
              Gestiona tus finanzas personales de manera inteligente
            </Text>
          </Stack>

          {isSignIn ? (
            <SignInForm onSwitchToRegister={() => setIsSignIn(false)} />
          ) : (
            <RegisterForm onSwitchToSignIn={() => setIsSignIn(true)} />
          )}
        </Stack>
      </Center>
    </Container>
  );
}
