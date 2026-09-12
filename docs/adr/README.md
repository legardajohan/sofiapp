# Architecture Decision Records (ADR)

Registro de decisiones de arquitectura de SofiApp. Cada ADR captura el **contexto**, la
**decisión** y sus **consecuencias**. Una decisión nueva que reemplace a otra crea un ADR nuevo que
marca al anterior como *Reemplazado*.

| # | Título | Estado |
|---|---|---|
| [0001](0001-shared-schema-tenant.md) | Multi-tenancy: shared database / shared schema con `tenantId` | Aceptada |
| [0002](0002-auth-token-transport.md) | Transporte del token de sesión (cookie httpOnly + CSRF) | Aceptada |
| [0003](0003-login-tenant-resolution.md) | Resolución del tenant en el login | Aceptada |
| [0004](0004-realtime-socketio-redis.md) | Transporte de tiempo real (Socket.IO + puente Redis pub/sub) | Aceptada |
| [0005](0005-decimal-money.md) | Dinero con precisión decimal (Decimal128 + decimal.js) | Aceptada |
| [0006](0006-subrol-datos-sensibles.md) | El `subrol` gobierna el acceso a los datos sensibles del contacto | Aceptada |
| [0007](0007-tablero-kanban-pipeline.md) | El embudo vuelve a tener tablero Kanban con drag & drop | Aceptada |

## Convención

- Nombre de archivo: `NNNN-slug-corto.md` (numeración incremental).
- Estados: `Propuesta` · `Aceptada` · `Reemplazado por NNNN` · `Descartada`.
- Plantilla: **Estado** · **Fecha** · **Contexto** · **Decisión** · **Alternativas** ·
  **Consecuencias**.
