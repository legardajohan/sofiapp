import type { KbSchemaDef } from '../kb-schemas.js';

/**
 * Formulario guiado de «Horarios y ubicación» (HU-KB-10).
 *
 * Primer consumidor real del `kind: 'horario'` y de su primitivo `ScheduleDayEditor`, que HU-KB-07
 * dejó listos y sin usar.
 *
 * Es dueña de tres cosas y solo tres: **dónde está** el negocio, **cómo lo contactan** y **cuándo
 * atiende**. Las tres fronteras vecinas quedan declaradas en el spec y no se cruzan aquí:
 *  · zonas de cobertura y despacho → `empresa` (HU-KB-08): dónde vende, no dónde está.
 *  · modalidades y tiempos de entrega → `productos` (HU-KB-09): cómo llega lo que se vende.
 *  · garantías, devoluciones y términos → HU-KB-11.
 *
 * **Ningún campo es obligatorio, y es deliberado.** La categoría es opcional y eliminable, y
 * cualquier candidato a obligatorio falla para algún tipo de negocio: un negocio solo-online no
 * tiene dirección, uno que solo atiende por correo no tiene WhatsApp, uno 24/7 —o un local dentro
 * de un centro comercial— no tiene un horario propio que declarar. Tampoco hace falta coerción: el
 * editor ya impide crear con el texto serializado vacío.
 *
 * **Los `id` están congelados**, los de campo y los de columna. En cuanto un tenant guarda,
 * renombrar uno deja su dato huérfano.
 */
export const HORARIOS_SCHEMA: KbSchemaDef = {
  id: 'horarios',
  /**
   * Sube solo con cambios **incompatibles**: cambiar el `kind` de un campo, retirar uno,
   * convertirlo en obligatorio, o quitar/renombrar una columna de `otras_sedes`.
   */
  version: 1,
  secciones: [
    {
      id: 'ubicacion',
      titulo: 'Dónde están',
      descripcion: 'La dirección y otras sedes',
      campos: [
        {
          id: 'direccion',
          etiqueta: 'Dirección',
          kind: 'texto-medio',
          requisito: 'opcional',
          maxLength: 200,
          ayuda: 'La dirección del punto principal de atención.',
        },
        {
          id: 'indicaciones',
          etiqueta: 'Cómo llegar',
          kind: 'texto-medio',
          requisito: 'opcional',
          ayuda: 'Referencias que ayuden a ubicarlo: «frente al parque, segundo piso».',
        },
        {
          id: 'otras_sedes',
          etiqueta: 'Otras sedes',
          kind: 'repetible',
          requisito: 'opcional',
          maxItems: 6,
          // Convive con `direccion` a propósito: el caso común es una sola ubicación, y obligar a
          // ese admin a pulsar «Añadir» para escribirla sería fricción sin ganancia. La etiqueta y
          // la ayuda son lo que evita que alguien duplique aquí la principal — no hay forma fiable
          // de detectarlo, y bloquear por sospecha sería peor que el problema.
          ayuda: 'Solo si atiendes en más de un punto.',
          // Los `id` de subcampo acaban DENTRO del texto que lee la IA (el serializador emite la
          // clave, no la etiqueta), así que van en español legible.
          subcampos: [
            { id: 'nombre', etiqueta: 'Nombre de la sede', maxLength: 60 },
            { id: 'direccion', etiqueta: 'Dirección', maxLength: 120 },
            { id: 'telefono', etiqueta: 'Teléfono', maxLength: 40 },
          ],
        },
      ],
    },
    {
      id: 'contacto',
      titulo: 'Cómo contactarlos',
      descripcion: 'Por dónde le escriben o llaman',
      campos: [
        // Los tres canales van como campos DEDICADOS y no como una lista libre: aquí la ambigüedad
        // no da una respuesta pobre, da una incorrecta. Un «3001234567» suelto no le dice a la IA
        // si es WhatsApp o fijo, y mandaría al cliente al número equivocado. Así el fragmento
        // indexado dice literalmente «WhatsApp: 3001234567» y no hay nada que adivinar.
        {
          id: 'whatsapp',
          etiqueta: 'WhatsApp',
          kind: 'texto-corto',
          requisito: 'opcional',
          maxLength: 60,
        },
        {
          id: 'telefono',
          etiqueta: 'Teléfono',
          kind: 'texto-corto',
          requisito: 'opcional',
          maxLength: 60,
        },
        {
          id: 'correo',
          etiqueta: 'Correo electrónico',
          kind: 'texto-corto',
          requisito: 'opcional',
          maxLength: 80,
        },
        {
          id: 'redes_sociales',
          etiqueta: 'Redes sociales',
          kind: 'lista',
          requisito: 'opcional',
          maxItems: 6,
          maxLength: 80,
          // Una lista y no un campo por red: declararlos obligaría a adivinar cuáles usa cada
          // negocio (Instagram, TikTok, X, LinkedIn…) y a quedarse corto igual.
          ayuda: 'Una por línea, con su nombre: «Instagram: @acme».',
        },
      ],
    },
    {
      id: 'horarios',
      titulo: 'Cuándo atienden',
      descripcion: 'Los días y las horas de atención',
      campos: [
        {
          id: 'horario_atencion',
          etiqueta: 'Horario de atención',
          kind: 'horario',
          requisito: 'opcional',
          // El ÚNICO campo de horario. Un horario de despacho cruzaría a HU-KB-09, dueña de
          // `tiempos_entrega`: aquí se responde «¿cuándo atienden?», allá «¿cuánto tarda en
          // llegarme?».
          ayuda: 'Marca «Cerrado» los días que no abren: saberlo es tan útil como el horario.',
        },
        {
          id: 'excepciones_horario',
          etiqueta: 'Días especiales',
          kind: 'texto-medio',
          requisito: 'opcional',
          // Cubre lo que el editor de días no puede expresar, sin inventar un `kind` nuevo.
          ayuda: 'Festivos, Semana Santa, horario de temporada…',
        },
      ],
    },
  ],
};
