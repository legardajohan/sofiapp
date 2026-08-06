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
 * Explica en una frase qué le pasará a la versión al guardar, replicando el `isFirstFill` del
 * backend. Que el primer contenido NO cree una versión nueva es la parte menos evidente, así que se
 * dice con todas las letras en vez de mostrar "v1 → v1".
 */
function leyendaVersion(doc: IKbDocument): string {
  if (isVirtualPresetId(doc.id)) return 'Aún sin contenido. Se guardará como v1.';
  const destino = nextVersion(doc);
  return destino === doc.version
    ? `Versión v${doc.version}. El primer contenido no crea una versión nueva.`
    : `Versión v${doc.version}. Al guardar pasará a v${destino}.`;
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
        <DialogHeader>
          <DialogTitle className="pr-6">{doc ? doc.titulo : 'Nuevo conocimiento'}</DialogTitle>
          <DialogDescription>
            {doc
              ? leyendaVersion(doc)
              : 'Dale un nombre y pega el texto que la IA usará al responder sobre este tema.'}
          </DialogDescription>
        </DialogHeader>

        {/* Montado solo con el modal abierto y recreado en cada apertura: el formulario nunca
            arrastra el contenido del documento anterior. */}
        {target !== null && (
          <KnowledgeUploadEditor
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
