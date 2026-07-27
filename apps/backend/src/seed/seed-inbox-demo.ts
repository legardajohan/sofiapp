/**
 * Seed de datos de prueba para la bandeja omnicanal (HU-OMNI-01 / HU-OMNI-03).
 *
 * Crea conversaciones (`Cliente`) con sus hilos (`Message`) para poder validar la bandeja sin
 * depender de WhatsApp real. Cubre a propósito todos los estados que la UI sabe pintar:
 * los 4 filtros (`todos`/`mios`/`sin_asignar`/`sofi`), ventana de 24 h abierta y cerrada,
 * no leídos, previews de adjuntos y las dos ramas del resumen IA (sin generar / desactualizado).
 *
 * SOLO DESARROLLO. Aborta si `NODE_ENV=production` (salvo `--force`).
 *
 * Uso:
 *   pnpm --filter backend seed:inbox -- --email=admin@tuempresa.com
 *   pnpm --filter backend seed:inbox -- --tenant=6a51b7c29a92de8f86185132
 *   pnpm --filter backend seed:inbox -- --email=... --reset   (borra los demo y sale)
 *
 * Es idempotente: cada corrida borra los documentos demo previos del tenant (los que tienen
 * `metaUserId` con prefijo `demo-`) y los vuelve a insertar con fechas frescas. Nunca toca
 * conversaciones reales.
 *
 * Nota multi-tenancy: este script corre fuera del ciclo HTTP, así que no hay token del cual
 * derivar el `tenantId`; se recibe por CLI y se valida contra la colección antes de escribir.
 * Toda query lleva el `tenantId` explícito en el filtro, igual que haría el repositorio scoped.
 */
import mongoose, { Types } from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { Message } from '../features/message/message.model.js';
import { Tenant } from '../features/tenant/tenant.model.js';
import { User } from '../features/users/user.model.js';
import type { ICliente } from '../features/cliente/cliente.types.js';
import type {
  IMessage,
  MessageStatus,
  Sender,
  TipoMensaje,
} from '../features/message/message.types.js';

/** Prefijo que marca un documento como sembrado por este script (y por tanto borrable). */
const DEMO_PREFIX = 'demo-';

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

// ─── Definición declarativa de los datos ────────────────────────────────────────

interface SeedMessage {
  /** Minutos antes de `ultimoMensajeAt` de la conversación. */
  hace: number;
  sender: Sender;
  tipo: TipoMensaje;
  texto?: string;
  attachmentUrl?: string;
  status?: MessageStatus;
}

interface SeedConversation {
  metaUserId: string;
  telefono: string;
  nombre: string;
  estadoComercial: ICliente['estadoComercial'];
  nivelInteres?: ICliente['nivelInteres'];
  objecionPrincipal?: ICliente['objecionPrincipal'];
  rolContacto?: ICliente['rolContacto'];
  tags: string[];
  /** `true` → se asigna al admin resuelto por CLI (aparece en el filtro "mios"). */
  asignada: boolean;
  iaHabilitada: boolean;
  noLeidos: number;
  /** Horas transcurridas desde el último mensaje (define el orden de la bandeja). */
  hace: number;
  /** Ventana de 24 h de Meta: abierta habilita el composer; cerrada muestra el banner. */
  ventanaAbierta: boolean;
  /** Días desde que entró el contacto. */
  antiguedadDias: number;
  /** Si está, se siembra un resumen ya desactualizado (llegaron mensajes después). */
  resumenDesactualizado?: string;
  mensajes: SeedMessage[];
}

