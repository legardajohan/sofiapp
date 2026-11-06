# Base mínima para probar el chat y el flujo — Pre-ICFES Estudiando

> Versión **corta** de `00-test-preicfes.md`: solo lo indispensable para ver funcionar el **chat de prueba**
> y **un flujo que usa los 9 tipos de nodo**. Se carga a mano en unos 35 minutos, en 4 pasos; el flujo se arma en 5 etapas que se prueban una por una. Datos ficticios.
> Sesión: `user1-preicfes@estudiando.co`. Referencia de nodos: `00-flows-documentation.md`.

| Paso | Qué | Dónde | Tiempo |
|---|---|---|---|
| 1 | Base de conocimiento: 3 tarjetas | **Base de conocimiento** · `/settings/knowledge` | ~6 min |
| 2 | Prompt del asistente | **Comportamiento** · `/settings/assistant` | ~1 min |
| 3 | Un flujo de 19 nodos (los 9 tipos), en 5 etapas | **Flujos** · `/flows` → *Nuevo flujo* | ~25 min |
| 4 | Probar | **Probar asistente** · `/settings/assistant/test` | — |

> No hacen falta etiquetas, FAQs, reglas de transferencia ni plantillas para esta prueba.

---

## Paso 1 · Base de conocimiento (`/settings/knowledge`)

Solo 3 tarjetas. Llena **únicamente** los campos indicados; deja vacíos los demás.

### 1.1 Tarjeta «Información de la empresa» *(obligatoria)*

| Campo | Pegar |
|---|---|
| Nombre comercial | `Pre-ICFES Estudiando` |
| ¿A qué se dedica? | `Instituto de preparación para la Prueba Saber 11 (ICFES) en Pasto y Popayán. Atendemos estudiantes de grado 11 y bachilleres graduados con cursos presenciales, simulacros tipo ICFES y taller de orientación profesional.` |

### 1.2 Tarjeta «Productos y servicios» *(obligatoria)*

**¿Qué vende o qué servicios presta?**
```text
Cursos de preparación para la Prueba Saber 11 (ICFES): Intensivo con Garantía para graduados, Semi-intensivo jornada tarde (para colegios de la mañana), Semi-intensivo jornada mañana (para colegios de la tarde) y Curso Sabatino. Inscripción de $100.000 para separar el cupo.
```

**Productos y servicios** (4 filas: *Nombre* | *Qué es o qué incluye*)

| Nombre | Qué es o qué incluye |
|---|---|
| `Intensivo con Garantía` | `Para graduados. Lunes a viernes 8:00-12:00 y 2:00-6:00 p.m. Inicia 12 ene 2027. Si no alcanza el puntaje de su carrera, repite gratis. $4.200.000` |
| `Semi-intensivo Jornada Tarde` | `Para grado 11 de colegios de jornada mañana. Lunes a viernes 2:30-5:30 p.m. Inicia 1 feb 2027, 5 meses. $2.400.000` |
| `Semi-intensivo Jornada Mañana` | `Para grado 11 de colegios de jornada tarde. Lunes a viernes 7:00-10:00 a.m. Inicia 1 feb 2027, 5 meses. $2.400.000` |
| `Curso Sabatino` | `Para grado 11 o graduados que trabajan. Sábados 8:00 a.m.-1:00 p.m. Inicia 6 feb 2027, 6 meses. $1.800.000` |

### 1.3 Tarjeta «Información Complementaria» *(texto libre)*

