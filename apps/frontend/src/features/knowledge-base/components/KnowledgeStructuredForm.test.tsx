import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { KbEstructura } from '../types/index.js';
import { KB_SCHEMAS, camposFaltantes, type KbSchemaDef } from '../lib/kb-schemas.js';
import { serializeEstructura } from '../lib/kb-serialize.js';
import { KnowledgeStructuredForm } from './KnowledgeStructuredForm.js';

const SCHEMA: KbSchemaDef = {
  id: 'generico',
  version: 2,
  secciones: [
    {
      id: 'identidad',
      titulo: 'Identidad',
      descripcion: 'Quiénes son',
      campos: [
        { id: 'nombre', etiqueta: 'Nombre', kind: 'texto-corto', requisito: 'obligatorio' },
        { id: 'lema', etiqueta: 'Lema', kind: 'texto-medio', requisito: 'opcional' },
      ],
    },
    {
      id: 'politicas',
      titulo: 'Políticas',
      campos: [
        {
          id: 'devoluciones',
          etiqueta: '¿Aceptan devoluciones?',
          kind: 'triestado',
          requisito: 'obligatorio',
        },
        {
          id: 'plazo',
          etiqueta: 'Plazo',
          kind: 'texto-corto',
          requisito: 'condicional',
          visibleSi: (campos) => {
            const v = campos.devoluciones;
            return v?.tipo === 'triestado' && v.valor === 'si';
          },
        },
      ],
    },
  ],
};

function estructura(campos: KbEstructura['campos'] = {}, adicional = ''): KbEstructura {
  return { schemaVersion: 2, schemaId: 'generico', campos, adicional };
}

/**
 * Arnés que replica lo que hará `KnowledgeUploadEditor`: el formulario más el botón de guardado
 * gobernado por `camposFaltantes`. Prueba el contrato que conecta a ambos; la integración real con
 * la mutación se verifica en el test del editor.
 */
function Formulario({
  schema = SCHEMA,
  inicial = estructura(),
  mostrarErrores = false,
}: {
  schema?: KbSchemaDef;
  inicial?: KbEstructura;
  mostrarErrores?: boolean;
}) {
  const [valor, setValor] = useState(inicial);
  const faltantes = camposFaltantes(schema, valor);

  return (
    <>
      <KnowledgeStructuredForm
        schema={schema}
        estructura={valor}
        onEstructuraChange={setValor}
        mostrarErrores={mostrarErrores}
      />
      <button type="submit" disabled={faltantes.length > 0}>
        Guardar e indexar
      </button>
      <output data-testid="serializado">{serializeEstructura(valor, schema)}</output>
    </>
  );
}

/**
 * Schema sin un solo campo exigible: es el único que ejercita el contador «x de y» de las pestañas,
 * porque en cuanto una sección tiene un obligatorio su indicador pasa a ser el badge ámbar.
 */
const SCHEMA_SIN_OBLIGATORIOS: KbSchemaDef = {
  id: 'generico',
  version: 2,
  secciones: [
    {
      id: 'contacto',
      titulo: 'Contacto',
      campos: [
        { id: 'whatsapp', etiqueta: 'WhatsApp', kind: 'texto-corto', requisito: 'opcional' },
        { id: 'correo', etiqueta: 'Correo', kind: 'texto-corto', requisito: 'opcional' },
      ],
    },
  ],
};

const guardar = () => screen.getByRole('button', { name: 'Guardar e indexar' });
const pestana = (nombre: RegExp) => screen.getByRole('tab', { name: nombre });

/** Con pestañas, los campos de una sección inactiva NO están montados: hay que ir a ella primero. */
async function irA(user: ReturnType<typeof userEvent.setup>, nombre: RegExp): Promise<void> {
  await user.click(pestana(nombre));
}

