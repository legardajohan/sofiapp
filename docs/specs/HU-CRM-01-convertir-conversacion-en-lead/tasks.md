# HU-CRM-01 — Tasks (checklist ejecutable)

> Claude Code: ejecuta en orden. Marca cada casilla al terminar. No cierres el feature hasta que
> TODO esté en verde. Rama: `feat/HU-CRM-01` (creada desde `develop`).

## Implementación — Backend

En el orden del patrón de 6 archivos (`apps/backend/CLAUDE.md`):

- [x] `src/features/lead/lead.types.ts` — `IOrigenLead`, `ILead`, `ILeadDocument`, `ILeadLean`,
      `CreateLeadDTO`, `ILeadResponse`. `estado` importa `EstadoComercial` de `cliente.types.ts`; no
      se redefine la unión ni se añade `etapa`.
- [x] `src/features/lead/lead.model.ts` — schema `Lead` con `tenantId` (`required`, `index`), subdoc
      `origen` con `{ _id: false }`, `{ timestamps: true }`. Índices
      `{ tenantId, telefono }` **unique** y `{ tenantId, clienteId }`.
- [x] `src/features/lead/lead.validation.ts` — `createLeadSchema`, `getLeadSchema`,
      `deleteLeadSchema`. Partes vacías como `z.object({})`. En `deleteLeadSchema` el `motivo` es un
      `z.enum` **en la query**, no en el body: un cuerpo en `DELETE` es legal pero lo pierden proxies
      y clientes, y aquí es obligatorio.
- [x] `src/features/lead/lead.service.ts` — `createLeadFromConversation`, `getLeadById`,
      `deleteLead`, `findLeadIdsByClientes`; privados `toLeadResponse`, `normalizarTelefono`,
      `esTelefonoDuplicado`. Todo vía `*Scoped`, `.lean()` en lecturas, **cero `populate()`**.
      `getLeadById` resuelve los dos usuarios con **una** llamada a `findUsersByIds`.
- [x] `src/features/lead/lead.controller.ts` — `createLeadController` (201), `getLeadController`
      (200), `deleteLeadController` (204). `tenantId` y `actorId` desde `req.user!`; sin `try/catch`,
      sin Mongoose. El motivo se lee de `req.validatedQuery`, **no** de `req.query`: en Express 5 el
      getter re-parsea el query string crudo y perdería la validación de Zod.
- [x] `src/features/lead/lead.routes.ts` — `POST /`, `GET /:id`, `DELETE /:id` con la cadena fija de
      middlewares y `authorize(['admin'])`. `export default router`.
- [x] Montar en `src/app.ts`: `app.use('/api/leads', leadRoutes)` junto a `/api/tags`, **antes** de
      `errorHandler`.

### Saber si una conversación ya se convirtió (criterio 10)

- [x] `src/features/cliente/cliente.types.ts` — `IContactCardResponse` `+ leadId: string | null`.
- [x] `src/features/cliente/cliente.service.ts` — `getContactHistory` resuelve el `leadId`.
- [x] `src/features/conversation/conversation.types.ts` — `IConversationResponse`
      `+ leadId: string | null`.
- [x] `src/features/conversation/conversation.mapper.ts` — `toConversationResponse` recibe y proyecta
      el `leadId` (parámetro opcional, como se hizo con `tagMap`).
- [x] `src/features/conversation/conversation.service.ts` — `listConversations` hidrata los `leadId`
      **en lote** con `findLeadIdsByClientes`: una consulta para toda la página, no una por
      conversación.

### Cambios transversales

- [x] `src/features/audit/audit.types.ts` — `AuditAccion` `+ 'lead.create'` y `+ 'lead.delete'`;
      `AuditEntidad` `+ 'lead'`.
- [x] `src/utils/AppError.ts` — 3.er parámetro opcional `details?: Record<string, unknown>`.
- [x] `src/middlewares/error-handler.middleware.ts` — el caso `AppError` difunde `details`.
      Comprobar que un `AppError` sin `details` sigue respondiendo exactamente `{ message }`.

## Implementación — Frontend

> Antes de escribir o tocar cualquier componente, invocar las skills de diseño (regla §7 del
> `CLAUDE.md` raíz) y aplicar la tabla de decisiones ya registrada en `plan.md`. Usar los
> componentes de `src/components/ui/` que ya existen (`dialog`, `input`, `label`, `button`, `card`,
> `badge`); no escribir controles a mano.

- [x] `src/features/leads/types.ts` — `LeadDTO`, `CreateLeadPayload`, `MotivoEliminacion` y
      `MOTIVOS_ELIMINACION` (valor + etiqueta, en el orden en que se muestran).
