import { useEffect, useMemo, useState } from 'react';
import { isAxiosError } from 'axios';
import { CalendarClock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Accordion } from '@/components/ui/accordion';
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
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { CategoriaReglaCard } from '../components/CategoriaReglaCard.js';
import { EstadoActualStrip } from '../components/EstadoActualStrip.js';
import { ExcepcionesTable } from '../components/ExcepcionesTable.js';
import { ImportarFestivosDialog } from '../components/ImportarFestivosDialog.js';
import { useSaveSendWindowConfig, useSendWindowConfig } from '../hooks/useSendWindowConfig.js';
import { useSendWindowStatus } from '../hooks/useSendWindowStatus.js';
import { ZONAS_HORARIAS } from '../lib/formato.js';
import {
  agrupar,
  erroresDelServidor,
  porDia,
  validarPolitica,
  type FranjasPorDia,
} from '../lib/validacion.js';
import {
  CATEGORIAS_ENVIO,
  type CategoriaEnvio,
  type Excepcion,
  type ModoRegla,
  type PoliticaVentana,
  type SendWindowConfig,
} from '../types.js';

type EstadoReglas = Record<CategoriaEnvio, { modo: ModoRegla; dias: FranjasPorDia }>;

interface Borrador {
  activo: boolean;
  zonaHoraria: string;
  reglas: EstadoReglas;
  excepciones: Excepcion[];
}

function desdeServidor(c: SendWindowConfig): Borrador {
  const reglas = {} as EstadoReglas;
  for (const cat of CATEGORIAS_ENVIO) {
    const r = c.reglas.find((x) => x.categoria === cat);
    reglas[cat] = { modo: r?.modo ?? 'libre', dias: porDia(r?.franjas ?? []) };
  }
  return { activo: c.activo, zonaHoraria: c.zonaHoraria, reglas, excepciones: c.excepciones };
}

/** El borrador en la forma del API. También sirve para comparar con lo guardado. */
function aPolitica(b: Borrador): PoliticaVentana {
  return {
    activo: b.activo,
    zonaHoraria: b.zonaHoraria,
    reglas: CATEGORIAS_ENVIO.map((categoria) => ({
      categoria,
      modo: b.reglas[categoria].modo,
      franjas: agrupar(b.reglas[categoria].dias),
    })),
    excepciones: b.excepciones.map((e) => ({
      ...e,
      ...(e.motivo !== undefined ? { motivo: e.motivo.trim() || undefined } : {}),
    })),
  };
}

function Cargando(): React.ReactElement {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Cargando los horarios de envío">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-24 w-full rounded-xl" />
      {Array.from({ length: 4 }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full rounded-xl" />
      ))}
    </div>
  );
}

