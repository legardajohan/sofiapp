import { Pencil, Trash2 } from 'lucide-react';
import { TenantStatusSwitch } from './TenantStatusSwitch.js';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ITenant, EstadoTenant } from '../types/index.js';

interface Props {
  tenants: ITenant[];
  total: number;
  page: number;
  limit: number;
  /** Mapa planId → nombre del plan, para mostrar el nombre en vez del identificador. */
  planNameById: Map<string, string>;
  onPageChange: (page: number) => void;
  onEdit: (tenant: ITenant) => void;
  onDelete: (tenant: ITenant) => void;
}

const estadoBadgeVariant: Record<EstadoTenant, 'success' | 'secondary' | 'outline'> = {
  activo: 'success',
  suspendido: 'secondary',
  prueba: 'outline',
};

export function TenantTable({
  tenants,
  total,
  page,
  limit,
  planNameById,
  onPageChange,
  onEdit,
  onDelete,
}: Props): React.ReactElement {
  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <div className="max-h-[70vh] overflow-auto rounded-lg border border-border bg-card shadow-card">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Creado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tenants.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No hay empresas registradas.
                </TableCell>
              </TableRow>
            ) : (
              tenants.map((tenant) => (
                <TableRow key={tenant._id}>
                  <TableCell className="font-medium text-foreground">{tenant.nombre}</TableCell>
                  <TableCell className="text-muted-foreground">{tenant.slug}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Badge variant={estadoBadgeVariant[tenant.estado]}>{tenant.estado}</Badge>
                      <TenantStatusSwitch tenant={tenant} />
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {tenant.planId ? (planNameById.get(tenant.planId) ?? tenant.planId) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(tenant.createdAt).toLocaleDateString('es-CO')}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Editar"
                        title="Editar"
                        onClick={() => onEdit(tenant)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Eliminar"
                            title="Eliminar"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Eliminar la empresa "{tenant.nombre}"?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se borrarán también sus usuarios, clientes y datos asociados. Esta
                              acción no se puede deshacer.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onDelete(tenant)}>
                              Eliminar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {total} empresa{total !== 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              Anterior
            </Button>
            <span className="px-2 text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
