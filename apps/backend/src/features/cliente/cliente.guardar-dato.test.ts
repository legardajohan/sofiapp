import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Types } from 'mongoose';

// El singleton de IA abre Redis al instanciarse y este test no lo necesita.
vi.mock('../../services/ai/ai-service.singleton.js', () => ({ getAIService: () => ({ extract: vi.fn() }) }));

import { createScoped } from '../../repositories/base.repository.js';
import { ACTOR_SISTEMA_FLUJO } from '../../utils/actor-sistema.util.js';
import { Cliente } from './cliente.model.js';
import { AuditEvent } from '../audit/audit.model.js';
import { ContactField } from '../contact-field/contact-field.model.js';
import { ContactOption } from '../contact-option/contact-option.model.js';
import { guardarDatoDesdeFlujo } from './cliente.service.js';
import type { IClienteDocument } from './cliente.types.js';

const tenantId = new Types.ObjectId();
const otroTenant = new Types.ObjectId();

async function crearCliente(tenant = tenantId, campos: Record<string, unknown> = {}): Promise<string> {
  const c = await createScoped(Cliente, tenant, {
    metaUserId: `wa_${new Types.ObjectId().toString()}`,
    telefono: '573000000000',
    canalOrigen: 'whatsapp',
    ...campos,
  });
  return String((c as unknown as IClienteDocument)._id);
}

async function crearCampo(
  key: string,
  extra: Partial<{ tipoDato: string; sensible: boolean; activo: boolean; tenant: Types.ObjectId }> = {},
): Promise<void> {
  await ContactField.create({
    tenantId: extra.tenant ?? tenantId,
    key,
    label: key.charAt(0).toUpperCase() + key.slice(1),
    labelNormalizado: key,
    tipoDato: extra.tipoDato ?? 'texto',
    sensible: extra.sensible ?? false,
    activo: extra.activo ?? true,
    orden: 0,
  });
}

beforeEach(async () => {
  await Cliente.deleteMany({});
  await ContactField.deleteMany({});
  await ContactOption.deleteMany({});
  await AuditEvent.deleteMany({});
});

