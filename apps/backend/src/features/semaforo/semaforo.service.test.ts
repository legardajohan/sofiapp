import { describe, it, expect, beforeEach } from 'vitest';
import { Types } from 'mongoose';
import { seedSemaforos, SEMAFOROS_DEFECTO } from '../../seed/seed-semaforos.js';
import { Semaforo } from './semaforo.model.js';
import {
  createSemaforo,
  existeSemaforo,
  findSemaforoByKey,
  listSemaforos,
  mapaSemaforos,
  updateSemaforo,
} from './semaforo.service.js';

const tenant = new Types.ObjectId();

describe('HU-CRM-04 — catálogo de semáforos', () => {
  beforeEach(async () => {
    await Semaforo.deleteMany({});
    await Semaforo.syncIndexes();
    await seedSemaforos(tenant);
  });

  describe('semilla', () => {
    it('siembra los cuatro colores del dominio, en orden y marcados como de fábrica', async () => {
      const catalogo = await listSemaforos(tenant);

      expect(catalogo.map((s) => s.key)).toEqual(['azul', 'naranja', 'verde', 'rojo']);
      // El orden cuenta un recorrido comercial; alfabético lo destruiría.
      expect(catalogo.map((s) => s.label)).toEqual([
        'Frío',
        'Potencial',
        'Venta concretada',
        'Descartado',
      ]);
      expect(catalogo.every((s) => s.esDefecto)).toBe(true);
    });

    it('es idempotente y NO pisa el renombrado del administrador', async () => {
      const [azul] = await listSemaforos(tenant);
      await updateSemaforo(tenant, azul!.id, { label: 'Contacto inicial', color: '#123456' });

      // Volver a sembrar es lo que hace el backfill en cada arranque.
      await seedSemaforos(tenant);

      const catalogo = await listSemaforos(tenant);
      expect(catalogo).toHaveLength(SEMAFOROS_DEFECTO.length);
      expect(catalogo[0]).toMatchObject({ key: 'azul', label: 'Contacto inicial' });
    });
  });

  describe('alta', () => {
    it('deriva una `key` estable del nombre y lo pone al final', async () => {
      const creado = await createSemaforo(tenant, { label: 'Muy Interesado', color: '#0EA5E9' });

      expect(creado).toMatchObject({
        key: 'muy-interesado',
        label: 'Muy Interesado',
        color: '#0EA5E9',
        esDefecto: false,
        activo: true,
      });
      // Al final: uno nuevo no puede colarse en medio del recorrido sin que alguien lo decida.
      expect(creado.orden).toBe(4);
    });

    it('sin color usa el gris neutro: elegirlo no puede ser obligatorio para dar de alta', async () => {
      const creado = await createSemaforo(tenant, { label: 'Pendiente' });

      expect(creado.color).toBe('#475569');
    });

    it('rechaza un nombre repetido ignorando mayúsculas y tildes', async () => {
      await createSemaforo(tenant, { label: 'Tibio' });

      await expect(createSemaforo(tenant, { label: 'TIBIO' })).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('desambigua la clave cuando dos nombres distintos producen el mismo slug', async () => {
      const uno = await createSemaforo(tenant, { label: 'Muy interesado' });
      // Distinto nombre visible, mismo slug: la clave tiene que desempatarse o el índice único
      // rechazaría el alta.
      const dos = await createSemaforo(tenant, { label: 'Muy interesado!' });

      expect(uno.key).toBe('muy-interesado');
      expect(dos.key).toBe('muy-interesado-2');
    });

    it('un nombre sin caracteres alfanuméricos no produce una clave vacía', async () => {
      const creado = await createSemaforo(tenant, { label: '###' });

      expect(creado.key).toBe('semaforo');
    });
  });

  describe('edición', () => {
    it('renombra y recolorea sin tocar la clave, que es lo que el lead lleva grabado', async () => {
      const [azul] = await listSemaforos(tenant);

      const editado = await updateSemaforo(tenant, azul!.id, {
        label: 'Contacto frío',
        color: '#1D4ED8',
      });

      expect(editado).toMatchObject({ key: 'azul', label: 'Contacto frío', color: '#1D4ED8' });
    });

    it('archiva uno propio y lo sigue devolviendo en el catálogo', async () => {
      const propio = await createSemaforo(tenant, { label: 'Tibio' });

      const archivado = await updateSemaforo(tenant, propio.id, { activo: false });

      expect(archivado.activo).toBe(false);
      // Sigue en el catálogo: un lead que lo lleve necesita resolver su etiqueta, y esconderlo
      // dejaría la clave cruda a la vista.
      expect((await listSemaforos(tenant)).map((s) => s.key)).toContain('tibio');
    });

    it('NO deja archivar uno de los cuatro de fábrica', async () => {
      const [azul] = await listSemaforos(tenant);

      await expect(updateSemaforo(tenant, azul!.id, { activo: false })).rejects.toMatchObject({
        statusCode: 409,
      });

      expect((await listSemaforos(tenant))[0]?.activo).toBe(true);
    });

    it('rechaza renombrar a un nombre que ya usa otro', async () => {
      const propio = await createSemaforo(tenant, { label: 'Tibio' });

      await expect(
        updateSemaforo(tenant, propio.id, { label: 'Descartado' }),
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it('renombrarse a sí mismo con el mismo nombre no es un conflicto', async () => {
      const propio = await createSemaforo(tenant, { label: 'Tibio' });

      const editado = await updateSemaforo(tenant, propio.id, {
        label: 'Tibio',
        color: '#CA8A04',
      });

      expect(editado.color).toBe('#CA8A04');
    });

    it('un id inexistente es 404', async () => {
      await expect(
        updateSemaforo(tenant, new Types.ObjectId().toString(), { label: 'X' }),
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('resolución', () => {
    it('`existeSemaforo` distingue el catálogo del tenant de una clave inventada', async () => {
      expect(await existeSemaforo(tenant, 'verde')).toBe(true);
      expect(await existeSemaforo(tenant, 'inventado')).toBe(false);
    });

    it('`findSemaforoByKey` devuelve `null` para un lead sin clasificar', async () => {
      expect(await findSemaforoByKey(tenant, null)).toBeNull();
    });

    it('una clave huérfana se resuelve a sí misma antes que a un hueco', async () => {
      // Un documento escrito antes del feature o migrado a mano puede llevar una clave que ya no
      // está en el catálogo. Devolver `null` escondería que el lead sí está clasificado.
      const resuelto = await findSemaforoByKey(tenant, 'fantasma');

      expect(resuelto).toMatchObject({ key: 'fantasma', label: 'fantasma', activo: false });
    });

    it('`mapaSemaforos` resuelve el catálogo entero en un solo mapa', async () => {
      const mapa = await mapaSemaforos(tenant);

      expect(mapa.get('verde')?.label).toBe('Venta concretada');
      expect(mapa.size).toBe(SEMAFOROS_DEFECTO.length);
    });
  });
});
