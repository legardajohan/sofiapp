/* eslint-disable */
// =====================================================================================================
//  01-mongosh-carga-preicfes.js — Carga directa en MongoDB del contenido de prueba de Pre-ICFES
// =====================================================================================================
//
//  Fuente de los datos: 00-test-preicfes.md (secciones §1, §5, §6, §7 y §9).
//
//  QUÉ CARGA (todo lo que NO necesita embeddings):
//    1. Etiquetas ................ colección `tags`
//    2. Prompt + tono del asistente  `prompttemplates` (method 'chat' del tenant, con respaldo)
//    3. Reglas de transferencia .. `handoff_settings`
//    4. Flujos F1, F2, F3 ........ `flows` (siempre en BORRADOR y sin activar)
//    5. Recordatorio (opcional) .. `tenants.recordatorio` (desactivado por defecto)
//
//  QUÉ NO CARGA: base de conocimiento y FAQs. Necesitan embeddings de Gemini y la cola de
//  indexación (BullMQ/Redis), que mongosh no puede generar. Para eso está
//  `02-navegador-kb-faqs.js` (se pega en la consola del navegador y usa el API).
//
//  CÓMO EJECUTAR:
//    mongosh "<MONGODB_URI>" --file .test-chat/01-mongosh-carga-preicfes.js
//  Primero con DRY_RUN = true para ver qué haría; luego con false.
//
//  Es IDEMPOTENTE: se puede ejecutar varias veces. Las etiquetas no se duplican; los flujos se
//  actualizan por nombre (y suben de `version`); el prompt se versiona como lo hace la app.
//
//  ⚠️ Escribe directo en la base, sin pasar por el API ni por el repositorio tenant-safe.
//  Es SOLO para el entorno de pruebas. Cada operación filtra explícitamente por TENANT_ID.
// =====================================================================================================

// ─── Configuración ───────────────────────────────────────────────────────────────────────────────────

/**
 * Nombre de la base de datos. null = usa la base de la URI con la que abriste mongosh
 * (la que va al final de MONGODB_URI, p. ej. mongodb+srv://…/sofiapp). Ponlo solo si la URI no la trae.
 */
const DB_NAME = null;

/** Usuario admin del tenant. De él sale el tenantId, igual que en la app (el tenant nace del usuario). */
const USER_EMAIL = 'user1-preicfes@estudiando.co';

/** true = solo imprime lo que haría, sin escribir nada. */
const DRY_RUN = true;

/** El recordatorio de inactividad es global del tenant y ENVÍA mensajes reales por WhatsApp. */
const ACTIVAR_RECORDATORIO = false;

// ─── Conexión y resolución del tenant ────────────────────────────────────────────────────────────────

const database = DB_NAME ? db.getSiblingDB(DB_NAME) : db;
if (database.getName() === 'test') {
  throw new Error('Estás en la base "test" (la URI no trae nombre de base). Define DB_NAME.');
}
const ahora = new Date();

const usuario = database.users.findOne({ email: USER_EMAIL });
if (!usuario) throw new Error(`No existe el usuario ${USER_EMAIL} en la base "${database.getName()}".`);
if (!usuario.tenantId) throw new Error(`El usuario ${USER_EMAIL} no tiene tenantId (¿es superadmin?).`);

/**
 * ObjectId del tenant PreICFES Estudiando. TODAS las escrituras de este script filtran por él.
 * Si necesitas el id para otras colecciones (clientes, leads, conversaciones…), sale de aquí:
 *   database.<coleccion>.find({ tenantId: TENANT_ID })
 */
const TENANT_ID = usuario.tenantId;

/** ObjectId del usuario admin. Útil si luego necesitas, por ejemplo, `asesorDestinoId` en handoff. */
const USER_ID = usuario._id;

const tenant = database.tenants.findOne({ _id: TENANT_ID });
if (!tenant) throw new Error(`El tenant ${TENANT_ID} no existe.`);

print('──────────────────────────────────────────────');
print(` Base: ${database.getName()}   DRY_RUN: ${DRY_RUN}`);
print(` Usuario: ${USER_EMAIL}  (${USER_ID})`);
print(` Tenant:  ${tenant.nombre ?? '(sin nombre)'}  (${TENANT_ID})`);
print('──────────────────────────────────────────────');

function escribir(descripcion, fn) {
  if (DRY_RUN) {
    print(`[DRY_RUN] ${descripcion}`);
    return null;
  }
  const r = fn();
  print(`✔ ${descripcion}`);
  return r;
}

// =====================================================================================================
// 1. ETIQUETAS (`tags`)  — §1 del .md
// =====================================================================================================
// El índice único es { tenantId, nombre } con collation es/strength 2 (no distingue mayúsculas ni
// tildes), por eso las búsquedas usan la misma collation.

const COLLATION_ES = { locale: 'es', strength: 2 };

const ETIQUETAS = [
  { nombre: 'Grado 11', color: '#2563EB' },
  { nombre: 'Graduado', color: '#7C3AED' },
  { nombre: 'Grado 9-10', color: '#0891B2' },
  { nombre: 'Interés UdeA', color: '#16A34A' },
  { nombre: 'Aniversario', color: '#EA580C' },
  { nombre: 'Popayán', color: '#DB2777' },
  { nombre: 'Pide cuotas', color: '#CA8A04' },
];

for (const { nombre, color } of ETIQUETAS) {
  const existe = database.tags.find({ tenantId: TENANT_ID, nombre }).collation(COLLATION_ES).limit(1).toArray()[0];
  if (existe) {
    print(`• Etiqueta "${nombre}" ya existe (${existe._id})`);
    continue;
  }
  escribir(`Crear etiqueta "${nombre}"`, () =>
    database.tags.insertOne({ tenantId: TENANT_ID, nombre, color, createdAt: ahora, updatedAt: ahora }),
  );
}

