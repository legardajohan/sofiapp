import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { MessageDTO } from '../types.js';
import { MediaLightbox } from './MediaLightbox.js';
import { MessageBubble } from './MessageBubble.js';

interface Props {
  messages: MessageDTO[];
  isLoading: boolean;
}

export function ConversationThread({ messages, isLoading }: Props): React.ReactElement {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [ampliada, setAmpliada] = useState<{ url: string; alt: string } | null>(null);

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
        {messages.map((m) => (
          <MessageBubble
            key={m.id}
            message={m}
            onAbrirImagen={(url, alt) => setAmpliada({ url, alt })}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      <MediaLightbox
        url={ampliada?.url ?? null}
        alt={ampliada?.alt ?? 'Imagen'}
        onClose={() => setAmpliada(null)}
      />
    </div>
  );
}
