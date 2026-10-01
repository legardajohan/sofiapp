# ADR 0010 — SofiApp opera como Tech Provider frente a Meta, por ahora

**Estado:** Aceptada · **Fecha:** 2026-09-28 · **Contexto:** HT-WA-03 (Embedded Signup)

## Contexto

SofiApp es un SaaS multi-tenant donde cada empresa conecta su propio número de WhatsApp Business
(`docs/domain.md`, `docs/integrations/meta-whatsapp.md`). Al planear HT-WA-03 (el flujo de
Embedded Signup) surgió una pregunta de negocio que el código no responde por sí solo: **¿quién le
paga a Meta el consumo de mensajes de cada tenant, y puede SofiApp cobrar un margen sobre ese
consumo?**

Meta define dos roles frente a un CRM que conecta WABAs ajenas:

- **Tech Provider**: la app de SofiApp puede incorporar la WABA de cualquier tenant vía Embedded
  Signup, pero **cada tenant paga directamente** su consumo a Meta, con el método de pago que carga
  en su propia WABA.
- **Solution Partner (BSP)**, el modelo que operan Mercately y similares: SofiApp comparte su
  **línea de crédito** con la WABA de cada tenant, Meta le factura a SofiApp el consumo agregado, y
  SofiApp puede revender ese consumo con margen.

La documentación del proyecto (`README.md`, `docs/product.md`, `docs/domain.md`,
`docs/data-model.md`) usaba "BSP" para describir el modelo operativo actual, lo cual es impreciso:
BSP es el nombre de Meta para Solution Partner, y ese modelo trae un requisito (línea de crédito
compartida) que el código de HT-WA-03 no implementa.

## Decisión

**SofiApp opera como Tech Provider, por ahora.** Cada tenant paga directamente a Meta el consumo de
su WABA. SofiApp no paga ni revende ese consumo: cobra únicamente su plan SaaS
(`docs/specs/HU-SAAS-02-planes-limites-uso/`).

El código de onboarding (`connectViaEmbeddedSignup`, `activateChannel`) no asigna ninguna línea de
crédito a la WABA del tenant — con Tech Provider ese paso no existe.

## Alternativas consideradas

1. **Solution Partner (BSP) propio.** Exige que Meta apruebe a SofiApp como partner, con
   requisitos de trayectoria y volumen más exigentes que Tech Provider, y una línea de crédito
   propia respaldando el consumo de todos los tenants. Se descarta **por ahora**: es más trámite del
   que un MVP con un solo cliente necesita, y compromete a SofiApp financieramente por el consumo de
   terceros antes de tener volumen.
2. **Tech Provider asociado a un BSP existente.** Un Solution Partner ya aprobado presta su línea de
   crédito; SofiApp le factura a él y él revende. Reduce el trámite frente a la opción 1, pero suma
   un intermediario que también se queda con margen. Queda como camino más realista que la opción 1
   cuando el volumen lo justifique.
3. **WABAs dentro del portfolio de SofiApp** (en vez de que cada tenant sea dueño de la suya). Se
   descarta: el tenant perdería la propiedad de su propio número y de su relación con Meta, algo que
   contradice el modelo BSP-tipo-Mercately que persigue el negocio a futuro (ver `CLAUDE.md` raíz).

## Consecuencias

- **Sin margen sobre los mensajes.** El plan SaaS es la única fuente de ingreso mientras se opere
  como Tech Provider.
- **Cada tenant gestiona su propio pago con Meta**, incluida su verificación de negocio si quiere
  límites de envío más altos.
- **HT-WA-03 no necesita un paso de línea de crédito** en el onboarding. Migrar a Solution Partner sí
  lo exigiría: un paso más tras `registerPhone` para compartir la línea de crédito con la WABA, y una
  feature aparte para medir el costo de Meta por tenant (hoy `HU-SAAS-02` mide cuotas propias de
  SofiApp — `mensajesMes`, etc. — no el costo real de Meta).
- **La documentación del repo usa "Tech Provider"**, no "BSP", para describir el modelo operativo
  actual. `CLAUDE.md` y `AGENTS.md` conservan la frase "modelo BSP, tipo Mercately": describen la
  meta de negocio a la que SofiApp aspira evolucionar, no el modelo que opera hoy.
