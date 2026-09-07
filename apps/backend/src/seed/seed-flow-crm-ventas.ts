/**
 * Seed de un flujo de ejemplo de ventas de CRM (HU-FLOW-01-V3).
 *
 * Crea un `Flow` real — mensaje → intención → kb/mensaje/condición+captura+acción+mensaje/handoff —
 * para probar el editor y hacer demos sin tener que dibujarlo a mano cada vez. Toca 7 de los 8
 * tipos de nodo (todos menos `espera`, fuera de alcance de esta spec).
 *
 * SOLO DESARROLLO. Aborta si `NODE_ENV=production` (salvo `--force`).
 *
 * Uso:
 *   pnpm --filter backend seed:flow -- --email=user-empresa-test@test.com
 *   pnpm --filter backend seed:flow -- --email=... --activar
 *
 * Es idempotente: borra el flujo demo previo del tenant (mismo `nombre`) y lo vuelve a insertar.
 * No se activa por defecto — activarlo desactivaría en silencio un flujo real que ya esté activo
 * en ese tenant — salvo que se pase `--activar`.
 *
 * Nota multi-tenancy: este script corre fuera del ciclo HTTP, así que no hay token del cual derivar
 * el `tenantId`; se resuelve por el email de un `User` del tenant y toda operación (borrar el demo
 * anterior, crear el nuevo) lleva ese `tenantId` explícito, igual que exige `docs/multi-tenancy.md`
 * para código fuera del ciclo HTTP. La creación pasa por `flow.validation.ts` (el mismo Zod que usa
 * `POST /api/flows`) y por `flow.service.ts`'s `createFlow` — nunca un `Flow.create()` crudo — así
 * el ejemplo queda garantizado estructuralmente válido igual que si viniera del editor.
 */
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { Flow } from '../features/flow/flow.model.js';
import { createFlow } from '../features/flow/flow.service.js';
import { createFlowSchema } from '../features/flow/flow.validation.js';
import { User } from '../features/users/user.model.js';
import type { CreateFlowDTO, IArista, INodo } from '../features/flow/flow.types.js';

const NOMBRE_DEMO = 'Ventas CRM (demo)';

// ─── Definición declarativa del flujo ────────────────────────────────────────────

const nodos: INodo[] = [
  {
    id: 'n_bienvenida',
    tipo: 'mensaje',
    posicion: { x: 0, y: 0 },
    config: {
      tipo: 'mensaje',
      texto: '¡Hola! Soy el asistente de ventas. Cuéntame, ¿en qué te puedo ayudar hoy?',
    },
  },
  {
    id: 'n_intencion',
    tipo: 'intencion',
    posicion: { x: 0, y: 180 },
    config: {
      tipo: 'intencion',
      etiquetas: [
        { etiqueta: 'precio', descripcion: 'El cliente pregunta por precios o planes', nodoDestino: 'n_kb_precio' },
        { etiqueta: 'horario', descripcion: 'El cliente pregunta por horarios de atención', nodoDestino: 'n_msg_horario' },
        { etiqueta: 'comprar', descripcion: 'El cliente quiere comprar o ya decidió avanzar', nodoDestino: 'n_condicion_pago' },
        { etiqueta: 'hablar_con_alguien', descripcion: 'El cliente pide hablar con una persona', nodoDestino: 'n_handoff' },
      ],
      ramaPorDefecto: 'n_handoff',
    },
  },
  {
    id: 'n_kb_precio',
    tipo: 'kb',
    posicion: { x: -320, y: 380 },
    config: {
      tipo: 'kb',
      pregunta: 'ultimo_mensaje',
      siNoHayRespuesta: 'No tengo el precio a la mano, un asesor te lo confirma enseguida.',
    },
  },
  {
    id: 'n_msg_horario',
    tipo: 'mensaje',
    posicion: { x: -100, y: 380 },
    config: { tipo: 'mensaje', texto: 'Atendemos de lunes a viernes de 8:00 a.m. a 6:00 p.m.' },
  },
  {
    id: 'n_condicion_pago',
    tipo: 'condicion',
    posicion: { x: 160, y: 380 },
    config: {
      tipo: 'condicion',
      variable: 'ultimo_mensaje',
      ramas: [
        { operador: 'contiene', valor: 'tarjeta', nodoDestino: 'n_msg_tarjeta' },
        { operador: 'contiene', valor: 'transferencia', nodoDestino: 'n_msg_transferencia' },
      ],
      ramaPorDefecto: 'n_captura_correo',
    },
  },
  {
    id: 'n_handoff',
    tipo: 'handoff',
    posicion: { x: 420, y: 380 },
    config: { tipo: 'handoff', motivo: 'El cliente pidió hablar con una persona o no encajó en ninguna intención reconocida.' },
  },
  {
    id: 'n_msg_tarjeta',
    tipo: 'mensaje',
    posicion: { x: 60, y: 560 },
    config: { tipo: 'mensaje', texto: 'Perfecto, pago con tarjeta. Para generarte el link de pago necesito tu correo.' },
  },
  {
    id: 'n_msg_transferencia',
    tipo: 'mensaje',
    posicion: { x: 280, y: 560 },
    config: {
      tipo: 'mensaje',
      texto: 'Perfecto, pago por transferencia. Te comparto los datos bancarios y necesito tu correo para el comprobante.',
    },
  },
  {
    id: 'n_captura_correo',
    tipo: 'captura',
    posicion: { x: 160, y: 740 },
    config: {
      tipo: 'captura',
      campo: 'correo',
      descripcion: 'Correo electrónico del cliente',
      tipoDato: 'texto',
      pregunta: '¿Cuál es tu correo para enviarte los detalles?',
      reintentos: 2,
    },
  },
  {
    id: 'n_accion_lead',
    tipo: 'accion',
    posicion: { x: 160, y: 920 },
    config: { tipo: 'accion', efecto: { tipo: 'crear_lead' } },
  },
  {
    id: 'n_msg_confirmacion',
    tipo: 'mensaje',
    posicion: { x: 160, y: 1100 },
    config: { tipo: 'mensaje', texto: '¡Listo! Ya registré tu solicitud, un asesor te contacta muy pronto para cerrar la compra.' },
  },
];

