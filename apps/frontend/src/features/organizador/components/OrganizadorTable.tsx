import { useLocation, useNavigate } from 'react-router-dom';
import { History, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fechaCompleta, fechaHora } from '@/features/contacts/lib/fecha';
import { etiquetaProgramacion } from '@/lib/agenda';
import { useGestionPendienteStore } from '../useGestionPendienteStore.js';
import { desdeOrganizador, nombreCliente, rutaConversacion } from '../lib/organizador.js';
import { EstadoPendienteBadge } from './EstadoPendienteBadge.js';
import type { OrganizadorPendienteDTO } from '../types.js';

interface Props {
  pendientes: OrganizadorPendienteDTO[];
  onHistorial: (p: OrganizadorPendienteDTO) => void;
  /** Filtra la tabla por este cliente. */
  onFiltrarCliente: (clienteId: string) => void;
}

/**
 * Pendientes del Organizador (HU-PDF-02 §3.2): cliente, nota, programación, estado y responsable.
 * Las acciones de cerrar y posponer solo aparecen mientras el pendiente sigue abierto.
 */
export function OrganizadorTable({ pendientes, onHistorial, onFiltrarCliente }: Props): React.ReactElement {
  const navigate = useNavigate();
  const location = useLocation();
  const abrir = useGestionPendienteStore((s) => s.abrir);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[14rem]">Cliente</TableHead>
            <TableHead className="min-w-[16rem]">Nota</TableHead>
            <TableHead className="w-[10rem]">Programado</TableHead>
            <TableHead className="w-[7rem]">Estado</TableHead>
            <TableHead className="w-[10rem]">Responsable</TableHead>
            <TableHead className="w-[1%] text-right">
              <span className="sr-only">Acciones</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pendientes.map((p) => {
            const cliente = nombreCliente(p.cliente);
            const abierto = p.estado !== 'cerrado';
            return (
              <TableRow key={p.id}>
                <TableCell className="align-top">
                  <button
                    type="button"
                    onClick={() => onFiltrarCliente(p.clienteId)}
                    title="Ver solo los pendientes de este cliente"
                    className="block max-w-full truncate text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {cliente}
                  </button>
                  {p.cliente.nombre && (
                    <span className="block truncate text-xs tabular-nums text-muted-foreground">
                      {p.cliente.telefono}
                    </span>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <p className="line-clamp-2 whitespace-pre-line text-sm">{p.descripcion}</p>
                  {p.vecesPospuesto > 0 && (
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Pospuesto {p.vecesPospuesto === 1 ? '1 vez' : `${p.vecesPospuesto} veces`}
                    </p>
                  )}
                </TableCell>
                <TableCell className="align-top text-sm tabular-nums">
                  {etiquetaProgramacion(p.programadoDia, p.programadoHora)}
                  {p.cerradoAt && (
                    <time
                      dateTime={p.cerradoAt}
                      title={fechaCompleta(p.cerradoAt)}
                      className="block text-xs text-muted-foreground"
                    >
                      Cerrado {fechaHora(p.cerradoAt).toLowerCase()}
                    </time>
                  )}
                </TableCell>
                <TableCell className="align-top">
                  <EstadoPendienteBadge estado={p.estado} />
                </TableCell>
                <TableCell className="align-top text-sm text-muted-foreground">
                  {p.responsable.nombre ?? 'Usuario eliminado'}
                </TableCell>
                <TableCell className="align-top">
                  <div className="flex items-center justify-end gap-1">
                    {abierto && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          className="h-8 motion-safe:active:scale-[0.97]"
                          onClick={() => abrir(desdeOrganizador(p), 'cerrar')}
                        >
                          Cerrar
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 motion-safe:active:scale-[0.97]"
                          onClick={() => abrir(desdeOrganizador(p), 'posponer')}
                        >
                          Posponer
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Historial del pendiente de ${cliente}`}
                      title="Ver historial"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      onClick={() => onHistorial(p)}
                    >
                      <History className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Abrir la conversación con ${cliente}`}
                      title="Abrir conversación"
                      className="size-8 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        navigate(rutaConversacion(p.clienteId, location.pathname + location.search))
                      }
                    >
                      <MessageSquare className="size-4" aria-hidden="true" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
