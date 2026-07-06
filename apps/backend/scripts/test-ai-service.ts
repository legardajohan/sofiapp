import mongoose from 'mongoose';
import { Redis } from 'ioredis';
import { env } from '../src/config/env.js';
import { PromptTemplateModel } from '../src/services/ai/prompt-template.model.js';
import { createAIService } from '../src/services/ai/ai.service.js';
import { Types } from 'mongoose';

const HISTORIAL_PRUEBA = [
  { role: 'user' as const, content: '¿Qué incluye el plan básico de SofiApp?' },
  { role: 'model' as const, content: 'El plan básico incluye CRM, WhatsApp y hasta 3 asesores.' },
  { role: 'user' as const, content: 'Me interesa, ¿cuánto cuesta?' },
];

async function main(): Promise<void> {
  const redis = new Redis({ host: env.REDIS_HOST, port: env.REDIS_PORT });
  await mongoose.connect(env.MONGODB_URI);

  // Seed de plantilla global si no existe
  const exists = await PromptTemplateModel.findOne({ tenantId: null, method: 'chat', isActive: true });
  if (!exists) {
    await PromptTemplateModel.create({
      tenantId: null, method: 'chat', version: '1.0.0', isActive: true,
      systemPrompt: 'Eres un asesor comercial de SofiApp. Sé conciso y profesional.',
    });
    console.log('[seed] plantilla global creada');
  }

  const service = createAIService(redis);
  const tenantId = new Types.ObjectId();
  const params = { tenantId, historial: HISTORIAL_PRUEBA };

  console.log('\n--- Primera llamada (debe ser cacheHit: false) ---');
  const r1 = await service.chat(params);
  console.log(JSON.stringify({ cacheHit: r1.cacheHit, totalTokens: r1.totalTokens, data: r1.data.slice(0, 80) + '...' }, null, 2));

  console.log('\n--- Segunda llamada (debe ser cacheHit: true, totalTokens: 0) ---');
  const r2 = await service.chat(params);
  console.log(JSON.stringify({ cacheHit: r2.cacheHit, totalTokens: r2.totalTokens, data: r2.data.slice(0, 80) + '...' }, null, 2));

  console.log('\n--- Verificación DoD ---');
  console.log('✓ Primera llamada cacheHit:', r1.cacheHit === false ? 'false ✅' : 'FALLO ❌');
  console.log('✓ Segunda llamada cacheHit:', r2.cacheHit === true ? 'true ✅' : 'FALLO ❌');
  console.log('✓ Segunda llamada totalTokens:', r2.totalTokens === 0 ? '0 ✅' : 'FALLO ❌');
  console.log('✓ Respuesta consistente:', r1.data === r2.data ? 'igual ✅' : 'FALLO ❌');

  await mongoose.disconnect();
  redis.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