const aristas: IArista[] = [
  { id: 'a1', from: 'n_bienvenida', to: 'n_intencion' },
  { id: 'a2', from: 'n_msg_tarjeta', to: 'n_captura_correo' },
  { id: 'a3', from: 'n_msg_transferencia', to: 'n_captura_correo' },
  { id: 'a4', from: 'n_captura_correo', to: 'n_accion_lead' },
  { id: 'a5', from: 'n_accion_lead', to: 'n_msg_confirmacion' },
];

// ─── CLI ────────────────────────────────────────────────────────────────────────

interface Args {
  email?: string;
  activar: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const flag = (name: string): string | undefined =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

  return {
    ...(flag('email') !== undefined ? { email: flag('email') } : {}),
    activar: argv.includes('--activar'),
    force: argv.includes('--force'),
  };
}

async function resolveTenantId(email: string): Promise<Types.ObjectId> {
  const user = await User.findOne({ email }).lean();
  if (!user) throw new Error(`No existe el usuario ${email}.`);
  if (!user.tenantId) throw new Error(`${email} es superadmin (sin tenant); este seed necesita un tenant.`);
  return user.tenantId as Types.ObjectId;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.email) throw new Error('Falta --email=<usuario-del-tenant>.');

  if (env.NODE_ENV === 'production' && !args.force) {
    throw new Error('Este seed es solo para desarrollo. Usa --force si de verdad lo quieres en production.');
  }

  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    const tenantId = args.email ? await resolveTenantId(args.email) : undefined;
    if (!tenantId) throw new Error('No se pudo resolver el tenant.');

    // Idempotente: nunca dos flujos "Ventas CRM (demo)" para el mismo tenant. `tenantId` explícito
    // en el filtro — este script corre fuera del ciclo HTTP, no hay repositorio scoped que lo fuerce.
    const borrado = await Flow.deleteMany({ tenantId, nombre: NOMBRE_DEMO });
    if (borrado.deletedCount > 0) {
      logger.info('Flujo demo previo eliminado.', { tenantId: tenantId.toString(), borrados: borrado.deletedCount });
    }

    const dto = createFlowSchema.shape.body.parse({
      nombre: NOMBRE_DEMO,
      nodos,
      aristas,
      entrada: 'n_bienvenida',
      activo: args.activar,
    });

    const creado = await createFlow(tenantId, dto as CreateFlowDTO);

    logger.info('Flujo de ventas CRM sembrado.', {
      tenantId: tenantId.toString(),
      flowId: creado.id,
      activo: creado.activo,
    });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error('Seed de flujo de ventas CRM fallido.', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
