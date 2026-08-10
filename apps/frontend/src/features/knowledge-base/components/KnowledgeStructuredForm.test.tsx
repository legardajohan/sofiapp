import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

const guardar = () => screen.getByRole('button', { name: 'Guardar e indexar' });

describe('el acordeón refleja el schema', () => {
  it('renderiza una sección por cada una declarada, con su descripción', () => {
    render(<Formulario />);

    expect(screen.getByRole('button', { name: /Identidad/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Políticas/ })).toBeInTheDocument();
    expect(screen.getByText('Quiénes son')).toBeInTheDocument();
  });

  it('renderiza los campos de cada sección con su marcador de exigencia', () => {
    render(<Formulario />);

    expect(screen.getByRole('textbox', { name: /Nombre/ })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /Lema/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'No aplica' })).toBeInTheDocument();
    expect(screen.getByText(/Opcional/)).toBeInTheDocument();
  });

  it('un schema SIN secciones no pinta acordeón, pero sí «Información adicional»', () => {
    render(<Formulario schema={KB_SCHEMAS.generico} inicial={estructura()} />);

    expect(screen.queryByRole('button', { name: /Identidad/ })).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Información adicional' })).toBeInTheDocument();
  });

  it('el resumen de la sección cuenta los campos visibles llenos', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    expect(screen.getByRole('button', { name: /Identidad/ })).toHaveTextContent('0 de 2');

    await user.type(screen.getByRole('textbox', { name: /Nombre/ }), 'Acme');

    expect(screen.getByRole('button', { name: /Identidad/ })).toHaveTextContent('1 de 2');
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

  it('queda FUERA del acordeón: no se puede plegar hasta esconderla', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    // Pliega las dos secciones; la vía de texto libre debe seguir a la vista.
    await user.click(screen.getByRole('button', { name: /Identidad/ }));
    await user.click(screen.getByRole('button', { name: /Políticas/ }));

    expect(screen.queryByRole('textbox', { name: /Nombre/ })).not.toBeInTheDocument();
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

  it('se habilita en cuanto se resuelven todos los obligatorios', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    await user.type(screen.getByRole('textbox', { name: /Nombre/ }), 'Acme');
    expect(guardar()).toBeDisabled(); // falta el tri-estado

    await user.click(screen.getByRole('radio', { name: 'No' }));
    expect(guardar()).toBeEnabled();
  });

  it('un opcional vacío nunca bloquea', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    await user.type(screen.getByRole('textbox', { name: /Nombre/ }), 'Acme');
    await user.click(screen.getByRole('radio', { name: 'No' }));

    expect(screen.getByRole('textbox', { name: /Lema/ })).toHaveValue('');
    expect(guardar()).toBeEnabled();
  });

  it('los errores rojos solo salen tras intentar guardar, no al abrir', () => {
    const { rerender } = render(<Formulario />);
    expect(screen.queryByText('Falta completarlo.')).not.toBeInTheDocument();

    rerender(<Formulario mostrarErrores />);
    expect(screen.getAllByText('Falta completarlo.').length).toBeGreaterThan(0);
  });
});

describe('campos condicionales', () => {
  it('el condicional aparece solo al cumplirse su predicado', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    expect(screen.queryByRole('textbox', { name: /Plazo/ })).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Sí' }));
    expect(screen.getByRole('textbox', { name: /Plazo/ })).toBeInTheDocument();
  });

  it('visible y vacío, bloquea el guardado', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    await user.type(screen.getByRole('textbox', { name: /Nombre/ }), 'Acme');
    await user.click(screen.getByRole('radio', { name: 'Sí' }));

    expect(guardar()).toBeDisabled(); // «Plazo» quedó visible y vacío

    await user.type(screen.getByRole('textbox', { name: /Plazo/ }), '30 días');
    expect(guardar()).toBeEnabled();
  });

  it('al ocultarse deja de bloquear, y su valor no llega al texto', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    await user.type(screen.getByRole('textbox', { name: /Nombre/ }), 'Acme');
    await user.click(screen.getByRole('radio', { name: 'Sí' }));
    await user.type(screen.getByRole('textbox', { name: /Plazo/ }), '30 días');
    expect(screen.getByTestId('serializado')).toHaveTextContent('30 días');

    await user.click(screen.getByRole('radio', { name: 'No' }));

    expect(guardar()).toBeEnabled();
    expect(screen.getByTestId('serializado')).not.toHaveTextContent('30 días');
  });

  it('el resumen de la sección no cuenta los campos ocultos', async () => {
    const user = userEvent.setup();
    render(<Formulario />);

    // Solo el tri-estado es visible mientras la respuesta no sea «Sí».
    expect(screen.getByRole('button', { name: /Políticas/ })).toHaveTextContent('0 de 1');

    await user.click(screen.getByRole('radio', { name: 'Sí' }));

    expect(screen.getByRole('button', { name: /Políticas/ })).toHaveTextContent('1 de 2');
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
