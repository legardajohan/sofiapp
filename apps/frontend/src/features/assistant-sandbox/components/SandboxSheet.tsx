import { useEffect, useState } from 'react';
import { FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { useSandboxSession, useSelectSandboxFlow } from '../hooks/useSandboxSession.js';
import { SandboxChat } from './SandboxChat.js';

interface Props {
  /** Flujo a probar al abrir. Sin él, se conserva el que ya estaba elegido. */
  flowId?: string;
  /** Texto bajo el título: qué se está probando desde este punto de entrada. */
  descripcion?: string;
}

/**
 * Atajo «Probar» (HU-IA-08): abre el mismo chat de prueba en un panel lateral, sin salir de la
 * pantalla de configuración donde el admin acaba de cambiar algo.
 */
export function SandboxSheet({
  flowId,
  descripcion = 'Escríbele a Sofi como lo haría un cliente y mira cómo responde.',
}: Props): React.ReactElement {
  const [abierto, setAbierto] = useState(false);

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="transition-transform duration-150 ease-out active:scale-[0.97]">
          <FlaskConical aria-hidden="true" />
          Probar
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-4 text-left">
          <SheetTitle>Probar asistente</SheetTitle>
          <SheetDescription>{descripcion}</SheetDescription>
        </SheetHeader>
        {abierto && <PreseleccionarFlujo flowId={flowId} />}
        <SandboxChat />
      </SheetContent>
    </Sheet>
  );
}

/**
 * Deja elegido el flujo desde el que se abrió el panel. Una sola vez por apertura: si el admin lo
 * cambia después desde el selector, esa decisión manda.
 */
function PreseleccionarFlujo({ flowId }: { flowId: string | undefined }): null {
  const { data: session } = useSandboxSession();
  const selectFlow = useSelectSandboxFlow();
  const [hecho, setHecho] = useState(false);

  useEffect(() => {
    if (hecho || !flowId || !session) return;
    setHecho(true);
    if (session.flujo?.id !== flowId) selectFlow.mutate(flowId);
  }, [hecho, flowId, session, selectFlow]);

  return null;
}