```text
PAGO A CUOTAS
Intensivo con Garantía: 2 cuotas mensuales. Semi-intensivos y Sabatino: 3 cuotas mensuales, sin intereses. Primero se paga la inscripción de $100.000 para separar el cupo; la primera cuota se paga hasta el día de inicio del curso.

PROCESO DE INSCRIPCIÓN
1. Elija el curso y la jornada.
2. Pague la inscripción de $100.000 por transferencia (Bancolombia o Nequi) o en la sede.
3. Envíe por WhatsApp el documento del estudiante y el comprobante de pago.
4. Un asesor confirma el cupo y le envía el contrato.

SEDES Y HORARIO DE ATENCIÓN
Pasto: Calle 18 # 25-40, Centro. Popayán: Carrera 6 # 4-21, Centro Histórico.
Atención de lunes a viernes de 7:00 a.m. a 7:00 p.m. y sábados de 8:00 a.m. a 2:00 p.m.

ORIENTACIÓN PROFESIONAL
Todos los cursos incluyen un taller de orientación profesional para quien aún no ha decidido qué carrera estudiar.
```

✅ **Comprobación:** las 3 tarjetas deben pasar a **«Indexado»** en unos segundos. Si se quedan en «Pendiente», el worker del backend no está corriendo.

---

## Paso 2 · Prompt del asistente (`/settings/assistant`)

> Si quieres conservar el prompt actual, cópialo antes de pegar este.

**Tono**
```text
Cálido, cercano y profesional. Trata de usted, frases cortas y emojis con moderación.
```

**Instrucciones**
```text
Eres Sofi Caicedo, asesora virtual de Pre-ICFES Estudiando.
- Trata de usted, sé breve (máximo 6 líneas) y usa emojis con moderación.
- Usa solo la información del contexto. Si un dato no está, ofrece comunicar al cliente con un asesor. Nunca inventes precios ni fechas.
- No vuelvas a preguntar algo que el cliente ya respondió.
- Puede escribir el propio estudiante o un padre, madre o acudiente. Si es un acudiente, habla del estudiante ("su hijo", "su hija"); si es el estudiante, háblale directamente.
- Si está en grado 11, recomienda el Semi-intensivo según su jornada (tarde si su colegio es en la mañana, mañana si su colegio es en la tarde) o el Sabatino.
- Si ya terminó el colegio, recomienda el Intensivo con Garantía.
- Si pregunta por cuotas, explica el pago a cuotas.
- Al final pregunta si desea los pasos para inscribirse.
```

---

## Paso 3 · Construir el flujo, etapa por etapa (`/flows` → *Nuevo flujo*)

**Nombre:** `Prueba completa` · **Disparador:** `Siempre` · **No lo actives** (se prueba desde el chat de prueba).

El flujo final tiene **19 nodos** y usa los **9 tipos**. No lo armes de una vez: se construye en
**5 etapas**. Al final de cada una **guardas y pruebas**, y así ves cómo funciona cada nodo nuevo antes de
seguir. Los nodos se numeran **en el orden en que los creas** (N1, N2…).

### 3.0 Antes de empezar: cómo se usa el editor

| Quiero… | Cómo se hace |
|---|---|
| Crear un nodo | Botón **+ Agregar nodo** → elige el tipo. Aparece en el lienzo. |
| Configurarlo | Haz clic en el nodo: se abre el **inspector** (panel derecho). |
| Marcar el nodo de inicio | El **primer** nodo que creas queda como inicio. Para cambiarlo: inspector → **Marcar como inicio**. |
| Conectar un nodo de **una sola salida** (Mensaje, Captura, Base de conocimiento, Acción, Espera) | **Arrastra** desde el punto de **abajo** del nodo hasta el nodo destino. |
| Conectar un nodo **con ramas** (Condición, Intención, Asistente IA) | Desde el **inspector**: en cada rama eliges el destino en el desplegable *Ir a…* / *Destino…*. No arrastres: en el Asistente IA arrastrar **no** asigna la salida. |
| Borrar una conexión | Selecciona la línea en el lienzo y pulsa **Supr**. |

> **Importante:**
> - En el desplegable de destino solo aparecen nodos que **ya existen**. Por eso cada etapa crea primero
>   los nodos de destino y al final el nodo que ramifica.
> - El nodo **Condición** compara **lo que el cliente acaba de escribir** (el editor no deja elegir otra
>   variable). Por eso las ramas usan **contiene** (`11`, `gradu`, `manana`…) y no el valor capturado.
>   Mayúsculas y tildes no importan: «Mañana» = `manana`.
> - Al guardar, **todo** nodo (menos el de inicio) debe tener al menos una conexión de entrada. Si no, sale
>   el error *nodo huérfano*.

