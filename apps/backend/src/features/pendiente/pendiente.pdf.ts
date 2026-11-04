import PDFDocument from 'pdfkit';
import type { CanalOrigen } from '../cliente/cliente.types.js';
import type { IPendienteResponse, IReportePendientes } from './pendiente.types.js';

/**
 * Render del «Reporte de pendientes» (HU-PDF-01). **Puro**: recibe los datos ya hidratados y
 * devuelve el documento; no toca Mongo ni Express. Así se prueba sin base de datos y el service
 * decide todo lo que puede fallar antes de que empiece el stream.
 *
 * Usa las fuentes estándar de PDF (Helvetica), que cubren el español (WinAnsi). Lo que caiga fuera
 * de ese juego —emojis, sobre todo— se quita en `limpiar` en vez de pintarse como basura.
 */

const MARGEN = 48;
const PIE_ALTO = 28;

const COLOR_TEXTO = '#0f172a';
const COLOR_SECUNDARIO = '#475569';
const COLOR_TENUE = '#94a3b8';
const COLOR_LINEA = '#e2e8f0';
/** Único color con significado: un pendiente cerrado se distingue sin depender solo del texto. */
const COLOR_CERRADO = '#15803d';

const CANALES: Record<CanalOrigen, string> = {
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
  messenger: 'Messenger',
  formulario: 'Formulario',
  web: 'Web',
};

/** Deja solo lo que Helvetica estándar sabe pintar: Latin-1 y la puntuación tipográfica común. */
function limpiar(texto: string): string {
  return texto.replace(/[^\n\t -ÿ–—‘’“”…€]/gu, '');
}

function formatoFechaHora(fecha: Date, tz: string): string {
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: tz,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(fecha);
}

/** `2026-10-01` → `01/10/2026`, sin pasar por `Date` (es un día civil, no un instante). */
function formatoDia(dia: string): string {
  const [y, m, d] = dia.split('-');
  return `${d}/${m}/${y}`;
}

interface Campo {
  etiqueta: string;
  valor: string;
}

function camposDe(p: IPendienteResponse): Campo[] {
  return [
    { etiqueta: 'Teléfono', valor: p.lead.telefono || '—' },
    { etiqueta: 'Correo', valor: p.lead.correo ?? '—' },
    { etiqueta: 'Canal', valor: p.lead.canalOrigen ? CANALES[p.lead.canalOrigen] : '—' },
    { etiqueta: 'Etapa', valor: p.lead.etapa?.label ?? 'Sin convertir' },
  ];
}

function anchoUtil(doc: PDFKit.PDFDocument): number {
  return doc.page.width - MARGEN * 2;
}

function linea(doc: PDFKit.PDFDocument, y: number): void {
  doc
    .moveTo(MARGEN, y)
    .lineTo(doc.page.width - MARGEN, y)
    .lineWidth(0.6)
    .strokeColor(COLOR_LINEA)
    .stroke();
}

function encabezado(doc: PDFKit.PDFDocument, datos: IReportePendientes): void {
  const ancho = anchoUtil(doc);
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_SECUNDARIO);
  doc.text(limpiar(datos.empresa), MARGEN, MARGEN, { width: ancho });
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(20).fillColor(COLOR_TEXTO);
  doc.text('Reporte de pendientes', { width: ancho });
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(9.5).fillColor(COLOR_SECUNDARIO);
  doc.text(`Rango: ${formatoDia(datos.desde)} al ${formatoDia(datos.hasta)}`, { width: ancho });
  doc.text(
    `Generado el ${formatoFechaHora(datos.generadoAt, datos.tz)} por ${limpiar(datos.generadoPor)}`,
    { width: ancho },
  );
  doc.moveDown(0.8);
  linea(doc, doc.y);
  doc.moveDown(0.8);
}

/** Alto que ocupará un bloque, para saltar de página antes de partirlo a la mitad. */
/** «Programado: 15/10/2026 · 09:30», o «Todo el día» sin hora (HU-PDF-01 A1). */
function programacion(p: IPendienteResponse): string {
  const hora = p.programadoHora ?? 'Todo el día';
  return `Programado: ${formatoDia(p.programadoDia)} · ${hora}`;
}

function estadoTexto(p: IPendienteResponse, tz: string): string {
  if (p.estado === 'abierto') return 'Abierto';
  const cuando = p.cerradoAt ? ` el ${formatoFechaHora(new Date(p.cerradoAt), tz)}` : '';
  const quien = p.cerradoPor ? ` por ${limpiar(p.cerradoPor.nombre ?? 'Usuario eliminado')}` : '';
  return `Cerrado${cuando}${quien}`;
}

