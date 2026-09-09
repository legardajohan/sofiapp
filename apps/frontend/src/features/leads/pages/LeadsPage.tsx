import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SemaforoSlug } from '../../tags/types.js';
import { LeadDetailSheet } from '../components/LeadDetailSheet.js';
import { LeadsFilters } from '../components/LeadsFilters.js';
import { LeadsTable } from '../components/LeadsTable.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { PipelineBoard } from '../../pipeline/index.js';
import { useLeads } from '../hooks/useLeads.js';
import { useEstados } from '../../estados/hooks/useEstados.js';
import { useLeadsStore } from '../useLeadsStore.js';
import type { LeadListItemDTO, LeadsFiltros } from '../types.js';

const SEMAFOROS: SemaforoSlug[] = ['verde', 'naranja', 'rojo', 'azul'];

/** Un valor de la URL solo entra en los filtros si pertenece a su unión. La URL la teclea cualquiera. */
function unaDe<T extends string>(valores: readonly T[], valor: string | null): T | undefined {
  return valores.includes(valor as T) ? (valor as T) : undefined;
}

/** Las dos vistas de la misma cartera. Vive en la URL para compartirse por enlace (HU-PIPE-01). */
type Vista = 'tabla' | 'embudo';

function leerVista(params: URLSearchParams): Vista {
  return params.get('vista') === 'embudo' ? 'embudo' : 'tabla';
}

function leerFiltros(params: URLSearchParams): LeadsFiltros {
  const page = Number(params.get('page'));

  return {
    page: Number.isInteger(page) && page > 0 ? page : 1,
    // Ya no se valida contra una unión: los estados son del tenant. Si la clave no existe,
    // el backend responde página vacía (y el selector cae a "Todos los estados").
    estado: params.get('estado') ?? undefined,
    semaforo: unaDe(SEMAFOROS, params.get('semaforo')),
    asesor: params.get('asesor') ?? undefined,
    desde: params.get('desde') ?? undefined,
    hasta: params.get('hasta') ?? undefined,
  };
}

