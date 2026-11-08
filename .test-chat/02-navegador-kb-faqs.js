/* eslint-disable */
// =====================================================================================================
//  02-navegador-kb-faqs.js — Base de conocimiento + FAQs de Pre-ICFES vía API (consola del navegador)
// =====================================================================================================
//
//  Fuente de los datos: 00-test-preicfes.md (§2, §3 y §4).
//
//  POR QUÉ EN EL NAVEGADOR Y NO EN MONGOSH: los documentos se trocean y se indexan con embeddings de
//  Gemini mediante la cola BullMQ, y cada FAQ calcula su embedding al crearse. Solo el API hace eso.
//
//  CÓMO EJECUTAR:
//    1. Abre SofiApp con la sesión de user1-preicfes@estudiando.co (ruta /settings/knowledge).
//    2. F12 → Console → pega TODO este archivo → Enter.
//    3. Ejecuta:   await cargarTodo()          (o por partes: await cargarKb() / await cargarFaqs())
//       Con DRY_RUN = true primero si quieres ver qué haría.
//
//  Es IDEMPOTENTE:
//    - Categorías fijas (presets): se ACTUALIZAN (PATCH) con contenido + estructura del formulario.
//    - Documentos adicionales: se crean si no existe uno con el mismo título; si existe, se actualiza.
//    - FAQs: se crean solo las que no existen (misma pregunta, sin distinguir mayúsculas ni tildes).
//  Al terminar, cada documento queda «pendiente» → «indexado» en unos segundos (lo procesa el worker:
//  verifica que el worker esté corriendo).
//
//  Usa tu sesión (cookie httpOnly `token` + cookie `csrfToken` → cabecera X-CSRF-Token), así que el
//  tenant sale del token, como en cualquier acción desde la UI.
// =====================================================================================================

var DRY_RUN = false;

/** Base del API. En desarrollo, Vite hace proxy de /api → :4000. Si usas VITE_API_BASE_URL, cámbiala. */
var API_BASE = '/api';

// ─── Cliente HTTP ────────────────────────────────────────────────────────────────────────────────────

function leerCsrf() {
  var c = document.cookie.split('; ').find(function (x) { return x.startsWith('csrfToken='); });
  return c ? decodeURIComponent(c.split('=')[1]) : '';
}

async function api(method, path, body) {
  if (DRY_RUN && method !== 'GET') {
    console.log('[DRY_RUN]', method, path, body);
    return null;
  }
  var r = await fetch(API_BASE + path, {
    method: method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': leerCsrf() },
    body: body ? JSON.stringify(body) : undefined,
  });
  var data = r.status === 204 ? null : await r.json().catch(function () { return null; });
  if (!r.ok) throw new Error(method + ' ' + path + ' → ' + r.status + ': ' + JSON.stringify(data));
  return data;
}

var normalizar = function (s) {
  return s.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase().replace(/\s+/g, ' ');
};

// ─── Constructores de campos de la estructura (formularios de las categorías fijas) ──────────────────
// Cada campo lleva [id, etiqueta, valor]. El id y la forma del valor son los de
// apps/frontend/src/features/knowledge-base/lib/schemas/*.schema.ts; la etiqueta solo se usa para el
// texto de respaldo si no se puede cargar el serializador oficial del frontend.

var texto = function (id, etiqueta, valor) { return { id: id, etiqueta: etiqueta, v: { tipo: 'texto', valor: valor } }; };
var lista = function (id, etiqueta, valores) { return { id: id, etiqueta: etiqueta, v: { tipo: 'lista', valores: valores } }; };
var tri = function (id, etiqueta, valor, detalle) {
  var v = { tipo: 'triestado', valor: valor };
  if (detalle) v.detalle = detalle;
  return { id: id, etiqueta: etiqueta, v: v };
};
var repetible = function (id, etiqueta, items) { return { id: id, etiqueta: etiqueta, v: { tipo: 'repetible', items: items } }; };
var horario = function (id, etiqueta, dias) { return { id: id, etiqueta: etiqueta, v: { tipo: 'horario', dias: dias } }; };
var dia = function (nombre, desde, hasta) {
  return desde ? { dia: nombre, cerrado: false, intervalos: [{ desde: desde, hasta: hasta }] } : { dia: nombre, cerrado: true, intervalos: [] };
};

// ─── §2 Categorías fijas ─────────────────────────────────────────────────────────────────────────────

