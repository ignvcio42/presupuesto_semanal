import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

async function createAdmin() {
  try {
    console.log('Iniciando creación de administrador...');
    
    // Verificar si ya existe un admin
    const existingAdmin = await db.user.findFirst({
      where: { role: 'admin' }
    });

    if (existingAdmin) {
      console.log('✅ Ya existe un administrador:', existingAdmin.email);
      console.log('Contraseña: admin123');
      return;
    }

    // Crear el administrador (sin hash por ahora)
    console.log('Creando administrador...');
    
    const admin = await db.user.create({
      data: {
        name: 'Administrador',
        email: 'admin@presupuesto.com',
        password: 'admin123', // Sin hash temporalmente
        role: 'admin',
        monthlyBudget: 0, // Los admins no necesitan presupuesto
      }
    });

    console.log('✅ Administrador creado exitosamente:');
    console.log('📧 Email:', admin.email);
    console.log('🔑 Contraseña: admin123');
    console.log('🆔 ID:', admin.id);
    console.log('👑 Rol: admin');
    
  } catch (error) {
    console.error('❌ Error al crear administrador:', error);
  } finally {
    await db.$disconnect();
  }
}

void createAdmin();
