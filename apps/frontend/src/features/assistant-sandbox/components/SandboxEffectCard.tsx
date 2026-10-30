import {
  CalendarClock,
  CheckCheck,
  CircleDot,
  FileSearch,
  Flag,
  Loader2,
  Tags,
  UserCheck,
  UserPlus,
  UserRoundCog,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { shortTime } from '../../inbox/lib/format.js';
import type { SandboxEfecto } from '../types.js';

/** Por qué Sofi o el flujo transfirió la conversación, en palabras de quien configura. */
const MOTIVO_HANDOFF: Record<string, string> = {
  explicit_request: 'el cliente pidió hablar con una persona',
  keyword: 'el mensaje contenía una palabra clave',
  custom: 'se cumplió una de tus condiciones',
  low_confidence: 'Sofi no tenía información suficiente',
  intent_purchase: 'el cliente mostró intención de compra',
  flujo: 'lo indicó el flujo',
  error: 'Sofi no pudo generar la respuesta',
};

const CAMPOS_EXTRAIDOS: Record<string, string> = {
  nombre: 'nombre',
  correo: 'correo',
  telefono: 'teléfono',
  interes: 'interés',
};

interface Descripcion {
  icono: LucideIcon;
  texto: string;
}

function describir(efecto: SandboxEfecto): Descripcion {
  switch (efecto.tipo) {
    case 'lead_creado':
      return { icono: UserPlus, texto: `Se creó un lead en la etapa «${efecto.estado}»` };
    case 'asignado':
      return {
        icono: UserCheck,
        texto: efecto.asesor
          ? `Se asignó la conversación a ${efecto.asesor.nombre}`
          : 'Se quitó la asignación de la conversación',
      };
    case 'etiquetas':
      return {
        icono: Tags,
        texto: efecto.nombres.length > 0 ? `Etiquetas: ${efecto.nombres.join(', ')}` : 'Se quitaron las etiquetas',
      };
    case 'estado_comercial':
      return { icono: Flag, texto: `Estado comercial: ${efecto.estado}` };
    case 'semaforo':
      return { icono: CircleDot, texto: `Semáforo: ${efecto.clave}` };
    case 'datos_extraidos': {
      const campos = Object.entries(efecto.campos)
        .map(([k, v]) => `${CAMPOS_EXTRAIDOS[k] ?? k}: ${v}`)
        .join(' · ');
      return { icono: FileSearch, texto: campos ? `Datos detectados — ${campos}` : 'Sin datos nuevos de contacto' };
    }
    case 'handoff': {
      const motivo = MOTIVO_HANDOFF[efecto.motivo] ?? efecto.motivo;
      const destino = efecto.asesor ? ` a ${efecto.asesor.nombre}` : '';
      return { icono: UserRoundCog, texto: `Se transferiría${destino} a una persona: ${motivo}` };
    }
    case 'espera':
      return {
        icono: CalendarClock,
        texto: `El flujo espera hasta las ${shortTime(efecto.hasta)}`,
      };
    case 'flujo_fin':
      return { icono: CheckCheck, texto: 'El flujo terminó' };
  }
}

interface Props {
  efecto: SandboxEfecto;
  /** Solo la última espera del hilo, mientras siga pendiente, ofrece «Avanzar ahora». */
  puedeAvanzar?: boolean;
  avanzando?: boolean;
  onAvanzar?: () => void;
}

/**
 * Lo que el sistema hizo por su cuenta durante la prueba. No es una burbuja: va centrado y en un tono
 * más bajo que los mensajes, porque no lo dijo nadie — es la consecuencia de la configuración. Sin
 * animación propia: aparecen entre mensajes que ya se animan al entrar.
 */
export function SandboxEffectCard({
  efecto,
  puedeAvanzar = false,
  avanzando = false,
  onAvanzar,
}: Props): React.ReactElement {
  const { icono: Icono, texto } = describir(efecto);

  return (
    <div className="flex justify-center" role="status">
      <div className="flex max-w-[92%] items-center gap-2 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs text-secondary-foreground">
        <Icono className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 break-words">{texto}</span>
        {efecto.tipo === 'espera' && puedeAvanzar && onAvanzar && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-1 h-6 shrink-0 px-2 text-xs transition-transform duration-150 ease-out active:scale-[0.97]"
            disabled={avanzando}
            onClick={onAvanzar}
          >
            {avanzando && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
            Avanzar ahora
          </Button>
        )}
      </div>
    </div>
  );
}
