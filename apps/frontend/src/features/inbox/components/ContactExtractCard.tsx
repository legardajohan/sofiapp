import { Check, IdCard, Loader2, RefreshCw, ScanLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { shortTime } from '../lib/format.js';
import { CAMPOS_EXTRAIDOS } from '../types.js';
import type { CampoExtraido, DatosExtraidosDTO, TelefonoOrigen } from '../types.js';

interface Props {
  datos: DatosExtraidosDTO | null;
  pending: boolean;
  confirmando: CampoExtraido[] | null;
  error: string | null;
  onExtract: () => void;
  onConfirmar: (campos: CampoExtraido[]) => void;
}

// Press feedback (Emil): mismo gesto que ContactSummaryCard, para que ambas acciones se sientan igual.
const pressable =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

const ORIGEN_LABEL: Record<TelefonoOrigen, string> = {
  conversacion: 'indicado en el chat',
  whatsapp: 'número de WhatsApp',
};

const ETIQUETA: Record<CampoExtraido, string> = {
  nombreCompleto: 'Nombre completo',
  correo: 'Correo',
  telefono: 'Teléfono',
  interes: 'Interés',
};

/** Cómo se nombra el campo dentro de un `aria-label`: «Confirmar el nombre completo». */
const ARIA: Record<CampoExtraido, string> = {
  nombreCompleto: 'el nombre completo',
  correo: 'el correo',
  telefono: 'el teléfono',
  interes: 'el interés',
};

function valorDe(datos: DatosExtraidosDTO, campo: CampoExtraido): string | null {
  if (campo === 'nombreCompleto') return datos.nombreCompleto;
  if (campo === 'correo') return datos.correo;
  if (campo === 'interes') return datos.interes;
  return datos.telefono;
}

/**
 * Un campo es confirmable si tiene valor, todavía no se aplicó a la ficha y aporta algo.
 *
 * El teléfono de origen `whatsapp` queda fuera: es el mismo número desde el que escribe el cliente,
 * así que ya está en la ficha y confirmarlo no añadiría nada. El backend lo rechaza con 400; aquí
 * ni se ofrece.
 */
function esConfirmable(datos: DatosExtraidosDTO, campo: CampoExtraido): boolean {
  if (valorDe(datos, campo) === null) return false;
  if (datos.confirmados.includes(campo)) return false;
  return !(campo === 'telefono' && datos.telefonoOrigen === 'whatsapp');
}

function Campo({
  campo,
  datos,
  confirmando,
  onConfirmar,
}: {
  campo: CampoExtraido;
  datos: DatosExtraidosDTO;
  confirmando: boolean;
  onConfirmar: (campos: CampoExtraido[]) => void;
}): React.ReactElement {
  const value = valorDe(datos, campo);
  const confirmado = datos.confirmados.includes(campo);
  const hint = campo === 'telefono' && value ? ORIGEN_LABEL[datos.telefonoOrigen] : undefined;

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <dt className="text-[11px] text-muted-foreground">{ETIQUETA[campo]}</dt>
        <dd
          className={cn(
            'min-w-0 text-xs',
            // Un campo sin dato se marca como ausencia explícita, no como si estuviera vacío por error.
            value ? 'font-medium text-foreground' : 'italic text-muted-foreground',
          )}
        >
          <span className="block break-words">{value ?? 'No aparece en la conversación'}</span>
          {hint && (
            <span className="block text-[10px] font-normal text-muted-foreground">{hint}</span>
          )}
        </dd>
      </div>

      {/* La ranura se reserva siempre, con o sin acción: así confirmar un campo no desplaza los de
          abajo y nada salta bajo el cursor. */}
      <div className="flex h-6 w-[5.5rem] shrink-0 items-center justify-end">
        {confirmado ? (
          <span className="flex items-center gap-1 text-[11px] font-medium text-success">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">Confirmado: </span>
            En la ficha
          </span>
        ) : esConfirmable(datos, campo) ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={confirmando}
            onClick={() => onConfirmar([campo])}
            aria-label={`Confirmar ${ARIA[campo]}`}
            className={cn('h-6 px-2 text-[11px]', pressable)}
          >
            {confirmando ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Confirmar'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function ContactExtractCard({
  datos,
  pending,
  confirmando,
  error,
  onExtract,
  onConfirmar,
}: Props): React.ReactElement {
  const porConfirmar = datos ? CAMPOS_EXTRAIDOS.filter((c) => esConfirmable(datos, c)) : [];

  return (
    <section className="space-y-2.5 rounded-lg border border-border bg-card px-3.5 py-3">
      <div className="flex items-center gap-2">
        <IdCard className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Datos de contacto (IA)</h3>
        {/* Una insignia en la cabecera en vez de una por campo: cuatro marcas de «sugerido» en una
            columna estrecha repiten lo que el título ya dice. Este contador es lo que se escanea. */}
        {porConfirmar.length > 0 && (
          <Badge variant="secondary" className="ml-auto px-1.5 py-0 text-[10px] font-medium">
            {porConfirmar.length} sin confirmar
          </Badge>
        )}
      </div>

      {pending ? (
        <div className="space-y-1.5" aria-live="polite" aria-busy="true">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-[85%]" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      ) : datos ? (
        <>
          <dl className="space-y-2">
            {CAMPOS_EXTRAIDOS.map((campo) => (
              <Campo
                key={campo}
                campo={campo}
                datos={datos}
                confirmando={confirmando?.includes(campo) ?? false}
                onConfirmar={onConfirmar}
              />
            ))}
          </dl>
          <p className="text-[11px] text-muted-foreground">Extraído {shortTime(datos.extraidoAt)}</p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          Extrae el nombre, el correo, el teléfono y lo que le interesa al cliente de lo que haya
          dicho en la conversación.
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        {/* Con un solo campo por confirmar, este botón duplicaría el que está tres líneas más
            arriba: solo aparece cuando de verdad ahorra clics. */}
        {porConfirmar.length > 1 && (
          <Button
            size="sm"
            disabled={pending || confirmando !== null}
            onClick={() => onConfirmar([...porConfirmar])}
            className={cn('flex-1', pressable)}
          >
            {confirmando !== null && confirmando.length > 1 ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            Confirmar todo
          </Button>
        )}

        <Button
          variant={datos ? 'outline' : 'default'}
          size="sm"
          disabled={pending || confirmando !== null}
          onClick={onExtract}
          className={cn('flex-1', pressable)}
        >
          {datos ? (
            <>
              <RefreshCw className={cn('h-4 w-4', pending && 'animate-spin')} />
              Volver a extraer
            </>
          ) : (
            <>
              <ScanLine className="h-4 w-4" />
              Extraer datos
            </>
          )}
        </Button>
      </div>
    </section>
  );
}
