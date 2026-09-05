import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, Target, UserPlus, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConversationList } from '../components/ConversationList.js';
import { ConversationThread } from '../components/ConversationThread.js';
import { InboxError } from '../components/InboxError.js';
import { ContactPanel } from '../components/ContactPanel.js';
import { MessageComposer } from '../components/MessageComposer.js';
import { WindowClosedBanner } from '../components/WindowClosedBanner.js';
import { HandoffBanner } from '../components/HandoffBanner.js';
import { SofiToggle } from '../components/SofiToggle.js';
import { AssignMenu } from '../components/AssignMenu.js';
import { InboxFilters } from '../components/InboxFilters.js';
import { TagChip } from '@/features/tags/components/TagChip';
import { TagSelector } from '@/features/tags/components/TagSelector';
import { ConvertToLeadDialog } from '@/features/leads/components/ConvertToLeadDialog';
import { useCreateLead } from '@/features/leads/hooks/useCreateLead';
import { leadIdEnConflicto } from '@/features/leads/lib/errors';
import { useConversations } from '../hooks/useConversations.js';
import { useContactHistory, useGenerateSummary } from '../hooks/useContactHistory.js';
import { useSetConversationTags } from '../hooks/useConversationTags.js';
import { useMarkRead, useSendReply, useSetSofi, useThread } from '../hooks/useThread.js';
import { useInboxRealtime } from '../hooks/useInboxRealtime.js';
import { useInboxStore } from '../useInboxStore.js';
import { useConversationOverview } from '../hooks/useConversationOverview.js';
import { useAplicarSemaforo } from '../hooks/useAplicarSemaforo.js';
import {
  ConversationSummaryStrip,
  ConversationSummaryStripSkeleton,
} from '../components/ConversationSummaryStrip.js';
import { IntentStrip } from '../components/IntentStrip.js';
import { initials } from '../lib/format.js';
import { errorMessage } from '../lib/errors.js';
import type { EstadoComercial, FiltroBandeja } from '../types.js';
import type { FuenteInicial } from '@/features/leads/components/ConvertToLeadDialog';

const FILTROS: FiltroBandeja[] = ['todos', 'mios', 'sin_asignar', 'sofi'];
const ESTADOS: EstadoComercial[] = ['nuevo', 'en_gestion', 'pago_pendiente', 'pagado', 'perdido'];

function EmptyThread(): React.ReactElement {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <MessageSquare className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">Selecciona una conversación</p>
      <p className="text-xs text-muted-foreground">Elige un chat de la lista para ver el hilo.</p>
    </div>
  );
}

