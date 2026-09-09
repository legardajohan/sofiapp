import { z } from 'zod';
import { ESTADOS_COMERCIALES } from '../cliente/cliente.types.js';
import { OPERADORES, TIPOS_NODO } from './flow.types.js';

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID inválido.');
const empty = z.object({});

const posicion = z.object({ x: z.number(), y: z.number() }).strict();

const variableCondicion = z
  .string()
  .refine((v) => v === 'ultimo_mensaje' || v.startsWith('var:'), {
    message: 'La variable debe ser "ultimo_mensaje" o "var:<nombre>".',
  });

const ramaCondicion = z
  .object({
    operador: z.enum(OPERADORES),
    valor: z.string().min(1, 'La rama necesita un valor.'),
    nodoDestino: z.string().min(1),
  })
  .strict();

const etiquetaIntencion = z
  .object({
    etiqueta: z.string().min(1),
    descripcion: z.string().min(1),
    nodoDestino: z.string().min(1),
  })
  .strict();

const salidaIa = z
  .object({
    etiqueta: z.string().min(1).max(40),
    descripcion: z.string().min(1).max(500),
    nodoDestino: z.string().min(1),
  })
  .strict();

const efectoAccion = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('cambiar_estado'), estado: z.enum(ESTADOS_COMERCIALES) }).strict(),
  z.object({ tipo: z.literal('aplicar_etiquetas'), tagIds: z.array(objectId).min(1) }).strict(),
  z.object({ tipo: z.literal('crear_lead') }).strict(),
  z.object({ tipo: z.literal('asignar_asesor'), asesorId: objectId }).strict(),
]);

/**
 * Unión discriminada por `tipo`, `.strict()` en cada rama: es lo que hace exigible el criterio
 * anti-duplicación de KB (10 del `spec`). `condicion`/`intencion` no tienen ningún campo de texto
 * de respuesta — una clave extra como `respuesta` o `texto` en esas ramas es un 400 de Zod, no un
 * campo ignorado en silencio. `tipo: 'api'` no aparece en ninguna rama: cae fuera de la unión y
 * también termina en 400 (reservado, no implementado en esta spec).
 */
const configNodo = z.discriminatedUnion('tipo', [
  z
    .object({
      tipo: z.literal('mensaje'),
      texto: z.string().min(1).optional(),
      templateId: z.string().min(1).optional(),
      parametros: z.array(z.string()).optional(),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('captura'),
      campo: z.string().min(1),
      descripcion: z.string().min(1),
      tipoDato: z.enum(['texto', 'numero', 'fecha', 'booleano']),
      pregunta: z.string().min(1),
      reintentos: z.number().int().min(0),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('condicion'),
      variable: variableCondicion,
      ramas: z.array(ramaCondicion).min(1, 'La condición necesita al menos una rama.'),
      ramaPorDefecto: z.string().min(1),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('intencion'),
      etiquetas: z.array(etiquetaIntencion).min(1),
      ramaPorDefecto: z.string().min(1),
    })
    .strict(),
  z
    .object({
      tipo: z.literal('kb'),
      pregunta: z.string().min(1),
      kSobrescrito: z.number().int().positive().optional(),
      siNoHayRespuesta: z.string().min(1),
    })
    .strict(),
  z.object({ tipo: z.literal('accion'), efecto: efectoAccion }).strict(),
  z
    .object({
      tipo: z.literal('handoff'),
      motivo: z.string().optional(),
      notificarAsesorId: objectId.optional(),
    })
    .strict(),
  z.object({ tipo: z.literal('espera'), minutos: z.number().int().positive() }).strict(),
  z
    .object({
      tipo: z.literal('ia'),
      objetivo: z.string().min(10).max(2000),
      salidas: z.array(salidaIa).min(1).max(8),
      ramaPorDefecto: z.string().min(1),
      // Tope duro (criterio 4 del spec): no se puede guardar un nodo `ia` capaz de conversar
      // indefinidamente.
      maxTurnos: z.number().int().min(1).max(10),
      usarKb: z.boolean(),
    })
    .strict(),
]);

const nodo = z
  .object({
    id: z.string().min(1),
    tipo: z.enum(TIPOS_NODO),
    posicion,
    config: configNodo,
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

const grafoFlow = z
  .object({
    nombre: z.string().trim().min(1, 'El flujo necesita un nombre.').max(120),
    nodos: z.array(nodo).min(1, 'El flujo necesita al menos un nodo.'),
    aristas: z.array(arista),
    entrada: z.string().min(1),
    estado: z.enum(['borrador', 'publicado']).optional(),
    activo: z.boolean().optional(),
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

    const validarDestino = (id: string, path: (string | number)[]): void => {
      if (!idSet.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Referencia a un nodo inexistente: "${id}".`,
          path,
        });
      }
    };

    data.aristas.forEach((a, i) => {
      validarDestino(a.from, ['aristas', i, 'from']);
      validarDestino(a.to, ['aristas', i, 'to']);
    });

    const destinosConEntrada = new Set(data.aristas.map((a) => a.to));

    data.nodos.forEach((n, i) => {
      if (n.config.tipo === 'condicion') {
        n.config.ramas.forEach((r, j) => {
          validarDestino(r.nodoDestino, ['nodos', i, 'config', 'ramas', j, 'nodoDestino']);
          destinosConEntrada.add(r.nodoDestino);
        });
        validarDestino(n.config.ramaPorDefecto, ['nodos', i, 'config', 'ramaPorDefecto']);
        destinosConEntrada.add(n.config.ramaPorDefecto);
      }
      if (n.config.tipo === 'intencion') {
        n.config.etiquetas.forEach((e, j) => {
          validarDestino(e.nodoDestino, ['nodos', i, 'config', 'etiquetas', j, 'nodoDestino']);
          destinosConEntrada.add(e.nodoDestino);
        });
        validarDestino(n.config.ramaPorDefecto, ['nodos', i, 'config', 'ramaPorDefecto']);
        destinosConEntrada.add(n.config.ramaPorDefecto);
      }
      if (n.config.tipo === 'ia') {
        n.config.salidas.forEach((s, j) => {
          validarDestino(s.nodoDestino, ['nodos', i, 'config', 'salidas', j, 'nodoDestino']);
          destinosConEntrada.add(s.nodoDestino);
        });
        validarDestino(n.config.ramaPorDefecto, ['nodos', i, 'config', 'ramaPorDefecto']);
        destinosConEntrada.add(n.config.ramaPorDefecto);
      }
    });

    // Huérfano: ni entrada del flujo, ni destino de ninguna arista, ni destino declarado por una
    // rama de condicion/intencion.
    data.nodos.forEach((n, i) => {
      if (n.id === data.entrada) return;
      if (!destinosConEntrada.has(n.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Nodo huérfano (sin arista entrante): "${n.id}".`,
          path: ['nodos', i],
        });
      }
    });
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
