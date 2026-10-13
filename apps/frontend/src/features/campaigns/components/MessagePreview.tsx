import { ImageIcon } from 'lucide-react';
import { substituteEjemplos } from '@/features/whatsapp-templates/lib/substitute-ejemplos';

interface Props {
  cuerpo: string | null;
  parametros: string[];
  /** URL de la imagen (de objeto o del API). `null` sin imagen elegida. */
  imagenUrl: string | null;
  /** La plantilla lleva imagen: si aún no hay, se reserva el hueco para que se vea dónde irá. */
  conImagen: boolean;
  /** Hora de salida, para la marca de la burbuja. Sin ella no se inventa una. */
  hora?: Date | null;
  /** Pie de la plantilla (HT-WA-04): WhatsApp lo muestra en gris, debajo del texto. */
  pie?: string | null;
  /** Qué decir mientras aún no hay texto. Cambia según dónde se use la vista previa. */
  textoVacio?: string;
}

/**
 * Lo que va a recibir el contacto, con la forma de un mensaje de WhatsApp: la imagen arriba,
 * pegada al borde de la burbuja, y el texto debajo con los huecos ya rellenos.
 *
 * Es la pieza a la que se mira mientras se rellena el formulario de al lado, así que refleja cada
 * cambio al instante. El hueco de la imagen se reserva con la misma proporción que tendrá, para que
 * al elegirla no salte todo lo de debajo.
 */
export function MessagePreview({
  cuerpo,
  parametros,
  imagenUrl,
  conImagen,
  hora = null,
  pie = null,
  textoVacio = 'Elige una plantilla para ver el mensaje',
}: Props): React.ReactElement {
  const texto = cuerpo ? substituteEjemplos(cuerpo, parametros) : null;

  return (
    <div className="rounded-xl bg-muted/50 p-3">
      <div className="max-w-[20rem] overflow-hidden rounded-2xl rounded-tl-sm border border-border bg-card shadow-sm">
        {conImagen ? (
          imagenUrl ? (
            <img
              key={imagenUrl}
              src={imagenUrl}
              alt=""
              className="aspect-[1.91/1] w-full bg-muted object-cover motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
            />
          ) : (
            <div className="flex aspect-[1.91/1] w-full items-center justify-center bg-muted text-muted-foreground">
              <ImageIcon className="h-6 w-6" aria-hidden />
              <span className="sr-only">Aquí irá la imagen</span>
            </div>
          )
        ) : null}

        <div className="px-3 pb-1.5 pt-2 text-sm text-foreground">
          {texto ? (
            <p className="whitespace-pre-wrap">{texto}</p>
          ) : (
            <p className="italic text-muted-foreground">{textoVacio}</p>
          )}
          {pie ? <p className="mt-1 text-xs text-muted-foreground">{pie}</p> : null}
          {hora ? (
            <p className="mt-1 text-right text-[11px] tabular-nums text-muted-foreground" aria-hidden>
              {hora.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
