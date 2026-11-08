# Flujo base — Pre-ICFES Estudiando (un solo flujo, 14 nodos, los 9 tipos)

> Un único flujo corto, basado en el **Ejemplo 1** de `EJEMPLOS SOFIAPP.docx`: cliente graduado → carrera →
> recomendación del curso → cuotas → inscripción → asesor humano. Datos ficticios.
> Sesión: `user1-preicfes@estudiando.co`. Referencia de nodos: `00-flows-documentation.md`.

| Paso | Qué | Dónde |
|---|---|---|
| 1 | Base de conocimiento: 3 tarjetas | `/settings/knowledge` |
| 2 | Prompt del asistente | `/settings/assistant` |
| 3 | El flujo | `/flows` → *Nuevo flujo* |
| 4 | Probar | `/settings/assistant/test` |

---

## Paso 1 · Base de conocimiento

Llena solo estos campos; deja vacíos los demás. Las 3 tarjetas deben quedar en **«Indexado»**.

**1.1 «Información de la empresa»**

| Campo | Pegar |
|---|---|
| Nombre comercial | `Pre-ICFES Estudiando` |
| ¿A qué se dedica? | `Instituto de preparación para la Prueba Saber 11 (ICFES) en Pasto y Popayán. Atendemos estudiantes de grado 11 y bachilleres graduados con clases presenciales, material por áreas, talleres, simulacros tipo ICFES, seguimiento académico y taller de orientación profesional.` |

**1.2 «Productos y servicios»**

*¿Qué vende o qué servicios presta?*
```text
Cursos de preparación para la Prueba Saber 11 (ICFES): Intensivo con Garantía para graduados, Semi-intensivo para grado 11 y Curso Sabatino. Inscripción de $100.000 para separar el cupo.
```

| Nombre | Qué es o qué incluye |
|---|---|
| `Intensivo con Garantía` | `Modalidad intensiva, doble jornada, para graduados. Lunes a viernes 8:00 a.m.-12:00 m y 2:00-6:00 p.m. Inicia 12 ene 2027 y dura hasta que presente el ICFES. Garantía: si no alcanza el puntaje de su carrera, repite el curso sin costo. Inversión $4.200.000. Inscripción $100.000.` |
| `Semi-intensivo` | `Para grado 11. Jornada tarde (colegios de la mañana) lunes a viernes 2:30-5:30 p.m., o jornada mañana (colegios de la tarde) 7:00-10:00 a.m. Inicia 1 feb 2027, 5 meses. $2.400.000.` |
| `Curso Sabatino` | `Para grado 11 o graduados que trabajan. Sábados 8:00 a.m.-1:00 p.m. Inicia 6 feb 2027, 6 meses. $1.800.000.` |

**1.3 «Información Complementaria»**
```text
PAGO A CUOTAS
Intensivo con Garantía: 2 cuotas mensuales. Inscripción inicial de $100.000 para separar el cupo; primera cuota hasta el día de inicio del curso; segunda cuota un mes después.
Semi-intensivo y Sabatino: 3 cuotas mensuales. Inscripción inicial de $100.000; primera cuota hasta el día de inicio; segunda un mes después; tercera dos meses después.

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

---

## Paso 2 · Prompt del asistente

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
- Si escribe un padre, madre o acudiente, habla del estudiante; si escribe el estudiante, háblale directamente.
```

---

## Paso 3 · El flujo (`/flows` → *Nuevo flujo*)

**Nombre:** `Pre-ICFES base` · **Disparador:** `Siempre` · **No lo actives** (se prueba desde el chat de prueba).

### 3.1 Mapa

```text
[N1 Intención] (inicio)
 ├─ sedes ──────→ [N2 KB Sedes] → [N3 Espera 2 min] ──────────────┐
 ├─ asesor ─────→ [N12 Aviso asesor] → [N13 Handoff] ✖            │
 └─ otro / defecto → [N4 Saludo] ─────────────────────────────────┤
                                                                   ↓
                                                      [N5 Captura situación]
                                                                   ↓
                                                      [N6 Condición situación]
        ├─ contiene «gradu» → [N7 Captura carrera] → [N8 IA Intensivo]
        ├─ contiene «11» / «once» ───────────────→ [N9 IA Grado 11]
        └─ defecto ──────────────────────────────→ [N8 IA Intensivo]

N8 y N9, salidas:
 ├─ quiere_inscribirse → [N10 KB Inscripción] → [N11 Crear lead] → [N12 Aviso asesor] → [N13 Handoff] ✖
 └─ no_necesita_mas / defecto → [N14 Despedida] ✖
```

| Tipo | Nodos |
|---|---|
| 💬 Mensaje | N4, N12, N14 |
| 📝 Captura | N5, N7 |
| 🤖 Asistente IA | N8, N9 |
| 🔀 Condición | N6 |
| 📚 Base de conocimiento | N2, N10 |
| ⚙️ Acción | N11 |
| 🙋 Transferir a humano | N13 |
| ⏳ Espera | N3 |
| 🎯 Intención | N1 |

