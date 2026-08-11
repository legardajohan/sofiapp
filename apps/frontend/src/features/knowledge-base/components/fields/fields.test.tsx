import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Input } from '@/components/ui/input';
import type { KbScheduleDay, KbTriEstado } from '../../types/index.js';
import { ConditionalReveal } from './ConditionalReveal.js';
import { KnowledgeField } from './KnowledgeField.js';
import { PolicyTriState } from './PolicyTriState.js';
import { RepeatableList } from './RepeatableList.js';
import { ScheduleWeekEditor } from './ScheduleWeekEditor.js';

/**
 * Tests de los primitivos del formulario guiado (HU-KB-07, con el editor semanal de HU-KB-12).
 */

describe('KnowledgeField', () => {
  it('muestra la etiqueta y el marcador de exigencia en palabras', () => {
    render(
      <KnowledgeField htmlFor="x" etiqueta="Nombre" requisito="obligatorio">
        <Input id="x" />
      </KnowledgeField>,
    );

    expect(screen.getByText(/Nombre/)).toBeInTheDocument();
    expect(screen.getByText(/Obligatorio/)).toBeInTheDocument();
  });

  it('traduce `condicional` a algo que significa algo fuera del código', () => {
    render(
      <KnowledgeField htmlFor="x" etiqueta="Plazo" requisito="condicional">
        <Input id="x" />
      </KnowledgeField>,
    );

    expect(screen.getByText(/Obligatorio si aplica/)).toBeInTheDocument();
  });

  it('la etiqueta enfoca su control al hacer clic', async () => {
    const user = userEvent.setup();
    render(
      <KnowledgeField htmlFor="kb-nombre" etiqueta="Nombre" requisito="opcional">
        <Input id="kb-nombre" />
      </KnowledgeField>,
    );

    await user.click(screen.getByText(/Nombre/));
    expect(screen.getByRole('textbox')).toHaveFocus();
  });

  it('el contador solo aparece cuando el campo tiene texto que contar', () => {
    const { rerender } = render(
      <KnowledgeField htmlFor="x" etiqueta="Horarios" requisito="opcional">
        <Input id="x" />
      </KnowledgeField>,
    );
    expect(screen.queryByText(/\//)).not.toBeInTheDocument();

    rerender(
      <KnowledgeField htmlFor="x" etiqueta="Nombre" requisito="opcional" length={4} maxLength={120}>
        <Input id="x" />
      </KnowledgeField>,
    );
    expect(screen.getByText('4 / 120')).toBeInTheDocument();
  });

  it('el contador avisa al 90 % y bloquea en el tope', () => {
    const { rerender } = render(
      <KnowledgeField htmlFor="x" etiqueta="N" requisito="opcional" length={50} maxLength={100}>
        <Input id="x" />
      </KnowledgeField>,
    );
    expect(screen.getByText('50 / 100')).toHaveClass('text-muted-foreground');

    rerender(
      <KnowledgeField htmlFor="x" etiqueta="N" requisito="opcional" length={90} maxLength={100}>
        <Input id="x" />
      </KnowledgeField>,
    );
    expect(screen.getByText('90 / 100').className).toContain('amber');

    rerender(
      <KnowledgeField htmlFor="x" etiqueta="N" requisito="opcional" length={100} maxLength={100}>
        <Input id="x" />
      </KnowledgeField>,
    );
    expect(screen.getByText('100 / 100').className).toContain('text-destructive');
  });

  it('el error se muestra y tiñe el marcador de exigencia', () => {
    render(
      <KnowledgeField htmlFor="x" etiqueta="Nombre" requisito="obligatorio" error="Falta completarlo">
        <Input id="x" />
      </KnowledgeField>,
    );

    expect(screen.getByText('Falta completarlo')).toBeInTheDocument();
    expect(screen.getByText(/Obligatorio/)).toHaveClass('text-destructive');
  });
});

describe('RepeatableList', () => {
  function ListaDePrueba({ inicial = [], maxItems = 3 }: { inicial?: string[]; maxItems?: number }) {
    const [items, setItems] = useState<string[]>(inicial);
    return (
      <RepeatableList
        items={items}
        onChange={setItems}
        crearItem={() => ''}
        maxItems={maxItems}
        etiquetaAgregar="Añadir zona"
        vacio="Todavía no agregaste zonas. Añade la primera."
        nombreItem="zona"
        renderItem={(item, index, onItemChange) => (
          <Input
            aria-label={`Zona ${index + 1}`}
            value={item}
            onChange={(e) => onItemChange(e.target.value)}
          />
        )}
      />
    );
  }

  it('sin ítems invita a agregar el primero, en vez de mostrar una lista vacía', () => {
    render(<ListaDePrueba />);
    expect(screen.getByText('Todavía no agregaste zonas. Añade la primera.')).toBeInTheDocument();
  });

  it('añade un ítem y el aviso de vacío desaparece', async () => {
    const user = userEvent.setup();
    render(<ListaDePrueba />);

    await user.click(screen.getByRole('button', { name: 'Añadir zona' }));

    expect(screen.getByRole('textbox', { name: 'Zona 1' })).toBeInTheDocument();
    expect(screen.queryByText(/Todavía no agregaste/)).not.toBeInTheDocument();
  });

  it('edita un ítem sin tocar a los demás', async () => {
    const user = userEvent.setup();
    render(<ListaDePrueba inicial={['Norte', 'Sur']} />);

    await user.type(screen.getByRole('textbox', { name: 'Zona 1' }), '!');

    expect(screen.getByRole('textbox', { name: 'Zona 1' })).toHaveValue('Norte!');
    expect(screen.getByRole('textbox', { name: 'Zona 2' })).toHaveValue('Sur');
  });

  it('quita el ítem correcto y los restantes se renumeran', async () => {
    const user = userEvent.setup();
    render(<ListaDePrueba inicial={['Norte', 'Sur', 'Centro']} />);

    await user.click(screen.getByRole('button', { name: 'Quitar zona 2' }));

    expect(screen.getAllByRole('textbox')).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: 'Zona 1' })).toHaveValue('Norte');
    expect(screen.getByRole('textbox', { name: 'Zona 2' })).toHaveValue('Centro');
  });

  it('en el tope deshabilita el botón y dice por qué', async () => {
    const user = userEvent.setup();
    render(<ListaDePrueba inicial={['a', 'b']} maxItems={3} />);

    const agregar = screen.getByRole('button', { name: 'Añadir zona' });
    expect(agregar).toBeEnabled();

    await user.click(agregar);

    expect(agregar).toBeDisabled();
    expect(screen.getByText('Llegaste al máximo de 3.')).toBeInTheDocument();
  });
});

