# HT-WA-02 — Plan técnico (CÓMO)

> El QUÉ está en `spec.md`; la ejecución en `tasks.md`. No redefine reglas: el aislamiento se rige
> por `docs/multi-tenancy.md` (el webhook es su excepción documentada) y el patrón de feature por
> `apps/backend/CLAUDE.md`.
>
> **Rama:** `feat/HU-IA-01` (la actual). No se crea rama nueva.

## Estado base verificado (antes de planear)

Los paquetes son **`@sofiapp/api`** y **`@sofiapp/web`** (`--filter backend` no matchea nada).

| Comando | Resultado |
|---|---|
| `pnpm --filter @sofiapp/api typecheck` | ✅ verde |
| `pnpm --filter @sofiapp/api test` | ✅ verde — **87 archivos, 904 tests** |

Es decir: la suite entera pasa **con el webhook roto**. Esa es la medida del hueco de cobertura que
esta corrección viene a tapar.

## Decisión: mover el montaje sobre `express.json()`

| Opción | Veredicto |
|---|---|
| **A. Montar el webhook antes de `express.json()`** | ✅ **Elegida.** Un movimiento de línea. La cadena del webhook queda **intacta**: `webhook.routes.ts` ya declara su propio `express.raw`, y el bug era solo que un parser global se le adelantaba. Cero coste por petición, cero tipos nuevos, cero superficie nueva |
| B. Parser `raw` a nivel de app solo para esa ruta | Mismo efecto que A, pero con un closure y una condición de path que duplican lo que el router ya sabe. Más código para el mismo resultado, y dos sitios que mantener sincronizados |
| C. `express.json({ verify })` guardando el buffer en `req.rawBody` | El patrón canónico de Stripe/Meta y el más robusto al orden, pero copia un `Buffer` en **cada** petición de toda la API y obliga a aumentar el tipo `Request` de Express. Desproporcionado para servir a una sola ruta |

**Sobre la fragilidad de A.** El riesgo real es que alguien vuelva a colar una ruta o un parser por
encima y reintroduzca el bug sin notarlo. La defensa duradera no es el comentario: es el test de
regresión HTTP, que falla en el acto si el orden se rompe. El comentario explica el porqué; el test
lo hace cumplir.

## Archivos a tocar

```
apps/backend/src/
├── app.ts                                  # TOCAR — mover el montaje del webhook sobre express.json()
├── config/env.ts  (o el arranque de app.ts) # TOCAR — aviso si falta META_APP_SECRET
└── features/webhook/
    ├── webhook.routes.ts                   # TOCAR — el catch responde y usa logger
    ├── webhook.controller.ts               # TOCAR — guarda de Buffer, adiós al `as Buffer`
    ├── webhook.service.ts                  # TOCAR — el createHmac entra en el try
    └── webhook.routes.test.ts              # NUEVO — regresión a nivel HTTP
```

**No se tocan:** `webhook.types.ts`, `resolveWebhookTenant`, `enqueueInboundJob`, el
`inbound-message.processor`, `worker.ts`, ni nada del outbound.

## Contratos

### `app.ts` — el orden

Hoy:

```ts
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));   // 42
app.use(express.json());                                        // 43  ← se come el cuerpo
app.use(cookieParser());                                        // 44
app.use(csrfGuard);                                             // 45
…
app.use('/api/webhooks/whatsapp', webhookRoutes);               // 64  ← demasiado tarde
```

Queda:

```ts
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));

// ANTES de express.json() y no con el resto de rutas: Meta firma el cuerpo con HMAC y la firma
// solo se puede validar sobre los BYTES EXACTOS que envió. Un parser global por delante consume el
// stream, deja `req.body` como objeto, y el `express.raw` del router ya no puede hacer nada — que
// es justo el bug de HT-WA-02. Ninguna ruta ni parser debe colarse por encima de esta línea.
// `csrfGuard` ya exime `/api/webhooks/` y el webhook no usa cookies, así que no pierde nada por ir
// delante de ellos.
app.use('/api/webhooks/whatsapp', webhookRoutes);

app.use(express.json());
app.use(cookieParser());
app.use(csrfGuard);
```

Se elimina el montaje de la línea 64. El resto del archivo no cambia.

### `webhook.service.ts` — que el HMAC no propague

El `try` pasa a cubrir también el `createHmac`, que es lo que hoy se escapa:

```ts
export function validateHmacSignature(rawBody: Buffer, signature: string): boolean {
  if (!env.META_APP_SECRET) return false;
  try {
    const expected = `sha256=${createHmac('sha256', env.META_APP_SECRET).update(rawBody).digest('hex')}`;
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    // Un cuerpo que no es Buffer, o una firma con bytes raros: no es una firma válida, y desde
    // aquí no se lanza. La alternativa —dejarlo propagar— es lo que dejó a Meta sin respuesta.
    return false;
  }
}
```

Firma y contrato sin cambios; solo deja de tener un camino que lanza.

### `webhook.controller.ts` — guarda antes del HMAC

Sustituye el `as Buffer` por una comprobación real:

```ts
export const receiveController = async (req: Request, res: Response): Promise<void> => {
  // Si esto no es un Buffer, algún parser global se adelantó al express.raw del router y el cuerpo
  // crudo se perdió: sin él la firma de Meta no se puede validar. Es la huella exacta de HT-WA-02.
  if (!Buffer.isBuffer(req.body)) {
    logger.error('Webhook recibido con el cuerpo ya parseado: revisa el orden de middlewares en app.ts');
    res.status(403).json({ message: 'Firma inválida.' });
    return;
  }
  const rawBody: Buffer = req.body;
  …
};
```

El mismo `403` y el mismo cuerpo que una firma inválida: hacia fuera no se distingue —no se le
cuenta a un tercero por qué se le rechaza—, y hacia dentro el log lo dice todo.

