import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Types } from 'mongoose';

const {
  mockChat,
  mockClassify,
  mockReplyFromIa,
  mockMarcarParaAsesor,
  mockHandoffConversation,
  mockGetHandoffSettings,
  mockClasificarSemaforo,
  mockExtraerDatos,
} = vi.hoisted(() => ({
  mockChat: vi.fn(),
  mockClassify: vi.fn(),
  mockReplyFromIa: vi.fn(),
  mockMarcarParaAsesor: vi.fn(),
  mockHandoffConversation: vi.fn(),
  mockGetHandoffSettings: vi.fn(),
  mockClasificarSemaforo: vi.fn(),
  mockExtraerDatos: vi.fn(),
}));

vi.mock('../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ chat: mockChat, classify: mockClassify }),
}));

vi.mock('../features/conversation/conversation.service.js', () => ({
  replyFromIa: mockReplyFromIa,
  marcarParaAsesor: mockMarcarParaAsesor,
  handoffConversation: mockHandoffConversation,
  // Lo consume `ai-semaforo.service` para emitir el `conversation:updated` tras aplicar.
  publishConversationUpdated: vi.fn().mockResolvedValue(undefined),
}));

// La semaforización (HU-IA-05) tiene sus propios tests; aquí solo importa QUE se enganche, con qué
// historial y que un fallo suyo no arrastre al auto-reply.
vi.mock('../features/ai/ai-semaforo.service.js', () => ({
  clasificarYAplicarSemaforo: mockClasificarSemaforo,
}));

// Igual con la extracción (HU-IA-06): sus guardas y su merge tienen sus propios tests; aquí solo
// importa QUE se enganche, en qué orden y que un fallo suyo no arrastre al auto-reply.
vi.mock('../features/ai/ai-extract.service.js', () => ({
  extraerDatosSiHaceFalta: mockExtraerDatos,
}));

// Mock PARCIAL: solo se sustituye la lectura de configuración. `evaluarAntesDeGenerar` y
// `evaluarDespuesDeGenerar` son funciones puras y aquí interesa que corran de verdad — si se
// mockearan, estos tests dejarían de probar la integración y solo probarían el mock.
vi.mock('../features/ai/ai-handoff.service.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../features/ai/ai-handoff.service.js')>()),
  getHandoffSettings: mockGetHandoffSettings,
}));

import { processAiReplyJob } from './ai-reply.processor.js';
import { FRASES_PETICION_EXPLICITA } from '../features/ai/ai-handoff.service.js';
import type { HandoffSettingsDTO } from '../features/ai/ai-handoff.types.js';
import { CHAT_FRASE_DERIVACION } from '../seed/seed-prompt-templates.js';
import { AppError } from '../utils/AppError.js';
import { createScoped } from '../repositories/base.repository.js';
import { Cliente } from '../features/cliente/cliente.model.js';
import { Message } from '../features/message/message.model.js';
import type { IClienteDocument } from '../features/cliente/cliente.types.js';
import { logger } from '../utils/logger.js';
import { MENSAJE_FALLO } from './ai-reply.messages.js';

const RESPUESTA = 'Atendemos de 8:00 a 18:00.';

async function crearCliente(
  tenantId: Types.ObjectId,
  iaHabilitada: boolean,
): Promise<Types.ObjectId> {
  const cliente = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${new Types.ObjectId().toString()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    iaHabilitada,
  });
  return (cliente as unknown as IClienteDocument)._id as Types.ObjectId;
}

async function crearMensaje(
  tenantId: Types.ObjectId,
  clienteId: Types.ObjectId,
  sender: 'user' | 'bot' | 'agent',
  texto?: string,
): Promise<void> {
  await createScoped(Message, tenantId, {
    clienteId,
    canal: 'whatsapp',
    direccion: sender === 'user' ? 'inbound' : 'outbound',
    sender,
    tipo: texto ? 'text' : 'image',
    ...(texto ? { texto } : {}),
    status: 'sent',
  } as unknown as Record<string, unknown>);
}