export function InboxPage(): React.ReactElement {
  useInboxRealtime();

  const [params, setParams] = useSearchParams();
  const rawFiltro = params.get('filtro');
  const filtro: FiltroBandeja = FILTROS.includes(rawFiltro as FiltroBandeja)
    ? (rawFiltro as FiltroBandeja)
    : 'todos';
  const asignadoA = params.get('asignadoA') ?? undefined;
  const rawEstado = params.get('estado');
  const estado: EstadoComercial | undefined = ESTADOS.includes(rawEstado as EstadoComercial)
    ? (rawEstado as EstadoComercial)
    : undefined;
  const etiqueta = params.get('etiqueta') ?? undefined;

  const activeId = useInboxStore((s) => s.activeId);
  const setActiveId = useInboxStore((s) => s.setActiveId);
  const contactPanelOpen = useInboxStore((s) => s.contactPanelOpen);
  const setContactPanelOpen = useInboxStore((s) => s.setContactPanelOpen);
  const toggleContactPanel = useInboxStore((s) => s.toggleContactPanel);
  const resumenExpandido = useInboxStore((s) => s.resumenExpandido);
  const toggleResumen = useInboxStore((s) => s.toggleResumen);

  // Filtros combinables (OMNI-02) + etiqueta (OMNI-04) + estados de error (OMNI-03).
  const {
    data: conversations,
    isLoading,
    isError,
    error,
    refetch: refetchConversations,
  } = useConversations({ filtro, asignadoA, estado, etiqueta });
  const {
    data: thread,
    isLoading: threadLoading,
    isError: threadIsError,
    error: threadError,
    refetch: refetchThread,
  } = useThread(activeId);

  const markRead = useMarkRead();
  const sendReply = useSendReply(activeId);
  const setSofi = useSetSofi(activeId ?? '');
  const setTags = useSetConversationTags(activeId);

  const active = useMemo(
    () => conversations?.data.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  // ─── Conversión en lead (HU-CRM-01) ───────────────────────────────────────────
  const [leadDialogOpen, setLeadDialogOpen] = useState(false);
  const [leadDuplicado, setLeadDuplicado] = useState<string | null>(null);

  /** Ante un 409 el diálogo se cierra y la ficha se abre en el lead que ya existía. */
  function verLeadExistente(): void {
    setLeadDialogOpen(false);
    setLeadDuplicado(null);
    setContactPanelOpen(true);
  }

  const crearLead = useCreateLead(activeId, { onDuplicado: verLeadExistente });

  // La ficha se consulta también con el diálogo abierto: de ahí salen los `datosExtraidos` con los
  // que se pre-rellena el lead. Comparte `queryKey` con `ContactPanel`, así que si la ficha ya
  // estaba abierta esto no dispara una segunda petición, y con ambos cerrados no consulta nada.
  const ficha = useContactHistory(contactPanelOpen || leadDialogOpen ? activeId : null);
  // Vista unificada (HU-IA-04): resumen y permisos de la conversación activa. Va aparte del hilo
  // porque solo cambia cuando cambia la conversación, no con cada mensaje entrante.
  const overview = useConversationOverview(activeId);
  const generarResumen = useGenerateSummary(activeId);
  const aplicarSemaforo = useAplicarSemaforo(activeId);
  const extraidos = ficha.data?.datosExtraidos ?? null;

  // Campo a campo: la extracción manda en lo que sí encontró y la conversación cubre el resto.
  // Un `nombreCompleto` nulo no debe borrar el nombre que ya trae la conversación.
  const leadInicial = {
    nombre: extraidos?.nombreCompleto ?? active?.nombre ?? null,
    telefono: extraidos?.telefono ?? active?.telefono ?? '',
    correo: extraidos?.correo ?? null,
  };
  const leadFuente: FuenteInicial = ficha.isLoading ? 'cargando' : extraidos ? 'ia' : 'conversacion';

  function abrirConversion(): void {
    setLeadDuplicado(null);
    setLeadDialogOpen(true);
  }

  function handleSelect(id: string): void {
    setActiveId(id);
    const conv = conversations?.data.find((c) => c.id === id);
    if (conv && conv.noLeidos > 0) markRead.mutate(id);
  }

  function updateParams(patch: Record<string, string | undefined>): void {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    }
    setParams(next);
  }

  function handleFilterChange(next: FiltroBandeja): void {
    updateParams({ filtro: next === 'todos' ? undefined : next });
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden rounded-xl border border-border bg-background">
      {/* Panel izquierdo: lista de conversaciones */}
      <div className="flex w-80 shrink-0 flex-col border-r border-border">
        <div className="border-b border-border px-4 py-3">
          <h1 className="text-sm font-semibold text-foreground">Bandeja</h1>
        </div>
        <InboxFilters
          value={filtro}
          onChange={handleFilterChange}
          asignadoA={asignadoA}
          onAsignadoAChange={(v) => updateParams({ asignadoA: v })}
          estado={estado}
          onEstadoChange={(v) => updateParams({ estado: v })}
          etiqueta={etiqueta}
          onEtiquetaChange={(v) => updateParams({ etiqueta: v })}
        />
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            conversations={conversations?.data ?? []}
            activeId={activeId}
            onSelect={handleSelect}
            isLoading={isLoading}
            error={
              isError ? errorMessage(error, 'No se pudieron cargar las conversaciones.') : null
            }
            onRetry={() => void refetchConversations()}
          />
        </div>
      </div>

      {/* Columna central: hilo de la conversación activa. `min-w-0` para que se encoja al
          desplegar la ficha en vez de desbordar la fila y romper los `truncate`. */}
      <div className="flex min-w-0 flex-1 flex-col">
        {active ? (
          <>
            <header className="flex items-center gap-3 border-b border-border px-4 py-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="text-xs font-medium text-muted-foreground">
                  {initials(active.nombre, active.telefono)}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">
                  {active.nombre ?? active.telefono}
                </p>
                <p className="truncate text-xs text-muted-foreground">{active.telefono}</p>
              </div>
              {/* `gap-2`: intermedio entre el `gap-1` de OMNI-03 y el `gap-3` de OMNI-02, ahora
                  que la cabecera aloja tres controles en vez de dos. */}
              <div className="ml-auto flex items-center gap-2">
                <SofiToggle
                  enabled={active.iaHabilitada}
                  pending={setSofi.isPending}
                  onToggle={(v) => setSofi.mutate(v)}
                />
                <TagSelector
                  aplicadas={active.tags}
                  pending={setTags.isPending}
                  onChange={(tagIds) => setTags.mutate(tagIds)}
                />
                {/* Ya convertida: se muestra el estado en vez de repetir la acción. Ofrecerla
                    invitaría a un 409 evitable, y el 409 es red de seguridad, no prevención. */}
                {active.leadId ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setContactPanelOpen(true)}
                  >
                    <Target className="h-4 w-4" />
                    Lead creado
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={abrirConversion}>
                    <UserPlus className="h-4 w-4" />
                    Convertir en lead
                  </Button>
                )}
                <AssignMenu
                  conversationId={active.id}
                  asignadoA={active.asignadoA}
                  asignadoANombre={active.asignadoANombre}
                />
                {/* Único control de la ficha: abre y colapsa. Marcado como interruptor para que
                    el estado activo se vea, y no parezca que abre algo nuevo cada vez. */}
                <Button
                  variant={contactPanelOpen ? 'secondary' : 'ghost'}
                  size="icon"
                  aria-expanded={contactPanelOpen}
                  aria-label={
                    contactPanelOpen ? 'Colapsar la ficha del contacto' : 'Ver ficha del contacto'
                  }
                  title={contactPanelOpen ? 'Colapsar la ficha' : 'Ficha del contacto'}
                  onClick={toggleContactPanel}
                >
                  <UserRound className="h-4 w-4" />
                </Button>
              </div>
            </header>

            {/* Las etiquetas aplicadas, visibles y quitables sin abrir el menú: es la acción más
                frecuente una vez etiquetada la conversación. */}
            {active.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2">
                {active.tags.map((tag) => (
                  <TagChip
                    key={tag.id}
                    tag={tag}
                    onRemove={
                      setTags.isPending
                        ? undefined
                        : () =>
                            setTags.mutate(
                              active.tags.filter((t) => t.id !== tag.id).map((t) => t.id),
                            )
                    }
                  />
                ))}
              </div>
            )}

            {/* Resumen sobre el hilo (HU-IA-04). Se pinta aunque no haya etiquetas: es una de las
                tres piezas que la vista tiene que mostrar, no un accesorio de las etiquetas. */}
            {overview.isPending ? (
              <ConversationSummaryStripSkeleton />
            ) : overview.data ? (
              <ConversationSummaryStrip
                resumen={overview.data.resumen}
                puedeVer={overview.data.permisos.verResumen}
                puedeGenerar={overview.data.permisos.generarResumen}
                expandido={!!resumenExpandido[active.id]}
                onToggle={() => toggleResumen(active.id)}
                pending={generarResumen.isPending}
                onGenerate={() => generarResumen.mutate()}
              />
            ) : null}

            {/* Intención de compra (HU-IA-05), bajo el resumen. No lleva skeleton propio: el de
                arriba ya dice que el overview está cargando, y dos marcadores para una sola
                petición serían ruido. Se pinta sola o no se pinta. */}
            <IntentStrip
              semaforoIA={overview.data?.semaforoIA ?? null}
              pending={aplicarSemaforo.isPending}
              onApply={() => aplicarSemaforo.mutate()}
            />

            {threadIsError ? (
              <InboxError
                message={errorMessage(threadError, 'No se pudo cargar la conversación.')}
                onRetry={() => void refetchThread()}
              />
            ) : (
              <ConversationThread messages={thread?.data ?? []} isLoading={threadLoading} />
            )}

            {active.handoff && (
              <HandoffBanner
                motivo={active.handoff.motivo}
                at={active.handoff.at}
                condicion={active.handoff.condicion}
              />
            )}
            {!active.ventana24hAbierta && <WindowClosedBanner />}
            <MessageComposer
              disabled={!active.ventana24hAbierta}
              pending={sendReply.isPending}
              onSend={(texto) => sendReply.mutate(texto)}
            />
          </>
        ) : (
          <EmptyThread />
        )}
      </div>

      {/* Tercera columna: la ficha vive fuera del hilo para poder colapsarse a una franja sin
          taparlo. Solo tiene sentido con una conversación activa. */}
      {active && (
        <ContactPanel
          clienteId={activeId}
          open={contactPanelOpen}
          onOpenChange={setContactPanelOpen}
        />
      )}

      {/* Fuera de la cabecera y de cualquier menú: dentro se desmontaría al cerrarse el contenedor.
          El `onSuccess` por llamada es lo que deja el diálogo abierto cuando el backend responde
          409, para que el asesor pueda corregir el teléfono sin volver a empezar. */}
      {active && (
        <ConvertToLeadDialog
          open={leadDialogOpen}
          pending={crearLead.isPending}
          inicial={leadInicial}
          fuente={leadFuente}
          duplicado={leadDuplicado}
          onOpenChange={(open) => {
            setLeadDialogOpen(open);
            if (!open) setLeadDuplicado(null);
          }}
          onSubmit={(valores) => {
            setLeadDuplicado(null);
            crearLead.mutate(
              { ...valores, clienteId: active.id },
              {
                onSuccess: () => {
                  setLeadDialogOpen(false);
                  setContactPanelOpen(true);
                },
                onError: (error) => {
                  const yaExiste = leadIdEnConflicto(error);
                  if (yaExiste) {
                    setLeadDuplicado(
                      'Ya existe un lead con ese teléfono. Corrígelo o abre el lead existente.',
                    );
                  }
                },
              },
            );
          }}
        />
      )}
    </div>
  );
}
