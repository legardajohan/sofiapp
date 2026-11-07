import { describe, it, expect } from 'vitest';
import { renderReportePendientes } from './pendiente.pdf.js';
import { leerPdf, textoDePdf } from './pendiente.test-utils.js';
import type { IPendienteResponse, IReportePendientes } from './pendiente.types.js';

function pendiente(
  n: number,
  extra: Partial<IPendienteResponse> = {},
  lead: Partial<IPendienteResponse['lead']> = {},
): IPendienteResponse {
  return {
    id: `nota${n}`,
    clienteId: `cliente${n}`,
    descripcion: `Descripción del pendiente ${n} 😀`,
    autor: { id: 'u1', nombre: 'Ana Gómez' },
    createdAt: new Date(Date.UTC(2026, 9, 1, 15, n)).toISOString(),
    programadoDia: '2026-10-15',
    programadoHora: '09:30',
    estado: 'abierto',
    cerradoAt: null,
    cerradoPor: null,
    lead: {
      leadId: `lead${n}`,
      nombre: `Lead ${n}`,
      telefono: '573001112233',
      correo: `lead${n}@correo.com`,
      canalOrigen: 'whatsapp',
      etapa: { key: 'nuevo', label: 'Nuevo', color: '#22c55e' },
      ...lead,
    },
    ...extra,
  };
}

function reporte(pendientes: IPendienteResponse[]): IReportePendientes {
  return {
    empresa: 'Academia Alfa',
    desde: '2026-10-01',
    hasta: '2026-10-31',
    tz: 'America/Bogota',
    generadoAt: new Date('2026-11-03T15:00:00Z'),
    generadoPor: 'Diego Narváez',
    pendientes,
  };
}

describe('HU-PDF-01 — render del reporte de pendientes', () => {
  it('incluye encabezado, detalle y pie definidos en la historia', async () => {
    const pdf = await leerPdf(
      renderReportePendientes(
        reporte([
          pendiente(1),
          pendiente(
            2,
            {
              programadoHora: null,
              estado: 'cerrado',
              cerradoAt: '2026-10-16T14:00:00.000Z',
              cerradoPor: { id: 'u2', nombre: 'Beto Ruiz' },
            },
            { leadId: null, etapa: null, canalOrigen: 'web' },
          ),
        ]),
      ),
    );
    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');

    const texto = textoDePdf(pdf);
    // Encabezado.
    expect(texto).toContain('Academia Alfa');
    expect(texto).toContain('Reporte de pendientes');
    expect(texto).toContain('Rango: 01/10/2026 al 31/10/2026');
    expect(texto).toContain('Diego Narváez');
    // Detalle (A1: programación y estado).
    expect(texto).toContain('Programado: 15/10/2026 · 09:30');
    expect(texto).toContain('Programado: 15/10/2026 · Todo el día');
    expect(texto).toContain('Abierto');
    expect(texto).toContain('Cerrado el 16/10/2026');
    expect(texto).toContain('por Beto Ruiz');
    expect(texto).toContain('Lead 1');
    expect(texto).toContain('573001112233');
    expect(texto).toContain('lead1@correo.com');
    expect(texto).toContain('WhatsApp');
    expect(texto).toContain('Nuevo');
    expect(texto).toContain('Sin convertir');
    expect(texto).toContain('Descripción del pendiente 1');
    expect(texto).toContain('por Ana Gómez');
    // Pie.
    expect(texto).toContain('Total de pendientes: 2 (1 abiertos, 1 cerrados)');
    expect(texto).toContain('Página 1 de 1');
  });

  it('numera todas las páginas cuando el reporte no cabe en una', async () => {
    const muchos = Array.from({ length: 40 }, (_, i) => pendiente(i + 1));
    const texto = textoDePdf(await leerPdf(renderReportePendientes(reporte(muchos))));
    const paginas = [...texto.matchAll(/Página (\d+) de (\d+)/g)];
    expect(paginas.length).toBeGreaterThan(1);
    const total = Number(paginas[0]?.[2]);
    expect(paginas.map((p) => Number(p[1]))).toEqual(Array.from({ length: total }, (_, i) => i + 1));
    expect(texto).toContain('Total de pendientes: 40 (40 abiertos, 0 cerrados)');
  });
});
