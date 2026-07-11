import { Check, Coins, Crown, DollarSign, Pencil, Rocket, Trash2, Zap, type LucideIcon } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../../lib/currency.js';
import { precioEnCop } from '../pricing.js';
import type { IPlan } from '../types/index.js';

interface Props {
  plans: IPlan[];
  copRate?: number | null;
  onEdit: (plan: IPlan) => void;
  onDelete: (plan: IPlan) => void;
}

// Ícono decorativo por posición (planes ordenados por precio ascendente en el backend).
const PLAN_ICONS: LucideIcon[] = [Rocket, Zap, Crown];

function features(plan: IPlan): string[] {
  const l = plan.limites;
  return [
    `${formatNumber(l?.administradores)} administradores`,
    `${formatNumber(l?.usuarios)} usuarios`,
    `${formatNumber(l?.mensajesMes)} mensajes / mes`,
    `${formatNumber(l?.leads)} leads`,
    `${formatNumber(l?.campanasMes)} campañas / mes`,
  ];
}

export function PlanCards({ plans, copRate, onEdit, onDelete }: Props): React.ReactElement {
  if (plans.length === 0) {
    return (
      <div className="rounded-xl border border-dashed py-14 text-center text-gray-400">
        <Coins className="mx-auto mb-2 size-6 opacity-60" />
        No hay planes registrados.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {plans.map((plan, index) => {
        const Icon = PLAN_ICONS[index % PLAN_ICONS.length] ?? Rocket;
        const cop = precioEnCop(plan.precio, copRate);
        return (
          <article
            key={plan._id}
            className="flex flex-col rounded-2xl border border-gray-200 bg-white p-6 shadow-sm transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-1 hover:border-gray-300 hover:shadow-lg"
          >
            <header className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 ring-1 ring-inset ring-blue-100">
                  <Icon className="size-5" />
                </span>
                <h3 className="text-[2.75rem] font-bold leading-tight tracking-tight text-gray-900">
                  {plan.nombre}
                </h3>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  plan.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                }`}
              >
                {plan.activo ? 'activo' : 'inactivo'}
              </span>
            </header>

            {plan.descripcion && (
              <p className="mb-5 whitespace-pre-line text-sm leading-relaxed text-gray-500">
                {plan.descripcion}
              </p>
            )}

            <div className="mb-5">
              <div className="flex items-baseline gap-1.5">
                <DollarSign className="size-5 text-gray-400" />
                <span className="text-3xl font-bold tracking-tight text-gray-900">
                  {formatCurrency(plan.precio, 'USD')}
                </span>
                <span className="text-sm font-medium text-gray-400">USD</span>
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                <Coins className="size-3.5" />≈ {formatCurrency(cop, 'COP')} COP
              </p>
            </div>

            <ul className="mb-5 space-y-1.5 text-sm text-gray-600">
              {features(plan).map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-green-600" />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-auto flex justify-end gap-1 border-t border-gray-100 pt-3">
              <button
                type="button"
                aria-label="Editar"
                title="Editar"
                onClick={() => onEdit(plan)}
                className="rounded-md p-1.5 text-blue-600 transition-transform duration-150 ease-out hover:bg-blue-50 active:scale-[0.95]"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Eliminar"
                title="Eliminar"
                onClick={() => onDelete(plan)}
                className="rounded-md p-1.5 text-red-600 transition-transform duration-150 ease-out hover:bg-red-50 active:scale-[0.95]"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