describe('guardarDatoDesdeFlujo — campos fijos (HU-FLOW-05, criterios 10-13)', () => {
  it('escribe el nombre cuando el contacto no lo tenía', async () => {
    const id = await crearCliente();
    const r = await guardarDatoDesdeFlujo(tenantId, id, { tipo: 'contacto', campo: 'nombre' }, ' Ana Gómez ', {
      sobrescribir: false,
    });
    expect(r.escrito).toBe(true);
    expect((await Cliente.findById(id).lean())?.nombre).toBe('Ana Gómez');
  });

  it('sobrescribir:false con dato previo NO escribe; true SÍ reemplaza', async () => {
    const id = await crearCliente(tenantId, { nombre: 'Juan' });
    const destino = { tipo: 'contacto', campo: 'nombre' } as const;

    expect(await guardarDatoDesdeFlujo(tenantId, id, destino, 'Ana', { sobrescribir: false })).toEqual({
      escrito: false,
      motivo: 'ya_existia',
    });
    expect((await Cliente.findById(id).lean())?.nombre).toBe('Juan');

    expect((await guardarDatoDesdeFlujo(tenantId, id, destino, 'Ana', { sobrescribir: true })).escrito).toBe(true);
    expect((await Cliente.findById(id).lean())?.nombre).toBe('Ana');
  });

  it('un correo inválido no se escribe (motivo invalido)', async () => {
    const id = await crearCliente();
    const r = await guardarDatoDesdeFlujo(tenantId, id, { tipo: 'contacto', campo: 'correo' }, 'no-es-correo', {
      sobrescribir: true,
    });
    expect(r).toEqual({ escrito: false, motivo: 'invalido' });
    expect((await Cliente.findById(id).lean())?.correoEnc).toBeUndefined();
  });

  it('un correo válido se normaliza y se enmascara en lo que se muestra', async () => {
    const id = await crearCliente();
    const r = await guardarDatoDesdeFlujo(tenantId, id, { tipo: 'contacto', campo: 'correo' }, ' ANA@Empresa.com ', {
      sobrescribir: false,
    });
    expect(r).toMatchObject({ escrito: true, sensible: true, valorVisible: '••••••' });
    expect((await Cliente.findById(id).lean())?.correoEnc).toBe('ana@empresa.com');
  });

  it('el rol debe ser una opción ACTIVA del catálogo del tenant; fuera del catálogo no se escribe', async () => {
    const id = await crearCliente();
    await ContactOption.create([
      { tenantId, tipo: 'rol', key: 'decisor', label: 'Decisor', orden: 0, activo: true },
      { tenantId, tipo: 'rol', key: 'influyente', label: 'Influyente', orden: 1, activo: false },
    ]);
    const destino = { tipo: 'contacto', campo: 'rolContacto' } as const;

    expect((await guardarDatoDesdeFlujo(tenantId, id, destino, 'inventado', { sobrescribir: true })).motivo).toBe(
      'invalido',
    );
    expect((await guardarDatoDesdeFlujo(tenantId, id, destino, 'influyente', { sobrescribir: true })).motivo).toBe(
      'invalido',
    );
    expect((await guardarDatoDesdeFlujo(tenantId, id, destino, 'decisor', { sobrescribir: true })).escrito).toBe(true);
    expect((await Cliente.findById(id).lean())?.rolContacto).toBe('decisor');
  });

  it('la auditoría registra al actor sistema y nunca el valor sensible', async () => {
    const id = await crearCliente();
    await guardarDatoDesdeFlujo(tenantId, id, { tipo: 'contacto', campo: 'documento' }, '1085271234', {
      sobrescribir: false,
    });
    const evento = await AuditEvent.findOne({ entidadId: id, accion: 'cliente.update' }).lean();
    expect(evento).not.toBeNull();
    expect(String(evento?.actorId)).toBe(ACTOR_SISTEMA_FLUJO);
    expect(JSON.stringify(evento)).not.toContain('1085271234');
    expect(JSON.stringify(evento)).toContain('[oculto]');
  });
});

