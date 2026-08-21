# HU-KB-08 — Plan técnico (CÓMO)

> Un archivo nuevo con la declaración del schema y tres líneas aditivas en el registry. Toda la
> maquinaria la puso HU-KB-07 y se consume sin tocarla.

## Archivos a crear / tocar

```
apps/frontend/src/features/knowledge-base/
├── lib/schemas/empresa.schema.ts          # NUEVO  — EMPRESA_SCHEMA (3 secciones, 13 campos)
├── lib/schemas/empresa.schema.test.ts     # NUEVO  — ids congelados, requisitos, condicional, tope
├── lib/kb-schemas.ts                      # TOCAR  — 3 añadidos aditivos (unión + KB_SCHEMAS + registry)
├── lib/kb-schemas.test.ts                 # TOCAR  — el registry resuelve el título nuevo
├── lib/kb-serialize.ts                    # TOCAR  — SOLO comentario: la migración ya no es HU-KB-08
├── components/fields/PolicyTriState.tsx   # TOCAR  — SOLO comentario: HU-KB-10 → HU-KB-11
├── components/fields/ScheduleDayEditor.tsx# TOCAR  — SOLO comentario: HU-KB-09 → HU-KB-10
└── pages/KnowledgeBasePage.test.tsx       # TOCAR  — integración de los dos modos en esta categoría
```

**No se tocan:** `apps/backend/**` (entero), `KnowledgeStructuredForm.tsx`,
`KnowledgeUploadEditor.tsx`, `KnowledgeDocumentDialog.tsx`, `kb-presets.ts`, `KnowledgeCard.tsx`,
`KnowledgeGrid.tsx`, `KnowledgeToolbar.tsx`, `KnowledgeBasePage.tsx` ni el **código** de
`kb-serialize.ts` y los primitivos de `components/fields/` — en esos tres archivos solo cambian
comentarios que apuntaban a la HU equivocada.

> **Por qué el schema va en su propio archivo.** Con las cuatro HUs cerradas, `kb-schemas.ts`
> tendría ~600 líneas de declaraciones de campo enterrando el contrato. Un archivo por categoría en
> `lib/schemas/` mantiene `kb-schemas.ts` como lo que es: el contrato y sus utilidades.
>
> `empresa.schema.ts` importa `KbSchemaDef` **con `import type`**, que TypeScript borra al compilar;
> `kb-schemas.ts` importa `EMPRESA_SCHEMA` como valor. No hay ciclo en tiempo de ejecución. Si al
> llegar HU-KB-11 esto incomoda, la salida limpia es mover los tipos a `kb-schema-types.ts` — no
> hace falta ahora.

---

## Contrato — `lib/schemas/empresa.schema.ts`

```ts
import type { KbSchemaDef } from '../kb-schemas.js';   // solo tipo: sin ciclo en runtime

export const EMPRESA_SCHEMA: KbSchemaDef = { id: 'empresa', version: 1, secciones: [ … ] };
```

### Los 13 campos

| # | Sección | `id` (congelado) | Etiqueta | `kind` | Requisito | Tope |
|---|---|---|---|---|---|---|
| 1 | `identidad` | `nombre_comercial` | Nombre comercial | `texto-corto` | **obligatorio** | 120 |
| 2 | `identidad` | `razon_social` | Razón social | `texto-corto` | opcional | 120 |
| 3 | `identidad` | `descripcion` | ¿A qué se dedica? | `texto-largo` | **obligatorio** | 1.500 |
| 4 | `identidad` | `anio_fundacion` | Año de fundación | `texto-corto` | opcional | 30 |
| 5 | `proposito` | `mision` | Misión | `texto-medio` | opcional | 300 |
| 6 | `proposito` | `vision` | Visión | `texto-medio` | opcional | 300 |
| 7 | `proposito` | `valores` | Valores | `lista` | opcional | 120 × 6 |
| 8 | `alcance` | `clientes_objetivo` | ¿A quién le sirve? | `texto-medio` | opcional | 300 |
| 9 | `alcance` | `zonas_cobertura` | Zonas donde atiende | `lista` | opcional | 120 × 12 |
| 10 | `alcance` | `diferenciadores` | Qué lo hace distinto | `lista` | opcional | 120 × 6 |
| 11 | `alcance` | `parte_de_grupo` | ¿Hace parte de un grupo o casa matriz? | `triestado` | opcional | 300 |
| 12 | `alcance` | `grupo_empresarial` | Nombre del grupo | `texto-corto` | **condicional** | 120 |
| 13 | `alcance` | `certificaciones` | Certificaciones o afiliaciones | `lista` | opcional | 120 × 6 |

### Secciones

