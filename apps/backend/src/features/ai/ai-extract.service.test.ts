import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

const { mockExtract } = vi.hoisted(() => ({ mockExtract: vi.fn() }));

// El singleton abre Redis al instanciarse; además aquí interesa controlar qué devuelve el modelo.
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ extract: mockExtract }),
}));
// `publishRealtime` se queda esperando indefinidamente si no hay un Redis escuchando: no es lo que
// se está probando y colgaría el test.
vi.mock('../../realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn().mockResolvedValue(undefined),
}));

import { env } from '../../config/env.js';
import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { Cliente } from '../cliente/cliente.model.js';
import { Message } from '../message/message.model.js';
import type { IClienteDocument, IDatosExtraidos } from '../cliente/cliente.types.js';
import type { ChatTurn } from '../../integrations/llm/llm-provider.types.js';
import { publishRealtime } from '../../realtime/realtime.publisher.js';
import { extraerDatosSiHaceFalta } from './ai-extract.service.js';

/**
 * `vi.restoreAllMocks` es obligatorio y no cosmético: el test del kill-switch usa `vi.spyOn` sobre
 * un getter de `env`, y sin restaurarlo ese `off` se filtraría al resto del archivo dejando pasar
 * todas las guardas por el motivo equivocado.
 */
function arranqueLimpio(): void {
  vi.restoreAllMocks();
  mockExtract.mockReset();
  vi.mocked(publishRealtime).mockClear();
  vi.mocked(publishRealtime).mockResolvedValue(undefined);
  responderModelo();
}

const tenantId = new Types.ObjectId();

/** Lo que el modelo «devuelve» tras el saneamiento de `datosExtraidosSchema`. */
interface SalidaLlm {
  nombreCompleto: string | null;
  correo: string | null;
  telefono: string | null;
  interes: string | null;
}

const VACIO: SalidaLlm = { nombreCompleto: null, correo: null, telefono: null, interes: null };

function responderModelo(data: Partial<SalidaLlm> = {}): void {
  mockExtract.mockResolvedValue({ data: { ...VACIO, ...data } });
}

/** Historial con `n` turnos del cliente, para calibrar la guarda de turnos mínimos. */
function historial(n: number): ChatTurn[] {
  const turnos: ChatTurn[] = [];
  for (let i = 0; i < n; i += 1) {
    turnos.push({ role: 'user', content: `mensaje ${i}` });
    turnos.push({ role: 'model', content: 'respuesta' });
  }
  return turnos;
}

async function crearCliente(datos?: Partial<IDatosExtraidos>): Promise<string> {
  const c = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${new Types.ObjectId().toString()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    iaHabilitada: true,
    ultimoMensajeAt: new Date(),
    ...(datos
      ? {
          datosExtraidos: {
            nombreCompleto: null,
            correo: null,
            telefono: '573000000000',
            telefonoOrigen: 'whatsapp',
            interes: null,
            confirmados: [],
            // Una hora atrás: por defecto SÍ hay mensajes nuevos desde la última extracción.
            extraidoAt: new Date(Date.now() - 3_600_000),
            modelo: 'gemini-2.5-flash',
            ...datos,
          },
        }
      : {}),
  });
  const id = String((c as unknown as IClienteDocument)._id);
  await createScoped(Message, tenantId, {
    clienteId: new Types.ObjectId(id),
    canal: 'whatsapp',
    direccion: 'inbound',
    sender: 'user',
    tipo: 'text',
    texto: 'hola, soy Diego',
  });
  return id;
}

async function leerDatos(clienteId: string): Promise<IDatosExtraidos | undefined> {
  const c = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  return c!.datosExtraidos;
}

