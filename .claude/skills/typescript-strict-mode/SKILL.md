---
name: typescript-strict-mode
description: Aplica tipado estricto de TypeScript en código nuevo o editado de apps/backend, apps/frontend y packages/shared de SofiApp. Úsala al crear/modificar archivos .ts/.tsx. Garantiza cero `any`, tipos de retorno explícitos y DTOs derivados de Zod.
---

# TypeScript Strict Mode

Proyecto **ESM**, `strict` activado. Aplica a `apps/backend`, `apps/frontend`, `packages/shared` al tocar `**/*.ts(x)`.

## Reglas
1. **Cero `any`.** Usa `unknown` + narrowing. En `catch`, tipa el acceso (`(err as { message?: string })`).
2. **Tipo de retorno explícito** en toda función exportada (services, controllers, acciones de store, hooks).
3. **DTOs nombrados** para entradas/salidas públicas: `Create<X>DTO`, `Update<X>DTO`, `I<X>Response`. Sin objetos anónimos inline en firmas exportadas.
4. **Zod = fuente del tipo de entrada:** `type LoginInput = z.infer<typeof loginSchema>`. Validación y tipo nunca divergen.
5. **Deriva, no dupliques:** `Omit`/`Pick`/`Partial`/`Required` (ej. `SafeUser = Omit<IUser, 'passwordHash'> & { _id: string }`).
6. **Enums/uniones centralizados** en `*.types.ts` (`Rol`, `EstadoComercial`, `NivelInteres`, `Canal`). Lo compartido back↔front va en `packages/shared`.
7. **`noUnusedLocals`/`noUnusedParameters`:** elimina lo no usado o prefija con `_`.
8. **Mongoose:** `I<X>Document extends I<X>, Document`. Lecturas con `.lean()` devuelven `I<X>`, no el Document.
9. **ESM:** imports con extensión si el resolver lo exige (`NodeNext`); sin `require`.

## Procedimiento
1. Antes de escribir, define/localiza tipos en `*.types.ts` (back), `types/` (front) o `packages/shared`.
2. Tras editar: `pnpm --filter backend typecheck` o `frontend build`.
3. Cero errores de tipo antes de cerrar.

## Anti-ejemplos → corrección
```ts
// ❌
export const getCliente = async (id) => { ... }   // sin tipos
function save(data: any) { ... }                  // any
const rol = user['rol'];                          // acceso no tipado
// ✅
export async function getCliente(id: string, tenantId: string): Promise<IClienteResponse | null> { ... }
function save(data: CreateClienteDTO): Promise<ICliente> { ... }
const rol: Rol = user.rol;
```