var PRESETS = [
  {
    titulo: 'Información de la empresa',
    schemaId: 'empresa',
    campos: [
      texto('nombre_comercial', 'Nombre comercial', 'Pre-ICFES Estudiando'),
      texto('razon_social', 'Razón social', 'Instituto Estudiando S.A.S.'),
      texto('descripcion', '¿A qué se dedica?', 'Instituto de preparación académica para la Prueba Saber 11 (ICFES) y exámenes de admisión universitaria. Acompañamos a estudiantes de grados 9°, 10°, 11° y graduados con cursos presenciales y virtuales, simulacros tipo ICFES y orientación profesional para que ingresen a la carrera y universidad que sueñan.'),
      texto('anio_fundacion', 'Año de fundación', '2011'),
      texto('mision', 'Misión', 'Preparar a cada estudiante para alcanzar el puntaje que necesita en la Prueba Saber 11 y en los exámenes de admisión, mediante una metodología de práctica intensiva, docentes expertos y seguimiento personalizado, para que dé el paso a la universidad con seguridad.'),
      texto('vision', 'Visión', 'Ser en 2030 el instituto Pre-ICFES de referencia del suroccidente colombiano, reconocido por los resultados medibles de sus estudiantes y por llevar la preparación de calidad a más municipios de Nariño, Cauca y Huila.'),
      lista('valores', 'Valores', ['Compromiso', 'Disciplina', 'Excelencia académica', 'Cercanía', 'Honestidad', 'Superación']),
      texto('clientes_objetivo', '¿A quién le sirve?', 'Estudiantes de grado 11 (jornada mañana o tarde), estudiantes de 9° y 10° que quieren adelantarse, bachilleres graduados que buscan mejorar su puntaje y aspirantes a la Universidad de Antioquia (UdeA). También padres de familia que buscan asesoría.'),
      lista('zonas_cobertura', 'Zonas donde atiende', ['Pasto', 'Ipiales', 'Tumaco', 'Túquerres', 'Popayán', 'Santander de Quilichao', 'Neiva', 'Pitalito', 'Nariño', 'Cauca', 'Huila', 'Virtual en toda Colombia']),
      lista('diferenciadores', 'Qué lo hace distinto', ['Garantía de puntaje en el curso intensivo', 'Simulacros tipo ICFES cada 2 semanas', 'Taller de orientación profesional incluido', 'Horarios en contrajornada para colegios de mañana y de tarde', 'Docentes especialistas por área', 'Seguimiento académico con reportes a padres']),
      tri('parte_de_grupo', '¿Hace parte de un grupo o casa matriz?', 'no'),
      lista('certificaciones', 'Certificaciones o afiliaciones', ['Licencia de funcionamiento de la Secretaría de Educación Municipal de Pasto', 'Registro de programas de educación para el trabajo y el desarrollo humano']),
    ],
  },
  {
    titulo: 'Productos y servicios',
    schemaId: 'productos',
    campos: [
      texto('resumen_oferta', '¿Qué vende o qué servicios presta?', 'Cursos de preparación para la Prueba Saber 11 (ICFES) y para el examen de admisión de la Universidad de Antioquia. Ofrecemos: curso intensivo con garantía (doble jornada), cursos semi-intensivos en contrajornada (jornada tarde para estudiantes de colegios de la mañana y jornada mañana para colegios de la tarde), curso sabatino, curso Saber 11 para grados 9° y 10°, Pre-U UdeA presencial y virtual, cursos por áreas y el curso especial de Aniversario. En la sede Popayán hay cursos en oferta con 50% y 20% de descuento. Todos incluyen material exclusivo, simulacros tipo ICFES y taller de orientación profesional. Inscripción: $100.000 para separar el cupo.'),
      repetible('catalogo', 'Productos y servicios', [
        { nombre: 'Pre-ICFES Intensivo con Garantía', descripcion: 'Doble jornada L-V 8:00-12:00 y 2:00-6:00 p.m. Inicia 12 ene 2027 hasta el ICFES. Si no alcanza el puntaje de su carrera repite gratis. Para graduados o grado 11 con tiempo completo. $4.200.000' },
        { nombre: 'Semi-intensivo Jornada Tarde', descripcion: 'Para estudiantes de colegios de jornada mañana. L-V 2:30-5:30 p.m. Inicia 1 feb 2027, 5 meses. Clases, talleres y simulacros quincenales. $2.400.000' },
        { nombre: 'Semi-intensivo Jornada Mañana', descripcion: 'Para estudiantes de colegios de jornada tarde. L-V 7:00-10:00 a.m. Inicia 1 feb 2027, 5 meses. Clases, talleres y simulacros quincenales. $2.400.000' },
        { nombre: 'Curso Sabatino', descripcion: 'Sábados 8:00 a.m.-1:00 p.m. Inicia 6 feb 2027, 6 meses. Ideal para quien estudia o trabaja entre semana. Todas las áreas del ICFES y simulacros mensuales. $1.800.000' },
        { nombre: 'Saber 11 Grados 9° y 10°', descripcion: 'Bases de matemáticas, lectura crítica, ciencias, sociales e inglés para llegar fuertes a grado 11. Sábados 2:00-5:00 p.m. Inicia 6 feb 2027, 4 meses. $1.200.000' },
        { nombre: 'Pre-U UdeA Presencial', descripcion: 'Preparación para el examen de admisión de la Universidad de Antioquia (razonamiento lógico y competencia lectora). L-V 3:00-6:00 p.m., 3 meses. $2.100.000' },
        { nombre: 'Pre-U UdeA Virtual', descripcion: 'Clases en vivo L-Mi-V 6:30-9:00 p.m. + plataforma con grabaciones y simulacros tipo UdeA. 3 meses, desde cualquier ciudad. $1.500.000' },
        { nombre: 'Curso por Áreas', descripcion: 'Refuerzo de un área: matemáticas, lectura crítica, ciencias naturales, sociales o inglés. Martes y jueves 5:00-7:00 p.m., 2 meses. $650.000 por área' },
        { nombre: 'Curso de Aniversario (oferta)', descripcion: 'Edición especial por nuestros 15 años. Intensivo de 3 meses L-V 2:00-6:00 p.m., inicia 18 ene 2027. Precio especial $2.900.000 (antes $4.200.000). Solo 30 cupos.' },
        { nombre: 'Popayán: Semi-intensivo 50% dcto', descripcion: 'Solo sede Popayán. L-V 2:30-5:30 p.m., inicia 1 feb 2027, 5 meses. Precio con 50% de descuento: $1.200.000 (antes $2.400.000). Cupos limitados.' },
        { nombre: 'Popayán: Sabatino 20% dcto', descripcion: 'Solo sede Popayán. Sábados 8:00 a.m.-1:00 p.m., inicia 6 feb 2027, 6 meses. Precio con 20% de descuento: $1.440.000 (antes $1.800.000).' },
        { nombre: 'Taller de Orientación Profesional', descripcion: 'Taller de 4 sesiones con psicóloga para elegir carrera: test vocacional, perfiles profesionales y universidades. Incluido gratis en todos los cursos de grado 11 y graduados.' },
      ]),
      texto('notas_precios', 'Cómo se cotiza', 'Los precios son por curso completo e incluyen material, simulacros y taller de orientación. La inscripción ($100.000) se paga aparte para separar el cupo y se descuenta del valor total. Los descuentos no son acumulables.'),
      lista('formas_pago', 'Formas de pago', ['Pago de contado con 5% de descuento', 'Pago a cuotas mensuales sin intereses', 'Transferencia Bancolombia o Nequi', 'Tarjeta débito o crédito en sede', 'Efectivo en sede']),
      texto('promociones', 'Promociones o descuentos', 'Curso de Aniversario a $2.900.000 (30 cupos). Sede Popayán: 50% en semi-intensivo y 20% en sabatino. 10% de descuento por hermanos o por referir a un amigo que se inscriba.'),
      lista('modalidades_entrega', 'Cómo se entrega', ['Presencial en sede Pasto', 'Presencial en sede Popayán', 'Virtual con clases en vivo']),
      texto('tiempos_entrega', 'Tiempos de entrega', 'Cada curso tiene fecha de inicio fija (ver catálogo). Las clases virtuales quedan grabadas por 30 días en la plataforma.'),
    ],
  },
  {
    titulo: 'Horarios y ubicación',
    schemaId: 'horarios',
    campos: [
      texto('direccion', 'Dirección', 'Sede principal Pasto: Calle 18 # 25-40, Centro, Pasto, Nariño (segundo piso, Edificio Galerías)'),
      texto('indicaciones', 'Cómo llegar', 'A media cuadra de la Plaza de Nariño. Rutas urbanas C1, C4 y E8 paran en la Calle 18. Parqueadero público en la Carrera 25.'),
      repetible('otras_sedes', 'Otras sedes', [
        { nombre: 'Sede Popayán', direccion: 'Carrera 6 # 4-21, Centro Histórico, Popayán, Cauca', telefono: '(602) 820 0000' },
      ]),
      texto('whatsapp', 'WhatsApp', '+57 300 000 0000'),
      texto('telefono', 'Teléfono', '(602) 730 0000'),
      texto('correo', 'Correo electrónico', 'info@preicfesestudiando.test'),
      lista('redes_sociales', 'Redes sociales', ['Instagram @preicfesestudiando', 'Facebook /preicfesestudiando', 'TikTok @preicfesestudiando']),
      horario('horario_atencion', 'Horario de atención', [
        dia('lunes', '07:00', '19:00'),
        dia('martes', '07:00', '19:00'),
        dia('miércoles', '07:00', '19:00'),
        dia('jueves', '07:00', '19:00'),
        dia('viernes', '07:00', '19:00'),
        dia('sábado', '08:00', '14:00'),
        dia('domingo'),
      ]),
      texto('excepciones_horario', 'Días especiales', 'Festivos cerrado. En Semana Santa y del 20 dic al 6 ene solo atendemos por WhatsApp.'),
    ],
  },
  {
    titulo: 'Políticas y términos',
    schemaId: 'politicas',
    campos: [
      tri('acepta_devoluciones', '¿Aceptan devoluciones?', 'si', 'Hasta 8 días antes del inicio del curso se devuelve el 100% de lo pagado, excepto la inscripción. Iniciado el curso no hay devolución, pero se puede congelar el cupo una vez por calamidad.'),
      tri('acepta_cambios', '¿Hacen cambios?', 'si', 'Se puede cambiar de curso o jornada dentro de las primeras 2 semanas, pagando la diferencia si el nuevo curso es más costoso.'),
      tri('ofrece_garantia', '¿Ofrecen garantía?', 'si', 'Solo el Intensivo con Garantía: si el estudiante no alcanza el puntaje de su carrera, repite el curso sin costo, con asistencia mínima del 90% y todos los simulacros presentados.'),
      tri('requiere_reserva', '¿Se atiende con reserva o cita previa?', 'no'),
      tri('admite_mascotas', '¿Admiten mascotas?', 'no'),
      tri('consumo_minimo', '¿Hay consumo o pedido mínimo?', 'no'),
      texto('otras_politicas', 'Otras políticas', 'La inscripción de $100.000 no es reembolsable. Edad mínima: estudiantes desde grado 9°. Los menores de edad se inscriben con un acudiente. Las clases perdidas pueden recuperarse con la grabación (virtual) o en otro grupo de la misma jornada (presencial), con aviso previo. Tratamiento de datos según la Ley 1581 de 2012.'),
      texto('terminos_generales', 'Términos y condiciones', 'El cupo se garantiza con el pago de la inscripción. Las cuotas deben pagarse en las fechas acordadas; con más de 15 días de atraso se suspende el acceso a la plataforma hasta ponerse al día. Pre-ICFES Estudiando puede reprogramar una clase por fuerza mayor, avisando con al menos 24 horas.'),
    ],
  },
];

