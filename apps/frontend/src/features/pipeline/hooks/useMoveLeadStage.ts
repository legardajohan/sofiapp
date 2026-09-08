import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { motivo } from '../../leads/lib/errors.js';
import { moveLeadStage } from '../api.js';
import { pipelineKey } from './usePipeline.js';
import type { PipelineDTO, PipelineFiltros } from '../types.js';

interface Variables {
  id: string;
  estado: string;
}

/**
 * Mueve la tarjeta entre columnas en la caché, ajustando **los dos `total`**.
 *
 * Ajustar los totales importa tanto como mover la tarjeta: la cabecera de cada columna los pinta,
 * y dejarlos quietos haría que el tablero se contradijera a sí mismo durante el round-trip.
 *
 * Pura y exportada para poder probarla sin montar el tablero.
 */
export function moverEnCache(pipeline: PipelineDTO, id: string, destino: string): PipelineDTO {
  const origen = pipeline.columnas.find((c) => c.leads.some((l) => l.id === id));
  const lead = origen?.leads.find((l) => l.id === id);

  // La tarjeta no está en el tablero (llegó por socket, o la columna la tiene fuera de su primera
  // página): no hay nada que mover a mano, y el refetch de `onSettled` pondrá la verdad.
  if (!origen || !lead || origen.etapa.key === destino) return pipeline;

  return {
    ...pipeline,
    columnas: pipeline.columnas.map((columna) => {
      if (columna.etapa.key === origen.etapa.key) {
        return {
          ...columna,
          total: Math.max(0, columna.total - 1),
          leads: columna.leads.filter((l) => l.id !== id),
        };
      }
      if (columna.etapa.key === destino) {
        return {
          ...columna,
          total: columna.total + 1,
          // Al principio: es la posición que le toca por `createdAt` descendente solo si es el más
          // reciente, pero es también donde el usuario acaba de soltarla y donde espera verla.
          leads: [{ ...lead, estado: destino }, ...columna.leads],
        };
      }
      return columna;
    }),
  };
}

/**
 * Cambia la etapa de un lead desde el tablero (HU-PIPE-01).
 *
 * **Es optimista, a diferencia de `useUpdateLeadEstado`.** En el `Sheet` basta con invalidar al
 * responder: el usuario eligió en un desplegable y espera. Aquí acaba de arrastrar una tarjeta con
 * el ratón, y verla volver a su columna durante el round-trip se lee como un fallo. La tarjeta
 * aterriza donde se soltó y solo vuelve si el backend dice que no.
 */
export function useMoveLeadStage(filtros: PipelineFiltros) {
  const qc = useQueryClient();
  const clave = pipelineKey(filtros);

  return useMutation({
    mutationFn: ({ id, estado }: Variables) => moveLeadStage(id, estado),

    onMutate: async ({ id, estado }) => {
      // Sin cancelar, un refetch ya en vuelo aterriza después del parche optimista y lo pisa: la
      // tarjeta volvería sola a su columna con el movimiento aún en curso.
      await qc.cancelQueries({ queryKey: clave });

      const previo = qc.getQueryData<PipelineDTO>(clave);
      if (previo) qc.setQueryData<PipelineDTO>(clave, moverEnCache(previo, id, estado));

      return { previo };
    },

    onError: (error, _vars, context) => {
      if (context?.previo) qc.setQueryData(clave, context.previo);
      // El mensaje del backend, no un genérico: "esa etapa está archivada" explica por qué la
      // tarjeta volvió; "no se pudo mover" deja al usuario sin saber qué hacer.
      toast.error(motivo(error, 'No se pudo mover la oportunidad.'));
    },

    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['pipeline'] });
      // La tabla comparte los datos y también se queda vieja.
      void qc.invalidateQueries({ queryKey: ['leads'] });
    },
  });
}
