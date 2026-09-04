import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BellRing, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { getWhatsAppTemplates } from '../../../api/whatsapp-templates.js';
import { TemplatePreview } from '../../whatsapp-templates/components/TemplatePreview.js';
import { useReminderSettings } from '../hooks/useReminderSettings.js';

const OPCIONES_ANTELACION_MINUTOS = [30, 60, 120, 240, 360, 720];

function labelAntelacion(minutos: number): string {
  if (minutos < 60) return `${minutos} minutos antes de expirar`;
  const horas = minutos / 60;
  return `${horas} ${horas === 1 ? 'hora' : 'horas'} antes de expirar`;
}

/** Ancla la antelación a un ejemplo concreto y en vivo, en vez de dejarla como un número
 *  desnudo: "120 minutos" no dice nada sin una hora de referencia. */
function ejemploHorario(antelacionMinutos: number): { ultimoMensaje: string; expira: string; aviso: string } {
  const fmt = (d: Date) => d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });
  const ultimoMensaje = new Date();
  const expira = new Date(ultimoMensaje.getTime() + 24 * 60 * 60 * 1000);
  const aviso = new Date(expira.getTime() - antelacionMinutos * 60_000);
  return { ultimoMensaje: fmt(ultimoMensaje), expira: fmt(expira), aviso: fmt(aviso) };
}

/**
 * Configuración del recordatorio de inactividad (HU-FLOW-02): una política del tenant, no un paso
 * de un flujo — vive en `FlowsPage` porque es donde el admin ya piensa en automatizaciones, con
 * el mismo peso visual que un panel de automatización, no el de un formulario CRUD suelto.
 */
export function ReminderSettings(): React.ReactElement {
  const { data, isLoading, save, isSaving } = useReminderSettings();

  const [activo, setActivo] = useState(false);
  const [antelacionMinutos, setAntelacionMinutos] = useState(120);
  const [texto, setTexto] = useState('');
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [sucio, setSucio] = useState(false);

  useEffect(() => {
    if (!data) return;
    setActivo(data.activo);
    setAntelacionMinutos(data.antelacionMinutos);
    setTexto(data.texto);
    setTemplateId(data.templateId ?? undefined);
    setSucio(false);
  }, [data]);

  const { data: templatesData } = useQuery({
    queryKey: ['whatsapp-templates', 'APPROVED'],
    queryFn: () => getWhatsAppTemplates({ status: 'APPROVED', limit: 100 }),
  });
  const plantillas = templatesData?.data ?? [];
  const plantillaSeleccionada = plantillas.find((p) => p.id === templateId) ?? null;

  function marcarSucio<T>(setter: (valor: T) => void): (valor: T) => void {
    return (valor: T) => {
      setter(valor);
      setSucio(true);
    };
  }

  const ejemplo = ejemploHorario(antelacionMinutos);

  function handleGuardar(): void {
    if (activo && !texto.trim()) {
      toast.error('Escribe el texto del recordatorio antes de activarlo.');
      return;
    }
    save(
      { activo, antelacionMinutos, texto: texto.trim(), templateId },
      {
        onSuccess: () => {
          setSucio(false);
          toast.success('Recordatorio guardado.');
        },
        onError: () => toast.error('No se pudo guardar el recordatorio.'),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between gap-4 border-b border-border p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary">
            <BellRing className="size-5 text-primary-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-foreground">Recordatorio de inactividad</h2>
              <Badge variant={activo ? 'success' : 'secondary'}>{activo ? 'Activo' : 'Desactivado'}</Badge>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Le escribe una vez a la conversación antes de que se cierre la ventana de 24 h de
              WhatsApp. Configúralo con calma; no se envía nada hasta que lo actives.
            </p>
          </div>
        </div>
        <Switch
          checked={activo}
          onCheckedChange={marcarSucio(setActivo)}
          aria-label="Activar recordatorio de inactividad"
        />
      </div>

      <div className="grid gap-6 p-6 md:grid-cols-2">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Antelación</Label>
            <Select
              value={String(antelacionMinutos)}
              onValueChange={(v) => marcarSucio(setAntelacionMinutos)(Number(v))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPCIONES_ANTELACION_MINUTOS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {labelAntelacion(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Ej.: si el cliente escribió por última vez a las {ejemplo.ultimoMensaje}, el aviso
              saldría a las <span className="font-medium text-foreground">{ejemplo.aviso}</span>,
              antes de que la ventana se cierre a las {ejemplo.expira}.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Mensaje</Label>
            <Textarea
              value={texto}
              onChange={(e) => marcarSucio(setTexto)(e.target.value)}
              placeholder="¡Hola! ¿Sigues por ahí? Cuéntame si tienes alguna duda."
              rows={4}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Si la ventana ya expiró, enviar esta plantilla
            </Label>
            <Select
              value={templateId ?? 'ninguna'}
              onValueChange={(v) => marcarSucio(setTemplateId)(v === 'ninguna' ? undefined : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Ninguna" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ninguna">Ninguna</SelectItem>
                {plantillas.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!plantillaSeleccionada ? (
              <p className="text-xs text-muted-foreground">
                Sin plantilla, el recordatorio no sale si la ventana ya expiró — solo mientras
                sigue abierta.
              </p>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Así se vería</Label>
          <TemplatePreview cuerpo={texto || null} />
          {plantillaSeleccionada ? (
            <>
              <p className="pt-2 text-xs text-muted-foreground">Si ya expiró la ventana, en su lugar:</p>
              <TemplatePreview cuerpo={plantillaSeleccionada.cuerpo} ejemplos={plantillaSeleccionada.ejemplos} />
            </>
          ) : null}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border p-6">
        <Button onClick={handleGuardar} disabled={!sucio || isSaving}>
          {isSaving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          Guardar
        </Button>
      </div>
    </div>
  );
}