// ─── §2.5 + §3 Documentos de texto libre ─────────────────────────────────────────────────────────────
// «Información Complementaria» es un preset sin formulario: se guarda solo `contenido` (modo libre).

var DOCUMENTOS_TEXTO = [
  {
    titulo: 'Información Complementaria',
    contenido: `METODOLOGÍA ACADÉMICA DE PRE-ICFES ESTUDIANDO
En Pre-ICFES Estudiando contamos con una metodología sólida, clara y efectiva, creada para que el estudiante realmente mejore su desempeño en la Prueba Saber 11 mediante la práctica intensiva. Nuestro enfoque no es solo enseñar temas: es desarrollar competencias reales mediante la práctica constante que impacten directamente en los resultados del examen.
Trabajamos con un proceso académico estructurado que combina aprendizaje, práctica incansable y retroalimentación continua. Esto permite que cada estudiante avance con seguridad y vea mejoras medibles.
Nuestro proceso incluye:
- Clases presenciales con docentes expertos, preparados para guiar al estudiante paso a paso.
- Material exclusivo por áreas, diseñado para facilitar la comprensión y la práctica.
- Talleres prácticos en cada tema para reforzar lo aprendido.
- Simulacros tipo ICFES, similares a la prueba real, para preparar al estudiante con anticipación.
- Seguimiento académico y retroalimentación, que permite identificar fortalezas y aspectos por mejorar.
- Evaluación progresiva por competencias, para medir avances reales en el tiempo.
Esta metodología ofrece una preparación seria, organizada y confiable, garantizando que el estudiante desarrolle las habilidades necesarias y llegue a la prueba con mayor seguridad y dominio.

ÁREAS QUE TRABAJAMOS
Matemáticas, Lectura Crítica, Ciencias Naturales (biología, química y física), Sociales y Ciudadanas, e Inglés. En los cursos UdeA: Razonamiento Lógico y Competencia Lectora.

TALLER DE ORIENTACIÓN PROFESIONAL
Para el estudiante que aún no ha decidido qué estudiar. 4 sesiones con psicóloga: test vocacional, exploración de perfiles profesionales, universidades y puntajes de ingreso, y plan de acción. Incluido gratis en todos los cursos de grado 11 y para graduados.

SIMULACROS
Simulacros tipo ICFES cada 2 semanas en los cursos intensivo y semi-intensivos, y mensuales en el sabatino. Se entregan resultados por área y por competencia, con reporte para padres.`,
  },
  {
    titulo: 'Detalle de cursos para grado 11 y graduados',
    contenido: `🎓 PRE-ICFES INTENSIVO CON GARANTÍA
¿Quiere prepararse al máximo para el ICFES y asegurar su ingreso a la universidad? Este curso es para usted 👇
📚 Modalidad: Intensiva – Doble jornada, presencial (sede Pasto)
🕒 Horario: 8:00 a.m. a 12:00 m. / 2:00 p.m. a 6:00 p.m.
📅 Días: lunes a viernes
📆 Inicio: 12 de enero de 2027
🎯 Finalización: hasta que presente el ICFES (calendario A, agosto 2027)
🔐 GARANTÍA: si no alcanza el puntaje para su carrera, puede repetir el curso sin costo adicional (asistencia mínima 90%).
💰 Inversión: $4.200.000
📝 Inscripción: $100.000
💳 Pago en 2 cuotas mensuales
Recomendado para: graduados y estudiantes de grado 11 con disponibilidad de tiempo completo.

🌇 SEMI-INTENSIVO JORNADA TARDE (para colegios de jornada mañana)
📚 Modalidad: presencial (sede Pasto)
🕒 Horario: 2:30 p.m. a 5:30 p.m.
📅 Días: lunes a viernes
📆 Inicio: 1 de febrero de 2027 · Duración: 5 meses
📝 Incluye: material por áreas, talleres, simulacro tipo ICFES cada 2 semanas y taller de orientación profesional
💰 Inversión: $2.400.000 · Inscripción: $100.000 · 💳 3 cuotas mensuales

🌅 SEMI-INTENSIVO JORNADA MAÑANA (para colegios de jornada tarde)
📚 Modalidad: presencial (sede Pasto)
🕒 Horario: 7:00 a.m. a 10:00 a.m.
📅 Días: lunes a viernes
📆 Inicio: 1 de febrero de 2027 · Duración: 5 meses
📝 Incluye: material por áreas, talleres, simulacro tipo ICFES cada 2 semanas y taller de orientación profesional
💰 Inversión: $2.400.000 · Inscripción: $100.000 · 💳 3 cuotas mensuales

📅 CURSO SABATINO
📚 Modalidad: presencial (sede Pasto)
🕒 Horario: sábados 8:00 a.m. a 1:00 p.m.
📆 Inicio: 6 de febrero de 2027 · Duración: 6 meses
👥 Ideal para: estudiantes que tienen el colegio entre semana o graduados que trabajan
📝 Incluye: todas las áreas del ICFES, simulacro mensual y taller de orientación profesional
💰 Inversión: $1.800.000 · Inscripción: $100.000 · 💳 3 cuotas mensuales

📘 SABER 11 PARA GRADOS 9° Y 10°
Curso enfocado en las temáticas que necesitan los estudiantes para la Prueba Saber 11, para llegar fuertes a grado 11.
🕒 Horario: sábados 2:00 p.m. a 5:00 p.m.
📆 Inicio: 6 de febrero de 2027 · Duración: 4 meses
💰 Inversión: $1.200.000 · Inscripción: $100.000 · 💳 3 cuotas mensuales

📗 CURSO POR ÁREAS
Refuerzo de una sola área: matemáticas, lectura crítica, ciencias naturales, sociales o inglés.
🕒 Martes y jueves 5:00 p.m. a 7:00 p.m. · 2 meses
💰 $650.000 por área · Inscripción: $100.000 · 💳 3 cuotas mensuales`,
  },
  {
    titulo: 'Cursos Universidad de Antioquia UdeA',
    contenido: `🏛️ PRE-U UDEA PRESENCIAL
Preparación para el examen de admisión de la Universidad de Antioquia, que evalúa Razonamiento Lógico y Competencia Lectora (la UdeA no admite con el puntaje ICFES, aplica su propio examen).
🕒 Horario: lunes a viernes 3:00 p.m. a 6:00 p.m.
📆 Inicio: 1 de febrero de 2027 · Duración: 3 meses
📝 Incluye: 6 simulacros tipo UdeA, banco de preguntas y asesoría para la inscripción en la UdeA
💰 Inversión: $2.100.000 · Inscripción: $100.000 · 💳 3 cuotas mensuales

💻 PRE-U UDEA VIRTUAL
Las mismas temáticas del presencial, desde cualquier ciudad.
🕒 Clases en vivo: lunes, miércoles y viernes 6:30 p.m. a 9:00 p.m.
🎥 Grabaciones disponibles 30 días + plataforma con simulacros tipo UdeA
📆 Inicio: 1 de febrero de 2027 · Duración: 3 meses
💰 Inversión: $1.500.000 · Inscripción: $100.000 · 💳 3 cuotas mensuales`,
  },
  {
    titulo: 'Ofertas de Aniversario y sede Popayán',
    contenido: `🎉 CURSO DE ANIVERSARIO (curso de oferta)
¡Estamos de aniversario: 15 años preparando estudiantes! Por eso abrimos una edición especial con precio especial y cupos limitados.
📚 Modalidad: intensiva, presencial (sede Pasto)
🕒 Horario: lunes a viernes 2:00 p.m. a 6:00 p.m.
📆 Inicio: 18 de enero de 2027 · Duración: 3 meses
💰 Precio especial: $2.900.000 (precio normal $4.200.000)
👥 Solo 30 cupos
📝 Inscripción: $100.000 · 💳 2 cuotas mensuales
La oferta es válida hasta agotar cupos o hasta el 15 de diciembre de 2026.

📍 OFERTAS SEDE POPAYÁN (Cauca y Huila)
Para estudiantes de Popayán, Cauca y Huila, en nuestra sede de Popayán (Carrera 6 # 4-21, Centro Histórico):
🔥 Semi-intensivo con 50% de descuento
🕒 Lunes a viernes 2:30 p.m. a 5:30 p.m. · 📆 Inicio 1 de febrero de 2027 · 5 meses
💰 $1.200.000 (antes $2.400.000)
✨ Sabatino con 20% de descuento
🕒 Sábados 8:00 a.m. a 1:00 p.m. · 📆 Inicio 6 de febrero de 2027 · 6 meses
💰 $1.440.000 (antes $1.800.000)
📝 Inscripción: $100.000 · 💳 3 cuotas mensuales · Cupos limitados`,
  },
  {
    titulo: 'Pagos a cuotas, inscripción y puntajes universitarios',
    contenido: `💳 PAGO A CUOTAS
Curso Intensivo con Garantía y Curso de Aniversario: 2 cuotas mensuales.
- Inscripción inicial: pago de $100.000 para separar el cupo.
- Primera cuota: se paga hasta el día de inicio del curso.
- Segunda cuota: se paga un mes después de la fecha de inicio.
Otros cursos (Semi-intensivos, Sabatino, Saber 11 grados 9° y 10°, Pre-U UdeA, por áreas): 3 cuotas mensuales.
- Inscripción inicial: pago de $100.000 para separar el cupo.
- Primera cuota: se paga hasta el día de inicio del curso.
- Segunda cuota: se paga un mes después de la fecha de inicio.
- Tercera cuota: se paga dos meses después de la fecha de inicio.
Las cuotas no tienen intereses. Pago de contado: 5% de descuento.

📝 PROCESO DE INSCRIPCIÓN PASO A PASO
1. Elija el curso y la jornada.
2. Pague la inscripción de $100.000 por transferencia (Bancolombia o Nequi) o en sede.
3. Envíe por WhatsApp: foto del documento de identidad del estudiante, comprobante de pago, nombre del acudiente y colegio o año de graduación.
4. Un asesor confirma el cupo y le envía el contrato y el calendario de pagos.
5. Una semana antes del inicio recibirá su usuario de la plataforma y el horario de clases.

🎯 PUNTAJES DE REFERENCIA PARA INGRESAR (aproximados, ICFES sobre 500)
Son valores orientativos del último periodo, NO oficiales; cada universidad publica sus puntajes por convocatoria.
Universidad de Nariño (Udenar), Pasto: Medicina 385 · Derecho 320 · Arquitectura 300 · Ingeniería de Sistemas 290 · Psicología 305 · Enfermería 310 · Contaduría 270 · Licenciaturas 250.
Universidad del Cauca (Unicauca), Popayán: Medicina 390 · Derecho 330 · Ingeniería Civil 305 · Ingeniería Electrónica 300 · Arquitectura 300 · Enfermería 315.
Universidad del Valle (Univalle), Cali: Medicina 400 · Psicología 330 · Ingeniería Industrial 320 · Arquitectura 315.
Universidad Surcolombiana (USCO), Neiva: Medicina 380 · Derecho 315 · Ingeniería de Software 290.
Universidad Nacional y Universidad de Antioquia: no admiten con ICFES, aplican examen de admisión propio (ver cursos Pre-U UdeA).`,
  },
];