const CONVERSACIONES: SeedConversation[] = [
  {
    metaUserId: `${DEMO_PREFIX}573001112233`,
    telefono: '573001112233',
    nombre: 'María Fernanda Gómez',
    estadoComercial: 'en_gestion',
    nivelInteres: 'caliente',
    objecionPrincipal: 'precio',
    rolContacto: 'decisor',
    tags: ['pre-icfes', 'beca', 'grado-11'],
    asignada: true,
    iaHabilitada: false,
    noLeidos: 0,
    hace: 1,
    ventanaAbierta: true,
    antiguedadDias: 6,
    resumenDesactualizado:
      'La contacto es la madre de una estudiante de grado 11 interesada en el curso Pre-ICFES ' +
      'intensivo. Preguntó por horarios y precio; objetó el valor de $890.000 COP. Se le ofreció ' +
      'la beca por mérito del 20% (queda en $712.000) porque la estudiante tiene promedio 4.3, y ' +
      'aceptó agendar una cita para formalizar la matrícula. Interés alto, decisora directa.',
    mensajes: [
      {
        hace: 2880,
        sender: 'user',
        tipo: 'text',
        texto: 'Hola, buenas tardes. Vi el anuncio del curso Pre-ICFES en Instagram y quisiera más información.',
      },
      {
        hace: 2875,
        sender: 'bot',
        tipo: 'text',
        texto:
          '¡Hola María Fernanda! 👋 Soy Sofi, la asistente virtual. Con gusto te cuento: nuestro curso ' +
          'Pre-ICFES intensivo dura 4 meses e incluye simulacros semanales. ¿Para qué grado lo necesitas?',
      },
      { hace: 2860, sender: 'user', tipo: 'text', texto: 'Es para mi hija, está en grado 11.' },
      {
        hace: 2858,
        sender: 'bot',
        tipo: 'text',
        texto:
          'Perfecto. Para grado 11 tenemos el plan intensivo de 4 meses, clases de lunes a viernes y ' +
          '8 simulacros calificados. ¿Te comparto los horarios disponibles?',
      },
      { hace: 2840, sender: 'user', tipo: 'text', texto: 'Sí por favor. Y también el precio.' },
      {
        hace: 2838,
        sender: 'bot',
        tipo: 'text',
        texto:
          'Claro. Los horarios son 2:00–5:00 p.m. o 6:00–9:00 p.m.\nLa inversión del plan completo es ' +
          'de $890.000 COP, con opción de pago en 3 cuotas sin interés.',
      },
      {
        hace: 1500,
        sender: 'user',
        tipo: 'text',
        texto: 'Uy, está un poco alto para nosotros. ¿No hay algún descuento?',
      },
      {
        hace: 1440,
        sender: 'agent',
        tipo: 'text',
        texto:
          'Hola María Fernanda, soy Diego del equipo comercial. Sí, manejamos un 15% por pago ' +
          'anticipado y becas parciales por mérito académico. ¿Tu hija tiene promedio superior a 4.0?',
      },
      { hace: 1400, sender: 'user', tipo: 'text', texto: 'Sí, ella tiene 4.3 de promedio.' },
      {
        hace: 1380,
        sender: 'agent',
        tipo: 'text',
        texto:
          '¡Excelente! Con ese promedio aplica a la beca del 20%: quedaría en $712.000. ' +
          '¿Te agendo una cita esta semana para formalizar?',
      },
      // Este mensaje es posterior al resumen → lo marca como desactualizado.
      {
        hace: 0,
        sender: 'user',
        tipo: 'text',
        texto: 'Me parece bien. ¿Qué documentos necesito llevar?',
      },
    ],
  },
  {
    metaUserId: `${DEMO_PREFIX}573004445566`,
    telefono: '573004445566',
    nombre: 'Carlos Andrés Ruiz',
    estadoComercial: 'nuevo',
    nivelInteres: 'tibio',
    rolContacto: 'usuario',
    tags: ['nivelacion', 'universitario'],
    asignada: false,
    iaHabilitada: true,
    noLeidos: 3,
    hace: 3,
    ventanaAbierta: true,
    antiguedadDias: 1,
    mensajes: [
      {
        hace: 240,
        sender: 'user',
        tipo: 'text',
        texto: 'Buenas, ¿todavía hay cupos para el curso de nivelación en matemáticas?',
      },
      {
        hace: 238,
        sender: 'bot',
        tipo: 'text',
        texto:
          '¡Hola Carlos! Sí, aún tenemos cupos para el grupo que inicia el próximo lunes. ' +
          '¿Es para ti o para alguien más?',
      },
      {
        hace: 220,
        sender: 'user',
        tipo: 'text',
        texto: 'Para mí. Estoy en primer semestre de ingeniería y voy flojo en cálculo.',
      },
      {
        hace: 218,
        sender: 'bot',
        tipo: 'text',
        texto:
          'Entiendo. El módulo de nivelación en cálculo diferencial son 6 semanas, 2 sesiones por ' +
          'semana. ¿Lo prefieres presencial o virtual?',
      },
      { hace: 45, sender: 'user', tipo: 'text', texto: 'Virtual estaría mejor' },
      { hace: 40, sender: 'user', tipo: 'text', texto: '¿Y cuánto cuesta?' },
      { hace: 0, sender: 'user', tipo: 'text', texto: '¿Hola? ¿Sigues ahí?' },
    ],
  },
  {
    metaUserId: `${DEMO_PREFIX}573007778899`,
    telefono: '573007778899',
    nombre: 'Luisa Martínez',
    estadoComercial: 'pago_pendiente',
    nivelInteres: 'caliente',
    objecionPrincipal: 'confianza',
    rolContacto: 'decisor',
    tags: ['matricula', 'comprobante'],
    asignada: true,
    iaHabilitada: false,
    noLeidos: 0,
    // Ventana cerrada → el composer queda deshabilitado y sale el WindowClosedBanner.
    hace: 50,
    ventanaAbierta: false,
    antiguedadDias: 12,
    mensajes: [
      {
        hace: 120,
        sender: 'user',
        tipo: 'text',
        texto: 'Buenas tardes, ya realicé el pago de la matrícula.',
      },
      {
        hace: 110,
        sender: 'agent',
        tipo: 'text',
        texto: '¡Gracias Luisa! ¿Me compartes el comprobante para verificarlo con contabilidad?',
      },
      { hace: 100, sender: 'user', tipo: 'text', texto: 'Claro, ya se lo envío.' },
      // Último mensaje sin texto → la bandeja debe mostrar "📷 Imagen" como preview.
      {
        hace: 0,
        sender: 'user',
        tipo: 'image',
        attachmentUrl: 'https://demo.invalid/media/comprobante-pago.jpg',
      },
    ],
  },
  {
    metaUserId: `${DEMO_PREFIX}573002223344`,
    telefono: '573002223344',
    nombre: 'Jorge Enrique Paz',
    estadoComercial: 'perdido',
    nivelInteres: 'frio',
    objecionPrincipal: 'tiempo',
    rolContacto: 'desconocido',
    tags: ['admision'],
    asignada: false,
    iaHabilitada: true,
    noLeidos: 0,
    hace: 72,
    ventanaAbierta: false,
    antiguedadDias: 20,
    mensajes: [
      { hace: 60, sender: 'user', tipo: 'text', texto: 'Hola, quiero info del curso' },
      { hace: 58, sender: 'bot', tipo: 'text', texto: '¡Hola Jorge! Con gusto. ¿Qué curso te interesa?' },
      {
        hace: 40,
        sender: 'user',
        tipo: 'text',
        texto: 'El de preparación para el examen de admisión',
      },
      {
        hace: 38,
        sender: 'bot',
        tipo: 'text',
        texto:
          'El curso de admisión universitaria son 8 semanas con énfasis en razonamiento ' +
          'cuantitativo y lectura crítica. ¿Te comparto fechas de inicio?',
      },
      // Preview esperado: "🎤 Audio".
      { hace: 0, sender: 'user', tipo: 'audio', attachmentUrl: 'https://demo.invalid/media/nota-voz.ogg' },
    ],
  },
  {
    metaUserId: `${DEMO_PREFIX}573009990011`,
    telefono: '573009990011',
    nombre: 'Diana Sofía Castro',
    estadoComercial: 'pagado',
    nivelInteres: 'caliente',
    rolContacto: 'decisor',
    tags: ['pre-icfes', 'inscrita'],
    asignada: true,
    iaHabilitada: true,
    noLeidos: 1,
    hace: 8,
    ventanaAbierta: true,
    antiguedadDias: 30,
    mensajes: [
      {
        hace: 180,
        sender: 'agent',
        tipo: 'text',
        texto: 'Hola Diana, confirmamos tu inscripción al curso Pre-ICFES. ¡Bienvenida! 🎉',
        status: 'read',
      },
      {
        hace: 170,
        sender: 'user',
        tipo: 'text',
        texto: '¡Muchas gracias! ¿Cuándo empiezan las clases?',
      },
      {
        hace: 160,
        sender: 'agent',
        tipo: 'text',
        texto:
          'El lunes 3 de agosto a las 2:00 p.m. ¿Me puedes enviar la copia del documento de ' +
          'identidad de la estudiante para completar la carpeta?',
        status: 'read',
      },
      // Preview esperado: "📄 Documento".
      {
        hace: 0,
        sender: 'user',
        tipo: 'document',
        attachmentUrl: 'https://demo.invalid/media/documento-identidad.pdf',
      },
    ],
  },
  {
    // Fixture de la extracción de datos por IA: es la única conversación donde el cliente dicta
    // su nombre completo, un correo y un teléfono alterno dentro del texto. El teléfono que da
    // (fijo) es distinto del `telefono` del Cliente (su WhatsApp) a propósito: demuestra por qué
    // los datos extraídos se guardan aparte y no pisan la identidad real del contacto.
    metaUserId: `${DEMO_PREFIX}573006667788`,
    telefono: '573006667788',
    nombre: 'Andrés Quintero',
    estadoComercial: 'en_gestion',
    nivelInteres: 'caliente',
    rolContacto: 'decisor',
    tags: ['inscripcion', 'datos-completos'],
    asignada: true,
    iaHabilitada: false,
    noLeidos: 0,
    hace: 2,
    ventanaAbierta: true,
    antiguedadDias: 3,
    mensajes: [
      {
        hace: 90,
        sender: 'agent',
        tipo: 'text',
        texto: 'Hola, para completar tu inscripción necesito unos datos. ¿Me confirmas tu nombre completo?',
      },
      { hace: 85, sender: 'user', tipo: 'text', texto: 'Claro, soy Andrés Felipe Quintero Salazar' },
      {
        hace: 80,
        sender: 'agent',
        tipo: 'text',
        texto: 'Gracias. ¿Y un correo electrónico para enviarte el comprobante de pago?',
      },
      { hace: 70, sender: 'user', tipo: 'text', texto: 'Mi correo es andres.quintero88@gmail.com' },
      {
        hace: 60,
        sender: 'agent',
        tipo: 'text',
        texto: '¿Tienes un número de contacto alterno, distinto a este de WhatsApp?',
      },
      {
        hace: 50,
        sender: 'user',
        tipo: 'text',
        texto: 'Sí, el fijo de la casa es 6027312945, ahí contesta mi mamá si no me encuentran.',
      },
      {
        hace: 0,
        sender: 'agent',
        tipo: 'text',
        texto: 'Listo Andrés, quedó registrado. Te llega el comprobante al correo.',
      },
    ],
  },
];

