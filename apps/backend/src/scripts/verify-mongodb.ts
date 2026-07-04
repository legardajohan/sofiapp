import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function verifyMongoDB() {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.error('❌ MONGODB_URI no está configurada en .env');
    process.exit(1);
  }

  console.log('🔄 Intentando conectar a MongoDB...');
  console.log(`📍 URI: ${mongoUri.replace(/:[^:]*@/, ':****@')}`);

  try {
    // Conectar a MongoDB
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 5000,
    });

    console.log('✅ Conexión a MongoDB exitosa!');

    // Obtener información de la conexión
    const connection = mongoose.connection;
    console.log('\n📊 Información de conexión:');
    console.log(`   • Host: ${connection.host}`);
    console.log(`   • Puerto: ${connection.port}`);
    console.log(`   • Base de datos: ${connection.name}`);
    console.log(`   • Estado: ${connection.readyState === 1 ? 'Conectado' : 'Desconectado'}`);

    // Intentar hacer un ping
    const result = await connection.db?.admin().ping();
    if (result) {
      console.log('\n🏓 Ping a MongoDB: OK');
    }

    // Listar colecciones (si existen)
    const collections = await connection.db?.listCollections().toArray();
    if (collections && collections.length > 0) {
      console.log(`\n📦 Colecciones existentes (${collections.length}):`);
      collections.forEach((col) => {
        console.log(`   • ${col.name}`);
      });
    } else {
      console.log('\n📦 No hay colecciones aún (base de datos vacía)');
    }

    console.log('\n✨ Verificación completada exitosamente!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error al conectar a MongoDB:');
    if (error instanceof Error) {
      console.error(`   ${error.message}`);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

verifyMongoDB();