describe('las pestañas reflejan el schema', () => {
  it('renderiza una pestaña por cada sección declarada', () => {
    render(<Formulario />);

    expect(pestana(/Identidad/)).toBeInTheDocument();
    expect(pestana(/Políticas/)).toBeInTheDocument();
  });

  it('solo la sección activa muestra su descripción y sus campos', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    // La primera sección es la activa por defecto.
    expect(screen.getByText('Quiénes son')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Nombre/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Lema/ })).toBeInTheDocument();
    expect(screen.getByText(/Opcional/)).toBeInTheDocument();
    // Lo de la otra pestaña NO está en el DOM: `TabsContent` desmonta lo inactivo.
    expect(screen.queryByRole('radio', { name: 'No aplica' })).not.toBeInTheDocument();

    await irA(user, /Políticas/);

    expect(screen.getByRole('radio', { name: 'No aplica' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /Nombre/ })).not.toBeInTheDocument();
  });

  it('un schema SIN secciones no pinta pestañas, pero sí «Información adicional»', () => {
    render(<Formulario schema={KB_SCHEMAS.generico} inicial={estructura()} />);

    expect(screen.queryAllByRole('tab')).toHaveLength(0);
    expect(screen.getByRole('textbox', { name: 'Información adicional' })).toBeInTheDocument();
  });

  it('una sección SIN obligatorios lleva el contador «x de y» de campos llenos', async () => {
    const user = userEvent.setup();
    render(<Formulario schema={SCHEMA_SIN_OBLIGATORIOS} />);

    expect(pestana(/Contacto/)).toHaveTextContent('0 de 2');

    await user.type(screen.getByRole('textbox', { name: /WhatsApp/ }), '3001234567');

    // Se recalcula mientras se escribe: la pestaña es lo único que informa de las secciones que el
    // admin no está mirando.
    expect(pestana(/Contacto/)).toHaveTextContent('1 de 2');
  });

  it('una sección CON obligatorios lleva el badge de cuántos faltan, y su título queda intacto', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    const identidad = pestana(/Identidad/);
    expect(within(identidad).getByTitle('Falta 1 campo obligatorio')).toBeInTheDocument();
    // El número va `aria-hidden`, así que el NOMBRE accesible del tab sigue siendo solo el título:
    // sin esto, un lector de pantalla anunciaría «Identidad 1».
    expect(identidad).toHaveAccessibleName('Identidad');

    await user.type(screen.getByRole('textbox', { name: /Nombre/ }), 'Acme');

    expect(within(pestana(/Identidad/)).queryByTitle(/Falta/)).not.toBeInTheDocument();
    expect(within(pestana(/Identidad/)).getByText('Sección completa')).toBeInTheDocument();
    // La otra sigue reclamando lo suyo, que es justo para lo que sirve el indicador.
    expect(within(pestana(/Políticas/)).getByTitle('Falta 1 campo obligatorio')).toBeInTheDocument();
  });

  it('el badge pluraliza en español', () => {
    const dosObligatorios: KbSchemaDef = {
      id: 'generico',
      version: 2,
      secciones: [
        {
          id: 'identidad',
          titulo: 'Identidad',
          campos: [
            { id: 'nombre', etiqueta: 'Nombre', kind: 'texto-corto', requisito: 'obligatorio' },
            { id: 'nit', etiqueta: 'NIT', kind: 'texto-corto', requisito: 'obligatorio' },
          ],
        },
      ],
    };
    render(<Formulario schema={dosObligatorios} />);

    expect(screen.getByTitle('Faltan 2 campos obligatorios')).toBeInTheDocument();
  });
});

