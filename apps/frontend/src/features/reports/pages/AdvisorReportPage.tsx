import { RefreshCw, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { PeriodFilter } from '@/components/charts/PeriodFilter';
import { RefreshControl } from '@/components/charts/RefreshControl';
import { usePeriodParams, type PeriodoPreset } from '@/hooks/use-period-params';
import { useDashboardRefresh } from '@/hooks/use-dashboard-refresh';
import { useAdvisorReport, ADVISOR_REPORT_KEY } from '../hooks/useAdvisorReport.js';
import { AdvisorKpiStrip } from '../components/AdvisorKpiStrip.js';
import { AdvisorBarsChart } from '../components/AdvisorBarsChart.js';
import { AdvisorTable } from '../components/AdvisorTable.js';
import { AdvisorActivityChart } from '../components/AdvisorActivityChart.js';
import { useAdvisorActivity } from '../hooks/useAdvisorActivity.js';
import { useActivityParams } from '../hooks/use-activity-params.js';
import { ZONA_DEL_VISOR } from '../lib/zona-visor.js';
import { RolUsuarioFilter } from '@/components/users/RolUsuarioFilter';
import { grupoParaBackend } from '@/lib/grupos-usuarios';
import { useTenantUsersConInactivos } from '@/features/users/hooks/useTenantUsers';
import { useFiltroRolUsuarioParam } from '../hooks/use-grupo-param.js';

const PRESETS: readonly PeriodoPreset[] = ['7d', '30d', 'mes', 'personalizado'];

// El rango viene del backend en UTC (medianoche → fin de día): se lee en UTC para no correr un día.
const dia = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const diaConAnio = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function rangoLegible(desde: string, hasta: string): string {
  return `Del ${dia.format(new Date(desde))} al ${diaConAnio.format(new Date(hasta))}`;
}

/**
 * Productividad por persona (HU-REP-01). Los tres roles la ven completa (ADR 0018); AUTH-06 añade el
 * filtro por grupo y compara a cada quien solo con los de su rol. Las guardas viven en el router.
 */
export function AdvisorReportPage(): React.ReactElement {
  const period = usePeriodParams({ presets: PRESETS, defaultPreset: '30d' });
  const tablero = useDashboardRefresh(ADVISOR_REPORT_KEY);
  // AUTH-06: tres pares de filtros «rol + persona», independientes entre sí (cada uno en su URL).
  const { data: usuarios } = useTenantUsersConInactivos();
  const quienes = useFiltroRolUsuarioParam('grupo', 'persona');
  const filtroActividad = useFiltroRolUsuarioParam('actividadGrupo', 'asesor');
  const filtroTabla = useFiltroRolUsuarioParam('tablaGrupo', 'tablaPersona');
  const grupo = grupoParaBackend(quienes.value);
  // Indicadores y barras: lo que diga «Quiénes» (lo valida el backend).
  const { data, dataUpdatedAt, isPending, isError, refetch } = useAdvisorReport({
    ...period.rango,
    ...(grupo ? { grupo } : {}),
  });
  // La tabla tiene su propio filtro: parte siempre de toda la empresa y filtra en el navegador.
  const empresa = useAdvisorReport(period.rango);
  const filtros = useActivityParams();
  // Siempre todos los asesores: el filtro se aplica en la gráfica para que el color siga al asesor.
  const actividad = useAdvisorActivity({
    ...period.rango,
    granularidad: filtros.granularidad,
    ...(ZONA_DEL_VISOR ? { tz: ZONA_DEL_VISOR } : {}),
    // El rol va al backend; la persona la resalta la gráfica (conserva el color de cada serie).
    ...(filtroActividad.value.grupo ? { grupo: filtroActividad.value.grupo } : {}),
  });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Productividad del equipo</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {data ? rangoLegible(data.rango.desde, data.rango.hasta) : 'Conversaciones atendidas, ventas cerradas y tiempo activo de cada asesor'}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <RolUsuarioFilter
            idPrefix="reporte-quienes"
            value={quienes.value}
            onChange={quienes.setValue}
            usuarios={usuarios}
            etiquetaTodos="Toda la empresa"
          />
          <PeriodFilter
            period={period}
            idPrefix="reporte-asesores"
            mientrasInvertido="Mostramos los últimos 30 días hasta que lo corrijas."
          />
          <RefreshControl
            onRefresh={() => void tablero.refresh()}
            isRefreshing={tablero.isRefreshing}
            updatedAt={data ? dataUpdatedAt : undefined}
          />
        </div>
      </header>

      {isError && !data ? (
        <Alert variant="destructive">
          <TriangleAlert className="size-4" />
          <AlertTitle>No pudimos cargar el reporte</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Revisa tu conexión y vuelve a intentarlo.
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="size-3.5" />
              Reintentar
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <AdvisorKpiStrip report={data} isLoading={isPending} />
          <AdvisorBarsChart asesores={data?.porAsesor} isLoading={isPending} />
          <AdvisorActivityChart
            actividad={actividad.data}
            isLoading={actividad.isPending}
            granularidad={filtros.granularidad}
            onGranularidad={filtros.setGranularidad}
            asesorId={filtroActividad.value.persona ?? ''}
            filtro={
              <RolUsuarioFilter
                idPrefix="reporte-actividad"
                compacto
                etiquetaRol="Rol del tiempo activo"
                value={filtroActividad.value}
                onChange={filtroActividad.setValue}
                usuarios={usuarios}
              />
            }
          />
          <AdvisorTable
            report={empresa.data}
            isLoading={empresa.isPending}
            filtro={filtroTabla.value}
            filtroSlot={
              <RolUsuarioFilter
                idPrefix="reporte-tabla"
                compacto
                etiquetaRol="Rol del detalle"
                value={filtroTabla.value}
                onChange={filtroTabla.setValue}
                usuarios={usuarios}
              />
            }
          />
        </>
      )}
    </div>
  );
}
