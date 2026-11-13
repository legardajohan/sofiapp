# AUTH-06 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Se trabaja sobre la rama `feat/AUTH-03` (sin rama propia).

## Implementación — compartido

- [x] `packages/shared/src/destino-usuarios.ts`: tipos, `RESERVA_POR_DEFECTO`, `destinoCompleto`,
      `etiquetaGrupo`, `serializarGrupoQuery` / `parsearGrupoQuery`; export en `index.ts`. (CA-1)
- [x] `packages/shared/src/flow-graph.ts`: `destino?` en `asignar_asesor` y `handoff`; completitud con
      `destinoCompleto` (y `asesorId` legado). (CA-7)

## Implementación — backend

- [x] `features/users/user.service.ts`: exportar `assertCoordinadorValido`.
- [x] `features/users/user.grupos.ts`: Zod (`grupoUsuariosSchema`, `destinoAsignacionSchema`,
      `grupoQuerySchema`), `filtroGrupo`, `miembrosDelGrupo`, `validarDestino`. (CA-2, 13)
- [x] `features/users/user.destino.ts`: `ESTADOS_ACTIVOS`, `cargaPorUsuario`, `idsEnLinea`,
      `EN_LINEA_MS`, `resolverDestinoAsignacion`, `destinoDesdeLegado`. (CA-3, 4, 5)
- [x] `features/ai/ai-handoff.types.ts` · `model.ts` · `validation.ts`: `destino`, formato viejo
      opcional, campos nuevos de `AsesorMetricasDTO`. (CA-6, 8)
- [x] `features/ai/ai-handoff.service.ts`:
  - [x] `toDTO` deriva `destino` con `destinoDesdeLegado`. (CA-6)
  - [x] `updateHandoffSettings`: `validarDestino` antes de escribir; escribe `destino` y los campos
        viejos. (CA-6, 13)
  - [x] `metricasPorAsesor`: `rolEmpresa`, `coordinadorId`, `esPrincipal`, `enLinea`. (CA-8)
  - [x] Retirar `primerAdminActivo` / `asesorConMenorCarga` (o dejarlos como envoltorios) y
        re-exportar `ESTADOS_ACTIVOS`.
- [x] `features/conversation/conversation.service.ts`: `handoffConversation` recibe
      `DestinoAsignacion`; `resolverDestino` → `resolverDestinoAsignacion`. (CA-5, 6)
- [x] `workers/ai-reply.processor.ts`: pasar `settings.destino`. (CA-6)
- [x] `features/flow/flow.types.ts` · `flow.validation.ts`: ramas con `destino` (estricta completa) y
      compatibilidad `asesorId` / `notificarAsesorId`. (CA-7)
- [x] `features/flow/flow.service.ts`: `validarDestino` de los nodos al publicar. (CA-7, 13)
- [x] `features/flow/flow.runtime.service.ts`: `asignar_asesor` y `handoff` con el resolvedor;
      `handoff` sin destino usa el destino general; corregir el comentario. (CA-7)
- [x] `features/reports/reports.types.ts` · `validation.ts` · `service.ts`: `?grupo=`, filtro de
      miembros, 404 fuera del tenant, campos de rol en filas. (CA-9, 13)

## Tests — backend

- [x] `packages/shared`: `parsearGrupoQuery` / `serializarGrupoQuery` ida y vuelta; `destinoCompleto`;
      `flow-graph` con nodos de destino incompletos. (CA-1, 7)
- [x] `user.grupos.test.ts`: cada variante de grupo; excluye inactivos y eliminados; `excluirPrincipal`;
      equipo con y sin coordinador; coordinador inválido → `[]`; `validarDestino` → 404. (CA-2)
- [x] `user.destino.test.ts`:
  - [x] `primero` y `menor_carga` con desempate por nombre; un solo miembro. (CA-3)
  - [x] `soloEnLinea` (latido de 4 min sí, de 6 min no); nadie en línea → reserva. (CA-4)
  - [x] Reserva `cualquiera`, `grupo` (y su caída a `cualquiera`), `sin_asignar`; usuario fijo
        desactivado → reserva. (CA-5)
  - [x] Coordinador que deja de serlo → grupo vacío; usuario que cambia de rol con conversaciones
        activas conserva sus asignaciones y entra en el grupo de su rol nuevo. (CA-11)
  - [x] `destinoDesdeLegado` para `primero`, `menor_carga`, `fijo` y `undefined`. (CA-6)
- [x] `user.destino.isolation.test.ts`: el grupo, la carga y el "en línea" de otro tenant no influyen;
      un coordinador o usuario de otro tenant → vacío / 404. (CA-13)
- [x] `ai-handoff.service.test.ts` / `routes.test.ts`: documento viejo devuelve `destino` traducido; PUT
      con `destino` válido / inválido (404 sin escribir); PUT viejo sigue funcionando; métricas con
      campos nuevos. (CA-6, 8)
- [x] `ai-handoff.isolation.test.ts`: `destino` con usuario o coordinador de otro tenant → 404. (CA-13)
- [x] Tests del handoff de conversación / worker: cada estrategia termina en el usuario esperado. (CA-5, 6)
- [x] Flow: validación de nodos viejos y nuevos; publicar con destino de otro tenant → 404; runtime
      `asignar_asesor` con grupo; `handoff` sin destino usa el general; `sin_asignar` deja sin dueño. (CA-7)
- [x] Reports: `?grupo=` en `by-advisor` y `advisor-activity` (rol, sin principal, equipo, usuario);
      `asesorId` sigue funcionando; grupo de otro tenant → 404; sin `grupo`, totales sin cambios. (CA-9, 13)

## Implementación — frontend

