import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

const { mockExtract } = vi.hoisted(() => ({ mockExtract: vi.fn() }));

// El singleton abre Redis al instanciarse; además aquí interesa controlar qué devuelve el modelo.
vi.mock('../../services/ai/ai-service.singleton.js', () => ({
  getAIService: () => ({ extract: mockExtract }),
}));

import { env } from '../../config/env.js';
import { createScoped, findByIdScoped } from '../../repositories/base.repository.js';
import { Cliente } from './cliente.model.js';
import { Message } from '../message/message.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { AppError } from '../../utils/AppError.js';
import { confirmarDatosExtraidos, ejecutarExtraccion, extractContactData } from './cliente.service.js';
import type { CampoExtraido, IClienteDocument, IDatosExtraidos } from './cliente.types.js';

const tenantId = new Types.ObjectId();
const actorId = new Types.ObjectId().toString();

/** Lo que el modelo «devuelve» tras el saneamiento de `datosExtraidosSchema`. */
interface SalidaLlm {
  nombreCompleto: string | null;
  correo: string | null;
  telefono: string | null;
  interes: string | null;
}

const VACIO: SalidaLlm = { nombreCompleto: null, correo: null, telefono: null, interes: null };

function responderModelo(data: Partial<SalidaLlm>): void {
  mockExtract.mockResolvedValue({ data: { ...VACIO, ...data } });
}

