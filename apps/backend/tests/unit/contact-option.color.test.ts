import { describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { ContactOption } from '../../src/features/contact-option/contact-option.model.js';
import { Tenant } from '../../src/features/tenant/tenant.model.js';

const {
  createContactOption,
  listContactOptionsByTipo,
  updateContactOption,
} = await import('../../src/features/contact-option/contact-option.service.js');

const { updateContactOptionSchema, createContactOptionSchema } = await import(
  '../../src/features/contact-option/contact-option.validation.js'
);

/**
 * Color de las opciones de la ficha (HU-CRM-02). El color es dato del tenant: cada empresa decide
 * que su "Caliente" es rojo, y ese color viaja en la respuesta para que la UI lo pinte.
 */
describe('contact-option — color de la opción', () => {
  let seq = 0;

  /** Un tenant nuevo por test: la siembra ocurre una sola vez por tenant y contaminaría al vecino. */
  async function nuevoTenant(): Promise<Types.ObjectId> {
    const tenant = await Tenant.create({
      nombre: `Empresa color ${seq++}`,
      slug: `empresa-color-${seq}-${new Types.ObjectId().toString()}`,
      contacto: { email: `color${seq}@example.com`, telefono: '3000000000' },
    });
    return tenant._id as Types.ObjectId;
  }

  it('siembra el interés como semáforo: frío azul, tibio ámbar, caliente rojo', async () => {
    const tenantId = await nuevoTenant();
    const opciones = await listContactOptionsByTipo(tenantId, 'interes');

    const porKey = new Map(opciones.map((o) => [o.key, o.color]));
    expect(porKey.get('frio')).toBe('#2563EB');
    expect(porKey.get('tibio')).toBe('#CA8A04');
    expect(porKey.get('caliente')).toBe('#DC2626');
  });

  it('objeción y rol también nacen con color', async () => {
    const tenantId = await nuevoTenant();
    const objeciones = await listContactOptionsByTipo(tenantId, 'objecion');
    const roles = await listContactOptionsByTipo(tenantId, 'rol');

    for (const opcion of [...objeciones, ...roles]) {
      expect(opcion.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('crea una opción con el color elegido', async () => {
    const tenantId = await nuevoTenant();
    const creada = await createContactOption(tenantId, {
      tipo: 'interes',
      label: 'Muy interesado',
      color: '#16A34A',
    });

    expect(creada.color).toBe('#16A34A');
  });

  it('sin color elegido cae al gris de fábrica, no a un color con significado', async () => {
    const tenantId = await nuevoTenant();
    const creada = await createContactOption(tenantId, { tipo: 'objecion', label: 'Garantía' });

    expect(creada.color).toBe('#475569');
  });

  it('recolorea una opción sin tocar su clave ni su nombre', async () => {
    const tenantId = await nuevoTenant();
    const [primera] = await listContactOptionsByTipo(tenantId, 'interes');
    if (!primera) throw new Error('La siembra debería haber creado opciones de interés.');

    const actualizada = await updateContactOption(tenantId, primera.id, { color: '#7C3AED' });

    expect(actualizada.color).toBe('#7C3AED');
    expect(actualizada.key).toBe(primera.key);
    expect(actualizada.label).toBe(primera.label);
  });

  it('una opción sembrada sin color se lee con el color de fábrica en vez de romper', async () => {
    const tenantId = await nuevoTenant();
    await listContactOptionsByTipo(tenantId, 'rol');

    // Simula un documento anterior a que el campo existiera.
    await ContactOption.updateOne(
      { tenantId, tipo: 'rol', key: 'decisor' },
      { $unset: { color: '' } },
    );

    const roles = await listContactOptionsByTipo(tenantId, 'rol');
    expect(roles.find((o) => o.key === 'decisor')?.color).toBe('#475569');
  });

  // ─── Validación en el borde ───────────────────────────────────────────────────

  it('rechaza un color que no sea #RRGGBB', () => {
    const validar = (color: unknown): boolean =>
      updateContactOptionSchema.safeParse({
        body: { color },
        params: { id: new Types.ObjectId().toString() },
        query: {},
      }).success;

    expect(validar('#DC2626')).toBe(true);
    expect(validar('rojo')).toBe(false);
    expect(validar('#DC26')).toBe(false);
    expect(validar('DC2626')).toBe(false);
  });

  it('el color es opcional al crear', () => {
    const res = createContactOptionSchema.safeParse({
      body: { tipo: 'interes', label: 'Muy interesado' },
      params: {},
      query: {},
    });
    expect(res.success).toBe(true);
  });
});
