import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useMemo, useState } from 'react';
import { parsearGrupoQuery, perteneceAlGrupo } from '@sofiapp/shared';
import { RolUsuarioFilter } from '@/components/users/RolUsuarioFilter';
import type { FiltroRolUsuario } from '@/lib/grupos-usuarios';
import type { UserDTO } from '@/features/users/types';
import type { RolEmpresa } from '@/stores/authStore';
import { useAsesorMetricas } from '../hooks/useAsesorMetricas.js';
import type { AsesorMetricasDTO } from '../types.js';
import { CargaBar } from './CargaBar.js';

interface AsignacionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Las columnas del desglose, en el orden de la máquina de estados de `docs/domain.md` §3. */
const CARTERA = [
  { key: 'nuevo', label: 'Nuevas' },
  { key: 'en_gestion', label: 'En gestión' },
  { key: 'pago_pendiente', label: 'Por pagar' },
] as const;

/** AUTH-06: el reparto se lee por rol, porque solo se compara a cada quien con los de su rol. */
const SECCIONES: Array<{ rol: RolEmpresa; etiqueta: string }> = [
  { rol: 'asesor', etiqueta: 'Asesores' },
  { rol: 'coordinador', etiqueta: 'Coordinadores' },
  { rol: 'administrador', etiqueta: 'Administradores' },
];

/** Las filas del reparto como usuarios, para alimentar el filtro «rol + persona». */
function comoUsuarios(filas: AsesorMetricasDTO[]): UserDTO[] {
  return filas.map((f) => ({
    id: f.asesorId,
    tenantId: null,
    nombre: f.nombre,
    email: '',
    rol: 'admin',
    ...(f.rolEmpresa ? { rolEmpresa: f.rolEmpresa } : {}),
    coordinadorId: f.coordinadorId,
    activo: true,
    esPrincipal: f.esPrincipal,
    puedeGestionarAdministradores: false,
  }));
}

function enFiltro(f: AsesorMetricasDTO, filtro: FiltroRolUsuario): boolean {
  if (filtro.persona) return f.asesorId === filtro.persona;
  const g = filtro.grupo ? parsearGrupoQuery(filtro.grupo) : null;
  if (!g) return true;
  if (g.tipo === 'usuario') return f.asesorId === g.usuarioId;
  return perteneceAlGrupo({ id: f.asesorId, rolEmpresa: f.rolEmpresa, coordinadorId: f.coordinadorId, esPrincipal: f.esPrincipal }, g);
}

function seccionesDe(filas: AsesorMetricasDTO[]): Array<{ etiqueta: string; filas: AsesorMetricasDTO[] }> {
  return SECCIONES.map((s) => ({
    etiqueta: s.etiqueta,
    filas: filas.filter((f) => (f.rolEmpresa ?? 'asesor') === s.rol),
  })).filter((s) => s.filas.length > 0);
}

/**
 * Cómo está repartido el trabajo entre los asesores (HU-IA-07).
 *
 * **La barra codifica solo las conversaciones activas.** El primer boceto apilaba los cinco estados
 * en una barra por asesor; se descartó por dos motivos y el segundo es el que manda: (a) no existen
 * cinco tokens de color accesibles en el proyecto —`tagColors` es para colores que vienen de la base
 * de datos—, y (b) la pregunta que trae aquí a alguien es «quién está más cargado», que es una sola
 * variable, y una sola variable se lee mejor en una sola barra. El desglose vive en las columnas.
 */