### 3.2 Cómo se usa el editor (lo mínimo)

- **Crear nodo:** **+ Agregar nodo** → tipo. **Configurar:** clic en el nodo → inspector (panel derecho).
- **Nodos de una salida** (Mensaje, Captura, KB, Acción, Espera): arrastra desde el punto de abajo hasta el destino.
- **Nodos con ramas** (Intención, Condición, Asistente IA): el destino de cada rama se elige en el **inspector**, no arrastrando.
- **Condición** compara lo que el cliente **acaba de escribir**, por eso usa **contiene**. Mayúsculas y tildes no importan.
- Al guardar, todo nodo (menos el inicial) necesita al menos una conexión de entrada.

### 3.3 Crea los 14 nodos

Créalos en cualquier orden y configura solo sus **textos**; los destinos de las ramas van en 3.4.

| Nodo | Tipo | Configuración |
|---|---|---|
| **N1** Intención | 🎯 Intención | Ver ramas en 3.4. |
| **N2** KB Sedes | 📚 KB | *Pregunta fija:* `Dirección de las sedes de Pasto y Popayán y horario de atención`<br>*Si no hay respuesta:* `Tenemos sedes en Pasto y Popayán 📍 Un asesor le comparte la dirección exacta y el horario.` |
| **N3** Espera | ⏳ Espera | *Minutos:* `2` |
| **N4** Saludo | 💬 Mensaje | `Buenos días 👋 Bienvenido a Pre-ICFES Estudiando. Soy Sofi, asesora virtual 📚 Estoy aquí para ayudarle a encontrar el curso perfecto para alcanzar su meta universitaria 🎯` |
| **N5** Captura situación | 📝 Captura | *Pregunta:* `📚 Antes de darle la mejor recomendación, cuénteme la situación académica del estudiante: ¿en qué grado va o ya se graduó?`<br>*Nombre del dato:* `situacion`<br>*Qué se espera:* `Situación académica del estudiante, escriba él o un padre, madre o acudiente. Devuelve exactamente '11' si cursa grado once, 'graduado' si ya terminó el colegio (bachiller, egresado), u 'otro' en cualquier otro caso, incluido si no lo dice.`<br>*Tipo de dato:* `Texto` |
| **N6** Condición situación | 🔀 Condición | Ver ramas en 3.4. |
| **N7** Captura carrera | 📝 Captura | *Pregunta:* `🎯 Perfecto, nos podemos convertir en sus mejores aliados para lograr un buen puntaje. ¿Qué carrera le gustaría estudiar y a qué universidad sueña ingresar?`<br>*Nombre del dato:* `carrera`<br>*Qué se espera:* `Carrera y universidad que quiere el estudiante. Devuelve el texto breve (ej. 'Arquitectura, Universidad de Nariño'), o 'sin_dato' si no lo dice.`<br>*Tipo de dato:* `Texto` |
| **N8** IA Intensivo | 🤖 IA | *Objetivo:* `Eres Sofi, asesora virtual de Pre-ICFES Estudiando. Ya saludaste: no vuelvas a saludar. Trata de usted, sé breve (máximo 6 líneas) y usa pocos emojis. Si escribe un padre, madre o acudiente, habla del estudiante. El estudiante ya se graduó o no dijo su grado: menciona la carrera que quiere (si la dijo) y recomienda el Intensivo con Garantía con modalidad, horario, fecha de inicio, garantía, inversión e inscripción. Resuelve dudas (cuotas, inscripción) solo con la base de conocimiento y al final pregunta si desea asegurar su cupo o recibir más información.`<br>*Consultar la base de conocimiento:* **activado** · *Máximo de turnos:* `4`<br>Salidas y *Si no resuelve* en 3.4. |
| **N9** IA Grado 11 | 🤖 IA | *Objetivo:* `Eres Sofi, asesora virtual de Pre-ICFES Estudiando. Ya saludaste: no vuelvas a saludar. Trata de usted, sé breve (máximo 6 líneas) y usa pocos emojis. Si escribe un padre, madre o acudiente, habla del estudiante. El estudiante está en grado 11: presenta el Semi-intensivo (jornada tarde si su colegio es en la mañana, jornada mañana si es en la tarde) y el Curso Sabatino, con horario, fecha de inicio y precio; si no sabe la jornada del colegio, pregúntala. Resuelve dudas (cuotas, inscripción) solo con la base de conocimiento y al final pregunta si desea asegurar su cupo o recibir más información.`<br>*Consultar la base de conocimiento:* **activado** · *Máximo de turnos:* `4`<br>Salidas y *Si no resuelve* en 3.4. |
| **N10** KB Inscripción | 📚 KB | *Pregunta fija:* `¿Cuál es el proceso de inscripción paso a paso?`<br>*Si no hay respuesta:* `¡Excelente! 🎉 Enseguida un asesor le envía el proceso de inscripción.` |
| **N11** Crear lead | ⚙️ Acción | *Qué hace:* **Crear un lead** |
| **N12** Aviso asesor | 💬 Mensaje | `¡Perfecto! 🙌 Le comunico con uno de nuestros asesores, que en un momento continúa con usted por este mismo chat.` |
| **N13** Handoff | 🙋 Transferir a humano | *Motivo:* `Quiere inscribirse o pidió un asesor` |
| **N14** Despedida | 💬 Mensaje | `¡Con mucho gusto! 🙏 Gracias por escribirnos. Aquí estaremos cuando necesite ayuda para tomar una excelente decisión ✨` |

