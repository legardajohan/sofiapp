# HU-KB-02-V3 — Tasks

> Checklist de ejecución. El QUÉ está en `spec.md`, el CÓMO en `plan.md`.
> Se ejecuta con `/sdd-implement HU-KB-02-V3-minimo-activas` **sobre la rama actual
> `feat/HU-IA-01`** — no se crea rama nueva (norma del repo: las historias de IA/KB van ahí).

## 0. Antes de empezar

- [x] Confirmar que estás en `feat/HU-IA-01` (`git branch --show-current`).
- [x] Punto de partida verde, verificado en la planeación: `typecheck` ✅ y `test` ✅
      (**87 archivos / 879 tests**). Si no lo está al empezar, arreglar eso primero.
- [x] Releer las skills obligatorias: `multi-tenancy-guard`, `typescript-strict-mode`,
      `clean-code-solid`.
- [x] Los paquetes son **`@sofiapp/api`** y **`@sofiapp/web`** (`--filter backend` no matchea nada).

## 1. Implementación

### 1.1 Configuración

- [x] `config/env.ts`: `FAQ_MIN_ACTIVAS: z.coerce.number().int().nonnegative().default(5)` en el
      bloque FAQ, tras `FAQ_MATCH_MIN_OVERLAP`.
- [x] Comentario de calibración (texto en `plan.md`): qué es, cuándo se comprueba, qué pasa con un
      tenant por debajo, y que `0` desactiva la regla. **Ningún umbral escrito a mano en el código.**

### 1.2 Tipos

- [x] `kb-faq.types.ts`: `activas` y `minimoActivas` **requeridos** en `KbFaqsListResponse`, con el
      comentario de que `activas` es de alcance tenant y no responde a `page`/`limit`/`activo`.

### 1.3 Service

- [x] `puedeReducirActivas(activas, minimo): boolean` — pura, exportada, `minimo === 0` la desactiva.
- [x] `asegurarMinimoActivas(tenantId, accion)` — sale temprano con `minimo === 0`; cuenta con
      `countScoped(KbFaq, tenantId, { activo: true })`; lanza
      `AppError(mensaje, 409, { activas, minimo })`.
- [x] Mensajes distintos para `desactivar` y `eliminar` (en español, con punto final, como el resto
      del feature).
- [x] `deleteFaq`: tipar la lectura previa como `.lean<LeanKbFaq | null>()` y llamar la guarda
      **solo si `existing.activo`**.
- [x] `updateFaq`: llamar la guarda **solo** cuando `dto.activo === false && actual.activo`, y
      **antes** de re-embeber, para no gastar una llamada a Gemini en algo que se va a rechazar.
- [x] `listFaqs`: tercer `countScoped` en el mismo `Promise.all`, sin `filtro`, y devolver
      `activas` + `minimoActivas`.
- [x] Verificar que `createFaq` **no** gana ninguna guarda.

### 1.4 Lo que NO se toca

- [x] Confirmar sin cambios: `kb-faq.controller.ts`, `kb-faq.routes.ts`, `kb-faq.validation.ts`,
      `kb-faq.model.ts`, `kb-faq.repository.ts`, `kb-faq.matching.ts`. Ningún schema Zod aprende a
      contar FAQs.

### 1.5 Frontend

- [x] **Antes de escribir cada componente**, invocar las skills de diseño del `CLAUDE.md` raíz §7
      disponibles en la sesión y aplicar sus criterios.
- [x] `types/faq.ts`: espejar `activas` y `minimoActivas`.
- [x] `hooks/useKbFaqs.ts` (NUEVO): la query `['kb', 'faqs']` + `estadoMinimo()` pura
      (`activas`, `minimo`, `faltan`, `cumple`, `puedeReducir`).
- [x] `FaqTable.tsx`: consumir el hook; cabecera con `«N preguntas · X de N activas»`, en
      `text-destructive` mientras no cumpla.
- [x] `FaqTable.tsx`: `bloqueaBaja = faq.activo && !puedeReducir` gobierna el `Switch` y el botón de
      eliminar. Una FAQ **inactiva** nunca se bloquea.
- [x] `Tooltip` con el motivo, colgando de un `<span tabIndex={0}>` que envuelve el control (un
      elemento `disabled` no emite eventos de puntero), para que se alcance también con teclado.
- [x] `FaqFormDialog.tsx`: mismo criterio en el `Switch` de «Activa» al editar una FAQ activa.
- [x] `KnowledgeFaqsPage.tsx`: aviso mientras `!cumple`, entre la cabecera y el probador, con el
      número de las que faltan y un botón para crear. Desaparece al llegar al mínimo.
- [x] Solo componentes de `src/components/ui/` y tokens semánticos; cero `bg-[#...]`. Revisar en
      **light y dark**.

## 2. Tests

### 2.1 `kb-faq.service.test.ts` — la guarda

Las fixtures se construyen **relativas a `env.FAQ_MIN_ACTIVAS`**, no contra un 5 escrito a mano.

- [x] Unitarios de `puedeReducirActivas`: por encima, justo en el mínimo, por debajo, y
      `minimo === 0` (permite siempre). Sin Mongo.
- [x] Con exactamente el mínimo de activas, `updateFaq({ activo: false })` sobre una activa →
      `AppError` `409` con `details { activas, minimo }`, y el documento **no** cambia en Mongo.