/**
 * Mapa nombre → id (string) de las etiquetas del tenant.
 * Los nodos `accion` de tipo `aplicar_etiquetas` guardan `tagIds` como STRING (igual que el API).
 * Si después necesitas el id de una etiqueta para otra colección:  TAG_IDS['Grado 11']
 */
const TAG_IDS = {};
for (const t of database.tags.find({ tenantId: TENANT_ID }).toArray()) TAG_IDS[t.nombre] = t._id.toString();

function tagId(nombre) {
  const clave = Object.keys(TAG_IDS).find(
    (k) => k.localeCompare(nombre, 'es', { sensitivity: 'base' }) === 0,
  );
  if (clave) return TAG_IDS[clave];
  if (DRY_RUN) return `000000000000000000000000`; // la etiqueta aún no existe en modo simulación
  throw new Error(`Falta la etiqueta "${nombre}"`);
}

// =====================================================================================================
// 2. COMPORTAMIENTO DEL ASISTENTE (`prompttemplates`, method 'chat')  — §5 del .md
// =====================================================================================================
// Replica `updateAssistantConfig`: el tenant tiene su propia plantilla 'chat' activa; si no la tiene,
// hereda la global (tenantId: null). La versión se incrementa en el último segmento ("1.0" → "1.1"),
// y eso invalida la caché de respuestas de IA (la versión forma parte de la clave).

const TONO = 'Cálido, cercano y profesional. Trata de usted, frases cortas, emojis con moderación (1 a 3 por mensaje) y siempre orientado a ayudar al estudiante a elegir su curso.';

const SYSTEM_PROMPT = `Eres Andrea Caicedo, asesora virtual de Pre-ICFES Estudiando, un instituto de preparación para la Prueba Saber 11 (ICFES) y exámenes de admisión universitaria con sedes en Pasto y Popayán.

OBJETIVO
Asesorar a estudiantes y padres de familia para que elijan el curso adecuado y avancen a la inscripción.

REGLAS GENERALES
- Trata siempre de usted. Mensajes breves (máximo 8 líneas), claros y con emojis moderados.
- Usa SOLO la información del contexto (guía de conocimiento, Mi Comercio y preguntas frecuentes). Si un dato no está, dilo con amabilidad y ofrece comunicar al cliente con un asesor. Nunca inventes precios, fechas ni puntajes.
- Si el cliente comparte su nombre, llámalo por su nombre hasta terminar la conversación. Si no lo comparte, continúa sin problema.
- No vuelvas a preguntar algo que el cliente ya respondió en este chat (nombre, grado, carrera, ciudad).
- Si el cliente hace una pregunta directa sobre un curso, respóndela primero y luego retoma la asesoría.

FLUJO DE ATENCIÓN
Paso 1. Si es el inicio de la conversación, preséntate en 1-2 líneas con tu nombre y cargo.
Paso 2. Pregunta: "Para poderle brindar la mejor asesoría académica, por favor podría compartirme su nombre, el grado que está cursando y la carrera que le gustaría estudiar".
Paso 3. Según lo que responda:
a) Carrera definida: di "Con esta carrera está tomando una excelente decisión para su futuro", comparte las universidades que la ofrecen con el puntaje aproximado de ingreso y un resumen SIN precio de un curso relacionado.
b) Carrera no decidida: di "No se preocupe, es completamente normal en esta etapa. Nuestro curso incluye un taller de orientación profesional que le ayuda a tomar esa decisión con mayor claridad."
c) Grado 9° o 10°: menciona que para su etapa tenemos el curso Saber 11 para Grados 9° y 10° y pregunta si desea más información. Si dice que sí, envía la información; si dice que no, agradece y dile que estaremos atentos cuando esté en grado 11.
d) Grado 11: envía el resumen SIN precios del Curso Sabatino y de los Semi-intensivos (jornada tarde para colegios de la mañana, jornada mañana para colegios de la tarde) y pregunta de cuál quiere más información. Cuando elija, envía el detalle con horarios y precio.
e) Graduado: envía el resumen SIN precio del Pre-ICFES Intensivo con Garantía y pregunta si desea conocer más o prefiere otra opción. Si quiere otra opción, ofrece el Curso de Aniversario (precio especial, cupos limitados). Si no tiene tiempo completo, ofrece Semi-intensivos y Sabatino. Si nada le interesa, lista los cursos disponibles.
f) Universidad de Antioquia (UdeA): envía la información de Pre-U UdeA presencial y virtual.
g) Cuotas o pago a cuotas: explica el pago a cuotas de la guía de conocimiento.
h) No dice el grado o no responde las preguntas: envía la información del Pre-ICFES Intensivo con Garantía.
i) Menciona "aniversario" o "curso de oferta": envía la información del Curso de Aniversario.
j) Menciona Popayán, Cauca o Huila: envía SOLO los cursos en oferta de la sede Popayán (50% y 20% de descuento).
Paso 4. Después de dar la información, agradece y pregunta: "Para continuar con su proceso, ¿hay algo más que desee conocer o le gustaría continuar con los pasos a seguir para la inscripción?"
- Si acepta los pasos: envía el proceso de inscripción de la guía de conocimiento y avisa que un asesor continuará con su inscripción.
- Si no desea continuar: agradece y pregunta si hay algo más en lo que podamos ayudar.
- Si no necesita nada más: despídete con "Gracias por su tiempo y disposición. Recuerde que aquí en Pre-ICFES Estudiando siempre estaremos listos para ayudarle a tomar una excelente decisión cuando lo necesite."

FORMATO DE INFORMACIÓN DE CURSO
Usa líneas con emoji: 📚 Modalidad · 🕒 Horario · 📅 Días · 📆 Inicio · 💰 Inversión · 📝 Inscripción · 💳 Formas de pago. Muestra precios solo cuando el paso lo indique o el cliente los pida.`;

