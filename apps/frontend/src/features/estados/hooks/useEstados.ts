import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  createEstado,
  deleteEstado,
  fetchEstados,
  reorderEstados,
  updateEstado,
} from '../api.js';
// Un solo extractor del mensaje del backend para toda la pantalla de leads (HU-PIPE-01).
import { motivo } from '../../leads/lib/errors.js';
import { bloqueoEnError } from '../lib/bloqueo.js';
import type { CreateEstadoPayload, EstadoDTO, UpdateEstadoPayload } from '../types.js';

/** La clave de la lista con uso. Compartida por la query y por el parche optimista del orden. */
const CLAVE_USO = ['estados', 'uso'] as const;

export function useEstados() {
  return useQuery<EstadoDTO[]>({ queryKey: ['estados'], queryFn: () => fetchEstados() });
}

/**
 * El catálogo con la cuenta de leads de cada etapa, para la pantalla de gestión.
 *
 * Clave aparte —`['estados', 'uso']`— y no un parámetro de `useEstados`: si compartieran clave, el
 * tablero y los selectores se quedarían con la respuesta cacheada de la pantalla de gestión (o al
 * revés) según quién montara primero. Al ser un sufijo, invalidar `['estados']` sigue alcanzando a
 * las dos.
 */
export function useEstadosConUso() {
  return useQuery<EstadoDTO[]>({
    queryKey: CLAVE_USO,
    queryFn: () => fetchEstados({ uso: true }),
  });
}

/**
 * Lo que se queda viejo al tocar el catálogo.
 *
 * Las etapas no viven solas: el tablero dibuja **una columna por etapa** con su nombre y su color,
 * y la tabla resuelve contra ellas la insignia de estado de cada fila. Invalidar solo `['estados']`
 * dejaría el embudo pintando una columna que acaba de renombrarse.
 */
function useInvalidarCatalogo(): () => void {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['estados'] });
    void qc.invalidateQueries({ queryKey: ['pipeline'] });
    void qc.invalidateQueries({ queryKey: ['leads'] });
  };
}

export function useCreateEstado() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: (payload: CreateEstadoPayload) => createEstado(payload),
    onSuccess: (estado) => {
      invalidar();
      toast.success(`Etapa "${estado.label}" creada`);
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo crear la etapa.')),
  });
}

export function useUpdateEstado() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateEstadoPayload }) =>
      updateEstado(id, payload),
    onSuccess: (estado, { payload }) => {
      invalidar();
      // Archivar y desarchivar no son "actualizar": son lo que el administrador acaba de pedir con
      // otro botón, y confirmarlo con el nombre del gesto es lo que le dice que funcionó.
      if (payload.activo === false) toast.success(`Etapa "${estado.label}" archivada`);
      else if (payload.activo === true) toast.success(`Etapa "${estado.label}" reactivada`);
      else toast.success('Etapa actualizada');
    },
    onError: (error) => toast.error(motivo(error, 'No se pudo actualizar la etapa.')),
  });
}

export function useDeleteEstado() {
  const invalidar = useInvalidarCatalogo();
  return useMutation({
    mutationFn: (id: string) => deleteEstado(id),
    onSuccess: () => {
      invalidar();
      toast.success('Etapa eliminada');
    },
    onError: (error) => {
      // Un borrado bloqueado no es un fallo que anunciar de refilón: el diálogo se queda abierto
      // explicándolo y ofreciendo archivar. Un toast encima solo repetiría el mismo texto.
      if (bloqueoEnError(error)) return;
      toast.error(motivo(error, 'No se pudo eliminar la etapa.'));
    },
  });
}

/**
 * Reordena la lista tal como quedaría en el servidor. Pura y exportada para poder probarla sin
 * montar la pantalla, igual que `moverEnCache` en el tablero.
 *
 * Las etapas que no estén en `ids` se quedan al final en su orden actual: no debería pasar —el
 * backend exige la lista completa— pero perder una fila del listado por un id que se quedó fuera
 * sería un fallo mucho peor que verla desplazada.
 */
export function ordenarComo(estados: EstadoDTO[], ids: string[]): EstadoDTO[] {
  const porId = new Map(estados.map((e) => [e.id, e]));
  const ordenadas = ids.flatMap((id) => porId.get(id) ?? []);
  const fuera = estados.filter((e) => !ids.includes(e.id));

  return [...ordenadas, ...fuera].map((estado, orden) => ({ ...estado, orden }));
}

/**
 * Guarda el orden del embudo, **optimista**.
 *
 * A diferencia del resto del CRUD, aquí el usuario acaba de soltar una fila con el ratón: verla
 * volver a su sitio durante el viaje de ida y vuelta se lee como que el arrastre falló. La fila se
 * queda donde se soltó y solo retrocede si el servidor lo rechaza. Mismo criterio que
 * `useMoveLeadStage` en el tablero.
 */
export function useReorderEstados() {
  const qc = useQueryClient();
  const invalidar = useInvalidarCatalogo();

  return useMutation({
    mutationFn: (ids: string[]) => reorderEstados(ids),

    onMutate: async (ids) => {
      // Sin cancelar, un refetch en vuelo aterriza después del parche y devuelve el orden viejo.
      await qc.cancelQueries({ queryKey: CLAVE_USO });

      const previo = qc.getQueryData<EstadoDTO[]>(CLAVE_USO);
      if (previo) qc.setQueryData<EstadoDTO[]>(CLAVE_USO, ordenarComo(previo, ids));

      return { previo };
    },

    onError: (error, _ids, context) => {
      if (context?.previo) qc.setQueryData(CLAVE_USO, context.previo);
      toast.error(motivo(error, 'No se pudo guardar el orden del embudo.'));
    },

    // Sin toast en el camino feliz: reordenar es un gesto que se repite varias veces seguidas hasta
    // dar con el recorrido, y un aviso por cada arrastre sería ruido. La fila ya está donde se soltó.
    onSettled: () => invalidar(),
  });
}
