# HU-KB-13 — Detección de títulos parecidos al crear conocimiento (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué; la ejecución está en `tasks.md`. **No hay
> `plan.md`**: el CÓMO (normalización NFD, Levenshtein propio, umbrales y copy) llegó ya cerrado por
> el usuario en el enunciado de la HU, y un plan aparte solo lo habría repetido.
>
> HU **enteramente frontend**: no toca un solo archivo de `apps/backend`, ni siquiera el espejo de
> tipos.

**Estado:** implementado

## Historia

Como **admin** de un tenant, quiero que al crear un conocimiento la app me avise cuando el título
que estoy escribiendo se parece mucho a uno que ya existe, para no partir en dos —por un typo o una
palabra de más— lo que la IA debería leer junto, pero sin que la app decida por mí cuando de verdad
son dos cosas distintas.

## Contexto: por qué la igualdad exacta no alcanza

`isTitleTaken` compara títulos tras `normalizeTitulo`, que hasta ahora solo hacía `trim` +
`toLocaleLowerCase('es')`. Eso frena las variantes por mayúsculas y espacios, y nada más:

| El admin escribe | Ya existe | Hoy |
|---|---|---|
| `convenios CON empresas` | `Convenios con empresas` | bloqueado ✔ |
| `Politicas y terminos` | `Políticas y términos` | **pasa** ✘ |
| `Horarios y la ubicación` | `Horarios y ubicación` | **pasa** ✘ |

Las dos últimas filas son el problema real, y son de naturaleza distinta:

- **La tilde no es una decisión**, es una tecla que no se pulsó. «Politicas» y «Políticas» son la
  misma palabra y no hay caso en que el admin quiera dos categorías que difieran solo en eso.
- **El artículo de más sí puede ser una decisión.** «Horarios y la ubicación» es casi seguro el
  mismo concepto que el preset, pero «Políticas de envío» junto a «Políticas de pago» —a 4
  ediciones— son dos categorías legítimas. Aquí la app no tiene forma de saberlo, y el admin sí.

De ahí las **dos respuestas distintas** de esta HU: la primera se resuelve normalizando (pasa a ser
un duplicado exacto y se bloquea como cualquier otro), la segunda se avisa y se deja pasar.

**El frontend es la única defensa.** El backend no rechaza duplicados: `createDocument`
(`kb.service.ts`) busca con `findOneScoped({ titulo })` —igualdad byte a byte— y, si encuentra,
**re-versiona en silencio** el documento existente. Si el título no coincide exactamente, nace un
documento nuevo. Nadie más va a mirar esto.

## Objetivo técnico

Dos funciones puras en `kb-presets.ts` que se reparten el trabajo, y un solo aviso nuevo en el
modal:

| | Qué decide | Cómo se ve | ¿Bloquea? |
|---|---|---|---|
| `isTitleTaken` (existente) | el título ya está tomado | error rojo, inmediato | **sí** |
| `findSimilarTitle` (nueva) | hay uno muy parecido | aviso ámbar, al salir del campo | **no** |

Que la segunda no bloquee no es una concesión: es el criterio entero de la HU. La UI señala lo que
ve y se aparta.

## Criterios de aceptación

### Normalización

1. `normalizeTitulo` descompone en **NFD** y borra el rango de diacríticos combinantes
   (`U+0300`–`U+036F`) antes de bajar a minúsculas. `normalizeTitulo('Politicas')` y
   `normalizeTitulo('Políticas')` devuelven la misma cadena.
2. Como consecuencia directa, **`isTitleTaken` bloquea los títulos sin tilde** de una categoría que
   sí la lleva: «Politicas y terminos» y «Informacion de la empresa» pasan a estar reservados.
3. Los otros tres consumidores de `normalizeTitulo` normalizan **ambos lados** de la comparación, así
   que el cambio no los rompe y a uno de ellos lo mejora:
   - `esPresetProtegido` — sin cambio de comportamiento observable.
   - `schemaParaTitulo` (`kb-schemas.ts`) — las claves de `SCHEMA_POR_TITULO` se computan con la
     misma función que la búsqueda; sin cambio observable.
   - `filterKbGrid` — el buscador de la grilla pasa a ser **insensible a tildes**: escribir
     «ubicacion» encuentra «Horarios y ubicación». Mejora gratis, no era el objetivo.

