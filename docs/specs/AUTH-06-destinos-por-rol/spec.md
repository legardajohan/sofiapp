# AUTH-06 — Destinos por rol (spec)

> **Spec-Driven Development.** Este archivo es el **QUÉ** (objetivo, alcance y criterios de
> aceptación). El **CÓMO** vive en `plan.md` y la ejecución en `tasks.md`. Se construye sobre AUTH-05
> (usuario principal, accesos iguales; ADR 0018) en la rama `feat/AUTH-03`, sin rama propia.

**Estado:** implementado

## Objetivo

Que **quién recibe una conversación** y **cómo se filtran y comparan los usuarios** respeten los roles
de empresa (Administrador —con el principal distinguido—, Coordinador y su equipo, Asesor). Hoy todo
destino trata a los usuarios como una lista plana:

- La transferencia del Asistente IA ofrece "El primero del equipo" (el primer nombre alfabético de
  **cualquier** rol, a menudo el principal) y "Menor carga" (mezcla roles: un administrador sin
  conversaciones gana sobre los asesores).
- Los nodos de flujo `handoff` y `asignar_asesor` solo admiten un usuario fijo, y el `handoff` **sin**
  usuario deja la conversación sin dueño, aunque su comentario diga que "la reparte la configuración
  general" (`flow.runtime.service.ts`).
- Los selectores de bandeja, leads y flujos son listas planas, y el reporte por asesor compara asesores
  con administradores en la misma gráfica.

La pieza central es el **grupo de usuarios**: un único concepto (todos · por rol · equipo de un
coordinador · usuario concreto) que reutilizan la transferencia IA, los nodos de flujo, los selectores
y los reportes, resuelto **siempre** en el backend contra el tenant del token.

Decisiones de negocio (validadas con el usuario el 2026-11-11):

1. **Camino A en reportes.** Los tres roles siguen viendo los datos de **toda** la empresa (ADR 0018
   no cambia). Se añaden el filtro por grupo y la segmentación por rol; el backend valida el grupo.
2. **Todos los roles son elegibles** como receptores: cambia cómo se agrupan y filtran, no quién puede
   responder.
3. **Entran** la reserva configurable (qué pasa si el grupo no tiene a nadie disponible) y el filtro
   "solo en línea". **Round-robin** queda para una segunda iteración (el esquema lo admite sin migrar).
4. **Los nodos de flujo** aceptan usuario fijo **o** grupo, con la misma lógica central que el
   Asistente IA.

## Alcance

**Incluye**

- Tipos compartidos `GrupoUsuarios` / `DestinoAsignacion` en `packages/shared` (backend, frontend y
  validación del grafo de flujos).
- Un helper de grupos (`miembrosDelGrupo`, `validarDestino`) y **un único resolvedor** de destino
  (`resolverDestinoAsignacion`) en `features/users/`.
- Transferencia IA: campo `destino` en `HandoffSettings`, con traducción de las configuraciones
  guardadas (`primero` / `menor_carga` / `fijo`) sin migración.
- Nodos de flujo `handoff` y `asignar_asesor` con `destino` (compatibles con `asesorId` /
  `notificarAsesorId`); el `handoff` sin destino usa el destino general.
- "Ver asignación" (`/ai/handoff/asesores/metricas`) con rol, equipo, principal y "en línea".
- Reportes `by-advisor` y `advisor-activity` con `?grupo=` y rol/equipo en cada fila; segmentación por
  rol en la UI.
- Selectores agrupados por rol (principal marcado) en transferencia, nodos, asignación de la bandeja y
  filtros de bandeja y leads; la lista de usuarios se refresca al abrir un formulario o menú.
- ADR 0019 y actualización de `domain.md`, `data-model.md`, `api-contract.md`.

**Fuera de alcance**

- Round-robin (criterio `round_robin` reservado para la iteración 2).
- Tope de conversaciones por usuario ("carga máxima").
- Alcance de datos por rol en reportes (camino B; ADR 0018 sigue vigente).
- Presencia en tiempo real por socket: "en línea" se deriva del latido de actividad (HU-REP-06).
- Reasignar conversaciones ya asignadas cuando alguien cambia de rol.

## Criterios de aceptación

