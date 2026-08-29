import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../../src/features/cliente/cliente.model.js';
import { ContactNote } from '../../src/features/contact-note/contact-note.model.js';

vi.mock('../../src/realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));
vi.mock('../../src/integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: vi.fn(), sendTemplate: vi.fn() },
}));

const { createNota, listNotas } = await import(
  '../../src/features/contact-note/contact-note.service.js'
);
const { updateCliente } = await import('../../src/features/cliente/cliente.service.js');

describe('Aislamiento multi-tenant — HU-CRM-02 (ficha editable + notas)', () => {
  const tenantA = new Types.ObjectId();
  const tenantB = new Types.ObjectId();
  const actorA = new Types.ObjectId().toString();
  const actorB = new Types.ObjectId().toString();
  let seq = 0;

  async function seedClienteEn(tenantId: Types.ObjectId): Promise<string> {
    const cliente = await Cliente.create({
      tenantId,
      metaUserId: `wa_crm02_iso_${seq++}`,
      telefono: '573001112233',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      nombre: 'Original',
      customFields: {},
      atributos: [],
      tagIds: [],
    });
    return (cliente._id as Types.ObjectId).toString();
  }

  // ─── PATCH /api/clientes/:id ──────────────────────────────────────────────────

  it('updateCliente de tenantB sobre un cliente de tenantA → 404 y el documento queda intacto', async () => {
    const clienteId = await seedClienteEn(tenantA);

    await expect(
      updateCliente(tenantB, actorB, clienteId, { nombre: 'Intruso' }, true),
    ).rejects.toMatchObject({ statusCode: 404 });

    const intacto = await Cliente.findById(clienteId).lean();
    expect(intacto?.nombre).toBe('Original');
  });

  it('tenantB no puede escribir datos sensibles en un cliente de tenantA', async () => {
    const clienteId = await seedClienteEn(tenantA);

    await expect(
      updateCliente(tenantB, actorB, clienteId, { correo: 'intruso@b.com' }, true),
    ).rejects.toMatchObject({ statusCode: 404 });

    const intacto = await Cliente.findById(clienteId).lean();
    expect(intacto?.correoEnc).toBeUndefined();
  });

  // ─── Notas ────────────────────────────────────────────────────────────────────

  it('crear una nota desde tenantB con un clienteId de tenantA → 404 SIN escribir', async () => {
    const clienteId = await seedClienteEn(tenantA);

    await expect(
      createNota(tenantB, actorB, clienteId, 'Nota inyectada desde otro tenant'),
    ).rejects.toMatchObject({ statusCode: 404 });

    // Lo importante no es solo el 404: es que no quedó ningún documento escrito.
    expect(await ContactNote.countDocuments({})).toBe(0);
  });

  it('listNotas de tenantB sobre un cliente de tenantA → 404, sin filtrar el contenido', async () => {
    const clienteId = await seedClienteEn(tenantA);
    await createNota(tenantA, actorA, clienteId, 'Confidencial de tenantA');

    await expect(listNotas(tenantB, clienteId, 1, 20)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('el mismo clienteId no arrastra notas entre tenants', async () => {
    // Dos contactos distintos, uno por tenant, cada uno con su nota.
    const clienteA = await seedClienteEn(tenantA);
    const clienteB = await seedClienteEn(tenantB);
    await createNota(tenantA, actorA, clienteA, 'Solo de A');
    await createNota(tenantB, actorB, clienteB, 'Solo de B');

    const paginaA = await listNotas(tenantA, clienteA, 1, 20);
    const paginaB = await listNotas(tenantB, clienteB, 1, 20);

    expect(paginaA.total).toBe(1);
    expect(paginaA.data[0]?.texto).toBe('Solo de A');
    expect(paginaB.total).toBe(1);
    expect(paginaB.data[0]?.texto).toBe('Solo de B');
  });

  it('un id de otro tenant y uno inexistente son indistinguibles (ambos 404, nunca 403)', async () => {
    const ajeno = await seedClienteEn(tenantA);
    const fantasma = new Types.ObjectId().toString();

    const errAjeno = await listNotas(tenantB, ajeno, 1, 20).catch((e: unknown) => e);
    const errFantasma = await listNotas(tenantB, fantasma, 1, 20).catch((e: unknown) => e);

    // Un 403 en el primer caso confirmaría que el recurso existe en otra empresa.
    expect(errAjeno).toMatchObject({ statusCode: 404 });
    expect(errFantasma).toMatchObject({ statusCode: 404 });
    expect((errAjeno as Error).message).toBe((errFantasma as Error).message);
  });
});