### Distancia y umbrales

4. `levenshtein` es una **función local pura**, de dos filas rodantes, sin dependencias nuevas. Los
   títulos topan en 200 caracteres y un tenant tiene decenas de documentos: el coste es irrelevante
   y una dependencia por esto no se paga.
5. El umbral tolerado depende de la longitud del **más corto** de los dos títulos ya normalizados:

   | Longitud del más corto | Distancia | Acción |
   |---|---|---|
   | cualquiera | `0` | **bloquear** (es un duplicado exacto) |
   | ≤ 20 | ≤ 3 | **sugerir** |
   | > 20 | ≤ 5 | **sugerir** |
   | — | mayor | permitir, sin fricción alguna |

   Escala con la longitud porque tres ediciones sobre 8 caracteres ya son otro concepto, mientras que
   sobre 30 son un artículo de más y una tilde.
6. `findSimilarTitle` devuelve **un solo** título —el de menor distancia, no el primero que encaje— y
   lo devuelve **con sus mayúsculas y tildes originales**: es el que se le muestra al admin.
7. Devuelve `undefined` ante una coincidencia **exacta**: ese caso ya lo cubre `isTitleTaken`, y
   pintar el error y la sugerencia a la vez sería decir dos veces lo mismo con distinto color.
8. Devuelve `undefined` con el título vacío, y no considera candidato ningún título que supere su
   umbral.
9. Los candidatos son los 5 títulos de `PRESET_META` más los documentos del tenant. Los presets
   cuentan aunque sigan siendo **virtuales**: al llenarlos nacerán con ese título.
10. **Los documentos `oculto` NO son candidatos a sugerencia**, al revés que en `isTitleTaken`. Allí
    cuentan porque el índice único del backend no se libera al soft-delete y el guardado fallaría
    igual; aquí el copy invita a «abrir su tarjeta» y un documento oculto no tiene tarjeta
    (`buildKbGrid` lo descarta). Señalar algo inalcanzable es peor que callarse, y como el aviso no
    bloquea, callarse no cuesta nada.

### UX del modal

11. El aviso aparece **al salir del campo de título** (`onBlur`), no en cada tecla. Mientras se
    teclea, un título a medio escribir se parece a uno existente por pura casualidad
    («Informacion de la empres» está a dos ediciones del preset) y avisar ahí sería corregir al
    admin antes de que termine la frase. El error rojo de duplicado exacto **sí sigue siendo
    inmediato**: eso no es una opinión, es un hecho.
12. Volver a escribir **retira** el aviso hasta que el admin salga del campo otra vez. Un aviso que
    se queda mientras se corrige lo que señala es un aviso que estorba.
13. El copy es: *«¿Quisiste decir «{titulo}»? Ya existe un conocimiento con un título muy parecido.
    Si es el mismo, ábrelo desde su tarjeta para editarlo.»* Nombra el título candidato entre
    guillemets, igual que el resto del modal, y termina en la acción concreta que resuelve el caso.
14. **El botón «Guardar e indexar» no se desactiva** con una sugerencia activa, y `handleSubmit` no
    la mira. `tituloSimilar` no entra en `puedeGuardar` ni en `tituloListo`.
15. El aviso es ámbar con texto `text-muted-foreground`; el error de duplicado sigue siendo rojo con
    `text-destructive`. Comparten la forma de la caja pero no el peso: el color del **texto** es lo
    que separa «esto es un error» de «esto es una observación». Va debajo del input y encima del
    error rojo, y entra con `motion-safe:animate-in fade-in slide-in-from-top-1`, el mismo idioma de
    aparición que `ConditionalReveal` en este feature.