1. **Tipos compartidos.** `packages/shared` exporta:
   - `GrupoUsuarios`: `{ tipo: 'todos' }` · `{ tipo: 'rol'; rol; excluirPrincipal? }` ·
     `{ tipo: 'equipo'; coordinadorId; incluirCoordinador? }`.
   - `DestinoAsignacion`: `{ modo: 'usuario'; usuarioId; reserva }` ·
     `{ modo: 'grupo'; grupo; criterio: 'primero' | 'menor_carga'; soloEnLinea; reserva }`.
   - `ReservaDestino`: `cualquiera` (por defecto) · `{ tipo: 'grupo'; grupo }` · `sin_asignar`.
   - `etiquetaGrupo(grupo, nombres?)` y `destinoCompleto(destino)` (puras).
2. **Miembros de un grupo.** Solo usuarios `rol: 'admin'`, activos y no eliminados del tenant del token,
   ordenados por nombre.
   - `rol` filtra por `rolEmpresa`; `excluirPrincipal` quita al principal (solo con `administrador`).
   - `equipo` toma los asesores con `coordinadorId = X` y, con `incluirCoordinador`, al propio X.
   - Si X no existe, está inactivo o eliminado, ya no es coordinador o es de otra empresa, el grupo
     resulta **vacío al ejecutar** y es **404 al guardar o filtrar**.
3. **Criterios.** `primero` elige el primero por nombre; `menor_carga`, el de menos conversaciones
   activas (`ESTADOS_ACTIVOS`), con desempate por nombre. Un grupo de un solo miembro siempre lo elige.
4. **Solo en línea.** Con `soloEnLinea`, se consideran solo los miembros con último latido de hace
   ≤ 5 min (`EN_LINEA_MS`). Si no queda ninguno, se aplica la reserva.
5. **Reserva.** Si el grupo (tras el filtro de en línea) queda vacío, o el usuario fijo ya no es
   asignable, se aplica la reserva: `grupo` → sus miembros (sin el filtro de en línea) y, si tampoco
   hay, `cualquiera`; `cualquiera` → el activo de menor carga de la empresa; `sin_asignar` → la
   conversación queda sin dueño. Cada uso de reserva deja un `logger.warn` con el motivo.
6. **Transferencia IA.**
   - `GET /api/ai/handoff` devuelve `destino`. Los documentos sin `destino` lo derivan de
     `estrategiaDestino`/`asesorDestinoId`: `primero` → `{ grupo: todos, criterio: primero }`,
     `menor_carga` → `{ grupo: todos, criterio: menor_carga }`, `fijo` → `{ modo: usuario }`; reserva
     `cualquiera` y `soloEnLinea: false`. Una empresa que no guarda nada se comporta igual que hoy.
   - `PUT` acepta `destino`. El usuario fijo y el coordinador de un grupo (incluido el de la reserva)
     se validan contra el tenant: 404 si no son válidos, sin escribir nada.
   - El PUT sigue aceptando el formato viejo (`estrategiaDestino` + `asesorDestinoId`) durante un
     release, y al guardar se escriben ambos formatos.
7. **Nodos de flujo.**
   - El efecto `asignar_asesor` y el nodo `handoff` aceptan `destino`. Los guardados con `asesorId` /
     `notificarAsesorId` siguen validando y se ejecutan como un destino `usuario`.
   - `handoff` sin destino usa el destino de la configuración de transferencia del tenant (hoy queda
     sin dueño).
   - Si el destino se resuelve vacío y la reserva es `sin_asignar`, se mantiene el comportamiento
     actual (sin dueño) y se registra el aviso.
   - `flow-graph.ts` marca como incompleto un destino `usuario` sin `usuarioId` o un grupo `equipo`
     sin `coordinadorId`.
   - Al publicar un flujo, los ids de usuario y coordinador de sus destinos se validan contra el
     tenant (404).
8. **"Ver asignación".** `GET /api/ai/handoff/asesores/metricas` añade a cada fila `rolEmpresa`,
   `coordinadorId`, `esPrincipal` y `enLinea`. El diálogo agrupa por rol (y los asesores por equipo).
9. **Reportes.**
   - `GET /api/reports/by-advisor` y `GET /api/reports/advisor-activity` aceptan
     `?grupo=` con la sintaxis `rol:<rol>`, `rol:administrador:sin-principal`, `equipo:<id>`,
     `equipo:<id>:con-coordinador` o `usuario:<id>` (Zod), resuelto contra el tenant (404 si apunta
     fuera).
   - `advisor-activity` sigue aceptando `asesorId` (equivale a `usuario:<id>`).
   - Las filas de `by-advisor` y `asesores` de `advisor-activity` añaden `rolEmpresa`, `coordinadorId`
     y `esPrincipal`. Los totales de la empresa y "sin asignar" no cambian sin filtro.
   - La UI ofrece el filtro de grupo y, por defecto, segmenta la gráfica y la tabla por rol (asesores
     con asesores).
   - Los tres roles conservan el acceso (`ROLES_REPORTES`).
