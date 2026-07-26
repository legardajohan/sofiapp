import { describe, it, expect } from 'vitest';
import {
  listCostItems,
  createCostItem,
  updateCostItem,
  deleteCostItem,
} from './cost-catalog.service.js';

describe('cost-catalog.service — Fase D', () => {
  it('crea un concepto con moneda y costo unitario, conservando el valor decimal como string', async () => {
    const item = await createCostItem({
      concepto: 'Costo por administrador',
      currency: 'COP',
      unitCostOriginal: '8000.00',
      unit: 'administrador',
    });
    expect(item._id).toBeDefined();
    expect(item.currency).toBe('COP');
    expect(item.unitCostOriginal).toBe('8000.00'); // Decimal128 preserva la escala original
    expect(item.active).toBe(true);
  });

  it('conserva la precisión decimal de un costo USD sub-centavo', async () => {
    const item = await createCostItem({
      concepto: 'Tokens IA',
      currency: 'USD',
      unitCostOriginal: '0.0004',
      unit: 'token',
    });
    expect(item.unitCostOriginal).toBe('0.0004');
  });

  it('filtra por activo y actualiza/elimina', async () => {
    const a = await createCostItem({ concepto: 'A', currency: 'COP', fixedCostOriginal: '100' });
    await createCostItem({ concepto: 'B', currency: 'USD', unitCostOriginal: '1', active: false });

    const activos = await listCostItems({ active: true });
    expect(activos.map((i) => i.concepto)).toContain('A');
    expect(activos.map((i) => i.concepto)).not.toContain('B');

    const upd = await updateCostItem(a._id, { active: false });
    expect(upd.active).toBe(false);

    await deleteCostItem(a._id);
    await expect(deleteCostItem(a._id)).rejects.toMatchObject({ statusCode: 404 });
  });
});