if (TONO.length > 200) throw new Error(`TONO supera 200 caracteres (${TONO.length})`);
if (SYSTEM_PROMPT.length > 8000) throw new Error(`SYSTEM_PROMPT supera 8000 caracteres (${SYSTEM_PROMPT.length})`);

/** Copia de `bumpVersion` (apps/backend/src/features/ai/ai-assistant.service.ts). */
function bumpVersion(actual) {
  const partes = String(actual).split('.');
  const ultimo = Number(partes[partes.length - 1]);
  if (partes.length === 0 || Number.isNaN(ultimo)) return `${actual}.1`;
  partes[partes.length - 1] = String(ultimo + 1);
  return partes.join('.');
}

const plantillaTenant = database.prompttemplates.findOne({ tenantId: TENANT_ID, method: 'chat', isActive: true });
const plantillaGlobal = database.prompttemplates.findOne({ tenantId: null, method: 'chat', isActive: true });
const plantillaBase = plantillaTenant ?? plantillaGlobal;
if (!plantillaBase) throw new Error('No hay plantilla de chat (ni del tenant ni global). Corre seed-prompt-templates primero.');

if (plantillaTenant && plantillaTenant.systemPrompt === SYSTEM_PROMPT && plantillaTenant.tono === TONO) {
  print(`• Prompt del asistente ya está al día (versión ${plantillaTenant.version})`);
} else {
  const nuevaVersion = bumpVersion(plantillaBase.version);

  if (plantillaTenant) {
    // RESPALDO del prompt anterior: copia inactiva (isActive:false), invisible para la app.
    // Para restaurarlo: activa el respaldo y desactiva el actual, o copia su systemPrompt en la UI.
    //   database.prompttemplates.find({ tenantId: TENANT_ID, method: 'chat', isActive: false }).sort({ createdAt: -1 })
    const { _id, ...resto } = plantillaTenant;
    escribir(`Respaldar prompt actual del tenant (versión ${plantillaTenant.version}) como inactivo`, () =>
      database.prompttemplates.insertOne({ ...resto, isActive: false, respaldoDe: _id, createdAt: ahora, updatedAt: ahora }),
    );
    escribir(`Actualizar prompt del tenant → versión ${nuevaVersion}`, () =>
      database.prompttemplates.updateOne(
        { _id: plantillaTenant._id, tenantId: TENANT_ID },
        { $set: { tono: TONO, systemPrompt: SYSTEM_PROMPT, version: nuevaVersion, isActive: true, updatedAt: ahora } },
      ),
    );
  } else {
    escribir(`Crear prompt propio del tenant (heredaba el global ${plantillaGlobal.version}) → versión ${nuevaVersion}`, () =>
      database.prompttemplates.insertOne({
        tenantId: TENANT_ID,
        method: 'chat',
        version: nuevaVersion,
        systemPrompt: SYSTEM_PROMPT,
        tono: TONO,
        isActive: true,
        createdAt: ahora,
        updatedAt: ahora,
      }),
    );
  }
}

// =====================================================================================================
// 3. REGLAS DE TRANSFERENCIA A ASESOR (`handoff_settings`, uno por tenant)  — §6 del .md
// =====================================================================================================
// Límites del validador: cada frase/palabra 2–80 car., máx. 30 por lista; `umbral` ≥ KB_MIN_SCORE
// (0.75 por defecto en env.ts) y ≤ 1. Con estrategia 'fijo' haría falta `asesorDestinoId`
// (por ejemplo USER_ID o el _id de un asesor: database.users.find({ tenantId: TENANT_ID })).
// `condicionesExtras` no se toca: si ya tenías condiciones extra, se conservan.

const HANDOFF = {
  activo: true,
  asesorDestinoId: null,
  estrategiaDestino: 'menor_carga',
  mensajeTransicion: '¡Excelente decisión! 🙌 En un momento uno de nuestros asesores continúa con su inscripción.',
  reglas: {
    explicitRequest: {
      activa: true,
      frases: ['hablar con un asesor', 'hablar con una persona', 'quiero inscribirme', 'pasos de inscripción', 'separar el cupo', 'llamarme'],
    },
    keyword: { activa: true, palabras: ['inscripción', 'matricular', 'pagar ya', 'contrato', 'queja', 'reclamo'] },
    lowConfidence: { activa: true, umbral: 0.78 },
    intentPurchase: { activa: true, nivelMinimo: 'caliente' },
  },
};

escribir('Guardar reglas de transferencia (upsert)', () =>
  database.handoff_settings.updateOne(
    { tenantId: TENANT_ID },
    {
      $set: { ...HANDOFF, updatedAt: ahora },
      $setOnInsert: { tenantId: TENANT_ID, condicionesExtras: [], createdAt: ahora },
    },
    { upsert: true },
  ),
);

// =====================================================================================================
// 4. FLUJOS (`flows`)  — §7 del .md
// =====================================================================================================
// Se guardan como `borrador` y `activo: false` (solo puede haber UN flujo activo por tenant y, activo,
// respondería en el WhatsApp real). Se prueban eligiéndolos en «Probar asistente».
// Si un flujo con el mismo nombre ya existe, se reemplaza su grafo y se incrementa `version`
// (igual que un PUT /api/flows/:id). Los marcadores "TAG:<nombre>" se resuelven con tagId().

const OBJ_TONO = 'Eres Andrea Caicedo, asesora virtual de Pre-ICFES Estudiando. Trata de usted, llama al cliente por su nombre si lo compartió, sé breve (máximo 8 líneas) y usa emojis con moderación.';
const SALIDA_INSCRIBIRSE = 'El cliente dice explícitamente que quiere inscribirse, tomar el curso, separar el cupo o pagar.';

