# ADR 0003 — Resolución del tenant en el login

- **Estado:** Aceptada
- **Fecha:** 2026-06
- **Contexto:** El `tenantId` nace del JWT, pero en el **login** todavía no hay token. El usuario
  solo aporta credenciales. `docs/multi-tenancy.md` §7 dejó esto como "Ver ADR futura": con email
  **único por tenant** (`{ tenantId, email }` único), un mismo correo puede existir en dos empresas,
  así que el email **por sí solo no resuelve el tenant** en pre-autenticación. Como el producto
  **no** usa subdominios por empresa (`docs/product.md` §2), hay que elegir cómo se resuelve.

## Opciones

1. **Email globalmente único para usuarios de panel (recomendada).** El login es solo
   `email + password`; el usuario encontrado determina su `tenantId`. UX mínima (un solo campo de
   identidad). Coste: una empresa no puede dar de alta un email de panel ya usado por otra empresa
   (poco probable con correos corporativos; aceptable en el MVP).
2. **Login con identificador de empresa.** El usuario aporta `empresa (slug) + email + password`;
   lookup compuesto `{ slug→tenantId, email }`. Permite reutilizar el mismo email entre empresas, a
   costa de un campo extra y de que el usuario conozca su identificador de empresa.

## Decisión

Adoptar la **Opción 1**: **email globalmente único para usuarios de panel**. Login con
`email + password`; el `tenantId` se toma del documento `User` hallado y se firma en el JWT.

> **Implicación en el modelo de datos (aplicada):** en `users`, el índice **único global** es
> `{ email: 1 } unique` (cubre a todos los usuarios de panel, incluido el superadmin con
> `tenantId = null`). Se conserva `{ tenantId: 1, email: 1 }` como índice **no único** para lookups
> scoped. Reflejado en `docs/data-model.md` (`users`), `docs/domain.md` §5 y `docs/multi-tenancy.md`
> §7. Esta lectura de `User` en el login sigue siendo una de las excepciones documentadas fuera del
> repositorio scoped.

## Consecuencias

- (+) Login simple, sin fricción ni subdominios.
- (+) Resolución determinista del tenant desde un único campo.
- (−) Restringe la reutilización de un email de panel entre empresas. Si en el futuro un cliente
  enterprise lo exige, se migra a la Opción 2 (nuevo ADR que reemplace a este).