/** Configuración de handoff (HU-IA-03). Por defecto apagada: el estado de fábrica. */
function handoffSettings(overrides: Partial<HandoffSettingsDTO> = {}): HandoffSettingsDTO {
  return {
    activo: false,
    asesorDestinoId: null,
    estrategiaDestino: 'primero',
    mensajeTransicion: MENSAJE_TRANSICION,
    condicionesExtras: [],
    heredado: true,
    reglas: {
      explicitRequest: { activa: false, frases: FRASES_PETICION_EXPLICITA },
      keyword: { activa: false, palabras: [] },
      lowConfidence: { activa: false, umbral: null },
      intentPurchase: { activa: false, nivelMinimo: 'caliente' },
    },
    ...overrides,
  };
}

const MENSAJE_TRANSICION = 'Ya le pasé tu conversación a un asesor.';

// Todos los describe de este archivo arrancan con el handoff apagado, que es como está de fábrica:
// así los tests de HU-IA-01 y HU-IA-02 siguen probando exactamente lo que probaban.
beforeEach(() => {
  mockClassify.mockReset();
  mockHandoffConversation.mockReset().mockResolvedValue(undefined);
  mockGetHandoffSettings.mockReset().mockResolvedValue(handoffSettings());
  mockClasificarSemaforo.mockReset().mockResolvedValue(undefined);
});

describe('processAiReplyJob — auto-reply de Sofi (HU-IA-01)', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    mockChat.mockReset().mockResolvedValue({ data: RESPUESTA, cacheHit: false, retrievedChunks: [] });
    mockReplyFromIa.mockReset().mockResolvedValue(undefined);
    mockMarcarParaAsesor.mockReset().mockResolvedValue(undefined);
    await Cliente.deleteMany({});
    await Message.deleteMany({});
  });

  it('con iaHabilitada genera y envía la respuesta por el mismo canal', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');

    await processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString(), recibidoEn: Date.now() });

    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockReplyFromIa).toHaveBeenCalledWith(
      tenantId.toString(),
      clienteId.toString(),
      RESPUESTA,
    );
  });

  it('con iaHabilitada en false no genera ni envía: el asesor tomó el control', async () => {
    const clienteId = await crearCliente(tenantId, false);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');

    await processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString(), recibidoEn: Date.now() });

    expect(mockChat).not.toHaveBeenCalled();
    expect(mockReplyFromIa).not.toHaveBeenCalled();
  });

  it('un cliente de otro tenant es invisible: no responde', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');
    const otroTenant = new Types.ObjectId();

    await processAiReplyJob({ tenantId: otroTenant.toString(), clienteId: clienteId.toString(), recibidoEn: Date.now() });

    expect(mockChat).not.toHaveBeenCalled();
    expect(mockReplyFromIa).not.toHaveBeenCalled();
  });

  it('sin mensajes con texto no llama al modelo', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user'); // imagen, sin texto

    await processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString(), recibidoEn: Date.now() });

    expect(mockChat).not.toHaveBeenCalled();
  });

  it('arma el historial en orden cronológico y traduce los roles', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'Hola');
    await crearMensaje(tenantId, clienteId, 'agent', '¡Hola! ¿En qué te ayudo?');
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');

    await processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString(), recibidoEn: Date.now() });

    const historial = mockChat.mock.calls[0]![0].historial as Array<{ role: string; content: string }>;
    expect(historial).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'model', content: '¡Hola! ¿En qué te ayudo?' },
      { role: 'user', content: '¿Cuál es el horario?' },
    ]);
  });

  it('el historial no incluye mensajes de otras conversaciones del mismo tenant', async () => {
    const clienteId = await crearCliente(tenantId, true);
    const otroCliente = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'Mi pregunta');
    await crearMensaje(tenantId, otroCliente, 'user', 'Pregunta de otra conversación');

    await processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString(), recibidoEn: Date.now() });

    const historial = mockChat.mock.calls[0]![0].historial as Array<{ content: string }>;
    expect(historial).toHaveLength(1);
    expect(historial[0]?.content).toBe('Mi pregunta');
  });

  it('fuera de la ventana de 24 h el job no falla: se logea y se descarta', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');
    mockReplyFromIa.mockRejectedValue(new AppError('Fuera de la ventana de 24 h.', 422));

    await expect(
      processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString(), recibidoEn: Date.now() }),
    ).resolves.toBeUndefined();
  });

  it('un error inesperado sí propaga: eso sí es un fallo del job', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');
    mockReplyFromIa.mockRejectedValue(new Error('Mongo caído'));

    await expect(
      processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString(), recibidoEn: Date.now() }),
    ).rejects.toThrow('Mongo caído');
  });
});