const n = (id, tipo, x, y, config) => ({ id, tipo, posicion: { x, y }, config: { tipo, ...config } });
const e = (id, from, to) => ({ id, from, to });

const FLUJOS = [
  // ── F1 · Flujo común – asesoría de cursos (disparador: primer mensaje) ──────────────────────────────
  {
    nombre: 'F1 · Flujo común – asesoría de cursos',
    entrada: 'n_inicio',
    trigger: { tipo: 'primer_mensaje' },
    nodos: [
      n('n_inicio', 'mensaje', 60, 300, { texto: '¡Hola! 😊 Bienvenido a Pre-ICFES Estudiando.\nSoy Andrea Caicedo, asesora virtual 📚 Estoy aquí para ayudarle a encontrar el curso perfecto para alcanzar su meta universitaria 🎯' }),
      n('n_nombre', 'captura', 360, 300, {
        campo: 'nombre', tipoDato: 'texto', reintentos: 1,
        pregunta: 'Para poderle brindar la mejor asesoría académica, ¿me comparte por favor su nombre? 🙂',
        descripcion: "Nombre de pila de la persona. Si no lo comparte o responde otra cosa, devuelve exactamente 'sin_nombre'.",
      }),
      n('n_grado', 'captura', 660, 300, {
        campo: 'grado', tipoDato: 'texto', reintentos: 1,
        pregunta: '📚 ¿En qué grado está el estudiante? Si ya terminó el colegio, cuénteme que es graduado.',
        descripcion: "Situación académica. Devuelve exactamente uno de: '11' (grado once), '10', '9', 'graduado' (ya terminó el bachillerato) u 'otro' (otro grado, o no lo dice).",
      }),
      n('n_carrera', 'captura', 960, 300, {
        campo: 'carrera', tipoDato: 'texto', reintentos: 1,
        pregunta: '🎯 ¿Qué carrera le gustaría estudiar y en qué universidad sueña ingresar?',
        descripcion: "Carrera y universidad mencionadas, por ejemplo 'Medicina - Udenar' o 'Derecho - UdeA'. Si dice que no ha decidido, devuelve 'indeciso'. Si no responde la pregunta, devuelve 'sin_dato'.",
      }),
      n('n_ruta_udea', 'condicion', 1260, 300, {
        variable: 'var:carrera',
        ramas: [
          { operador: 'contiene', valor: 'udea', nodoDestino: 'n_tag_udea' },
          { operador: 'contiene', valor: 'antioquia', nodoDestino: 'n_tag_udea' },
        ],
        ramaPorDefecto: 'n_ruta_grado',
      }),
      n('n_tag_udea', 'accion', 1560, 40, { efecto: { tipo: 'aplicar_etiquetas', tagIds: ['TAG:Interés UdeA'] } }),
      n('n_ruta_grado', 'condicion', 1560, 420, {
        variable: 'var:grado',
        ramas: [
          { operador: 'igual_a', valor: '11', nodoDestino: 'n_tag_11' },
          { operador: 'contiene', valor: 'once', nodoDestino: 'n_tag_11' },
          { operador: 'contiene', valor: 'gradu', nodoDestino: 'n_tag_grad' },
          { operador: 'igual_a', valor: '10', nodoDestino: 'n_tag_910' },
          { operador: 'igual_a', valor: '9', nodoDestino: 'n_tag_910' },
        ],
        ramaPorDefecto: 'n_ia_otro',
      }),
      n('n_tag_11', 'accion', 1860, 220, { efecto: { tipo: 'aplicar_etiquetas', tagIds: ['TAG:Grado 11'] } }),
      n('n_tag_grad', 'accion', 1860, 400, { efecto: { tipo: 'aplicar_etiquetas', tagIds: ['TAG:Graduado'] } }),
      n('n_tag_910', 'accion', 1860, 580, { efecto: { tipo: 'aplicar_etiquetas', tagIds: ['TAG:Grado 9-10'] } }),
      n('n_ia_udea', 'ia', 2160, 40, {
        usarKb: true, maxTurnos: 6, ramaPorDefecto: 'n_paso4',
        objetivo: `${OBJ_TONO} El cliente quiere ingresar a la Universidad de Antioquia (UdeA). Envía la información de los cursos Pre-U UdeA Presencial y Pre-U UdeA Virtual con horarios y precios, aclara que la UdeA aplica su propio examen de admisión y pregunta qué modalidad prefiere. Responde sus dudas usando solo la guía de conocimiento.`,
        salidas: [
          { etiqueta: 'detalle_enviado', descripcion: 'Ya enviaste la información de los cursos UdeA y el cliente responde agradeciendo, confirmando la modalidad o sin nuevas preguntas.', nodoDestino: 'n_paso4' },
          { etiqueta: 'quiere_inscribirse', descripcion: SALIDA_INSCRIBIRSE, nodoDestino: 'n_kb_inscripcion' },
          { etiqueta: 'no_interesado', descripcion: 'El cliente dice que no le interesan los cursos o que no quiere más información.', nodoDestino: 'n_despedida' },
        ],
      }),
      n('n_ia_11', 'ia', 2160, 220, {
        usarKb: true, maxTurnos: 6, ramaPorDefecto: 'n_paso4',
        objetivo: `${OBJ_TONO} El estudiante está en grado 11. 1) Si mencionó una carrera, di 'Con esta carrera está tomando una excelente decisión para su futuro' y comparte las universidades que la ofrecen con el puntaje aproximado de ingreso. Si no ha decidido, di 'No se preocupe, es completamente normal en esta etapa. Nuestro curso incluye un taller de orientación profesional que le ayuda a tomar esa decisión con mayor claridad.' 2) Envía la información RESUMIDA y SIN PRECIOS del Curso Sabatino y de los Semi-intensivos (jornada tarde para colegios de la mañana y jornada mañana para colegios de la tarde). 3) Pregunta de cuál curso le gustaría recibir más información. 4) Cuando elija uno, envía el detalle con horarios, inscripción y precio. Si pregunta por cuotas, explica el pago a cuotas. Usa solo la guía de conocimiento.`,
        salidas: [
          { etiqueta: 'detalle_enviado', descripcion: 'Ya enviaste el detalle con precio del curso que eligió y el cliente responde agradeciendo, confirmando o sin nuevas preguntas.', nodoDestino: 'n_paso4' },
          { etiqueta: 'quiere_inscribirse', descripcion: SALIDA_INSCRIBIRSE, nodoDestino: 'n_kb_inscripcion' },
          { etiqueta: 'no_interesado', descripcion: 'El cliente dice que no quiere más información o que no le interesan los cursos.', nodoDestino: 'n_despedida' },
        ],
      }),
      n('n_ia_grad', 'ia', 2160, 400, {
        usarKb: true, maxTurnos: 6, ramaPorDefecto: 'n_paso4',
        objetivo: `${OBJ_TONO} El cliente ya es graduado. 1) Si mencionó una carrera, felicítalo por la elección y comparte el puntaje aproximado de ingreso. 2) Envía la información RESUMIDA y SIN PRECIO del Pre-ICFES Intensivo con Garantía relacionándola con su carrera y pregunta si desea conocer más de esta modalidad o prefiere otra opción. 3) Si dice que sí, envía el detalle completo con precio. 4) Si prefiere otra opción, cuéntale que estamos de aniversario y envía el Curso de Aniversario (precio especial, cupos limitados). 5) Si dice que no tiene tiempo completo o pide otra modalidad, envía los Semi-intensivos y el Curso Sabatino. 6) Si nada le interesa, lista brevemente los cursos disponibles y ofrece ayuda. Usa solo la guía de conocimiento.`,
        salidas: [
          { etiqueta: 'detalle_enviado', descripcion: 'Ya enviaste el detalle con precio de un curso y el cliente responde agradeciendo, confirmando o sin nuevas preguntas.', nodoDestino: 'n_paso4' },
          { etiqueta: 'quiere_inscribirse', descripcion: SALIDA_INSCRIBIRSE, nodoDestino: 'n_kb_inscripcion' },
          { etiqueta: 'no_interesado', descripcion: 'Después de ver las opciones, el cliente dice que ninguna le interesa y no quiere más ayuda.', nodoDestino: 'n_despedida' },
        ],
      }),
      n('n_ia_910', 'ia', 2160, 580, {
        usarKb: true, maxTurnos: 4, ramaPorDefecto: 'n_paso4',
        objetivo: 'Eres Andrea Caicedo, asesora virtual de Pre-ICFES Estudiando. Trata de usted, sé breve y amable, con emojis moderados. El estudiante está en grado 9° o 10°. Menciona amablemente que para esa etapa académica tenemos el curso Saber 11 para Grados 9° y 10°, enfocado en las temáticas de la prueba Saber 11, y pregunta si le gustaría recibir más información. Si dice que sí, envía la información del curso con horario, inicio y precio.',
        salidas: [
          { etiqueta: 'detalle_enviado', descripcion: 'Ya enviaste la información del curso de grados 9° y 10° y el cliente responde agradeciendo o sin nuevas preguntas.', nodoDestino: 'n_paso4' },
          { etiqueta: 'quiere_inscribirse', descripcion: 'El cliente dice explícitamente que quiere inscribir al estudiante o separar el cupo.', nodoDestino: 'n_kb_inscripcion' },
          { etiqueta: 'no_interesado', descripcion: 'El cliente dice que no quiere recibir información del curso.', nodoDestino: 'n_despedida_910' },
        ],
      }),
      n('n_ia_otro', 'ia', 2160, 760, {
        usarKb: true, maxTurnos: 6, ramaPorDefecto: 'n_paso4',
        objetivo: 'Eres Andrea Caicedo, asesora virtual de Pre-ICFES Estudiando. Trata de usted, sé breve (máximo 8 líneas) y usa emojis con moderación. No sabemos en qué grado está el estudiante. Envía la información del Pre-ICFES Intensivo con Garantía (modalidad, horario, inicio, garantía, inversión e inscripción) y pregunta si desea asegurar su cupo o conocer otras opciones. Si pide otras opciones, presenta brevemente los demás cursos. Usa solo la guía de conocimiento.',
        salidas: [
          { etiqueta: 'detalle_enviado', descripcion: 'Ya enviaste la información del curso y el cliente responde agradeciendo o sin nuevas preguntas.', nodoDestino: 'n_paso4' },
          { etiqueta: 'quiere_inscribirse', descripcion: SALIDA_INSCRIBIRSE, nodoDestino: 'n_kb_inscripcion' },
          { etiqueta: 'no_interesado', descripcion: 'El cliente dice que no le interesa ningún curso.', nodoDestino: 'n_despedida' },
        ],
      }),
      n('n_paso4', 'ia', 2460, 400, {
        usarKb: true, maxTurnos: 6, ramaPorDefecto: 'n_despedida',
        objetivo: "Eres Andrea Caicedo, asesora virtual de Pre-ICFES Estudiando. Trata de usted y sé breve. Agradece su respuesta y pregunta: 'Para continuar con su proceso, ¿hay algo más que desee conocer o le gustaría continuar con los pasos a seguir para la inscripción?' Si pide más información de algún curso o de la institución, respóndela con la guía de conocimiento y vuelve a preguntar si hay algo más en lo que podamos asesorarle. Si dice que no desea los pasos, agradece y pregunta si hay algo más en lo que podamos ayudar.",
        salidas: [
          { etiqueta: 'quiere_inscribirse', descripcion: 'El cliente acepta continuar, pide los pasos de inscripción o quiere separar el cupo.', nodoDestino: 'n_kb_inscripcion' },
          { etiqueta: 'no_necesita_mas', descripcion: 'El cliente dice que no necesita nada más, se despide o no quiere continuar.', nodoDestino: 'n_despedida' },
        ],
      }),
      n('n_kb_inscripcion', 'kb', 2760, 220, {
        pregunta: '¿Cuál es el proceso de inscripción paso a paso en Pre-ICFES Estudiando?',
        siNoHayRespuesta: '¡Excelente decisión! 🎉 Enseguida un asesor le comparte el proceso de inscripción.',
      }),
      n('n_lead', 'accion', 3060, 220, { efecto: { tipo: 'crear_lead' } }),
      n('n_estado', 'accion', 3360, 220, { efecto: { tipo: 'cambiar_estado', estado: 'en_gestion' } }),
      n('n_handoff_msg', 'mensaje', 3660, 220, { texto: 'En un momento uno de nuestros asesores continúa con su inscripción 🙌 ¡Gracias por confiar en Pre-ICFES Estudiando!' }),
      n('n_handoff', 'handoff', 3960, 220, { motivo: 'Cliente listo para inscribirse (flujo F1)' }),
      n('n_despedida', 'mensaje', 2760, 560, { texto: 'Gracias por su tiempo y disposición 🙏 Recuerde que aquí en Pre-ICFES Estudiando siempre estaremos listos para ayudarle a tomar una excelente decisión cuando lo necesite. ¡Muchos éxitos! ✨' }),
      n('n_despedida_910', 'mensaje', 2460, 720, { texto: '¡Gracias por su mensaje! 😊 Estaremos atentos cuando el estudiante esté en grado 11 para acompañarlo en su proceso académico. ¡Mucho éxito este año! 📚' }),
    ],
    aristas: [
      e('e1', 'n_inicio', 'n_nombre'),
      e('e2', 'n_nombre', 'n_grado'),
      e('e3', 'n_grado', 'n_carrera'),
      e('e4', 'n_carrera', 'n_ruta_udea'),
      e('e5', 'n_tag_udea', 'n_ia_udea'),
      e('e6', 'n_tag_11', 'n_ia_11'),
      e('e7', 'n_tag_grad', 'n_ia_grad'),
      e('e8', 'n_tag_910', 'n_ia_910'),
      e('e9', 'n_kb_inscripcion', 'n_lead'),
      e('e10', 'n_lead', 'n_estado'),
      e('e11', 'n_estado', 'n_handoff_msg'),
      e('e12', 'n_handoff_msg', 'n_handoff'),
    ],
  },

  // ── F2 · Palabras clave – Aniversario y Popayán (disparador: palabra clave) ─────────────────────────
  {
    nombre: 'F2 · Palabras clave – Aniversario y Popayán',
    entrada: 'k_ruta',
    trigger: { tipo: 'palabra_clave', palabras: ['aniversario', 'curso de oferta', 'oferta', 'popayan', 'cauca', 'huila'] },
    nodos: [
      n('k_ruta', 'condicion', 60, 260, {
        variable: 'ultimo_mensaje',
        ramas: [
          { operador: 'contiene', valor: 'aniversario', nodoDestino: 'k_tag_aniv' },
          { operador: 'contiene', valor: 'oferta', nodoDestino: 'k_tag_aniv' },
          { operador: 'contiene', valor: 'popayan', nodoDestino: 'k_tag_pop' },
          { operador: 'contiene', valor: 'cauca', nodoDestino: 'k_tag_pop' },
          { operador: 'contiene', valor: 'huila', nodoDestino: 'k_tag_pop' },
        ],
        ramaPorDefecto: 'k_tag_aniv',
      }),
      n('k_tag_aniv', 'accion', 360, 120, { efecto: { tipo: 'aplicar_etiquetas', tagIds: ['TAG:Aniversario'] } }),
      n('k_kb_aniv', 'kb', 660, 120, {
        pregunta: 'Información completa del Curso de Aniversario: horario, fecha de inicio, precio especial, cupos e inscripción',
        siNoHayRespuesta: '🎉 ¡Estamos de aniversario! Tenemos un curso intensivo con precio especial y cupos limitados. Un asesor le comparte el detalle en un momento.',
      }),
      n('k_tag_pop', 'accion', 360, 400, { efecto: { tipo: 'aplicar_etiquetas', tagIds: ['TAG:Popayán'] } }),
      n('k_kb_pop', 'kb', 660, 400, {
        pregunta: 'Cursos en oferta de la sede Popayán con 50% y 20% de descuento: horarios, inicio y precios',
        siNoHayRespuesta: '📍 En nuestra sede Popayán tenemos cursos con 50% y 20% de descuento. Un asesor le comparte el detalle en un momento.',
      }),
      n('k_paso4', 'ia', 960, 260, {
        usarKb: true, maxTurnos: 6, ramaPorDefecto: 'k_despedida',
        objetivo: "Eres Andrea Caicedo, asesora virtual de Pre-ICFES Estudiando. Trata de usted y sé breve, con emojis moderados. Pregunta: 'Para continuar con su proceso, ¿hay algo más que desee conocer o le gustaría continuar con los pasos a seguir para la inscripción?' Responde cualquier duda sobre el curso en oferta usando solo la guía de conocimiento y vuelve a ofrecer los pasos de inscripción.",
        salidas: [
          { etiqueta: 'quiere_inscribirse', descripcion: 'El cliente acepta continuar, pide los pasos de inscripción o quiere separar el cupo.', nodoDestino: 'k_kb_insc' },
          { etiqueta: 'no_necesita_mas', descripcion: 'El cliente dice que no necesita nada más, se despide o no quiere continuar.', nodoDestino: 'k_despedida' },
        ],
      }),
      n('k_kb_insc', 'kb', 1260, 120, {
        pregunta: '¿Cuál es el proceso de inscripción paso a paso en Pre-ICFES Estudiando?',
        siNoHayRespuesta: '¡Excelente decisión! 🎉 Enseguida un asesor le comparte el proceso de inscripción.',
      }),
      n('k_lead', 'accion', 1560, 120, { efecto: { tipo: 'crear_lead' } }),
      n('k_handoff_msg', 'mensaje', 1860, 120, { texto: 'En un momento uno de nuestros asesores le ayuda a separar su cupo en la oferta 🙌' }),
      n('k_handoff', 'handoff', 2160, 120, { motivo: 'Interesado en curso de oferta (flujo F2)' }),
      n('k_despedida', 'mensaje', 1260, 400, { texto: 'Gracias por su tiempo 🙏 Recuerde que los cupos de la oferta son limitados. ¡Aquí estaremos cuando lo necesite! ✨' }),
    ],
    aristas: [
      e('e1', 'k_tag_aniv', 'k_kb_aniv'),
      e('e2', 'k_kb_aniv', 'k_paso4'),
      e('e3', 'k_tag_pop', 'k_kb_pop'),
      e('e4', 'k_kb_pop', 'k_paso4'),
      e('e5', 'k_kb_insc', 'k_lead'),
      e('e6', 'k_lead', 'k_handoff_msg'),
      e('e7', 'k_handoff_msg', 'k_handoff'),
    ],
  },

  // ── F3 · Menú y seguimiento con espera (disparador: siempre) ────────────────────────────────────────
  {
    nombre: 'F3 · Menú y seguimiento con espera',
    entrada: 'm_menu',
    trigger: { tipo: 'siempre' },
    nodos: [
      n('m_menu', 'captura', 60, 300, {
        campo: 'opcion', tipoDato: 'texto', reintentos: 1,
        pregunta: '¡Hola! 👋 Soy Andrea, de Pre-ICFES Estudiando. ¿En qué le puedo ayudar?\n1️⃣ Cursos para grado 11\n2️⃣ Cursos para graduados\n3️⃣ Precios y formas de pago\n4️⃣ Hablar con un asesor\nResponda con el número de la opción 🙂',
        descripcion: "Opción elegida del menú. Si escribe un número del 1 al 4 o describe una de las opciones, devuelve solo ese número ('1', '2', '3' o '4'). Si escribe otra cosa, devuelve el texto tal cual.",
      }),
      n('m_ruta', 'condicion', 360, 300, {
        variable: 'var:opcion',
        ramas: [
          { operador: 'opcion_elegida', valor: 'grado 11', nodoDestino: 'm_kb_11' },
          { operador: 'opcion_elegida', valor: 'graduados', nodoDestino: 'm_kb_grad' },
          { operador: 'opcion_elegida', valor: 'precios', nodoDestino: 'm_kb_precios' },
          { operador: 'opcion_elegida', valor: 'asesor', nodoDestino: 'm_handoff_msg' },
        ],
        ramaPorDefecto: 'm_intencion',
      }),
      n('m_kb_11', 'kb', 660, 40, {
        pregunta: 'Resumen de los cursos para estudiantes de grado 11: semi-intensivo jornada tarde, semi-intensivo jornada mañana y sabatino, con horarios',
        siNoHayRespuesta: 'Tenemos cursos en jornada mañana, tarde y sábados para grado 11 📚 Un asesor le comparte el detalle.',
      }),
      n('m_kb_grad', 'kb', 660, 180, {
        pregunta: 'Cursos recomendados para bachilleres graduados: Intensivo con Garantía y Curso de Aniversario',
        siNoHayRespuesta: 'Para graduados tenemos el Intensivo con Garantía 🎓 Un asesor le comparte el detalle.',
      }),
      n('m_kb_precios', 'kb', 660, 320, {
        pregunta: 'Precios de los cursos, valor de la inscripción y pago a cuotas',
        siNoHayRespuesta: 'La inscripción es de $100.000 y puede pagar a cuotas 💳 Un asesor le comparte los precios.',
      }),
      n('m_handoff_msg', 'mensaje', 660, 460, { texto: '¡Con gusto! 🙌 En un momento uno de nuestros asesores le atiende.' }),
      n('m_handoff', 'handoff', 960, 460, { motivo: 'Pidió asesor desde el menú (flujo F3)' }),
      n('m_intencion', 'intencion', 660, 620, {
        ramaPorDefecto: 'm_kb_libre',
        etiquetas: [
          { etiqueta: 'horarios', descripcion: 'Pregunta por horarios, jornadas, días de clase o fechas de inicio', nodoDestino: 'm_kb_horarios' },
          { etiqueta: 'ubicacion', descripcion: 'Pregunta dónde quedan, la dirección, las sedes o cómo llegar', nodoDestino: 'm_kb_ubicacion' },
        ],
      }),
      n('m_kb_horarios', 'kb', 960, 600, { pregunta: 'Horarios y jornadas de todos los cursos y fechas de inicio', siNoHayRespuesta: 'Tenemos jornadas en la mañana, en la tarde y los sábados 🕒' }),
      n('m_kb_ubicacion', 'kb', 960, 740, { pregunta: 'Dirección de las sedes de Pasto y Popayán y horario de atención', siNoHayRespuesta: 'Estamos en Pasto y Popayán 📍' }),
      n('m_kb_libre', 'kb', 960, 880, { pregunta: 'ultimo_mensaje', siNoHayRespuesta: 'No tengo ese dato a la mano 🙏 Un asesor puede ayudarle con eso.' }),
      n('m_espera', 'espera', 1260, 320, { minutos: 30 }),
      n('m_seguimiento', 'mensaje', 1560, 320, { texto: '¿Pudo revisar la información? 😊 Si desea, le comparto los pasos para inscribirse o resolvemos cualquier duda.' }),
    ],
    aristas: [
      e('e1', 'm_menu', 'm_ruta'),
      e('e2', 'm_kb_11', 'm_espera'),
      e('e3', 'm_kb_grad', 'm_espera'),
      e('e4', 'm_kb_precios', 'm_espera'),
      e('e5', 'm_kb_horarios', 'm_espera'),
      e('e6', 'm_kb_ubicacion', 'm_espera'),
      e('e7', 'm_kb_libre', 'm_espera'),
      e('e8', 'm_espera', 'm_seguimiento'),
      e('e9', 'm_handoff_msg', 'm_handoff'),
    ],
  },
];