export function AsignacionDialog({ open, onOpenChange }: AsignacionDialogProps): React.ReactElement {
  const { data, isPending, isError, refetch } = useAsesorMetricas(open);

  // Ordenado por carga, descendente: el orden es información, y quien abre esto busca al saturado.
  const [filtro, setFiltro] = useState<FiltroRolUsuario>({ grupo: undefined, persona: undefined });
  const todas = useMemo(() => [...(data ?? [])].sort((a, b) => b.activas - a.activas), [data]);
  const usuarios = useMemo(() => comoUsuarios(todas), [todas]);
  // AUTH-06: filtro por rol (o grupo de coordinador) y persona. La escala de la barra es la de toda la
  // empresa, para que filtrar no haga parecer saturado a quien no lo está.
  const filas = todas.filter((f) => enFiltro(f, filtro));
  const maximo = todas[0]?.activas ?? 0;
  const secciones = seccionesDe(filas);
  const nombres = new Map(todas.map((f) => [f.asesorId, f.nombre]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cómo está repartido el trabajo</DialogTitle>
          <DialogDescription>
            Conversaciones sin cerrar por persona, agrupadas por rol. Son totales, sin rango de
            fechas.
          </DialogDescription>
        </DialogHeader>

        {todas.length > 0 && (
          <RolUsuarioFilter
            idPrefix="asignacion"
            compacto
            etiquetaRol="Rol"
            value={filtro}
            onChange={setFiltro}
            usuarios={usuarios}
          />
        )}

        {isPending && open ? (
          <div className="space-y-2" aria-live="polite" aria-busy="true">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError ? (
          <div role="alert" className="space-y-3 rounded-lg bg-destructive-subtle p-4">
            <p className="text-sm text-foreground">
              No se pudo cargar el reparto de conversaciones.
            </p>
            <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
              Reintentar
            </Button>
          </div>
        ) : todas.length > 0 && filas.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            Nadie de este filtro está activo ahora mismo.
          </p>
        ) : filas.length === 0 ? (
          <p className="rounded-lg bg-muted/40 p-4 text-sm text-muted-foreground">
            Todavía no hay asesores activos en tu empresa. Da de alta o reactiva a alguien desde
            Usuarios para poder repartir las transferencias.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead className="w-[38%]">Activas</TableHead>
                  {CARTERA.map((c) => (
                    <TableHead key={c.key} className="text-right">
                      {c.label}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Pagadas</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {secciones.flatMap((seccion) => [
                  <TableRow key={`s-${seccion.etiqueta}`} className="hover:bg-transparent">
                    <TableCell colSpan={6} className="bg-muted/40 py-1.5 text-xs font-medium text-muted-foreground">
                      {seccion.etiqueta}
                    </TableCell>
                  </TableRow>,
                  ...seccion.filas.map((fila) => (
                    <TableRow key={fila.asesorId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              fila.enLinea ? 'size-2 shrink-0 rounded-full bg-success' : 'size-2 shrink-0 rounded-full bg-border'
                            }
                            aria-hidden="true"
                          />
                          <span className="font-medium text-foreground">{fila.nombre}</span>
                          <span className="sr-only">{fila.enLinea ? '(en línea)' : '(sin conexión)'}</span>
                        </div>
                        {fila.esPrincipal && <p className="pl-4 text-xs text-muted-foreground">Principal</p>}
                        {fila.rolEmpresa === 'asesor' && (
                          <p className="pl-4 text-xs text-muted-foreground">
                            {fila.coordinadorId ? `Equipo de ${nombres.get(fila.coordinadorId) ?? 'un coordinador'}` : 'Sin coordinador'}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <CargaBar valor={fila.activas} maximo={maximo} />
                          <span className="w-6 shrink-0 text-right tabular-nums">{fila.activas}</span>
                        </div>
                      </TableCell>
                      {CARTERA.map((c) => (
                        <TableCell key={c.key} className="text-right tabular-nums">
                          {fila.porEstado[c.key] ?? 0}
                        </TableCell>
                      ))}
                      {/* Separada del resto: es la única métrica de desempeño de la fila, y mezclarla
                          con la cartera viva invitaría a sumarlas. */}
                      <TableCell className="border-l border-border text-right font-medium tabular-nums text-foreground">
                        {fila.porEstado['pagado'] ?? 0}
                      </TableCell>
                    </TableRow>
                  )),
                ])}
              </TableBody>
            </Table>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          «Activas» son las conversaciones que no están pagadas ni perdidas. El punto verde marca a
          quien tuvo actividad en los últimos 5 minutos.
        </p>
      </DialogContent>
    </Dialog>
  );
}