describe('processAiReplyJob — límite de historial', () => {
  it('manda a Gemini como mucho los 10 mensajes más recientes', async () => {
    const tenantId = new Types.ObjectId();
    mockChat.mockReset().mockResolvedValue({ data: RESPUESTA, cacheHit: false });
    mockReplyFromIa.mockReset().mockResolvedValue(undefined);
    mockMarcarParaAsesor.mockReset().mockResolvedValue(undefined);

    const clienteId = await crearCliente(tenantId, true);
    for (let i = 0; i < 14; i += 1) {
      await crearMensaje(tenantId, clienteId, 'user', `Mensaje ${i}`);
    }

    await processAiReplyJob({ tenantId: tenantId.toString(), clienteId: clienteId.toString(), recibidoEn: Date.now() });

    const historial = mockChat.mock.calls[0]![0].historial as Array<{ content: string }>;
    expect(historial).toHaveLength(10);
    // Los 10 últimos, en orden: del 4 al 13.
    expect(historial[0]?.content).toBe('Mensaje 4');
    expect(historial[9]?.content).toBe('Mensaje 13');
  });
});

describe('processAiReplyJob — agrupación de ráfagas y fallo visible (HU-IA-02)', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    mockChat.mockReset().mockResolvedValue({ data: RESPUESTA, cacheHit: false, retrievedChunks: [] });
    mockReplyFromIa.mockReset().mockResolvedValue(undefined);
    mockMarcarParaAsesor.mockReset().mockResolvedValue(undefined);
    await Cliente.deleteMany({});
    await Message.deleteMany({});
  });

  const job = (clienteId: Types.ObjectId, recibidoEn = Date.now()) => ({
    tenantId: tenantId.toString(),
    clienteId: clienteId.toString(),
    recibidoEn,
  });

  it('si lo último del hilo ya es del bot, no responde otra vez', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');
    await crearMensaje(tenantId, clienteId, 'bot', RESPUESTA);

    await processAiReplyJob(job(clienteId));

    expect(mockChat).not.toHaveBeenCalled();
    expect(mockReplyFromIa).not.toHaveBeenCalled();
  });

  it('si el asesor respondió a mano, Sofi tampoco se suma', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');
    await crearMensaje(tenantId, clienteId, 'agent', 'Te atiendo yo, de 8 a 18.');

    await processAiReplyJob(job(clienteId));

    expect(mockChat).not.toHaveBeenCalled();
  });

  it('si el cliente vuelve a escribir tras la respuesta del bot, sí responde', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');
    await crearMensaje(tenantId, clienteId, 'bot', RESPUESTA);
    await crearMensaje(tenantId, clienteId, 'user', '¿y los domingos?');

    await processAiReplyJob(job(clienteId));

    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockReplyFromIa).toHaveBeenCalledTimes(1);
  });

  it('una ráfaga se responde UNA vez, con los tres mensajes en el historial', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'Hola');
    await crearMensaje(tenantId, clienteId, 'user', 'una pregunta');
    await crearMensaje(tenantId, clienteId, 'user', '¿cuánto cuesta?');

    await processAiReplyJob(job(clienteId));

    expect(mockReplyFromIa).toHaveBeenCalledTimes(1);
    const historial = mockChat.mock.calls[0]![0].historial as Array<{ content: string }>;
    expect(historial.map((t) => t.content)).toEqual(['Hola', 'una pregunta', '¿cuánto cuesta?']);
  });

  it('si la generación falla, avisa al cliente y escala a un asesor sin romper el job', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');
    mockChat.mockRejectedValue(new Error('Gemini 503'));

    await expect(processAiReplyJob(job(clienteId))).resolves.toBeUndefined();

    expect(mockReplyFromIa).toHaveBeenCalledTimes(1);
    expect(mockReplyFromIa.mock.calls[0]?.[2]).toBe(MENSAJE_FALLO);
    expect(mockMarcarParaAsesor).toHaveBeenCalledWith(tenantId.toString(), clienteId.toString());
  });

  it('si además falla el aviso al cliente, escala igualmente', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');
    mockChat.mockRejectedValue(new Error('Gemini 503'));
    mockReplyFromIa.mockRejectedValue(new AppError('Fuera de la ventana de 24 h.', 422));

    await expect(processAiReplyJob(job(clienteId))).resolves.toBeUndefined();

    expect(mockMarcarParaAsesor).toHaveBeenCalledTimes(1);
  });

  it('un fallo de generación NO desactiva Sofi para la conversación', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');
    mockChat.mockRejectedValue(new Error('Gemini 503'));

    await processAiReplyJob(job(clienteId));

    const cliente = await Cliente.findById(clienteId).lean();
    expect(cliente?.iaHabilitada).toBe(true);
  });

  it('registra la latencia end-to-end separando espera de generación', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿Cuál es el horario?');
    const spy = vi.spyOn(logger, 'info');

    const recibidoEn = Date.now() - 5000;
    await processAiReplyJob(job(clienteId, recibidoEn));

    const entrada = spy.mock.calls.find(([msg]) => msg === 'Auto-reply enviado');
    expect(entrada).toBeDefined();
    const metricas = entrada?.[1] as { esperaVentanaMs: number; generacionMs: number; totalMs: number };
    expect(metricas.esperaVentanaMs).toBeGreaterThanOrEqual(5000);
    expect(metricas.generacionMs).toBeGreaterThanOrEqual(0);
    expect(metricas.totalMs).toBeGreaterThanOrEqual(metricas.esperaVentanaMs);
    spy.mockRestore();
  });
});

