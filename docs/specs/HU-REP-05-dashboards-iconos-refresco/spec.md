# HU-REP-05 — Iconos en KPIs, refresco automático y botón "Actualizar" en los dashboards (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`;
> la ejecución en `tasks.md`. Mejora **solo de frontend** y transversal a los cinco dashboards que
> dejaron HU-SAAS-03 y HU-REP-01/02/03/04. No toca backend, endpoints, guardas de rol ni la lógica
> de los reportes.

**Estado:** implementado

## Historia

> Como **usuario de un dashboard** (superadmin o gerente) quiero que las cifras se mantengan al día
> solas, poder forzar una actualización cuando lo necesite y reconocer cada métrica de un vistazo.

## Objetivo

Hoy los dashboards solo se recargan al entrar, al cambiar un filtro o al volver a la pestaña con el
dato "viejo" (más de 1 minuto, `staleTime`). Si la pantalla queda abierta, las cifras se congelan,
y el único botón con `refetch()` es "Reintentar", que solo aparece cuando la carga falla.

Esta HU añade a los cinco dashboards tres cosas:
1. **Un icono de Lucide** en cada celda del KPI strip, con el mismo tratamiento en todos.
2. **Refresco automático cada 5 minutos**, sin parpadeo y en pausa con la pestaña oculta.
3. **Un botón "Actualizar"** con la hora de la última actualización.

Todo se resuelve con dos piezas compartidas, una para la celda KPI y otra para el refresco, en vez
de copiar el código en cada pantalla.

**Definition of Done:** con un dashboard abierto, los datos se vuelven a pedir a los 5 minutos sin
que la pantalla pase a esqueleto. Al pulsar "Actualizar", se piden al instante y el siguiente
refresco automático queda a 5 minutos de ese clic. Las cinco franjas KPI muestran sus iconos con el
mismo tamaño, posición y color.

## Dashboards afectados

| Dashboard | Ruta / página | Perfil | Celdas KPI |
|---|---|---|---|
| Métricas globales | `AdminMetricsPage` | superadmin | Empresas, Usuarios, Conversaciones, Leads, Campañas, **Ventas** |
| Productividad por asesor | `AdvisorReportPage` | admin (director/manager) | Asesores, Conversaciones atendidas, Asignadas activas, **Ventas cerradas** |
| Tasa de escalamiento | `HandoffRatePage` | admin (director/manager) | **Tasa de escalamiento**, Conversaciones con Sofi, Resueltas por Sofi, Transferidas a un asesor |
| Productos más consultados | `TopProductsPage` | admin (director/manager) | Consultas, **Producto más consultado**, Clasificadas, Sin clasificar |
| Horas pico | `PeakHoursPage` | admin (director/manager) | **Hora pico**, Mensajes recibidos, Día de más demanda, Promedio diario |

En **negrita**, la celda con acento (`bg-secondary` + `text-primary`), que ya existe y se conserva.

## Alcance

**Incluye:**
- Un componente compartido de celda KPI con prop `icon`, y su esqueleto. Las cinco franjas pasan a
  usarlo, sin cambiar textos, valores, orden ni la celda con acento.
- El mapa de iconos de la tabla D1.
- La constante y las opciones compartidas de refresco automático (5 min), aplicadas a los cinco
  hooks de datos: `useGlobalMetrics`, `useAdvisorReport`, `useHandoffRate`, `useTopProducts` y
  `usePeakHours`.
- Un hook compartido `useDashboardRefresh` y un componente `RefreshControl` con el botón
  "Actualizar" y la hora de la última actualización, colocados en la cabecera de cada página.
- Tests de frontend: celda KPI, refresco (temporizador y reinicio) y botón en las páginas.

**Fuera de alcance:**
- Cualquier cambio de backend: endpoints, agregaciones, caché, `generadoAt`.
- Tiempo real por socket en los reportes.
- Intervalo configurable por el usuario o por tenant.
- Cambios de permisos o de guardas (`AdminRoutes`, `RequireRole`, `RequireReportes`).
- Cambios en las gráficas y tablas, salvo lo necesario para que no parpadeen (ya no lo hacen; ver D3).
- Otras pantallas con `refetchInterval` propio (campañas, base de conocimiento).

## Decisiones

### D1 — Iconos por celda (sin repetir dentro de un dashboard)
Un mismo concepto lleva el mismo icono en todos los dashboards: conversación → `MessageSquare`,
venta → `DollarSign` y asesor → `Headset`.

