import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { TagChip } from '@/features/tags/components/TagChip';
import { SensitiveValue } from '@/features/contacts/components/SensitiveValue';
import { initials, shortTime } from '../lib/format.js';
import type { ContactCardDTO } from '../types.js';

const ESTADO_LABEL: Record<string, string> = {
  nuevo: 'Nuevo',
  en_gestion: 'En gestión',
  pago_pendiente: 'Pago pendiente',
  pagado: 'Pagado',
  perdido: 'Perdido',
};

const NIVEL_LABEL: Record<string, string> = {
  frio: 'Frío',
  tibio: 'Tibio',
  caliente: 'Caliente',
};

function Field({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-right text-xs font-medium text-foreground">{value}</dd>
    </div>
  );
}

/** Misma fila que `Field`, pero el valor pasa por el tratamiento de dato sensible (HU-CRM-02). */
function SensitiveField({
  label,
  value,
  oculto,
}: {
  label: string;
  value: string | null;
  oculto: boolean;
}): React.ReactElement {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-right text-xs">
        <SensitiveValue valor={value} oculto={oculto} />
      </dd>
    </div>
  );
}

export function ContactCard({ contacto }: { contacto: ContactCardDTO }): React.ReactElement {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar className="h-11 w-11">
          <AvatarFallback className="text-sm font-medium text-muted-foreground">
            {initials(contacto.nombre, contacto.telefono)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {contacto.nombre ?? contacto.telefono}
          </p>
          <p className="truncate text-xs text-muted-foreground">{contacto.telefono}</p>
        </div>
        <Badge variant="secondary" className="ml-auto shrink-0 capitalize">
          {contacto.canalOrigen}
        </Badge>
      </div>

      <dl className="space-y-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        <Field label="Estado" value={ESTADO_LABEL[contacto.estadoComercial] ?? contacto.estadoComercial} />
        {/* Correo y documento (HU-CRM-02): se muestran siempre, en claro o enmascarados, para que
            la ausencia del dato y la falta de permiso no se confundan. */}
        <SensitiveField label="Correo" value={contacto.correo} oculto={!contacto.puedeVerSensibles} />
        <SensitiveField
          label="Documento"
          value={contacto.documento}
          oculto={!contacto.puedeVerSensibles}
        />
        {contacto.nivelInteres && (
          <Field label="Interés" value={NIVEL_LABEL[contacto.nivelInteres] ?? contacto.nivelInteres} />
        )}
        {contacto.objecionPrincipal && (
          <Field label="Objeción" value={contacto.objecionPrincipal} />
        )}
        <Field label="Cliente desde" value={shortTime(contacto.createdAt)} />
      </dl>

      {contacto.atributos.length > 0 && (
        <dl className="space-y-1.5 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
          {contacto.atributos.map((atributo) => (
            <SensitiveField
              key={atributo.key}
              label={atributo.label}
              value={atributo.valor}
              oculto={atributo.oculto}
            />
          ))}
        </dl>
      )}

      {contacto.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {/* `TagChip` es el único punto que pinta el color del tenant y garantiza su contraste;
              es el mismo componente que usa la lista de conversaciones para estas etiquetas. */}
          {contacto.tags.map((tag) => (
            <TagChip key={tag.id} tag={tag} />
          ))}
        </div>
      )}
    </section>
  );
}
