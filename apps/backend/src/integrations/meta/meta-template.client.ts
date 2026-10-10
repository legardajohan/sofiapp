import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import type {
  CategoriaPlantilla,
  IPlantillaComponente,
} from '../../features/whatsapp-template/whatsapp-template.types.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
/** Timeout por llamada (HT-WA-04): una Graph API colgada no puede retener la petición del admin. */
const META_TEMPLATE_TIMEOUT_MS = 15_000;

/**
 * Plantilla tal y como la devuelve la Graph API. `status` se tipa como `string`: Meta tiene más
 * estados que los que SofiApp modela (`PENDING_DELETION`, `LIMIT_EXCEEDED`…) y el service los
 * normaliza; tiparlo estrecho solo escondería el caso.
 */
export interface IMetaTemplateRaw {
  id: string;
  name: string;
  language: string;
  category: CategoriaPlantilla;
  status: string;
  components: IPlantillaComponente[];
  /** Solo en plantillas rechazadas (`INVALID_FORMAT`, `PROMOTIONAL`…); `NONE` si no aplica. */
  rejected_reason?: string;
}

export interface ICreateMetaTemplateDto {
  name: string;
  language: string;
  category: CategoriaPlantilla;
  components: IPlantillaComponente[];
}

export interface IMuestraCabecera {
  buffer: Buffer;
  mimeType: string;
}

export interface IMetaTemplateClient {
  /** Pagina con `paging.next` hasta agotarla: devuelve TODAS las plantillas de la WABA. */
  list(wabaId: string, accessToken: string): Promise<IMetaTemplateRaw[]>;
  /** Una plantilla por su id en Meta: estado y motivo de rechazo actuales (HT-WA-04). */
  get(metaTemplateId: string, accessToken: string): Promise<IMetaTemplateRaw>;
  create(
    wabaId: string,
    accessToken: string,
    dto: ICreateMetaTemplateDto,
  ): Promise<{ id: string; status: string }>;
  /**
   * Sube la imagen de muestra de una cabecera con la Resumable Upload API y devuelve el
   * `header_handle` que Meta exige en `example.header_handle` al crear la plantilla (HT-WA-04).
   *
   * Ese handle **no sirve para enviar**: el envío usa un `media id` de `/{PHONE_NUMBER_ID}/media`.
   */
  subirMuestra(accessToken: string, muestra: IMuestraCabecera): Promise<{ headerHandle: string }>;
}

interface IGraphTemplatesPage {
  data: IMetaTemplateRaw[];
  paging?: { next?: string };
}

interface IGraphErrorBody {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
  };
}

type GraphError = NonNullable<IGraphErrorBody['error']>;

function graphUrl(path: string): string {
  return `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${path}`;
}

/** `AbortSignal.timeout` lanza `DOMException('TimeoutError')`, no un error de red normal. */
function isTimeoutError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'TimeoutError';
}

function metaNoDisponible(): AppError {
  return new AppError('Meta no respondió. Inténtalo de nuevo en unos minutos.', 502);
}

async function readGraphError(res: Response): Promise<GraphError | undefined> {
  try {
    const body = (await res.json()) as IGraphErrorBody;
    return body.error;
  } catch {
    return undefined;
  }
}

/**
 * Subcódigos de error de plantillas que Meta documenta o que se han observado en la Graph API.
 * La lista no es exhaustiva: por eso el mapeo también mira el texto del error antes de rendirse.
 */
const SUBCODE_IDIOMA_YA_EXISTE = 2_388_024;
const SUBCODE_IDIOMA_EN_BORRADO = 2_388_023;
const SUBCODE_FORMATO_CABECERA = 2_388_047;

/**
 * Traduce un error de Meta al crear o subir una plantilla a un `AppError` legible (HT-WA-04,
 * criterio 14). El texto crudo de la Graph API va solo al log: no se le muestra al admin.
 */
export function mapearErrorPlantilla(status: number, error: GraphError | undefined): AppError {
  const subcode = error?.error_subcode;
  const texto = `${error?.message ?? ''} ${error?.error_user_title ?? ''} ${error?.error_user_msg ?? ''}`;

  if (
    subcode === SUBCODE_IDIOMA_YA_EXISTE ||
    subcode === SUBCODE_IDIOMA_EN_BORRADO ||
    /already exists|ya existe/i.test(texto)
  ) {
    return new AppError(
      'Ya existe una plantilla con ese nombre e idioma en tu cuenta de WhatsApp. Usa otro nombre.',
      409,
      { reason: 'nombre_duplicado' },
    );
  }

  if (/limit|límite|maximum|máximo/i.test(texto) && /template|plantilla/i.test(texto)) {
    return new AppError(
      'Tu cuenta de WhatsApp alcanzó el máximo de plantillas. Elimina alguna en Meta y vuelve a intentarlo.',
      422,
      { reason: 'limite_plantillas' },
    );
  }

  if (
    subcode === SUBCODE_FORMATO_CABECERA ||
    /header_handle|handle|header|image|imagen|media/i.test(texto)
  ) {
    return new AppError(
      'Meta rechazó la imagen de muestra. Usa un JPG o PNG válido de hasta 5 MB y súbela de nuevo.',
      422,
      { reason: 'imagen_invalida' },
    );
  }

  if (status >= 400 && status < 500 && status !== 429) {
    return new AppError(
      'Meta rechazó la plantilla. Revisa el texto, las variables y la categoría.',
      422,
      { reason: 'plantilla_invalida' },
    );
  }

  return metaNoDisponible();
}

