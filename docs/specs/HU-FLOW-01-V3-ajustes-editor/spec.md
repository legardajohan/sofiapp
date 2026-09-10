# HU-FLOW-01-V3 — Ajustes al editor de flujos (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. Es una iteración de ajuste sobre `docs/specs/HU-FLOW-01-V2-condiciones-respuesta/`,
> ya implementada y pusheada en `feat/HU-FLOW-01-V2`.

**Estado:** implementado

## Por qué V3

Con el editor de V2 en uso, el usuario pidió verificar y ajustar 5 cosas puntuales antes de seguir
con el backlog. No es una re-planeación del feature (el motor, el modelo de datos y los endpoints
de V2 no cambian): son ajustes de UX/UI en el editor y una pieza de datos de prueba.

## Objetivo

Que el editor visual de flujos comunique con líneas lo que hoy solo vive en selects invisibles
(las ramas de `condicion`/`intencion`), que el admin entienda por qué solo hay un flujo activo por
tenant y cómo cubrir varios temas con uno solo, que el panel de configuración no obligue a hacer
scroll horizontal para leer un valor largo, y que exista un flujo de ejemplo real de ventas de CRM
para probar y hacer demos.

## Contexto de diagnóstico (verificado por exploración de código antes de planear)

1. **Por qué "no deja enlazar con una línea".** `apps/frontend/src/features/flows/components/nodes/FlowNode.tsx:64-66`
   y `nodeVisuals.ts:36-38` (`tieneSalidaLineal`) hacen que `condicion`, `intencion` y `handoff` no
   tengan **ningún** `Handle` de salida en el canvas — ni uno genérico ni uno por rama. El destino
   de cada rama vive solo en `config.ramas[].nodoDestino` / `config.etiquetas[].nodoDestino`,
   elegido por un `<Select>` en `ConditionEditor.tsx`/`NodeInspector.tsx`, invisible en el lienzo.
   Mensaje→mensaje sí tiene handles y **debe seguir así**: `flow.engine.ts:30-32`
   (`siguienteLineal`) resuelve el "siguiente" de un nodo lineal leyendo la arista real del canvas;
   quitarle el handle rompería el motor. Lo que falta es representar las ramas, no "arreglar" el
   enlace lineal.
2. **Por qué un solo flujo activo.** `flow.model.ts:51-54` tiene un índice parcial único
   (`{tenantId:1}` único con `activo:true`) que garantiza como máximo un flujo `activo` por tenant
   **a nivel de base de datos**, no solo por el service — es una decisión deliberada de V2
   (`docs/specs/HU-FLOW-01-V2-condiciones-respuesta/spec.md:106,280-281`) para que dos activaciones
   concurrentes no dejen dos flujos activos. El usuario, consultado, decidió mantenerlo así y
   resolver "necesito manejar horarios, precios y ventas a la vez" con un nodo `intencion` como
   router de temas al inicio de un único flujo, no con varios flujos activos simultáneos.
3. **Overflow horizontal confirmado.** `ConditionEditor.tsx:85-91`: el campo `valor` de cada rama es
   un `<Input>` de una sola línea dentro de un grid angosto (`grid-cols-[1fr_1fr_1fr_auto]`); con
   texto largo, el input hace scroll horizontal nativo sin wrap ni forma de ver el contenido
   completo sin editar.
4. **Mismo problema en otro nodo, confirmado por auditoría.** `NodeInspector.tsx:132-137`: el campo
   `descripcion` de cada etiqueta del nodo `Intención` tiene el mismo patrón (`<Input>` de una línea
   para texto libre potencialmente largo). El resto de campos de texto libre del inspector
   (`mensaje.texto`, `captura.pregunta`, `kb.pregunta`/`siNoHayRespuesta`, `handoff.motivo`) ya usan
   `Textarea` con wrap — no necesitan el mismo ajuste.
5. No existe ningún flujo de ejemplo sembrado en Mongo; el patrón reusable más cercano es
   `apps/backend/src/seed/seed-inbox-demo.ts` (resolución de tenant por email de `User`, script
   idempotente, aborta en producción salvo `--force`).

## Alcance

Incluye:
- Handles de salida por rama/etiqueta en los nodos `condicion` e `intencion`, con la línea
  correspondiente visible en el canvas (derivada de la configuración del nodo, ver `plan.md`).