// ─── CLI ────────────────────────────────────────────────────────────────────────

interface Args {
  tenant?: string;
  email?: string;
  reset: boolean;
  force: boolean;
}

function parseArgs(argv: string[]): Args {
  const flag = (name: string): string | undefined =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');

  return {
    ...(flag('tenant') !== undefined ? { tenant: flag('tenant') } : {}),
    ...(flag('email') !== undefined ? { email: flag('email') } : {}),
    reset: argv.includes('--reset'),
    force: argv.includes('--force'),
  };
}

/** Resuelve el tenant a sembrar por id explícito o por el email de un admin suyo. */
async function resolveTenantId(args: Args): Promise<Types.ObjectId> {
  if (args.tenant) {
    if (!Types.ObjectId.isValid(args.tenant)) throw new Error(`--tenant no es un ObjectId: ${args.tenant}`);
    const oid = new Types.ObjectId(args.tenant);
    const exists = await Tenant.exists({ _id: oid });
    if (!exists) throw new Error(`No existe el tenant ${args.tenant}.`);
    return oid;
  }

  if (args.email) {
    const user = await User.findOne({ email: args.email }).lean();
    if (!user) throw new Error(`No existe el usuario ${args.email}.`);
    if (!user.tenantId) throw new Error(`${args.email} es superadmin (sin tenant); usa --tenant=<id>.`);
    return user.tenantId as Types.ObjectId;
  }

  const tenants = await Tenant.find({}, { nombre: 1 }).lean();
  const lista = tenants.map((t) => `  --tenant=${String(t._id)}   ${String(t.nombre ?? '(sin nombre)')}`);
  throw new Error(`Falta --tenant=<id> o --email=<admin>. Tenants disponibles:\n${lista.join('\n')}`);
}

