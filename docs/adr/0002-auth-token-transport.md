# ADR 0002 — Transporte del token de sesión (cookie httpOnly + CSRF)

- **Estado:** Aceptada
- **Fecha:** 2026-06
- **Contexto:** SofiApp es una SPA (React en Vercel) que consume una API en otro origen (Droplet).
  La documentación tenía una contradicción: `api-contract.md` describía cookie `httpOnly` mientras
  el `apiClient` del frontend leía el token de un store Zustand y lo enviaba como `Bearer`
  (incompatible con `httpOnly`, ya que una cookie `httpOnly` no es accesible por JS). Hay que fijar
  un único mecanismo para la SPA sin cerrar la puerta a la app móvil (Fase 4).

## Decisión

**El navegador (SPA) autentica con el JWT en una cookie `httpOnly` `Secure` `SameSite`**, enviada
automáticamente por el navegador (`withCredentials: true`). El token **nunca** es accesible por JS,
por lo que el store de auth **no** lo almacena: solo guarda el usuario y su `rol` devueltos por
`/api/auth/login` o `/api/auth/me`.

Como la autenticación por cookie es vulnerable a CSRF, se añade protección **CSRF double-submit**:
el backend emite una cookie legible `csrfToken` (no `httpOnly`) y valida el header `X-CSRF-Token`
en toda ruta mutadora (POST/PUT/PATCH/DELETE).

**La app móvil y otros clientes no-navegador (Fase 4)** se autentican con
`Authorization: Bearer <token>`. Es la única vía donde el token vive fuera de una cookie; al no usar
cookie ambiental, no requiere CSRF.

## Alternativas consideradas

- **Bearer + token en `localStorage`:** simple, pero el token queda expuesto a robo por XSS.
  Descartada para la SPA.
- **Bearer + token solo en memoria (store):** mitiga `localStorage`, pero el token sigue siendo
  accesible por JS y se pierde al recargar (requiere refresh inmediato). Aceptable para móvil, no
  preferido para la SPA.

## Consecuencias

- (+) El JWT no es robable por XSS desde el navegador (no accesible por JS).
- (+) Mecanismo único y claro por tipo de cliente (cookie web / Bearer móvil).
- (−) Requiere configurar CORS con `credentials`, cookie cross-site (`SameSite=None; Secure` en
  prod) y el flujo CSRF double-submit. Variables: `COOKIE_DOMAIN`, `COOKIE_SAMESITE`, `CSRF_SECRET`
  (ver `.env.example`).
- Afecta a: `apps/frontend/CLAUDE.md` (apiClient), `docs/api-contract.md` §2, y el feature de auth
  `AUTH-01`.
