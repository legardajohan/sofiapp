import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { PromptTemplateModel } from '../src/services/ai/prompt-template.model.js';

const GLOBAL_TEMPLATES = [
  {
    tenantId: null,
    method: 'chat' as const,
    version: '1.0.0',
    isActive: true,
    systemPrompt: `Eres un asesor comercial amable y profesional de SofiApp CRM.
Tu objetivo es guiar al prospecto, resolver sus dudas y avanzar hacia el cierre de venta.
Sé conciso, empático y orientado a resultados. Habla siempre en español.`,
  },
  {
    tenantId: null,
    method: 'extract' as const,
    version: '1.0.0',
    isActive: true,
    systemPrompt: `Extrae la información solicitada de la conversación.
Devuelve únicamente los campos pedidos en formato JSON.
Si un campo no aparece en la conversación, omítelo del resultado.`,
  },
  {
    tenantId: null,
    method: 'classify' as const,
    version: '1.0.0',
    isActive: true,
    systemPrompt: `Analiza la conversación y determina el nivel de interés del prospecto.
nivelInteres: 'frio' si no hay interés claro, 'tibio' si hay curiosidad moderada, 'caliente' si hay intención de compra.
objecion: la principal objeción detectada ('precio', 'tiempo', 'confianza', 'otra') o null si no hay objeción.`,
  },
  {
    tenantId: null,
    method: 'summary' as const,
    version: '1.0.0',
    isActive: true,
    systemPrompt: `Resume la conversación entre el asesor y el prospecto en español, de forma breve y neutral.
Incluye: la intención o necesidad del prospecto, sus objeciones, los acuerdos alcanzados y el próximo paso pendiente.
No inventes datos que no aparezcan en la conversación. Devuelve solo el resumen, sin encabezados ni viñetas superfluas.`,
  },
];

async function main(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  console.log('Conectado a MongoDB');

  for (const tpl of GLOBAL_TEMPLATES) {
    const existing = await PromptTemplateModel.findOne({
      tenantId: null,
      method: tpl.method,
      isActive: true,
    });
    if (existing) {
      console.log(`[skip] plantilla global '${tpl.method}' ya existe`);
      continue;
    }
    await PromptTemplateModel.create(tpl);
    console.log(`[ok]   plantilla global '${tpl.method}' creada`);
  }

  await mongoose.disconnect();
  console.log('Seed completado');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
