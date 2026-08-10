import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { hayCambios, isVirtualPresetId, nextVersion } from '../lib/kb-presets.js';
import { emptyEstructura, modoEditor, schemaDeDocumento } from '../lib/kb-schemas.js';
import { serializeEstructura } from '../lib/kb-serialize.js';
import type { IKbDocument, KbEstructura } from '../types/index.js';
import { KnowledgeUploadEditor } from './KnowledgeUploadEditor.js';

/** Qué está haciendo el modal. `null` en la página = cerrado. */
export type KbDialogTarget =
  | { mode: 'create' }
  | { mode: 'edit'; doc: IKbDocument }; // documento real o preset virtual

/**
 * Explica en una frase qué le pasará a la versión al guardar, replicando las reglas del backend.
 * Se recalcula con el texto vigente, así que la promesa es cierta **antes** de guardar.
 *
 * Los tres casos que no se explican solos se dicen con todas las letras en vez de mostrar "v1 → v1":
 * que el primer contenido no crea versión, que guardar sin cambios no cuesta nada, y —desde
 * HU-KB-07— que un cambio que no altera el texto se guarda igual pero sin re-versionar.
 */
function leyendaVersion(doc: IKbDocument, contenido: string, estructura?: KbEstructura): string {
  if (isVirtualPresetId(doc.id)) return 'Aún sin contenido. Se guardará como v1.';

  const destino = nextVersion(doc, contenido);
  if (destino !== doc.version) return `Versión v${doc.version}. Al guardar pasará a v${destino}.`;

  if (doc.contenido.trim().length === 0) {
    return `Versión v${doc.version}. El primer contenido no crea una versión nueva.`;
  }

  return hayCambios(doc, contenido, estructura)
    ? `Versión v${doc.version}. Se guardarán tus cambios sin crear una versión nueva.`
    : `Versión v${doc.version}. Sin cambios por guardar.`;
}

interface DocumentDialogBodyProps {
  doc: IKbDocument | undefined;
  documents: IKbDocument[];
  onDone: () => void;
}

/**
 * Encabezado + formulario. Es dueño de lo que se va a guardar porque el encabezado lo necesita para
 * anticipar la versión de destino mientras se edita.
 *
 * En modo estructurado la fuente de verdad es la **estructura**, y el `contenido` se deriva de ella
 * en cada render. Esa dirección es de una sola vía a propósito: dejar editar el texto derivado a
 * mano rompería la coherencia con los campos, y a la siguiente apertura el formulario lo
 * sobrescribiría sin avisar. La vía libre es «Información adicional».
 *
 * Al montarse con `key` por documento, cada apertura arranca limpia sin depender de un `useEffect`.
 */
function DocumentDialogBody({
  doc,
  documents,
  onDone,
}: DocumentDialogBodyProps): React.ReactElement {
  const modo = modoEditor(doc);
  const schema = schemaDeDocumento(doc);

  const [contenidoLibre, setContenidoLibre] = useState(doc?.contenido ?? '');
  const [estructura, setEstructura] = useState<KbEstructura | undefined>(() =>
    modo === 'estructurado' && schema !== undefined
      ? (doc?.estructura ?? emptyEstructura(schema))
      : undefined,
  );

  const contenido =
    estructura !== undefined && schema !== undefined
      ? serializeEstructura(estructura, schema)
      : contenidoLibre;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="pr-6">{doc ? doc.titulo : 'Nuevo conocimiento'}</DialogTitle>
        <DialogDescription>
          {doc
            ? leyendaVersion(doc, contenido, estructura)
            : 'Dale un nombre y pega el texto que la IA usará al responder sobre este tema.'}
        </DialogDescription>
      </DialogHeader>

      <KnowledgeUploadEditor
        doc={doc}
        documents={documents}
        modo={modo}
        {...(schema !== undefined ? { schema } : {})}
        contenido={contenido}
        onContenidoChange={setContenidoLibre}
        {...(estructura !== undefined ? { estructura } : {})}
        onEstructuraChange={setEstructura}
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
