import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { esSinPermiso } from '@/features/contacts/lib/errors';
import { OrganizadorFilters } from '../components/OrganizadorFilters.js';
import { OrganizadorSwitch } from '../components/OrganizadorSwitch.js';
import { OrganizadorTable } from '../components/OrganizadorTable.js';
import { ActividadFeed } from '../components/ActividadFeed.js';
import { HistorialPendienteSheet } from '../components/HistorialPendienteSheet.js';
import {
  useActividad,
  useConteosOrganizador,
  useOrganizadorLista,
} from '../hooks/useOrganizador.js';
import { nombreCliente } from '../lib/organizador.js';
import type { EstadoOrganizador, FiltrosOrganizador, OrganizadorPendienteDTO } from '../types.js';

type Vista = 'proximos' | 'vencidos' | 'pospuestos' | 'cerrados' | 'historial';

const VISTAS: { key: Vista; label: string; estado: EstadoOrganizador | null }[] = [
  { key: 'proximos', label: 'Próximos', estado: 'pendiente' },
  { key: 'vencidos', label: 'Vencidos', estado: 'vencido' },
  { key: 'pospuestos', label: 'Pospuestos', estado: 'pospuesto' },
  { key: 'cerrados', label: 'Cerrados', estado: 'cerrado' },
  { key: 'historial', label: 'Historial', estado: null },
];

const VACIO: Record<Vista, string> = {
  proximos:
    'No hay pendientes próximos. Programa una nota como pendiente desde la ficha del cliente en la bandeja y aparecerá aquí.',
  vencidos: 'Nada vencido. Todo lo que tenía fecha está al día.',
  pospuestos: 'No hay pendientes pospuestos.',
  cerrados: 'Aún no has cerrado pendientes. Cuando cierres uno, quedará aquí con su motivo.',
  historial: 'Todavía no hay actividad. Programar, posponer o cerrar un pendiente queda registrado aquí.',
};

function leerVista(p: URLSearchParams): Vista {
  const v = p.get('vista');
  return VISTAS.some((x) => x.key === v) ? (v as Vista) : 'proximos';
}

function leerFiltros(p: URLSearchParams): FiltrosOrganizador {
  return {
    desde: p.get('desde') ?? undefined,
    hasta: p.get('hasta') ?? undefined,
    clienteId: p.get('cliente') ?? undefined,
    responsableId: p.get('responsable') ?? undefined,
  };
}

const PARAM: Record<keyof FiltrosOrganizador, string> = {
  desde: 'desde',
  hasta: 'hasta',
  clienteId: 'cliente',
  responsableId: 'responsable',
};