- [x] `src/features/inbox/types.ts` — `ConversationDTO` y `ContactCardDTO`
      `+ leadId: string | null`.
- [x] `src/features/leads/api.ts` — `createLead`, `fetchLead`, `deleteLead(id, motivo)` (el motivo
      como `params`, no en el cuerpo). Rutas **sin** el prefijo `/api`.
- [x] `src/features/leads/lib/errors.ts` — `leadIdDeConflicto(error)`: extrae el `leadId` del cuerpo
      de un `409`, o `null`.
- [x] `src/features/leads/hooks/useLead.ts` — query `['lead', leadId]`, con `enabled: !!leadId`.
- [x] `src/features/leads/hooks/useCreateLead.ts` — mutación; en éxito invalida `['conversations']` y
      `['contact-history', clienteId]` y lanza `toast.success('Lead creado')`; en `409` expone el
      `leadId` en conflicto y lanza el toast con la acción `Ver lead existente`.
- [x] `src/features/leads/components/ConvertToLeadDialog.tsx` — `Dialog` de shadcn sin animación
      añadida; `useState` + `<form onSubmit>` + `puedeGuardar` derivado, copiando el patrón de
      `TagFormDialog.tsx`. Pre-relleno al abrir (`useEffect` sobre `open`) desde la prop `inicial`.
      El aviso de duplicado se renderiza dentro, con `role="alert"`.
      **Añadido sobre el plan:** el pre-relleno sale de la extracción de IA (`datosExtraidos`), no
      solo de la conversación. La prop `fuente` (`cargando | ia | conversacion`) ajusta el copy y
      deshabilita los campos mientras la ficha responde, y un `ref` de "ya sembrado" hace que la
      siembra ocurra **una vez por apertura**: sin él, una ficha que llega tarde pisaría lo que el
      asesor acabara de teclear.
- [x] `src/features/leads/components/LeadCard.tsx` — estado (`Badge`), responsable y la línea de
      trazabilidad como elemento destacado. Estados de carga y error resueltos.
      **Añadido sobre el plan:** subcomponente `LeadActions` con el menú de desbordamiento (`…`) y la
      opción "Eliminar lead…". Es un componente aparte para que `useDeleteLead` solo exista cuando
      hay un lead que borrar (nada de hooks colgando de un `lead` que puede ser `undefined`).
- [x] `src/features/leads/hooks/useDeleteLead.ts` — mutación de borrado. En éxito hace
      `removeQueries(['lead', leadId])` — **no** `invalidateQueries`, que refetchearía un lead ya
      borrado para recibir un 404 y pintar el error de la tarjeta antes de que desaparezca — e
      invalida `['conversations']` y `['contact-history', clienteId]`.
- [x] `src/features/leads/components/DeleteLeadDialog.tsx` — `AlertDialog` de shadcn (interrumpe, no
      se cierra al hacer clic fuera) con un `Select` de motivo. El motivo es parte de la
      confirmación: sin él, "Eliminar lead" está deshabilitado. Cada apertura empieza sin motivo.
- [x] `src/features/leads/index.ts` — barrel.
- [x] `src/features/inbox/pages/InboxPage.tsx` — botón "Convertir en lead" (`UserPlus` + texto) en la
      fila de controles de la cabecera; `<ConvertToLeadDialog>` montado **fuera** de cualquier menú.
      Si la conversación ya tiene lead, mostrar el estado en vez de repetir la acción.
      **Añadido sobre el plan:** `useContactHistory` se habilita también con el diálogo abierto
      (`contactPanelOpen || leadDialogOpen`) — misma `queryKey` que `ContactPanel`, así que con la
      ficha ya abierta no hay segunda petición y con ambos cerrados no consulta nada. De ahí salen
      los `datosExtraidos` que alimentan `inicial` y `fuente`.
- [x] `src/features/inbox/components/ContactPanel.tsx` — `<LeadCard>` entre `ContactCard` y
      `ContactExtractCard`. No necesita cambios para el borrado: al invalidarse la ficha, el
      `leadId` vuelve a `null` y la tarjeta se desmonta sola.
- [x] Cero `bg-[#...]`: solo tokens semánticos (`text-destructive`, `bg-destructive-subtle`,
      `bg-muted/40`, `Badge variant="secondary"`), verificado por `lint`.
      **Añadido sobre el plan:** el `leadId` se resuelve también en las **cinco mutaciones** de
      conversación (`markRead`, `setIaHabilitada`, `setConversationTags`, `assignConversation` y su
      rama idempotente), no solo en `listConversations`. Sin eso, togglear Sofi o aplicar una
      etiqueta devolvía `leadId: null` y la cabecera volvía a ofrecer "Convertir en lead" en una
      conversación ya convertida.

