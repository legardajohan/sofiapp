import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare, UserRound } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { ConversationList } from '../components/ConversationList.js';
import { ConversationThread } from '../components/ConversationThread.js';
import { InboxError } from '../components/InboxError.js';
import { ContactPanel } from '../components/ContactPanel.js';
import { MessageComposer } from '../components/MessageComposer.js';
import { WindowClosedBanner } from '../components/WindowClosedBanner.js';
import { SofiToggle } from '../components/SofiToggle.js';
import { InboxFilters } from '../components/InboxFilters.js';
import { useConversations } from '../hooks/useConversations.js';
import { useMarkRead, useSendReply, useSetSofi, useThread } from '../hooks/useThread.js';
import { useInboxRealtime } from '../hooks/useInboxRealtime.js';
import { useInboxStore } from '../useInboxStore.js';
import { initials } from '../lib/format.js';
import { errorMessage } from '../lib/errors.js';
import type { FiltroBandeja } from '../types.js';

const FILTROS: FiltroBandeja[] = ['todos', 'mios', 'sin_asignar', 'sofi'];

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

  const activeId = useInboxStore((s) => s.activeId);
  const setActiveId = useInboxStore((s) => s.setActiveId);
  const contactPanelOpen = useInboxStore((s) => s.contactPanelOpen);
  const setContactPanelOpen = useInboxStore((s) => s.setContactPanelOpen);
  const toggleContactPanel = useInboxStore((s) => s.toggleContactPanel);

  const {
    data: conversations,
    isLoading,
    isError,
    error,
    refetch: refetchConversations,
  } = useConversations(filtro);
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

  const active = useMemo(
    () => conversations?.data.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  );

  function handleSelect(id: string): void {
    setActiveId(id);
    const conv = conversations?.data.find((c) => c.id === id);
    if (conv && conv.noLeidos > 0) markRead.mutate(id);
  }

  function handleFilterChange(next: FiltroBandeja): void {
    setParams(next === 'todos' ? {} : { filtro: next });
  }

  return (
    <div className="flex h-[calc(100vh-3rem)] overflow-hidden rounded-xl border border-border bg-background">
      {/* Panel izquierdo: lista de conversaciones */}
      <div className="flex w-80 shrink-0 flex-col border-r border-border">
        <div className="border-b border-border px-4 py-3">
          <h1 className="text-sm font-semibold text-foreground">Bandeja</h1>
        </div>
        <InboxFilters value={filtro} onChange={handleFilterChange} />
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
              <div className="ml-auto flex items-center gap-1">
                <SofiToggle
                  enabled={active.iaHabilitada}
                  pending={setSofi.isPending}
                  onToggle={(v) => setSofi.mutate(v)}
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

            {threadIsError ? (
              <InboxError
                message={errorMessage(threadError, 'No se pudo cargar la conversación.')}
                onRetry={() => void refetchThread()}
              />
            ) : (
              <ConversationThread messages={thread?.data ?? []} isLoading={threadLoading} />
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
    </div>
  );
}
