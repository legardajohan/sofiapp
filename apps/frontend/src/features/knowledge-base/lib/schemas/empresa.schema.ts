import type { KbSchemaDef } from '../kb-schemas.js';

/**
 * Formulario guiado de «Información de la empresa» (HU-KB-08).
 *
 * Es la primera de las cuatro categorías con forma propia y la única `obligatorio: true` junto con
 * productos, así que su diseño responde a una tensión: pedir lo suficiente para que la IA pueda
 * hablar del negocio, sin volver imposible cerrar una tarjeta que el sistema exige completar. De ahí
 * que solo dos campos sean obligatorios.
 *
 * **Los `id` están congelados.** En cuanto un tenant guarda, renombrar uno deja su dato huérfano:
 * dejaría de serializarse bajo su etiqueta y pasaría a «Otros datos». Para cambiar lo que se lee en
 * pantalla está `etiqueta`, que sí es libre.
 *
 * Lo que NO va aquí, por categoría: catálogo y precios (HU-KB-09); dirección, sedes, canales de
 * contacto y horarios (HU-KB-10); devoluciones y garantías (HU-KB-11); envíos y entrega (HU-KB-09);
 * y el tono de voz de la IA, que es configuración del prompt (`HT-AI-01`) y no conocimiento
 * recuperable.
 *
 * `zonas_cobertura` sí vive aquí: describe el **alcance** del negocio —dónde vende y despacha—, no
 * su dirección física. HU-KB-10 lo declara fuera de su alcance para que no se duplique.
 *
 * «Información adicional» no aparece en este archivo a propósito: no es un campo del schema sino el
 * `adicional` del sobre `KbEstructura`, y lo renderiza siempre `KnowledgeStructuredForm`.
 */
export const EMPRESA_SCHEMA: KbSchemaDef = {
  id: 'empresa',
  /**
   * Sube solo con cambios **incompatibles**: cambiar el `kind` de un campo, retirar uno, o
   * convertir un opcional en obligatorio. Añadir un campo opcional o retocar una etiqueta no la
   * mueve.
   */
  version: 1,
  secciones: [
    {
      id: 'identidad',
      titulo: 'Identidad',
      descripcion: 'Cómo se llama y a qué se dedica',
      campos: [
        {
          id: 'nombre_comercial',
          etiqueta: 'Nombre comercial',
          kind: 'texto-corto',
          // Sin esto la IA no sabe cómo llamarse al responder.
          requisito: 'obligatorio',
          ayuda: 'Como te conocen tus clientes, no necesariamente el nombre legal.',
        },
        {
          id: 'razon_social',
          etiqueta: 'Razón social',
          kind: 'texto-corto',
          requisito: 'opcional',
          ayuda: 'El nombre legal, si es distinto. Sirve para facturación y trámites.',
        },
        {
          id: 'descripcion',
          etiqueta: '¿A qué se dedica?',
          kind: 'texto-largo',
          // Sin esto la IA no sabe qué vende el negocio: es el campo que más trabaja.
          requisito: 'obligatorio',
          ayuda: 'En un párrafo: qué hace la empresa y para quién.',
        },
        {
          id: 'anio_fundacion',
          etiqueta: 'Año de fundación',
          kind: 'texto-corto',
          requisito: 'opcional',
          // 30 y no los 120 del kind: un año no es una biografía. Al no existir un `kind` numérico
          // ni de fecha en el contrato, el tope estrecho es la única señal de formato disponible;
          // "desde 2011" sigue siendo una respuesta válida y útil.
          maxLength: 30,
          ayuda: 'Ej. 2011.',
        },
      ],
    },
    {
      id: 'proposito',
      titulo: 'Propósito y valores',
      descripcion: 'Lo que mueve al negocio',
      campos: [
        {
          id: 'mision',
          etiqueta: 'Misión',
          kind: 'texto-medio',
          requisito: 'opcional',
        },
        {
          id: 'vision',
          etiqueta: 'Visión',
          kind: 'texto-medio',
          requisito: 'opcional',
        },
        {
          id: 'valores',
          etiqueta: 'Valores',
          kind: 'lista',
          requisito: 'opcional',
          maxItems: 6,
          ayuda: 'Uno por línea. Con tres o cuatro bien elegidos alcanza.',
        },
      ],
    },
    {
      id: 'alcance',
      titulo: 'Alcance y respaldo',
      descripcion: 'A quién le sirve y qué lo respalda',
      campos: [
        {
          id: 'clientes_objetivo',
          etiqueta: '¿A quién le sirve?',
          kind: 'texto-medio',
          requisito: 'opcional',
          ayuda: 'Qué tipo de cliente atiende: personas, empresas, un sector concreto…',
        },
        {
          id: 'zonas_cobertura',
          etiqueta: 'Zonas donde atiende',
          kind: 'lista',
          requisito: 'opcional',
          maxItems: 12,
          ayuda: 'Ciudades, regiones o barrios donde vende o despacha.',
        },
        {
          id: 'diferenciadores',
          etiqueta: 'Qué lo hace distinto',
          kind: 'lista',
          requisito: 'opcional',
          maxItems: 6,
          ayuda: 'Razones concretas para elegirte por encima de la competencia.',
        },
        {
          id: 'parte_de_grupo',
          etiqueta: '¿Hace parte de un grupo o casa matriz?',
          kind: 'triestado',
          requisito: 'opcional',
          // El tercer valor gana su sitio: «No aplica» (soy independiente, la pregunta no me
          // describe) y «No» (no tengo casa matriz) no significan lo mismo para quien redacta una
          // respuesta.
        },
        {
          id: 'grupo_empresarial',
          etiqueta: 'Nombre del grupo',
          kind: 'texto-corto',
          // Condicional real, no un pretexto: el nombre del grupo solo tiene sentido si la
          // respuesta anterior fue «Sí». Al ocultarse deja de exigirse y deja de llegar al texto
          // que lee la IA — las dos reglas ya las implementó HU-KB-07.
          requisito: 'condicional',
          visibleSi: (campos) => {
            const respuesta = campos.parte_de_grupo;
            return respuesta?.tipo === 'triestado' && respuesta.valor === 'si';
          },
        },
        {
          id: 'certificaciones',
          etiqueta: 'Certificaciones o afiliaciones',
          kind: 'lista',
          requisito: 'opcional',
          maxItems: 6,
          ayuda: 'Sellos, gremios o certificaciones que respalden al negocio.',
        },
      ],
    },
  ],
};
