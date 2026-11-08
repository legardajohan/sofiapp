# Documentación de nodos de Flujos — SofiApp

> Guía para diseñar flujos libremente en **Flujos** (`/flows`). Describe cómo funciona **realmente** el motor
> (`apps/backend/src/features/flow/`), no solo lo que muestra el editor.
> Fuente: `flow.validation.ts`, `flow.engine.ts`, `flow.runtime.service.ts`, `flow.trigger.ts` (rev. 2026-11-04).

---

## 1. Conceptos clave (léelos antes de la tabla)

| Concepto | Qué significa en la práctica |
|---|---|
| **Grafo** | Un flujo es una lista de **nodos** + **aristas** (conexiones) + un nodo de **entrada** (`entrada`) por donde empieza. |
| **Salida lineal** | `mensaje`, `captura`, `kb`, `accion` y `espera` tienen **una sola salida**: la primera arista que sale de ellos. Si no tienen arista, **el flujo termina ahí**. |
| **Salidas por rama** | `condicion`, `intencion` e `ia` tienen **varias salidas** (una por rama + una **por defecto**). El destino de cada rama se guarda dentro del nodo (`nodoDestino`), no como arista. |
| **Nodo terminal** | `handoff` no tiene salida: siempre termina el flujo. |
| **¿Espera al usuario?** | Solo `captura`, `espera` e `ia` (mientras conversa) **pausan** el flujo hasta el siguiente mensaje. Todos los demás se ejecutan en cadena de inmediato, en el mismo turno. |
| **Estado por cliente** | Cada contacto tiene su propio `FlowState`: en qué nodo va, qué variables lleva capturadas y si está esperando respuesta. Dos clientes nunca se mezclan. |
| **Variables** | `captura` guarda valores en `variables[campo]`. Se leen en `condicion` como `var:<campo>` (ej. `var:grado`). **Los mensajes no interpolan variables** (no existe `{{nombre}}`): para personalizar un texto usa un nodo `ia`. |
| **Fin del flujo** | Al terminar, el estado vuelve al nodo de entrada. El **siguiente** mensaje del cliente debe volver a cumplir el **disparador**; si no lo cumple, responde **Sofi** (la IA general con el prompt de *Comportamiento*). |
| **Topes de seguridad** | Máx. **25 saltos** de nodo por mensaje (un ciclo sin nodo que espere se corta con error) y máx. **5 resoluciones de IA** por mensaje (`captura`, `intencion`, `kb`, `ia`). |
| **IA apagada** | Si la conversación tiene la IA deshabilitada (ej. después de un `handoff`), el flujo **no** actúa. |
| **Un flujo activo** | Solo **un** flujo por empresa puede estar `activo`. Activar uno desactiva el anterior. El chat de prueba puede ejecutar **cualquier** flujo (aunque esté en borrador) eligiéndolo en la sesión. |
| **Borrador / Publicado** | El campo `estado` es informativo: lo que decide si corre en WhatsApp real es **`activo`**. |
| **Mensajes repetidos** | El mismo mensaje entrante nunca se procesa dos veces. |

---

## 2. Tabla maestra de nodos

