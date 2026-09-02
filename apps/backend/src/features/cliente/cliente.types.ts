import { Document, Types } from 'mongoose';
import type { IMessageResponse, IPaginated } from '../conversation/conversation.types.js';
import type { ITagResponse, SemaforoSlug } from '../tag/tag.types.js';
import type { HandoffMotivo } from '../ai/ai-handoff.types.js';
import type { NivelInteres, Objecion } from '../../integrations/llm/llm-provider.types.js';

export type CanalOrigen = 'whatsapp' | 'instagram' | 'messenger' | 'formulario' | 'web';

/**
 * Fuente única del pipeline comercial: la usan el enum de Mongoose y el tipo, así que no pueden
 * divergir. `Lead.estado` (HU-CRM-01) la reutiliza en vez de declarar etapas propias.
 */
export const ESTADOS_COMERCIALES = [
  'nuevo',
  'en_gestion',
  'pago_pendiente',
  'pagado',
  'perdido',
] as const;

export type EstadoComercial = (typeof ESTADOS_COMERCIALES)[number];

/**
 * Datos de contacto extraídos por IA desde la conversación, bajo demanda (HU-OMNI-03).
 * Se guardan aparte de `nombre`/`telefono` a propósito: esos campos son la identidad real que
 * llega por WhatsApp y no deben pisarse con una inferencia del modelo. Cada campo es `null`
 * cuando la conversación no lo menciona.
 */
export interface IDatosExtraidos {
  nombreCompleto: string | null;
  correo: string | null;
  /** Nunca es `null`: si la conversación no dicta ninguno, cae al número de WhatsApp del contacto. */
  telefono: string;
  /** De dónde salió `telefono`. Opcional por extracciones guardadas antes de existir este campo. */
  telefonoOrigen?: TelefonoOrigen;
  extraidoAt: Date;
  modelo: string;
}

/** `conversacion` = el cliente lo dictó en un mensaje; `whatsapp` = es el número desde el que escribe. */
export type TelefonoOrigen = 'conversacion' | 'whatsapp';

/**
 * Clave de una opción del catálogo `contact_options` del tenant (HU-CRM-02).
 *
 * Los tres campos que la usan —`nivelInteres`, `objecionPrincipal`, `rolContacto`— eran uniones
 * cerradas heredadas del vertical Pre-ICFES. Dejaron de serlo cuando cada empresa pasó a poder
 * crear, renombrar y archivar sus propias opciones: un tipo literal aquí volvería a clavar en el
 * código una lista que ahora vive en la base de datos. La integridad la aporta
 * `assertOpcionesValidas` en el servicio, no el compilador.
 *
 * Ojo: el `NivelInteres` de `integrations/llm/llm-provider.types.ts` **es otra cosa** y sigue siendo
 * una unión cerrada — es la escala con la que el modelo clasifica, no el catálogo del tenant.
 */
export type OpcionContactoKey = string;

/**
 * Atributo personalizado del contacto (HU-CRM-02). No reutiliza `customFields` —un
 * `Record<string, unknown>` plano— porque este necesita dos cosas que aquel no puede dar sin
 * romper su tipo declarado: el metadato `sensible` por campo y el **orden** en que el asesor los
 * creó. `customFields` queda superado; no se migra porque hoy vale `{}` en todos los documentos.
 */
export interface IAtributoPersonalizado {
  /** Slug estable derivado del label al crearlo; no cambia aunque el label se renombre. */
  key: string;
  label: string;
  /** Valor tal cual se guarda. Con `sensible: true` solo lo devuelve la API a quien puede verlo. */
  valor: string;
  sensible: boolean;
}

/** Resumen por IA de la conversación, persistido en el cliente (HU-OMNI-03). */
export interface IResumenIA {
  texto: string;
  generadoAt: Date;
  /** `ultimoMensajeAt` del cliente al generar el resumen; base para calcular si quedó desactualizado. */
  mensajesHasta: Date;
  modelo: string;
}

/**
 * Última clasificación de intención de compra hecha por la IA (HU-IA-05).
 *
 * Guarda lo que el modelo dijo **aunque no se haya aplicado**: la franja de la bandeja necesita
 * mostrar la sugerencia con su justificación, y el asesor decide. Los valores crudos
 * (`nivelInteres`, `objecion`) viven aquí y NO en `Cliente.nivelInteres`/`objecionPrincipal`, que
 * son claves del catálogo del tenant que edita una persona (ver `OpcionContactoKey`): un worker
 * que corre en cada mensaje no puede revertir lo que un asesor escribió a mano.
 */
export interface ISemaforoIA {
  /** Slug de semáforo que la clasificación sugiere. */
  slug: SemaforoSlug;
  /** Seguridad del modelo, en `[0, 1]`. Bajo `SEMAFORO_MIN_CONFIANZA` no se aplica, solo se propone. */
  confianza: number;
  /** Justificación en una frase. Se muestra en la bandeja y se copia a la bitácora. */
  motivo: string;
  nivelInteres: NivelInteres;
  objecion: Objecion | null;
  at: Date;
  /**
   * Slug que la IA llegó a escribir en `tagIds`. `null` = solo se propuso.
   *
   * Es además el detector de intervención humana: si el semáforo vigente de la conversación no
   * coincide con este, lo cambió una persona, y desde entonces la IA solo propone. Sin este campo
   * habría que consultar `audit_events` en cada mensaje para saberlo.
   */
  aplicado: SemaforoSlug | null;
}