### 3.4 Conexiones

**Arrastrando** (nodos de una salida):

| Desde | Hacia |
|---|---|
| N2 KB Sedes | N3 Espera |
| N3 Espera | N5 Captura situación |
| N4 Saludo | N5 Captura situación |
| N5 Captura situación | N6 Condición situación |
| N7 Captura carrera | N8 IA Intensivo |
| N10 KB Inscripción | N11 Crear lead |
| N11 Crear lead | N12 Aviso asesor |
| N12 Aviso asesor | N13 Handoff |

**Desde el inspector** (nodos con ramas):

| Nodo | Rama | Condición / descripción | Destino |
|---|---|---|---|
| **N1** Intención | `sedes` | `Pregunta dónde quedan, la dirección, las sedes o el horario de atención.` | N2 |
| | `asesor` | `Pide hablar con un asesor, una persona o que lo llamen.` | N12 |
| | `otro` | `Saluda, pide información, pregunta por cursos o precios, o escribe cualquier otra cosa.` | N4 |
| | *Si no reconoce ninguna* | | N4 |
| **N6** Condición | contiene `gradu` | | N7 |
| | contiene `11` | | N9 |
| | contiene `once` | | N9 |
| | *Si ninguna coincide* | | N8 |
| **N8** y **N9** (iguales) | `quiere_inscribirse` | `El cliente dice que quiere inscribirse, tomar el curso, separar el cupo o recibir los pasos de inscripción.` | N10 |
| | `no_necesita_mas` | `El cliente dice que no necesita nada más, que no le interesa o se despide.` | N14 |
| | *Si no resuelve, ir a* | | N14 |

Después, en N1 pulsa **Marcar como inicio** y **Guarda**. N1 debe decir *Nodo de inicio*.

---

## Paso 4 · Probar (`/settings/assistant/test`)

Elige el flujo **Pre-ICFES base**, pulsa **Reiniciar** y escribe un mensaje por turno. Es el Ejemplo 1 del docx:

| # | Escribe | Debe pasar |
|---|---|---|
| 1 | `Hola, me gustaría obtener más información` | Saludo + pregunta de la situación académica. *(N1→N4→N5)* |
| 2 | `Soy de Pasto y ya estoy graduado` | Pregunta la carrera y la universidad. *(N6→N7)* |
| 3 | `Arquitectura, en la Universidad de Nariño` | Recomienda el **Intensivo con Garantía** ($4.200.000, garantía, horario) y pregunta si desea asegurar el cupo. *(N8)* |
| 4 | `¿Tienen facilidades de pago? ¿Se puede a cuotas?` | Explica las **2 cuotas** del Intensivo. *(N8)* |
| 5 | `Me interesa tomar el curso intensivo` | Proceso de inscripción, aviso y **transferencia**. Tarjetas: **Lead creado** y **Transferido**; la IA queda apagada. *(N10→N11→N12→N13)* |

**Las otras ramas** (una línea cada una, tras **Reiniciar**):

| Escribe | Debe pasar |
|---|---|
| `¿Dónde quedan y cuál es el horario?` → *(adelantar espera)* | Direcciones → espera → llega la pregunta de situación. *(N1→N2→N3→N5)* |
| `Quiero hablar con un asesor` | Aviso y transferencia, sin lead. *(N1→N12→N13)* |
| `Hola` → `Estoy en once` | Semi-intensivo y Sabatino. *(N6→N9)* |

**Si algo falla**

| Síntoma | Revisa |
|---|---|
| Se queda en una captura | *Qué se espera* de N5/N7 debe tener valor de escape (`'otro'`, `'sin_dato'`). |
| `Hola` se va a sedes o asesor | Que N1 tenga la intención `otro`. |
| Grado 11 cae en el Intensivo | Que N6 tenga `contiene` `11` apuntando a **N9**. |
| Error *nodo huérfano* | Ese nodo no tiene conexión de entrada: revisa 3.4. |
| Inventa precios | Que las 3 tarjetas estén «Indexado». |