describe('processAiReplyJob — handoff a un humano (HU-IA-03)', () => {
  let tenantId: Types.ObjectId;

  const job = (clienteId: Types.ObjectId): { tenantId: string; clienteId: string; recibidoEn: number } => ({
    tenantId: tenantId.toString(),
    clienteId: clienteId.toString(),
    recibidoEn: Date.now(),
  });

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    mockChat.mockReset().mockResolvedValue({ data: RESPUESTA, cacheHit: false, retrievedChunks: [] });
    mockReplyFromIa.mockReset().mockResolvedValue(undefined);
    mockMarcarParaAsesor.mockReset().mockResolvedValue(undefined);
    await Cliente.deleteMany({});
    await Message.deleteMany({});
  });

  it('un disparador previo transfiere SIN llamar a chat()', async () => {
    // El ahorro es el punto: si la conversación se va a una persona, generar una respuesta para
    // tirarla es pagar un embedding y una generación para nada.
    mockGetHandoffSettings.mockResolvedValue(
      handoffSettings({
        activo: true,
        reglas: {
          ...handoffSettings().reglas,
          explicitRequest: { activa: true, frases: FRASES_PETICION_EXPLICITA },
        },
      }),
    );
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'quiero hablar con una persona');

    await processAiReplyJob(job(clienteId));

    expect(mockChat).not.toHaveBeenCalled();
    expect(mockReplyFromIa).toHaveBeenCalledWith(tenantId.toString(), clienteId.toString(), MENSAJE_TRANSICION);
    expect(mockHandoffConversation).toHaveBeenCalledWith(
      tenantId.toString(),
      clienteId.toString(),
      'explicit_request',
      null,
      'primero',
      // Un disparador de fabrica no arrastra ninguna condicion del admin (HU-IA-07).
      null,
    );
  });

  it('baja confianza: el aviso SUSTITUYE a la respuesta generada', async () => {
    mockGetHandoffSettings.mockResolvedValue(
      handoffSettings({
        activo: true,
        reglas: {
          ...handoffSettings().reglas,
          lowConfidence: { activa: true, umbral: null },
        },
      }),
    );
    mockChat.mockResolvedValue({
      data: CHAT_FRASE_DERIVACION,
      cacheHit: false,
      fromFaq: false,
      retrievedChunks: [],
    });
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿tienen sede en Cali?');

    await processAiReplyJob(job(clienteId));

    // Repetirle "no tengo información" justo antes de transferirlo es ruido.
    expect(mockReplyFromIa).toHaveBeenCalledTimes(1);
    expect(mockReplyFromIa).toHaveBeenCalledWith(tenantId.toString(), clienteId.toString(), MENSAJE_TRANSICION);
    expect(mockHandoffConversation).toHaveBeenCalledWith(
      tenantId.toString(),
      clienteId.toString(),
      'low_confidence',
      null,
      'primero',
      // Un disparador de fabrica no arrastra ninguna condicion del admin (HU-IA-07).
      null,
    );
  });

  it('intención de compra: la respuesta y el aviso van en UN SOLO mensaje', async () => {
    // Dos mensajes gastarían dos unidades de cuota y llegarían como dos notificaciones seguidas.
    mockGetHandoffSettings.mockResolvedValue(
      handoffSettings({
        activo: true,
        reglas: {
          ...handoffSettings().reglas,
          intentPurchase: { activa: true, nivelMinimo: 'caliente' },
        },
      }),
    );
    mockClassify.mockResolvedValue({ data: { nivelInteres: 'caliente', objecion: null } });
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'quiero matricularme ya');

    await processAiReplyJob(job(clienteId));

    expect(mockReplyFromIa).toHaveBeenCalledTimes(1);
    expect(mockReplyFromIa).toHaveBeenCalledWith(
      tenantId.toString(),
      clienteId.toString(),
      `${RESPUESTA}\n\n${MENSAJE_TRANSICION}`,
    );
    expect(mockHandoffConversation).toHaveBeenCalledWith(
      tenantId.toString(),
      clienteId.toString(),
      'intent_purchase',
      null,
      'primero',
      // Un disparador de fabrica no arrastra ninguna condicion del admin (HU-IA-07).
      null,
    );
  });

  it('se transfiere al asesor destino configurado', async () => {
    const asesor = new Types.ObjectId().toString();
    mockGetHandoffSettings.mockResolvedValue(
      handoffSettings({
        activo: true,
        // Desde HU-IA-07 el asesor fijo solo manda con la estrategia `fijo`.
        estrategiaDestino: 'fijo',
        asesorDestinoId: asesor,
        reglas: {
          ...handoffSettings().reglas,
          keyword: { activa: true, palabras: ['reclamo'] },
        },
      }),
    );
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'quiero poner un reclamo');

    await processAiReplyJob(job(clienteId));

    expect(mockHandoffConversation).toHaveBeenCalledWith(
      tenantId.toString(),
      clienteId.toString(),
      'keyword',
      asesor,
      'fijo',
      null,
    );
  });

  it('si el aviso no se puede enviar, se transfiere IGUAL', async () => {
    // Fuera de la ventana de 24 h o con la cuota agotada es justo cuando más falta hace que lo vea
    // una persona: tragarse el handoff ahí dejaría la conversación con el bot y en silencio.
    mockGetHandoffSettings.mockResolvedValue(
      handoffSettings({
        activo: true,
        reglas: {
          ...handoffSettings().reglas,
          explicitRequest: { activa: true, frases: FRASES_PETICION_EXPLICITA },
        },
      }),
    );
    mockReplyFromIa.mockRejectedValue(new AppError('Ventana de 24 h cerrada.', 422));
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'necesito un asesor');

    await expect(processAiReplyJob(job(clienteId))).resolves.toBeUndefined();
    expect(mockHandoffConversation).toHaveBeenCalledTimes(1);
  });

  it('con la configuración apagada el comportamiento no cambia', async () => {
    // Regresión: de fábrica está todo apagado y ningún tenant en producción debe notar la HU.
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'quiero hablar con una persona');

    await processAiReplyJob(job(clienteId));

    expect(mockChat).toHaveBeenCalledTimes(1);
    expect(mockReplyFromIa).toHaveBeenCalledWith(tenantId.toString(), clienteId.toString(), RESPUESTA);
    expect(mockHandoffConversation).not.toHaveBeenCalled();
  });
});

