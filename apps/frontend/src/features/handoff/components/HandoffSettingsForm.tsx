import { useEffect, useState } from 'react';
import {
  ArrowRightLeft,
  HandCoins,
  HelpCircle,
  Loader2,
  MessageSquareText,
  Save,
  Tags,
  UserRoundCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useTenantUsers } from '../../users/hooks/useTenantUsers.js';
import { useSaveHandoffSettings } from '../hooks/useHandoffSettings.js';
import { TriggerCard } from './TriggerCard.js';
import { TermList } from './TermList.js';
import {
  MENSAJE_TRANSICION_MAX,
  type HandoffReglas,
  type HandoffSettings,
  type NivelMinimoInteres,
} from '../types.js';

interface HandoffSettingsFormProps {
  settings: HandoffSettings;
}

/** Valor del `Select` cuando no hay asesor fijo. Radix no admite `value=""`. */
const SIN_ASESOR_FIJO = '__primero_disponible__';

export function HandoffSettingsForm({ settings }: HandoffSettingsFormProps): React.ReactElement {
  const [activo, setActivo] = useState(settings.activo);
  const [asesorDestinoId, setAsesorDestinoId] = useState(settings.asesorDestinoId);
  const [mensajeTransicion, setMensajeTransicion] = useState(settings.mensajeTransicion);
  const [reglas, setReglas] = useState<HandoffReglas>(settings.reglas);

  const guardar = useSaveHandoffSettings();
  const { data: asesores } = useTenantUsers();

  // Tras guardar, el servidor devuelve la versión canónica: el formulario se resincroniza con ella
  // para que "descartar" vuelva a lo guardado y no a lo heredado de fábrica.
  useEffect(() => {
    setActivo(settings.activo);
    setAsesorDestinoId(settings.asesorDestinoId);
    setMensajeTransicion(settings.mensajeTransicion);
    setReglas(settings.reglas);
  }, [settings]);

  function actualizarRegla<K extends keyof HandoffReglas>(
    clave: K,
    cambios: Partial<HandoffReglas[K]>,
  ): void {
    setReglas((prev) => ({ ...prev, [clave]: { ...prev[clave], ...cambios } }));
  }

  const actual = { activo, asesorDestinoId, mensajeTransicion, reglas };
  const guardado = {
    activo: settings.activo,
    asesorDestinoId: settings.asesorDestinoId,
    mensajeTransicion: settings.mensajeTransicion,
    reglas: settings.reglas,
  };
  const hayCambios = JSON.stringify(actual) !== JSON.stringify(guardado);

  // Encender la transferencia sin ningún disparador la deja sin efecto: es un error de
  // configuración silencioso, así que se bloquea el guardado en vez de dejar que ocurra.
  const algunDisparador = Object.values(reglas).some((r) => r.activa);
  const listasNoVacias =
    (!reglas.explicitRequest.activa || reglas.explicitRequest.frases.length > 0) &&
    (!reglas.keyword.activa || reglas.keyword.palabras.length > 0);
  const esValido =
    mensajeTransicion.trim().length > 0 && (!activo || (algunDisparador && listasNoVacias));
  const puedeGuardar = hayCambios && esValido && !guardar.isPending;

  function descartar(): void {
    setActivo(settings.activo);
    setAsesorDestinoId(settings.asesorDestinoId);
    setMensajeTransicion(settings.mensajeTransicion);
    setReglas(settings.reglas);
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    if (!puedeGuardar) return;
    guardar.mutate({
      activo,
      asesorDestinoId,
      mensajeTransicion: mensajeTransicion.trim(),
      reglas,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* 1. El interruptor maestro va primero porque gobierna todo lo que viene debajo. */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <div
            className={`flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
              activo ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <ArrowRightLeft
              className={`size-4 ${activo ? 'text-primary-foreground' : 'text-secondary-foreground'}`}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0 flex-1">
            <label htmlFor="handoff-activo" className="text-base font-semibold text-foreground">
              Transferir conversaciones a una persona
            </label>
            <p id="handoff-activo-ayuda" className="mt-0.5 text-sm text-muted-foreground">
              Con esto encendido, Sofi deja de responder en el momento en que se cumple alguna de
              las condiciones de abajo y le pasa la conversación a un asesor.
            </p>
          </div>
          <Switch
            id="handoff-activo"
            checked={activo}
            onCheckedChange={setActivo}
            aria-describedby="handoff-activo-ayuda"
          />
        </div>
      </section>

      {/* 2. Los cuatro disparadores, en el mismo orden en que los evalúa el backend. */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-secondary-foreground">
          Cuándo transferir
          {activo && !algunDisparador && (
            <span className="ml-2 font-normal text-destructive">
              Elige al menos una condición.
            </span>
          )}
        </h2>

        <TriggerCard
          id="handoff-explicit"
          icon={UserRoundCheck}
          titulo="Pide hablar con una persona"
          descripcion="El cliente escribe algo como «quiero hablar con un asesor». Sofi ni siquiera intenta responder: transfiere de inmediato."
          activa={reglas.explicitRequest.activa}
          disabled={!activo}
          onToggle={(activa) => actualizarRegla('explicitRequest', { activa })}
        >
          <TermList
            id="handoff-frases"
            label="Frases que cuentan como petición"
            ayuda="Vienen unas cuantas de fábrica. Se comparan sin distinguir mayúsculas ni tildes, y solo coinciden como frase completa."
            placeholder="quiero hablar con alguien"
            terminos={reglas.explicitRequest.frases}
            onChange={(frases) => actualizarRegla('explicitRequest', { frases })}
          />
        </TriggerCard>

        <TriggerCard
          id="handoff-keyword"
          icon={Tags}
          titulo="Menciona una palabra clave"
          descripcion="Temas que prefieres que atienda siempre una persona, aunque Sofi supiera responderlos."
          activa={reglas.keyword.activa}
          disabled={!activo}
          onToggle={(activa) => actualizarRegla('keyword', { activa })}
        >
          <TermList
            id="handoff-palabras"
            label="Palabras clave"
            ayuda="Coinciden como palabra completa: «asesor» no se activa dentro de «asesoría»."
            placeholder="reclamo"
            terminos={reglas.keyword.palabras}
            onChange={(palabras) => actualizarRegla('keyword', { palabras })}
          />
        </TriggerCard>

        <TriggerCard
          id="handoff-confianza"
          icon={HelpCircle}
          titulo="Sofi no encuentra la respuesta"
          descripcion="Cuando tu base de conocimiento no cubre lo que preguntan y Sofi tendría que admitir que no sabe."
          activa={reglas.lowConfidence.activa}
          disabled={!activo}
          onToggle={(activa) => actualizarRegla('lowConfidence', { activa })}
        >
          <p className="text-xs text-muted-foreground">
            Un saludo o un «gracias» no cuentan: solo se transfiere cuando había algo que buscar y
            no se encontró. Si reescribes las instrucciones del asistente, conserva la frase con la
            que admite que no tiene información — es la señal que usa esta condición.
          </p>
        </TriggerCard>

        <TriggerCard
          id="handoff-compra"
          icon={HandCoins}
          titulo="Muestra intención de compra"
          descripcion="El cliente quiere matricularse, pagar o cerrar. Recibe la respuesta de Sofi y, en el mismo mensaje, el aviso de que ya lo atiende alguien."
          activa={reglas.intentPurchase.activa}
          disabled={!activo}
          onToggle={(activa) => actualizarRegla('intentPurchase', { activa })}
        >
          <div className="space-y-2">
            <Label htmlFor="handoff-nivel">Transferir a partir de</Label>
            <Select
              value={reglas.intentPurchase.nivelMinimo}
              onValueChange={(v) =>
                actualizarRegla('intentPurchase', { nivelMinimo: v as NivelMinimoInteres })
              }
            >
              <SelectTrigger id="handoff-nivel" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="caliente">Quiere cerrar ahora</SelectItem>
                <SelectItem value="tibio">Compara precios o condiciones</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Esta condición consulta al modelo en cada mensaje, así que consume algo más que las
              demás. «Compara precios» transfiere antes, pero también con más frecuencia.
            </p>
          </div>
        </TriggerCard>
      </div>

      {/* 3. El destino va al final: solo importa una vez que hay algún disparador encendido. */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <MessageSquareText className="size-4 text-secondary-foreground" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-foreground">Qué pasa al transferir</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              A quién le llega la conversación y qué se le dice al cliente mientras tanto.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="handoff-asesor">Asesor que la recibe</Label>
            <Select
              value={asesorDestinoId ?? SIN_ASESOR_FIJO}
              onValueChange={(v) => setAsesorDestinoId(v === SIN_ASESOR_FIJO ? null : v)}
            >
              <SelectTrigger id="handoff-asesor" className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_ASESOR_FIJO}>El primero del equipo</SelectItem>
                {(asesores ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Si la conversación ya tiene un asesor asignado, se queda con él: transferir no se la
              quita a quien la lleva.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <Label htmlFor="handoff-mensaje">Mensaje para el cliente</Label>
              <span className="text-xs tabular-nums text-muted-foreground">
                {mensajeTransicion.length.toLocaleString('es-CO')} /{' '}
                {MENSAJE_TRANSICION_MAX.toLocaleString('es-CO')}
              </span>
            </div>
            <Textarea
              id="handoff-mensaje"
              value={mensajeTransicion}
              onChange={(e) => setMensajeTransicion(e.target.value)}
              maxLength={MENSAJE_TRANSICION_MAX}
              rows={3}
              aria-describedby="handoff-mensaje-ayuda"
            />
            <p id="handoff-mensaje-ayuda" className="text-xs text-muted-foreground">
              Lo lee el cliente por WhatsApp. Evita prometer un plazo: nadie sabe todavía cuándo va
              a responder el asesor.
            </p>
          </div>
        </div>
      </section>

      <div className="flex flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
        <Button type="button" variant="ghost" disabled={!hayCambios || guardar.isPending} onClick={descartar}>
          Descartar cambios
        </Button>
        <Button type="submit" disabled={!puedeGuardar} className="sm:w-40">
          {guardar.isPending ? (
            <>
              <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Guardando
            </>
          ) : (
            <>
              <Save className="size-4" aria-hidden="true" />
              Guardar cambios
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