| Dashboard | Celda | Icono `lucide-react` |
|---|---|---|
| Métricas globales | Empresas | `Building2` |
| | Usuarios | `Users` |
| | Conversaciones | `MessageSquare` |
| | Leads | `Target` |
| | Campañas | `Megaphone` |
| | Ventas | `DollarSign` |
| Productividad por asesor | Asesores | `Headset` |
| | Conversaciones atendidas | `MessageSquareReply` |
| | Asignadas activas | `UserCheck` |
| | Ventas cerradas | `DollarSign` |
| Tasa de escalamiento | Tasa de escalamiento | `Percent` |
| | Conversaciones con Sofi | `Bot` |
| | Resueltas por Sofi | `CircleCheck` |
| | Transferidas a un asesor | `Headset` |
| Productos más consultados | Consultas | `MessageCircleQuestionMark` |
| | Producto más consultado | `Trophy` |
| | Clasificadas | `Tags` |
| | Sin clasificar | `CircleDashed` |
| Horas pico | Hora pico | `Clock` |
| | Mensajes recibidos | `Inbox` |
| | Día de más demanda | `CalendarDays` |
| | Promedio diario | `Activity` |

Todos los nombres se verificaron en `lucide-react@1.23.0`, la versión instalada.

### D2 — Tratamiento visual uniforme del icono
- **Posición:** en la fila de la etiqueta, alineado a la derecha (`justify-between`), igual en
  todas las celdas.
- **Tamaño:** `size-4` (16 px), un solo tamaño en todos los dashboards.
- **Color:** `text-muted-foreground` en las celdas normales y `text-primary` en la celda con acento,
  el mismo tono que su etiqueta. Solo se usan tokens semánticos, así que light y dark quedan cubiertos.
- **Accesibilidad:** el icono es decorativo (`aria-hidden`), porque la etiqueta ya da el significado.
- **Esqueleto:** reserva un hueco `size-4` en la misma fila para que nada salte al llegar los datos.

### D3 — Refresco automático con la opción nativa de TanStack Query
- Los cinco hooks reciben `refetchInterval: 5 min` y `refetchIntervalInBackground: false`. No se
  escribe un `setInterval` propio. Ya hay precedente en campañas y en la base de conocimiento.
- **Limpieza al desmontar:** el `QueryObserver` borra su intervalo cuando el componente deja de
  observar la query, sin código adicional.
- **Pausa con la pestaña oculta:** con `refetchIntervalInBackground: false`, cada tick se salta
  mientras `focusManager.isFocused()` sea `false` (escucha `visibilitychange`). Al volver a la
  pestaña, `refetchOnWindowFocus`, activo por defecto con `staleTime` de 1 min, recarga si el dato
  quedó viejo.
- **Sin parpadeo:** en un refetch, `isPending` sigue en `false` y `data` conserva el valor anterior,
  así que las páginas, que pintan el esqueleto solo con `isPending`, no lo muestran.
  `keepPreviousData` ya cubre el cambio de filtros. El único indicio visible es el de D4.
- **Reinicio del temporizador:** en `@tanstack/query-core@5.101.2`, `QueryObserver.onQueryUpdate()`
  llama a `#updateTimers()`, que limpia y vuelve a crear el intervalo en cada cambio de estado de la
  query, incluido un refetch manual. Por eso, tras pulsar "Actualizar", el siguiente tick queda a
  5 min. Un test con temporizadores falsos fija este comportamiento (CA-7) para detectar si una
  actualización de la librería lo cambia.
- **Por qué no un `useAutoRefresh` con `setInterval`:** duplicaría lo que la librería ya hace bien
  (pausa por visibilidad, limpieza y reinicio). Además, habría que coordinarlo con la caché a mano.
  La pieza reutilizable es la configuración compartida más el hook del botón (D4).

### D4 — Botón "Actualizar" y hora de la última actualización
- **Ubicación:** en la cabecera de cada página, en el grupo de la derecha junto al filtro de
  periodo. Al pasar a una sola columna, queda debajo del título.
- **Acción:** `queryClient.refetchQueries({ queryKey: <prefijo del dashboard>, type: 'active' })`.
  Se usa el prefijo y no el `refetch()` de una sola query, porque Métricas globales tiene **dos**
  queries activas: la principal y la de `TopTenantsChart`, con otros parámetros. Ambas deben
  refrescarse.