El resto del controller **no cambia**: `res.sendStatus(200)` sigue antes del trabajo pesado, y el
bucle `entry → changes → resolveWebhookTenant → enqueueInboundJob` queda igual.

### `webhook.routes.ts` — que siempre haya respuesta

```ts
router.post('/', express.raw({ type: 'application/json' }), (req, res) => {
  receiveController(req, res).catch((err: unknown) => {
    logger.error('Webhook receive error', { error: String(err) });
    // El controller responde 200 y SIGUE trabajando, así que un fallo posterior no debe intentar
    // responder otra vez. Pero si reventó antes de contestar, Meta no puede quedarse esperando:
    // una petición colgada dispara la tormenta de reintentos y no deja rastro.
    if (!res.headersSent) res.status(500).json({ message: 'Error interno del servidor.' });
  });
});
```

**No se usa `asyncHandler`** a propósito, aunque sea el patrón del repo: `asyncHandler` delega en el
`errorHandler` central, que responde siempre — y aquí el controller ya respondió `200` antes de
seguir trabajando, así que intentaría responder dos veces. Este `.catch` es la forma correcta para
un handler que contesta pronto y sigue después.

### Aviso por `META_APP_SECRET` ausente

Al arrancar el proceso web, si `env.META_APP_SECRET` no está definida, un `logger.warn` que diga en
una línea que el webhook de WhatsApp rechazará (`403`) todo evento entrante y que el inbound no
funcionará. Va en el arranque del proceso web (`app.ts`), no en `config/env.ts`: el módulo de env
valida forma y no opina sobre consecuencias, y el worker no atiende el webhook.

La variable **sigue siendo `optional()`**: hacerla obligatoria rompería el arranque de cualquier
despliegue que no use WhatsApp, y eso es peor que el problema que resuelve.

## Tests — `webhook.routes.test.ts` (NUEVO)

Patrón de `kb-faq.routes.test.ts:1-45`: `vi.mock` de `../../config/queues.js` con
`inboundQueue: { add: vi.fn() }` **antes** de importar `app`, y supertest sobre `app`. Las envs
`META_APP_SECRET` (`test-app-secret-12345678901234`) y `META_VERIFY_TOKEN` (`test-verify-token`) ya
vienen de `vitest.config.ts`. `MetaIntegration` se siembra con `mongodb-memory-server`, que ya monta
`tests/globalSetup.ts`.

**El detalle que decide si el test sirve:** la firma se calcula sobre **exactamente los mismos bytes
que se envían**. Se serializa el payload una vez a un `string`, se firma ese `string`, y se manda
con `.set('Content-Type', 'application/json')` y `.send(elMismoString)`. Si se deja que supertest
serialice el objeto por su cuenta, los bytes pueden no coincidir con los firmados y el test pasaría
o fallaría por el motivo equivocado.

| # | Caso | Espera |
|---|---|---|
| 1 | **Regresión:** `Content-Type: application/json` + firma correcta | `200` y `inboundQueue.add('process', { tenantId, payload })` con el tenant del `phone_number_id`. **Contra el código de hoy este test falla** (petición colgada) |
| 2 | Firma incorrecta | `403` y `inboundQueue.add` sin llamar |
| 3 | Sin cabecera `X-Hub-Signature-256` | `403`, sin colgarse |
| 4 | `phone_number_id` sin `MetaIntegration` | `200` (Meta no debe reintentar) y nada encolado |
| 5 | **Aislamiento:** integraciones de dos tenants | El job lleva el `tenantId` del `phone_number_id` recibido, nunca el del otro |
| 6 | `GET` con `hub.verify_token` correcto | `200` con el `hub.challenge` en el cuerpo |
| 7 | `GET` con token incorrecto | `403` |

**Sin cambios, debe seguir verde:** `tests/unit/webhook.service.test.ts` completo — el caso de firma
correcta con un `Buffer` sigue valiendo, y el nuevo `try` no lo altera.

## Notas

- **La suite pasa hoy con el webhook roto.** No es un descuido de quien escribió `HT-WA-01`: el test
  unitario prueba la función correcta, con el tipo correcto. El bug vive en el montaje, y ningún
  test tocaba el montaje. De ahí que el test nuevo sea a nivel HTTP y no otro unitario.
- **El `as Buffer` era el único sostén del camino roto.** Sin él, `tsc` habría señalado que
  `req.body` (tipado `any` por Express) no garantiza un `Buffer`. Quitarlo cierra la puerta por la
  que entró el bug.
- **Esto no arregla por sí solo el reporte si falta `META_APP_SECRET`.** Son dos causas
  independientes con el mismo síntoma; el aviso al arrancar hace visible la segunda, pero
  configurarla es un paso de despliegue, no de código.
- **El worker tiene que estar corriendo.** `worker.ts:15` registra el `inboundWorker` sobre
  `INBOUND_QUEUE_NAME`. Con el webhook arreglado y el worker caído, los jobs se acumulan en Redis y
  el síntoma visible del usuario no cambia.

## Verificación

```bash
pnpm --filter @sofiapp/api typecheck
pnpm --filter @sofiapp/api test          # base a superar: 87 archivos / 904 tests
```

Y arrancar `app.ts` para confirmar cero errores en consola (se toca el orden de middlewares).

**End-to-end, que es lo que de verdad cierra el reporte:**

1. Confirmar `META_APP_SECRET` en el `.env` del droplet, y que coincide con el App Secret de la app
   de Meta.
2. Reiniciar proceso web **y** worker.
3. Responder por WhatsApp desde el teléfono y seguir la traza: `200` en el log del webhook → job en
   `inbound-messages` → mensaje en la bandeja → respuesta de la IA.