describe('«Información adicional» está siempre', () => {
  it('aparece con schema con secciones', () => {
    render(<Formulario />);
    expect(screen.getByRole('textbox', { name: 'Información adicional' })).toBeInTheDocument();
  });

  it('aparece con schema sin secciones', () => {
    render(<Formulario schema={KB_SCHEMAS.generico} />);
    expect(screen.getByRole('textbox', { name: 'Información adicional' })).toBeInTheDocument();
  });

  it('queda FUERA de las pestañas: cambiar de sección no la esconde', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    // Cambiar de pestaña sí desmonta los campos de la otra sección…
    await irA(user, /Políticas/);
    expect(screen.queryByRole('textbox', { name: /Nombre/ })).not.toBeInTheDocument();

    // …pero la vía de texto libre sigue a la vista, esté donde esté el admin.
    expect(screen.getByRole('textbox', { name: 'Información adicional' })).toBeInTheDocument();
  });

  it('lo escrito ahí llega al texto serializado', async () => {
    const user = userEvent.setup();
    render(<Formulario schema={KB_SCHEMAS.generico} />);

    await user.type(screen.getByRole('textbox', { name: 'Información adicional' }), 'Cerramos en enero');

    expect(screen.getByTestId('serializado')).toHaveTextContent('Cerramos en enero');
  });
});

describe('campos obligatorios y el botón de guardar', () => {
  it('con obligatorios sin llenar, Guardar está deshabilitado', () => {
    render(<Formulario />);
    expect(guardar()).toBeDisabled();
  });

  it('se habilita en cuanto se resuelven todos los obligatorios, estén en la pestaña que estén', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    await user.type(screen.getByRole('textbox', { name: /Nombre/ }), 'Acme');
    expect(guardar()).toBeDisabled(); // falta el tri-estado, que vive en la otra pestaña

    await irA(user, /Políticas/);
    await user.click(screen.getByRole('radio', { name: 'No' }));
    expect(guardar()).toBeEnabled();
  });

  it('un opcional vacío nunca bloquea', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    await user.type(screen.getByRole('textbox', { name: /Nombre/ }), 'Acme');
    await irA(user, /Políticas/);
    await user.click(screen.getByRole('radio', { name: 'No' }));

    await irA(user, /Identidad/);
    expect(screen.getByRole('textbox', { name: /Lema/ })).toHaveValue('');
    expect(guardar()).toBeEnabled();
  });

  it('los errores rojos solo salen tras intentar guardar, no al abrir', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Formulario />);
    expect(screen.queryByText('Falta completarlo.')).not.toBeInTheDocument();

    rerender(<Formulario mostrarErrores />);

    // Con pestañas **solo se ve el error de la sección activa**: los campos de las demás ni siquiera
    // están montados. Por eso el badge ámbar de la otra pestaña no es un adorno — es lo único que
    // delata que ahí también falta algo.
    expect(screen.getAllByText('Falta completarlo.')).toHaveLength(1);
    expect(within(pestana(/Políticas/)).getByTitle('Falta 1 campo obligatorio')).toBeInTheDocument();

    await irA(user, /Políticas/);
    expect(screen.getAllByText('Falta completarlo.')).toHaveLength(1);
  });
});

