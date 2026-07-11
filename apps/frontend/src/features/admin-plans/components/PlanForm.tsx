import { useEffect, useState } from 'react';
import { Calculator, DollarSign, Info, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { formatCurrency } from '../../../lib/currency.js';
import { useExchangeRate } from '../hooks/useExchangeRate.js';
import type { CreatePlanPayload, UpdatePlanPayload, IPlan } from '../types/index.js';

interface Props {
  plan?: IPlan;
  onSuccess: (payload: CreatePlanPayload | UpdatePlanPayload) => void;
  onCancel: () => void;
}

const DESC_MAX = 500;

// Micro-interacciones sutiles (Emil): transición corta ease-out + focus ring, sin animaciones exageradas.
const inputClass =
  'w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition-shadow duration-150 ease-out placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40';

const num = (v: string): number => Number(v) || 0;

export function PlanForm({ plan, onSuccess, onCancel }: Props): React.ReactElement {
  const isEdit = Boolean(plan);
  const [form, setForm] = useState({
    nombre: plan?.nombre ?? '',
    descripcion: plan?.descripcion ?? '',
    usuarios: String(plan?.limites.usuarios ?? 0),
    administradores: String(plan?.limites.administradores ?? 1),
    mensajesMes: String(plan?.limites.mensajesMes ?? 0),
    leads: String(plan?.limites.leads ?? 0),
    campanasMes: String(plan?.limites.campanasMes ?? 0),
    precio: String(plan?.precio ?? 0),
    costoEstimado: plan?.costoEstimado !== undefined ? String(plan.costoEstimado) : '',
    activo: plan?.activo ?? true,
  });

  const { rate, estado, isLoading: rateLoading, refetch } = useExchangeRate();
  const [manualRate, setManualRate] = useState('');

  // Conversión debounced (500 ms): recalcula el equivalente en COP al dejar de escribir el precio.
  const [debouncedPrecio, setDebouncedPrecio] = useState(num(form.precio));
  useEffect(() => {
    const id = setTimeout(() => setDebouncedPrecio(num(form.precio)), 500);
    return () => clearTimeout(id);
  }, [form.precio]);

  const manualRateNum = Number(manualRate);
  const effectiveRate =
    rate ?? (Number.isFinite(manualRateNum) && manualRateNum > 0 ? manualRateNum : null);
  const copEquivalente =
    effectiveRate !== null && Number.isFinite(debouncedPrecio) ? debouncedPrecio * effectiveRate : null;

  const handleSubmit = (e: React.FormEvent): void => {
    e.preventDefault();
    const payload: CreatePlanPayload = {
      nombre: form.nombre,
      descripcion: form.descripcion.trim() || undefined,
      limites: {
        usuarios: num(form.usuarios),
        administradores: num(form.administradores),
        mensajesMes: num(form.mensajesMes),
        leads: num(form.leads),
        campanasMes: num(form.campanasMes),
      },
      precio: num(form.precio), // se envía en USD (no el convertido)
      costoEstimado: form.costoEstimado === '' ? undefined : num(form.costoEstimado),
      activo: form.activo,
    };
    onSuccess(payload);
  };

  const limitField = (
    label: string,
    key: 'usuarios' | 'administradores' | 'mensajesMes' | 'leads' | 'campanasMes',
    min = 0,
  ): React.ReactElement => (
    <div>
      <label className="mb-1 block text-sm font-medium text-foreground">{label}</label>
      <input
        type="number"
        min={min}
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
        <label className="mb-1 block text-sm font-medium text-foreground">Nombre *</label>
        <input
          className={inputClass}
          value={form.nombre}
          onChange={(e) => setForm((p) => ({ ...p, nombre: e.target.value }))}
          minLength={2}
          maxLength={60}
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">
          Descripción <span className="text-xs text-muted-foreground">(opcional)</span>
        </label>
        <textarea
          className={`${inputClass} min-h-[72px] resize-y`}
          value={form.descripcion}
          maxLength={DESC_MAX}
          placeholder="Texto comercial breve que verá el cliente en la tarjeta del plan."
          onChange={(e) => setForm((p) => ({ ...p, descripcion: e.target.value }))}
        />
        <p
          className={`mt-1 text-right text-xs ${
            form.descripcion.length >= DESC_MAX ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
          }`}
        >
          {form.descripcion.length}/{DESC_MAX}
        </p>
      </div>

      <fieldset className="grid grid-cols-2 gap-3 rounded-md border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted-foreground">Límites del plan</legend>
        {limitField('Usuarios', 'usuarios')}
        {limitField('Administradores incluidos', 'administradores', 1)}
        {limitField('Mensajes / mes', 'mensajesMes')}
        {limitField('Leads', 'leads')}
        {limitField('Campañas / mes', 'campanasMes')}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 flex items-center gap-1 text-sm font-medium text-foreground">
            Precio <span className="text-xs font-normal text-muted-foreground">(USD)</span>
          </label>
          <div className="relative">
            <DollarSign className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${inputClass} pl-8`}
              value={form.precio}
              onChange={(e) => setForm((p) => ({ ...p, precio: e.target.value }))}
              required
            />
          </div>
          <ConversionHint
            loading={rateLoading}
            rate={effectiveRate}
            estado={estado}
            copEquivalente={copEquivalente}
            manualRate={manualRate}
            onManualRateChange={setManualRate}
            onRetry={refetch}
          />
        </div>
        <div>
          <label className="mb-1 flex items-center gap-1 text-sm font-medium text-foreground">
            <Calculator className="size-4 text-muted-foreground" />
            Costo estimado de operación
            <span
              className="cursor-help text-muted-foreground"
              title="Costo interno estimado (USD) para calcular el margen. No se muestra al cliente."
            >
              <Info className="size-3.5" />
            </span>
          </label>
          <div className="relative">
            <DollarSign className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="number"
              min={0}
              step="0.01"
              className={`${inputClass} pl-8`}
              value={form.costoEstimado}
              onChange={(e) => setForm((p) => ({ ...p, costoEstimado: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-foreground">
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
          className="rounded-md border border-input px-4 py-2 text-sm text-foreground transition-transform duration-150 ease-out hover:bg-muted active:scale-[0.98]"
        >
          Cancelar
        </button>
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground transition-transform duration-150 ease-out hover:bg-primary-hover active:scale-[0.98]"
        >
          {isEdit ? 'Guardar cambios' : 'Crear plan'}
        </button>
      </div>
    </form>
  );
}

interface ConversionHintProps {
  loading: boolean;
  rate: number | null;
  estado: string | null;
  copEquivalente: number | null;
  manualRate: string;
  onManualRateChange: (value: string) => void;
  onRetry: () => void;
}

// Muestra el equivalente en COP (o el estado de carga / entrada manual si la TRM no está disponible).
function ConversionHint({
  loading,
  rate,
  estado,
  copEquivalente,
  manualRate,
  onManualRateChange,
  onRetry,
}: ConversionHintProps): React.ReactElement {
  if (loading) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Obteniendo TRM…
      </p>
    );
  }

  if (rate === null) {
    return (
      <div className="mt-1.5 space-y-1.5">
        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <TriangleAlert className="size-3.5 shrink-0" />
          No pudimos obtener la TRM. Ingresa la tasa manualmente:
        </p>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step="0.01"
            value={manualRate}
            onChange={(e) => onManualRateChange(e.target.value)}
            placeholder="COP por USD (ej: 4000)"
            className="w-40 rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground outline-none transition-shadow duration-150 ease-out focus:ring-2 focus:ring-ring/40"
          />
          <button
            type="button"
            onClick={onRetry}
            className="flex items-center gap-1 text-xs text-primary transition-transform duration-150 ease-out hover:underline active:scale-[0.98]"
          >
            <RefreshCw className="size-3" />
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
      <RefreshCw className="size-3.5 text-muted-foreground" />
      ≈ {formatCurrency(copEquivalente, 'COP')} COP
      {estado === 'STALE' && <span className="text-amber-600 dark:text-amber-400">· tasa no actualizada hoy</span>}
      {estado === 'MANUAL' && <span className="text-amber-600 dark:text-amber-400">· tasa manual</span>}
    </p>
  );
}