### 3.1 Mapa final (a dónde vas a llegar)

```text
[N19 Intención] (inicio)
 ├─ ubicacion ──→ [N16 KB Sedes] → [N17 Espera 2 min] → [N18 Seguimiento] → (vuelve a N2 Captura grado)
 ├─ asesor ─────→ [N14 Aviso asesor] → [N15 Handoff] ✖
 └─ otro / defecto ─→ [N1 Saludo] → [N2 Captura grado] → [N5 Condición grado]
                                                           ├─ contiene «11» / «once» → [N10 Captura jornada] → [N9 Condición jornada]
                                                           │                                              ├─ contiene «manana» → [N6 IA Semi Tarde]
                                                           │                                              ├─ contiene «tarde»  → [N7 IA Semi Mañana]
                                                           │                                              └─ defecto           → [N8 IA Sabatino]
                                                           ├─ contiene «gradu» → [N4 IA Intensivo]
                                                           └─ defecto ──────────→ [N4 IA Intensivo]

Salidas de los 4 Asistentes IA (N4, N6, N7, N8):
 ├─ quiere_inscribirse → [N11 KB Inscripción] → [N12 Crear lead] → [N13 Estado en gestión] → [N14 Aviso asesor] → [N15 Handoff] ✖
 └─ no_necesita_mas / defecto → [N3 Despedida] ✖
```

| Tipo de nodo | Nodos | Etapa en que aparece |
|---|---|---|
| 💬 Mensaje | N1, N3, N14, N18 | 1, 1, 4, 5 |
| 📝 Captura | N2, N10 | 1, 3 |
| 🤖 Asistente IA | N4, N6, N7, N8 | 2, 3 |
| 🔀 Condición | N5, N9 | 2, 3 |
| 📚 Base de conocimiento | N11, N16 | 4, 5 |
| ⚙️ Acción | N12, N13 | 4 |
| 🙋 Transferir a humano | N15 | 4 |
| ⏳ Espera | N17 | 5 |
| 🎯 Intención | N19 | 5 |

---

### Etapa 1 · Saludo, pregunta y despedida (3 nodos, en línea)

**Qué aprendes:** el nodo de inicio, conectar arrastrando y cómo la **Captura** espera la respuesta.

**1. Crea los nodos**

| Nodo | Tipo | Configuración en el inspector |
|---|---|---|
| **N1** Saludo | 💬 Mensaje | *Texto que envía el flujo:* `¡Hola! 😊 Le saluda Sofi, asesora virtual de Pre-ICFES Estudiando. Con gusto le ayudo a elegir el curso ideal para prepararse para el ICFES 🎯` |
| **N2** Captura grado | 📝 Captura | *Pregunta que se le hace al cliente:* `📚 Para recomendarle el curso indicado, cuénteme en qué grado va. Si nos escribe por su hijo o hija, indíquenos el grado de él o ella. Y si ya terminó el colegio, cuénteme también 🎓`<br>*Nombre del dato (variable):* `grado`<br>*Qué se espera:* `Grado escolar del estudiante, escriba el propio estudiante o un padre, madre o acudiente. Devuelve exactamente '11' si cursa grado once, 'graduado' si ya terminó el colegio (bachiller, egresado, se graduó), u 'otro' en cualquier otro caso, incluido si no lo dice.`<br>*Tipo de dato:* `Texto` |
| **N3** Despedida | 💬 Mensaje | *Texto:* `¡Con mucho gusto! 🙏 Gracias por escribirnos. Cuando quiera retomar, aquí estaremos para ayudarle ✨` |

**2. Conecta (arrastrando)**

