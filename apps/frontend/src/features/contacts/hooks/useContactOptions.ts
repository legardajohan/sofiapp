import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createContactOption,
  deleteContactOption,
  fetchContactOptions,
  updateContactOption,
} from '../api.js';
import { errorMessage } from '../lib/errors.js';
import type { OpcionDTO, OpcionesPorTipo, TipoOpcion } from '../types.js';

export const OPCIONES_KEY = ['contact-options'] as const;

/**
 * Catálogos de interés / objeción / rol del tenant (HU-CRM-02).
 *
 * `staleTime` alto a propósito: son listas de una decena de elementos que cambian cuando el
 * administrador las edita —y ese caso ya invalida la caché desde las mutaciones—, no cada vez que se
 * abre una ficha. Refrescarlas en cada apertura del panel sería una petición por conversación.
 */
export function useContactOptions(): UseQueryResult<OpcionesPorTipo> {
  return useQuery({
    queryKey: OPCIONES_KEY,
    queryFn: fetchContactOptions,
    staleTime: 5 * 60 * 1000,
  });
}

/** Mapa `key → label` de un catálogo, con las archivadas incluidas para poder resolver fichas viejas. */
export function etiquetasDe(opciones: OpcionDTO[] | undefined): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const o of opciones ?? []) mapa.set(o.key, o.label);
  return mapa;
}

/** Mapa `key → opción` completa: lo que necesita quien además del nombre tiene que pintar el color. */
export function opcionesPorKey(opciones: OpcionDTO[] | undefined): Map<string, OpcionDTO> {
  const mapa = new Map<string, OpcionDTO>();
  for (const o of opciones ?? []) mapa.set(o.key, o);
  return mapa;
}

export function useCreateContactOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ tipo, label, color }: { tipo: TipoOpcion; label: string; color?: string }) =>
      createContactOption(tipo, label, color),
    onSuccess: (opcion) => {
      void qc.invalidateQueries({ queryKey: OPCIONES_KEY });
      toast.success(`Opción «${opcion.label}» agregada`);
    },
    onError: (error) => toast.error(errorMessage(error, 'No se pudo agregar la opción.')),
  });
}

/**
 * Renombra, recolorea o desarchiva. Sin toast en el camino feliz: renombrar se hace campo a campo y
 * una notificación por letra corregida sería ruido — el propio input ya muestra el resultado.
 */
export function useUpdateContactOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...cambios
    }: {
      id: string;
      label?: string;
      color?: string;
      activo?: boolean;
    }) => updateContactOption(id, cambios),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: OPCIONES_KEY });
      // La ficha pinta la etiqueta, no la clave: sin esto seguiría mostrando el nombre anterior.
      void qc.invalidateQueries({ queryKey: ['contact-history'] });
    },
    onError: (error) => toast.error(errorMessage(error, 'No se pudo guardar la opción.')),
  });
}

/**
 * Borra o archiva. El backend decide cuál de las dos según haya contactos usándola, y el toast lo
 * dice: "eliminar" y que la opción siga apareciendo en fichas antiguas necesita explicación.
 */
export function useDeleteContactOption() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string; label: string }) => deleteContactOption(id),
    onSuccess: (resultado, { label }) => {
      void qc.invalidateQueries({ queryKey: OPCIONES_KEY });
      if (resultado.eliminada) {
        toast.success(`Opción «${label}» eliminada`);
        return;
      }
      toast.success(`Opción «${label}» archivada`, {
        description:
          resultado.enUso === 1
            ? 'Un contacto la tiene registrada y sigue mostrándola.'
            : `${resultado.enUso} contactos la tienen registrada y siguen mostrándola.`,
      });
    },
    onError: (error) => toast.error(errorMessage(error, 'No se pudo eliminar la opción.')),
  });
}
