import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { CreateTenantPayload, UpdateTenantPayload, ITenant } from '../types/index.js';

interface PlanOption {
  _id: string;
  nombre: string;
}

interface Props {
  tenant?: ITenant;
  plans?: PlanOption[];
  onSuccess: (payload: CreateTenantPayload | UpdateTenantPayload) => void;
  onCancel: () => void;
}

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

export function TenantForm({ tenant, plans, onSuccess, onCancel }: Props): React.ReactElement {
  const isEdit = Boolean(tenant);
  const [showAdmin, setShowAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  const [form, setForm] = useState({
    nombre: tenant?.nombre ?? '',
    slug: tenant?.slug ?? '',
    nit: tenant?.nit ?? '',
    contactoEmail: tenant?.contacto.email ?? '',
    contactoTelefono: tenant?.contacto.telefono ?? '',
    planId: tenant?.planId ?? '',
    adminNombre: '',
    adminEmail: '',
    adminPassword: '',
  });

  const handleNombre = (value: string): void => {
    setForm((prev) => ({
      ...prev,
      nombre: value,
      slug: isEdit ? prev.slug : toSlug(value),
    }));
  };

  useEffect(() => {
    if (tenant) {
      setForm({
        nombre: tenant.nombre,
        slug: tenant.slug,
        nit: tenant.nit ?? '',
        contactoEmail: tenant.contacto.email,
        contactoTelefono: tenant.contacto.telefono,
        planId: tenant.planId ?? '',
        adminNombre: '',
        adminEmail: '',
        adminPassword: '',
      });
    }
  }, [tenant]);

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    setAdminError(null);

    if (!isEdit) {
      // Validar que si showAdmin está activo, todos los campos del admin deben estar llenos
      if (showAdmin) {
        const adminFieldsComplete =
          form.adminNombre.trim() && form.adminEmail.trim() && form.adminPassword.trim();
        if (!adminFieldsComplete) {
          setAdminError('Complete todos los campos del administrador (nombre, email y contraseña)');
          return;
        }
      }

      const payload: CreateTenantPayload = {
        nombre: form.nombre,
        slug: form.slug,
        nit: form.nit || undefined,
        contacto: { email: form.contactoEmail, telefono: form.contactoTelefono },
        planId: form.planId || undefined,
        adminUser: showAdmin
          ? {
              nombre: form.adminNombre,
              email: form.adminEmail,
              password: form.adminPassword,
            }
          : undefined,
      };
      onSuccess(payload);
    } else {
      const payload: UpdateTenantPayload = {
        nombre: form.nombre,
        nit: form.nit || undefined,
        contacto: { email: form.contactoEmail, telefono: form.contactoTelefono },
        planId: form.planId || undefined,
      };
      onSuccess(payload);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="tenant-nombre">Nombre *</Label>
        <Input
          id="tenant-nombre"
          className="mt-1"
          value={form.nombre}
          onChange={(e) => handleNombre(e.target.value)}
          minLength={2}
          maxLength={100}
          required
        />
      </div>

      <div>
        <Label htmlFor="tenant-slug">
          Slug * {isEdit && <span className="text-xs text-muted-foreground">(no editable)</span>}
        </Label>
        <Input
          id="tenant-slug"
          className="mt-1 disabled:cursor-not-allowed"
          value={form.slug}
          onChange={(e) => !isEdit && setForm((p) => ({ ...p, slug: e.target.value }))}
          readOnly={isEdit}
          disabled={isEdit}
          pattern="^[a-z0-9\-]+$"
          required
        />
      </div>

      <div>
        <Label htmlFor="tenant-nit">NIT</Label>
        <Input
          id="tenant-nit"
          className="mt-1"
          value={form.nit}
          onChange={(e) => setForm((p) => ({ ...p, nit: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="tenant-contacto-email">Email contacto *</Label>
          <Input
            id="tenant-contacto-email"
            type="email"
            className="mt-1"
            value={form.contactoEmail}
            onChange={(e) => setForm((p) => ({ ...p, contactoEmail: e.target.value }))}
            required
          />
        </div>
        <div>
          <Label htmlFor="tenant-contacto-telefono">Teléfono *</Label>
          <Input
            id="tenant-contacto-telefono"
            className="mt-1"
            value={form.contactoTelefono}
            onChange={(e) => setForm((p) => ({ ...p, contactoTelefono: e.target.value }))}
            minLength={7}
            required
          />
        </div>
      </div>

      <div>
        <Label htmlFor="tenant-plan-id">Plan</Label>
        {plans ? (
          <select
            id="tenant-plan-id"
            className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
            value={form.planId}
            onChange={(e) => setForm((p) => ({ ...p, planId: e.target.value }))}
          >
            <option value="">Sin plan</option>
            {plans.map((p) => (
              <option key={p._id} value={p._id}>
                {p.nombre}
              </option>
            ))}
          </select>
        ) : (
          <Input
            id="tenant-plan-id"
            className="mt-1"
            value={form.planId}
            onChange={(e) => setForm((p) => ({ ...p, planId: e.target.value }))}
            placeholder="ObjectId del plan (opcional)"
          />
        )}
        {isEdit && (
          <p className="mt-1 text-xs text-muted-foreground">
            También puedes cambiar el plan desde el panel de consumo.
          </p>
        )}
      </div>

      {!isEdit && (
        <div className="border-t border-border pt-4">
          <Button type="button" variant="link" className="h-auto p-0" onClick={() => setShowAdmin((v) => !v)}>
            {showAdmin ? '▲ Ocultar' : '▼ Agregar'} administrador inicial
          </Button>

          {showAdmin && (
            <div className="mt-3 space-y-3 rounded-md bg-muted p-4">
              {adminError && (
                <div className="rounded-md border border-destructive/30 bg-destructive-subtle p-3">
                  <p className="text-sm text-destructive">{adminError}</p>
                </div>
              )}
              <div>
                <Label htmlFor="tenant-admin-nombre">Nombre *</Label>
                <Input
                  id="tenant-admin-nombre"
                  className="mt-1"
                  value={form.adminNombre}
                  onChange={(e) => setForm((p) => ({ ...p, adminNombre: e.target.value }))}
                  minLength={2}
                  required
                />
              </div>
              <div>
                <Label htmlFor="tenant-admin-email">Email *</Label>
                <Input
                  id="tenant-admin-email"
                  type="email"
                  className="mt-1"
                  value={form.adminEmail}
                  onChange={(e) => setForm((p) => ({ ...p, adminEmail: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="tenant-admin-password">Contraseña *</Label>
                <Input
                  id="tenant-admin-password"
                  type="password"
                  className="mt-1"
                  value={form.adminPassword}
                  onChange={(e) => setForm((p) => ({ ...p, adminPassword: e.target.value }))}
                  minLength={8}
                  required
                />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="submit">{isEdit ? 'Guardar cambios' : 'Crear empresa'}</Button>
      </div>
    </form>
  );
}
