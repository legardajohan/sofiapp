import { useState } from 'react';
import type { CreatePlanPayload, UpdatePlanPayload, IPlan } from '../types/index.js';

interface Props {
  plan?: IPlan;
  onSuccess: (payload: CreatePlanPayload | UpdatePlanPayload) => void;
  onCancel: () => void;
}

const inputClass =
  'w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export function PlanForm({ plan, onSuccess, onCancel }: Props) {
  const isEdit = Boolean(plan);
  const [form, setForm] = useState({
    nombre: plan?.nombre ?? '',
    usuarios: String(plan?.limites.usuarios ?? 0),
    mensajesMes: String(plan?.limites.mensajesMes ?? 0),
    leads: String(plan?.limites.leads ?? 0),
    campanasMes: String(plan?.limites.campanasMes ?? 0),
    precio: String(plan?.precio ?? 0),
    costoEstimado: plan?.costoEstimado !== undefined ? String(plan.costoEstimado) : '',
    activo: plan?.activo ?? true,
  });

  const num = (v: string): number => Number(v) || 0;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const payload: CreatePlanPayload = {
      nombre: form.nombre,
      limites: {
        usuarios: num(form.usuarios),
        mensajesMes: num(form.mensajesMes),
        leads: num(form.leads),
        campanasMes: num(form.campanasMes),
      },
      precio: num(form.precio),
      costoEstimado: form.costoEstimado === '' ? undefined : num(form.costoEstimado),
      activo: form.activo,
    };
    onSuccess(payload);
  };

  const limitField = (label: string, key: 'usuarios' | 'mensajesMes' | 'leads' | 'campanasMes') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="number"
        min={0}
        className={inputClass}
        value={form[key]}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        required
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
        <input
          className={inputClass}
          value={form.nombre}
          onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
          minLength={2}
          maxLength={60}
          required
        />
      </div>

      <fieldset className="grid grid-cols-2 gap-3 rounded-md border p-3">
        <legend className="px-1 text-xs font-medium text-gray-500">Límites del plan</legend>
        {limitField('Usuarios', 'usuarios')}
        {limitField('Mensajes / mes', 'mensajesMes')}
        {limitField('Leads', 'leads')}
        {limitField('Campañas / mes', 'campanasMes')}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Precio *</label>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={form.precio}
            onChange={(e) => setForm((p) => ({ ...p, precio: e.target.value }))}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Costo estimado <span className="text-gray-400 text-xs">(opcional)</span>
          </label>
          <input
            type="number"
            min={0}
            className={inputClass}
            value={form.costoEstimado}
            onChange={(e) => setForm((p) => ({ ...p, costoEstimado: e.target.value }))}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={form.activo}
          onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))}
        />
        Plan activo
      </label>

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
          {isEdit ? 'Guardar cambios' : 'Crear plan'}
        </button>
      </div>
    </form>
  );
}
