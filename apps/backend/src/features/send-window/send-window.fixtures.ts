import type { Types } from 'mongoose';
import { fechaLocal, localAUtc, sumarDias } from '../../utils/zona-horaria.util.js';
import { SendWindowConfig } from './send-window.model.js';
import { limpiarCacheVentana } from './send-window.service.js';
import { CONFIG_DEFECTO, ZONA_HORARIA_DEFECTO, type CategoriaEnvio } from './send-window.types.js';

/*
 * Fixtures de los tests de HU-CONF-01 (solo tests; ningún código de producción importa este
 * archivo). Sin relojes falsos: la política se construye para que HOY esté cerrado y MAÑANA abra a
 * las 00:00, así la siguiente apertura es determinista sea cual sea la hora a la que corra el test.
 */

/** 00:00 de mañana en la zona de la política: la siguiente apertura de `cerrarHoy`. */
export function aperturaManana(ahora: Date = new Date()): Date {
  return localAUtc(sumarDias(fechaLocal(ahora, ZONA_HORARIA_DEFECTO), 1), '00:00', ZONA_HORARIA_DEFECTO);
}

/**
 * Política activa en la que las `categorias` están restringidas a todo el día, todos los días,
 * salvo HOY, que está cerrado por excepción. Las demás categorías quedan como de fábrica.
 */
export async function cerrarHoy(
  tenantId: Types.ObjectId | string,
  categorias: CategoriaEnvio[],
  ahora: Date = new Date(),
): Promise<void> {
  const reglas = CONFIG_DEFECTO.reglas.map((r) =>
    categorias.includes(r.categoria)
      ? { categoria: r.categoria, modo: 'restringido' as const, franjas: [{ dias: [0, 1, 2, 3, 4, 5, 6], desde: '00:00', hasta: '24:00' }] }
      : r,
  );
  await SendWindowConfig.create({
    tenantId,
    activo: true,
    zonaHoraria: ZONA_HORARIA_DEFECTO,
    reglas,
    excepciones: [{ fecha: fechaLocal(ahora, ZONA_HORARIA_DEFECTO), tipo: 'cerrado', categorias }],
    version: 1,
  });
  limpiarCacheVentana();
}

/** Abre la política (la desactiva) e invalida la caché: "ya pasó la noche". */
export async function abrir(tenantId: Types.ObjectId | string): Promise<void> {
  await SendWindowConfig.updateOne({ tenantId }, { $set: { activo: false } });
  limpiarCacheVentana();
}