export interface ICliente {
  tenantId: Types.ObjectId;
  metaUserId: string;
  telefono: string;
  nombre?: string;
  canalOrigen: CanalOrigen;
  estadoComercial: EstadoComercial;
  ventana24hExpiraEn?: Date;
  ultimoMensajeAt?: Date;
  noLeidos: number;
  iaHabilitada: boolean;
  asesorId?: Types.ObjectId;
  /**
   * Cuándo y por qué Sofi transfirió la conversación a una persona (HU-IA-03). `null` mientras no
   * haya pasado; vuelven a `null` cuando un asesor reactiva a Sofi en el hilo, porque entonces la
   * bandeja no puede seguir diciendo que está transferida.
   */
  handoffAt: Date | null;
  handoffMotivo: HandoffMotivo | null;
  customFields: Record<string, unknown>;
  /** Etiquetas de empresa aplicadas a la conversación (HU-OMNI-04). */
  tagIds: Types.ObjectId[];
  nivelInteres?: OpcionContactoKey;
  objecionPrincipal?: OpcionContactoKey;
  rolContacto?: OpcionContactoKey;
  interesItemId?: Types.ObjectId;
  resumenIA?: IResumenIA;
  /** Última clasificación de intención de compra (HU-IA-05). */
  semaforoIA?: ISemaforoIA;
  datosExtraidos?: IDatosExtraidos;
  // ─── Datos sensibles (HU-CRM-02) — nunca indexados; gate por subrol al leerlos ───
  /**
   * Correo registrado a mano por el asesor. El sufijo `Enc` es histórico: el cifrado en reposo está
   * desactivado (ver `utils/field-crypto.util`) y el valor se guarda en claro.
   */
  correoEnc?: string;
  /** Documento de identidad. */
  documentoEnc?: string;
  atributos: IAtributoPersonalizado[];
}

export interface IClienteDocument extends ICliente, Document {}

// ─── DTOs de respuesta (HU-OMNI-03) ─────────────────────────────────────────────

/** Estado del resumen para la ficha del contacto. `desactualizado` se deriva de `ultimoMensajeAt`. */
export interface IResumenResponse {
  texto: string;
  generadoAt: string;
  desactualizado: boolean;
}

/** Ficha del contacto (solo lectura) para el panel lateral de la bandeja. */
export interface IContactCardResponse {
  id: string;
  nombre: string | null;
  telefono: string;
  canalOrigen: string;
  estadoComercial: string;
  nivelInteres: string | null;
  objecionPrincipal: string | null;
  rolContacto: string | null;
  /** Etiquetas hidratadas (HU-OMNI-04): la ficha pinta chips con color, no cadenas sueltas. */
  tags: ITagResponse[];
  asesorId: string | null;
  ultimoMensajeAt: string | null;
  createdAt: string;
  /** Lead al que ya se convirtió este contacto, o `null` (HU-CRM-01). */
  leadId: string | null;
  // ─── Datos sensibles (HU-CRM-02) ────────────────────────────────────────────
  /** En claro para los subroles autorizados; enmascarado (`d••••@dominio.com`) para el resto. */
  correo: string | null;
  /** En claro o enmascarado (`••••1234`) con la misma regla. */
  documento: string | null;
  atributos: IAtributoResponse[];
  /**
   * Lo que la UI necesita para saber qué está mirando sin tener que deducirlo del formato del
   * valor. Sin esto no podría distinguir un correo enmascarado de uno que casualmente lo parece.
   */
  puedeVerSensibles: boolean;
}

/** Atributo tal como lo consume la ficha: `oculto` marca los que llegaron enmascarados. */
export interface IAtributoResponse {
  key: string;
  label: string;
  valor: string;
  sensible: boolean;
  oculto: boolean;
}

/**
 * Parche de la ficha (HU-CRM-02). Semántica explícita: un campo **ausente** no se toca; un campo
 * enviado como **`null`** se borra. Sin esa distinción no habría forma de vaciar un dato mal
 * escrito. `atributos` viaja completo (reemplazo, no merge): es una lista corta que la UI edita de
 * golpe, y un merge por `key` obligaría a inventar una semántica de borrado que el array ya tiene.
 */
export interface UpdateClienteDTO {
  /** Sin `null`: el nombre se corrige, no se borra (ver `updateClienteSchema`). */
  nombre?: string;
  /**
   * Sin `null`: es obligatorio en el documento. Ojo — en un contacto de WhatsApp el webhook lo
   * resincroniza desde Meta en cada mensaje entrante (`upsertByMetaUser`), así que editarlo a mano
   * ahí es una corrección temporal. Donde manda de verdad es en los canales sin webhook.
   */
  telefono?: string;
  correo?: string | null;
  documento?: string | null;
  nivelInteres?: OpcionContactoKey | null;
  objecionPrincipal?: OpcionContactoKey | null;
  rolContacto?: OpcionContactoKey | null;
  atributos?: IAtributoPersonalizado[];
}

/** Datos de contacto extraídos por IA, tal como los consume la ficha. */
export interface IDatosExtraidosResponse {
  nombreCompleto: string | null;
  correo: string | null;
  telefono: string;
  telefonoOrigen: TelefonoOrigen;
  extraidoAt: string;
}

/** Historial completo del contacto: ficha + resumen + datos extraídos + mensajes paginados. */
export interface IContactHistoryResponse {
  contacto: IContactCardResponse;
  resumen: IResumenResponse | null;
  datosExtraidos: IDatosExtraidosResponse | null;
  mensajes: IPaginated<IMessageResponse>;
}
