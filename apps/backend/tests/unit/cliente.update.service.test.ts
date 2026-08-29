import { vi, describe, it, expect } from 'vitest';
import { Types } from 'mongoose';
import { Cliente } from '../../src/features/cliente/cliente.model.js';
import { AuditEvent } from '../../src/features/audit/audit.model.js';

vi.mock('../../src/realtime/realtime.publisher.js', () => ({
  publishRealtime: vi.fn(),
  subscribeRealtime: vi.fn(),
}));
vi.mock('../../src/integrations/meta/meta-whatsapp.client.js', () => ({
  metaWhatsAppClient: { sendText: vi.fn(), sendTemplate: vi.fn() },
}));

const { updateCliente, getContactHistory } = await import(
  '../../src/features/cliente/cliente.service.js'
);
const { updateClienteSchema } = await import('../../src/features/cliente/cliente.validation.js');

/** Atajo para probar el schema del borde, que es donde vive la normalización y el `.strict()`. */
function validarBody(body: unknown): ReturnType<typeof updateClienteSchema.safeParse> {
  return updateClienteSchema.safeParse({
    body,
    params: { id: new Types.ObjectId().toString() },
    query: {},
  });
}

describe('cliente.service — updateCliente (HU-CRM-02)', () => {
  const tenantId = new Types.ObjectId();
  const actorId = new Types.ObjectId().toString();
  let seq = 0;

  async function seedCliente(over: Record<string, unknown> = {}): Promise<string> {
    const cliente = await Cliente.create({
      tenantId,
      metaUserId: `wa_upd_${seq++}`,
      telefono: '573001112233',
      canalOrigen: 'whatsapp',
      estadoComercial: 'nuevo',
      customFields: {},
      atributos: [],
      tagIds: [],
      ...over,
    });
    return (cliente._id as Types.ObjectId).toString();
  }

  // ─── Campos no sensibles ──────────────────────────────────────────────────────

  it('edita el teléfono y lo persiste', async () => {
    const id = await seedCliente({ telefono: '573001112233' });
    const res = await updateCliente(tenantId, actorId, id, { telefono: '573009998877' }, true);

    expect(res.telefono).toBe('573009998877');

    const guardado = await Cliente.findById(id).lean();
    expect(guardado?.telefono).toBe('573009998877');
  });

  it('el cambio de teléfono queda en la bitácora con su valor real', async () => {
    const id = await seedCliente({ telefono: '573001112233' });
    await updateCliente(tenantId, actorId, id, { telefono: '573009998877' }, true);

    const evento = await AuditEvent.findOne({ entidadId: id, accion: 'cliente.update' })
      .sort({ createdAt: -1 })
      .lean();

    // No es un dato sensible: va en claro, a diferencia de correo/documento.
    expect(evento?.antes?.['telefono']).toBe('573001112233');
    expect(evento?.despues?.['telefono']).toBe('573009998877');
  });

  it('edita los campos no sensibles y los persiste', async () => {
    const id = await seedCliente();
    const res = await updateCliente(
      tenantId,
      actorId,
      id,
      { nombre: 'Ana Gómez', nivelInteres: 'caliente' },
      true,
    );

    expect(res.nombre).toBe('Ana Gómez');
    expect(res.nivelInteres).toBe('caliente');

    const doc = await Cliente.findById(id).lean();
    expect(doc?.nombre).toBe('Ana Gómez');
    expect(doc?.nivelInteres).toBe('caliente');
  });

  it('`null` explícito borra el campo; un campo ausente no se toca', async () => {
    const id = await seedCliente({ nombre: 'Ana', nivelInteres: 'tibio' });

    const res = await updateCliente(tenantId, actorId, id, { nombre: null }, true);

    expect(res.nombre).toBeNull();
    // `nivelInteres` no viajaba en el parche: sigue como estaba.
    expect(res.nivelInteres).toBe('tibio');
    const doc = await Cliente.findById(id).lean();
    expect(doc?.nombre).toBeUndefined();
    expect(doc?.nivelInteres).toBe('tibio');
  });

  // ─── Persistencia de los sensibles (en claro: el cifrado está desactivado) ────

  it('correo y documento se guardan EN CLARO y se devuelven a un autorizado', async () => {
    const id = await seedCliente();
    const res = await updateCliente(
      tenantId,
      actorId,
      id,
      { correo: 'diego@empresa.com', documento: '1085271234' },
      true,
    );

    expect(res.correo).toBe('diego@empresa.com');
    expect(res.documento).toBe('1085271234');

    // Sin cifrado en reposo: lo persistido es exactamente lo que envió el asesor, legible.
    const doc = await Cliente.findById(id).lean();
    expect(doc?.correoEnc).toBe('diego@empresa.com');
    expect(doc?.documentoEnc).toBe('1085271234');
  });

  it('los atributos se guardan en claro, sensibles o no', async () => {
    const id = await seedCliente();
    await updateCliente(
      tenantId,
      actorId,
      id,
      {
        atributos: [
          { key: 'colegio', label: 'Colegio', valor: 'San José', sensible: false },
          { key: 'eps', label: 'EPS', valor: 'Sura-99887', sensible: true },
        ],
      },
      true,
    );

    const doc = await Cliente.findById(id).lean();
    const [publico, privado] = doc!.atributos;
    expect(publico?.valor).toBe('San José');
    expect(privado?.valor).toBe('Sura-99887');
    // Lo que distingue al sensible no es cómo se guarda, sino quién puede leerlo.
    expect(privado?.sensible).toBe(true);
  });

  it('un valor heredado cifrado y sin clave para leerlo NO tumba la ficha', async () => {
    // Escenario real de una base donde sí se llegó a escribir cifrado: `DATA_ENC_KEY` ya no existe
    // (ver `vitest.config.ts`). El dato sale ilegible, pero la ficha responde en vez de dar 500.
    const heredado = 'enc:v1:ZmFrZS1jaXBoZXJ0ZXh0';
    const id = await seedCliente({ correoEnc: heredado });

    const { contacto } = await getContactHistory(
      tenantId.toString(),
      id,
      { page: 1, limit: 10 },
      true,
    );

    expect(contacto.correo).toBe(heredado);
  });

  // ─── Gate por subrol ──────────────────────────────────────────────────────────

  it('sin permiso, enviar `correo` da 403 y NO escribe nada del body', async () => {
    const id = await seedCliente({ nombre: 'Original' });

    await expect(
      updateCliente(tenantId, actorId, id, { nombre: 'Nuevo', correo: 'a@b.com' }, false),
    ).rejects.toMatchObject({ statusCode: 403 });

    // Todo-o-nada: ni siquiera se aplicó el campo permitido.
    const doc = await Cliente.findById(id).lean();
    expect(doc?.nombre).toBe('Original');
    expect(doc?.correoEnc).toBeUndefined();
  });

  it('sin permiso, editar solo campos no sensibles SÍ funciona', async () => {
    const id = await seedCliente();
    const res = await updateCliente(tenantId, actorId, id, { nombre: 'Permitido' }, false);
    expect(res.nombre).toBe('Permitido');
  });

  it('sin permiso, reemplazar los atributos cuando ya hay uno sensible da 403', async () => {
    // `atributos` viaja completo, así que sustituir la lista es también borrar el dato protegido.
    const id = await seedCliente();
    await updateCliente(
      tenantId,
      actorId,
      id,
      { atributos: [{ key: 'eps', label: 'EPS', valor: 'Sura', sensible: true }] },
      true,
    );

    await expect(
      updateCliente(tenantId, actorId, id, { atributos: [] }, false),
    ).rejects.toMatchObject({ statusCode: 403 });

    const doc = await Cliente.findById(id).lean();
    expect(doc?.atributos).toHaveLength(1);
  });

  // ─── Enmascarado en lectura ───────────────────────────────────────────────────

  it('sin permiso, la lectura devuelve los sensibles enmascarados', async () => {
    const id = await seedCliente();
    await updateCliente(
      tenantId,
      actorId,
      id,
      {
        correo: 'diego@empresa.com',
        documento: '1085271234',
        atributos: [{ key: 'eps', label: 'EPS', valor: 'Sura-99887', sensible: true }],
      },
      true,
    );

    const { contacto } = await getContactHistory(
      tenantId.toString(),
      id,
      { page: 1, limit: 10 },
      false,
    );

    expect(contacto.puedeVerSensibles).toBe(false);
    expect(contacto.correo).toBe('d••••@empresa.com');
    expect(contacto.documento).toBe('••••1234');
    expect(contacto.atributos[0]?.valor).toBe('••••••');
    expect(contacto.atributos[0]?.oculto).toBe(true);
    // El label sigue visible: la diferencia entre "no hay dato" y "no puedes verlo" debe notarse.
    expect(contacto.atributos[0]?.label).toBe('EPS');
  });

  it('con permiso, la lectura devuelve los sensibles en claro', async () => {
    const id = await seedCliente();
    await updateCliente(tenantId, actorId, id, { correo: 'diego@empresa.com' }, true);

    const { contacto } = await getContactHistory(
      tenantId.toString(),
      id,
      { page: 1, limit: 10 },
      true,
    );

    expect(contacto.puedeVerSensibles).toBe(true);
    expect(contacto.correo).toBe('diego@empresa.com');
  });

  // ─── Auditoría ────────────────────────────────────────────────────────────────

  it('el AuditEvent NO contiene el valor de los campos sensibles', async () => {
    const id = await seedCliente();
    await updateCliente(
      tenantId,
      actorId,
      id,
      {
        nombre: 'Ana',
        correo: 'diego@empresa.com',
        documento: '1085271234',
        atributos: [{ key: 'eps', label: 'EPS', valor: 'Sura-99887', sensible: true }],
      },
      true,
    );

    const evento = await AuditEvent.findOne({ entidadId: id, accion: 'cliente.update' }).lean();
    expect(evento).not.toBeNull();

    const crudo = JSON.stringify(evento);
    expect(crudo).not.toContain('diego@empresa.com');
    expect(crudo).not.toContain('1085271234');
    expect(crudo).not.toContain('Sura-99887');
    // Sí queda constancia de QUÉ cambió, y el valor no sensible se guarda tal cual.
    expect(crudo).toContain('[oculto]');
    expect((evento?.despues as Record<string, unknown>)['nombre']).toBe('Ana');
  });

  it('un contacto de otro tenant es un 404, no un 403', async () => {
    const id = await seedCliente();
    await expect(
      updateCliente(new Types.ObjectId(), actorId, id, { nombre: 'X' }, true),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ─── Validación en el borde ─────────────────────────────────────────────────────
// La normalización y el rechazo de campos ajenos viven en el schema, no en el service: por eso se
// prueban aparte y no a través de `updateCliente`.

describe('updateClienteSchema — validación en el borde (HU-CRM-02)', () => {
  it('normaliza el correo a minúsculas y recorta espacios', () => {
    const res = validarBody({ correo: '  Diego@Empresa.com  ' });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.body.correo).toBe('diego@empresa.com');
  });

  it('rechaza los campos con dueño en otro feature', () => {
    // `.strict()`: la clave desconocida falla en el borde en vez de ignorarse en silencio.
    // `telefono` YA NO está en esta lista: pasó a ser editable desde la ficha. Los demás siguen
    // teniendo dueño en otro feature (máquina de estados, HU-OMNI-02/04, identidad de WhatsApp).
    for (const ajeno of [
      { estadoComercial: 'pagado' },
      { tagIds: [] },
      { asesorId: new Types.ObjectId().toString() },
      { tenantId: new Types.ObjectId().toString() },
      { metaUserId: 'wa_x' },
      { customFields: { a: 1 } },
    ]) {
      expect(validarBody({ nombre: 'Ana', ...ajeno }).success).toBe(false);
    }
  });

  it('rechaza un body vacío: un parche que no cambia nada es un error del cliente', () => {
    expect(validarBody({}).success).toBe(false);
  });

  it('rechaza un correo inválido y una clave de atributo con mayúsculas', () => {
    expect(validarBody({ correo: 'no-es-un-correo' }).success).toBe(false);
    expect(
      validarBody({ atributos: [{ key: 'EPS', label: 'EPS', valor: 'Sura' }] }).success,
    ).toBe(false);
  });

  it('`sensible` es opcional y cae a false', () => {
    const res = validarBody({ atributos: [{ key: 'eps', label: 'EPS', valor: 'Sura' }] });
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.body.atributos?.[0]?.sensible).toBe(false);
  });

  // ─── Nombre no vaciable y atributos sin repetir ───────────────────────────────

  it('rechaza vaciar el nombre: se corrige, no se borra', () => {
    expect(validarBody({ nombre: null }).success).toBe(false);
    expect(validarBody({ nombre: '   ' }).success).toBe(false);
    expect(validarBody({ nombre: 'Ana Gómez' }).success).toBe(true);
  });

  // ─── Teléfono editable ────────────────────────────────────────────────────────

  it('acepta el teléfono en el formato del webhook y rechaza el resto', () => {
    expect(validarBody({ telefono: '573001112233' }).success).toBe(true);
    // Ni `+`, ni espacios, ni guiones: dos formatos para el mismo dato harían que el mismo número
    // no se reconociera a sí mismo.
    expect(validarBody({ telefono: '+57 300 111 2233' }).success).toBe(false);
    expect(validarBody({ telefono: '300-111-2233' }).success).toBe(false);
    expect(validarBody({ telefono: '123' }).success).toBe(false);
    expect(validarBody({ telefono: null }).success).toBe(false);
  });


  it('rechaza un atributo sin nombre o sin valor', () => {
    expect(validarBody({ atributos: [{ key: 'eps', label: '  ', valor: 'Sura' }] }).success).toBe(
      false,
    );
    expect(validarBody({ atributos: [{ key: 'eps', label: 'EPS', valor: '  ' }] }).success).toBe(
      false,
    );
  });

  it('rechaza dos atributos con el mismo nombre, aunque difieran en mayúsculas o tildes', () => {
    const repetido = validarBody({
      atributos: [
        { key: 'colegio', label: 'Colegio', valor: 'San José' },
        { key: 'colegio-2', label: 'colegio', valor: 'Otro' },
      ],
    });
    expect(repetido.success).toBe(false);

    const conTilde = validarBody({
      atributos: [
        { key: 'accion', label: 'Acción', valor: 'A' },
        { key: 'accion-2', label: 'accion', valor: 'B' },
      ],
    });
    expect(conTilde.success).toBe(false);
  });

  it('rechaza dos atributos con la misma clave', () => {
    const res = validarBody({
      atributos: [
        { key: 'eps', label: 'EPS', valor: 'Sura' },
        { key: 'eps', label: 'Aseguradora', valor: 'Nueva EPS' },
      ],
    });
    expect(res.success).toBe(false);
  });

  it('admite atributos distintos que solo se parecen', () => {
    const res = validarBody({
      atributos: [
        { key: 'colegio', label: 'Colegio', valor: 'San José' },
        { key: 'colegio-anterior', label: 'Colegio anterior', valor: 'La Salle' },
      ],
    });
    expect(res.success).toBe(true);
  });
});
