import type { KbSchemaDef } from '../kb-schemas.js';

/**
 * Formulario guiado de «Políticas y términos» (HU-KB-11).
 *
 * Cuarta y última categoría con forma propia, y **primer uso pleno del `kind: 'triestado'`**:
 * `parte_de_grupo` (HU-KB-08) ya lo usaba, pero suelto. Aquí hay seis en fila y el tercer estado
 * pasa a ser el corazón del diseño.
 *
 * Es dueña de una sola cosa: **las reglas que rigen la relación comercial**. Qué pasa con lo que ya
 * se vendió (devolución, cambio, garantía) y qué condiciones exige ser atendido (reserva, mascotas,
 * mínimos), más los términos formales que aplican a toda compra.
 *
 * **«No aplica» es una respuesta con valor propio, no un campo vacío.** El serializador escribe
 * literalmente `No aplica`, distinto de `No`, y `valorVacio` nunca considera vacío a un `triestado`
 * presente. Sin esa distinción, «no tenemos política de devoluciones» y «no vendemos productos
 * físicos» quedarían indistinguibles, y la IA respondería lo mismo en dos situaciones opuestas.
 *
 * El reparto 3 + 3 entre post-venta y atención es una **heurística de cobertura**, no una simetría
 * que haya que respetar al llenar: sirve para que ningún tipo de negocio abra el formulario y no
 * encuentre nada suyo. Un negocio puede responder «No aplica» a las seis y eso ya es dato. Por eso
 * las dos familias van en la MISMA sección: separarlas sugeriría un reparto obligatorio.
 *
 * **Ningún campo es obligatorio, y es deliberado.** La categoría es opcional y eliminable, y el
 * tri-estado ya tiene una respuesta para «esto no me describe», así que exigirlo no aportaría ningún
 * dato: solo obligaría a pulsar un botón. Tampoco hace falta coerción — el editor ya impide crear
 * con el texto serializado vacío, y basta una respuesta (aunque sea «No aplica») para superar ese
 * piso.
 *
 * Lo que NO va aquí, por categoría — las cinco fronteras del `spec.md`:
 *  · entrega y despacho → `productos` (HU-KB-09): **cómo llega lo que se vende**. Esta categoría
 *    solo entra cuando la pregunta es **qué pasa con lo ya vendido**. Un «¿hacen envíos?» duplicaría
 *    `modalidades_entrega` con peor resolución: la lista dice CUÁLES, el tri-estado solo diría SÍ.
 *    Caso límite resuelto: «¿quién paga el envío de una devolución?» es una condición de la
 *    devolución → va en el detalle de `acepta_devoluciones`, no en `productos`.
 *  · dirección, contacto y horarios → `horarios` (HU-KB-10). `requiere_reserva` no es un horario:
 *    no dice cuándo abren, dice qué condición hay que cumplir para ser atendido.
 *  · identidad, misión y zonas de cobertura → `empresa` (HU-KB-08).
 *  · catálogo y precios → `productos` (HU-KB-09). `consumo_minimo` no es un precio: no dice cuánto
 *    cuesta algo, dice qué condición hay que cumplir para comprarlo.
 *  · formas de pago → `formas_pago` en `productos` (HU-KB-09). Ya tienen dueño; declararlas aquí
 *    dejaría a la IA con dos fuentes que pueden contradecirse.
 *
 * **Los `id` están congelados.** En cuanto un tenant guarda, renombrar uno deja su dato huérfano.
 * Para cambiar lo que se lee en pantalla está `etiqueta` — y aquí las etiquetas son preguntas
 * completas justamente porque acaban dentro del texto que lee la IA.
 *
 * «Información adicional» no aparece en este archivo a propósito: no es un campo del schema sino el
 * `adicional` del sobre `KbEstructura`, y lo renderiza siempre `KnowledgeStructuredForm`.
 */