## Tests (Vitest)

### Aislamiento multi-tenant (obligatorio)

- [x] `src/features/lead/lead.isolation.test.ts`:
  - [x] `getLeadById` del tenant B sobre un lead del tenant A → `statusCode: 404`.
  - [x] `createLeadFromConversation` del tenant B con un `clienteId` del tenant A → falla y
        `countScoped(Lead, tenantB)` sigue en 0 (**el rechazo no dejó nada escrito**).
  - [x] El mismo teléfono se crea sin error en el tenant A y en el tenant B: la unicidad es por
        tenant, no global.
  - [x] `findLeadIdsByClientes` del tenant B con un `clienteId` del tenant A devuelve un mapa vacío:
        el `leadId` ajeno no se filtra a la bandeja de B (superficie nueva del criterio 10).
  - [x] `deleteLead` del tenant B sobre un lead del tenant A → `404` **y el lead sigue existiendo**
        (`countScoped(Lead, tenantA)` en 1). En la operación más destructiva del feature no basta con
        el mensaje: hay que probar que no tocó nada.

### Casos funcionales

- [x] `src/features/lead/lead.service.test.ts`:
  - [x] Crea el lead con `estado: 'nuevo'` y `responsableId` = usuario del token.
  - [x] `origen` queda poblado: `tipo`, `conversacionId`, `convertidoPor`, `convertidoAt`.
  - [x] Segundo lead con el mismo teléfono → `409` con el `leadId` del existente en `details`.
  - [x] El teléfono se normaliza: `+57 300 111 2233` colisiona con `573001112233`.
  - [x] `clienteId` inexistente → `404` y ningún lead creado.
  - [x] `getLeadById` devuelve `contacto`, `responsable` y `origen.convertidoPor` **resueltos con
        nombre**, no como ids sueltos (criterio 6).
  - [x] Un fallo al registrar la auditoría **no** impide crear el lead.
  - [x] `findLeadIdsByClientes` devuelve el mapa `clienteId → leadId` en **una** consulta, y omite los
        clientes sin lead.
  - [x] `listConversations` proyecta `leadId` en la conversación ya convertida y `null` en el resto;
        la hidratación es una consulta para toda la página (no N+1).
  - [x] Un `AppError` **sin** `details` sigue respondiendo exactamente `{ message }`; con `details`
        añade las claves sin poder pisar `message`.
  - [x] `deleteLead` borra el lead y `getLeadById` deja de encontrarlo.
  - [x] Borrar **libera el teléfono**: la misma conversación se vuelve a convertir sin `409`. Es la
        prueba de por qué el borrado es duro y no una marca.
  - [x] La auditoría `lead.delete` lleva el motivo en `despues` y el lead **entero** en `antes`.
  - [x] Borrar un lead inexistente → `404`.

### Contrato HTTP

- [x] `src/features/lead/lead.routes.test.ts` (**añadido sobre el plan**): sustituye al "arranca
      `app.ts` sin errores" del plan por algo que queda como regresión permanente. Cubre que la ruta
      está montada, la cadena de middlewares actúa y —lo que ningún test de service puede probar— que
      el `leadId` del `409` **llega al cuerpo HTTP** atravesando `AppError.details` y el
      `errorHandler`.
  - [x] Sin CSRF → `403`; con CSRF y sin JWT → `401`; `superadmin` → `403`; body inválido → `400`.
        **Descubierto al escribirlo:** `csrfGuard` es middleware de app y corre *antes* de la cadena
        de la ruta, así que un POST sin double-submit nunca alcanza `authenticateJWT`.
  - [x] `201` con el teléfono ya normalizado y `origen.convertidoPor` resuelto con nombre.
  - [x] Duplicado → `409` con `body.leadId` igual al id del primero.
  - [x] `GET` de un lead de otro tenant → `404`, nunca `403`.
  - [x] `DELETE` sin CSRF → `403`; con CSRF y sin JWT → `401`; `superadmin` → `403`.
  - [x] `DELETE` **sin motivo** o con un motivo fuera del enum → `400` y el lead sigue ahí: el
        borrado nunca queda sin explicación.
  - [x] `DELETE` con motivo válido → `204` y el documento desaparece; los cinco motivos se aceptan.
  - [x] `DELETE` de un lead de otro tenant → `404` y el lead sigue existiendo.

### Frontend