| Desde | Hacia |
|---|---|
| N1 Saludo | N2 Captura grado |
| N2 Captura grado | N3 Despedida |

**3. Verifica y guarda:** N1 dice *Nodo de inicio* en el inspector. Pulsa **Guardar**.

**4. Prueba** (chat de prueba → elige *Prueba completa* → **Reiniciar**)

| Escribe | Debe pasar |
|---|---|
| `Hola` | Llegan **2 mensajes**: el saludo y la pregunta del grado. El flujo queda **esperando**. |
| `Estoy en grado 11` | Llega la **despedida** y el flujo termina. |

---

### Etapa 2 · Ramificar por grado + primer Asistente IA (2 nodos nuevos)

**Qué aprendes:** la **Condición** con rama por defecto y el **Asistente IA**, que conversa varios turnos y
sale por una de sus salidas.

**1. Crea los nodos** (primero el destino N4, después la condición N5)

| Nodo | Tipo | Configuración en el inspector |
|---|---|---|
| **N4** IA Intensivo | 🤖 Asistente IA | *Objetivo:* `Eres Sofi, asesora virtual de Pre-ICFES Estudiando. Ya saludaste: no vuelvas a saludar ni a presentarte. Trata de usted, sé breve (máximo 6 líneas) y usa pocos emojis. Si escribe un padre, madre o acudiente, habla del estudiante; si escribe el propio estudiante, háblale directamente. El estudiante ya terminó el colegio o no dijo su grado: recomienda el Intensivo con Garantía con horario, fecha de inicio, en qué consiste la garantía y precio. Resuelve las dudas (cuotas, inscripción) solo con la base de conocimiento y al final pregunta si desea recibir los pasos para inscribirse.`<br>*Consultar la base de conocimiento:* **activado**<br>*Máximo de turnos:* `4`<br>**Agregar salida** ×2 (ver tabla de salidas abajo)<br>*Si no resuelve, ir a:* **N3 Despedida** |
| **N5** Condición grado | 🔀 Condición | **Agregar rama** ×2 (ver tabla de ramas abajo)<br>*Si ninguna coincide:* **N4 IA Intensivo** |

Salidas de **N4** (por ahora las dos van a la despedida; en la etapa 4 cambias la primera):

| Nombre de la salida | Cuándo se cumple | Destino |
|---|---|---|
| `quiere_inscribirse` | `El cliente dice que quiere inscribirse, separar el cupo o recibir los pasos de inscripción.` | **N3 Despedida** *(temporal)* |
| `no_necesita_mas` | `El cliente dice que no necesita nada más, que no le interesa o se despide.` | **N3 Despedida** |

Ramas de **N5**:

| Operador | Valor | Ir a |
|---|---|---|
| contiene | `gradu` | **N4 IA Intensivo** |

> Por ahora N5 solo tiene **una** rama; la de grado 11 se agrega en la etapa 3.

**2. Cambia las conexiones**

| Acción | Desde | Hacia | Cómo |
|---|---|---|---|
| Borrar | N2 Captura grado | N3 Despedida | Selecciona la línea → **Supr** |
| Crear | N2 Captura grado | N5 Condición grado | Arrastrar |

**3. Guarda y prueba**

| Escribe | Debe pasar |
|---|---|
| `Hola` → `Ya me gradué` | El IA recomienda el **Intensivo con Garantía** ($4.200.000) y pregunta si desea inscribirse. |
| → `¿Se puede pagar a cuotas?` | Explica las **2 cuotas** y sigue en el mismo nodo IA. |
| → `No, gracias` | Sale por `no_necesita_mas` → **despedida**. |
| *(Reiniciar)* `Hola` → `Prefiero no decir` | Ninguna rama coincide → **por defecto** → Intensivo. |

---

### Etapa 3 · Grado 11: preguntar la jornada (5 nodos nuevos)

**Qué aprendes:** encadenar **Captura → Condición** de nuevo y que varias ramas lleguen a distintos IA.

