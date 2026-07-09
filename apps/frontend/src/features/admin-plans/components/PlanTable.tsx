import type { IPlan } from '../types/index.js';

interface Props {
  plans: IPlan[];
  onEdit: (plan: IPlan) => void;
}

const fmt = (n: number): string => n.toLocaleString('es-CO');

export function PlanTable({ plans, onEdit }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {['Nombre', 'Usuarios', 'Mensajes/mes', 'Leads', 'Campañas/mes', 'Precio', 'Margen', 'Estado', ''].map(
              (h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left font-medium text-gray-500 uppercase tracking-wider"
                >
                  {h}
                </th>
              )
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {plans.length === 0 ? (
            <tr>
              <td colSpan={9} className="py-8 text-center text-gray-400">
                No hay planes registrados.
              </td>
            </tr>
          ) : (
            plans.map((plan) => {
              const margen = plan.precio - (plan.costoEstimado ?? 0);
              return (
                <tr key={plan._id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{plan.nombre}</td>
                  <td className="px-4 py-3 text-gray-500">{fmt(plan.limites.usuarios)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmt(plan.limites.mensajesMes)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmt(plan.limites.leads)}</td>
                  <td className="px-4 py-3 text-gray-500">{fmt(plan.limites.campanasMes)}</td>
                  <td className="px-4 py-3 text-gray-500">${fmt(plan.precio)}</td>
                  <td className="px-4 py-3 text-gray-500">${fmt(margen)}</td>
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
                    <button
                      onClick={() => onEdit(plan)}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      Editar
                    </button>
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
