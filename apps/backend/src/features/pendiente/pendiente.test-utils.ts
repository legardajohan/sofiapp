import { constants, inflateSync } from 'node:zlib';

/** Solo para tests de HU-PDF-01: lee el stream de pdfkit entero. */
export async function leerPdf(documento: PDFKit.PDFDocument): Promise<Buffer> {
  const trozos: Buffer[] = [];
  for await (const trozo of documento) trozos.push(trozo as Buffer);
  return Buffer.concat(trozos);
}

/**
 * Texto visible del PDF, una línea por página. pdfkit comprime cada página y escribe el texto como
 * cadenas hex partidas por el kerning (`<50> 40 <c167696e61>`): se descomprime cada stream y se
 * concatenan sus trozos hex. Basta para buscar frases; no reconstruye saltos de línea.
 */
export function textoDePdf(pdf: Buffer): string {
  const crudo = pdf.toString('latin1');
  const paginas: string[] = [];
  for (const m of crudo.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let contenido: string;
    try {
      // `Z_SYNC_FLUSH`: la regex puede comerse un CR final del binario; así no se pierde la página.
      contenido = inflateSync(Buffer.from(m[1] ?? '', 'latin1'), {
        finishFlush: constants.Z_SYNC_FLUSH,
      }).toString('latin1');
    } catch {
      continue;
    }
    const piezas = [...contenido.matchAll(/<([0-9a-fA-F]*)>/g)].map((h) =>
      Buffer.from(h[1] ?? '', 'hex').toString('latin1'),
    );
    paginas.push(piezas.join(''));
  }
  return paginas.join('\n');
}