/** Validación mínima del grafo (las mismas reglas de flow.validation.ts que importan al guardar). */
function validarGrafo(f) {
  const ids = f.nodos.map((x) => x.id);
  if (new Set(ids).size !== ids.length) throw new Error(`${f.nombre}: ids de nodo duplicados`);
  if (!ids.includes(f.entrada)) throw new Error(`${f.nombre}: la entrada no existe`);
  const destinos = new Set();
  for (const a of f.aristas) {
    if (!ids.includes(a.from) || !ids.includes(a.to)) throw new Error(`${f.nombre}: arista ${a.id} apunta a un nodo inexistente`);
    destinos.add(a.to);
  }
  for (const nodo of f.nodos) {
    const c = nodo.config;
    for (const r of [...(c.ramas ?? []), ...(c.etiquetas ?? []), ...(c.salidas ?? [])]) {
      if (!ids.includes(r.nodoDestino)) throw new Error(`${f.nombre}: ${nodo.id} → destino inexistente ${r.nodoDestino}`);
      destinos.add(r.nodoDestino);
    }
    if (c.ramaPorDefecto) {
      if (!ids.includes(c.ramaPorDefecto)) throw new Error(`${f.nombre}: ${nodo.id} → rama por defecto inexistente`);
      destinos.add(c.ramaPorDefecto);
    }
  }
  const huerfanos = ids.filter((id) => id !== f.entrada && !destinos.has(id));
  if (huerfanos.length) throw new Error(`${f.nombre}: nodos huérfanos ${huerfanos.join(', ')}`);
}