describe('processAiReplyJob — extracción automática de datos (HU-IA-06)', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    mockChat.mockReset().mockResolvedValue({
      data: RESPUESTA,
      cacheHit: false,
      fromFaq: false,
      retrievedChunks: [{ texto: 'x', documentId: 'd' }],
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      durationMs: 1,
    });
    mockReplyFromIa.mockReset().mockResolvedValue(undefined);
    mockMarcarParaAsesor.mockReset().mockResolvedValue(undefined);
    mockClasificarSemaforo.mockReset().mockResolvedValue(undefined);
    mockExtraerDatos.mockReset().mockResolvedValue(undefined);
    await Cliente.deleteMany({});
    await Message.deleteMany({});
  });

  const job = (clienteId: Types.ObjectId): { tenantId: string; clienteId: string; recibidoEn: number } => ({
    tenantId: tenantId.toString(),
    clienteId: clienteId.toString(),
    recibidoEn: Date.now(),
  });

  it('se extrae UNA vez por ráfaga, con el historial del ciclo (AC14)', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'hola, soy Diego');
    await crearMensaje(tenantId, clienteId, 'bot', 'un gusto');
    await crearMensaje(tenantId, clienteId, 'user', 'me interesa el curso sabatino');

    await processAiReplyJob(job(clienteId));

    expect(mockExtraerDatos).toHaveBeenCalledTimes(1);
    const [tid, cid, historial] = mockExtraerDatos.mock.calls[0]!;
    expect(tid).toBe(tenantId.toString());
    expect(cid).toBe(clienteId.toString());
    expect(historial).toEqual(mockChat.mock.calls[0]![0].historial);
  });

  it('va DESPUÉS de la clasificación: si el proceso muere en medio, se pierde lo recuperable', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'me interesa el curso');

    await processAiReplyJob(job(clienteId));

    expect(mockClasificarSemaforo.mock.invocationCallOrder[0]!).toBeLessThan(
      mockExtraerDatos.mock.invocationCallOrder[0]!,
    );
  });

  it('un fallo de la extracción no impide que la respuesta salga (AC15)', async () => {
    // En producción `extraerDatosSiHaceFalta` no lanza por diseño; aquí se fuerza para fijar que la
    // respuesta al cliente ya había salido antes, si algún día dejara de cumplir esa promesa.
    mockExtraerDatos.mockRejectedValue(new Error('Gemini caído'));
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'me interesa el curso');

    await expect(processAiReplyJob(job(clienteId))).rejects.toThrow('Gemini caído');
    expect(mockReplyFromIa).toHaveBeenCalledTimes(1);
  });

  it('con Sofi apagada no se extrae nada', async () => {
    const clienteId = await crearCliente(tenantId, false);
    await crearMensaje(tenantId, clienteId, 'user', 'me interesa el curso');

    await processAiReplyJob(job(clienteId));

    expect(mockExtraerDatos).not.toHaveBeenCalled();
  });
});

