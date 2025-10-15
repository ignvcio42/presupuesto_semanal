'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { api } from '~/trpc/react';
import { WelcomeScreen } from './welcome-screen';
import { BudgetDashboard } from './budget-dashboard';

export function BudgetApp() {
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const { data: session } = useSession();
  const utils = api.useUtils();
  const previousUserId = useRef<string | null>(null);

  // Verificar si el usuario ya tiene configuración
  const { data: user, isLoading, error } = api.budget.getUser.useQuery(undefined, {
    retry: 2, // Solo reintentar 2 veces
    retryDelay: 1000, // Esperar 1 segundo entre reintentos
  });

  // console.log('BudgetApp - Session:', session);
  // console.log('BudgetApp - User:', user);
  // console.log('BudgetApp - Loading:', isLoading);
  // console.log('BudgetApp - Error:', error);
  // console.log('BudgetApp - isSetupComplete:', isSetupComplete);

  // Resetear estado cuando cambia el usuario
  useEffect(() => {
    if (session?.user.id && previousUserId.current && previousUserId.current !== session.user.id) {
      setIsSetupComplete(false);
      // Invalidar todas las queries para el nuevo usuario
      void utils.invalidate();
    }
    previousUserId.current = session?.user.id ?? null;
  }, [session?.user.id, utils]);

  const handleSetupComplete = () => {
    setIsSetupComplete(true);
  };

  // Mostrar error si falla la carga
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto p-6">
          <div className="text-red-600 text-5xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Error al cargar usuario</h2>
          <p className="text-gray-600 mb-4">
            {error.message || 'No se pudo cargar la información del usuario'}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Recargar página
          </button>
        </div>
      </div>
    );
  }

  // Mostrar loading mientras se carga la información del usuario
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  // Si el usuario no tiene presupuesto configurado, mostrar pantalla de bienvenida
  if (!user?.monthlyBudget || user.monthlyBudget === 0) {
    return <WelcomeScreen onSetupComplete={handleSetupComplete} />;
  }

  // Si ya está configurado, mostrar el dashboard
  return <BudgetDashboard />;
}
