# HU-KB-08 — Formulario guiado de «Información de la empresa» (spec)

> **Spec-Driven Development.** Este es el QUÉ y el porqué. El CÓMO va en `plan.md`; la ejecución
> en `tasks.md`. HU **100 % frontend**: es la primera que consume la infraestructura de HU-KB-07 y
> la primera de las cuatro que dan forma a una categoría concreta.

**Estado:** implementado

## Historia

Como **admin** de un tenant, quiero que la tarjeta «Información de la empresa» me abra un
**formulario con campos** en vez de un textarea en blanco, para saber exactamente qué necesita la IA
sobre mi negocio y no tener que adivinar qué escribir ni con qué formato.

## Contexto: dónde estamos

HU-KB-07 dejó toda la infraestructura y la probó con un piloto (`generico` para «Información
Complementaria»). Las otras cuatro categorías siguen abriendo en modo legado porque **sus títulos no
están registrados** en `SCHEMA_POR_TITULO`. Esta HU registra el primero.

| Categoría | Preset | HU que le da forma |
|---|---|---|
| **Información de la empresa** | obligatorio | **HU-KB-08 (esta)** |
| Productos y servicios | obligatorio | HU-KB-09 |
| Horarios y ubicación | opcional | HU-KB-10 |
| Políticas y términos | opcional | HU-KB-11 |
| Información Complementaria | opcional | ya hecha (HU-KB-07, schema `generico`) |

> **Corrección de numeración.** Los comentarios de HU-KB-07 en `PolicyTriState.tsx` y
> `ScheduleDayEditor.tsx` dicen «lo monta HU-KB-10» y «lo monta HU-KB-09» respectivamente,
> asumiendo un reparto distinto del que se fijó después. Con el reparto de la tabla de arriba,
> `ScheduleDayEditor` lo monta **HU-KB-10** y `PolicyTriState` lo monta **HU-KB-11**. Esta HU
> corrige esos dos comentarios, que si no envían a la HU equivocada.

## Objetivo técnico

Declarar el schema `empresa` y registrar su título. Nada más. Toda la maquinaria —render por
`kind`, contadores, condicionales, acordeón, «Información adicional», serialización, guardado,
versionado— ya existe y **no se toca**: si esta HU necesitara modificar `KnowledgeStructuredForm`,
`kb-serialize.ts` o los primitivos de `components/fields/`, sería señal de que el contrato de
HU-KB-07 quedó corto, y eso se discute antes de parchearlo.

## Alcance

### Incluye

- `lib/schemas/empresa.schema.ts` **(nuevo)** — la definición `EMPRESA_SCHEMA` (3 secciones,
  13 campos).
- `lib/kb-schemas.ts` — tres añadidos **puramente aditivos**: `'empresa'` en la unión `KbSchemaId`,
  la entrada en `KB_SCHEMAS` y la entrada en `SCHEMA_POR_TITULO`.
- Corrección de los dos comentarios de HU-KB-07 que apuntan a la HU equivocada.
- Tests: unitarios del schema y del texto que produce, más integración RTL de los dos modos sobre
  esta categoría.

### Fuera de alcance

- **`apps/backend/**` por completo.** El backend guarda `estructura` como JSON opaco y valida solo
  el sobre; añadir campos **no requiere tocarlo** — esa es justamente la propiedad que compró
  HU-KB-07. Si esta HU acabara tocando el backend, algo se planeó mal.
- **La infraestructura de HU-KB-07**: `KnowledgeStructuredForm.tsx`, `kb-serialize.ts` y los seis
  primitivos de `components/fields/`. Se consumen sin modificarlos.
- **Las otras tres categorías** (HU-KB-09/10/11). El schema de empresa **no debe declarar** campos
  de catálogo, horarios, dirección, canales de contacto ni políticas: duplicarlos partiría el
  conocimiento en dos sitios y la IA recuperaría el fragmento equivocado.
