import { z } from 'zod';
import { ESTADOS_COMERCIALES } from '../cliente/cliente.types.js';
import { CAMPOS_FIJOS_CONTACTO } from '../contact-field/contact-field.types.js';
import { OPERADORES, TIPOS_NODO } from './flow.types.js';
import { destinoAsignacionBorradorSchema, destinoAsignacionSchema } from '../users/user.grupos.validation.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

const posicion = z.object({ x: z.number(), y: z.number() }).strict();

const variableCondicion = z
  .string()
  .refine((v) => v === 'ultimo_mensaje' || v.startsWith('var:'), {
    message: 'La variable debe ser "ultimo_mensaje" o "var:<nombre>".',
  });

/**
 * Config de un nodo, en dos versiones (HU-FLOW-05):
 *  - **estricta**: un nodo completo y listo para correr. Es la red de seguridad al activar.
 *  - **guardable**: la misma forma pero tolerando un nodo A MEDIAS (textos y destinos vacíos, listas
 *    sin elementos). Es la que se aplica al guardar: un borrador incompleto se puede guardar, y lo que
 *    le falta lo reporta `analizarGrafo` (`@sofiapp/shared`), que además impide ACTIVARLO.
 * Tipos, enums, topes numéricos y campos no permitidos se exigen igual en las dos: son errores de
 * forma que la interfaz no deja cometer y que no se pueden persistir.
 *
 * Unión discriminada por `tipo`, `.strict()` en cada rama: es lo que hace exigible el criterio
 * anti-duplicación de KB (10 del `spec`). `condicion`/`intencion` no tienen ningún campo de texto
 * de respuesta — una clave extra como `respuesta` o `texto` en esas ramas es un 400 de Zod, no un
 * campo ignorado en silencio. `tipo: 'api'` no aparece en ninguna rama: cae fuera de la unión y
 * también termina en 400 (reservado, no implementado en esta spec).
 */
function construirConfigNodo(estricto: boolean) {
  const minLista = estricto ? 1 : 0;
  /** Texto obligatorio solo en la versión estricta. */
  const texto = estricto ? z.string().min(1) : z.string();
  const asesorId = estricto ? objectId : z.string().regex(/^([0-9a-fA-F]{24})?$/, 'ID inválido.');

  const ramaCondicion = z
    .object({
      operador: z.enum(OPERADORES),
      valor: estricto ? z.string().min(1, 'La rama necesita un valor.') : z.string(),
      nodoDestino: texto,
    })
    .strict();

  const etiquetaIntencion = z
    .object({ etiqueta: texto, descripcion: texto, nodoDestino: texto })
    .strict();

  const salidaIa = z
    .object({
      etiqueta: estricto ? z.string().min(1).max(40) : z.string().max(40),
      descripcion: estricto ? z.string().min(1).max(500) : z.string().max(500),
      nodoDestino: texto,
    })
    .strict();

  // AUTH-06: el destino (usuario o grupo de rol/equipo) de la asignación y del handoff. En borrador
  // admite ids vacíos; la versión estricta, completos.
  const destino = estricto ? destinoAsignacionSchema : destinoAsignacionBorradorSchema;

  const efectoAccion = z
    .discriminatedUnion('tipo', [
      z.object({ tipo: z.literal('cambiar_estado'), estado: z.enum(ESTADOS_COMERCIALES) }).strict(),
      z.object({ tipo: z.literal('aplicar_etiquetas'), tagIds: z.array(objectId).min(minLista) }).strict(),
      z.object({ tipo: z.literal('crear_lead') }).strict(),
      // `asesorId` es el formato previo a AUTH-06; `destino` manda si llegan los dos.
      z.object({ tipo: z.literal('asignar_asesor'), asesorId: asesorId.optional(), destino: destino.optional() }).strict(),
    ])
    .superRefine((efecto, ctx) => {
      if (estricto && efecto.tipo === 'asignar_asesor' && !efecto.destino && !efecto.asesorId) {
        ctx.addIssue({ code: 'custom', path: ['destino'], message: 'Elige a quién se asigna la conversación.' });
      }
    });

  /** HU-FLOW-05. La existencia de la `key` en el catálogo la comprueba el service (necesita `tenantId`). */
  const destinoCaptura = z.discriminatedUnion('tipo', [
    z.object({ tipo: z.literal('variable') }).strict(),
    z.object({ tipo: z.literal('contacto'), campo: z.enum(CAMPOS_FIJOS_CONTACTO) }).strict(),
    z.object({ tipo: z.literal('atributo'), key: texto }).strict(),
  ]);

  return z.discriminatedUnion('tipo', [
    z
      .object({
        tipo: z.literal('mensaje'),
        texto: (estricto ? z.string().min(1) : z.string()).optional(),
        templateId: (estricto ? z.string().min(1) : z.string()).optional(),
        parametros: z.array(z.string()).optional(),
      })
      .strict(),
    z
      .object({
        tipo: z.literal('captura'),
        campo: texto,
        descripcion: texto,
        tipoDato: z.enum(['texto', 'numero', 'fecha', 'booleano']),
        pregunta: texto,
        reintentos: z.number().int().min(0),
        destino: destinoCaptura.optional(),
        saltarSiExiste: z.boolean().optional(),
        sobrescribir: z.boolean().optional(),
      })
      .strict(),
    z
      .object({
        tipo: z.literal('condicion'),
        variable: variableCondicion,
        ramas: z.array(ramaCondicion).min(minLista, 'La condición necesita al menos una rama.'),
        ramaPorDefecto: texto,
      })
      .strict(),
    z
      .object({
        tipo: z.literal('intencion'),
        etiquetas: z.array(etiquetaIntencion).min(minLista),
        ramaPorDefecto: texto,
      })
      .strict(),
    z
      .object({
        tipo: z.literal('kb'),
        pregunta: texto,
        kSobrescrito: z.number().int().positive().optional(),
        siNoHayRespuesta: texto,
      })
      .strict(),
    z.object({ tipo: z.literal('accion'), efecto: efectoAccion }).strict(),
    z
      .object({
        tipo: z.literal('handoff'),
        motivo: z.string().optional(),
        notificarAsesorId: objectId.optional(),
        // AUTH-06. Sin destino ni `notificarAsesorId`, usa el de la configuración de transferencia.
        destino: destino.optional(),
      })
      .strict(),
    z.object({ tipo: z.literal('espera'), minutos: z.number().int().positive() }).strict(),
    z
      .object({
        tipo: z.literal('ia'),
        objetivo: z.string().min(estricto ? 10 : 0).max(2000),
        salidas: z.array(salidaIa).min(minLista).max(8),
        ramaPorDefecto: texto,
        // Tope duro (criterio 4 del spec): no se puede guardar un nodo `ia` capaz de conversar
        // indefinidamente.
        maxTurnos: z.number().int().min(1).max(10),
        usarKb: z.boolean(),
      })
      .strict(),
  ]);
}

