import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import { confirmarDatosExtraidos } from '../api.js';
import { errorMessage } from '../../contacts/lib/errors.js';
import type { CampoExtraido, ConfirmarExtraccionDTO } from '../types.js';

/** Cómo se nombra cada campo en el aviso. Mismo vocabulario que las etiquetas de la tarjeta. */
const NOMBRE: Record<CampoExtraido, string> = {
  nombreCompleto: 'El nombre',
  correo: 'El correo',
  telefono: 'El teléfono',
  interes: 'El interés',
};

/** «El nombre» + «El correo» → «El nombre y el correo». */
function enumerar(campos: CampoExtraido[]): string {
  const nombres = campos.map((c, i) => (i === 0 ? NOMBRE[c] : NOMBRE[c].toLowerCase()));
  if (nombres.length === 1) return nombres[0] as string;
  return `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`;
}

/**
 * Confirma los datos extraídos y refresca las dos vistas donde se ven: la ficha del contacto y la
 * lista de la bandeja, que pinta el nombre.
 *
 * El aviso distingue lo aplicado de lo omitido a propósito: un campo omitido lo fue porque ya había
 * un dato guardado, y decirlo es más útil que un éxito genérico que oculta que no pasó nada.
 */
export function useConfirmarExtraccion(
  clienteId: string | null,
): UseMutationResult<ConfirmarExtraccionDTO, unknown, CampoExtraido[]> {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (campos: CampoExtraido[]) =>
      confirmarDatosExtraidos(clienteId as string, campos),
    onSuccess: ({ aplicados, omitidos }) => {
      void qc.invalidateQueries({ queryKey: ['contact-history', clienteId] });
      // El nombre confirmado se pinta también en la lista de conversaciones.
      void qc.invalidateQueries({ queryKey: ['conversations'] });

      if (aplicados.length > 0) {
        toast.success(`${enumerar(aplicados)} ${aplicados.length > 1 ? 'entraron' : 'entró'} en la ficha`);
      }
      // Un solo aviso para todos los omitidos: cuatro toasts seguidos serían ruido.
      if (omitidos.length > 0) {
        toast.info(
          `${enumerar(omitidos)} ya ${omitidos.length > 1 ? 'estaban registrados' : 'estaba registrado'}; no se ${omitidos.length > 1 ? 'sobrescribieron' : 'sobrescribió'}.`,
        );
      }
    },
    onError: (error) => {
      toast.error(errorMessage(error, 'No se pudieron confirmar los datos.'));
    },
  });
}