- **La vista principal**: grilla, tarjetas, badges, contadores, buscador y filtros. Sin cambios.
- **El encabezado y el pie del modal**: título fijo, leyenda de versión, contador global, botones,
  borrado y mutación de guardado ya existen y no se tocan.
- **La migración del texto libre existente.** `migrarLegadoAEstructura` sigue **sin consumidor**:
  la decisión aprobada es **diferirla a una HU propia**. Implica UI nueva (aviso «Completar con el
  formulario guiado», confirmación y deshacer) que no cabe en un cambio de tres líneas y que afecta
  a las cuatro categorías por igual. Esta HU **sí** corrige el comentario de `kb-serialize.ts` que
  hoy promete que «la conecta HU-KB-08», para que no quede apuntando a una HU que no la va a hacer.
- **El tono de voz de la IA.** Es configuración del prompt (`HT-AI-01`), no conocimiento
  recuperable: dentro del KB solo se aplicaría cuando el retrieval eligiera ese fragmento, así que
  unas respuestas saldrían con el tono pedido y otras no.

## Criterios de aceptación

### Bloque A — El schema (complejidad **media**)

1. Existe `EMPRESA_SCHEMA` con `id: 'empresa'`, `version: 1` y **3 secciones**: `identidad`,
   `proposito` y `alcance`.
2. Los **13 campos** son exactamente los de la tabla de `plan.md`, cada uno con su `id`, `kind`,
   `requisito` y sus topes. Los `id` quedan **congelados**: renombrar uno deja huérfano el dato ya
   guardado por los tenants, que pasaría a serializarse bajo «Otros datos» en vez de bajo su
   etiqueta.
3. **Exactamente dos campos son `obligatorio`**: `nombre_comercial` y `descripcion`. Son el mínimo
   sin el cual la IA no puede ni nombrar al negocio ni decir a qué se dedica. Todo lo demás es
   `opcional` o `condicional`.
4. `grupo_empresarial` es `condicional` y solo aparece cuando `parte_de_grupo` vale `'si'`. Al
   ocultarse deja de exigirse **y** deja de llegar al texto que lee la IA (regla de HU-KB-07).
5. Ningún campo declara `kind: 'horario'` ni `kind: 'repetible'`: esta categoría no tiene ni
   agendas ni filas con columnas. Los primitivos correspondientes siguen sin consumidor.
5-bis. **`zonas_cobertura` pertenece a esta categoría**, no a HU-KB-10: describe el alcance del
   negocio (dónde vende y despacha), no su dirección física. Queda pactado que el spec de HU-KB-10
   declare «zonas de cobertura/despacho → HU-KB-08» en su *fuera de alcance*, para que ninguna de
   las dos lo duplique.

### Bloque B — El texto que llega a la IA (complejidad **media**)

6. Con **todos** los campos al tope y `adicional` lleno, el texto serializado **cabe en
   `CONTENIDO_MAX` (10.000)** con margen. Se verifica con un test, no con una estimación: un
   formulario que puede llenarse hasta un estado que el backend rechaza con 400 sería una trampa.
7. El texto sale con las tres secciones en orden canónico (`## Identidad`, `## Propósito y valores`,
   `## Alcance y respaldo`) y «Información adicional» al final.
8. Un formulario a medio llenar no deja etiquetas ni encabezados huérfanos: las secciones sin nada
   que decir desaparecen del texto.

### Bloque C — El modal (complejidad **baja**)

9. La tarjeta «Información de la empresa» **vacía** abre en modo **estructurado**, sin tocar
   `modoEditor`: basta con que su título figure en `SCHEMA_POR_TITULO`. Aplica también a los
   documentos vacíos que ya existen en la base y al preset virtual.
10. La misma tarjeta **con texto libre ya escrito** sigue abriendo en modo **legado**, con su
    textarea intacto. Es la regla de retrocompatibilidad de HU-KB-07 y esta HU no la debilita.