| Nodo | Qué hace | ¿Espera al cliente? | ¿Usa IA? | Salidas / cómo se conecta | Cuándo usarlo | Cuándo **no** usarlo |
|---|---|---|---|---|---|---|
| 💬 **`mensaje`** | Envía un texto fijo (o una plantilla HSM aprobada) al cliente. | No | No | **1 salida lineal** → cualquier nodo. Sin salida = fin. | Saludos, presentaciones, despedidas, avisos, preguntas cuya respuesta no necesitas guardar. | Para información de cursos/precios: ponla en la base de conocimiento y usa `kb` o `ia` (evita duplicar datos). |
| 📝 **`captura`** | Envía una **pregunta**, espera la respuesta y la IA **extrae** el dato a una variable. | **Sí** | Sí (extracción) | **1 salida lineal**. Lo normal es seguir con `condicion` sobre `var:<campo>`. | Slot filling: nombre, grado, ciudad, carrera, presupuesto, fecha. | Si la pregunta admite respuestas libres que no quieres guardar (usa `ia`). |
| 🔀 **`condicion`** | Compara el último mensaje o una variable con reglas fijas y elige rama. | No | **No** | **N ramas + 1 por defecto** (obligatoria). Cada rama apunta a un nodo. | Ramificar por palabras exactas, menú numerado (1/2/3) o por un valor capturado. Gratis y determinista. | Si los clientes lo dicen "de muchas formas" (usa `intencion`). |
| 🎯 **`intencion`** | La IA clasifica el mensaje actual en una de tus **etiquetas** (con descripción). | No | Sí (clasificación) | **N etiquetas + 1 por defecto**. | Separar temas: "precios", "horarios", "inscripción", "queja"… cuando el lenguaje es libre. | Para decidir con datos ya capturados (usa `condicion`, es más barato y exacto). |
| 📚 **`kb`** | Pregunta a la **base de conocimiento** (RAG) y envía la respuesta. Si no hay, envía el texto de respaldo. | No | Sí (RAG) | **1 salida lineal**. | Responder con información oficial: precios, horarios, proceso de inscripción, políticas. | Para conversaciones de ida y vuelta (usa `ia` con `usarKb`). |
| ⚙️ **`accion`** | Efecto en el CRM **sin** enviar mensaje: cambiar estado comercial, aplicar etiquetas, crear lead o asignar asesor. | No | No | **1 salida lineal**. Se encadena antes/después de cualquier nodo. | Marcar el cliente (etiqueta "Grado 11"), crear el lead al mostrar interés, asignar asesor. | — (si falla, se registra y el flujo sigue). |
| 🙋 **`handoff`** | Transfiere a un asesor humano: **apaga la IA** de esa conversación. | — | No | **Ninguna** (terminal). | Cierre de venta, inscripción, quejas, peticiones explícitas de humano. | En medio del flujo: después del handoff no corre nada más. |
| ⏳ **`espera`** | Pausa el flujo X minutos y luego continúa solo. | **Sí** (temporizador) | No | **1 salida lineal** (lo que pasa al cumplirse el tiempo). | Seguimientos: "¿pudo revisar la información?" 30 min después. | Si el cliente suele responder rápido: **un mensaje del cliente durante la espera la termina** y el flujo continúa de inmediato. |
| 🤖 **`ia`** | Un mini-asistente con un **objetivo**: conversa varios turnos y, cuando detecta una **salida**, deriva. | **Sí** (por turno) | Sí (conversación + decisión) | **1–8 salidas + 1 por defecto** (cuando se agotan los turnos). | Tramos conversacionales: asesorar, recomendar un curso, resolver dudas antes de decidir. | Para una respuesta única (usa `kb`) o una decisión con reglas fijas (usa `condicion`). |

> El tipo `api` (llamar a un servicio externo) está **reservado**: el backend lo rechaza por ahora.

---

## 3. Ficha detallada por nodo

### 💬 `mensaje`
| Campo | Tipo | Reglas |
|---|---|---|
| `texto` | string | Texto a enviar. Opcional en el esquema, pero **si lo dejas vacío y sin plantilla el nodo no envía nada** (pasa en silencio). |
| `templateId` | string | Plantilla HSM (necesaria fuera de la ventana de 24 h de WhatsApp). Si existe, tiene prioridad sobre `texto`. |
| `parametros` | string[] | Valores para las variables de la plantilla. |

```json
{ "tipo": "mensaje", "texto": "¡Hola! 👋 Bienvenido a Pre-ICFES Estudiando." }
```
- Sin salida → termina el flujo. Encadena varios `mensaje` seguidos si quieres enviar varios globos.
- No interpola variables: "Hola {{nombre}}" se envía literal.