describe('campos condicionales', () => {
  it('el condicional aparece solo al cumplirse su predicado', async () => {
    const user = userEvent.setup();
    render(<Formulario />);
    await irA(user, /Políticas/);

    expect(screen.queryByRole('textbox', { name: /Plazo/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Sí' }));
    expect(screen.getByRole('textbox', { name: /Plazo/ })).toBeInTheDocument();
  });

  it('visible y vacío, bloquea el guardado', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    await user.type(screen.getByRole('textbox', { name: /Nombre/ }), 'Acme');
    await irA(user, /Políticas/);
    await user.click(screen.getByRole('radio', { name: 'Sí' }));

    expect(guardar()).toBeDisabled(); // «Plazo» quedó visible y vacío

    await user.type(screen.getByRole('textbox', { name: /Plazo/ }), '30 días');
    expect(guardar()).toBeEnabled();
  });

  it('al ocultarse deja de bloquear, y su valor no llega al texto', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    await user.type(screen.getByRole('textbox', { name: /Nombre/ }), 'Acme');
    await irA(user, /Políticas/);
    await user.click(screen.getByRole('radio', { name: 'Sí' }));
    await user.type(screen.getByRole('textbox', { name: /Plazo/ }), '30 días');
    expect(screen.getByTestId('serializado')).toHaveTextContent('30 días');

    await user.click(screen.getByRole('radio', { name: 'No' }));

    expect(guardar()).toBeEnabled();
    expect(screen.getByTestId('serializado')).not.toHaveTextContent('30 días');
  });

  it('el indicador de la pestaña no cuenta los campos ocultos', async () => {
    const user = userEvent.setup();
    render(<Formulario />);
    await irA(user, /Políticas/);

    // Mientras la respuesta no sea «Sí», «Plazo» no existe y el único exigible visible es el
    // tri-estado: falta 1, no 2.
    expect(within(pestana(/Políticas/)).getByTitle('Falta 1 campo obligatorio')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Sí' }));

    // Ahora «Plazo» es visible y exigible: el tri-estado ya está resuelto, así que sigue faltando 1.
    expect(within(pestana(/Políticas/)).getByTitle('Falta 1 campo obligatorio')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /Plazo/ }), '30 días');

    expect(within(pestana(/Políticas/)).getByText('Sección completa')).toBeInTheDocument();
  });
});

/**
 * Evolución de schema. Son DOS casos distintos y solo uno acaba en «Otros datos»; conviene que los
 * tests lo dejen claro, porque de esto depende que cambiar un schema no destruya conocimiento.
 */
describe('fallback defensivo ante un schema que cambió', () => {
  it('id que el schema YA NO declara: el valor sobrevive bajo «Otros datos»', () => {
    render(
      <Formulario
        inicial={estructura({
          nombre: { tipo: 'texto', valor: 'Acme' },
          convenios: { tipo: 'texto', valor: 'Convenio con Acme S.A.' },
        })}
      />,
    );

    // El campo desapareció del formulario…
    expect(screen.queryByRole('textbox', { name: /Convenios/ })).not.toBeInTheDocument();
    // …pero su contenido sigue llegando a la IA.
    const texto = screen.getByTestId('serializado');
    expect(texto).toHaveTextContent('Otros datos');
    expect(texto).toHaveTextContent('Convenio con Acme S.A.');
  });

  it('id que sigue declarado pero cambió de `kind`: no revienta y el valor tampoco se pierde', () => {
    const schemaNuevo: KbSchemaDef = {
      ...SCHEMA,
      version: 3,
      secciones: [
        {
          id: 'identidad',
          titulo: 'Identidad',
          // `nombre` pasó de texto a lista entre versiones del schema.
          campos: [{ id: 'nombre', etiqueta: 'Nombre', kind: 'lista', requisito: 'opcional' }],
        },
      ],
    };

    render(
      <Formulario
        schema={schemaNuevo}
        inicial={estructura({ nombre: { tipo: 'texto', valor: 'Acme' } })}
      />,
    );

    // El control nace vacío en vez de romper el modal…
    expect(screen.getByText(/Todavía no agregaste nada en nombre/)).toBeInTheDocument();
    // …y el valor guardado sigue serializándose con su propia forma, bajo su etiqueta.
    expect(screen.getByTestId('serializado')).toHaveTextContent('Nombre: Acme');
  });

  it('un valor de tipo inesperado no impide seguir editando el resto', async () => {
    const user = userEvent.setup();
    render(
      <Formulario
        inicial={estructura({
          // `nombre` debería ser texto; llega una lista de una versión anterior.
          nombre: { tipo: 'lista', valores: ['Acme'] },
        })}
      />,
    );

    const nombre = screen.getByRole('textbox', { name: /Nombre/ });
    expect(nombre).toHaveValue('');

    await user.type(nombre, 'Acme S.A.');
    expect(nombre).toHaveValue('Acme S.A.');
  });
});