function Paginacion({
  page,
  limit,
  total,
  onPage,
}: {
  page: number;
  limit: number;
  total: number;
  onPage: (p: number) => void;
}): React.ReactElement | null {
  const paginas = Math.max(1, Math.ceil(total / limit));
  if (paginas <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">
      <span className="tabular-nums">
        Página {page} de {paginas}
      </span>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        aria-label="Página anterior"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-8"
        aria-label="Página siguiente"
        disabled={page >= paginas}
        onClick={() => onPage(page + 1)}
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

function Estado({ children, error = false }: { children: React.ReactNode; error?: boolean }): React.ReactElement {
  return (
    <div
      role={error ? 'alert' : undefined}
      className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground"
    >
      {children}
    </div>
  );
}

/**
 * ORGANIZADOR (HU-PDF-02). Las notas pendientes de los clientes, ordenadas por lo que hay que hacer
 * y cuándo: próximos, vencidos, pospuestos, cerrados y el historial de todo lo que pasó con ellos.
 * Vista, filtros y página viven en la URL para poder compartir el enlace.
 */
export function OrganizadorPage(): React.ReactElement {
  const [params, setParams] = useSearchParams();
  const clave = params.toString();
  const vista = useMemo(() => leerVista(new URLSearchParams(clave)), [clave]);
  const filtros = useMemo(() => leerFiltros(new URLSearchParams(clave)), [clave]);
  const page = Math.max(1, Number(new URLSearchParams(clave).get('page')) || 1);
  const [historialDe, setHistorialDe] = useState<OrganizadorPendienteDTO | null>(null);

  // Un rango invertido no se manda: el backend lo rechazaría. El aviso lo da el filtro.
  const invertido = !!filtros.desde && !!filtros.hasta && filtros.desde > filtros.hasta;
  const filtrosEfectivos: FiltrosOrganizador = invertido
    ? { clienteId: filtros.clienteId, responsableId: filtros.responsableId }
    : filtros;

  const estado = VISTAS.find((v) => v.key === vista)?.estado ?? null;
  const conteos = useConteosOrganizador(filtrosEfectivos);
  const lista = useOrganizadorLista(estado ?? 'pendiente', filtrosEfectivos, page);
  const actividad = useActividad(
    { clienteId: filtros.clienteId, responsableId: filtros.responsableId },
    page,
    estado === null,
  );

  function aplicar(cambios: Record<string, string | undefined>, conservarPagina = false): void {
    const next = new URLSearchParams(clave);
    for (const [k, v] of Object.entries(cambios)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!conservarPagina) next.delete('page');
    setParams(next, { replace: true });
  }

  function cambiarFiltros(cambio: Partial<FiltrosOrganizador>): void {
    const traducido: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(cambio) as [keyof FiltrosOrganizador, string | undefined][]) {
      traducido[PARAM[k]] = v;
    }
    aplicar(traducido);
  }

  const filas = lista.data?.data ?? [];
  const clienteNombre = filtros.clienteId
    ? (() => {
        const fila = filas.find((f) => f.clienteId === filtros.clienteId);
        return fila ? nombreCliente(fila.cliente) : null;
      })()
    : null;

  const sinPermiso = esSinPermiso(lista.error) || esSinPermiso(conteos.error);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Organizador</h1>
          <p className="max-w-prose text-sm text-muted-foreground">
            Tus notas programadas, convertidas en recordatorios. Cierra lo que ya hiciste y pospón lo
            que necesita otra fecha: todo queda en el historial del cliente.
          </p>
        </div>
        <OrganizadorSwitch />
      </header>

      {sinPermiso ? (
        <Estado>Tu perfil no tiene acceso a las notas de los clientes, así que no hay pendientes que mostrar.</Estado>
      ) : (
        <>
          <Tabs value={vista} onValueChange={(v) => aplicar({ vista: v === 'proximos' ? undefined : v })}>
            <TabsList className="h-auto flex-wrap justify-start">
              {VISTAS.map((v) => {
                const n = v.estado ? conteos.data?.[v.estado] : undefined;
                return (
                  <TabsTrigger key={v.key} value={v.key} className="gap-1.5">
                    {v.label}
                    {n !== undefined && (
                      <span
                        className={
                          v.estado === 'vencido' && n > 0
                            ? 'rounded bg-destructive-subtle px-1.5 text-xs tabular-nums text-destructive'
                            : 'text-xs tabular-nums text-muted-foreground'
                        }
                      >
                        {n}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>

          <OrganizadorFilters
            filtros={filtros}
            clienteNombre={clienteNombre}
            conFechas={estado !== null}
            onChange={cambiarFiltros}
            onClear={() => aplicar({ desde: undefined, hasta: undefined, cliente: undefined, responsable: undefined })}
          />

          {estado === null ? (
            actividad.isLoading ? (
              <Skeleton className="h-64 w-full rounded-lg" />
            ) : actividad.isError ? (
              <Estado error>
                <AlertCircle className="size-4 text-destructive" aria-hidden="true" />
                No se pudo cargar el historial.
                <Button variant="outline" size="sm" onClick={() => void actividad.refetch()}>
                  Reintentar
                </Button>
              </Estado>
            ) : (actividad.data?.data ?? []).length === 0 ? (
              <Estado>{VACIO.historial}</Estado>
            ) : (
              <>
                <ActividadFeed eventos={actividad.data?.data ?? []} />
                <Paginacion
                  page={page}
                  limit={actividad.data?.limit ?? 20}
                  total={actividad.data?.total ?? 0}
                  onPage={(p) => aplicar({ page: String(p) }, true)}
                />
              </>
            )
          ) : lista.isLoading ? (
            <div className="space-y-2" aria-busy="true" aria-live="polite">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : lista.isError ? (
            <Estado error>
              <AlertCircle className="size-4 text-destructive" aria-hidden="true" />
              No se pudieron cargar los pendientes.
              <Button variant="outline" size="sm" onClick={() => void lista.refetch()}>
                Reintentar
              </Button>
            </Estado>
          ) : filas.length === 0 ? (
            <Estado>{VACIO[vista]}</Estado>
          ) : (
            <>
              <OrganizadorTable
                pendientes={filas}
                onHistorial={setHistorialDe}
                onFiltrarCliente={(id) => cambiarFiltros({ clienteId: id })}
              />
              <Paginacion
                page={page}
                limit={lista.data?.limit ?? 20}
                total={lista.data?.total ?? 0}
                onPage={(p) => aplicar({ page: String(p) }, true)}
              />
            </>
          )}
        </>
      )}

      <HistorialPendienteSheet pendiente={historialDe} onClose={() => setHistorialDe(null)} />
    </div>
  );
}