- **Estado de carga:** `useIsFetching({ queryKey: prefijo }) > 0`. Mientras hay una carga en
  curso, sea manual, automática o por cambio de filtro, el botón queda `disabled` y el icono
  `RefreshCw` gira con `animate-spin`. Si el usuario prefiere reducir el movimiento, se usa
  `motion-reduce:animate-none`.
- **Última actualización:** "Actualizado a las 10:42", a partir del `dataUpdatedAt` de la query
  principal y con el mismo formato `horaCorta` (`es-CO`) que ya usa el tablero global. En Métricas
  globales se quita el "Datos de las HH:MM" del subtítulo para no repetir la hora.
- **Error en un refresco:** se conserva el comportamiento actual. Si ya había `data`, se sigue
  mostrando y el botón vuelve a habilitarse. El aviso "Reintentar" solo aparece sin datos.

### D5 — Componentes compartidos y no por feature
Hay cinco franjas KPI en dos features (`admin-metrics` y `reports`). La celda compartida va en
`components/charts/` (junto a `ChartCard` y `PeriodFilter`) y el hook en `hooks/`, la misma
ubicación que eligió HU-REP-01 para lo que comparten ambos features. Se reutilizan los componentes
shadcn ya vendorizados (`Card`, `Button`, `Skeleton`, `Progress`), sin instalar ninguno nuevo.

## Criterios de aceptación

1. **CA-1 — Iconos:** cada una de las 22 celdas de la tabla D1 muestra su icono. Ningún icono se
   repite dentro de un mismo dashboard.
2. **CA-2 — Uniformidad:** todas las celdas KPI de los cinco dashboards se pintan con el mismo
   componente compartido. El icono va a la derecha de la etiqueta, con `size-4`,
   `text-muted-foreground` en las normales, `text-primary` en la de acento y `aria-hidden`.
3. **CA-3 — Sin regresión de contenido:** etiquetas, valores, detalles, orden de las celdas, celda
   con acento y barras `Progress` quedan como antes. Los tests existentes de las cinco páginas
   pasan sin cambiar sus aserciones de contenido.
4. **CA-4 — Refresco automático:** con la página montada y la pestaña visible, la query del
   dashboard se vuelve a pedir a los 5 minutos sin acción del usuario. No hay recarga de página.
5. **CA-5 — Sin parpadeo:** durante un refresco automático o manual, el KPI strip y las gráficas
   no muestran esqueleto (`aria-busy` ausente) y siguen con los datos anteriores hasta que llegan
   los nuevos.
6. **CA-6 — Pestaña oculta:** con `document.visibilityState === 'hidden'`, el tick de 5 minutos no
   dispara ninguna petición.
7. **CA-7 — Botón "Actualizar":** cada dashboard muestra un botón "Actualizar" con `RefreshCw` en
   la cabecera.
   - Al pulsarlo se hace la petición al instante.
   - Mientras carga, el botón está `disabled` y el icono tiene `animate-spin`.
   - Tras el clic, el siguiente refresco automático ocurre 5 minutos después del clic y no en el
     tick que se esperaba antes.
8. **CA-8 — Métricas globales completas:** "Actualizar" en Métricas globales refresca también la
   query de `TopTenantsChart`.
9. **CA-9 — Hora de actualización:** junto al botón se muestra "Actualizado a las HH:MM" y cambia
   tras un refresco correcto.
10. **CA-10 — Limpieza:** al desmontar la página no quedan temporizadores. Tras desmontar y avanzar
    5 minutos en un test, no se hace ninguna petición.
11. **CA-11 — Light y dark:** las celdas, los iconos y el control de refresco se ven bien en ambos
    temas, solo con tokens semánticos y sin colores literales.
12. **CA-12 — Sin cambios de backend ni de permisos:** el diff no toca `apps/backend` ni las
    guardas de ruta. Las queries piden los mismos endpoints con los mismos parámetros, así que el
    aislamiento multi-tenant (el `tenantId` del token en el backend) no cambia.
    `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` y
    `pnpm --filter @sofiapp/web test` pasan en verde.

## Dependencias

- HU-SAAS-03 (Métricas globales) y HU-REP-01/02/03/04 (reportes de tenant), ya implementados.
- Ninguna dependencia nueva: `@tanstack/react-query@5`, `lucide-react@1.23.0` y shadcn/ui
  (`Card`, `Button`, `Skeleton`, `Progress`) ya están en `apps/frontend`.
- Regla 7 del `CLAUDE.md` raíz: invocar `emil-design-eng`, `impeccable:impeccable` y
  `frontend-design:frontend-design` antes de escribir los componentes.
