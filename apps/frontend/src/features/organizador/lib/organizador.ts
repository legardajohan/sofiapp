import type { PendienteDTO } from '@/features/pipeline/types';
import { aDiaCivil } from '@/lib/agenda';
import type {
  EstadoOrganizador,
  OrganizadorPendienteDTO,
  PendienteGestionable,
  TipoEventoPendiente,
} from '../types.js';

export const ETIQUETA_ESTADO: Record<EstadoOrganizador, string> = {
  pendiente: 'Pendiente',
  vencido: 'Vencido',
  pospuesto: 'Pospuesto',
  cerrado: 'Cerrado',
};

export const ETIQUETA_EVENTO: Record<TipoEventoPendiente, string> = {
  programado: 'Programado',
  reprogramado: 'Reprogramado desde la nota',
  vencido: 'Aviso enviado',
  pospuesto: 'Pospuesto',
  cerrado: 'Cerrado',
  reabierto: 'Reabierto',
};

/** Nombre a mostrar de un contacto: su nombre o, si no lo dio, su teléfono. */
export function nombreCliente(c: { nombre: string | null; telefono: string } | null): string {
  if (!c) return 'Contacto eliminado';
  return c.nombre || c.telefono || 'Sin nombre';
}

export function desdeOrganizador(p: OrganizadorPendienteDTO): PendienteGestionable {
  return {
    id: p.id,
    clienteId: p.clienteId,
    clienteNombre: nombreCliente(p.cliente),
    descripcion: p.descripcion,
    programadoDia: p.programadoDia,
    programadoHora: p.programadoHora,
    version: p.version,
  };
}

export function desdeEmbudo(p: PendienteDTO): PendienteGestionable {
  return {
    id: p.id,
    clienteId: p.clienteId,
    clienteNombre: p.lead.nombre || p.lead.telefono || 'Sin nombre',
    descripcion: p.descripcion,
    programadoDia: p.programadoDia,
    programadoHora: p.programadoHora,
    version: p.recordatorioAt ?? null,
  };
}

/** Enlace a la conversación del cliente, volviendo a donde estaba el usuario. */
export function rutaConversacion(clienteId: string, volverA: string): string {
  return `/inbox?conversacion=${clienteId}&volverA=${encodeURIComponent(volverA)}`;
}

/** Instante de una fecha y hora de reloj local (`YYYY-MM-DD` + `HH:mm`). */
export function instanteLocal(dia: string, hora: string): Date {
  const [y, m, d] = dia.split('-').map(Number) as [number, number, number];
  const [h, min] = hora.split(':').map(Number) as [number, number];
  return new Date(y, m - 1, d, h, min, 0, 0);
}

/** Mañana como día civil local: el valor por defecto al posponer. */
export function manana(ahora: Date = new Date()): string {
  const d = new Date(ahora);
  d.setDate(d.getDate() + 1);
  return aDiaCivil(d);
}

/**
 * Texto del momento de un aviso: «Vence en 8 min» mientras corre la anticipación pedida
 * (HU-PDF-02 A1) y, cuando ya pasó la hora, «Venció hace 5 min».
 */
export function momentoAviso(iso: string | null, ahora: Date = new Date()): string {
  if (iso && new Date(iso).getTime() > ahora.getTime()) {
    const min = Math.max(1, Math.ceil((new Date(iso).getTime() - ahora.getTime()) / 60_000));
    return `Vence en ${min} min`;
  }
  return vencioHace(iso, ahora);
}

/** «Venció hace 5 min», «hace 2 h», «hace 3 d». */
export function vencioHace(iso: string | null, ahora: Date = new Date()): string {
  if (!iso) return 'Vencido';
  const min = Math.max(0, Math.round((ahora.getTime() - new Date(iso).getTime()) / 60_000));
  if (min < 1) return 'Venció ahora';
  if (min < 60) return `Venció hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `Venció hace ${h} h`;
  return `Venció hace ${Math.round(h / 24)} d`;
}