### 📝 `captura`
| Campo | Tipo | Reglas |
|---|---|---|
| `campo` | string | Nombre de la variable (ej. `grado`). Luego se lee como `var:grado`. |
| `descripcion` | string | **Instrucción a la IA de qué extraer**. Es la clave del nodo: normaliza aquí (ver tip). |
| `tipoDato` | `texto` · `numero` · `fecha` · `booleano` | Tipo esperado del valor. |
| `pregunta` | string | Lo que se le envía al cliente al llegar al nodo. |
| `reintentos` | entero ≥ 0 | **Hoy no se usa** en ejecución. |
| `destino` | `variable` · `contacto` · `atributo` | **Dónde se guarda** la respuesta (HU-FLOW-05). Ver abajo. Sin `destino` = `variable`. |
| `saltarSiExiste` | boolean (def. `true`) | Solo con destino de ficha: si el contacto ya tiene el dato, **no pregunta** y sigue. |
| `sobrescribir` | boolean (def. `false`) | Solo con destino de ficha: si ya hay un dato, `false` no lo pisa y `true` lo reemplaza. |

```json
{ "tipo": "captura", "campo": "grado", "tipoDato": "texto", "reintentos": 1,
  "pregunta": "📚 ¿En qué grado está el estudiante?",
  "descripcion": "Grado escolar. Devuelve exactamente: '11', '10', '9', 'graduado' u 'otro'." }
```
- Flujo: llega → envía `pregunta` → espera → con la respuesta la IA extrae → guarda `variables[campo]` → sigue.

**Guardar en la ficha del contacto (HU-FLOW-05).** El inspector tiene el selector **«Guardar en»**:

| Destino | Qué hace |
|---|---|
| **Variable del flujo** | Como siempre: solo vive en este flujo. |
| **Dato del contacto** | Escribe `nombre`, `correo`, `documento` o `rolContacto` en la ficha. (El teléfono no: el webhook lo reescribe.) |
| **Campo personalizado** | Escribe en un campo del catálogo de tu empresa (colegio, ciudad…). «Crear campo…» lo abre sin salir del editor. |

Con destino de ficha, el **nombre de la variable y el tipo de dato los fija el destino** (siempre `var:nombre`, `var:colegio`…, nunca un sinónimo) y el valor queda **también** en `var:<campo>`, así que una `condicion` posterior lo puede leer. El `correo` debe ser válido; el `rolContacto` solo acepta una opción **activa** de tu catálogo de roles (la IA recibe la lista); un dato inválido no se escribe, pero el flujo sigue. `saltarSiExiste` evita preguntar lo que ya se sabe. ⚠️ El **nombre** de un contacto que escribió por WhatsApp ya viene del perfil de Meta: con `saltarSiExiste` activo, esa pregunta se salta.
- ⚠️ Si la IA **no logra extraer** el dato, el nodo se queda esperando **sin volver a preguntar**. Por eso, en `descripcion` da siempre un valor de escape ("si no lo dice, devuelve 'sin_dato'").
- 💡 Tip: pide a la IA valores **normalizados** en `descripcion`; así la `condicion` siguiente compara contra pocos valores fijos.

### 🔀 `condicion`
| Campo | Tipo | Reglas |
|---|---|---|
| `variable` | `ultimo_mensaje` o `var:<campo>` | Qué se compara. |
| `ramas[]` | `{ operador, valor, nodoDestino }` | Mín. 1. Se evalúan **en orden**; gana la **primera** que cumple. |
| `operador` | `igual_a` · `contiene` · `opcion_elegida` | Ver tabla abajo. |
| `ramaPorDefecto` | id de nodo | Obligatoria. Se usa si ninguna rama cumple. |

| Operador | Cumple cuando… | Ejemplo |
|---|---|---|
| `igual_a` | el texto normalizado es **exactamente** el valor | `var:grado` igual_a `11` |
| `contiene` | el texto **contiene** el valor | `ultimo_mensaje` contiene `cuotas` |
| `opcion_elegida` | el cliente escribió el **número** de la rama (1, 2, 3… según su posición) **o** el texto del valor | Menú "1) Grado 11 2) Graduado": el cliente responde "1" o "grado 11" |

- Normalización: minúsculas, sin espacios al borde y **sin tildes** ("Popayán" = "popayan").
- No envía mensajes (por diseño: el contenido va en la base de conocimiento).
- ⚠️ El orden importa: con `contiene`, pon primero los valores más específicos ("11" antes que "1").