16. Accesibilidad: el aviso vive dentro de una región `role="status"` **que se monta siempre, aunque
    esté vacía**. Una región viva que aparece a la vez que su contenido no se anuncia de forma
    fiable, porque el lector de pantalla no la estaba observando; y hace falta precisamente aquí
    porque la sugerencia sale cuando el foco ya se fue del input y su `aria-describedby` no lo está
    leyendo nadie. `aria-invalid` **sigue atado solo al duplicado exacto**: una sugerencia no es un
    error. `aria-describedby` apunta al error si lo hay, si no a la sugerencia.
17. Solo aplica al **crear libre** (`tituloEditable`). Al editar un documento o llenar un preset, el
    título ya está fijado y no se toca.

### Transversales

18. Sin lógica nueva de servidor y **sin superficie multi-tenant nueva**: el diff no contiene un solo
    archivo de `apps/backend`. Por eso esta HU no lleva test de aislamiento propio.
19. Se invocó `frontend-design:frontend-design` **antes** de escribir el componente (regla §7 del
    `CLAUDE.md` raíz). `emil-design-eng` e `impeccable:impeccable` **siguen sin estar registradas en
    este entorno**, igual que en HU-KB-08…12; sus criterios se aplicaron de memoria y quedan
    pendientes de verificación cuando estén disponibles.
20. El aviso queda terminado en **light y dark** con la paleta ámbar de Tailwind —la misma que ya usa
    `cardBorder` para el estado «falta»—, cero color arbitrario.
21. `pnpm --filter @sofiapp/web test`, `build` (incluye `tsc --noEmit`) y `lint` (`--max-warnings 0`)
    en verde, con la única excepción declarada de `TagSelector.test.tsx` (fallos preexistentes y
    ajenos, ya declarados en HU-KB-12).

## Riesgo aceptado

Con títulos cortos, tolerar 3 ediciones genera falsos positivos: «Sedes» y «Redes» distan 1. Es
deliberado. El aviso **no bloquea**, así que un falso positivo cuesta una línea de texto que el
admin ignora, mientras que un falso negativo deja nacer una categoría duplicada que fragmenta lo que
la IA lee. Si en uso real molestara, la palanca es una longitud mínima antes de sugerir; no se pone
ahora porque no hay evidencia de que haga falta.

## Archivos tocados

| Archivo | Qué cambia |
|---|---|
| `apps/frontend/src/features/knowledge-base/lib/kb-presets.ts` | `normalizeTitulo` con NFD; bloque nuevo `umbralSimilitud` + `levenshtein` + `findSimilarTitle` |
| `apps/frontend/src/features/knowledge-base/components/KnowledgeUploadEditor.tsx` | estado `tituloVisitado`, derivados `tituloSimilar` / `tituloDescritoPor`, aviso ámbar |
| `apps/frontend/src/features/knowledge-base/lib/kb-presets.test.ts` | aserción de `normalizeTitulo` actualizada; `describe` nuevo de `findSimilarTitle` |
| `apps/frontend/src/features/knowledge-base/pages/KnowledgeBasePage.test.tsx` | `describe` nuevo de la sugerencia + caso del título sin tildes |

## Dependencias

Depende de **HU-KB-05** (`isTitleTaken`, `normalizeTitulo`, `buildKbGrid`) y de **HU-KB-12**
(`esPresetProtegido`, que comparte la comparación normalizada). No bloquea a nada.

**Rama:** se trabaja y se commitea sobre **`feat/HU-KB-05`**, igual que HU-KB-06…12. **No** se crea
`feat/HU-KB-13` — instrucción explícita del usuario.

## Definición de "hecho"

El admin abre «Agregar nuevo conocimiento» y escribe «Horarios y la ubicación». Al pasar al
contenido, debajo del título aparece un aviso ámbar que le pregunta si quiso decir «Horarios y
ubicación» y le dice dónde encontrarlo. Si era eso, cierra y abre la tarjeta; si no lo era, sigue
escribiendo y guarda sin que nada se lo impida. Si en cambio escribe «Politicas y terminos», el
aviso no llega a aparecer: el error rojo de siempre le dice que ese conocimiento ya existe y el
botón se apaga, porque la falta de una tilde nunca fue una categoría nueva.