**1. Crea los 3 Asistentes IA** (los tres con: *Consultar la base de conocimiento* **activado** · *Máximo de
turnos* `4` · las **mismas 2 salidas** de N4, ambas a **N3 Despedida** por ahora · *Si no resuelve, ir a* **N3 Despedida**)

| Nodo | Objetivo |
|---|---|
| **N6** IA Semi Tarde | `Eres Sofi, asesora virtual de Pre-ICFES Estudiando. Ya saludaste: no vuelvas a saludar ni a presentarte. Trata de usted, sé breve (máximo 6 líneas) y usa pocos emojis. Si escribe un padre, madre o acudiente, habla del estudiante; si escribe el propio estudiante, háblale directamente. El estudiante está en grado 11 y estudia en la mañana: recomienda el Semi-intensivo Jornada Tarde, que no se cruza con sus clases, con horario, fecha de inicio y precio. Resuelve las dudas (cuotas, inscripción) solo con la base de conocimiento y al final pregunta si desea recibir los pasos para inscribirse.` |
| **N7** IA Semi Mañana | `Eres Sofi, asesora virtual de Pre-ICFES Estudiando. Ya saludaste: no vuelvas a saludar ni a presentarte. Trata de usted, sé breve (máximo 6 líneas) y usa pocos emojis. Si escribe un padre, madre o acudiente, habla del estudiante; si escribe el propio estudiante, háblale directamente. El estudiante está en grado 11 y estudia en la tarde: recomienda el Semi-intensivo Jornada Mañana, que no se cruza con sus clases, con horario, fecha de inicio y precio. Resuelve las dudas (cuotas, inscripción) solo con la base de conocimiento y al final pregunta si desea recibir los pasos para inscribirse.` |
| **N8** IA Sabatino | `Eres Sofi, asesora virtual de Pre-ICFES Estudiando. Ya saludaste: no vuelvas a saludar ni a presentarte. Trata de usted, sé breve (máximo 6 líneas) y usa pocos emojis. Si escribe un padre, madre o acudiente, habla del estudiante; si escribe el propio estudiante, háblale directamente. El estudiante está en grado 11, pero no estudia en jornada mañana ni tarde, o tiene ocupadas las tardes entre semana: recomienda el Curso Sabatino con horario, fecha de inicio y precio. Resuelve las dudas (cuotas, inscripción) solo con la base de conocimiento y al final pregunta si desea recibir los pasos para inscribirse.` |

**2. Crea la condición y la captura de jornada**

| Nodo | Tipo | Configuración en el inspector |
|---|---|---|
| **N9** Condición jornada | 🔀 Condición | Ramas: `contiene` · `manana` → **N6** · `contiene` · `tarde` → **N7**<br>*Si ninguna coincide:* **N8 IA Sabatino** |
| **N10** Captura jornada | 📝 Captura | *Pregunta:* `🕒 ¿Las clases del colegio son en la mañana o en la tarde? Así le recomiendo un horario que no se cruce con ellas.`<br>*Nombre del dato:* `jornada`<br>*Qué se espera:* `Jornada del colegio del estudiante. Devuelve exactamente 'manana' si estudia en la mañana, 'tarde' si estudia en la tarde, u 'otro' en cualquier otro caso (estudia los sábados, trabaja, no lo dice).`<br>*Tipo de dato:* `Texto` |

**3. Conecta**

| Desde | Hacia | Cómo |
|---|---|---|
| N10 Captura jornada | N9 Condición jornada | Arrastrar |
| N5 Condición grado → **Agregar rama**: `contiene` · `11` | N10 Captura jornada | Inspector de N5 |
| N5 Condición grado → **Agregar rama**: `contiene` · `once` | N10 Captura jornada | Inspector de N5 |

> Así N5 reconoce tanto «grado 11» como «estoy en once». Las ramas se evalúan en orden: es buena costumbre
> dejar arriba las más específicas.

**4. Guarda y prueba**