- Guía de uso en la UI (`FlowsPage`, `EmptyFlowState`) sobre por qué hay un solo flujo activo y
  cómo cubrir varios temas con nodos `intencion`.
- Texto largo expandible ("Ver más") en vez de scroll horizontal, en `ConditionEditor` (`valor` de
  cada rama) y en el formulario de `Intención` (`descripcion` de cada etiqueta).
- Script de seed `seed-flow-crm-ventas.ts` que crea un flujo de ejemplo de ventas de CRM para el
  tenant resuelto por el email `user-empresa-test@test.com`.

Fuera de alcance:
- Cambiar el modelo de "un flujo activo por tenant" (decisión tomada explícitamente por el
  usuario en esta sesión: se mantiene, con nodos de intención como respuesta al caso de uso).
- Nodos `espera`/`api`: siguen fuera, igual que en V2.
- Cualquier cambio al motor (`flow.engine.ts`), a los endpoints o al modelo `Flow`/`FlowState`: no
  hace falta tocarlos para nada de esta spec.

## Criterios de aceptación

1. Un nodo `condicion` con N ramas expone en el canvas N+1 puntos de conexión de salida (uno por
   rama, uno para la rama por defecto). Arrastrar una línea desde el punto de una rama hacia otro
   nodo fija el `nodoDestino` de esa rama exactamente igual que elegirlo en el `<Select>` del
   inspector; ambas vías quedan sincronizadas porque leen y escriben el mismo `config` (nunca dos
   fuentes de verdad independientes). Lo mismo aplica a `intencion` con sus etiquetas.
2. Las líneas de rama de `condicion`/`intencion` se ven en el canvas con una etiqueta corta
   (operador+valor, o el nombre de la etiqueta de intención) y **no** se guardan como `aristas`
   sueltas del flujo — se derivan de `config` en cada render, así que borrar o cambiar una rama
   actualiza la línea sin dejar aristas huérfanas.
3. Mensaje→mensaje (y el resto de nodos con salida lineal: `captura`, `kb`, `accion`) sigue
   funcionando exactamente igual que en V2 — este ajuste no toca `flow.engine.ts` ni el contrato de
   `aristas` para esos tipos.
4. `handoff` sigue sin ningún handle de salida (nodo terminal); esto no cambia.
5. `FlowsPage` y/o `EmptyFlowState` explican, sin abrir un modal ni requerir documentación externa,
   que hay un solo flujo activo por tenant y que un nodo `intencion` al inicio es el patrón para
   manejar varios temas (horarios, precios, ventas) dentro de ese único flujo.
6. En `ConditionEditor`, un valor de rama que supera el umbral definido en `plan.md` muestra un
   afordance "Ver más" que expande una vista de texto completo con wrap, sin scroll horizontal en
   ningún momento; colapsar vuelve al input compacto de una línea.
7. El mismo comportamiento del criterio 6 aplica a `descripcion` de cada etiqueta del nodo
   `Intención`.
8. Existe un flujo llamado "Ventas CRM (demo)" en la base de datos para el tenant al que pertenece
   el usuario con email `user-empresa-test@test.com`, creado por
   `pnpm --filter backend seed:flow -- --email=user-empresa-test@test.com`, que pasa la misma
   validación Zod de `flow.validation.ts` que usa el endpoint `POST /api/flows` (se construye y se
   valida el DTO antes de persistir, nunca un `Flow.create()` sin pasar por esa validación).
9. **Aislamiento multi-tenant:** el seed del criterio 8 escribe únicamente en el tenant resuelto por
   el email dado; correrlo no crea, modifica ni borra ningún documento de otro tenant. Existe una
   verificación (test o script) que lo demuestra.
10. Re-correr el seed del criterio 8 es idempotente: reemplaza el flujo demo anterior del mismo
    tenant en vez de duplicarlo, y no activa el flujo automáticamente salvo que se pase `--activar`
    (para no desactivar sin aviso un flujo real que ya esté activo en ese tenant).
11. `pnpm --filter backend typecheck` y `pnpm --filter backend test` en verde;
    `pnpm --filter frontend build && pnpm --filter frontend lint` en verde.

## Dependencias

- `HU-FLOW-01-V2` (implementado) — motor, modelo, endpoints y editor base sobre los que se ajusta
  esta spec. Ningún contrato de V2 cambia.
