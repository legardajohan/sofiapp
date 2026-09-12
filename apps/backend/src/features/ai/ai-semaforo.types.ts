import type { Types } from 'mongoose';
import type { NivelInteres, Objecion } from '../../integrations/llm/llm-provider.types.js';
import type { ISemaforoIA } from '../cliente/cliente.types.js';
import type { ITagResponse, SemaforoSlug } from '../tag/tag.types.js';

/**
 * Traduce la clasificación del modelo al vocabulario de semaforización del tenant (HU-IA-05).
 *
 * **El nivel manda; la objeción solo desempata donde discrimina.** Encaja literal con la tabla de
 * `docs/domain.md` §5: azul es «consulta general, sin intención comercial aún» —un frío que solo
 * pregunta— y rojo es «bloqueada, a punto de perderse» —ese mismo frío cuando ya planteó una
 * objeción—. En caliente y tibio la objeción NO cambia el color: un cliente que pide comprar sigue
 * avanzando aunque mencione el precio, y pintarlo de naranja escondería la oportunidad detrás de
 * un matiz.
 *
 * Función pura y sin dependencias a propósito: es la regla de negocio de esta historia y se testea
 * sola, sin Mongo ni modelo de por medio.
 *
 * | nivelInteres | sin objeción | con objeción |
 * |---|---|---|
 * | `caliente`   | `verde`      | `verde`      |
 * | `tibio`      | `naranja`    | `naranja`    |
 * | `frio`       | `azul`       | `rojo`       |
 */
export function semaforoDeClasificacion(
  nivelInteres: NivelInteres,
  objecion: Objecion | null,
): SemaforoSlug {
  if (nivelInteres === 'caliente') return 'verde';
  if (nivelInteres === 'tibio') return 'naranja';
  return objecion ? 'rojo' : 'azul';
}

/** La última clasificación, tal como la ve el panel. Espejo de `ISemaforoIA` con fechas en ISO. */
export interface ISemaforoIAResponse {
  slug: SemaforoSlug;
  confianza: number;
  motivo: string;
  nivelInteres: NivelInteres;
  objecion: Objecion | null;
  at: string;
  /** `null` = la IA solo lo propuso; la UI ofrece aplicarlo. */
  aplicado: SemaforoSlug | null;
  /**
   * La etiqueta del tenant para `slug`, hidratada, o `null` si el admin la borró.
   *
   * Viaja resuelta porque una etiqueta **propuesta** todavía no está en `conversation.tags`, así
   * que la UI no tendría de dónde sacar su nombre ni su color. Y tienen que ser los del tenant: el
   * admin pudo renombrar "Avanza" y recolorearla.
   */
  tag: ITagResponse | null;
  /**
   * `true` cuando hay una sugerencia que todavía no está aplicada. Se resuelve en el servidor —no
   * en el navegador comparando `slug` con `aplicado`— porque también depende de que la etiqueta
   * exista todavía en el tenant: una propuesta hacia una etiqueta borrada no se puede aplicar.
   */
  pendiente: boolean;
}

/** Una entrada de la bitácora de clasificaciones (`GET /conversations/:id/classifications`). */
export interface IClasificacionResponse {
  id: string;
  /** `null` = lo hizo el sistema; un id cuando una persona pulsó «Aplicar». */
  actorId: string | null;
  actorNombre: string | null;
  de: SemaforoSlug | null;
  a: SemaforoSlug | null;
  aplicado: boolean;
  confianza: number | null;
  motivo: string | null;
  createdAt: string;
}

/**
 * Etiqueta de semáforo que la conversación lleva puesta, resuelta por slug.
 *
 * Devuelve el primer slug encontrado: el modelo de datos no impide que una conversación tenga dos
 * etiquetas de semáforo a la vez —`PATCH /:id/tags` acepta cualquier conjunto—, pero
 * conceptualmente el semáforo es uno. Si hubiera varias, tomamos una y la escritura posterior
 * limpia el resto, que es justo lo que queremos.
 *
 * Vive en el archivo de tipos, y no en el service, para que `conversation.service` pueda proyectar
 * la sugerencia sin importar el service de semáforo — que a su vez lo importa a él para publicar
 * en tiempo real. Es pura: no toca Mongo.
 */
export function semaforoVigente(
  tagIds: Types.ObjectId[],
  tagsPorSlug: Map<SemaforoSlug, ITagResponse>,
): SemaforoSlug | null {
  const idsPuestos = new Set(tagIds.map((id) => String(id)));
  for (const [slug, tag] of tagsPorSlug) {
    if (idsPuestos.has(tag.id)) return slug;
  }
  return null;
}

/**
 * Proyecta la última clasificación para el panel.
 *
 * `pendiente` se resuelve en el servidor y no en el navegador porque no basta con comparar `slug`
 * con `aplicado`: una sugerencia hacia una etiqueta que el admin borró no se puede aplicar, y
 * ofrecer el botón daría un 409 evitable.
 */
export function toSemaforoIAResponse(
  semaforoIA: ISemaforoIA | undefined,
  tagIds: Types.ObjectId[],
  tagsPorSlug: Map<SemaforoSlug, ITagResponse>,
): ISemaforoIAResponse | null {
  if (!semaforoIA) return null;
  const vigente = semaforoVigente(tagIds, tagsPorSlug);
  return {
    slug: semaforoIA.slug,
    confianza: semaforoIA.confianza,
    motivo: semaforoIA.motivo,
    nivelInteres: semaforoIA.nivelInteres,
    objecion: semaforoIA.objecion,
    at: new Date(semaforoIA.at).toISOString(),
    aplicado: semaforoIA.aplicado,
    tag: tagsPorSlug.get(semaforoIA.slug) ?? null,
    pendiente: vigente !== semaforoIA.slug && tagsPorSlug.has(semaforoIA.slug),
  };
}
