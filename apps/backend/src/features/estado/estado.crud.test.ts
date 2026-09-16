import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { createScoped } from '../../repositories/base.repository.js';
import { AppError } from '../../utils/AppError.js';
import { Lead } from '../lead/lead.model.js';
import { seedEstados } from '../../seed/seed-estados.js';
import { Estado } from './estado.model.js';
import {
  createEstado,
  deleteEstado,
  listEstados,
  reordenarEstados,
  updateEstado,
} from './estado.service.js';
import { KEY_ESTADO_ENTRADA } from './estado.types.js';

const tenant = new Types.ObjectId();
const tenantStr = tenant.toString();

/** Un lead en la etapa indicada. Solo interesa su `estado`: el resto son campos obligatorios. */
async function crearLeadEn(estado: string, telefono: string): Promise<void> {
  const actor = new Types.ObjectId();
  await createScoped(Lead, tenant, {
    nombre: `Lead ${telefono}`,
    telefono,
    clienteId: new Types.ObjectId(),
    estado,
    responsableId: actor,
    origen: {
      tipo: 'conversacion',
      conversacionId: new Types.ObjectId(),
      convertidoPor: actor,
      convertidoAt: new Date(),
    },
  });
}

async function idDe(key: string): Promise<string> {
  const estado = (await listEstados(tenantStr)).find((e) => e.key === key);
  if (!estado) throw new Error(`La etapa ${key} no está sembrada`);
  return estado.id;
}