describe('processAiReplyJob — semaforización automática (HU-IA-05)', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    mockChat.mockReset().mockResolvedValue({
      data: RESPUESTA,
      cacheHit: false,
      fromFaq: false,
      retrievedChunks: [{ texto: 'x', documentId: 'd' }],
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      durationMs: 1,
    });
    mockReplyFromIa.mockReset().mockResolvedValue(undefined);
    mockMarcarParaAsesor.mockReset().mockResolvedValue(undefined);
    mockClasificarSemaforo.mockReset().mockResolvedValue(undefined);
    mockExtraerDatos.mockReset().mockResolvedValue(undefined);
    await Cliente.deleteMany({});
    await Message.deleteMany({});
  });

  const job = (clienteId: Types.ObjectId): { tenantId: string; clienteId: string; recibidoEn: number } => ({
    tenantId: tenantId.toString(),
    clienteId: clienteId.toString(),
    recibidoEn: Date.now(),
  });

  it('se clasifica UNA vez, al final del ciclo, con el historial que se usó (AC12)', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', '¿cuánto cuesta?');
    await crearMensaje(tenantId, clienteId, 'bot', 'cuesta X');
    await crearMensaje(tenantId, clienteId, 'user', 'quiero matricularme');

    await processAiReplyJob(job(clienteId));

    expect(mockClasificarSemaforo).toHaveBeenCalledTimes(1);
    const [tid, cid, historial] = mockClasificarSemaforo.mock.calls[0]!;
    expect(tid).toBe(tenantId.toString());
    expect(cid).toBe(clienteId.toString());
    // El MISMO historial que se le pasó a `chat`: es lo que hace que la clave de caché coincida
    // con la del disparador de intención de compra y la segunda llamada salga gratis.
    expect(historial).toEqual(mockChat.mock.calls[0]![0].historial);
  });

  it('un fallo de la clasificación no rompe el auto-reply (AC13)', async () => {
    // En producción `clasificarYAplicarSemaforo` no lanza por diseño; aquí se fuerza para fijar que
    // el job tampoco se cae si algún día dejara de cumplir esa promesa.
    mockClasificarSemaforo.mockRejectedValue(new Error('Gemini caído'));
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'quiero matricularme');

    await expect(processAiReplyJob(job(clienteId))).rejects.toThrow('Gemini caído');
    // La respuesta al cliente ya había salido antes de clasificar.
    expect(mockReplyFromIa).toHaveBeenCalledTimes(1);
  });

  it('con Sofi apagada no se clasifica nada', async () => {
    const clienteId = await crearCliente(tenantId, false);
    await crearMensaje(tenantId, clienteId, 'user', 'quiero matricularme');

    await processAiReplyJob(job(clienteId));

    expect(mockClasificarSemaforo).not.toHaveBeenCalled();
  });

  it('si el último mensaje no es del cliente, no se clasifica', async () => {
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'hola');
    await crearMensaje(tenantId, clienteId, 'bot', 'hola, ¿en qué te ayudo?');

    await processAiReplyJob(job(clienteId));

    expect(mockClasificarSemaforo).not.toHaveBeenCalled();
  });

  it('también se clasifica cuando la conversación se transfirió por intención de compra', async () => {
    // Es el caso MÁS valioso de la historia: saltárselo dejaría sin semáforo justo al lead caliente.
    mockGetHandoffSettings.mockResolvedValue(
      handoffSettings({
        activo: true,
        reglas: {
          ...handoffSettings().reglas,
          explicitRequest: { activa: true, frases: FRASES_PETICION_EXPLICITA },
        },
      }),
    );
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'necesito un asesor');

    await processAiReplyJob(job(clienteId));

    expect(mockHandoffConversation).toHaveBeenCalledTimes(1);
    expect(mockClasificarSemaforo).toHaveBeenCalledTimes(1);
  });
});

