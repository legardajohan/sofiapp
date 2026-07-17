import { Check, Coins, Crown, DollarSign, Pencil, Rocket, Trash2, Zap, type LucideIcon } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../../lib/currency.js';
import { precioEnCop } from '../pricing.js';
import { PERIODICIDAD_LABELS, type IPlan } from '../types/index.js';

// Clase del efecto de borde luminoso según periodicidad. Solo semestral/anual lo llevan; el anual
// usa una variante propia (paleta distinta, más brillante y con hover más marcado). '' = sin efecto.
function glowClass(periodicidad: IPlan['periodicidad']): string {
  if (periodicidad === 'anual') return 'plan-card-glow plan-card--anual';
  if (periodicidad === 'semestral') return 'plan-card-glow';
  return '';
}

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
      <div className="rounded-xl border border-dashed border-border py-14 text-center text-muted-foreground">
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
            className={`flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-1 hover:border-muted-foreground/30 hover:shadow-lg ${glowClass(
              plan.periodicidad,
            )}`}
          >
            <header className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-inset ring-primary/20">
                  <Icon className="size-5" />
                </span>
                <h3 className="text-[2.75rem] font-bold leading-tight tracking-tight text-foreground">
                  {plan.nombre}
                </h3>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  plan.activo ? 'bg-success-subtle text-success' : 'bg-muted text-muted-foreground'
                }`}
              >
                {plan.activo ? 'activo' : 'inactivo'}
              </span>
            </header>

            {plan.descripcion && (
              <p className="mb-5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                {plan.descripcion}
              </p>
            )}

            <div className="mb-5">
              <div className="flex items-baseline gap-1.5">
                <DollarSign className="size-5 text-muted-foreground" />
                <span className="text-3xl font-bold tracking-tight text-foreground">
                  {formatCurrency(plan.precio, 'USD')}
                </span>
                <span className="text-sm font-medium text-muted-foreground">USD</span>
                {plan.periodicidad && (
                  <span className="text-sm font-medium text-muted-foreground">
                    / {PERIODICIDAD_LABELS[plan.periodicidad].toLowerCase()}
                  </span>
                )}
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <Coins className="size-3.5" />≈ {formatCurrency(cop, 'COP')} COP
              </p>
            </div>

            <ul className="mb-5 space-y-1.5 text-sm text-muted-foreground">
              {features(plan).map((feature) => (
                <li key={feature} className="flex items-center gap-2">
                  <Check className="size-4 shrink-0 text-success" />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="mt-auto flex justify-end gap-1 border-t border-border pt-3">
              <button
                type="button"
                aria-label="Editar"
                title="Editar"
                onClick={() => onEdit(plan)}
                className="rounded-md p-1.5 text-primary transition-transform duration-150 ease-out hover:bg-primary/10 active:scale-[0.95]"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Eliminar"
                title="Eliminar"
                onClick={() => onDelete(plan)}
                className="rounded-md p-1.5 text-destructive transition-transform duration-150 ease-out hover:bg-destructive/10 active:scale-[0.95]"
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
