# ADR 0005 — Dinero con precisión decimal (Decimal128 + decimal.js)

**Estado:** aceptado · **Fecha:** 2026-07-10 · **Contexto:** HU-SAAS-02 v2 (costeo multimoneda y TRM)

## Contexto

El costeo de planes mezcla monedas (COP/USD), una tasa de cambio (TRM) y costos que pueden ser
**inferiores a un centavo de dólar** (p. ej. tokens de IA). Usar `number` (binario de punto
flotante) como fuente de verdad introduce errores de redondeo inaceptables para dinero.

## Decisión

1. **Persistencia:** todo importe monetario y la TRM se guardan en Mongo como
   `Schema.Types.Decimal128` (`plans.fotografiaFinanciera.*`, `exchange_rates.tasaCopPorUsd`,
   `cost_items.unitCostOriginal/fixedCostOriginal`).
2. **Cálculo:** aritmética con **`decimal.js`** en `services/pricing/money.util.ts` (suma,
   multiplicación, conversión USD↔COP, tasa efectiva, redondeo comercial). Nunca `+`/`*` sobre
   `number` para dinero.
3. **Frontera HTTP:** los DTOs serializan Decimal128 a **`string`** (no `number`), para no perder
   precisión en el JSON. El frontend solo **formatea** (no hace aritmética con esos strings).
4. **Validación de entrada (Zod):** importes como **string decimal**
   (`z.string().regex(/^\d+(\.\d+)?$/)`), nunca `z.coerce.number()`.
5. **Redondeo:** los costos individuales **no** se redondean antes de sumar (los sub-centavo se
   acumulan con precisión completa); se redondea **solo** el costo operativo total y los precios,
   con `ROUND_HALF_UP` a 2 decimales.

## Consecuencias

- (+) Sin deriva de punto flotante; los sub-centavo suman correctamente.
- (+) Contrato HTTP estable e inequívoco (strings).
- (−) Hay que convertir Decimal128 ↔ string en los mappers (coste menor y localizado).
- El costeo vive en `services/pricing/` (puro, testeable sin DB/red); la orquestación con la TRM y
  el catálogo se hace en los services de feature.