// ─── §4 FAQs ─────────────────────────────────────────────────────────────────────────────────────────

var FAQS = [
  ['¿Se puede pagar el curso a cuotas?', '¡Claro que sí! 💳 El Intensivo con Garantía y el Curso de Aniversario se pagan en 2 cuotas mensuales; los demás cursos en 3 cuotas mensuales, sin intereses. Primero se paga la inscripción de $100.000 para separar el cupo y la primera cuota hasta el día de inicio del curso.'],
  ['¿Cuánto cuesta la inscripción?', 'La inscripción cuesta $100.000, separa su cupo y se descuenta del valor total del curso. No es reembolsable.'],
  ['¿Dónde están ubicados?', '📍 Sede principal en Pasto: Calle 18 # 25-40, Centro (Edificio Galerías, 2.º piso). Sede Popayán: Carrera 6 # 4-21, Centro Histórico. También tenemos cursos virtuales para toda Colombia.'],
  ['¿Cuál es el horario de atención?', 'Atendemos de lunes a viernes de 7:00 a.m. a 7:00 p.m. y los sábados de 8:00 a.m. a 2:00 p.m. Domingos y festivos cerrado.'],
  ['Mi colegio es en la mañana, ¿tienen curso en la tarde?', '¡Sí! 🌇 El Semi-intensivo Jornada Tarde es de lunes a viernes de 2:30 a 5:30 p.m., pensado para estudiantes de colegios de jornada mañana. También puede tomar el Curso Sabatino.'],
  ['Estudio en la tarde, ¿tienen curso en la mañana?', '¡Sí! 🌅 El Semi-intensivo Jornada Mañana es de lunes a viernes de 7:00 a 10:00 a.m., para estudiantes de colegios de jornada tarde. También está el Curso Sabatino.'],
  ['¿Tienen clases los sábados?', 'Sí 📅 El Curso Sabatino es los sábados de 8:00 a.m. a 1:00 p.m., dura 6 meses e inicia el 6 de febrero de 2027. El curso para grados 9° y 10° también es los sábados, de 2:00 a 5:00 p.m.'],
  ['¿Qué es la garantía del curso intensivo?', '🔐 Si el estudiante no alcanza el puntaje que necesita para su carrera, puede repetir el Intensivo con Garantía sin costo adicional, siempre que haya asistido al 90% de las clases y presentado todos los simulacros.'],
  ['¿Tienen cursos virtuales?', 'Sí 💻 El Pre-U UdeA Virtual tiene clases en vivo los lunes, miércoles y viernes de 6:30 a 9:00 p.m., con grabaciones y simulacros en plataforma. Los demás cursos son presenciales.'],
  ['¿Hacen simulacros tipo ICFES?', 'Sí 📝 Hacemos simulacros tipo ICFES cada 2 semanas en los cursos intensivo y semi-intensivos, y cada mes en el sabatino, con resultados por área y reporte para padres.'],
  ['Estoy en grado 10, ¿puedo tomar un curso?', '¡Claro! 📘 Tenemos el curso Saber 11 para Grados 9° y 10°, los sábados de 2:00 a 5:00 p.m., para que llegue fuerte a grado 11.'],
  ['¿Qué es el curso de aniversario?', '🎉 Por nuestros 15 años abrimos un curso intensivo de 3 meses (L-V 2:00-6:00 p.m., inicia el 18 de enero de 2027) a un precio especial de $2.900.000 en lugar de $4.200.000. Solo hay 30 cupos.'],
  ['¿Tienen descuentos en Popayán?', 'Sí 📍 En la sede Popayán el Semi-intensivo tiene 50% de descuento ($1.200.000) y el Sabatino 20% de descuento ($1.440.000). Cupos limitados.'],
  ['¿Cómo me inscribo?', 'Es muy fácil 📝 1) Elija curso y jornada. 2) Pague la inscripción de $100.000. 3) Envíe por WhatsApp el documento del estudiante y el comprobante. 4) Un asesor le confirma el cupo y le envía el contrato.'],
  ['No sé qué carrera estudiar, ¿me pueden ayudar?', 'No se preocupe, es completamente normal en esta etapa 😊 Nuestros cursos incluyen un taller de orientación profesional con psicóloga que le ayuda a tomar esa decisión con mayor claridad.'],
  ['¿Tienen curso para la Universidad de Antioquia?', 'Sí 🏛️ Tenemos Pre-U UdeA Presencial (L-V 3:00-6:00 p.m., $2.100.000) y Virtual (L-Mi-V 6:30-9:00 p.m., $1.500.000), enfocados en el examen de admisión de la UdeA.'],
  ['¿Qué formas de pago aceptan?', 'Aceptamos transferencia Bancolombia o Nequi, tarjeta débito o crédito y efectivo en sede. Si paga de contado tiene 5% de descuento.'],
  ['¿Devuelven el dinero si me retiro?', 'Hasta 8 días antes del inicio devolvemos el 100% de lo pagado, excepto la inscripción. Una vez iniciado el curso no hay devolución, pero puede congelar su cupo una vez por calamidad.'],
  ['Ya soy graduado, ¿qué curso me recomiendan?', 'Para graduados recomendamos el Pre-ICFES Intensivo con Garantía 🎓 (doble jornada). Si no tiene tiempo completo, puede tomar un Semi-intensivo o el Curso Sabatino.'],
  ['¿Hay descuento por hermanos?', 'Sí, damos 10% de descuento por hermanos o si refiere a un amigo que se inscriba. No es acumulable con otras promociones.'],
];