### 🎯 `intencion`
| Campo | Tipo | Reglas |
|---|---|---|
| `etiquetas[]` | `{ etiqueta, descripcion, nodoDestino }` | Mín. 1. La `descripcion` es lo que la IA lee para decidir: sé concreto. |
| `ramaPorDefecto` | id de nodo | Si la IA no reconoce ninguna etiqueta. |

```json
{ "tipo": "intencion", "ramaPorDefecto": "n_ia_general",
  "etiquetas": [
    { "etiqueta": "precios", "descripcion": "Pregunta cuánto cuesta un curso, cuotas o descuentos", "nodoDestino": "n_kb_precios" },
    { "etiqueta": "horarios", "descripcion": "Pregunta por días, jornadas u horas de clase", "nodoDestino": "n_kb_horarios" } ] }
```
- Clasifica **el mensaje actual**, no espera uno nuevo. Ponlo después de un nodo que haya esperado (`captura`, `ia`) o como primer nodo para clasificar el mensaje que disparó el flujo.

### 📚 `kb`
| Campo | Tipo | Reglas |
|---|---|---|
| `pregunta` | string | `ultimo_mensaje` = usa lo que escribió el cliente; o una pregunta fija ("¿Cuál es el proceso de inscripción?"). |
| `siNoHayRespuesta` | string | Texto de respaldo si la base de conocimiento no tiene respuesta. |
| `kSobrescrito` | entero > 0 | **Hoy no se usa** en ejecución. |

- Responde una vez y sigue por su salida lineal. Con **pregunta fija** obtienes siempre el mismo tipo de información (ideal para "envía el proceso de inscripción").

### ⚙️ `accion`
| `efecto.tipo` | Campos | Qué hace |
|---|---|---|
| `cambiar_estado` | `estado`: `nuevo` · `en_gestion` · `pago_pendiente` · `pagado` · `perdido` | Cambia el estado comercial del cliente. |
| `aplicar_etiquetas` | `tagIds`: ids de etiquetas (mín. 1) | Suma etiquetas al cliente (no borra las que tenía). Las etiquetas se crean antes en `/etiquetas`. |
| `crear_lead` | — | Convierte la conversación en lead (si ya existe, lo ignora). |
| `asignar_asesor` | `asesorId` | Asigna la conversación a un asesor. |

- No envía nada al cliente. Si falla, se registra y el flujo continúa.

### 🙋 `handoff`
| Campo | Tipo | Reglas |
|---|---|---|
| `motivo` | string (opcional) | Queda como contexto para el asesor. |
| `notificarAsesorId` | id (opcional) | Asesor al que se transfiere (en el editor se elige por **nombre**). Si se fija, la conversación se **asigna a esa persona** y manda sobre el reparto automático de chats; vacío = lo reparte la configuración general. Si el asesor ya no está activo, el traspaso ocurre igual y queda al reparto automático. |

- **Apaga la IA** en esa conversación y termina el flujo. Antes del handoff suele ir un `mensaje` o `kb` ("Enseguida te comunico con un asesor 🙌") y un `accion` `crear_lead`.

### ⏳ `espera`
| Campo | Tipo | Reglas |
|---|---|---|
| `minutos` | entero > 0 | Sin máximo. |

- Al llegar, programa un temporizador y pausa. Cuando se cumple, continúa por su salida.
- ⚠️ Si el cliente **escribe durante la espera**, el temporizador se cancela y el flujo continúa **ya** con ese mensaje.
- En el chat de prueba hay un botón para **adelantar la espera** sin aguardar los minutos.

### 🤖 `ia`
| Campo | Tipo | Reglas |
|---|---|---|
| `objetivo` | string 10–2000 | Qué debe lograr la IA en este tramo (tono, qué información dar, qué preguntar). |
| `salidas[]` | `{ etiqueta ≤40, descripcion ≤500, nodoDestino }` | 1 a 8. La `descripcion` dice **cuándo** salir por ahí. |
| `ramaPorDefecto` | id de nodo | Se usa al agotar `maxTurnos` (o si la IA nombra una salida inexistente). |
| `maxTurnos` | entero 1–10 | Cuántas respuestas puede dar antes de salir por defecto. |
| `usarKb` | boolean | Si `true`, busca en la base de conocimiento con cada mensaje y lo usa como contexto. |

