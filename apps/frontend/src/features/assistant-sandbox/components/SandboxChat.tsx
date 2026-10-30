import { useEffect, useMemo, useRef } from 'react';
import { FlaskConical, RotateCcw, Sparkles } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { MessageBubble } from '../../inbox/components/MessageBubble.js';
import {
  useAdvanceSandboxWait,
  useResetSandbox,
  useSandboxSession,
  useSelectSandboxFlow,
  useSendSandboxMessage,
} from '../hooks/useSandboxSession.js';
import { useSandboxRealtime } from '../hooks/useSandboxRealtime.js';
import type { EfectoRegistrado } from '../types.js';
import { useSandboxStore } from '../useSandboxStore.js';
import { SandboxComposer } from './SandboxComposer.js';
import { SandboxEffectCard } from './SandboxEffectCard.js';
import { SandboxFlowSelect } from './SandboxFlowSelect.js';
import type { MessageDTO } from '../../inbox/types.js';

/** Primeros mensajes que un cliente suele mandar: ahorran pensar qué escribir la primera vez. */
const SUGERENCIAS = ['Hola', '¿Qué precios manejan?', 'Quiero hablar con un asesor'] as const;

type ItemHilo =
  | { kind: 'mensaje'; key: string; ts: number; mensaje: MessageDTO }
  | { kind: 'efecto'; key: string; ts: number; registro: EfectoRegistrado };

function construirHilo(mensajes: MessageDTO[], efectos: EfectoRegistrado[]): ItemHilo[] {
  const items: ItemHilo[] = [
    ...mensajes.map((m) => ({ kind: 'mensaje' as const, key: m.id, ts: Date.parse(m.createdAt), mensaje: m })),
    ...efectos.map((r) => ({ kind: 'efecto' as const, key: r.key, ts: Date.parse(r.at), registro: r })),
  ];
  // Orden por hora; a igual hora, el mensaje antes que el efecto (el efecto es su consecuencia).
  return items.sort((a, b) => a.ts - b.ts || (a.kind === b.kind ? 0 : a.kind === 'mensaje' ? -1 : 1));
}

function Cargando(): React.ReactElement {
  return (
    <div className="flex-1 space-y-4 p-4" aria-busy="true">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
          <Skeleton className="h-12 w-52 rounded-2xl" />
        </div>
      ))}
    </div>
  );
}

function EstadoVacio({ onElegir, deshabilitado }: { onElegir: (t: string) => void; deshabilitado: boolean }): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-10 items-center justify-center rounded-xl bg-primary">
        <Sparkles className="size-5 text-primary-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">Escríbele a Sofi como lo haría un cliente</p>
        <p className="text-sm text-secondary-foreground">
          Responde con tu flujo, tu base de conocimiento y tus preguntas frecuentes, tal como están hoy.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {SUGERENCIAS.map((s) => (
          <Button
            key={s}
            type="button"
            variant="outline"
            size="sm"
            disabled={deshabilitado}
            onClick={() => onElegir(s)}
            className="transition-transform duration-150 ease-out active:scale-[0.97]"
          >
            {s}
          </Button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  className?: string;
}

/**
 * El chat de prueba (HU-IA-08): el admin conversa como si fuera un cliente y recibe lo que recibiría
 * por WhatsApp. Sirve igual en página completa y dentro de un `Sheet`.
 *
 * Las burbujas son las de la bandeja (`MessageBubble`, perspectiva de cliente); lo que el sistema hace
 * por su cuenta —lead, asignación, transferencia— aparece entre ellas como tarjetas de efecto.
 */
export function SandboxChat({ className }: Props): React.ReactElement {
  useSandboxRealtime();

  const { data: session, isPending, isError, refetch } = useSandboxSession();
  const send = useSendSandboxMessage();
  const selectFlow = useSelectSandboxFlow();
  const reset = useResetSandbox();
  const advance = useAdvanceSandboxWait();

  const efectos = useSandboxStore((s) => s.efectos);
  const esperando = useSandboxStore((s) => s.esperandoRespuesta);
  const setEsperando = useSandboxStore((s) => s.setEsperandoRespuesta);

  // Un «escribiendo…» heredado de una visita anterior (se cerró el panel con una respuesta en camino)
  // sería mentira al volver: el timeout vive en el hook de tiempo real, que no estaba montado.
  useEffect(() => setEsperando(false), [setEsperando]);

  const bottomRef = useRef<HTMLDivElement>(null);
  const hilo = useMemo(
    () => construirHilo(session?.mensajes ?? [], efectos),
    [session?.mensajes, efectos],
  );
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [hilo.length, esperando]);

  // Solo la última espera del hilo puede avanzarse, y solo mientras la sesión diga que sigue pendiente.
  const ultimaEspera = [...efectos].reverse().find((r) => r.efecto.tipo === 'espera')?.key ?? null;

  if (isPending) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
        <Cargando />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className={cn('flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-center', className)}>
        <p className="text-sm text-foreground">No se pudo abrir el chat de prueba.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const transferida = !session.iaHabilitada;
  const vacio = session.mensajes.length === 0 && efectos.length === 0;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <SandboxFlowSelect
          session={session}
          disabled={selectFlow.isPending || reset.isPending}
          onChange={(flowId) => selectFlow.mutate(flowId)}
        />
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto h-8 transition-transform duration-150 ease-out active:scale-[0.97]"
              disabled={reset.isPending}
            >
              <RotateCcw aria-hidden="true" />
              Reiniciar
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Reiniciar la conversación de prueba?</AlertDialogTitle>
              <AlertDialogDescription>
                Se borran los mensajes y lo que se creó durante la prueba, como leads y etiquetas.
                Empiezas de cero, como si fueras un cliente nuevo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => reset.mutate()}>Reiniciar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <p className="flex items-center gap-2 border-b border-border bg-muted px-3 py-1.5 text-xs text-secondary-foreground">
        <FlaskConical className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        Modo prueba: nada se envía por WhatsApp. Lo demás sí ocurre de verdad, pero queda fuera de tus
        reportes.
      </p>

      {vacio ? (
        <EstadoVacio
          deshabilitado={send.isPending}
          onElegir={(t) => send.mutate(t)}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            {hilo.map((item) =>
              item.kind === 'mensaje' ? (
                <MessageBubble
                  key={item.key}
                  message={item.mensaje}
                  perspectiva="cliente"
                  onAbrirImagen={() => undefined}
                />
              ) : (
                <SandboxEffectCard
                  key={item.key}
                  efecto={item.registro.efecto}
                  puedeAvanzar={item.key === ultimaEspera && session.esperaPendiente !== null}
                  avanzando={advance.isPending}
                  onAvanzar={() => advance.mutate()}
                />
              ),
            )}
            {esperando && (
              <p
                role="status"
                className="flex items-center gap-1.5 text-xs text-muted-foreground motion-safe:animate-pulse"
              >
                <Sparkles className="size-3" aria-hidden="true" />
                Sofi está escribiendo…
              </p>
            )}
            <div ref={bottomRef} />
          </div>
        </div>
      )}

      <SandboxComposer
        disabled={transferida || reset.isPending}
        motivoBloqueo="Sofi transfirió la conversación. Reinicia para volver a probar."
        pending={send.isPending}
        onSend={(texto) => send.mutateAsync(texto)}
      />
    </div>
  );
}
