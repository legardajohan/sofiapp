# ADR 0019 — Destinos por rol: grupo de usuarios y resolvedor único

**Estado:** aceptado · **Fecha:** 2026-11-11 · **Contexto:** AUTH-06. Se apoya en ADR 0017 (roles de
empresa) y ADR 0018 (usuario principal, accesos iguales), que siguen vigentes.

## Contexto

Con tres roles y un usuario principal, los destinos de asignación seguían tratando a los usuarios como
una lista plana:

- La transferencia del Asistente IA ofrecía «El primero del equipo» (el primer nombre alfabético de
  **cualquier** rol, a menudo el principal) y «Menor carga» (un administrador sin conversaciones ganaba
  sobre los asesores).
- Los nodos de flujo solo admitían un usuario fijo, y el `handoff` sin usuario dejaba la conversación
  **sin dueño**.
- Los selectores eran listas planas y el reporte por asesor comparaba asesores con administradores.

## Decisión

### 1. Un solo concepto: el grupo de usuarios

`packages/shared/src/destino-usuarios.ts` define `GrupoUsuarios` (`todos` · `rol` con
`excluirPrincipal` · `equipo` de un coordinador con o sin él) y `DestinoAsignacion` (`usuario` |
`grupo` con `criterio`, `soloEnLinea` y `reserva`). Vive en `shared` porque lo consumen el backend, el
frontend y la validación del grafo de flujos, y no pueden divergir.

### 2. Un solo resolvedor

`features/users/user.destino.ts` → `resolverDestinoAsignacion(tenantId, destino)` es lo **único** que
decide quién recibe una conversación: miembros del grupo (`user.grupos.ts`) → solo en línea → criterio
(`primero` por nombre · `menor_carga` con desempate por nombre) → reserva (`cualquiera` · otro grupo ·
`sin_asignar`). Lo llaman la transferencia IA y los nodos `handoff` / `asignar_asesor`. **No lanza** por
configuración vieja (usuario desactivado, coordinador que dejó de serlo): cae en la reserva con `warn`.

- Los miembros se filtran **en memoria** sobre `listTenantUsers` (activos, no eliminados) porque los
  documentos aún no migrados solo tienen `subrol` y la traducción vive en el mapper.
- «En línea» = latido de `ActividadCursor` (HU-REP-06) en los últimos 5 minutos. No hay presencia por
  socket: el latido ya existe y basta.

### 3. Compatibilidad sin migración

`HandoffSettings.destino` es opcional en lectura; `toDTO` lo deriva de `estrategiaDestino` /
`asesorDestinoId`. Los nodos con `asesorId` / `notificarAsesorId` se siguen aceptando y se ejecutan
como un destino `usuario`. Al guardar se escriben **los dos formatos** durante un release (un grupo que
no sea «todos» degrada, si se vuelve atrás, al reparto entre todos con su criterio).

### 4. Validación contra el tenant

- Al guardar la transferencia: `validarDestino` (usuario asignable y coordinadores activos del tenant,
  404 si no).
- Al guardar un flujo: `assertDestinoDelTenant` (los ids existen en el tenant, aunque estén inactivos:
  un usuario desactivado después no puede impedir editar otro nodo).
- En reportes: `?grupo=` se resuelve con `idsDelFiltro` (incluye inactivos; 404 fuera del tenant).

Los esquemas Zod viven en `user.grupos.validation.ts`, sin dependencias de servicios, para no cerrar el
ciclo `flow.validation → user.grupos → user.service → flow.service → flow.validation`.

### 5. Reportes: camino A

Los tres roles siguen viendo los datos de toda la empresa (ADR 0018). Se añaden el filtro por grupo y
el rol/equipo de cada fila; la UI compara por defecto dentro del mismo rol.

## Alternativas descartadas

- **Opciones sueltas** («primero de asesores», «primero de coordinadores»…) como valores de
  `estrategiaDestino`: once valores y sin forma de añadir equipo ni reserva sin otra migración.
- **Alcance de datos por rol en reportes** (camino B): reabría la visibilidad por equipo cancelada.
- **Filtrar por `rolEmpresa` en Mongo:** fallaría con documentos no migrados de AUTH-02.

## Consecuencias

- **+** Una regla de reparto, testeable, que comparten IA, flujos y UI.
- **+** El `handoff` de flujo sin destino ya no deja la conversación sin dueño.
- **−** Dos formatos de destino conviven un release; retirarlos es una spec posterior.
- **−** Round-robin queda para una iteración 2 (`CriterioDestino` admite ampliarse sin migrar).

## Ajuste (2026-11-11)

- **Criterio `mas_ventas`:** más ventas cerradas en los últimos 30 días (`VENTANA_VENTAS_DIAS`), con la
  definición de venta de HU-REP-01 (`ventasPorUsuario` en `reports.service.ts`, compartida con el
  reparto). Empate → por nombre. Al escribir el formato viejo degrada a `menor_carga`.
- **`primero`** sigue siendo válido en el backend, pero la interfaz ya no lo ofrece (solo lo muestra si
  estaba guardado).
- **Grupo de coordinador** = el coordinador y sus asesores (`grupoDeCoordinador`); los equipos guardados
  sin él siguen siendo válidos.
- **Regla de pertenencia compartida:** `perteneceAlGrupo` vive en `packages/shared` y la usan el
  backend y los filtros del navegador (tabla de detalle, «Ver asignación»).
- **Interfaz en dos pasos:** «Quién recibe la conversación» (rol o grupo) y «Dentro del grupo, se elige
  a» (reparto automático o una persona del grupo). En reportes, tres pares independientes de filtros
  «rol + persona» (indicadores, tiempo activo, tabla), cada uno en su clave de URL.
