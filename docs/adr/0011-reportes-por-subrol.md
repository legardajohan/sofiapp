# ADR 0011 — Los reportes de productividad del equipo se restringen por `subrol`

**Estado:** aceptado · **Fecha:** 2026-10-08 · **Contexto:** HU-REP-01 (conversaciones atendidas y
ventas cerradas por asesor)

## Contexto

HU-REP-01 es una historia **del gerente**: ver cuánto atiende y cuánto vende cada asesor de su
empresa. Es información sobre el desempeño de personas concretas, no sobre clientes.

Como en ADR 0006, los dos roles de login (`superadmin` | `admin`) no alcanzan: todos los usuarios de
un tenant son `admin`, así que `authorize(['admin'])` dejaría a cualquier asesor ver el ranking de
sus compañeros. La única dimensión para distinguir al gerente es el `subrol`, que AUTH-02 (criterio 4)
declaró sin efecto en permisos y que ADR 0006 abrió como excepción **solo** para los datos sensibles
del contacto.

## Decisión

**El `subrol` también gobierna el acceso a los reportes de productividad del equipo.** Es la segunda
excepción al criterio 4 de AUTH-02; todo lo demás sigue igual.

1. `SUBROLES_REPORTES = ['director', 'manager']` en `middlewares/authorize-subrol.middleware.ts`,
   aplicado con el `authorizeSubrol` ya existente en `GET /api/reports/by-advisor`, después de
   `authorize(['admin'])`.
2. **Un `admin` sin `subrol` conserva acceso**, por la misma razón que en 0006: hoy nadie tiene
   `subrol` asignado y exigirlo dejaría a todas las empresas sin su reporte.
3. **Lista propia**, aunque hoy coincida con `SUBROLES_DATOS_SENSIBLES`: "puede ver datos personales
   del cliente" y "puede evaluar al equipo" son decisiones distintas; una empresa puede querer que la
   secretaria vea correos de clientes sin ver el ranking de asesores, o al revés.
4. El frontend **oculta** el ítem y redirige la ruta (`puedeVerReportes`), pero el backend decide.

## Alternativas

- **Cualquier `admin`:** respeta AUTH-02 al pie de la letra, pero convierte el reporte del gerente en
  un ranking público dentro de la empresa.
- **Reutilizar `SUBROLES_DATOS_SENSIBLES`:** menos código, pero acopla dos permisos que solo
  coinciden por casualidad.
- **Un rol de login `manager`:** cambio de modelo de autenticación desproporcionado para una vista.

## Consecuencias

- Segundo uso de `authorizeSubrol`. Si aparecen más, conviene un catálogo de permisos por subrol en
  lugar de listas sueltas (deuda anotada).
- Un `coordinator`/`secretary` recibe `403` en el endpoint y no ve la entrada del menú.
- Cuando exista UI para asignar subroles, los `admin` sin subrol seguirán viendo el reporte hasta
  que se les asigne uno.

## Enmienda — HU-REP-02 (2026-10-08)

La tasa de escalamiento IA → asesor (`GET /api/reports/handoff-rate`) es otro reporte del equipo del
gerente y usa **el mismo gate**: `authorizeSubrol(SUBROLES_REPORTES)` tras `authorize(['admin'])`, y
en la UI `RequireReportes` + `puedeVerReportes`. No es una excepción nueva al criterio 4 de AUTH-02:
amplía la misma ("reportes del equipo"), así que no se crea una lista propia.

## Enmienda — HU-REP-03 (2026-10-09)

«Productos más consultados» (`GET /api/reports/top-products`) usa **el mismo gate**. No trae datos
de personas, pero es un reporte de gestión del mismo público; separar su permiso sería una lista
nueva sin un caso que la pida.
