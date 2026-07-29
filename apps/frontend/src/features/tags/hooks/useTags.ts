import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import axios from 'axios';
import { createTag, deleteTag, fetchTags, updateTag } from '../api.js';
import type { CreateTagPayload, TagDTO, UpdateTagPayload } from '../types.js';

/** Mensaje del backend si lo hay: "Ya existe una etiqueta con ese nombre" dice más que un genérico. */
function motivo(error: unknown, fallback: string): string {
  if (axios.isAxiosError(error) && typeof error.response?.data?.message === 'string') {
    return error.response.data.message;
  }
  return fallback;
}

export function useTags() {
  return useQuery<TagDTO[]>({ queryKey: ['tags'], queryFn: fetchTags });
}

/** Las etiquetas viajan dentro de cada conversación, así que un cambio invalida también la bandeja. */
function useInvalidarEtiquetas(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['tags'] });
    void qc.invalidateQueries({ queryKey: ['conversations'] });
  };
}

export function useCreateTag() {
  const invalidar = useInvalidarEtiquetas();
  return useMutation({
    mutationFn: (payload: CreateTagPayload) => createTag(payload),
    onSuccess: (tag) => {
      invalidar();
      toast.success(`Etiqueta "${tag.nombre}" creada`);
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo crear la etiqueta.')),
  });
}

export function useUpdateTag() {
  const invalidar = useInvalidarEtiquetas();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateTagPayload }) =>
      updateTag(id, payload),
    onSuccess: () => {
      invalidar();
      toast.success('Etiqueta actualizada');
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo actualizar la etiqueta.')),
  });
}

export function useDeleteTag() {
  const invalidar = useInvalidarEtiquetas();
  return useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSuccess: () => {
      invalidar();
      toast.success('Etiqueta eliminada');
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo eliminar la etiqueta.')),
  });
}