/** Reemplaza "TAG:<nombre>" por el id real de la etiqueta (string). */
function resolverEtiquetas(f) {
  return JSON.parse(JSON.stringify(f).replace(/"TAG:([^"]+)"/g, (_, nombre) => JSON.stringify(tagId(nombre))));
}

/**
 * Mapa nombre → ObjectId de los flujos creados/actualizados.
 * Útil para probar desde el chat sin la UI: la sesión de prueba guarda el flujo elegido en el
 * cliente de prueba (`pruebaFlowId`), p. ej.:
 *   database.clientes.findOne({ tenantId: TENANT_ID, metaUserId: 'prueba-' + USER_ID.toString() })
 */
const FLOW_IDS = {};

for (const flujo of FLUJOS) {
  validarGrafo(flujo);
  const f = resolverEtiquetas(flujo);
  const existente = database.flows.findOne({ tenantId: TENANT_ID, nombre: f.nombre });

  if (existente) {
    escribir(`Actualizar flujo "${f.nombre}" (v${existente.version} → v${existente.version + 1}, sin cambiar activo/estado)`, () =>
      database.flows.updateOne(
        { _id: existente._id, tenantId: TENANT_ID },
        { $set: { nodos: f.nodos, aristas: f.aristas, entrada: f.entrada, trigger: f.trigger, updatedAt: ahora }, $inc: { version: 1 } },
      ),
    );
    FLOW_IDS[f.nombre] = existente._id;
  } else {
    const r = escribir(`Crear flujo "${f.nombre}" en borrador`, () =>
      database.flows.insertOne({
        tenantId: TENANT_ID,
        nombre: f.nombre,
        nodos: f.nodos,
        aristas: f.aristas,
        entrada: f.entrada,
        trigger: f.trigger,
        version: 1,
        estado: 'borrador',
        activo: false,
        createdAt: ahora,
        updatedAt: ahora,
      }),
    );
    if (r) FLOW_IDS[f.nombre] = r.insertedId;
  }
}

