import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { createTRPCRouter, publicProcedure } from '../trpc';
import { getDefaultCategories } from '~/lib/date-utils';

export const authRouter = createTRPCRouter({
  // Endpoint de prueba
  test: publicProcedure
    .query(() => {
      return { message: 'TRPC está funcionando correctamente' };
    }),

  register: publicProcedure
    .input(z.object({
      name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
      email: z.string().email('Email inválido'),
      password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
    }))
    .mutation(async ({ ctx, input }) => {
      try {
        console.log('Iniciando registro de usuario:', input);
        
        // Verificar conexión a la base de datos
        console.log('Verificando conexión a la base de datos...');
        const dbTest = await ctx.db.user.count();
        console.log('Conexión a la base de datos OK, usuarios existentes:', dbTest);

        const { name, email, password } = input;

        // Verificar si el usuario ya existe
        console.log('Verificando si el usuario ya existe...');
        const existingUser = await ctx.db.user.findUnique({
          where: { email }
        });

        if (existingUser) {
          console.log('Usuario ya existe:', existingUser.email);
          throw new TRPCError({
            code: 'CONFLICT',
            message: 'Ya existe un usuario con este email'
          });
        }

        // Crear el usuario (sin hash por ahora)
        console.log('Creando nuevo usuario...');
        const user = await ctx.db.user.create({
          data: {
            name,
            email,
            password, // Sin hash temporalmente
            role: 'user',
            budgetMode: 'categorized', // Por defecto modo categorizado
          }
        });

        // Crear categorías predeterminadas
        console.log('Creando categorías predeterminadas...');
        const defaultCategories = getDefaultCategories();
        await ctx.db.category.createMany({
          data: defaultCategories.map(cat => ({
            name: cat.name,
            allocation: cat.suggestedPercentage,
            userId: user.id,
          })),
        });

        console.log('Usuario creado exitosamente:', user.id);
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      } catch (error) {
        console.error('Error completo en register:', error);
        console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Error interno del servidor: ${error instanceof Error ? error.message : 'Error desconocido'}`
        });
      }
    }),

  // Crear usuario admin (solo para setup inicial)
  createAdmin: publicProcedure
    .input(z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
    }))
    .mutation(async ({ ctx, input }) => {
      const { name, email, password } = input;

      // Verificar si ya existe un admin
      const existingAdmin = await ctx.db.user.findFirst({
        where: { role: 'admin' }
      });

      if (existingAdmin) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'Ya existe un administrador'
        });
      }

      const hashedPassword = password; // TODO: Implementar hash cuando se instale bcryptjs

      const admin = await ctx.db.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: 'admin',
        }
      });

      return {
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      };
    }),
});