// ─── Serialización estructura → contenido ────────────────────────────────────────────────────────────
// Preferimos el serializador OFICIAL del frontend (mismo texto que generaría el formulario al guardar).
// En el servidor de desarrollo de Vite se puede importar el módulo fuente; en un build de producción
// no, y se usa un respaldo legible equivalente ("Etiqueta: valor").

var serializadorOficial = null;

async function cargarSerializador() {
  if (serializadorOficial !== null) return serializadorOficial;
  try {
    var ser = await import('/src/features/knowledge-base/lib/kb-serialize.ts');
    var sch = await import('/src/features/knowledge-base/lib/kb-schemas.ts');
    serializadorOficial = function (estructura) {
      return ser.serializeEstructura(estructura, sch.KB_SCHEMAS[estructura.schemaId]);
    };
    console.log('ℹ️ Usando el serializador oficial del frontend (Vite dev).');
  } catch (err) {
    serializadorOficial = false;
    console.warn('ℹ️ Serializador oficial no disponible; uso el de respaldo.', err && err.message);
  }
  return serializadorOficial;
}

function serializarRespaldo(campos) {
  return campos
    .map(function (c) {
      var v = c.v;
      switch (v.tipo) {
        case 'texto': return c.etiqueta + ': ' + v.valor;
        case 'lista': return c.etiqueta + ':\n' + v.valores.map(function (x) { return '- ' + x; }).join('\n');
        case 'triestado': return c.etiqueta + ' ' + ({ si: 'Sí', no: 'No', na: 'No aplica' })[v.valor] + (v.detalle ? '. ' + v.detalle : '');
        case 'repetible': return c.etiqueta + ':\n' + v.items.map(function (it) { return '- ' + Object.values(it).filter(Boolean).join(' — '); }).join('\n');
        case 'horario': return c.etiqueta + ':\n' + v.dias.map(function (d) {
          return '- ' + d.dia + ': ' + (d.cerrado ? 'Cerrado' : d.intervalos.map(function (i) { return i.desde + ' a ' + i.hasta; }).join(', '));
        }).join('\n');
      }
    })
    .join('\n');
}

