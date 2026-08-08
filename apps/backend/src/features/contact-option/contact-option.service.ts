import { Types } from 'mongoose';
import {
  countScoped,
  createScoped,
  findByIdScoped,
  findOneAndDeleteScoped,
  findOneAndUpdateScoped,
  findScoped,
} from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { Cliente } from '../cliente/cliente.model.js';
import { seedContactOptions } from '../../seed/seed-contact-options.js';
import { ContactOption } from './contact-option.model.js';
import {
  CAMPO_CLIENTE_POR_TIPO,
  COLOR_OPCION_DEFECTO,
  NOMBRE_TIPO,
  TIPOS_OPCION_CONTACTO,
  type CreateContactOptionDTO,
  type IContactOption,
  type IContactOptionResponse,
  type IContactOptionsResponse,
  type IDeleteContactOptionResult,
  type TipoOpcionContacto,
  type UpdateContactOptionDTO,
} from './contact-option.types.js';

type TenantId = string | Types.ObjectId;

/** Forma lean de la opción con el `_id` que `IContactOption` no declara. */
interface IContactOptionLean extends IContactOption {
  _id: Types.ObjectId;
}

function toResponse(doc: IContactOptionLean): IContactOptionResponse {
  return {
    id: String(doc._id),
    tipo: doc.tipo,
    key: doc.key,
    label: doc.label,
    // Las opciones sembradas antes de que el color existiera no lo traen. Se resuelve aquí en vez
    // de exigir una migración: la respuesta siempre lleva un color pintable.
    color: doc.color ?? COLOR_OPCION_DEFECTO,
    orden: doc.orden,
    activo: doc.activo,
    esDefecto: doc.esDefecto,
  };
}

/**
 * Clave estable derivada de la etiqueta. Mismo criterio que `slugificar` en el frontend, pero
 * calculada **en el servidor**: es la clave que queda grabada en los contactos y no puede depender
 * de lo que mande el cliente.
 */
function slugDeLabel(label: string): string {
  return (
    label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'opcion'
  );
}

/** Desempate numérico dentro del catálogo, respetando el límite de 40 caracteres del schema. */
function desambiguar(base: string, usadas: Set<string>): string {
  if (!usadas.has(base)) return base;
  const raiz = base.slice(0, 36);
  let n = 2;
  while (usadas.has(`${raiz}-${n}`)) n += 1;
  return `${raiz}-${n}`;
}