- En cada mensaje la IA (con los últimos 20 mensajes de historial) decide: **o** responde y sigue esperando, **o** elige una salida.
- ⚠️ Cuando elige una salida, **no envía su respuesta**: el siguiente nodo debe hablar (un `mensaje`, `kb` u otro `ia`).
- Usa el `objetivo` del nodo, **no** el prompt de *Comportamiento*. Repite en el objetivo lo esencial del tono ("trata de usted, sé breve, usa emojis moderados").
- 🐞 Conocido: en el lienzo, arrastrar desde una salida del nodo `ia` crea una conexión simple en vez de asignar la salida. **Asigna el destino desde el inspector** (panel derecho).

---

## 4. Disparadores (trigger del flujo)

Se evalúan **solo cuando el flujo va a empezar** (no si ya está en curso). Si no se cumple, responde **Sofi**.

| Disparador | Se cumple cuando… | Uso típico |
|---|---|---|
| `siempre` | Siempre (es el valor si no configuras ninguno). | Un único flujo que atiende todo. |
| `palabra_clave` | El mensaje (normalizado) **contiene** alguna de las palabras (1–20, máx. 60 caracteres c/u). | Campañas: "aniversario", "promo", "Popayán". |
| `primer_mensaje` | Es el **primer** mensaje del cliente (lleva ≤1 mensaje). | Bienvenida y calificación inicial. |
| `horario` | Día y hora actuales (zona horaria IANA, ej. `America/Bogota`) dentro de `[desde, hasta)`. | Flujo de fuera de horario. |

> 💡 Combinación recomendada: flujo activo con `primer_mensaje` para calificar, y Sofi (prompt de *Comportamiento* + base de conocimiento + FAQs) para el resto de la conversación.

---

## 5. Matriz de combinaciones típicas

| Desde → Hacia | Patrón | Para qué |
|---|---|---|
| `mensaje` → `captura` | Saludo y luego pregunta | Presentarse y empezar a calificar. |
| `captura` → `condicion` (`var:campo`) | Slot filling + ramificación | "Si grado = 11 → cursos de grado 11". |
| `captura` → `captura` → `captura` | Formulario conversacional | Nombre, grado, carrera (una pregunta por mensaje). |
| `captura` (menú) → `condicion` (`opcion_elegida`) | Menú numerado | "Responda 1, 2 o 3". |
| `condicion` → `accion` (etiqueta) → `ia` | Marcar y asesorar | Segmentar al cliente antes de conversar. |
| `intencion` → `kb` | Clasificar y responder | Preguntas sueltas de precios/horarios. |
| `ia` → `ia` | Tramos encadenados | "Asesoría del curso" → "¿algo más o inscripción?". |
| `ia` → `kb` → `accion` (`crear_lead`) → `handoff` | Cierre | Enviar proceso de inscripción, crear lead y pasar a un asesor. |
| `kb` → `espera` → `mensaje` | Seguimiento | Recordar al cliente si no respondió. |
| cualquiera → `handoff` | Escape a humano | Quejas o petición explícita. |

---

## 6. Patrones recomendados y antipatrones

✅ **Hazlo así**
- Toda información de negocio (precios, horarios, cursos) en la **base de conocimiento**; los flujos solo **orquestan**.
- Toda `captura` con una salida de escape en su `descripcion` ("si no responde, devuelve 'sin_dato'").
- Toda `condicion` con una **rama por defecto útil** (ej. un nodo `ia` general), nunca un callejón.
- En nodos `ia`, salidas con descripciones **mutuamente excluyentes** y un `maxTurnos` razonable (4–6).
- Antes de un `handoff`: `mensaje`/`kb` de despedida + `accion` `crear_lead`.
- Un nodo que espera (`captura`/`ia`/`espera`) dentro de cualquier ciclo, para no chocar con el tope de 25 saltos.