11. Con los dos obligatorios sin llenar, «Guardar e indexar» está **deshabilitado**; se habilita al
    completarlos, sin importar cuántos opcionales queden vacíos.
12. Guardar envía `contenido` (el texto serializado) **y** `estructura` en el mismo payload, con
    `schemaId: 'empresa'` y `schemaVersion: 1`.
13. **«Información adicional» sigue presente**, al final y fuera del acordeón, y **no** es un campo
    del schema: es el `adicional` del sobre. Ningún campo de `EMPRESA_SCHEMA` puede llamarse así ni
    ocupar su lugar.

### Bloque D — Transversales

14. **Sin cambios de backend.** `git diff` no toca `apps/backend/**`. Al no haber código de
    servidor, esta HU **no introduce superficie multi-tenant nueva**: el aislamiento lo siguen
    garantizando los endpoints existentes (`authenticateJWT → requireTenant → authorize(['admin'])`
    + repositorio `*Scoped`), que no se modifican. Por eso no lleva test de aislamiento propio.
15. **Sin cambios de comportamiento en la infraestructura de HU-KB-07.** `git diff` no toca
    `KnowledgeStructuredForm.tsx` en absoluto, y en `kb-serialize.ts` y `components/fields/*` toca
    **únicamente los tres comentarios** que apuntaban a la HU equivocada (`ScheduleDayEditor` →
    HU-KB-10, `PolicyTriState` → HU-KB-11, `migrarLegadoAEstructura` → HU futura de migración).
    Se verifica con `git diff -U0` que ninguna línea modificada sea código ejecutable.
16. Se invocaron `emil-design-eng`, `impeccable:impeccable` y `frontend-design:frontend-design`
    **antes** de escribir o modificar cualquier componente (regla §7 del `CLAUDE.md` raíz). Las que
    no estén registradas en el entorno quedan documentadas en `tasks.md`. Si esta HU acaba sin tocar
    ni un componente —que es el objetivo—, se deja constancia de eso mismo.
17. `pnpm --filter @sofiapp/web build` (incluye `tsc --noEmit`), `lint` (`--max-warnings 0`) y
    `test` en verde, con la única excepción declarada de `TagSelector.test.tsx` (9 fallos
    preexistentes y ajenos).

## Dependencias

Depende de:

- **HU-KB-07** (commit `f2736a7` en `feat/HU-KB-05`): el contrato `KbSchemaDef`/`KbFieldDef`/
  `KbSectionDef`, `LIMITE_POR_KIND`, `SCHEMA_POR_TITULO`, `modoEditor`, `schemaDeDocumento`,
  `camposFaltantes`, `serializeEstructura` y `KnowledgeStructuredForm`.
- `PRESET_META` de `lib/kb-presets.ts` para el título exacto de la categoría —
  `'Información de la empresa'`— que es la clave del registry.

Bloquea a: nada. HU-KB-09/10/11 son independientes entre sí; cada una registra su propio título.
Esta va primera solo porque es la categoría obligatoria de mayor peso.

**Rama:** se trabaja y se commitea sobre **`feat/HU-KB-05`**, igual que HU-KB-06 y HU-KB-07. **No**
se crea `feat/HU-KB-08`.

## Definición de "hecho"

El admin abre `/settings/knowledge`, hace clic en la tarjeta «Información de la empresa» y, en vez
del textarea en blanco de siempre, ve un formulario de tres secciones que le pregunta cómo se llama
su empresa, a qué se dedica, qué la mueve y a quién le sirve — con «Obligatorio» marcado solo en los
dos campos sin los que la IA no puede responder nada, un campo que aparece únicamente si dice que
hace parte de un grupo, y «Información adicional» al final para todo lo que el formulario no previó.
Al guardar, el backend recibe el texto serializado y la estructura en la misma petición, sin haber
cambiado una línea de servidor. Y quien ya había escrito su información a mano sigue viendo su
textarea, intacto.