export const POLITICAS_SCHEMA: KbSchemaDef = {
  id: 'politicas',
  /**
   * Sube solo con cambios **incompatibles**: cambiar el `kind` de un campo, retirar uno o
   * convertirlo en obligatorio. Añadir una séptima política **no** la mueve.
   */
  version: 1,
  secciones: [
    {
      id: 'politicas',
      titulo: 'Políticas frecuentes',
      descripcion: 'Lo que más preguntan los clientes',
      campos: [
        // Post-venta: qué pasa con lo que YA se vendió. Ninguna cruza a HU-KB-09 — hablan de la
        // devolución, el cambio o la garantía, no de cómo llegó el producto.
        {
          id: 'acepta_devoluciones',
          etiqueta: '¿Aceptan devoluciones?',
          kind: 'triestado',
          requisito: 'opcional',
          ayuda: 'Si es «Sí», di el plazo y las condiciones: «30 días con factura y empaque original».',
        },
        {
          id: 'acepta_cambios',
          etiqueta: '¿Hacen cambios?',
          kind: 'triestado',
          requisito: 'opcional',
          ayuda: 'Un cambio no es una devolución: aquí va el cambio por talla, color o referencia.',
        },
        {
          id: 'ofrece_garantia',
          etiqueta: '¿Ofrecen garantía?',
          kind: 'triestado',
          requisito: 'opcional',
          ayuda: 'Si es «Sí», di cuánto dura y qué cubre.',
        },
        // Atención: qué condiciones hay que cumplir para ser atendido. Van en esta misma sección a
        // propósito (ver el reparto 3 + 3 en la cabecera).
        {
          id: 'requiere_reserva',
          etiqueta: '¿Se atiende con reserva o cita previa?',
          kind: 'triestado',
          requisito: 'opcional',
          // La política de cancelación cabe aquí, en el detalle: no merece un campo propio y
          // separarla dejaría dos sitios donde buscar la misma respuesta.
          ayuda: 'Si es «Sí», di con cuánta anticipación y qué pasa si el cliente cancela.',
        },
        {
          id: 'admite_mascotas',
          etiqueta: '¿Admiten mascotas?',
          kind: 'triestado',
          requisito: 'opcional',
          // `PolicyTriState` solo pide el detalle al responder «Sí» (hallazgo H2 del `spec.md`), así
          // que las excepciones sobre un «No» se mandan explícitamente a `otras_politicas`.
          ayuda:
            'Si hay excepciones a un «No» (perros guía, zonas al aire libre), escríbelas en «Otras políticas».',
        },
        {
          id: 'consumo_minimo',
          etiqueta: '¿Hay consumo o pedido mínimo?',
          kind: 'triestado',
          requisito: 'opcional',
          ayuda: 'Si es «Sí», di de cuánto es y cuándo aplica.',
        },
      ],
    },
    {
      id: 'terminos',
      titulo: 'Términos y condiciones',
      descripcion: 'Lo que no cabe en un sí o un no',
      campos: [
        {
          id: 'otras_politicas',
          etiqueta: 'Otras políticas',
          kind: 'texto-largo',
          requisito: 'opcional',
          maxLength: 800,
          // Vía de escape de la sección de arriba: recoge lo que no merece una pregunta fija (edad
          // mínima, parqueadero) y las excepciones que el detalle de un «No» no puede expresar.
          // Las formas de pago NO son de esta categoría: viven en `formas_pago` (HU-KB-09).
          ayuda:
            'Reglas que no están arriba: edades mínimas, parqueadero, acompañantes… Las formas de pago van en «Productos y servicios».',
        },
        {
          id: 'terminos_generales',
          etiqueta: 'Términos y condiciones',
          kind: 'texto-largo',
          requisito: 'opcional',
          // El tope por defecto (1.500) es parte del diseño: lo que se escriba aquí lo va a leer una
          // IA para contestar por WhatsApp, y un contrato entero recupera peor que un párrafo claro.
          ayuda:
            'Las condiciones que aplican a toda compra. Un resumen en tus palabras funciona mejor que el texto legal completo.',
        },
      ],
    },
  ],
};
