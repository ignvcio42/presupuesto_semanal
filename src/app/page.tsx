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

  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/signin');
      return;
    }

    // Si cambió el usuario, limpiar cache
    if (previousUserId.current && previousUserId.current !== session.user.id) {
      utils.invalidate();
    }
    
    previousUserId.current = session.user.id;
  }, [session, status, router, utils]);

  if (status === 'loading') {
    return (
      <Center style={{ minHeight: '100vh' }}>
        <Loader size="lg" />
      </Center>
    );
  }

  if (!session) {
    return null; // Se redirigirá automáticamente
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <BudgetApp />
    </main>
  );
}
