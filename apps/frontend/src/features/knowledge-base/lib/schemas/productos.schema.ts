import type { KbSchemaDef } from '../kb-schemas.js';

/**
 * Formulario guiado de «Productos y servicios» (HU-KB-09).
 *
 * Primer consumidor real del `kind: 'repetible'`, que HU-KB-07 dejó implementado y sin usar.
 *
 * Responde una pregunta concreta: **qué ofrece el negocio y qué es relevante saber de cada cosa**.
 * Es conocimiento estable para la IA, no un CRM: aquí no entran existencias, unidades, SKU, estados
 * del producto ni precios por cliente. El catálogo operativo es otro feature (`/catalogo`), con su
 * propio modelo.
 *
 * **El precio no es una columna, y es deliberado.** Envejece igual que las existencias, con el
 * agravante de que parece estable: incrustado en el texto indexado sobrevive a cada cambio de tarifa
 * hasta que alguien reabra el modal, y mientras tanto la IA promete cifras que ya no existen — peor
 * que responder «eso se cotiza». Lo estable de un producto (qué es, qué incluye, para quién) va en
 * `descripcion`; el dinero va en `notas_precios`, donde se dice como rango orientativo y envejece
 * bien. Reintroducir una columna `precio` sería un cambio de `version` y una decisión de producto
 * que habría que volver a discutir.
 *
 * **Los `id` están congelados**, los de campo y los de columna. En cuanto un tenant guarda,
 * renombrar uno deja su dato huérfano. Para cambiar lo que se lee en pantalla está `etiqueta`.
 *
 * Lo que NO va aquí, por categoría: identidad, misión y zonas de cobertura (HU-KB-08); dirección,
 * canales de contacto y horarios (HU-KB-10); garantías, devoluciones y términos (HU-KB-11).
 * `modalidades_entrega` y `tiempos_entrega` sí viven aquí: describen cómo llega lo que se vende, que
 * es parte de la oferta — HU-KB-10 los declara fuera de su alcance.
 */
export const PRODUCTOS_SCHEMA: KbSchemaDef = {
  id: 'productos',
  /**
   * Sube solo con cambios **incompatibles**: cambiar el `kind` de un campo, retirar uno, convertir
   * un opcional en obligatorio, o quitar/renombrar una columna del `repetible`.
   */
  version: 1,
  secciones: [
    {
      id: 'oferta',
      titulo: 'Qué ofrece',
      descripcion: 'Lo que el negocio vende o presta',
      campos: [
        {
          id: 'resumen_oferta',
          etiqueta: '¿Qué vende o qué servicios presta?',
          kind: 'texto-largo',
          // Sin el marco general, la IA solo tendría una lista de nombres sueltos.
          requisito: 'obligatorio',
          // 600 y no los 1.500 del kind: esto es un resumen, el detalle vive en las filas de abajo.
          // El recorte es además lo que le deja aire al `repetible` en el presupuesto.
          maxLength: 600,
          ayuda: 'En dos o tres frases, a qué se dedica la oferta en conjunto.',
        },
        {
          id: 'catalogo',
          etiqueta: 'Productos y servicios',
          kind: 'repetible',
          // Sin al menos una fila, la IA no puede nombrar ni describir nada concreto: es la razón de
          // ser de esta categoría.
          requisito: 'obligatorio',
          // 12 y no más, por dilución del retrieval: cada ~850 caracteres nace un fragmento, los
          // fragmentos compiten entre sí y `KB_RETRIEVAL_K` solo deja pasar 5 al prompt. Doce
          // productos bien descritos se recuperan mejor que veinte a medias.
          maxItems: 12,
          // Los `id` de los subcampos acaban DENTRO del texto que lee la IA (el serializador emite
          // la clave, no la etiqueta), así que van en español legible.
          subcampos: [
            { id: 'nombre', etiqueta: 'Nombre', maxLength: 60 },
            { id: 'descripcion', etiqueta: 'Qué es o qué incluye', maxLength: 120 },
          ],
          ayuda: 'Una fila por producto o servicio. Describe lo que no cambia cada mes.',
        },
      ],
    },
    {
      id: 'precios',
      titulo: 'Precios y condiciones',
      descripcion: 'Cómo se cobra lo que se ofrece',
      campos: [
        {
          id: 'notas_precios',
          etiqueta: 'Cómo se cotiza',
          kind: 'texto-medio',
          requisito: 'opcional',
          // Único sitio donde se habla de dinero. La ayuda empuja a un RANGO a propósito: un rango
          // envejece bien, una tarifa cerrada caduca a la primera y deja mintiendo a la IA.
          ayuda: 'Mejor un rango que una tarifa: «los planes van de $10 a $50 según usuarios».',
        },
        {
          id: 'formas_pago',
          etiqueta: 'Formas de pago',
          kind: 'lista',
          requisito: 'opcional',
          maxItems: 8,
          maxLength: 60,
          ayuda: 'Efectivo, transferencia, tarjeta, contra entrega…',
        },
        {
          id: 'promociones',
          etiqueta: 'Promociones o descuentos',
          kind: 'texto-medio',
          requisito: 'opcional',
          ayuda: 'Descuentos por volumen, por temporada o por primera compra.',
        },
      ],
    },
    {
      id: 'entrega',
      titulo: 'Cómo se entrega',
      descripcion: 'Cómo llega al cliente lo que compra',
      campos: [
        {
          id: 'modalidades_entrega',
          etiqueta: 'Cómo se entrega',
          kind: 'lista',
          requisito: 'opcional',
          maxItems: 6,
          maxLength: 60,
          ayuda: 'Domicilio, recoger en tienda, envío nacional, entrega digital…',
        },
        {
          id: 'tiempos_entrega',
          etiqueta: 'Tiempos de entrega',
          kind: 'texto-medio',
          requisito: 'opcional',
          ayuda: 'Cuánto tarda, y de qué depende.',
        },
      ],
    },
  ],
};
