import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConditionEditor } from './ConditionEditor.js';
import type { IRamaCondicion } from '../types.js';

/** El input de "valor" es controlado: sin un dueño de estado real, cada tecla se dispara sobre el
 *  mismo `value` de props (nunca actualizado) y `userEvent.type` termina viendo solo el último
 *  carácter. Este wrapper posee el estado de verdad, como lo haría `NodeInspector`. */
function ControlledEditor({
  onChange,
  inicial = [{ operador: 'igual_a', valor: '', nodoDestino: 'n2' }],
}: {
  onChange: (r: IRamaCondicion[], d: string) => void;
  inicial?: IRamaCondicion[];
}) {
  const [ramas, setRamas] = useState<IRamaCondicion[]>(inicial);
  const [porDefecto, setPorDefecto] = useState('n3');
  return (
    <ConditionEditor
      ramas={ramas}
      ramaPorDefecto={porDefecto}
      opcionesDestino={OPCIONES}
      onChange={(r, d) => {
        setRamas(r);
        setPorDefecto(d);
        onChange(r, d);
      }}
    />
  );
}

const OPCIONES = [
  { id: 'n2', label: 'Mensaje — Gracias' },
  { id: 'n3', label: 'Mensaje — Adiós' },
];

describe('ConditionEditor — ramas de un nodo condición', () => {
  it('agregar una rama la añade al final, vacía', async () => {
    const onChange = vi.fn();
    render(<ConditionEditor ramas={[]} ramaPorDefecto="" opcionesDestino={OPCIONES} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: 'Agregar rama' }));

    expect(onChange).toHaveBeenCalledWith([{ operador: 'igual_a', valor: '', nodoDestino: '' }], '');
  });

  it('editar el valor de una rama existente conserva el resto de sus campos', async () => {
    const onChange = vi.fn();
    render(<ControlledEditor onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('Valor a comparar'), 'si');

    expect(screen.getByLabelText('Valor a comparar')).toHaveValue('si');
    const ultimaLlamada = onChange.mock.calls.at(-1) as [IRamaCondicion[], string];
    expect(ultimaLlamada[0]).toEqual([{ operador: 'igual_a', valor: 'si', nodoDestino: 'n2' }]);
    expect(ultimaLlamada[1]).toBe('n3');
  });

  it('eliminar una rama la quita del array sin tocar la rama por defecto', async () => {
    const onChange = vi.fn();
    const ramas: IRamaCondicion[] = [
      { operador: 'igual_a', valor: 'si', nodoDestino: 'n2' },
      { operador: 'contiene', valor: 'precio', nodoDestino: 'n3' },
    ];
    render(<ConditionEditor ramas={ramas} ramaPorDefecto="n3" opcionesDestino={OPCIONES} onChange={onChange} />);

    await userEvent.click(screen.getAllByRole('button', { name: 'Eliminar rama' })[0]!);

    expect(onChange).toHaveBeenCalledWith([{ operador: 'contiene', valor: 'precio', nodoDestino: 'n3' }], 'n3');
  });

  it('la rama por defecto siempre está presente, incluso sin ninguna rama', () => {
    render(<ConditionEditor ramas={[]} ramaPorDefecto="" opcionesDestino={OPCIONES} onChange={vi.fn()} />);
    expect(screen.getByText('Si ninguna rama coincide, ir a')).toBeInTheDocument();
    expect(screen.getByLabelText('Rama por defecto')).toBeInTheDocument();
  });

  it('un valor corto no muestra el afordance "Ver más"', () => {
    const ramas: IRamaCondicion[] = [{ operador: 'igual_a', valor: 'si', nodoDestino: 'n2' }];
    render(<ConditionEditor ramas={ramas} ramaPorDefecto="n3" opcionesDestino={OPCIONES} onChange={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Ver más' })).not.toBeInTheDocument();
  });

  it('un valor largo expande a un textarea con "Ver más" y colapsa con "Ver menos"', async () => {
    const largo = 'una respuesta bastante larga que ya no cabe cómoda en una sola línea';
    const ramas: IRamaCondicion[] = [{ operador: 'contiene', valor: largo, nodoDestino: 'n2' }];
    render(<ConditionEditor ramas={ramas} ramaPorDefecto="n3" opcionesDestino={OPCIONES} onChange={vi.fn()} />);

    expect(screen.getByLabelText('Valor a comparar')).not.toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Ver más' }));

    expect(screen.getByLabelText('Valor a comparar')).toBeDisabled();
    expect(screen.getByLabelText('Valor a comparar (completo)')).toHaveValue(largo);

    await userEvent.click(screen.getByRole('button', { name: 'Ver menos' }));
    expect(screen.getByLabelText('Valor a comparar')).not.toBeDisabled();
  });
});