describe('guardarDatoDesdeFlujo — campos personalizados', () => {
  const destino = (key: string) => ({ tipo: 'atributo', key }) as const;

  it('fusiona por key: agrega o actualiza ese atributo y NO toca los demás', async () => {
    await crearCampo('colegio');
    await crearCampo('ciudad');
    const id = await crearCliente(tenantId, {
      atributos: [{ key: 'ciudad', label: 'Ciudad', valor: 'Pasto', sensible: false }],
    });

    await guardarDatoDesdeFlujo(tenantId, id, destino('colegio'), 'Libertad', { sobrescribir: false });
    let doc = await Cliente.findById(id).lean();
    expect(doc?.atributos.map((a) => [a.key, a.valor])).toEqual([
      ['ciudad', 'Pasto'],
      ['colegio', 'Libertad'],
    ]);

    await guardarDatoDesdeFlujo(tenantId, id, destino('colegio'), 'La Salle', { sobrescribir: true });
    doc = await Cliente.findById(id).lean();
    expect(doc?.atributos.map((a) => [a.key, a.valor])).toEqual([
      ['ciudad', 'Pasto'],
      ['colegio', 'La Salle'],
    ]);
  });

  it('sobrescribir:false con el atributo ya presente → ya_existia', async () => {
    await crearCampo('colegio');
    const id = await crearCliente(tenantId, {
      atributos: [{ key: 'colegio', label: 'Colegio', valor: 'Libertad', sensible: false }],
    });
    expect(await guardarDatoDesdeFlujo(tenantId, id, destino('colegio'), 'Otro', { sobrescribir: false })).toEqual({
      escrito: false,
      motivo: 'ya_existia',
    });
  });

  it('valida contra el tipoDato del catálogo: numero, fecha y booleano', async () => {
    await crearCampo('edad', { tipoDato: 'numero' });
    await crearCampo('nacimiento', { tipoDato: 'fecha' });
    await crearCampo('acepta', { tipoDato: 'booleano' });
    const id = await crearCliente();
    const o = { sobrescribir: true };

    expect((await guardarDatoDesdeFlujo(tenantId, id, destino('edad'), 'diecisiete', o)).motivo).toBe('invalido');
    expect((await guardarDatoDesdeFlujo(tenantId, id, destino('edad'), '17', o)).escrito).toBe(true);
    expect((await guardarDatoDesdeFlujo(tenantId, id, destino('nacimiento'), 'ayer', o)).motivo).toBe('invalido');
    expect((await guardarDatoDesdeFlujo(tenantId, id, destino('nacimiento'), '2008-05-12T00:00:00Z', o)).escrito).toBe(
      true,
    );
    expect((await guardarDatoDesdeFlujo(tenantId, id, destino('acepta'), 'Sí', o)).escrito).toBe(true);

    const valores = Object.fromEntries((await Cliente.findById(id).lean())!.atributos.map((a) => [a.key, a.valor]));
    expect(valores).toEqual({ edad: '17', nacimiento: '2008-05-12', acepta: 'sí' });
  });

  it('un campo archivado no se escribe (campo_archivado); uno inexistente tampoco', async () => {
    await crearCampo('colegio', { activo: false });
    const id = await crearCliente();
    expect((await guardarDatoDesdeFlujo(tenantId, id, destino('colegio'), 'x', { sobrescribir: true })).motivo).toBe(
      'campo_archivado',
    );
    expect((await guardarDatoDesdeFlujo(tenantId, id, destino('nope'), 'x', { sobrescribir: true })).motivo).toBe(
      'invalido',
    );
  });

  it('un campo sensible se marca como tal en el atributo y se enmascara en lo que se muestra', async () => {
    await crearCampo('eps', { sensible: true });
    const id = await crearCliente();
    const r = await guardarDatoDesdeFlujo(tenantId, id, destino('eps'), 'Sura-99887', { sobrescribir: false });
    expect(r).toMatchObject({ escrito: true, sensible: true, valorVisible: '••••••' });
    const [eps] = (await Cliente.findById(id).lean())!.atributos;
    expect(eps?.sensible).toBe(true);
    const evento = await AuditEvent.findOne({ entidadId: id }).lean();
    expect(JSON.stringify(evento)).not.toContain('Sura-99887');
  });

  it('respeta el máximo de 30 atributos por contacto', async () => {
    await crearCampo('nuevo');
    const atributos = Array.from({ length: 30 }, (_, i) => ({ key: `a${i}`, label: `A${i}`, valor: 'x', sensible: false }));
    const id = await crearCliente(tenantId, { atributos });
    expect((await guardarDatoDesdeFlujo(tenantId, id, destino('nuevo'), 'x', { sobrescribir: true })).motivo).toBe(
      'invalido',
    );
  });
});

describe('guardarDatoDesdeFlujo — aislamiento multi-tenant (HU-FLOW-05, criterio 36)', () => {
  it('no escribe en un Cliente de otro tenant', async () => {
    const idDeOtro = await crearCliente(otroTenant, { nombre: 'Intacto' });
    const r = await guardarDatoDesdeFlujo(tenantId, idDeOtro, { tipo: 'contacto', campo: 'nombre' }, 'Pisado', {
      sobrescribir: true,
    });
    expect(r).toEqual({ escrito: false, motivo: 'contacto_inexistente' });
    expect((await Cliente.findById(idDeOtro).lean())?.nombre).toBe('Intacto');
  });

  it('una key que solo existe en el catálogo de OTRO tenant no se escribe', async () => {
    await crearCampo('colegio', { tenant: otroTenant });
    const id = await crearCliente(tenantId);
    const r = await guardarDatoDesdeFlujo(tenantId, id, { tipo: 'atributo', key: 'colegio' }, 'x', {
      sobrescribir: true,
    });
    expect(r.motivo).toBe('invalido');
    expect((await Cliente.findById(id).lean())?.atributos).toHaveLength(0);
  });
});
