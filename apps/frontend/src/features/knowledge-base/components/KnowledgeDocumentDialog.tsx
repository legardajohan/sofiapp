import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { isVirtualPresetId, nextVersion } from '../lib/kb-presets.js';
import type { IKbDocument } from '../types/index.js';
import { KnowledgeUploadEditor } from './KnowledgeUploadEditor.js';

/** Qué está haciendo el modal. `null` en la página = cerrado. */
export type KbDialogTarget =
  | { mode: 'create' }
  | { mode: 'edit'; doc: IKbDocument }; // documento real o preset virtual

/**
 * Explica en una frase qué le pasará a la versión al guardar, replicando las reglas del backend.
 * Se recalcula con el texto tecleado, así que la promesa es cierta **antes** de guardar.
 *
 * Las dos partes menos evidentes se dicen con todas las letras en vez de mostrar "v1 → v1": que el
 * primer contenido no crea versión nueva, y que guardar sin cambios no cuesta nada.
 */
function leyendaVersion(doc: IKbDocument, contenido: string): string {
  if (isVirtualPresetId(doc.id)) return 'Aún sin contenido. Se guardará como v1.';
  const destino = nextVersion(doc, contenido);
  if (destino !== doc.version) return `Versión v${doc.version}. Al guardar pasará a v${destino}.`;
  return doc.contenido.trim().length === 0
    ? `Versión v${doc.version}. El primer contenido no crea una versión nueva.`
    : `Versión v${doc.version}. Sin cambios por guardar.`;
}

interface DocumentDialogBodyProps {
  doc: IKbDocument | undefined;
  documents: IKbDocument[];
  onDone: () => void;
}

/**
 * Encabezado + formulario. Es dueño del `contenido` porque lo necesitan los dos: la leyenda de
 * versión del encabezado y el textarea del editor. Al montarse con `key` por documento, cada
 * apertura del modal arranca limpia sin depender de un `useEffect` de reset.
 */
function DocumentDialogBody({
  doc,
  documents,
  onDone,
}: DocumentDialogBodyProps): React.ReactElement {
  const [contenido, setContenido] = useState(doc?.contenido ?? '');

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-6">{doc ? doc.titulo : 'Nuevo conocimiento'}</DialogTitle>
        <DialogDescription>
          {doc
            ? leyendaVersion(doc, contenido)
            : 'Dale un nombre y pega el texto que la IA usará al responder sobre este tema.'}
        </DialogDescription>
      </DialogHeader>

      <KnowledgeUploadEditor
        doc={doc}
        documents={documents}
        contenido={contenido}
        onContenidoChange={setContenido}
        onDone={onDone}
      />
    </>
  );
}

interface KnowledgeDocumentDialogProps {
  target: KbDialogTarget | null;
  /** Documentos reales del tenant, para detectar títulos ya usados al crear. */
  documents: IKbDocument[];
  onOpenChange: (open: boolean) => void;
}

/**
 * Cáscara del modal de conocimiento. Al editar, el título va aquí como encabezado **fijo**: es la
 * identidad del documento, no un campo más del formulario.
 */
export function KnowledgeDocumentDialog({
  target,
  documents,
  onOpenChange,
}: KnowledgeDocumentDialogProps): React.ReactElement {
  const doc = target?.mode === 'edit' ? target.doc : undefined;

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {/* Montado solo con el modal abierto y recreado en cada apertura: ni el formulario ni la
            leyenda arrastran el contenido del documento anterior. */}
        {target !== null && (
          <DocumentDialogBody
            key={doc?.id ?? 'nuevo'}
            doc={doc}
            documents={documents}
            onDone={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