/**
 * Que la condición propia del admin llegue hasta la conversación (HU-IA-07). El motor y la
 * validación tienen sus propios tests; aquí lo que importa es que el dato no se pierda por el
 * camino entre `evaluarAntesDeGenerar` y `handoffConversation`.
 */
describe('processAiReplyJob — condiciones propias de transferencia (HU-IA-07)', () => {
  let tenantId: Types.ObjectId;

  beforeEach(async () => {
    tenantId = new Types.ObjectId();
    mockChat.mockReset().mockResolvedValue({
      data: RESPUESTA,
      cacheHit: false,
      fromFaq: false,
      retrievedChunks: [{ texto: 'x', documentId: 'd' }],
      promptTokens: 1,
      completionTokens: 1,
      totalTokens: 2,
      durationMs: 1,
    });
    mockReplyFromIa.mockReset().mockResolvedValue(undefined);
    mockMarcarParaAsesor.mockReset().mockResolvedValue(undefined);
    mockClasificarSemaforo.mockReset().mockResolvedValue(undefined);
    mockExtraerDatos.mockReset().mockResolvedValue(undefined);
    mockHandoffConversation.mockReset().mockResolvedValue(undefined);
    await Cliente.deleteMany({});
    await Message.deleteMany({});
  });

  const job = (
    clienteId: Types.ObjectId,
  ): { tenantId: string; clienteId: string; recibidoEn: number } => ({
    tenantId: tenantId.toString(),
    clienteId: clienteId.toString(),
    recibidoEn: Date.now(),
  });

  const facturacion = {
    key: 'facturacion',
    nombre: 'Facturación',
    activa: true,
    palabras: ['factura', 'recibo'],
  };

  it('transfiere con motivo custom y arrastra la condición hasta la conversación (AC10)', async () => {
    mockGetHandoffSettings.mockResolvedValue(
      handoffSettings({ activo: true, condicionesExtras: [facturacion] }),
    );
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'necesito la factura de mi matrícula');

    await processAiReplyJob(job(clienteId));

    // Sin llamar al modelo: la condición se decide con el texto del cliente.
    expect(mockChat).not.toHaveBeenCalled();
    expect(mockHandoffConversation).toHaveBeenCalledWith(
      tenantId.toString(),
      clienteId.toString(),
      'custom',
      null,
      'primero',
      { key: 'facturacion', nombre: 'Facturación' },
    );
  });

  it('un handoff de fábrica no arrastra ninguna condición', async () => {
    mockGetHandoffSettings.mockResolvedValue(
      handoffSettings({
        activo: true,
        reglas: {
          explicitRequest: { activa: true, frases: ['hablar con un asesor'] },
          keyword: { activa: false, palabras: [] },
          lowConfidence: { activa: false, umbral: null },
          intentPurchase: { activa: false, nivelMinimo: 'caliente' },
        },
      }),
    );
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'quiero hablar con un asesor');

    await processAiReplyJob(job(clienteId));

    const [, , motivo, , , condicion] = mockHandoffConversation.mock.calls[0]!;
    expect(motivo).toBe('explicit_request');
    expect(condicion).toBeNull();
  });

  it('pasa la estrategia de destino configurada', async () => {
    mockGetHandoffSettings.mockResolvedValue(
      handoffSettings({
        activo: true,
        estrategiaDestino: 'menor_carga',
        condicionesExtras: [facturacion],
      }),
    );
    const clienteId = await crearCliente(tenantId, true);
    await crearMensaje(tenantId, clienteId, 'user', 'necesito la factura');

    await processAiReplyJob(job(clienteId));

    expect(mockHandoffConversation.mock.calls[0]![4]).toBe('menor_carga');
  });
});