```ts
{ id: 'identidad',  titulo: 'Identidad',            descripcion: 'Cómo se llama y a qué se dedica' }
{ id: 'proposito',  titulo: 'Propósito y valores',  descripcion: 'Lo que mueve al negocio' }
{ id: 'alcance',    titulo: 'Alcance y respaldo',   descripcion: 'A quién le sirve y qué lo respalda' }
```

### El único condicional

```ts
{
  id: 'grupo_empresarial',
  etiqueta: 'Nombre del grupo',
  kind: 'texto-corto',
  requisito: 'condicional',
  visibleSi: (campos) => {
    const v = campos.parte_de_grupo;
    return v?.tipo === 'triestado' && v.valor === 'si';
  },
}
```

> **Por qué este y no otro.** Es un condicional **real**, no un pretexto para ejercitar el
> primitivo: muchos negocios locales son sucursal o franquicia de una marca mayor, los clientes lo
> preguntan, y el nombre del grupo solo tiene sentido si la respuesta es «Sí». El tri-estado gana su
> tercer valor porque «No aplica» (soy independiente, la pregunta no me describe) y «No» (pertenecí
> y ya no / no tengo casa matriz) no son lo mismo para quien redacta una respuesta.
>
> Al ocultarse, `camposFaltantes` deja de exigirlo y `serializeEstructura` deja de emitirlo — las
> dos reglas ya están implementadas y probadas en HU-KB-07; aquí solo se consumen.

### Justificación de los dos obligatorios

`nombre_comercial` y `descripcion` son el mínimo con el que la IA puede sostener una conversación:
sin el primero no sabe **cómo llamarse**, sin el segundo no sabe **qué vende**. Todo lo demás mejora
la respuesta pero no la habilita, y esta categoría es la única `obligatorio: true` de las cinco —
bloquear el guardado por un campo prescindible dejaría al admin sin poder cerrar la tarjeta que el
sistema le exige completar.

`anio_fundacion` se acota a **30 caracteres** en vez de los 120 del `kind` porque un año no es una
biografía; el tope estrecho es la única señal de formato disponible (el contrato no tiene `kind`
numérico ni de fecha — ver pregunta abierta 5).

### Campos deliberadamente NO incluidos

| Campo | Por qué no | Dónde va |
|---|---|---|
| Tono de voz de la IA | Configuración del prompt, no conocimiento recuperable | `HT-AI-01` |
| Dirección, sedes, mapa | Es ubicación | HU-KB-10 |
| Teléfono, WhatsApp, correo, redes | Son canales de contacto | HU-KB-10 |
| Horario de atención | Es agenda | HU-KB-10 |
| Catálogo, precios, planes | Es oferta | HU-KB-09 |
| Devoluciones, garantías, envíos | Son políticas | HU-KB-11 |

> **Frontera pactada con HU-KB-10.** `zonas_cobertura` se queda en empresa: describe el **alcance**
> del negocio (dónde vende y despacha), no su dirección física. El spec de HU-KB-10 deberá declarar
> explícitamente «zonas de cobertura/despacho → HU-KB-08» dentro de su *fuera de alcance*, para que
> ninguna de las dos lo duplique. Moverlo más tarde es caro: el `id` queda congelado en cuanto un
> tenant guarda.

---

## Contrato — `lib/kb-schemas.ts` (tres añadidos aditivos)

```ts
export type KbSchemaId = 'generico' | 'empresa';          // 1. amplía la unión

export const KB_SCHEMAS: Readonly<Record<KbSchemaId, KbSchemaDef>> = {
  generico: GENERICO,
  empresa: EMPRESA_SCHEMA,                                 // 2. registra el schema
};

const SCHEMA_POR_TITULO: Readonly<Record<string, KbSchemaId>> = {
  [normalizeTitulo('Información Complementaria')]: 'generico',
  [normalizeTitulo('Información de la empresa')]: 'empresa', // 3. registra el título
};
```

Eso es **todo** el cableado. `modoEditor`, `schemaDeDocumento`, `camposFaltantes`,
`serializeEstructura` y `KnowledgeStructuredForm` empiezan a trabajar sobre la categoría nueva sin
una línea más. Que el cambio sea de tres líneas es la prueba de que el contrato de HU-KB-07 quedó
bien: **si hace falta más, hay que revisar el contrato, no parchear esta HU**.

---

## Presupuesto de caracteres (criterio 6)

El formulario no puede permitir un estado que el backend rechace con 400. Peor caso, todos los
campos al tope:

