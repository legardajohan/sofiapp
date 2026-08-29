import { substituteEjemplos } from '../lib/substitute-ejemplos.js';

interface Props {
  cuerpo: string | null;
  ejemplos?: string[];
}

/**
 * Burbuja tipo WhatsApp: es la única forma de que el admin entienda qué va a recibir el
 * cliente, así que se parece a un mensaje real, no a un formulario.
 */
export function TemplatePreview({ cuerpo, ejemplos = [] }: Props): React.ReactElement {
  const texto = cuerpo ? substituteEjemplos(cuerpo, ejemplos) : null;

  return (
    <div className="rounded-lg bg-muted/40 p-4">
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm border border-border bg-card px-3.5 py-2.5 text-sm text-foreground shadow-sm">
        {texto ? (
          <p className="whitespace-pre-wrap">{texto}</p>
        ) : (
          <p className="text-muted-foreground italic">Sin contenido todavía</p>
        )}
      </div>
    </div>
  );
}