describe('HU-IA-06 — guardas de la extracción automática', () => {
  beforeEach(arranqueLimpio);

  // AC12: el caso feliz, para que las guardas de abajo signifiquen algo.
  it('extrae cuando falta algún campo y hay mensajes nuevos', async () => {
    const clienteId = await crearCliente();
    responderModelo({ nombreCompleto: 'Diego Ramírez' });

    await extraerDatosSiHaceFalta(tenantId.toString(), clienteId, historial(2));

    expect(mockExtract).toHaveBeenCalledTimes(1);
    expect((await leerDatos(clienteId))?.nombreCompleto).toBe('Diego Ramírez');
  });

  // AC13
  it('con EXTRACT_AUTO=off no llama al modelo ni escribe nada', async () => {
    const clienteId = await crearCliente();
    vi.spyOn(env, 'EXTRACT_AUTO', 'get').mockReturnValue('off');

    await extraerDatosSiHaceFalta(tenantId.toString(), clienteId, historial(5));

    expect(mockExtract).not.toHaveBeenCalled();
    expect(await leerDatos(clienteId)).toBeUndefined();
  });

  // AC12
  it('no corre con menos turnos del cliente que el mínimo', async () => {
    const clienteId = await crearCliente();

    await extraerDatosSiHaceFalta(
      tenantId.toString(),
      clienteId,
      historial(env.EXTRACT_MIN_TURNOS_CLIENTE - 1),
    );

    expect(mockExtract).not.toHaveBeenCalled();
  });

  // AC12 y AC14: el techo de coste de una conversación.
  it('no vuelve a correr cuando nombre, correo e interés ya se encontraron', async () => {
    const clienteId = await crearCliente({
      nombreCompleto: 'Diego Ramírez',
      correo: 'diego@empresa.com',
      interes: 'curso pre-ICFES sabatino',
    });

    await extraerDatosSiHaceFalta(tenantId.toString(), clienteId, historial(5));

    expect(mockExtract).not.toHaveBeenCalled();
  });

  /**
   * El fallo silencioso más fácil de introducir: `telefono` nunca es `null` —cae al número de
   * WhatsApp—, así que si entrara en `CAMPOS_AUTO` la guarda de «falta algo» sería siempre falsa y
   * la extracción automática no correría JAMÁS. Este test es el que caza esa regresión.
   */
  it('SÍ corre si solo está lleno el teléfono', async () => {
    const clienteId = await crearCliente({ telefono: '573000000000', telefonoOrigen: 'whatsapp' });

    await extraerDatosSiHaceFalta(tenantId.toString(), clienteId, historial(5));

    expect(mockExtract).toHaveBeenCalledTimes(1);
  });

  // AC12
  it('no corre si no hay mensajes nuevos desde la última extracción', async () => {
    const clienteId = await crearCliente({ extraidoAt: new Date(Date.now() + 60_000) });

    await extraerDatosSiHaceFalta(tenantId.toString(), clienteId, historial(5));

    expect(mockExtract).not.toHaveBeenCalled();
  });

  it('no corre para un contacto que no existe', async () => {
    await extraerDatosSiHaceFalta(
      tenantId.toString(),
      new Types.ObjectId().toString(),
      historial(5),
    );

    expect(mockExtract).not.toHaveBeenCalled();
  });
});

describe('HU-IA-06 — la extracción automática nunca rompe el auto-reply', () => {
  beforeEach(arranqueLimpio);

  // AC15: la respuesta al cliente ya salió; un fallo aquí no puede dar el job por fallido.
  it('traga el fallo del proveedor y no propaga', async () => {
    const clienteId = await crearCliente();
    mockExtract.mockRejectedValue(new Error('Gemini 429'));

    await expect(
      extraerDatosSiHaceFalta(tenantId.toString(), clienteId, historial(5)),
    ).resolves.toBeUndefined();

    expect(await leerDatos(clienteId)).toBeUndefined();
  });
});

describe('HU-IA-06 — tiempo real', () => {
  beforeEach(() => {
    arranqueLimpio();
    responderModelo({ nombreCompleto: 'Diego' });
  });

  // AC21: sin evento nuevo — `conversation:updated` ya invalida `['contact-history']` en la SPA.
  it('publica conversation:updated tras escribir', async () => {
    const clienteId = await crearCliente();

    await extraerDatosSiHaceFalta(tenantId.toString(), clienteId, historial(5));

    expect(publishRealtime).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'conversation:updated' }),
    );
  });
});