| Bloque | Cálculo | Caracteres |
|---|---|---|
| `identidad` | 120 + 120 + 1.500 + 30 | 1.770 |
| `proposito` | 300 + 300 + (120 × 6) | 1.320 |
| `alcance` | 300 + (120 × 12) + (120 × 6) + 300 + 120 + (120 × 6) | 3.600 |
| Etiquetas, encabezados y guiones | ~35 líneas de sobrecarga | ~700 |
| `adicional` | tope de `texto-largo` | 1.500 |
| **Total** | | **≈ 8.890** |

Margen sobre `CONTENIDO_MAX` (10.000): **≈ 1.110**. Suficiente, y por eso el test del
criterio 6 lo mide de verdad en vez de confiar en esta tabla. Dos consecuencias para HU-KB-09/10/11:
el presupuesto por categoría es real y ninguna puede repartir topes sin sumar; y si una futura
ampliación de `empresa` no cupiera, la salida es recortar topes por campo, **no** subir
`CONTENIDO_MAX` (subirlo multiplica los fragmentos y diluye el top-5 de `KB_RETRIEVAL_K`).

---

## Forma del texto serializado

Con `nombre_comercial`, `descripcion`, dos valores y el grupo respondido:

```
## Identidad
Nombre comercial: Acme S.A.S.
¿A qué se dedica?: Distribuimos insumos de panadería a tiendas de barrio en Bogotá.

## Propósito y valores
Valores:
- Cumplimiento
- Cercanía

## Alcance y respaldo
¿Hace parte de un grupo o casa matriz?: Sí
Nombre del grupo: Grupo Panadero Nacional

## Información adicional
Cerramos la última semana de diciembre.
```

Las secciones sin nada que decir no aparecen — lo garantiza `serializeEstructura`, ya probado en
HU-KB-07.

---

## Notas

- **Esta HU no debería tocar ningún componente.** Si durante la implementación aparece la tentación
  de modificar `KnowledgeStructuredForm` o un primitivo, es una señal: significa que el contrato de
  HU-KB-07 no cubre algo que empresa necesita. Eso se levanta como hallazgo y se decide, no se
  parchea aquí. Las dos ediciones previstas en componentes son **comentarios** de numeración de HU.
- **Los `id` son para siempre.** `nombre_comercial` no puede pasar a `nombre` ni aunque quede más
  bonito: el dato guardado por los tenants quedaría huérfano y se serializaría bajo «Otros datos».
  Para cambiar lo que se lee en pantalla está `etiqueta`, que sí es libre.
- **`version: 1` y cuándo subirla.** Añadir un campo opcional o retocar una etiqueta **no** sube la
  versión. La suben los cambios incompatibles: cambiar el `kind` de un campo existente, retirar un
  campo, o convertir un opcional en obligatorio. HU-KB-07 dejó el comportamiento defensivo para
  todos esos casos (el valor viejo se conserva y se serializa igual), así que subir `version` es
  documentación del cambio, no un mecanismo de migración.
- **La categoría es `obligatorio: true`**, así que no se puede eliminar y el botón Eliminar no
  aparece en su modal. Con dos campos obligatorios, un admin que abra la tarjeta vacía no podrá
  guardar hasta completarlos — puede cancelar, y la tarjeta seguirá en estado «falta». Es el
  comportamiento buscado, pero conviene tenerlo presente: antes podía escribir cualquier cosa y
  cerrar.
- **Deuda ya saldada:** el *drift* de `proposito` de «Información Complementaria» entre backend y
  frontend, arrastrado desde HU-KB-05, quedó **resuelto en `f2736a7`**. Ambos dicen hoy `'Datos
  adicionales de referencia para la IA'`. No hay nada que hacer aquí.
- **Complejidad: media.** El código es pequeño y aditivo; lo que cuesta es el **diseño de los
  campos**, que queda congelado para siempre y que las tres HUs siguientes van a tomar como
  referencia de estilo.

## Verificación

- `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`).
- `pnpm --filter @sofiapp/web lint` (`--max-warnings 0`).
- `pnpm --filter @sofiapp/web test`.
- `git diff --stat -- apps/backend` → vacío (criterio 14).
- `git diff --stat -- apps/frontend/src/features/knowledge-base/components/KnowledgeStructuredForm.tsx` → vacío (criterio 15).
- `git diff -U0 -- apps/frontend/src/features/knowledge-base/lib/kb-serialize.ts apps/frontend/src/features/knowledge-base/components/fields` → solo líneas de comentario (criterio 15).
- `grep -rn "bg-\[#" apps/frontend/src/features/knowledge-base` → sin resultados.

> **Filtros de pnpm.** Los paquetes son `@sofiapp/web` y `@sofiapp/api`, no `frontend`/`backend`
> (el `CLAUDE.md` raíz conserva los nombres viejos). Esta HU no ejecuta los del backend porque no lo
> toca.
