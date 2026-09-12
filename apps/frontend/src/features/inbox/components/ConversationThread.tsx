import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { shortTime } from '../lib/format.js';
import type { MessageDTO } from '../types.js';
import { MessageStatus } from './MessageStatus.js';

interface Props {
  messages: MessageDTO[];
  isLoading: boolean;
}

export function ConversationThread({ messages, isLoading }: Props): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll al último mensaje cuando llega uno nuevo (o al abrir el hilo).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="flex-1 space-y-4 overflow-y-auto p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={cn('flex', i % 2 === 0 ? 'justify-start' : 'justify-end')}>
            <Skeleton className="h-12 w-52 rounded-2xl" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="mx-auto flex max-w-2xl flex-col gap-2">
        {messages.map((m) => {
          const outbound = m.direccion === 'outbound';
          // Saber si respondió Sofi o una persona cambia cómo se lee el hilo: sin esta marca, el
          // asesor no distingue lo que él escribió de lo que contestó la IA por él (HU-IA-01).
          const deSofi = outbound && m.sender === 'bot';
          return (
            <div key={m.id} className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[78%] rounded-2xl px-3.5 py-2 text-sm shadow-sm',
                  outbound
                    ? 'rounded-br-sm bg-primary text-primary-foreground'
                    : 'rounded-bl-sm bg-card text-card-foreground border border-border',
                )}
              >
                {m.texto ? (
                  <p className="whitespace-pre-wrap break-words">{m.texto}</p>
                ) : (
                  <p className="italic opacity-80">[{m.tipo}]</p>
                )}
                <div
                  className={cn(
                    'mt-1 flex items-center justify-end gap-1 text-[10px]',
                    outbound ? 'text-primary-foreground/80' : 'text-muted-foreground',
                  )}
                >
                  {deSofi && (
                    <span className="mr-auto flex items-center gap-1 font-medium">
                      <Sparkles className="size-2.5" aria-hidden="true" />
                      Sofi
                    </span>
                  )}
                  <span>{shortTime(m.createdAt)}</span>
                  {outbound && <MessageStatus status={m.status} />}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
