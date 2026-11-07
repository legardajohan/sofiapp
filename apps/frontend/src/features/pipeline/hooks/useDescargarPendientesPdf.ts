import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { errorMessage } from '@/features/contacts/lib/errors';
import { downloadPendientesPdf } from '../api.js';
import { nombreArchivoPendientes } from '../lib/rango-pdf.js';
import type { RangoPdfPendientes } from '../types.js';

/** Entrega el `Blob` al navegador como descarga y libera la URL temporal. */
function guardarArchivo(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  // En el siguiente tick: algunos navegadores cancelan la descarga si la URL muere en el mismo.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Descarga el «Reporte de pendientes» (HU-PDF-01).
 *
 * El nombre del archivo se calcula aquí, con la misma regla que el backend, en vez de leerse de
 * `Content-Disposition`: con el API en otro dominio esa cabecera no es legible desde JS sin exponerla
 * por CORS, y el nombre depende solo del rango que el usuario eligió.
 *
 * Un rango vacío llega como 404 con «No hay pendientes en el rango seleccionado.» (CA5): se muestra
 * ese mensaje tal cual y no se descarga nada.
 */
export function useDescargarPendientesPdf() {
  return useMutation({
    mutationFn: async (rango: RangoPdfPendientes) => {
      const blob = await downloadPendientesPdf(rango);
      guardarArchivo(blob, nombreArchivoPendientes(rango.desde, rango.hasta));
    },
    onSuccess: () => toast.success('Reporte de pendientes descargado.'),
    onError: (error) => toast.error(errorMessage(error, 'No se pudo generar el PDF.')),
  });
}