function altoBloque(doc: PDFKit.PDFDocument, p: IPendienteResponse): number {
  const ancho = anchoUtil(doc);
  doc.font('Helvetica-Bold').fontSize(11);
  const titulo = doc.heightOfString(limpiar(p.lead.nombre ?? 'Sin nombre'), { width: ancho });
  doc.font('Helvetica').fontSize(9);
  const campos = doc.heightOfString('X', { width: ancho }) * 2 + 4;
  doc.fontSize(10);
  const descripcion = doc.heightOfString(limpiar(p.descripcion), { width: ancho });
  return titulo + campos + descripcion + 60;
}

function bloque(doc: PDFKit.PDFDocument, p: IPendienteResponse, tz: string): void {
  const ancho = anchoUtil(doc);
  const limiteInferior = doc.page.height - MARGEN - PIE_ALTO;
  if (doc.y + altoBloque(doc, p) > limiteInferior) {
    doc.addPage();
    doc.y = MARGEN;
  }

  // La línea de agenda manda: el reporte se lee por fecha programada. El estado va a la derecha
  // en la misma línea, en verde si está cerrado.
  const yAgenda = doc.y;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLOR_SECUNDARIO);
  doc.text(programacion(p), MARGEN, yAgenda, { width: ancho, lineBreak: false });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(p.estado === 'cerrado' ? COLOR_CERRADO : COLOR_TENUE)
    .text(estadoTexto(p, tz), MARGEN, yAgenda, { width: ancho, align: 'right' });
  doc.moveDown(0.2);
  doc.font('Helvetica-Bold').fontSize(11).fillColor(COLOR_TEXTO);
  doc.text(limpiar(p.lead.nombre ?? 'Sin nombre'), { width: ancho });
  doc.moveDown(0.25);

  // Dos columnas de «etiqueta valor»: cuatro datos cortos no merecen cuatro renglones.
  const campos = camposDe(p);
  const mitad = ancho / 2;
  doc.fontSize(9);
  for (let i = 0; i < campos.length; i += 2) {
    const y = doc.y;
    let alto = 0;
    for (const [col, campo] of [campos[i], campos[i + 1]].entries()) {
      if (!campo) continue;
      const x = MARGEN + col * mitad;
      doc.font('Helvetica').fillColor(COLOR_TENUE).text(`${campo.etiqueta}  `, x, y, {
        continued: true,
        width: mitad - 8,
      });
      doc.fillColor(COLOR_SECUNDARIO).text(limpiar(campo.valor));
      alto = Math.max(alto, doc.y - y);
    }
    doc.y = y + alto;
  }

  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(10).fillColor(COLOR_TEXTO);
  doc.text(limpiar(p.descripcion), MARGEN, doc.y, { width: ancho, lineGap: 2 });
  doc.moveDown(0.3);
  doc.fontSize(8.5).fillColor(COLOR_TENUE);
  doc.text(
    `Creado el ${formatoFechaHora(new Date(p.createdAt), tz)} por ${limpiar(p.autor.nombre ?? 'Usuario eliminado')}`,
    MARGEN,
    doc.y,
    { width: ancho },
  );

  doc.moveDown(0.7);
  linea(doc, doc.y);
  doc.moveDown(0.7);
}

/**
 * Pie en todas las páginas: total del rango con su desglose a la izquierda, «Página X de Y» a la
 * derecha.
 */
function pies(doc: PDFKit.PDFDocument, pendientes: IPendienteResponse[]): void {
  const { start, count } = doc.bufferedPageRange();
  const cerrados = pendientes.filter((p) => p.estado === 'cerrado').length;
  const etiquetaTotal = `Total de pendientes: ${pendientes.length} (${pendientes.length - cerrados} abiertos, ${cerrados} cerrados)`;
  for (let i = start; i < start + count; i += 1) {
    doc.switchToPage(i);
    // Sin esto, escribir por debajo del margen inferior haría que pdfkit abriera otra página.
    const margenInferior = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - MARGEN + 8;
    const ancho = anchoUtil(doc);
    doc.font('Helvetica').fontSize(8.5).fillColor(COLOR_TENUE);
    doc.text(etiquetaTotal, MARGEN, y, { width: ancho, align: 'left', lineBreak: false });
    doc.text(`Página ${i - start + 1} de ${count}`, MARGEN, y, {
      width: ancho,
      align: 'right',
      lineBreak: false,
    });
    doc.page.margins.bottom = margenInferior;
  }
}

export function renderReportePendientes(datos: IReportePendientes): PDFKit.PDFDocument {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: MARGEN, bottom: MARGEN + PIE_ALTO, left: MARGEN, right: MARGEN },
    bufferPages: true,
    info: { Title: 'Reporte de pendientes', Author: limpiar(datos.empresa) },
  });

  encabezado(doc, datos);
  for (const pendiente of datos.pendientes) bloque(doc, pendiente, datos.tz);
  pies(doc, datos.pendientes);

  doc.end();
  return doc;
}
