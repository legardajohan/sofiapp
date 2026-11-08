import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  archiveContactField,
  createContactField,
  fetchContactFields,
  updateContactField,
} from '../api.js';
import { errorMessage } from '../lib/errors.js';
import type { CampoContactoDTO, CrearCampoPayload } from '../types.js';

export const CAMPOS_KEY = ['contact-fields'] as const;

/**
 * Catálogo de campos personalizados de la empresa (HU-FLOW-05).
 *
 * `staleTime` alto, igual que `useContactOptions`: es una lista corta que cambia cuando el
 * administrador la edita —y esas mutaciones ya invalidan la caché—, no cada vez que se abre una
 * ficha o un nodo de captura.
 */
export function useContactFields(incluirArchivados = false): UseQueryResult<CampoContactoDTO[]> {
  return useQuery({
    queryKey: [...CAMPOS_KEY, { incluirArchivados }],
    queryFn: () => fetchContactFields(incluirArchivados),
    staleTime: 5 * 60 * 1000,
  });
}

/** Mapa `key → campo`, para resolver la etiqueta y el tipo de un campo ya elegido. */
export function camposPorKey(campos: CampoContactoDTO[] | undefined): Map<string, CampoContactoDTO> {
  return new Map((campos ?? []).map((c) => [c.key, c]));
}

function useInvalidarCampos(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: CAMPOS_KEY });
    // La ficha pinta la etiqueta del campo, no su clave: sin esto seguiría mostrando el nombre anterior.
    void qc.invalidateQueries({ queryKey: ['contact-history'] });
  };
}

export function useCreateContactField() {
  const invalidar = useInvalidarCampos();
  return useMutation({
    mutationFn: (payload: CrearCampoPayload) => createContactField(payload),
    onSuccess: (campo) => {
      invalidar();
      toast.success(`Campo «${campo.label}» creado`);
    },
    // El error de duplicado o reservado se muestra en línea en el formulario; este toast cubre el resto.
  });
}

/** Sin toast en el camino feliz: renombrar se hace campo a campo y el propio input ya muestra el resultado. */
export function useUpdateContactField() {
  const invalidar = useInvalidarCampos();
  return useMutation({
    mutationFn: ({ id, ...cambios }: { id: string } & Partial<CrearCampoPayload>) => updateContactField(id, cambios),
    onSuccess: invalidar,
  });
}

export function useArchiveContactField() {
  const invalidar = useInvalidarCampos();
  return useMutation({
    mutationFn: ({ id }: { id: string; label: string }) => archiveContactField(id),
    onSuccess: (_r, { label }) => {
      invalidar();
      toast.success(`Campo «${label}» archivado`, {
        description: 'Los contactos que ya lo tienen lo conservan; deja de ofrecerse para elegir.',
      });
    },
    onError: (error) => toast.error(errorMessage(error, 'No se pudo archivar el campo.')),
  });
}
