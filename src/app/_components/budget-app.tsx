'use client';

import { useState } from 'react';
import { api } from '~/trpc/react';
import { WelcomeScreen } from './welcome-screen';
import { BudgetDashboard } from './budget-dashboard';

export function BudgetApp() {
  const [isSetupComplete, setIsSetupComplete] = useState(false);

  // Verificar si el usuario ya tiene configuración
  const { data: user, isLoading } = api.budget.getUser.useQuery();

  const handleSetupComplete = () => {
    setIsSetupComplete(true);
  };

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