10. **Selectores agrupados.** La transferencia, los nodos, la asignación de la bandeja y los filtros de
    bandeja y leads muestran secciones Administradores (principal marcado) · Coordinadores ·
    Asesores; los filtros añaden una sección "Inactivos". La lista de usuarios se vuelve a pedir al
    abrir un formulario o menú, de modo que una sesión abierta ve a los usuarios creados después
    (caso del primer coordinador).
11. **Casos borde** cubiertos por tests: grupo vacío, un solo miembro, usuarios desactivados y
    eliminados excluidos, coordinador que deja de serlo, nadie en línea, cadena de reserva completa y
    un usuario que cambia de rol con conversaciones activas (conserva sus asignaciones; las
    asignaciones futuras lo tratan con su rol nuevo).
12. **Frontend.** Componentes `UserGroupSelect` y `DestinoSelector` con shadcn/ui (`Select`,
    `SelectGroup`, `SelectLabel`, `Switch`, `RadioGroup`), tokens semánticos y prolijos en light y
    dark; copy en lenguaje de usuario ("Asesor con menos conversaciones activas", "Si no hay nadie
    disponible").
13. **Aislamiento y verificación.** Todo id de usuario o coordinador que llega por body, query o
    configuración de un nodo se resuelve por el repositorio scoped con el `tenantId` del token (en el
    worker, el de la conversación). Un grupo o usuario de otro tenant → 404 al guardar o filtrar y
    vacío al ejecutar. Tests de aislamiento del helper, la transferencia, los nodos y los reportes.
    `pnpm --filter @sofiapp/api typecheck` (`tsc --noEmit`), `test`, y
    `pnpm --filter @sofiapp/web build && lint` en verde.

## Ajustes posteriores (2026-11-11, validados con el usuario)

14. **Reportes — tres pares de filtros independientes «rol + persona».** El filtro de rol ofrece Todos /
    Toda la empresa, Administradores, Administradores excepto el principal, Coordinadores, Asesores y un
    «Grupo de [coordinador]» por coordinador; el de persona se habilita al elegir un rol o grupo y lista
    solo a sus miembros; cambiar el rol limpia la persona.
    - «Quiénes» (`grupo`/`persona`) actualiza indicadores y barras.
    - Tiempo activo (`actividadGrupo`/`asesor`) actualiza solo su gráfica.
    - Detalle por persona (`tablaGrupo`/`tablaPersona`) filtra la tabla sobre el reporte de toda la
      empresa; con filtro, los totales son los de las filas visibles y no hay «sin asesor».
15. **Transferencia — dos pasos.** «Quién recibe la conversación»: Todos, los roles (con «excepto el
    principal») y «Grupo de [coordinador]» (él y sus asesores). «Dentro del grupo, se elige a»: «Quien
    tenga menos conversaciones activas», «Quien tenga más ventas cerradas» y las personas activas del
    grupo. Mismo selector en los nodos de flujo. «El primero por orden alfabético» solo se muestra si ya
    estaba guardado.
16. **Criterio `mas_ventas`:** más ventas cerradas en los últimos 30 días, misma definición que el
    reporte de productividad; empate → por nombre; aislado por tenant.
17. **«Ver asignación»** va en la cabecera de «Asignación y aviso» y su panel filtra por rol y persona.

## Dependencias

- AUTH-04 (`rolEmpresa`, `coordinadorId`; ADR 0017) y AUTH-05 (`esPrincipal`, `eliminado`, accesos
  iguales; ADR 0018).
- HU-IA-03 / HU-IA-07 (`HandoffSettings`, `estrategiaDestino`, `metricasPorAsesor`).
- HU-FLOW (nodos `handoff` y `asignar_asesor`, `packages/shared/src/flow-graph.ts`).
- HU-REP-01 y HU-REP-06 (reportes por asesor y tiempo activo; `ActividadCursor.ultimoLatido`).
- `docs/multi-tenancy.md` (repositorio scoped, §8 tests, §9 checklist).
