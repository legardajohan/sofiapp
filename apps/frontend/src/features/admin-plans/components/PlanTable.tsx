import { Coins, DollarSign, Pencil, Trash2, type LucideIcon } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../../lib/currency.js';
import { margenUsd, precioEnCop } from '../pricing.js';
import type { IPlan } from '../types/index.js';

interface Props {
  plans: IPlan[];
  /** TRM COP por USD para derivar el precio en COP. `null`/omitido → "Sin calcular". */
  copRate?: number | null;
  onEdit: (plan: IPlan) => void;
  onDelete: (plan: IPlan) => void;
}

interface Column {
  label: string;
  icon?: LucideIcon;
}

const COLUMNS: Column[] = [
  { label: 'Nombre' },
  { label: 'Usuarios' },
  { label: 'Administradores' },
  { label: 'Mensajes/mes' },
  { label: 'Leads' },
  { label: 'Campañas/mes' },
  { label: 'Precio USD', icon: DollarSign },
  { label: 'Precio COP', icon: Coins },
  { label: 'Margen' },
  { label: 'Estado' },
  { label: '' },
];

export function PlanTable({ plans, copRate, onEdit, onDelete }: Props): React.ReactElement {
  return (
    <div className="max-h-[70vh] overflow-auto rounded-lg border">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="sticky top-0 z-10 bg-gray-50">
          <tr>
            {COLUMNS.map(({ label, icon: Icon }) => (
              <th
                key={label || 'acciones'}
                className="px-4 py-3 text-left font-medium uppercase tracking-wider text-gray-500"
              >
                <span className="inline-flex items-center gap-1">
                  {Icon && <Icon className="size-3.5 text-gray-400" />}
                  {label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {plans.length === 0 ? (
            <tr>
              <td colSpan={COLUMNS.length} className="py-8 text-center text-gray-400">
                No hay planes registrados.
              </td>
            </tr>
          ) : (
            plans.map((plan) => {
              const margen = margenUsd(plan.precio, plan.costoEstimado);
              return (
                <tr key={plan._id} className="transition-colors duration-150 ease-out hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{plan.nombre}</td>
                  <td className="px-4 py-3 text-gray-500">{formatNumber(plan.limites?.usuarios)}</td>
                  <td className="px-4 py-3 text-gray-500">{formatNumber(plan.limites?.administradores)}</td>
                  <td className="px-4 py-3 text-gray-500">{formatNumber(plan.limites?.mensajesMes)}</td>
                  <td className="px-4 py-3 text-gray-500">{formatNumber(plan.limites?.leads)}</td>
                  <td className="px-4 py-3 text-gray-500">{formatNumber(plan.limites?.campanasMes)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {formatCurrency(plan.precio, 'USD')}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatCurrency(precioEnCop(plan.precio, copRate), 'COP')}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{formatCurrency(margen, 'USD')}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        plan.activo ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {plan.activo ? 'activo' : 'inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
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
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