/** Admin del tenant al que se le asignan las conversaciones del filtro "mios". */
async function resolveAsesorId(tenantId: Types.ObjectId, email?: string): Promise<Types.ObjectId | null> {
  const filtro = email ? { tenantId, email } : { tenantId, rol: 'admin' as const };
  const user = await User.findOne(filtro).lean();
  return user ? (user._id as Types.ObjectId) : null;
}

// ─── Siembra ────────────────────────────────────────────────────────────────────

/** Borra SOLO los documentos demo del tenant (metaUserId con prefijo `demo-`). */
async function limpiarDemo(tenantId: Types.ObjectId): Promise<{ clientes: number; mensajes: number }> {
  const demo = await Cliente.find(
    { tenantId, metaUserId: { $regex: `^${DEMO_PREFIX}` } },
    { _id: 1 },
  ).lean();
  const ids = demo.map((c) => c._id as Types.ObjectId);
  if (ids.length === 0) return { clientes: 0, mensajes: 0 };

  const msgs = await Message.deleteMany({ tenantId, clienteId: { $in: ids } });
  const cls = await Cliente.deleteMany({ tenantId, _id: { $in: ids } });
  return { clientes: cls.deletedCount, mensajes: msgs.deletedCount };
}

type ClienteSeedDoc = ICliente & { _id: Types.ObjectId; createdAt: Date; updatedAt: Date };
type MessageSeedDoc = IMessage & { _id: Types.ObjectId };

