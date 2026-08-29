import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { SemaforoSlug } from '../../tags/types.js';
import { LeadDetailSheet } from '../components/LeadDetailSheet.js';
import { LeadsFilters } from '../components/LeadsFilters.js';
import { LeadsTable } from '../components/LeadsTable.js';
import { useLeads } from '../hooks/useLeads.js';
import { useEstados } from '../../estados/hooks/useEstados.js';
import { useSemaforos } from '../../semaforos/hooks/useSemaforos.js';
import { useLeadsStore } from '../useLeadsStore.js';
import type { LeadsFiltros } from '../types.js';

const SEMAFOROS: SemaforoSlug[] = ['verde', 'naranja', 'rojo', 'azul'];

/** Un valor de la URL solo entra en los filtros si pertenece a su unión. La URL la teclea cualquiera. */
function unaDe<T extends string>(valores: readonly T[], valor: string | null): T | undefined {
  return valores.includes(valor as T) ? (valor as T) : undefined;
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

  const { data, isLoading, isError, refetch } = useLeads(filtros);
  const estados = useEstados();
  const semaforos = useSemaforos();
  const selectedId = useLeadsStore((s) => s.selectedId);
  const select = useLeadsStore((s) => s.select);

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
      if (siguiente.page > 1) next.set('page', String(siguiente.page));
      if (siguiente.estado) next.set('estado', siguiente.estado);
      if (siguiente.semaforo) next.set('semaforo', siguiente.semaforo);
      if (siguiente.asesor) next.set('asesor', siguiente.asesor);
      if (siguiente.desde) next.set('desde', siguiente.desde);
      if (siguiente.hasta) next.set('hasta', siguiente.hasta);

      setParams(next, { replace: true });
    },
    [filtros, setParams],
  );

  const limpiar = useCallback(
    () => setParams(new URLSearchParams(), { replace: true }),
    [setParams],
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

  const seleccionado = data?.data.find((l) => l.id === selectedId) ?? null;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-foreground">Leads</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Todo lo que se convirtió desde una conversación, con su estado y su resumen.
        </p>
      </header>

      <LeadsFilters filtros={filtros} onChange={aplicar} onClear={limpiar} />

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

      <LeadDetailSheet
        lead={seleccionado}
        onClose={() => select(null)}
        estados={estados.data ?? []}
        semaforos={semaforos.data ?? []}
      />
    </div>
  );
}
