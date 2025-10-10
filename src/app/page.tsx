'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { Center, Loader } from '@mantine/core';
import { BudgetApp } from "./_components/budget-app";
import { api } from '~/trpc/react';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const utils = api.useUtils();
  const previousUserId = useRef<string | null>(null);

  console.log('Home - Session:', session);
  console.log('Home - Status:', status);
  console.log('Home - Current path:', typeof window !== 'undefined' ? window.location.pathname : 'server');

  useEffect(() => {
    console.log('Home useEffect - Status:', status, 'Session:', session);
    
    if (status === 'loading') {
      console.log('Home - Status is loading, waiting...');
      return;
    }
    
    if (!session) {
      console.log('Home - No session, redirecting to signin...');
      router.push('/auth/signin');
      return;
    }

    console.log('Home - Session found, user ID:', session.user.id);

    // Si cambió el usuario, limpiar cache
    if (previousUserId.current && previousUserId.current !== session.user.id) {
      console.log('Home - User changed, invalidating cache...');
      void utils.invalidate();
    }
    
    previousUserId.current = session.user.id;
  }, [session, status, router, utils]);

  if (status === 'loading') {
    console.log('Home - Rendering loading state');
    return (
      <Center style={{ minHeight: '100vh' }}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (!session) {
    console.log('Home - No session, returning null (will redirect)');
    return null; // Se redirigirá automáticamente
  }

  console.log('Home - Rendering BudgetApp with session:', session.user.email);

  return (
    <main className="min-h-screen bg-gray-50">
      <BudgetApp />
    </main>
  );
}
