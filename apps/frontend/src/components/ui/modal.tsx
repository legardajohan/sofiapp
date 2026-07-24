import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/** Ancho máximo del panel. Mapea a utilidades Tailwind `sm:max-w-*`. */
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_TO_MAX_WIDTH: Record<ModalSize, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

/**
 * Extiende `React.AriaAttributes`, por lo que acepta **cualquier prop estándar de accesibilidad**
 * (`aria-label`, `aria-describedby`, `aria-live`, …) que se propaga tal cual al panel del diálogo.
 */
export interface ModalProps extends React.AriaAttributes {
  /** Controla la visibilidad. Componente **controlado**: el estado vive en el padre. */
  isOpen: boolean;
  /** Se invoca cuando el usuario pide cerrar (X, Esc o clic fuera). No se llama si `dismissible` es `false`. */
  onClose: () => void;
  /** Título accesible. Radix lo usa como `aria-labelledby` (obligatorio para lectores de pantalla). */
  title: React.ReactNode;
  /** Descripción opcional bajo el título; se enlaza como `aria-describedby`. */
  description?: React.ReactNode;
  /** Contenido del cuerpo del modal. */
  children?: React.ReactNode;
  /** Zona de acciones (botones). Se renderiza en el pie, alineada a la derecha. */
  footer?: React.ReactNode;
  /** Ancho del panel. Por defecto `md`. */
  size?: ModalSize;
  /**
   * Si es `false`, bloquea el cierre por Esc / clic-fuera y oculta la X.
   * Úsalo mientras una acción está en curso para que no se cierre a mitad. Por defecto `true`.
   */
  dismissible?: boolean;
  /** Clases extra para el panel de contenido. */
  className?: string;
}

/**
 * Modal (Dialog) reutilizable de la app, construido sobre el primitivo `ui/dialog` (shadcn/Radix).
 * Componente **controlado**: el padre gobierna `isOpen`/`onClose`. Accesible por defecto
 * (foco atrapado, `aria-labelledby`/`aria-describedby`, cierre por Esc).
 *
 * @example
 * <Modal isOpen={open} onClose={() => setOpen(false)} title="Título"
 *   footer={<Button onClick={...}>Aceptar</Button>}>
 *   Contenido…
 * </Modal>
 */
export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  dismissible = true,
  className,
  ...ariaProps
}: ModalProps): React.ReactElement {
  const handleOpenChange = (open: boolean): void => {
    if (!open && dismissible) onClose();
  };

  const blockWhenLocked = (event: Event): void => {
    if (!dismissible) event.preventDefault();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        {...ariaProps}
        showCloseButton={dismissible}
        onEscapeKeyDown={blockWhenLocked}
        onPointerDownOutside={blockWhenLocked}
        onInteractOutside={blockWhenLocked}
        className={cn(SIZE_TO_MAX_WIDTH[size], 'max-h-[90vh] overflow-y-auto', className)}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {children}

        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