- [x] Con exactamente el mínimo, `deleteFaq` de una **activa** → `409` y la FAQ sigue existiendo.
- [x] Con `mínimo + 1` activas, desactivar funciona y deja el conteo exactamente en el mínimo.
- [x] Con `mínimo + 1` activas, eliminar una activa funciona.
- [x] **Nunca se bloquea:** crear con 0 activas; editar solo `respuesta`; editar solo `pregunta`;
      reactivar una apagada; `{ activo: false }` sobre una ya inactiva; **eliminar una inactiva**
      estando justo en el mínimo.
- [x] **Piso duro:** con menos activas que el mínimo (datos previos), desactivar y eliminar siguen
      bloqueados, y crear/editar siguen libres.
- [x] La guarda de `updateFaq` corre **antes** de re-embeber: en el caso rechazado,
      `provider.embedTexts` no se llama.

### 2.2 `kb-faq.service.test.ts` — aislamiento multi-tenant

Van en el `describe('kb-faq — aislamiento multi-tenant')` que ya existe (**no hay
`kb-faq.isolation.test.ts`**; el aislamiento del feature vive ahí y en `kb-faq.repository.test.ts`).

- [x] Tenant A con `mínimo + 2` activas y tenant B con exactamente el mínimo: A puede eliminar una
      activa, B no. El conteo de A no habilita a B.
- [x] A la inversa: A justo en el mínimo y B por encima; B opera y A queda bloqueado.
- [x] `listFaqs` de B devuelve el `activas` de B, nunca la suma ni el de A.

### 2.3 `kb-faq.routes.test.ts`

- [x] `DELETE /api/kb/faqs/:id` que rompería el mínimo → **409** con `message`, `activas` y `minimo`
      en el cuerpo.
- [x] `PATCH /api/kb/faqs/:id` con `{ activo: false }` que rompería el mínimo → **409**.
- [x] `POST /api/kb/faqs` → **201** aunque el tenant esté por debajo del mínimo.
- [x] `GET /api/kb/faqs` devuelve `activas` y `minimoActivas`.
- [x] `GET /api/kb/faqs?activo=false` devuelve `activas` de alcance tenant (no `0`) — el caso donde
      confundir `total` con `activas` se notaría.

### 2.4 Frontend

- [x] `FaqTable.test.tsx`: la cabecera muestra `«X de N activas»`.
- [x] `FaqTable.test.tsx`: con `activas === minimoActivas`, el `Switch` y el botón de eliminar de
      una FAQ **activa** quedan deshabilitados.
- [x] `FaqTable.test.tsx`: en esa misma situación, los de una FAQ **inactiva** siguen habilitados.
- [x] `FaqTable.test.tsx`: con `activas > minimoActivas`, nada queda deshabilitado.
- [x] `FaqTable.test.tsx`: el motivo del bloqueo es alcanzable (tooltip accesible).
- [x] `KnowledgeFaqsPage.test.tsx` (NUEVO): el aviso aparece con `activas < minimoActivas`, dice
      cuántas faltan, y **no** aparece al alcanzar el mínimo.

### 2.5 Sin cambios, pero deben seguir verdes

- [x] `kb-faq.matching.test.ts`, `kb-faq.repository.test.ts`, `FaqTester.test.tsx`.
- [x] `tests/isolation/**` completo.

## 3. Verificación final

- [x] `pnpm --filter @sofiapp/api typecheck` en verde (cero `any`, tipos de retorno explícitos).
- [x] `pnpm --filter @sofiapp/api test` en verde — no menos de 879 tests, más los nuevos.
- [x] `pnpm --filter @sofiapp/web test` en verde.
- [x] `pnpm --filter @sofiapp/web build && pnpm --filter @sofiapp/web lint` en verde.
- [x] Checklist de PR de `docs/multi-tenancy.md` §9 completo.
- [x] `docs/api-contract.md` §6 con las filas de `/api/kb/faqs` y el `409`.
- [~] Revisión de `FaqTable`, `FaqFormDialog` y el aviso en **light y dark** — verificado por
      inspección: todo lo nuevo usa tokens semánticos ya definidos en `:root` y en `.dark`
      (`text-destructive`, `bg-muted/50`, `border-border`, `text-secondary-foreground`) y el
      `TooltipContent` es el primitivo vendorizado, que ya trae su propia rama dark. **Falta la
      revisión visual con la app corriendo**: en esta sesión no hay MCP de Playwright y levantar la
      SPA contra el API exige Mongo + Redis.
- [x] Sin `*.png`/`*.jpg` de verificación colados en `git status` antes del commit.

## Definición de «hecho»

1. Los 12 criterios de aceptación de `spec.md` se cumplen y están cubiertos por un test.
2. Un tenant con exactamente el mínimo no puede desactivar ni eliminar una FAQ activa, por API ni
   por UI, y entiende por qué sin tener que intentarlo.
3. Ese mismo tenant puede crear, editar textos, reactivar apagadas y eliminar inactivas sin fricción.
4. Un tenant por debajo del mínimo (datos previos) no queda atrapado: edita y crea con libertad.
5. `FAQ_MIN_ACTIVAS=0` devuelve el comportamiento anterior sin desplegar código.
6. El conteo pasa por `countScoped` con el `tenantId` del token, y el aislamiento está demostrado
   con dos tenants en estados distintos.
7. `spec.md` actualizado a `**Estado:** implementado`.