// =====================================================================================================
// 5. RECORDATORIO DE INACTIVIDAD (`tenants.recordatorio`)  — opcional
// =====================================================================================================
// Se envía `antelacionMinutos` ANTES de que cierre la ventana de 24 h de WhatsApp del cliente
// (no "X minutos sin respuesta"). Afecta a TODOS los clientes reales del tenant.

if (ACTIVAR_RECORDATORIO) {
  escribir('Activar recordatorio de inactividad (120 min antes de cerrar la ventana de 24 h)', () =>
    database.tenants.updateOne(
      { _id: TENANT_ID },
      {
        $set: {
          'recordatorio.activo': true,
          'recordatorio.antelacionMinutos': 120,
          'recordatorio.texto': '¿Sigue ahí? 😊 Quedo atenta para ayudarle a elegir su curso en Pre-ICFES Estudiando.',
        },
      },
    ),
  );
} else {
  print('• Recordatorio de inactividad: sin cambios (ACTIVAR_RECORDATORIO = false)');
}

// ─── Resumen ─────────────────────────────────────────────────────────────────────────────────────────

print('──────────────────────────────────────────────');
print(' IDs útiles para siguientes cargas:');
printjson({ TENANT_ID, USER_ID, TAG_IDS, FLOW_IDS });
print(' Siguiente paso: 02-navegador-kb-faqs.js (base de conocimiento + FAQs, vía API).');
print('──────────────────────────────────────────────');
