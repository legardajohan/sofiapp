import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import type {
  CategoriaPlantilla,
  EstadoPlantilla,
  IPlantillaComponente,
} from '../../features/whatsapp-template/whatsapp-template.types.js';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export interface IMetaTemplateRaw {
  id: string;
  name: string;
  language: string;
  category: CategoriaPlantilla;
  status: EstadoPlantilla;
  components: IPlantillaComponente[];
}

export interface ICreateMetaTemplateDto {
  name: string;
  language: string;
  category: CategoriaPlantilla;
  components: IPlantillaComponente[];
}

export interface IMetaTemplateClient {
  /** Pagina con `paging.next` hasta agotrarla: devuelve TODAS las plantillas de la WABA. */
  list(wabaId: string, accessToken: string): Promise<IMetaTemplateRaw[]>;
  create(
    wabaId: string,
    accessToken: string,
    dto: ICreateMetaTemplateDto,
  ): Promise<{ id: string; status: EstadoPlantilla }>;
}

interface IGraphTemplatesPage {
  data: IMetaTemplateRaw[];
  paging?: { next?: string };
}

async function graphRequest<T>(
  url: string,
  accessToken: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 429 && attempt < MAX_RETRIES) {
    const delay = RETRY_DELAY_MS * Math.pow(2, attempt);
    logger.warn('Meta API rate limited, retrying', { attempt, delay });
    await new Promise((r) => setTimeout(r, delay));
    return graphRequest<T>(url, accessToken, init, attempt + 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new AppError(`Error Graph API (${res.status}): ${text}`, 502);
  }

  return res.json() as Promise<T>;
}

export const metaTemplateClient: IMetaTemplateClient = {
  async list(wabaId, accessToken) {
    const templates: IMetaTemplateRaw[] = [];
    let url: string | undefined =
      `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${wabaId}/message_templates?limit=100`;

    while (url) {
      const page: IGraphTemplatesPage = await graphRequest<IGraphTemplatesPage>(url, accessToken);
      templates.push(...page.data);
      url = page.paging?.next;
    }

    return templates;
  },

  async create(wabaId, accessToken, dto) {
    const url = `https://graph.facebook.com/${env.META_GRAPH_VERSION}/${wabaId}/message_templates`;
    return graphRequest<{ id: string; status: EstadoPlantilla }>(url, accessToken, {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },
};