- [x] `src/features/leads/components/ConvertToLeadDialog.test.tsx`:
  - [x] Al abrir, nombre y teléfono llegan pre-rellenados desde la conversación.
  - [x] `puedeGuardar` es `false` con el nombre vacío y `true` con datos válidos.
  - [x] Ante un `409` el diálogo **no** se cierra y se muestra el aviso de duplicado.
  - [x] Con `fuente="ia"` los tres campos llegan con lo extraído y **siguen siendo editables**.
  - [x] Con `fuente="cargando"` los campos están deshabilitados y vacíos, y no se puede crear.
  - [x] Una extracción que llega tarde siembra el formulario vacío, pero **no** pisa lo ya tecleado.
- [x] `src/features/leads/components/DeleteLeadDialog.test.tsx`:
  - [x] Sin motivo elegido, "Eliminar lead" está deshabilitado.
  - [x] Los cinco motivos del contrato aparecen en el `Select`.
  - [x] Confirmar envía el **valor de dominio**, no la etiqueta ("El cliente no respondió" →
        `sin_respuesta`).
  - [x] El diálogo nombra el lead sobre el que se decide.
  - [x] `pending` bloquea el botón y lo dice ("Eliminando…").
  - [x] Al reabrir no hereda el motivo de la vez anterior.
- [x] `src/features/leads/components/LeadCard.test.tsx`:
  - [x] La tarjeta **no** expone ningún botón de eliminar a la vista, solo el menú de acciones
        (criterio 13: no es una acción principal).
  - [x] La opción del menú abre la confirmación y **no** borra al instante.
  - [x] Confirmar con motivo llama al backend con `(leadId, motivo)`.

## Documentación

- [x] `docs/data-model.md` — sección `## leads` con el esquema y los dos índices, más la aclaración
      de que **no** es la métrica `Plan.limites.leads`.
- [x] `docs/domain.md` — §1 glosario (Lead / Oportunidad, y su diferencia con `Cliente`), §2 lista de
      entidades `+ Lead`, §6 invariante: "un `Lead` pertenece a exactamente un `Tenant` y su
      `clienteId` es del mismo tenant".
- [x] `docs/api-contract.md` — §4 la variante de error con datos adjuntos, §6 `POST /api/leads` y
      `GET /api/leads/:id`, y el `leadId` nuevo en la respuesta de bandeja y de ficha.

## Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde.
- [x] `pnpm --filter @sofiapp/api test` en verde: **51 archivos, 335 tests**, de los que 40 son
      nuevos (6 de aislamiento, 17 de service, 17 de rutas — incluidos los 13 del borrado con
      motivo).
- [x] `pnpm --filter @sofiapp/web build` y `lint` en verde.
- [x] `pnpm --filter @sofiapp/web test`: los 23 tests de leads pasan — 13 de
      `ConvertToLeadDialog.test.tsx` (9 del feature + 4 del pre-relleno desde la extracción de IA),
      7 de `DeleteLeadDialog.test.tsx` y 3 de `LeadCard.test.tsx`.
      **La suite no está entera en verde, pero no por este feature:** `TagSelector.test.tsx` (9
      fallos, `Tooltip must be used within TooltipProvider`) y `tests/kb-progress.test.ts` ("No test
      suite found") ya fallaban en `develop` antes de tocar nada — verificado con `git stash`:
      9 fallos / 59 pasan antes, los mismos 9 fallos / 82 pasan después. Deuda previa, ajena a
      HU-CRM-01.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 revisado.
- [x] `git status` sin `*.png`/`*.jpg` de verificación colados.
- [x] `app.ts` arranca sin errores en consola tras montar `/api/leads`.
- [ ] **Pendiente:** cierre manual del DoD contra Mongo real y revisión visual en claro y oscuro por
      una persona. El `origen` está cubierto por tests automáticos y el build/lint pasan, pero nadie
      ha mirado la pantalla todavía. Dos cosas que **solo** se ven en un navegador real:
  - [ ] Al recibir el `409`, el aviso dentro del diálogo y el toast con "Ver lead existente" no se
        pisan visualmente.
  - [ ] `LeadCard` legible en ambos temas, y el botón "Lead creado" de la cabecera no desborda la
        fila cuando ya hay cinco controles.
- [x] `spec.md` pasa a `**Estado:** implementado`.

## Definición de "hecho"

Un asesor puede convertir una conversación de la bandeja en un lead con el nombre y el teléfono ya
cargados, el lead guarda de qué contacto y de qué conversación nació y quién lo convirtió, y un
segundo intento con el mismo teléfono no crea un duplicado sino que lleva al lead que ya existe. El
aislamiento por tenant está probado. Sobre esto se pueden construir el listado (`HU-CRM-02`), la
gestión del estado del lead (`HU-CRM-03`) y las métricas de conversión (`CRM-04`).