async function crearCliente(campos: Record<string, unknown> = {}): Promise<string> {
  const c = await createScoped(Cliente, tenantId, {
    metaUserId: `wa_${new Types.ObjectId().toString()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    ...campos,
  });
  return String((c as unknown as IClienteDocument)._id);
}

async function sembrarMensajes(clienteId: string, cuantos: number): Promise<void> {
  for (let i = 0; i < cuantos; i += 1) {
    await createScoped(Message, tenantId, {
      clienteId: new Types.ObjectId(clienteId),
      canal: 'whatsapp',
      direccion: i % 2 === 0 ? 'inbound' : 'outbound',
      sender: i % 2 === 0 ? 'user' : 'bot',
      tipo: 'text',
      texto: `mensaje ${i}`,
      // Fechas crecientes: el orden importa, el transcript se recorta por los más recientes.
      createdAt: new Date(Date.now() - (cuantos - i) * 1000),
    });
  }
}

async function leerDatos(clienteId: string): Promise<IDatosExtraidos> {
  const c = await findByIdScoped(Cliente, tenantId, clienteId).lean();
  return c!.datosExtraidos as IDatosExtraidos;
}

describe('HU-IA-06 — el cuarto campo y el saneamiento', () => {
  beforeEach(() => {
    mockExtract.mockReset();
  });

  // AC2: el hueco más fácil de dejar abierto es que el modelo devuelva la temperatura del prospecto
  // en vez del producto. Que la instrucción esté escrita es parte del contrato.
  it('pide el interés como producto concreto y NO como nivel de interés', async () => {
    responderModelo({});
    const clienteId = await crearCliente();
    await sembrarMensajes(clienteId, 2);
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);

    const slots = mockExtract.mock.calls[0]![0].camposObjetivo as { campo: string; descripcion: string }[];
    const interes = slots.find((s) => s.campo === 'interes');
    expect(interes).toBeDefined();
    expect(interes!.descripcion).toContain('CONCRETO');
    expect(interes!.descripcion).toContain('NO es el nivel de interés');
  });

  // AC1
  it('persiste el interés extraído', async () => {
    responderModelo({ interes: 'curso pre-ICFES sabatino' });
    const clienteId = await crearCliente();
    await sembrarMensajes(clienteId, 2);
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);

    expect((await leerDatos(clienteId)).interes).toBe('curso pre-ICFES sabatino');
  });

  // AC14: hasta HU-IA-06 se cargaba el hilo entero, sin techo de coste ni de ventana.
  it('acota el transcript a EXTRACT_MAX_MENSAJES, quedándose con los más recientes', async () => {
    responderModelo({});
    const clienteId = await crearCliente();
    await sembrarMensajes(clienteId, env.EXTRACT_MAX_MENSAJES + 10);
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);

    const historial = mockExtract.mock.calls[0]![0].historial as { content: string }[];
    expect(historial).toHaveLength(env.EXTRACT_MAX_MENSAJES);
    // Cronológico y con los últimos: el primero ya no es "mensaje 0".
    expect(historial[0]!.content).toBe('mensaje 10');
    expect(historial.at(-1)!.content).toBe(`mensaje ${env.EXTRACT_MAX_MENSAJES + 9}`);
  });

  it('rechaza con 422 si no hay mensajes de texto', async () => {
    const clienteId = await crearCliente();
    await expect(ejecutarExtraccion(tenantId.toString(), clienteId, actorId)).rejects.toThrow(
      AppError,
    );
  });
});

describe('HU-IA-06 — el merge no destructivo de la extracción', () => {
  beforeEach(() => {
    mockExtract.mockReset();
  });

  // AC5: el hueco 3 del spec. Antes se escribía `datosExtraidos` entero y el correo se perdía.
  it('no borra un valor que la pasada anterior encontró', async () => {
    const clienteId = await crearCliente();
    await sembrarMensajes(clienteId, 2);

    responderModelo({ correo: 'diego@empresa.com', nombreCompleto: 'Diego Ramírez' });
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);

    responderModelo({});
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);

    const datos = await leerDatos(clienteId);
    expect(datos.correo).toBe('diego@empresa.com');
    expect(datos.nombreCompleto).toBe('Diego Ramírez');
  });

  // AC6
  it('conserva el valor de un campo ya confirmado aunque el modelo devuelva otro', async () => {
    const clienteId = await crearCliente();
    await sembrarMensajes(clienteId, 2);

    responderModelo({ nombreCompleto: 'Diego Ramírez' });
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);
    await confirmarDatosExtraidos(tenantId.toString(), actorId, clienteId, ['nombreCompleto'], true);

    responderModelo({ nombreCompleto: 'Otro Nombre' });
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);

    const datos = await leerDatos(clienteId);
    expect(datos.nombreCompleto).toBe('Diego Ramírez');
    expect(datos.confirmados).toContain('nombreCompleto');
  });

  it('conserva un teléfono dictado que la nueva pasada no ve, sin caer al de WhatsApp', async () => {
    const clienteId = await crearCliente();
    await sembrarMensajes(clienteId, 2);

    responderModelo({ telefono: '6011234567' });
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);

    responderModelo({});
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);

    const datos = await leerDatos(clienteId);
    expect(datos.telefono).toBe('6011234567');
    expect(datos.telefonoOrigen).toBe('conversacion');
  });

  it('cae al número de WhatsApp cuando nunca se dictó ninguno', async () => {
    responderModelo({});
    const clienteId = await crearCliente();
    await sembrarMensajes(clienteId, 2);
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);

    const datos = await leerDatos(clienteId);
    expect(datos.telefono).toBe('573000000000');
    expect(datos.telefonoOrigen).toBe('whatsapp');
  });
});

describe('HU-IA-06 — auditoría de la extracción', () => {
  beforeEach(() => {
    mockExtract.mockReset();
  });

  // AC16 y AC18
  it('registra cliente.extract con el correo oculto y el actor recibido', async () => {
    responderModelo({ correo: 'diego@empresa.com', interes: 'curso sabatino' });
    const clienteId = await crearCliente();
    await sembrarMensajes(clienteId, 2);
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);

    const eventos = await AuditEvent.find({ tenantId, accion: 'cliente.extract' }).lean();
    expect(eventos).toHaveLength(1);
    expect(String(eventos[0]!.actorId)).toBe(actorId);
    expect(eventos[0]!.despues['correo']).toBe('[oculto]');
    expect(eventos[0]!.despues['correo']).not.toContain('@');
    // El interés es un dato comercial, no personal: va en claro.
    expect(eventos[0]!.despues['interes']).toBe('curso sabatino');
  });

  it('registra el actor como null cuando la dispara el sistema', async () => {
    responderModelo({ nombreCompleto: 'Diego' });
    const clienteId = await crearCliente();
    await sembrarMensajes(clienteId, 2);
    await ejecutarExtraccion(tenantId.toString(), clienteId, null);

    const eventos = await AuditEvent.find({ tenantId, accion: 'cliente.extract' }).lean();
    expect(eventos[0]!.actorId).toBeNull();
  });

  // AC16: sin esto, la extracción automática por ráfaga llenaría audit_events de eventos idénticos.
  it('NO registra nada cuando la extracción devuelve exactamente lo mismo', async () => {
    const clienteId = await crearCliente();
    await sembrarMensajes(clienteId, 2);

    responderModelo({ nombreCompleto: 'Diego' });
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);

    const eventos = await AuditEvent.find({ tenantId, accion: 'cliente.extract' }).lean();
    expect(eventos).toHaveLength(1);
  });
});

describe('HU-IA-06 — confirmar los datos extraídos', () => {
  beforeEach(() => {
    mockExtract.mockReset();
  });

  async function extraerEn(clienteId: string, data: Partial<SalidaLlm>): Promise<void> {
    responderModelo(data);
    await sembrarMensajes(clienteId, 2);
    await ejecutarExtraccion(tenantId.toString(), clienteId, actorId);
  }

  // AC7, primera dirección
  it('escribe el nombre en la ficha cuando estaba vacía', async () => {
    const clienteId = await crearCliente();
    await extraerEn(clienteId, { nombreCompleto: 'Diego Ramírez' });

    const res = await confirmarDatosExtraidos(
      tenantId.toString(),
      actorId,
      clienteId,
      ['nombreCompleto'],
      true,
    );

    expect(res.aplicados).toEqual(['nombreCompleto']);
    expect(res.omitidos).toEqual([]);
    expect(res.contacto.nombre).toBe('Diego Ramírez');
    expect(res.datosExtraidos.confirmados).toContain('nombreCompleto');
  });

  // AC7, segunda dirección: es el AC1 de la historia de usuario.
  it('NO pisa un nombre ya guardado y lo devuelve en omitidos', async () => {
    const clienteId = await crearCliente({ nombre: 'Nombre A Mano' });
    await extraerEn(clienteId, { nombreCompleto: 'Diego Ramírez' });

    const res = await confirmarDatosExtraidos(
      tenantId.toString(),
      actorId,
      clienteId,
      ['nombreCompleto'],
      true,
    );

    expect(res.aplicados).toEqual([]);
    expect(res.omitidos).toEqual(['nombreCompleto']);
    expect(res.contacto.nombre).toBe('Nombre A Mano');
    // Y no se marca confirmado: el dato NO está en la ficha, marcarlo sería mentir.
    expect(res.datosExtraidos.confirmados).not.toContain('nombreCompleto');
  });

  // AC8: todo o nada, igual que updateCliente.
  it('responde 403 al confirmar el correo sin permiso, sin escribir el resto del lote', async () => {
    const clienteId = await crearCliente();
    await extraerEn(clienteId, { nombreCompleto: 'Diego Ramírez', correo: 'diego@empresa.com' });

    await expect(
      confirmarDatosExtraidos(
        tenantId.toString(),
        actorId,
        clienteId,
        ['nombreCompleto', 'correo'],
        false,
      ),
    ).rejects.toMatchObject({ statusCode: 403 });

    const cliente = await findByIdScoped(Cliente, tenantId, clienteId).lean();
    expect(cliente!.nombre).toBeUndefined();
    expect(cliente!.correoEnc).toBeUndefined();
  });

  it('escribe el correo cuando quien confirma sí puede ver datos sensibles', async () => {
    const clienteId = await crearCliente();
    await extraerEn(clienteId, { correo: 'diego@empresa.com' });

    const res = await confirmarDatosExtraidos(
      tenantId.toString(),
      actorId,
      clienteId,
      ['correo'],
      true,
    );

    expect(res.aplicados).toEqual(['correo']);
    expect(res.contacto.correo).toBe('diego@empresa.com');
  });

  // AC9
  it('deja el interés como atributo del contacto', async () => {
    const clienteId = await crearCliente();
    await extraerEn(clienteId, { interes: 'curso pre-ICFES sabatino' });

    const res = await confirmarDatosExtraidos(
      tenantId.toString(),
      actorId,
      clienteId,
      ['interes'],
      true,
    );

    expect(res.aplicados).toEqual(['interes']);
    expect(res.contacto.atributos).toContainEqual(
      expect.objectContaining({
        key: 'interes',
        label: 'Interés',
        valor: 'curso pre-ICFES sabatino',
        sensible: false,
      }),
    );
  });

  // AC9, segunda mitad: ni duplica ni sobrescribe.
  it('omite el interés si el contacto ya tiene un atributo con esa clave', async () => {
    const clienteId = await crearCliente({
      atributos: [{ key: 'interes', label: 'Interés', valor: 'lo que dijo el asesor', sensible: false }],
    });
    await extraerEn(clienteId, { interes: 'curso pre-ICFES sabatino' });

    const res = await confirmarDatosExtraidos(
      tenantId.toString(),
      actorId,
      clienteId,
      ['interes'],
      true,
    );

    expect(res.omitidos).toEqual(['interes']);
    expect(res.contacto.atributos.filter((a) => a.key === 'interes')).toHaveLength(1);
    expect(res.contacto.atributos[0]!.valor).toBe('lo que dijo el asesor');
  });

  // AC10
  it('rechaza con 400 confirmar un teléfono que es el propio número de WhatsApp', async () => {
    const clienteId = await crearCliente();
    await extraerEn(clienteId, {});

    await expect(
      confirmarDatosExtraidos(tenantId.toString(), actorId, clienteId, ['telefono'], true),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  // AC10, segunda mitad: nunca toca `Cliente.telefono`, que resincroniza Meta.
  it('deja un teléfono dictado como atributo alterno, sin tocar el del contacto', async () => {
    const clienteId = await crearCliente();
    await extraerEn(clienteId, { telefono: '6011234567' });

    const res = await confirmarDatosExtraidos(
      tenantId.toString(),
      actorId,
      clienteId,
      ['telefono'],
      true,
    );

    expect(res.aplicados).toEqual(['telefono']);
    expect(res.contacto.telefono).toBe('573000000000');
    expect(res.contacto.atributos).toContainEqual(
      expect.objectContaining({ key: 'telefono-alterno', valor: '6011234567' }),
    );
  });

  it('rechaza con 400 un campo que la IA no extrajo', async () => {
    const clienteId = await crearCliente();
    await extraerEn(clienteId, {});

    await expect(
      confirmarDatosExtraidos(tenantId.toString(), actorId, clienteId, ['interes'], true),
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  it('responde 409 si el contacto no tiene datos extraídos', async () => {
    const clienteId = await crearCliente();
    await expect(
      confirmarDatosExtraidos(tenantId.toString(), actorId, clienteId, ['nombreCompleto'], true),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('responde 404 si el contacto no existe', async () => {
    await expect(
      confirmarDatosExtraidos(
        tenantId.toString(),
        actorId,
        new Types.ObjectId().toString(),
        ['nombreCompleto'],
        true,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  // AC17 y AC18
  it('registra cliente.extract-confirm con el actor real y el correo oculto', async () => {
    const clienteId = await crearCliente();
    await extraerEn(clienteId, { correo: 'diego@empresa.com' });

    await confirmarDatosExtraidos(tenantId.toString(), actorId, clienteId, ['correo'], true);

    const eventos = await AuditEvent.find({ tenantId, accion: 'cliente.extract-confirm' }).lean();
    expect(eventos).toHaveLength(1);
    expect(String(eventos[0]!.actorId)).toBe(actorId);
    expect(eventos[0]!.despues['correo']).toBe('[oculto]');
    expect(eventos[0]!.despues['aplicados']).toEqual(['correo']);
  });

  // AC11: confirmar en lote aplica lo que puede y dice qué dejó fuera.
  it('aplica y omite en el mismo lote, y lo reporta', async () => {
    const clienteId = await crearCliente({ nombre: 'Nombre A Mano' });
    await extraerEn(clienteId, {
      nombreCompleto: 'Diego Ramírez',
      interes: 'curso pre-ICFES sabatino',
    });

    const campos: CampoExtraido[] = ['nombreCompleto', 'interes'];
    const res = await confirmarDatosExtraidos(tenantId.toString(), actorId, clienteId, campos, true);

    expect(res.aplicados).toEqual(['interes']);
    expect(res.omitidos).toEqual(['nombreCompleto']);
  });
});

describe('HU-IA-06 — el DTO que llega a la ficha', () => {
  beforeEach(() => {
    mockExtract.mockReset();
  });

  it('enmascara el correo extraído para quien no puede ver datos sensibles', async () => {
    responderModelo({ correo: 'diego@empresa.com' });
    const clienteId = await crearCliente();
    await sembrarMensajes(clienteId, 2);

    const dto = await extractContactData(tenantId.toString(), clienteId, actorId, false);

    expect(dto.correo).toBe('d••••@empresa.com');
    expect(dto.confirmados).toEqual([]);
  });
});