/** Red de seguridad al ACTIVAR: la misma exigencia que tenía el guardado antes de HU-FLOW-05. */
export const configNodoEstricto = construirConfigNodo(true);
/** Lo que se acepta al GUARDAR: nodos a medias incluidos. */
const configNodoGuardable = construirConfigNodo(false);

const nodo = z
  .object({
    id: z.string().min(1),
    tipo: z.enum(TIPOS_NODO),
    posicion,
    /** Nombre propio del nodo (HU-FLOW-05): hace legibles los flujos con varios nodos del mismo tipo. */
    nombre: z.string().trim().min(1).max(60).optional(),
    config: configNodoGuardable,
  })
  .strict()
  .refine((n) => n.config.tipo === n.tipo, {
    message: 'El tipo del nodo no coincide con el de su configuración.',
    path: ['config', 'tipo'],
  });

const arista = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    condicion: z.string().optional(),
  })
  .strict();

// ─── Disparador (HU-FLOW-04) ─────────────────────────────────────────────────────

const horaHHmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora debe tener formato HH:mm.');

const zonaIana = z
  .string()
  .max(64)
  .refine(
    (zona) => {
      try {
        new Intl.DateTimeFormat('en-CA', { timeZone: zona });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Zona horaria desconocida. Usa un nombre IANA como America/Bogota.' },
  );

const horarioTrigger = z
  .object({
    dias: z
      .array(z.number().int().min(0).max(6))
      .min(1, 'Elige al menos un día.')
      .refine((dias) => new Set(dias).size === dias.length, { message: 'Hay días repetidos.' }),
    desde: horaHHmm,
    hasta: horaHHmm,
    zonaHoraria: zonaIana,
  })
  .strict()
  // Mismo formato de ancho fijo: la comparación de texto equivale a la de hora.
  .refine((h) => h.desde < h.hasta, { message: 'La hora de inicio debe ser anterior a la de fin.', path: ['hasta'] });

/** Unión discriminada con `.strict()` por rama: un `palabras` en un trigger `horario` es un 400,
 *  no un campo ignorado en silencio que luego confunda al editar. */
const triggerFlow = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('siempre') }).strict(),
  z
    .object({
      tipo: z.literal('palabra_clave'),
      palabras: z
        .array(z.string().trim().min(1, 'Las palabras no pueden estar vacías.').max(60))
        .min(1, 'Agrega al menos una palabra.')
        .max(20),
    })
    .strict(),
  z.object({ tipo: z.literal('primer_mensaje') }).strict(),
  z.object({ tipo: z.literal('horario'), horario: horarioTrigger }).strict(),
]);

const grafoFlow = z
  .object({
    nombre: z.string().trim().min(1, 'El flujo necesita un nombre.').max(120),
    nodos: z.array(nodo).min(1, 'El flujo necesita al menos un nodo.'),
    aristas: z.array(arista),
    entrada: z.string().min(1),
    trigger: triggerFlow.optional(),
    estado: z.enum(['borrador', 'publicado']).optional(),
    activo: z.boolean().optional(),
    /** Solo al editar un flujo ACTIVO con errores: confirma guardarlo desactivado (HU-FLOW-05). */
    confirmarDesactivar: z.boolean().optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    const ids = data.nodos.map((n) => n.id);
    const idSet = new Set(ids);
    if (idSet.size !== ids.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Hay ids de nodo duplicados.', path: ['nodos'] });
    }

    if (!idSet.has(data.entrada)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'El nodo de entrada no existe en el flujo.',
        path: ['entrada'],
      });
    }
    // Los destinos inexistentes o vacíos y los nodos huérfanos ya NO se rechazan aquí: son errores de
    // conexión que `analizarGrafo` reporta como advertencias y que solo bloquean ACTIVAR el flujo.
  });

export const listFlowsSchema = z.object({ body: empty, params: empty, query: empty });

export const createFlowSchema = z.object({ body: grafoFlow, params: empty, query: empty });

export const getFlowSchema = z.object({ body: empty, params: z.object({ id: objectId }), query: empty });

export const updateFlowSchema = z.object({
  body: grafoFlow,
  params: z.object({ id: objectId }),
  query: empty,
});

export type CreateFlowBody = z.infer<typeof createFlowSchema>['body'];
export type UpdateFlowBody = z.infer<typeof updateFlowSchema>['body'];