async function graphRequest<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(META_TEMPLATE_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeoutError(err)) {
      logger.warn('Graph API de plantillas no respondió a tiempo', { timeoutMs: META_TEMPLATE_TIMEOUT_MS });
      throw metaNoDisponible();
    }
    throw err;
  }

  if (res.status === 429 && attempt < MAX_RETRIES) {
    const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
    logger.warn('Meta API rate limited, retrying', { attempt, delay });
    await new Promise((r) => setTimeout(r, delay));
    return graphRequest<T>(url, accessToken, init, attempt + 1);
  }

  if (!res.ok) {
    const error = await readGraphError(res);
    logger.warn('Error de la Graph API de plantillas', {
      status: res.status,
      code: error?.code,
      subcode: error?.error_subcode,
      message: error?.message,
    });
    throw mapearErrorPlantilla(res.status, error);
  }

  return res.json() as Promise<T>;
}

/** POST de la Resumable Upload API, que no habla JSON en el cuerpo y autentica con `OAuth`. */
async function postResumable<T>(url: string, init: RequestInit, paso: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(META_TEMPLATE_TIMEOUT_MS) });
  } catch (err) {
    if (isTimeoutError(err)) {
      logger.warn(`Resumable Upload: ${paso} no respondió a tiempo`, {
        timeoutMs: META_TEMPLATE_TIMEOUT_MS,
      });
      throw metaNoDisponible();
    }
    throw err;
  }

  if (!res.ok) {
    const error = await readGraphError(res);
    logger.warn(`Resumable Upload: falló ${paso}`, {
      status: res.status,
      code: error?.code,
      subcode: error?.error_subcode,
      message: error?.message,
    });
    throw mapearErrorPlantilla(res.status, error);
  }

  return res.json() as Promise<T>;
}

export const metaTemplateClient: IMetaTemplateClient = {
  async list(wabaId, accessToken) {
    const templates: IMetaTemplateRaw[] = [];
    let url: string | undefined = graphUrl(`${wabaId}/message_templates?limit=100`);

    while (url) {
      const page: IGraphTemplatesPage = await graphRequest<IGraphTemplatesPage>(url, accessToken);
      templates.push(...page.data);
      url = page.paging?.next;
    }

    return templates;
  },

  async get(metaTemplateId, accessToken) {
    const campos = 'id,name,language,category,status,components,rejected_reason';
    return graphRequest<IMetaTemplateRaw>(
      graphUrl(`${encodeURIComponent(metaTemplateId)}?fields=${campos}`),
      accessToken,
    );
  },

  async create(wabaId, accessToken, dto) {
    return graphRequest<{ id: string; status: string }>(
      graphUrl(`${wabaId}/message_templates`),
      accessToken,
      { method: 'POST', body: JSON.stringify(dto) },
    );
  },

  async subirMuestra(accessToken, muestra) {
    if (!env.META_APP_ID) {
      throw new AppError('La creación de plantillas con imagen no está configurada.', 503);
    }

    // Paso 1: abrir la sesión de subida en la app de SofiApp (modelo Tech Provider: una sola app).
    const query = new URLSearchParams({
      file_length: String(muestra.buffer.length),
      file_type: muestra.mimeType,
      access_token: accessToken,
    });
    const sesion = await postResumable<{ id: string }>(
      graphUrl(`${env.META_APP_ID}/uploads?${query.toString()}`),
      { method: 'POST' },
      'abrir sesión',
    );

    // Paso 2: mandar los bytes desde el offset 0. La respuesta trae el handle en `h`.
    const subida = await postResumable<{ h?: string }>(
      graphUrl(sesion.id),
      {
        method: 'POST',
        headers: { Authorization: `OAuth ${accessToken}`, file_offset: '0' },
        body: new Uint8Array(muestra.buffer),
      },
      'subir bytes',
    );

    if (!subida.h) throw metaNoDisponible();
    return { headerHandle: subida.h };
  },
};