describe('CRUD del catálogo de etapas', () => {
  beforeEach(async () => {
    await Estado.deleteMany({});
    await Lead.deleteMany({});
    await Estado.syncIndexes();
    await Lead.syncIndexes();
    await seedEstados(tenant);
  });

  describe('updateEstado', () => {
    it('renombra sin tocar la `key`, que es lo que llevan grabado los leads', async () => {
      const id = await idDe('pagado');

      const actualizado = await updateEstado(tenantStr, id, { label: 'Ganado' });

      expect(actualizado.label).toBe('Ganado');
      expect(actualizado.key).toBe('pagado');
    });

    it('recolorea y marca la etapa como de salida', async () => {
      const id = await idDe('pago_pendiente');

      const actualizado = await updateEstado(tenantStr, id, {
        color: '#123456',
        esSalida: true,
      });

      expect(actualizado.color).toBe('#123456');
      expect(actualizado.esSalida).toBe(true);
    });

    it('rechaza un nombre que ya usa otra etapa, aunque cambie de mayúsculas o acentos', async () => {
      const id = await idDe('pagado');

      await expect(updateEstado(tenantStr, id, { label: 'en gestion' })).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('deja renombrarse a sí misma con el mismo nombre: no choca consigo', async () => {
      const id = await idDe('pagado');

      await expect(updateEstado(tenantStr, id, { label: 'Pagado' })).resolves.toMatchObject({
        label: 'Pagado',
      });
    });

    it('archiva una etapa: sale de las activas pero sigue resolviendo su nombre', async () => {
      const id = await idDe('pago_pendiente');

      const archivada = await updateEstado(tenantStr, id, { activo: false });

      expect(archivada.activo).toBe(false);
      expect(archivada.label).toBe('Pago pendiente');
      const activas = (await listEstados(tenantStr)).filter((e) => e.activo).map((e) => e.key);
      expect(activas).not.toContain('pago_pendiente');
    });

    it('NO deja archivar la etapa de entrada: los leads nuevos nacerían fuera del tablero', async () => {
      const id = await idDe(KEY_ESTADO_ENTRADA);

      await expect(updateEstado(tenantStr, id, { activo: false })).rejects.toBeInstanceOf(AppError);
      expect((await listEstados(tenantStr)).find((e) => e.key === KEY_ESTADO_ENTRADA)?.activo).toBe(
        true,
      );
    });

    it('404 si el id no corresponde a ninguna etapa', async () => {
      await expect(
        updateEstado(tenantStr, new Types.ObjectId().toString(), { label: 'X' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('deleteEstado', () => {
    it('borra una etapa que no tiene ningún lead', async () => {
      const nueva = await createEstado(tenantStr, { label: 'Visita agendada' });

      await deleteEstado(tenantStr, nueva.id);

      expect((await listEstados(tenantStr)).map((e) => e.key)).not.toContain('visita-agendada');
    });

    it('rechaza el borrado si hay leads en la etapa y dice cuántos', async () => {
      const nueva = await createEstado(tenantStr, { label: 'Visita agendada' });
      await crearLeadEn('visita-agendada', '573001112233');
      await crearLeadEn('visita-agendada', '573001112234');

      await expect(deleteEstado(tenantStr, nueva.id)).rejects.toMatchObject({
        statusCode: 409,
        details: { motivo: 'en_uso', enUso: 2 },
      });
    });

    it('al rechazar NO la archiva por su cuenta: archivar es otra decisión del administrador', async () => {
      const nueva = await createEstado(tenantStr, { label: 'Visita agendada' });
      await crearLeadEn('visita-agendada', '573001112233');

      await expect(deleteEstado(tenantStr, nueva.id)).rejects.toBeInstanceOf(AppError);

      const sigue = (await listEstados(tenantStr)).find((e) => e.key === 'visita-agendada');
      expect(sigue?.activo).toBe(true);
    });

    it('los leads de OTRA etapa no bloquean el borrado', async () => {
      const nueva = await createEstado(tenantStr, { label: 'Visita agendada' });
      await crearLeadEn('pagado', '573001112233');

      await expect(deleteEstado(tenantStr, nueva.id)).resolves.toBeUndefined();
    });

    it('NO deja borrar la etapa de entrada ni estando vacía', async () => {
      const id = await idDe(KEY_ESTADO_ENTRADA);

      await expect(deleteEstado(tenantStr, id)).rejects.toMatchObject({
        statusCode: 409,
        details: { motivo: 'entrada' },
      });
    });

    it('404 si el id no corresponde a ninguna etapa', async () => {
      await expect(
        deleteEstado(tenantStr, new Types.ObjectId().toString()),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('listEstados con uso', () => {
    it('cuenta los leads de cada etapa y deja en cero las vacías', async () => {
      await crearLeadEn('pagado', '573001112233');
      await crearLeadEn('pagado', '573001112234');
      await crearLeadEn('perdido', '573001112235');

      const porKey = new Map(
        (await listEstados(tenantStr, { conUso: true })).map((e) => [e.key, e.leads]),
      );

      expect(porKey.get('pagado')).toBe(2);
      expect(porKey.get('perdido')).toBe(1);
      expect(porKey.get('en_gestion')).toBe(0);
    });

    it('sin pedirlo no trae la cuenta: ausente no es lo mismo que cero', async () => {
      await crearLeadEn('pagado', '573001112233');

      const estados = await listEstados(tenantStr);

      expect(estados.every((e) => e.leads === undefined)).toBe(true);
    });
  });
  describe('reordenarEstados', () => {
    /** Los ids del catálogo en el orden en que están hoy. */
    async function idsEnOrden(): Promise<string[]> {
      return (await listEstados(tenantStr)).map((e) => e.id);
    }

    it('mueve una etapa al principio y renumera el resto sin empates', async () => {
      const [primero, segundo, tercero, ...resto] = await idsEnOrden();

      const catalogo = await reordenarEstados(tenantStr, [
        tercero as string,
        primero as string,
        segundo as string,
        ...resto,
      ]);

      expect(catalogo.map((e) => e.id).slice(0, 3)).toEqual([tercero, primero, segundo]);
      // 0..n-1 sin huecos ni repetidos: es lo que evita que el siguiente arrastre sea ambiguo.
      expect(catalogo.map((e) => e.orden)).toEqual(catalogo.map((_, i) => i));
    });

    it('el orden nuevo es el que devuelve `listEstados`, que es de donde lo lee el tablero', async () => {
      const ids = await idsEnOrden();
      const alReves = [...ids].reverse();

      await reordenarEstados(tenantStr, alReves);

      expect(await idsEnOrden()).toEqual(alReves);
    });

    it('una etapa recién creada se puede colocar en mitad del embudo', async () => {
      const visita = await createEstado(tenantStr, { label: 'Visita agendada' });
      const ids = await idsEnOrden();
      // Nace al final; el administrador la quiere en segunda posición.
      const sinVisita = ids.filter((id) => id !== visita.id);
      const [primero, ...cola] = sinVisita;

      await reordenarEstados(tenantStr, [primero as string, visita.id, ...cola]);

      expect((await listEstados(tenantStr)).map((e) => e.key)[1]).toBe('visita-agendada');
    });

    it('incluye las archivadas: comparten la escala de orden con las activas', async () => {
      const id = await idDe('pago_pendiente');
      await updateEstado(tenantStr, id, { activo: false });

      const ids = await idsEnOrden();
      await expect(reordenarEstados(tenantStr, [...ids].reverse())).resolves.toHaveLength(
        ids.length,
      );
    });

    it('rechaza un orden incompleto: las que falten se colarían con su posición vieja', async () => {
      const ids = await idsEnOrden();

      await expect(reordenarEstados(tenantStr, ids.slice(1))).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('rechaza un id que no es del catálogo', async () => {
      const ids = await idsEnOrden();

      await expect(
        reordenarEstados(tenantStr, [...ids.slice(1), new Types.ObjectId().toString()]),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('no cambia nada si el orden enviado es el que ya tenía', async () => {
      const ids = await idsEnOrden();

      await reordenarEstados(tenantStr, ids);

      expect(await idsEnOrden()).toEqual(ids);
    });
  });
});