async function construirPreset(preset) {
  var campos = {};
  preset.campos.forEach(function (c) { campos[c.id] = c.v; });
  var estructura = { schemaVersion: 1, schemaId: preset.schemaId, campos: campos, adicional: '' };
  var oficial = await cargarSerializador();
  var contenido = oficial ? oficial(estructura) : serializarRespaldo(preset.campos);
  return { contenido: contenido, estructura: estructura };
}

// ─── Carga ───────────────────────────────────────────────────────────────────────────────────────────

/** Mapa título → id de los documentos de la KB tras la carga (útil para PATCH/DELETE posteriores). */
var KB_DOC_IDS = {};

async function listarDocumentos() {
  var res = await api('GET', '/kb/documents?page=1&limit=100');
  return res.data;
}

async function guardarDocumento(existentes, titulo, body) {
  if (body.contenido.length > 15000) throw new Error('"' + titulo + '" supera 15.000 caracteres (' + body.contenido.length + ')');
  var doc = existentes.find(function (d) { return normalizar(d.titulo) === normalizar(titulo); });
  if (doc) {
    var r = await api('PATCH', '/kb/documents/' + doc.id, body);
    KB_DOC_IDS[titulo] = doc.id;
    console.log('✔ Actualizado:', titulo, r ? '(' + r.estadoIndexacion + ')' : '');
  } else {
    var c = await api('POST', '/kb/documents', Object.assign({ titulo: titulo }, body));
    if (c) KB_DOC_IDS[titulo] = c.id;
    console.log('✔ Creado:', titulo, c ? '(' + c.estadoIndexacion + ')' : '');
  }
}

