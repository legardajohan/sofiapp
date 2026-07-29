import { GraduationCap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface KnowledgeOnboardingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Modal de bienvenida (onboarding) de la Base de Conocimiento. NO es bloqueante: se cierra con la X,
 * Esc o click fuera, además del botón "Empezar". La persistencia (localStorage) la maneja el padre,
 * que también puede re-abrirlo desde el header con el botón de ayuda.
 */
export function KnowledgeOnboardingDialog({
  open,
  onOpenChange,
}: KnowledgeOnboardingDialogProps): React.ReactElement {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="items-center text-center sm:text-center">
          <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
            <GraduationCap className="h-6 w-6 text-primary-foreground" aria-hidden="true" />
          </div>
          <DialogTitle>Entrena a tu IA</DialogTitle>
          <DialogDescription className="space-y-2 text-left">
            <span className="block">
              La Base de Conocimiento es la información de tu negocio que la IA usa como contexto al
              responder a tus prospectos.
            </span>
            <span className="block">
              Para empezar, completa al menos los dos documentos{' '}
              <strong className="font-medium text-foreground">obligatorios</strong>: «Información de
              la empresa» y «Productos y servicios».
            </span>
            <span className="block">
              Sigue tu avance en la barra de progreso; cada documento se indexa al guardarlo.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-hover focus:outline-none focus:ring-2 focus:ring-ring/40 sm:w-auto"
          >
            Empezar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