function SendWindowForm({ config }: { config: SendWindowConfig }): React.ReactElement {
  const [borrador, setBorrador] = useState<Borrador>(() => desdeServidor(config));
  const [abiertas, setAbiertas] = useState<string[]>([]);
  const [importando, setImportando] = useState(false);
  const [erroresServidor, setErroresServidor] = useState<ReturnType<typeof erroresDelServidor> | null>(null);
  const guardar = useSaveSendWindowConfig();
  const status = useSendWindowStatus();

  // Tras guardar, el servidor devuelve la versión canónica y el formulario se resincroniza.
  useEffect(() => setBorrador(desdeServidor(config)), [config]);

  const politica = useMemo(() => aPolitica(borrador), [borrador]);
  const guardada = useMemo(() => aPolitica(desdeServidor(config)), [config]);
  const hayCambios = JSON.stringify(politica) !== JSON.stringify(guardada);
  const errores = useMemo(() => validarPolitica(politica), [politica]);

  const zonas = ZONAS_HORARIAS.some((z) => z.valor === borrador.zonaHoraria)
    ? ZONAS_HORARIAS
    : [{ valor: borrador.zonaHoraria, nombre: borrador.zonaHoraria }, ...ZONAS_HORARIAS];

  function cambiar(cambios: Partial<Borrador>): void {
    setErroresServidor(null);
    setBorrador((b) => ({ ...b, ...cambios }));
  }

  function cambiarRegla(cat: CategoriaEnvio, cambios: Partial<EstadoReglas[CategoriaEnvio]>): void {
    setErroresServidor(null);
    setBorrador((b) => ({ ...b, reglas: { ...b.reglas, [cat]: { ...b.reglas[cat], ...cambios } } }));
  }

  function onSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (errores.hayErrores) {
      // Se abren las categorías con problemas: un error dentro de una tarjeta cerrada no se ve.
      const conErrores = CATEGORIAS_ENVIO.filter((c) => errores.reglas[c]?.length);
      setAbiertas((prev) => [...new Set([...prev, ...conErrores])]);
      toast.error('Revisa los horarios marcados antes de guardar.');
      return;
    }
    const enviada = politica;
    guardar.mutate(enviada, {
      onError: (err) => {
        const lista = isAxiosError<{ errors?: Array<{ path: string; message: string }> }>(err)
          ? err.response?.data?.errors
          : undefined;
        if (lista?.length) {
          const mapeados = erroresDelServidor(lista, enviada);
          setErroresServidor(mapeados);
          setAbiertas((prev) => [...new Set([...prev, ...Object.keys(mapeados.reglas)])]);
          toast.error('El servidor rechazó algunos horarios. Revisa los marcados.');
        } else {
          toast.error('No se pudieron guardar los horarios. Inténtalo de nuevo.');
        }
      },
    });
  }

  const generales = [...errores.general, ...(erroresServidor?.general ?? [])];

  return (
    <form onSubmit={onSubmit} className="space-y-6 pb-24">
      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="ventana-activo" className="text-base font-semibold text-foreground">
              Respetar horarios de envío
            </label>
            <p id="ventana-activo-ayuda" className="mt-0.5 max-w-prose text-sm text-muted-foreground">
              Apagado, todo sale en cuanto se genera. Encendido, cada tipo de mensaje sigue su horario
              y lo que caiga fuera se aplaza, se bloquea o pasa a un asesor.
            </p>
          </div>
          <Switch
            id="ventana-activo"
            checked={borrador.activo}
            onCheckedChange={(activo) => cambiar({ activo })}
            aria-describedby="ventana-activo-ayuda"
          />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border pt-4">
          <Label htmlFor="ventana-zona" className="text-sm text-secondary-foreground">
            Las horas son de
          </Label>
          <Select value={borrador.zonaHoraria} onValueChange={(zonaHoraria) => cambiar({ zonaHoraria })}>
            <SelectTrigger id="ventana-zona" className="h-9 w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {zonas.map((z) => (
                <SelectItem key={z.valor} value={z.valor}>
                  {z.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      <EstadoActualStrip status={status.data} cargando={status.isPending} />

      <div className={cn('space-y-3 transition-opacity duration-200', !borrador.activo && 'opacity-60')}>
        <h2 className="text-sm font-medium text-secondary-foreground">Horario por tipo de mensaje</h2>
        <TooltipProvider delayDuration={300}>
          <Accordion type="multiple" value={abiertas} onValueChange={setAbiertas} className="space-y-2">
            {CATEGORIAS_ENVIO.map((cat) => {
              const regla = politica.reglas.find((r) => r.categoria === cat)!;
              return (
                <CategoriaReglaCard
                  key={cat}
                  categoria={cat}
                  modo={borrador.reglas[cat].modo}
                  dias={borrador.reglas[cat].dias}
                  franjas={regla.franjas}
                  errores={[...(errores.reglas[cat] ?? []), ...(erroresServidor?.reglas[cat] ?? [])]}
                  onModo={(modo) => cambiarRegla(cat, { modo })}
                  onDias={(dias) => cambiarRegla(cat, { dias })}
                />
              );
            })}
          </Accordion>
        </TooltipProvider>
      </div>

      <div className={cn('transition-opacity duration-200', !borrador.activo && 'opacity-60')}>
        <ExcepcionesTable
          excepciones={borrador.excepciones}
          errores={errores.excepciones}
          onChange={(excepciones) => cambiar({ excepciones })}
          onImportar={() => setImportando(true)}
        />
      </div>

      <ImportarFestivosDialog
        open={importando}
        onOpenChange={setImportando}
        existentes={borrador.excepciones}
        onImportar={(nuevas) => cambiar({ excepciones: [...borrador.excepciones, ...nuevas] })}
      />

      {hayCambios ? (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-card backdrop-blur motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground">Tienes cambios sin guardar.</p>
            {generales.map((g) => (
              <p key={g} role="alert" className="text-xs text-destructive">
                {g}
              </p>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setErroresServidor(null);
              setBorrador(desdeServidor(config));
            }}
            disabled={guardar.isPending}
          >
            Descartar
          </Button>
          <Button
            type="submit"
            disabled={guardar.isPending}
            className="transition-transform duration-150 ease-out motion-safe:active:scale-[0.98]"
          >
            {guardar.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" aria-hidden="true" /> : null}
            Guardar cambios
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function SendWindowPage(): React.ReactElement {
  const { data: config, isPending, isError, refetch } = useSendWindowConfig();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary">
          <CalendarClock className="size-5 text-primary-foreground" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Horarios de envío</h1>
          <p className="mt-0.5 max-w-prose text-sm text-secondary-foreground">
            Elige en qué horas puede escribirles SofiApp a tus clientes por WhatsApp, por tipo de
            mensaje. Nadie debería recibir una campaña a las 3 de la mañana.
          </p>
        </div>
      </header>

      {isPending && <Cargando />}

      {isError && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          <p className="text-sm text-foreground">No se pudieron cargar los horarios de envío.</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            Reintentar
          </button>
        </div>
      )}

      {config && <SendWindowForm config={config} />}
    </div>
  );
}