function construirDocs(
  tenantId: Types.ObjectId,
  asesorId: Types.ObjectId | null,
  ahora: Date,
): { clientes: ClienteSeedDoc[]; mensajes: MessageSeedDoc[] } {
  const clientes: ClienteSeedDoc[] = [];
  const mensajes: MessageSeedDoc[] = [];

  for (const conv of CONVERSACIONES) {
    const _id = new Types.ObjectId();
    const ultimoMensajeAt = new Date(ahora.getTime() - conv.hace * HORA);
    const createdAt = new Date(ahora.getTime() - conv.antiguedadDias * DIA);

    // La ventana de Meta se cuenta desde el último entrante: abierta → futuro, cerrada → pasado.
    const ventana24hExpiraEn = conv.ventanaAbierta
      ? new Date(ultimoMensajeAt.getTime() + 24 * HORA)
      : new Date(ultimoMensajeAt.getTime() - 2 * HORA);

    const cliente: ClienteSeedDoc = {
      _id,
      tenantId,
      metaUserId: conv.metaUserId,
      telefono: conv.telefono,
      nombre: conv.nombre,
      canalOrigen: 'whatsapp',
      estadoComercial: conv.estadoComercial,
      ventana24hExpiraEn,
      ultimoMensajeAt,
      noLeidos: conv.noLeidos,
      iaHabilitada: conv.iaHabilitada,
      customFields: {},
      tags: conv.tags,
      createdAt,
      updatedAt: ultimoMensajeAt,
      ...(conv.nivelInteres ? { nivelInteres: conv.nivelInteres } : {}),
      ...(conv.objecionPrincipal ? { objecionPrincipal: conv.objecionPrincipal } : {}),
      ...(conv.rolContacto ? { rolContacto: conv.rolContacto } : {}),
      ...(conv.asignada && asesorId ? { asesorId } : {}),
    };

    // `mensajesHasta` anterior a `ultimoMensajeAt` → el historial lo marca desactualizado.
    if (conv.resumenDesactualizado) {
      const generadoAt = new Date(ultimoMensajeAt.getTime() - 45 * MIN);
      cliente.resumenIA = {
        texto: conv.resumenDesactualizado,
        generadoAt,
        mensajesHasta: generadoAt,
        modelo: env.GEMINI_MODEL,
      };
    }

    clientes.push(cliente);

    for (const m of conv.mensajes) {
      const esEntrante = m.sender === 'user';
      mensajes.push({
        _id: new Types.ObjectId(),
        tenantId,
        clienteId: _id,
        canal: 'whatsapp',
        direccion: esEntrante ? 'inbound' : 'outbound',
        sender: m.sender,
        tipo: m.tipo,
        status: m.status ?? (esEntrante ? 'delivered' : 'read'),
        createdAt: new Date(ultimoMensajeAt.getTime() - m.hace * MIN),
        ...(m.texto ? { texto: m.texto } : {}),
        ...(m.attachmentUrl ? { attachmentUrl: m.attachmentUrl } : {}),
      });
    }
  }

  return { clientes, mensajes };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (env.NODE_ENV === 'production' && !args.force) {
    throw new Error('Este seed es solo para desarrollo. Usa --force si de verdad lo quieres en production.');
  }

  await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

  try {
    const tenantId = await resolveTenantId(args);
    const borrados = await limpiarDemo(tenantId);
    if (borrados.clientes > 0) {
      logger.info('Datos demo previos eliminados.', {
        tenantId: tenantId.toString(),
        clientes: borrados.clientes,
        mensajes: borrados.mensajes,
      });
    }

    if (args.reset) {
      logger.info('Reset completado: no se sembraron datos nuevos.');
      return;
    }

    const asesorId = await resolveAsesorId(tenantId, args.email);
    if (!asesorId) {
      logger.warn('No se encontró un admin del tenant: el filtro "mios" quedará vacío.');
    }

    const { clientes, mensajes } = construirDocs(tenantId, asesorId, new Date());

    // `timestamps: false` para que Mongoose respete las fechas históricas que armamos arriba en vez
    // de pisarlas con `Date.now()`. Va documento a documento porque `insertMany` no expone la opción.
    for (const c of clientes) await new Cliente(c).save({ timestamps: false });
    for (const m of mensajes) await new Message(m).save({ timestamps: false });

    logger.info('Bandeja demo sembrada.', {
      tenantId: tenantId.toString(),
      asesorId: asesorId ? asesorId.toString() : null,
      conversaciones: clientes.length,
      mensajes: mensajes.length,
    });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err: unknown) => {
  logger.error('Seed de bandeja fallido.', { error: err instanceof Error ? err.message : String(err) });
  process.exit(1);
});