export function LeadsPage(): React.ReactElement {
  const [params, setParams] = useSearchParams();
  // `params.toString()` como dependencia: `URLSearchParams` es un objeto nuevo en cada render y
  // compararlo por identidad recrearía el objeto de filtros —y con él la `queryKey`— sin parar.
  const clave = params.toString();
  const filtros = useMemo(() => leerFiltros(new URLSearchParams(clave)), [clave]);
  const vista = useMemo(() => leerVista(new URLSearchParams(clave)), [clave]);

  /**
   * El embudo comparte filtros con la tabla menos `page` y `estado`: agrupa por etapa, así que
   * filtrar por una sola se contradice con lo que la vista hace (y el backend lo rechaza).
   */
  const filtrosEmbudo = useMemo(
    () => ({
      asesor: filtros.asesor,
      semaforo: filtros.semaforo,
      desde: filtros.desde,
      hasta: filtros.hasta,
    }),
    [filtros.asesor, filtros.semaforo, filtros.desde, filtros.hasta],
  );

  const { data, isLoading, isError, refetch } = useLeads(filtros, vista === 'tabla');
  const estados = useEstados();
  const selectedId = useLeadsStore((s) => s.selectedId);
  const select = useLeadsStore((s) => s.select);

  /**
   * El lead abierto desde una tarjeta del embudo.
   *
   * La tabla resuelve el suyo buscando en su página, pero en el embudo el lead puede no estar en
   * ella. La tarjeta ya tiene el dato, así que lo entrega al abrirse en vez de costar otra consulta.
   */
  const [leadDelEmbudo, setLeadDelEmbudo] = useState<LeadListItemDTO | null>(null);

  const abrirDesdeEmbudo = useCallback(
    (lead: LeadListItemDTO) => {
      setLeadDelEmbudo(lead);
      select(lead.id);
    },
    [select],
  );

  const cerrarDetalle = useCallback(() => {
    select(null);
    setLeadDelEmbudo(null);
  }, [select]);

  const hayFiltros = Boolean(
    filtros.estado ?? filtros.asesor ?? filtros.semaforo ?? filtros.desde ?? filtros.hasta,
  );

  /**
   * Escribe los filtros en la URL para que la vista se comparta por enlace y sobreviva al refresco.
   * Cualquier cambio que no sea de página vuelve a la 1: quedarse en la página 5 de un listado que
   * ahora tiene 2 deja al usuario mirando un vacío que no es el suyo.
   */
  const aplicar = useCallback(
    (cambio: Partial<LeadsFiltros>) => {
      const siguiente = { ...filtros, ...cambio };
      if (!('page' in cambio)) siguiente.page = 1;

      const next = new URLSearchParams();
      // La vista sobrevive a cualquier cambio de filtro: quien está en el embudo filtrando por
      // responsable no ha pedido volver a la tabla.
      if (vista === 'embudo') next.set('vista', 'embudo');
      if (siguiente.page > 1) next.set('page', String(siguiente.page));
      if (siguiente.estado) next.set('estado', siguiente.estado);
      if (siguiente.semaforo) next.set('semaforo', siguiente.semaforo);
      if (siguiente.asesor) next.set('asesor', siguiente.asesor);
      if (siguiente.desde) next.set('desde', siguiente.desde);
      if (siguiente.hasta) next.set('hasta', siguiente.hasta);

      setParams(next, { replace: true });
    },
    [filtros, setParams, vista],
  );

  const limpiar = useCallback(() => {
    const next = new URLSearchParams();
    if (vista === 'embudo') next.set('vista', 'embudo');
    setParams(next, { replace: true });
  }, [setParams, vista]);

  /** Cambia de vista conservando los filtros: son la misma cartera mirada de dos maneras. */
  const cambiarVista = useCallback(
    (siguiente: string) => {
      const next = new URLSearchParams(params);
      if (siguiente === 'embudo') {
        next.set('vista', 'embudo');
        // El embudo agrupa por etapa: mandar `?estado=` al backend es un 400, y filtrar por una
        // sola etapa dejaria un tablero de una columna que la tabla ya dibuja mejor.
        next.delete('estado');
        next.delete('page');
      } else {
        next.delete('vista');
      }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  /** Desde una columna que no cabe entera: la tabla si pagina. */
  const verEnTabla = useCallback(
    (estadoKey: string) => {
      const next = new URLSearchParams(params);
      next.delete('vista');
      next.set('estado', estadoKey);
      next.delete('page');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  /**
   * Reabre el panel al volver desde la conversación (`?lead=<id>`, HU-CRM-03).
   *
   * Se aplica UNA vez por id: sin el guard, cerrar el panel lo volvería a abrir en cada render
   * mientras el parámetro siguiera en la URL, y no habría forma de salir de él.
   */
  const leadDeLaUrl = params.get('lead');
  const reabierto = useRef<string | null>(null);
  useEffect(() => {
    if (!leadDeLaUrl || reabierto.current === leadDeLaUrl) return;
    reabierto.current = leadDeLaUrl;
    select(leadDeLaUrl);
  }, [leadDeLaUrl, select]);

  const seleccionado =
    data?.data.find((l) => l.id === selectedId) ??
    (leadDelEmbudo?.id === selectedId ? leadDelEmbudo : null);

  return (
    <div
      className={cn(
        'mx-auto w-full space-y-6',
        // El embudo necesita el ancho: con siete etapas, `max-w-6xl` dejaba fuera de pantalla la
        // mitad del tablero y obligaba a descubrir por scroll que había más columnas. La tabla se
        // queda estrecha, que es lo que le conviene a una línea de texto.
        vista === 'embudo' ? 'max-w-[110rem]' : 'max-w-6xl',
      )}
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {vista === 'embudo'
              ? 'Arrastra una oportunidad por su asa para moverla de etapa, o enfócala con el tabulador y pulsa Espacio.'
              : 'Todo lo que se convirtió desde una conversación, con su estado y su resumen.'}
          </p>
        </div>

        <Tabs value={vista} onValueChange={cambiarVista}>
          <TabsList aria-label="Cómo ver los leads">
            <TabsTrigger value="tabla">Tabla</TabsTrigger>
            <TabsTrigger value="embudo">Embudo</TabsTrigger>
          </TabsList>
        </Tabs>
      </header>

      <LeadsFilters filtros={filtros} onChange={aplicar} onClear={limpiar} />

      {vista === 'embudo' ? (
        <PipelineBoard
          filtros={filtrosEmbudo}
          onSelect={abrirDesdeEmbudo}
          onVerEnTabla={verEnTabla}
        />
      ) : (
        <LeadsTable
          datos={data}
          isLoading={isLoading}
          isError={isError}
          onRetry={() => void refetch()}
          hayFiltros={hayFiltros}
          onClearFiltros={limpiar}
          selectedId={selectedId}
          onSelect={select}
          onPageChange={(page) => aplicar({ page })}
          estados={estados.data ?? []}
        />
      )}

      <LeadDetailSheet
        lead={seleccionado}
        onClose={cerrarDetalle}
        estados={estados.data ?? []}
      />
    </div>
  );
}