/** El índice único `{ tenantId, tipo, key }` es la última defensa contra dos altas simultáneas. */
function esKeyDuplicada(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

// ─── Lectura ────────────────────────────────────────────────────────────────────

/**
 * Catálogo completo de un tipo, **incluidas las archivadas**.
 *
 * Las archivadas viajan a propósito: son la única forma de que la ficha de un contacto que todavía
 * lleva una opción retirada muestre su etiqueta en vez de la clave cruda. La UI las filtra del
 * desplegable por `activo`, pero las usa para resolver el nombre.
 */
export async function listContactOptionsByTipo(
  tenantId: TenantId,
  tipo: TipoOpcionContacto,
): Promise<IContactOptionResponse[]> {
  await seedContactOptions(tenantId);
  const docs = await findScoped(ContactOption, tenantId, { tipo })
    .sort({ orden: 1, label: 1 })
    .lean<IContactOptionLean[]>();
  return docs.map(toResponse);
}

/** Los tres catálogos de una sola consulta: el diálogo de edición pinta los tres desplegables. */
export async function listContactOptions(tenantId: TenantId): Promise<IContactOptionsResponse> {
  await seedContactOptions(tenantId);

  const docs = await findScoped(ContactOption, tenantId, {})
    .sort({ orden: 1, label: 1 })
    .lean<IContactOptionLean[]>();

  const agrupadas = { interes: [], objecion: [], rol: [] } as IContactOptionsResponse;
  for (const doc of docs) {
    // Un `tipo` desconocido solo puede venir de un documento escrito por una versión futura; se
    // ignora en vez de romper la respuesta entera.
    const grupo = agrupadas[doc.tipo];
    if (grupo) grupo.push(toResponse(doc));
  }
  return agrupadas;
}

/**
 * Valida que las claves que trae un parche de contacto existan y estén **activas** en el tenant.
 * Es el punto por el que `Cliente.nivelInteres` y compañía dejaron de estar protegidos por un `enum`
 * de Mongoose: sin esto, cualquier cadena entraría al documento.
 *
 * Rechaza también las archivadas: seguirlas aceptando permitiría volver a asignar a mano lo que el
 * administrador retiró del desplegable.
 */
export async function assertOpcionesValidas(
  tenantId: TenantId,
  valores: Partial<Record<TipoOpcionContacto, string | null | undefined>>,
): Promise<void> {
  const pedidas = TIPOS_OPCION_CONTACTO.flatMap((tipo) => {
    const key = valores[tipo];
    return key === undefined || key === null ? [] : [{ tipo, key }];
  });
  if (pedidas.length === 0) return;

  await seedContactOptions(tenantId);

  // Una sola consulta para los tres campos: `$or` sobre los pares (tipo, key) pedidos.
  const docs = await findScoped(ContactOption, tenantId, {
    $or: pedidas.map(({ tipo, key }) => ({ tipo, key })),
    activo: true,
  }).lean<IContactOptionLean[]>();

  const encontradas = new Set(docs.map((d) => `${d.tipo}:${d.key}`));
  for (const { tipo, key } of pedidas) {
    if (!encontradas.has(`${tipo}:${key}`)) {
      throw new AppError(
        `La opción de ${NOMBRE_TIPO[tipo]} «${key}» no existe en esta empresa o fue archivada.`,
        422,
      );
    }
  }
}

// ─── Escritura ──────────────────────────────────────────────────────────────────

/**
 * Alta de una opción. Si su clave choca con una **archivada**, la reactiva y la renombra en vez de
 * fallar con un 409: para el administrador que borró "Precio" y vuelve a escribirlo, el resultado
 * esperado es tenerlo de vuelta —y además así los contactos que conservaban esa clave recuperan su
 * etiqueta— no un error sobre un documento que ya no ve en pantalla.
 */
export async function createContactOption(
  tenantId: TenantId,
  dto: CreateContactOptionDTO,
): Promise<IContactOptionResponse> {
  await seedContactOptions(tenantId);

  const existentes = await findScoped(ContactOption, tenantId, { tipo: dto.tipo })
    .lean<IContactOptionLean[]>();

  const duplicada = existentes.find(
    (o) => o.activo && o.label.localeCompare(dto.label, 'es', { sensitivity: 'base' }) === 0,
  );
  if (duplicada) {
    throw new AppError(`Ya existe una opción de ${NOMBRE_TIPO[dto.tipo]} con ese nombre.`, 409);
  }

  // Se coloca al final del desplegable: el orden lo decide el administrador, no el alfabeto.
  const orden = existentes.reduce((max, o) => Math.max(max, o.orden), -1) + 1;

  // Reactivación antes que desambiguación: si la clave natural del label pertenece a una archivada,
  // lo que el administrador quiere es esa opción de vuelta, no una `precio-2` que dejaría a los
  // contactos con `precio` guardado apuntando a una etiqueta que sigue oculta.
  const base = slugDeLabel(dto.label);
  const archivada = existentes.find((o) => o.key === base && !o.activo);
  if (archivada) {
    const doc = await findOneAndUpdateScoped(
      ContactOption,
      tenantId,
      { _id: archivada._id },
      // El color de la archivada solo se pisa si el alta trae uno: recuperar "Precio" no debería
      // perder de paso el color que tenía asignado.
      {
        $set: {
          label: dto.label,
          activo: true,
          orden,
          ...(dto.color === undefined ? {} : { color: dto.color }),
        },
      },
      { new: true, runValidators: true },
    ).lean<IContactOptionLean>();
    if (!doc) throw new AppError('Opción no encontrada.', 404);
    return toResponse(doc);
  }

  const key = desambiguar(base, new Set(existentes.map((o) => o.key)));

  try {
    const doc = await createScoped(ContactOption, tenantId, {
      tipo: dto.tipo,
      key,
      label: dto.label,
      color: dto.color ?? COLOR_OPCION_DEFECTO,
      orden,
      activo: true,
      esDefecto: false,
    });
    return toResponse(doc.toObject() as IContactOptionLean);
  } catch (err) {
    if (esKeyDuplicada(err)) {
      throw new AppError(`Ya existe una opción de ${NOMBRE_TIPO[dto.tipo]} con ese nombre.`, 409);
    }
    throw err;
  }
}

/**
 * Renombra, reordena o (des)archiva una opción. La `key` **no** se toca: renombrar "Frío" a "Poco
 * interés" debe conservar el vínculo con los contactos que ya lo tienen puesto, igual que renombrar
 * una etiqueta de semáforo conserva su `semaforo`.
 */
export async function updateContactOption(
  tenantId: TenantId,
  optionId: string,
  dto: UpdateContactOptionDTO,
): Promise<IContactOptionResponse> {
  const actual = await findByIdScoped(ContactOption, tenantId, optionId).lean<IContactOptionLean>();
  if (!actual) throw new AppError('Opción no encontrada.', 404);

  if (dto.label !== undefined) {
    const hermanas = await findScoped(ContactOption, tenantId, {
      tipo: actual.tipo,
      _id: { $ne: actual._id },
      activo: true,
    }).lean<IContactOptionLean[]>();

    const choca = hermanas.some(
      (o) => o.label.localeCompare(dto.label as string, 'es', { sensitivity: 'base' }) === 0,
    );
    if (choca) {
      throw new AppError(`Ya existe una opción de ${NOMBRE_TIPO[actual.tipo]} con ese nombre.`, 409);
    }
  }

  const doc = await findOneAndUpdateScoped(
    ContactOption,
    tenantId,
    { _id: new Types.ObjectId(optionId) },
    { $set: { ...dto } },
    { new: true, runValidators: true },
  ).lean<IContactOptionLean>();
  if (!doc) throw new AppError('Opción no encontrada.', 404);

  return toResponse(doc);
}

/**
 * Borra una opción, o la **archiva** si algún contacto la tiene registrada.
 *
 * La diferencia importa: `Cliente` guarda la `key`, no una referencia. Borrar de verdad una opción
 * en uso dejaría a esas fichas mostrando `precio` en crudo, sin forma de saber que un día se llamó
 * "Precio". Archivada, desaparece del desplegable pero sigue resolviendo su etiqueta. Las que no
 * usa nadie sí se eliminan: dejar rastro de una opción escrita por error solo ensucia el catálogo.
 *
 * El resultado dice cuál de las dos cosas pasó para que la UI lo explique en vez de dejar al asesor
 * preguntándose por qué "eliminar" no eliminó nada.
 */
export async function deleteContactOption(
  tenantId: TenantId,
  optionId: string,
): Promise<IDeleteContactOptionResult> {
  const opcion = await findByIdScoped(ContactOption, tenantId, optionId).lean<IContactOptionLean>();
  if (!opcion) throw new AppError('Opción no encontrada.', 404);

  const campo = CAMPO_CLIENTE_POR_TIPO[opcion.tipo];
  const enUso = await countScoped(Cliente, tenantId, { [campo]: opcion.key });

  if (enUso === 0) {
    await findOneAndDeleteScoped(ContactOption, tenantId, { _id: opcion._id });
    return { eliminada: true, enUso: 0, opcion: null };
  }

  const archivada = await findOneAndUpdateScoped(
    ContactOption,
    tenantId,
    { _id: opcion._id },
    { $set: { activo: false } },
    { new: true },
  ).lean<IContactOptionLean>();
  if (!archivada) throw new AppError('Opción no encontrada.', 404);

  return { eliminada: false, enUso, opcion: toResponse(archivada) };
}
