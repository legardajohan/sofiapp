import { useState, useEffect } from 'react';
import type { CreateTenantPayload, UpdateTenantPayload, ITenant } from '../types/index.js';

interface Props {
  tenant?: ITenant;
  onSuccess: (payload: CreateTenantPayload | UpdateTenantPayload) => void;
  onCancel: () => void;
}

const toSlug = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

export function TenantForm({ tenant, onSuccess, onCancel }: Props) {
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

  const inputClass =
    'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
        <input
          className={inputClass}
          value={form.nombre}
          onChange={(e) => handleNombre(e.target.value)}
          minLength={2}
          maxLength={100}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Slug * {isEdit && <span className="text-gray-400 text-xs">(no editable)</span>}
        </label>
        <input
          className={`${inputClass} ${isEdit ? 'bg-gray-100 cursor-not-allowed' : ''}`}
          value={form.slug}
          onChange={(e) => !isEdit && setForm((p) => ({ ...p, slug: e.target.value }))}
          readOnly={isEdit}
          pattern="^[a-z0-9\-]+$"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">NIT</label>
        <input
          className={inputClass}
          value={form.nit}
          onChange={(e) => setForm((p) => ({ ...p, nit: e.target.value }))}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email contacto *</label>
          <input
            type="email"
            className={inputClass}
            value={form.contactoEmail}
            onChange={(e) => setForm((p) => ({ ...p, contactoEmail: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Teléfono *</label>
          <input
            className={inputClass}
            value={form.contactoTelefono}
            onChange={(e) => setForm((p) => ({ ...p, contactoTelefono: e.target.value }))}
            minLength={7}
            required
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Plan ID</label>
        <input
          className={inputClass}
          value={form.planId}
          onChange={(e) => setForm((p) => ({ ...p, planId: e.target.value }))}
          placeholder="ObjectId del plan (opcional)"
        />
      </div>

      {!isEdit && (
        <div className="border-t pt-4">
          <button
            type="button"
            onClick={() => setShowAdmin((v) => !v)}
            className="text-sm text-blue-600 hover:underline"
          >
            {showAdmin ? '▲ Ocultar' : '▼ Agregar'} administrador inicial
          </button>

          {showAdmin && (
            <div className="mt-3 space-y-3 rounded-md bg-blue-50 p-4">
              {adminError && (
                <div className="rounded-md bg-red-100 border border-red-300 p-3">
                  <p className="text-sm text-red-800">{adminError}</p>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre *
                </label>
                <input
                  className={inputClass}
                  value={form.adminNombre}
                  onChange={(e) => setForm((p) => ({ ...p, adminNombre: e.target.value }))}
                  minLength={2}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email *
                </label>
                <input
                  type="email"
                  className={inputClass}
                  value={form.adminEmail}
                  onChange={(e) => setForm((p) => ({ ...p, adminEmail: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contraseña *
                </label>
                <input
                  type="password"
                  className={inputClass}
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
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-4 py-2 text-sm hover:bg-gray-50"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          {isEdit ? 'Guardar cambios' : 'Crear empresa'}
        </button>
      </div>
    </form>
  );
}