> Antes de cada componente: invocar `frontend-design:frontend-design`; aplicar a mano los criterios de
> `emil-design-eng` e `impeccable` (no instaladas). shadcn/ui, tokens semánticos, light y dark.

- [x] `lib/grupos-usuarios.ts`: `agruparPorRol`. (CA-10)
- [x] `features/users/hooks/useTenantUsers.ts`: opción para refrescar al abrir. (CA-10)
- [x] `components/users/UserGroupSelect.tsx`. (CA-10, 12)
- [x] `components/users/DestinoSelector.tsx`. (CA-6, 7, 12)
- [x] `features/handoff`: `HandoffSettingsForm` con `DestinoSelector`; `AsignacionDialog` agrupado por
      rol y equipo con "en línea"; tipos. (CA-6, 8)
- [x] `features/flows/components/NodeInspector.tsx`: `handoff` y `asignar_asesor` con `DestinoSelector`
      ("Usar la configuración de transferencia" en `handoff`). (CA-7)
- [x] `features/inbox/components/AssignMenu.tsx` · `InboxFilters.tsx` ·
      `features/leads/components/LeadsFilters.tsx`: selectores agrupados; sección "Inactivos" en
      filtros. (CA-10)
- [x] `features/reports`: filtro de grupo (`?grupo=`) en `AdvisorReportPage` y `use-activity-params`;
      segmentación por rol en `AdvisorBarsChart` / `AdvisorTable`; tipos. (CA-9)
- [x] Tests: `HandoffSettingsForm.test`, `NodeInspector.handoff.test`, `InboxFilters.test`,
      `LeadsFilters.test`, `AdvisorReportPage.test` (y los que rompa el cambio de tipos).

## Docs

- [x] `docs/adr/0019-destinos-por-rol.md` + índice en `docs/adr/README.md`.
- [x] `docs/domain.md`: grupo de usuarios, destino de asignación, reserva, "en línea".
- [x] `docs/data-model.md`: `HandoffSettings.destino`, nodos `handoff` / `asignar_asesor`.
- [x] `docs/api-contract.md`: `destino` en `/ai/handoff`, métricas, `?grupo=` en reportes.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde.
- [x] `pnpm --filter @sofiapp/api test` en verde (incluye aislamiento).
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde; vitest del frontend.
- [ ] Arrancar `app.ts` y `worker.ts` sin errores. (Sin MongoDB ni Redis locales en la sesión: pendiente.)
- [ ] Revisión visual light/dark de transferencia, nodos, bandeja, leads y reportes. (Pendiente: requiere la app corriendo.)
- [x] Checklist PR de `docs/multi-tenancy.md` §9.

## Definición de "hecho"

- Todos los criterios de `spec.md` cubiertos y sus casillas marcadas.
- Una empresa que no toca la configuración se comporta exactamente igual que antes.
- `spec.md` con `**Estado:** implementado`.

## Notas de implementación (desvíos del plan)

- Los esquemas Zod de grupo/destino viven en `features/users/user.grupos.validation.ts`, no en
  `user.grupos.ts`: así `flow.validation` y `ai-handoff.validation` los importan sin cerrar el ciclo
  `user.grupos → user.service → flow.service → flow.validation`.
- `primerAdminActivo` y `asesorConMenorCarga` se conservan como envoltorios del resolvedor (los usan
  tests existentes); `resolverDestino` de `conversation.service` delega en él y, si falla, reintenta
  con el destino por defecto.
- `handoffConversation` acepta en su 4.º argumento un `DestinoAsignacion` o el id previo.
- Reserva `cualquiera` = el activo de **menor carga** de la empresa. Antes, un asesor fijo inválido
  caía al primero por nombre: es el único cambio de comportamiento para configuraciones viejas.
- Flujos: al guardar se exige que los ids del destino sean del tenant (`assertDestinoDelTenant`), no
  que estén activos, para no bloquear la edición de otro nodo.
- `countFlowsReferencingUser` (dependencias al desactivar) también mira los ids de los destinos.
- Frontend: `useTenantUsers({ alAbrir })` y `useTenantUsersConInactivos()` en
  `features/users/hooks/useTenantUsers.ts`; `UserSelectItems` y `DestinoSelector` en
  `components/users/`; `describirDestino` y `agruparPorRol` en `lib/grupos-usuarios.ts`; filtro
  `GrupoFilter` + `use-grupo-param.ts` en reportes.
- Skills de diseño: se invocó `frontend-design:frontend-design`; `emil-design-eng` e `impeccable` no
  están instaladas y sus criterios se aplicaron a mano (sentence case, sin etiquetas en mayúsculas,
  secciones con `SelectLabel`, tokens semánticos `muted`/`success`/`destructive`).

## Ajustes (criterios 14–17)

- [x] `packages/shared`: criterio `mas_ventas`, `VENTANA_VENTAS_DIAS`, `grupoDeCoordinador`,
      `perteneceAlGrupo` (la usa también el backend); etiqueta «Grupo de [coordinador]». (CA-16)
- [x] Backend: `ventasPorUsuario` en `reports.service.ts`; `mas_ventas` en el resolvedor; legado
      degrada a `menor_carga`. Tests: ventana de 30 días, empate, sin ventas, aislamiento. (CA-16)
- [x] Frontend: `RolUsuarioFilter` + `useFiltroRolUsuarioParam`; tres pares en Productividad del
      equipo; tabla filtra en el navegador. (CA-14)
- [x] `DestinoSelector` en dos pasos (también en nodos de flujo). (CA-15)
- [x] «Ver asignación» en la cabecera; filtro rol + persona en su panel. (CA-17)
- [x] Tests: `RolUsuarioFilter.test`, `AsignacionDialog.test`, `HandoffSettingsForm.test`,
      `NodeInspector.handoff.test`, `AdvisorReportPage.test`.