| Escribe | Debe pasar |
|---|---|
| `Hola` → `Estoy en grado 11` | Pregunta la **jornada**. |
| → `Mi colegio es en la mañana, ¿cuánto vale?` | Recomienda el **Semi-intensivo Jornada Tarde** con **$2.400.000**. |
| *(Reiniciar)* `Hola` → `Estoy en grado 11` → `Estudio en la tarde` | **Semi-intensivo Jornada Mañana** (7:00–10:00 a.m.). |
| *(Reiniciar)* `Hola` → `Estoy en grado 11` → `Trabajo entre semana` | Por defecto → **Curso Sabatino**. |

---

### Etapa 4 · Cierre: inscripción, lead y transferencia (5 nodos nuevos)

**Qué aprendes:** **Base de conocimiento** con pregunta fija, **Acción** (efectos en el CRM sin enviar mensaje)
y **Transferir a humano**, que apaga la IA.

**1. Crea los nodos**

| Nodo | Tipo | Configuración en el inspector |
|---|---|---|
| **N11** KB Inscripción | 📚 Base de conocimiento | *Qué se le pregunta:* **Una pregunta fija** → `¿Cuál es el proceso de inscripción paso a paso?`<br>*Si no hay respuesta:* `¡Excelente decisión! 🎉 Uno de nuestros asesores le explicará el proceso de inscripción paso a paso.` |
| **N12** Crear lead | ⚙️ Acción | *Qué hace este nodo:* **Crear un lead** |
| **N13** Estado en gestión | ⚙️ Acción | *Qué hace este nodo:* **Cambiar el estado comercial** · *Nuevo estado:* **En gestión** |
| **N14** Aviso asesor | 💬 Mensaje | *Texto:* `¡Perfecto! 🙌 Le comunico con uno de nuestros asesores, que en un momento continúa con usted por este mismo chat.` |
| **N15** Handoff | 🙋 Transferir a humano | *Motivo:* `Quiere inscribirse o pidió un asesor (prueba completa)` |

**2. Conecta**

| Desde | Hacia | Cómo |
|---|---|---|
| N11 KB Inscripción | N12 Crear lead | Arrastrar |
| N12 Crear lead | N13 Estado en gestión | Arrastrar |
| N13 Estado en gestión | N14 Aviso asesor | Arrastrar |
| N14 Aviso asesor | N15 Handoff | Arrastrar |
| N4, N6, N7 y N8 → salida `quiere_inscribirse` | **N11 KB Inscripción** | Inspector de **cada** IA (cambia el destino temporal) |

**3. Guarda y prueba**

| Escribe | Debe pasar |
|---|---|
| `Hola` → `Estoy en grado 11` → `Mi colegio es en la mañana, ¿cuánto vale?` → `Sí, quiero inscribirme` | Envía el **proceso de inscripción**, el aviso y **transfiere**. En el chat de prueba aparecen las tarjetas **Lead creado**, **Estado: En gestión** y **Transferido**. La IA queda apagada hasta **Reiniciar**. |
| *(Reiniciar)* `Hola` → `Ya me gradué` → `Quiero separar el cupo` | Mismo cierre desde el IA Intensivo. |

---

### Etapa 5 · Entrada inteligente: Intención + Espera (4 nodos nuevos)

**Qué aprendes:** la **Intención** como nodo de inicio para enrutar el primer mensaje, y la **Espera**.

**1. Crea los nodos**

| Nodo | Tipo | Configuración en el inspector |
|---|---|---|
| **N16** KB Sedes | 📚 Base de conocimiento | **Una pregunta fija** → `Dirección de las sedes de Pasto y Popayán y horario de atención`<br>*Si no hay respuesta:* `Tenemos sedes en Pasto y Popayán 📍 Un asesor le comparte la dirección exacta y el horario de atención.` |
| **N17** Espera | ⏳ Espera | *Minutos de espera:* `2` |
| **N18** Seguimiento | 💬 Mensaje | *Texto:* `¿Le gustaría que le recomiende el curso ideal según el grado? 😊` |
| **N19** Intención inicial | 🎯 Intención | **Agregar intención** ×3 (tabla de abajo)<br>*Si no reconoce ninguna, ir a:* **N1 Saludo**<br>Luego pulsa **Marcar como inicio** |

