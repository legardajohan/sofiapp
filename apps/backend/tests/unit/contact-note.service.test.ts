import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../../src/features/cliente/cliente.model.js';
import { ContactNote } from '../../src/features/contact-note/contact-note.model.js';
import { User } from '../../src/features/users/user.model.js';

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

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('contact-note.service (HU-CRM-02)', () => {
  const tenantId = new Types.ObjectId();
  let seq = 0;

  async function seedCliente(): Promise<string> {
    const cliente = await Cliente.create({
      tenantId,
      metaUserId: `wa_nota_${seq++}`,
      telefono: '573001112233',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      atributos: [],
      tagIds: [],
    });
    return (cliente._id as Types.ObjectId).toString();
  }

  async function seedAutor(nombre: string): Promise<string> {
    const user = await User.create({
      tenantId,
      nombre,
      email: `autor_${seq++}@empresa.test`,
      passwordHash: 'x'.repeat(20),
      rol: 'admin',
      activo: true,
    });
    return (user._id as Types.ObjectId).toString();
  }

  it('crea la nota con el texto CIFRADO en Mongo y el autor resuelto en la respuesta', async () => {
    const clienteId = await seedCliente();
    const autorId = await seedAutor('Ana Gómez');

    const nota = await createNota(tenantId, autorId, clienteId, 'Pidió descuento por pago anticipado');

    expect(nota.texto).toBe('Pidió descuento por pago anticipado');
    expect(nota.autor).toEqual({ id: autorId, nombre: 'Ana Gómez' });

    const doc = await ContactNote.findById(nota.id).lean();
    expect(doc?.textoEnc.startsWith('enc:v1:')).toBe(true);
    expect(JSON.stringify(doc)).not.toContain('descuento');
  });

  it('lista las notas más reciente primero, paginadas', async () => {
    const clienteId = await seedCliente();
    const autorId = await seedAutor('Ana');

    await createNota(tenantId, autorId, clienteId, 'Primera');
    await delay(10);
    await createNota(tenantId, autorId, clienteId, 'Segunda');
    await delay(10);
    await createNota(tenantId, autorId, clienteId, 'Tercera');

    const pagina = await listNotas(tenantId, clienteId, 1, 2);

    expect(pagina.total).toBe(3);
    expect(pagina.data).toHaveLength(2);
    expect(pagina.data.map((n) => n.texto)).toEqual(['Tercera', 'Segunda']);
  });

  it('no mezcla notas de otros contactos del mismo tenant', async () => {
    const unoId = await seedCliente();
    const otroId = await seedCliente();
    const autorId = await seedAutor('Ana');

    await createNota(tenantId, autorId, unoId, 'Del contacto uno');
    await createNota(tenantId, autorId, otroId, 'Del contacto dos');

    const pagina = await listNotas(tenantId, unoId, 1, 20);
    expect(pagina.total).toBe(1);
    expect(pagina.data[0]?.texto).toBe('Del contacto uno');
  });

  it('un contacto inexistente da 404 y no escribe la nota', async () => {
    const autorId = await seedAutor('Ana');
    const fantasma = new Types.ObjectId().toString();

    await expect(createNota(tenantId, autorId, fantasma, 'Nota huérfana')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(await ContactNote.countDocuments({})).toBe(0);
  });

  it('un autor borrado deja la nota legible con nombre null', async () => {
    const clienteId = await seedCliente();
    const autorId = await seedAutor('Efímero');
    await createNota(tenantId, autorId, clienteId, 'Sobrevive al autor');
    await User.deleteOne({ _id: autorId });

    const pagina = await listNotas(tenantId, clienteId, 1, 20);
    expect(pagina.data[0]?.texto).toBe('Sobrevive al autor');
    expect(pagina.data[0]?.autor.nombre).toBeNull();
  });
});