describe('ConditionalReveal', () => {
  it('oculto desmonta de verdad: no queda en el árbol de accesibilidad', () => {
    render(
      <ConditionalReveal visible={false}>
        <Input aria-label="Plazo" />
      </ConditionalReveal>,
    );

    expect(screen.queryByRole('textbox', { name: 'Plazo' })).not.toBeInTheDocument();
  });

  it('visible monta su contenido', () => {
    render(
      <ConditionalReveal visible>
        <Input aria-label="Plazo" />
      </ConditionalReveal>,
    );

    expect(screen.getByRole('textbox', { name: 'Plazo' })).toBeInTheDocument();
  });

  it('anima solo bajo motion-safe', () => {
    const { container } = render(
      <ConditionalReveal visible>
        <span>x</span>
      </ConditionalReveal>,
    );

    expect(container.firstElementChild?.className).toContain('motion-safe:');
  });
});

describe('PolicyTriState', () => {
  function TriStateDePrueba({
    inicial = 'na',
    conDetalle = false,
  }: {
    inicial?: KbTriEstado;
    conDetalle?: boolean;
  }) {
    const [valor, setValor] = useState<KbTriEstado>(inicial);
    const [detalle, setDetalle] = useState('');
    return (
      <PolicyTriState
        id="devoluciones"
        valor={valor}
        onValorChange={setValor}
        {...(conDetalle
          ? { detalle, onDetalleChange: setDetalle, etiquetaDetalle: '¿Con qué condiciones?' }
          : {})}
      />
    );
  }

  it('ofrece las tres respuestas, incluida «No aplica»', () => {
    render(<TriStateDePrueba />);

    expect(screen.getByRole('radio', { name: 'Sí' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'No' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'No aplica' })).toBeInTheDocument();
  });

  it('es excluyente: elegir una deselecciona la anterior', async () => {
    const user = userEvent.setup();
    render(<TriStateDePrueba inicial="na" />);

    expect(screen.getByRole('radio', { name: 'No aplica' })).toBeChecked();

    await user.click(screen.getByRole('radio', { name: 'Sí' }));

    expect(screen.getByRole('radio', { name: 'Sí' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'No aplica' })).not.toBeChecked();
  });

  it('informa el valor elegido al llamador', async () => {
    const user = userEvent.setup();
    const onValorChange = vi.fn();
    render(<PolicyTriState id="p" valor="na" onValorChange={onValorChange} />);

    await user.click(screen.getByRole('radio', { name: 'No' }));

    expect(onValorChange).toHaveBeenCalledWith('no');
  });

  it('sin `onDetalleChange` va solo, sin caja de detalle', async () => {
    const user = userEvent.setup();
    render(<TriStateDePrueba />);

    await user.click(screen.getByRole('radio', { name: 'Sí' }));

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('el detalle aparece solo al responder «Sí» y se retira al cambiar de opinión', async () => {
    const user = userEvent.setup();
    render(<TriStateDePrueba conDetalle />);

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Sí' }));
    expect(screen.getByRole('textbox', { name: '¿Con qué condiciones?' })).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'No' }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});

describe('ScheduleWeekEditor', () => {
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

  /** La semana completa, como la normaliza `leerHorario` antes de montar el editor. */
  function semana(overrides: Record<string, Partial<KbScheduleDay>> = {}): KbScheduleDay[] {
    return DIAS.map((dia) => ({ dia, cerrado: false, intervalos: [], ...overrides[dia] }));
  }

  function SemanaDePrueba({ inicial }: { inicial: KbScheduleDay[] }) {
    const [dias, setDias] = useState(inicial);
    return <ScheduleWeekEditor dias={dias} onChange={setDias} />;
  }

  const anadirAl = (dia: string) => screen.getByRole('button', { name: `Añadir horario al ${dia}` });
  /** Cada fila es un `group` rotulado con su día: es lo que separa siete switches «Cerrado». */
  const cerradoDe = (dia: string) =>
    within(screen.getByRole('group', { name: dia })).getByRole('switch');

  it('pinta los siete días: nadie debería tener que «crear» el martes', () => {
    render(<SemanaDePrueba inicial={semana()} />);

    for (const dia of DIAS) expect(screen.getByText(dia)).toBeInTheDocument();
    expect(screen.getAllByRole('switch')).toHaveLength(7);
  });

  it('añade un tramo con una jornada por defecto, no vacía', async () => {
    const user = userEvent.setup();
    render(<SemanaDePrueba inicial={semana()} />);

    await user.click(anadirAl('lunes'));

    expect(screen.getByLabelText('Abre el lunes, horario 1')).toHaveValue('08:00');
    expect(screen.getByLabelText('Cierra el lunes, horario 1')).toHaveValue('18:00');
  });

  it('admite horario partido: varios tramos en el mismo día', async () => {
    const user = userEvent.setup();
    render(
      <SemanaDePrueba
        inicial={semana({
          lunes: {
            intervalos: [
              { desde: '08:00', hasta: '12:00' },
              { desde: '14:00', hasta: '18:00' },
            ],
          },
        })}
      />,
    );

    expect(screen.getByLabelText('Abre el lunes, horario 2')).toHaveValue('14:00');
    await user.click(screen.getByRole('button', { name: 'Quitar horario 1 del lunes' }));
    expect(screen.getByLabelText('Abre el lunes, horario 1')).toHaveValue('14:00');
  });

  it('marcar «Cerrado» esconde los tramos pero no los borra', async () => {
    const user = userEvent.setup();
    render(
      <SemanaDePrueba
        inicial={semana({ lunes: { intervalos: [{ desde: '09:00', hasta: '17:00' }] } })}
      />,
    );

    const cerrado = cerradoDe('lunes');
    await user.click(cerrado);
    expect(screen.queryByLabelText('Abre el lunes, horario 1')).not.toBeInTheDocument();

    // Reabrir el día no debería costar volver a escribir el horario.
    await user.click(cerrado);
    expect(screen.getByLabelText('Abre el lunes, horario 1')).toHaveValue('09:00');
  });

  it('cada día rotula sus controles con su propio nombre', () => {
    // Con los siete días en el mismo árbol, este test deja de ser una formalidad: es lo que impide
    // que dos días compartan `aria-label` y que un test toque el campo del día equivocado.
    render(
      <SemanaDePrueba
        inicial={semana({
          lunes: { intervalos: [{ desde: '08:00', hasta: '12:00' }] },
          domingo: { intervalos: [{ desde: '10:00', hasta: '14:00' }] },
        })}
      />,
    );

    expect(screen.getByLabelText('Abre el lunes, horario 1')).toHaveValue('08:00');
    expect(screen.getByLabelText('Abre el domingo, horario 1')).toHaveValue('10:00');
  });

  it('la descripción viaja con el intervalo, no con el día', async () => {
    const user = userEvent.setup();
    render(
      <SemanaDePrueba
        inicial={semana({
          lunes: {
            intervalos: [
              { desde: '08:00', hasta: '12:00' },
              { desde: '14:00', hasta: '18:00' },
            ],
          },
        })}
      />,
    );

    await user.type(
      screen.getByLabelText('Descripción del horario 2 del lunes'),
      'Solo recepción de pedidos',
    );

    expect(screen.getByLabelText('Descripción del horario 2 del lunes')).toHaveValue(
      'Solo recepción de pedidos',
    );
    // El primer tramo sigue sin descripción: no es un dato del día.
    expect(screen.getByLabelText('Descripción del horario 1 del lunes')).toHaveValue('');
  });

  it('un tramo que cierra antes de abrir se marca como error', async () => {
    const user = userEvent.setup();
    render(
      <SemanaDePrueba
        inicial={semana({ lunes: { intervalos: [{ desde: '18:00', hasta: '09:00' }] } })}
      />,
    );

    expect(
      screen.getByText('La hora de cierre debe ser posterior a la de apertura.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Abre el lunes, horario 1')).toHaveAttribute('aria-invalid', 'true');

    await user.clear(screen.getByLabelText('Cierra el lunes, horario 1'));
    await user.type(screen.getByLabelText('Cierra el lunes, horario 1'), '20:00');

    expect(
      screen.queryByText('La hora de cierre debe ser posterior a la de apertura.'),
    ).not.toBeInTheDocument();
  });

  it('un tramo a medio llenar avisa, pero NO como error', () => {
    render(<SemanaDePrueba inicial={semana({ lunes: { intervalos: [{ desde: '08:00', hasta: '' }] } })} />);

    expect(screen.getByText('Completa las dos horas.')).toBeInTheDocument();
    // Sin `aria-invalid`: es una tarea pendiente, no un error. Y no bloquea el guardado.
    expect(screen.getByLabelText('Abre el lunes, horario 1')).toHaveAttribute(
      'aria-invalid',
      'false',
    );
  });

  it('copia el horario de un día a varios, sin pisar los cerrados', async () => {
    const user = userEvent.setup();
    render(
      <SemanaDePrueba
        inicial={semana({
          lunes: { intervalos: [{ desde: '08:00', hasta: '12:00', descripcion: 'Presencial' }] },
          domingo: { cerrado: true },
        })}
      />,
    );

    await user.click(screen.getAllByRole('button', { name: /Copiar a…/ })[0] as HTMLElement);

    // Un día cerrado se ofrece deshabilitado: enterarse DESPUÉS de que se ignoró sería peor.
    expect(screen.getByRole('menuitemcheckbox', { name: /domingo/ })).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await user.click(screen.getByRole('menuitemcheckbox', { name: /martes/ }));
    await user.click(screen.getByRole('menuitemcheckbox', { name: /miércoles/ }));
    await user.click(screen.getByRole('button', { name: 'Copiar (2)' }));

    // La descripción viaja con la copia: era el motivo de copiar.
    expect(screen.getByLabelText('Abre el martes, horario 1')).toHaveValue('08:00');
    expect(screen.getByLabelText('Descripción del horario 1 del martes')).toHaveValue('Presencial');
    expect(screen.getByLabelText('Abre el miércoles, horario 1')).toHaveValue('08:00');
    // El jueves no se eligió y sigue vacío.
    expect(screen.queryByLabelText('Abre el jueves, horario 1')).not.toBeInTheDocument();
  });
});