Intenciones de **N19**:

| Nombre | Descripción | Destino |
|---|---|---|
| `ubicacion` | `Pregunta dónde quedan, la dirección, las sedes, cómo llegar o el horario de atención.` | **N16 KB Sedes** |
| `asesor` | `Pide hablar con un asesor, una persona o que lo llamen.` | **N14 Aviso asesor** |
| `otro` | `Saluda, pregunta por cursos o precios, o escribe cualquier otra cosa.` | **N1 Saludo** |

> La intención `otro` no sobra: la IA siempre elige **una** de la lista, así que sin una opción comodín un
> simple `Hola` podría terminar clasificado como `ubicacion` o `asesor`.

**2. Conecta**

| Desde | Hacia | Cómo |
|---|---|---|
| N16 KB Sedes | N17 Espera | Arrastrar |
| N17 Espera | N18 Seguimiento | Arrastrar |
| N18 Seguimiento | N2 Captura grado | Arrastrar |

> N18 → N2: después del seguimiento llega de una vez la pregunta del grado y el flujo sigue en curso. Así,
> cuando el cliente responde, no vuelve a empezar desde el saludo.

**3. Verifica:** N19 dice *Nodo de inicio*; N1 ya **no**. N1 sigue conectado porque recibe la rama `otro`
de N19. **Guarda.**

**4. Prueba:** todos los escenarios del Paso 4.

---

### 3.6 Resumen de conexiones (para revisar al final)

| Desde | Rama / salida | Hacia |
|---|---|---|
| N19 Intención *(inicio)* | `ubicacion` | N16 |
| N19 | `asesor` | N14 |
| N19 | `otro` · por defecto | N1 |
| N16 KB Sedes | — | N17 → N18 → N2 |
| N1 Saludo | — | N2 |
| N2 Captura grado | — | N5 |
| N5 Condición grado | contiene `11` · contiene `once` | N10 |
| N5 | contiene `gradu` · por defecto | N4 |
| N10 Captura jornada | — | N9 |
| N9 Condición jornada | contiene `manana` | N6 |
| N9 | contiene `tarde` | N7 |
| N9 | por defecto | N8 |
| N4, N6, N7, N8 (IA) | `quiere_inscribirse` | N11 |
| N4, N6, N7, N8 (IA) | `no_necesita_mas` · si no resuelve | N3 *(fin)* |
| N11 KB Inscripción | — | N12 → N13 → N14 → N15 *(fin, apaga la IA)* |

---

## Paso 4 · Escenarios de prueba con el flujo completo (`/settings/assistant/test`)

1. Elige el flujo **Prueba completa** en la sesión de prueba.
2. Pulsa **Reiniciar** antes de cada escenario.

