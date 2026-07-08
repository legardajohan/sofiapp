import { useEffect, useRef } from 'react';
import { useAdminTenantsStore } from '../useAdminTenantsStore.js';
import { TenantStatusSwitch } from './TenantStatusSwitch.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  onPageChange: (page: number) => void;
  onEdit: (tenant: ITenant) => void;
}

const estadoBadgeVariant: Record<EstadoTenant, 'success' | 'secondary' | 'outline'> = {
  activo: 'success',
  suspendido: 'secondary',
  prueba: 'outline',
};

export function TenantTable({ tenants, total, page, limit, onPageChange, onEdit }: Props): React.ReactElement {
  const { setSearch } = useAdminTenantsStore();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const value = e.target.value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearch(value), 300);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const totalPages = Math.ceil(total / limit);

  return (
    <div>
      <Input
        type="text"
        placeholder="Buscar por nombre o slug…"
        onChange={handleSearch}
        className="mb-4"
      />

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
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
                  <TableCell className="text-muted-foreground">{tenant.planId ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(tenant.createdAt).toLocaleDateString('es-CO')}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => onEdit(tenant)}>
                      Editar
                    </Button>
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