async function cargarKb() {
  var existentes = await listarDocumentos();
  for (var i = 0; i < PRESETS.length; i++) {
    var p = PRESETS[i];
    await guardarDocumento(existentes, p.titulo, await construirPreset(p));
  }
  for (var j = 0; j < DOCUMENTOS_TEXTO.length; j++) {
    var d = DOCUMENTOS_TEXTO[j];
    await guardarDocumento(existentes, d.titulo, { contenido: d.contenido });
  }
  console.table(KB_DOC_IDS);
}

/** Mapa pregunta → id de las FAQs (las existentes y las creadas). */
var FAQ_IDS = {};

async function cargarFaqs() {
  var existentes = (await api('GET', '/kb/faqs?page=1&limit=100')).data;
  existentes.forEach(function (f) { FAQ_IDS[f.pregunta] = f.id; });
  var claves = new Set(existentes.map(function (f) { return normalizar(f.pregunta); }));
  for (var i = 0; i < FAQS.length; i++) {
    var pregunta = FAQS[i][0];
    var respuesta = FAQS[i][1];
    if (claves.has(normalizar(pregunta))) {
      console.log('• Ya existe:', pregunta);
      continue;
    }
    // Una a la vez: cada creación calcula su embedding de forma síncrona en el backend.
    var creada = await api('POST', '/kb/faqs', { pregunta: pregunta, respuesta: respuesta, activo: true });
    if (creada) FAQ_IDS[pregunta] = creada.id;
    console.log('✔ FAQ creada:', pregunta);
  }
}

/** Revisa el estado de indexación (ejecútalo unos segundos después de cargar). */
async function estadoKb() {
  var docs = await listarDocumentos();
  console.table(docs.map(function (d) {
    return { titulo: d.titulo, estado: d.estadoIndexacion, chunks: d.chunkCount, error: d.error || '' };
  }));
}

async function cargarTodo() {
  console.log('── Base de conocimiento ──');
  await cargarKb();
  console.log('── Preguntas frecuentes ──');
  await cargarFaqs();
  console.log('Listo ✅  En ~30 s ejecuta  await estadoKb()  para confirmar que todo quedó «indexado».');
}

console.log('Script cargado. Ejecuta:  await cargarTodo()   (DRY_RUN = ' + DRY_RUN + ')');