| # | Escribe (un mensaje por turno) | Debe pasar | Nodos |
|---|---|---|---|
| A | `Hola` → `Estoy en grado 11` → `Mi colegio es en la mañana, ¿cuánto vale?` → `Sí, quiero inscribirme` | Saludo y pregunta de grado → pregunta de jornada → **Semi-intensivo Jornada Tarde** con $2.400.000 → proceso de inscripción, aviso y **handoff**. Tarjetas: lead creado y estado *En gestión*. | N19→N1→N2 · N5→N10 · N9→N6 · N11→N12→N13→N14→N15 |
| B | `Buenas tardes, quiero información para mi hija` → `Está en once` → `Estudia en la tarde` → `No, gracias` | Escribe un **padre o madre**: reconoce «once» → **Semi-intensivo Jornada Mañana**, hablando **de la hija** (no como si fuera la estudiante) → **despedida**. | N19→N1→N2 · N5→N10 · N9→N7 · N3 |
| C | `Hola` → `Estoy en grado 11` → `Trabajo entre semana` → `¿Se puede pagar a cuotas?` → `No, gracias` | Por defecto → **Sabatino** → explica **3 cuotas** → **despedida**. | … N9→N8 · N8 · N3 |
| D | `Hola` → `Ya me gradué` → `¿Se puede pagar a cuotas?` → `No, gracias` | **Intensivo con Garantía** → **2 cuotas** → **despedida**. | N19→N1→N2 · N5→N4 · N4 · N3 |
| E | `Hola` → `Prefiero no decir` | Por defecto → **Intensivo con Garantía**. Lo mismo pasa con `Ya soy bachiller` (no contiene `gradu`, pero cae por defecto en el mismo nodo). | N19→N1→N2 · N5→N4 |
| F | `¿Dónde quedan y cuál es el horario?` → *(pulsa **adelantar espera**)* → `Estoy en grado 11` | Direcciones y horario → **en espera** → al adelantar llegan el **seguimiento** y la **pregunta del grado** → con la respuesta sigue a la jornada, **sin** volver a saludar. | N19→N16→N17 · N18→N2 · N5→N10 |
| G | `¿Dónde quedan?` → *(sin adelantar)* `Gracias` | El mensaje **corta la espera**: el seguimiento y la pregunta del grado salen **de inmediato**. | N19→N16→N17 · N18→N2 |
| H | `Quiero hablar con un asesor` | Aviso y **handoff** directo, **sin** lead (no pasa por N12–N13). | N19→N14→N15 |
| I | `Hola` → `Ya me gradué` → `¿Hay simulacros?` → `¿Y la garantía?` → `¿Dónde es?` → `¿Qué incluye?` | Responde las 3 primeras preguntas. La 4.ª **no** la responde: los 4 turnos ya se gastaron (el primero fue la recomendación) y sale **por defecto** a la despedida. | … N4 ×4 · N4→N3 |
| J | *Sin flujo elegido:* `¿Dónde quedan y cuál es el horario?` | Responde **Sofi** con el prompt del paso 2. | — |

> En la columna *Nodos*, `→` = en el mismo turno; `·` = espera el siguiente mensaje del cliente.

**Qué observar además:**
- En el escenario B la IA debe referirse a **la hija** («el curso ideal para su hija…»), y en A, D o E hablarle directamente al estudiante. Si no lo hace, revisa que el objetivo del nodo IA tenga la frase sobre padre, madre o acudiente.
- En el escenario A, la IA responde **en el mismo turno** en que llega a N6, con `¿cuánto vale?` ya en contexto.

**Si algo falla:**

| Síntoma | Revisa |
|---|---|
| No responde nada o se queda en una captura | La *Qué se espera* de N2 o N10: debe tener el valor de escape `'otro'`. Si la IA no extrae el dato, el nodo espera **sin volver a preguntar**. |
| `Hola` se va por ubicación o asesor | Que N19 tenga la intención `otro`. |
| Grado 11 cae en el Intensivo | Que N5 tenga la rama `contiene` · `11` apuntando a **N10**. |
| La jornada siempre cae en el Sabatino | Que N9 use `contiene` (no *es igual a*) con `manana` y `tarde`. |
| Error *nodo huérfano* al guardar | Ese nodo no tiene ninguna conexión de entrada: revisa la tabla 3.6. |
| Inventa precios | Que las 3 tarjetas del Paso 1 estén «Indexado». |
| El flujo no arranca | Que lo elegiste en la sesión de prueba y que el disparador es `Siempre`. |
| Quieres saber por qué respondió algo | El contexto de cada respuesta en `/settings/knowledge/context`. |

---

> Cuando esto funcione, puedes pasar a la versión completa (`00-test-preicfes.md`) o cargarla con los scripts
> `01-mongosh-carga-preicfes.js` y `02-navegador-kb-faqs.js`.