❌ **Evita**
- Ciclos sin un nodo que espere (`condicion` → `mensaje` → `condicion`…): el motor los corta con error.
- `mensaje` vacío (no falla al guardar, pero no envía nada).
- Copiar precios u horarios dentro de `mensaje`: se desactualizan respecto de la base de conocimiento.
- Más de ~4 nodos de IA encadenados sin espera entre ellos (tope de 5 resoluciones de IA por mensaje).
- Nodos después de un `handoff` (nunca se ejecutan).

---

## 7. Qué se puede guardar y qué se puede activar

Desde HU-FLOW-05, **guardar un flujo a medias no se pierde**: si te falta conectar un nodo o completar
una pregunta, se guarda igual (inactivo) y el editor te dice qué falta. Lo que **no** se puede hacer con
un flujo incompleto es **activarlo**.

| Nivel | Qué es | ¿Bloquea guardar? | ¿Bloquea activar? |
|---|---|---|---|
| **Forma** | Nombre vacío, ids de nodo repetidos, `entrada` inexistente, enum/tipo inválido, campos no permitidos, `maxTurnos` fuera de 1–10, `espera` ≤ 0. | **Sí** (`400`) | Sí |
| **Conexión** | Nodo **huérfano** (sin conexión de entrada, salvo la entrada); rama, salida o rama por defecto **sin destino**; destino que ya no existe. | No (advertencia) | **Sí** |
| **Contenido** | Nodo **a medias**: pregunta/descripción/nombre del dato vacíos; `mensaje` sin texto ni plantilla; `condicion`/`intencion`/`ia` sin ramas, etiquetas o salidas; objetivo de `ia` < 10 caracteres; `kb` sin pregunta o respaldo; `accion` sin etiquetas o asesor; `captura` a un campo personalizado sin elegir. | No (advertencia) | **Sí** |

- **El editor lo muestra en vivo.** Cada nodo está en **rojo** (con lo que le falta) o en **verde**; al
  corregirlo pasa a verde al instante, sin guardar. El botón **Activar** se deshabilita mientras haya rojos.
- **Editar un flujo que está en producción** y dejarlo con errores: al guardar aparece un aviso con tres
  salidas — *Guardar y desactivar* (queda inactivo y Sofi atiende hasta que lo corrijas y lo actives),
  *No guardar* (sales; los cambios quedan como borrador en tu navegador) y *Cancelar*.
- **Si se cae la conexión** al guardar, el editor conserva lo que escribiste y lo guarda como borrador local;
  al volver puedes **Recuperar** o **Descartar**.
- Una rama sin destino en un flujo en borrador (chat de prueba) **termina el flujo** sin romperlo; en
  WhatsApp real no ocurre, porque un flujo con errores no se puede activar.

**Teclado y nombres.** Selecciona un enlace o un nodo y pulsa **Supr** o **Retroceso** para borrarlo (no
actúa si estás escribiendo en un campo). Borrar el enlace de una rama deja ese destino vacío (el nodo se
pone en rojo); borrar un nodo vacía las ramas que apuntaban a él; el **nodo de inicio** no se puede borrar
mientras haya otros. Cada nodo acepta un **nombre propio** (hasta 60 caracteres) que se ve en el lienzo, en
los desplegables de destino y en los mensajes de error.

---

## 8. Limitaciones conocidas (hoy)

- No hay **botones interactivos** de WhatsApp: los menús son numerados y se resuelven con `condicion` + `opcion_elegida`.
- No hay interpolación de variables en `mensaje`.
- Campos guardados pero **sin efecto** en ejecución: `captura.reintentos`, `kb.kSobrescrito`.
- Las salidas del nodo `ia` se asignan desde el inspector (arrastrar no las conecta).
- Un solo flujo activo por empresa (los demás quedan para el chat de prueba).
- **Corregido en HU-FLOW-05:** antes, lo que un nodo hacía **antes** de llegar a un nodo que consulta a la IA
  (`kb → ia`, `accion → ia`: mensajes de la KB, etiquetas, estado) se perdía. Ya no: se ejecutan todos los efectos del turno, en orden.
