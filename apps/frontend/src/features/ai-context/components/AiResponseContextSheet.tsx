import { FileText, Library } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAiContextStore } from '../store/useAiContextStore.js';
import { useAiResponseContext } from '../hooks/useAiResponseContext.js';
import { METHOD_LABEL, formatDateTime, formatDuration } from '../lib/format.js';

function Metadato({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium text-foreground">{value}</dd>
    </div>
  );
}

export function AiResponseContextSheet(): React.ReactElement {
  const selectedId = useAiContextStore((s) => s.selectedId);
  const select = useAiContextStore((s) => s.select);
  const { data, isLoading, isError } = useAiResponseContext(selectedId);

  return (
    <Sheet open={selectedId !== null} onOpenChange={(open) => !open && select(null)}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {isLoading ? (
          <div className="space-y-4 pt-2">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : isError || !data ? (
          <div className="pt-10 text-center">
            <p className="text-sm text-destructive">No se pudo cargar el contexto de la respuesta.</p>
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Contexto de la respuesta</SheetTitle>
              <SheetDescription>
                {METHOD_LABEL[data.method]} · {formatDateTime(data.createdAt)}
              </SheetDescription>
            </SheetHeader>

            <dl className="mt-5 grid grid-cols-2 gap-4 border-b border-border pb-5">
              <Metadato label="Modelo" value={data.model} />
              <Metadato
                label="Versión de la KB"
                value={data.kbVersion === null ? '—' : `v${data.kbVersion}`}
              />
              <Metadato label="Duración" value={formatDuration(data.durationMs)} />
              <Metadato
                label="Tokens"
                value={`${data.tokens.total} (${data.tokens.prompt} + ${data.tokens.completion})`}
              />
              <div className="col-span-2 flex items-center gap-1.5">
                {data.fromFaq && <Badge variant="secondary">Respondida por FAQ</Badge>}
                {!data.fromFaq && data.cacheHit && <Badge variant="outline">Servida desde caché</Badge>}
                {!data.fromFaq && !data.cacheHit && <Badge>Generada por el modelo</Badge>}
              </div>
            </dl>

            {!data.contextAvailable ? (
              <div className="mt-6 rounded-lg border border-dashed border-border px-4 py-8 text-center">
                <p className="text-sm font-medium text-foreground">
                  No hay contexto registrado para esta respuesta
                </p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                  Es una respuesta anterior a esta función, o su registro de contexto no llegó a
                  guardarse.
                </p>
              </div>
            ) : (
              <Tabs defaultValue="prompt" className="mt-5">
                <TabsList className="w-full">
                  <TabsTrigger value="prompt" className="flex-1 gap-1.5">
                    <FileText className="size-3.5" aria-hidden="true" />
                    Prompt
                  </TabsTrigger>
                  <TabsTrigger value="fuentes" className="flex-1 gap-1.5">
                    <Library className="size-3.5" aria-hidden="true" />
                    Fuentes ({data.retrievedChunks.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="prompt">
                  {data.promptSnapshot ? (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Versión {data.promptSnapshot.version} — vigente al momento de generar esta
                        respuesta.
                      </p>
                      <ScrollArea className="h-64 rounded-lg border border-border bg-muted/30 p-3">
                        <p className="whitespace-pre-wrap text-sm text-foreground">
                          {data.promptSnapshot.systemPrompt}
                        </p>
                      </ScrollArea>
                    </div>
                  ) : (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No se guardó el prompt de esta respuesta.
                    </p>
                  )}
                </TabsContent>

                <TabsContent value="fuentes">
                  {data.retrievedChunks.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center">
                      <p className="text-sm font-medium text-foreground">
                        Ningún fragmento de la base de conocimiento respaldó esta respuesta
                      </p>
                      <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
                        La recuperación de conocimiento (RAG) todavía no está conectada a las
                        respuestas del chat.
                      </p>
                    </div>
                  ) : (
                    <ScrollArea className="h-64">
                      <ul className="space-y-2">
                        {data.retrievedChunks.map((chunk, i) => (
                          <li
                            key={`${chunk.documentId}-${i}`}
                            className="rounded-lg border border-border p-3"
                          >
                            <p className="text-sm text-foreground">{chunk.texto}</p>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <span className="truncate text-xs text-muted-foreground">
                                Documento {chunk.documentId}
                              </span>
                              {chunk.score !== undefined && (
                                <Badge variant="outline" className="shrink-0">
                                  {(chunk.score * 100).toFixed(0)}%
                                </Badge>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  )}
                </TabsContent>
              </Tabs>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
