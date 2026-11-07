# ADR 0013 — El PDF de pendientes se genera en el proceso web, síncrono, con pdfkit

**Estado:** aceptado · **Fecha:** 2026-11-03 · **Contexto:** HU-PDF-01 (pendientes desde notas)

## Contexto

HU-PDF-01 pide descargar un «Reporte de pendientes» en PDF por rango de fechas desde la columna
Pendientes del embudo. Es el primer documento binario que genera el backend: no había librería de
PDF en el repositorio. Hay tres decisiones que tomar: **dónde** se genera (navegador o servidor),
**con qué** y **en qué proceso** (web o worker BullMQ).

## Decisión

1. **En el servidor.** El permiso (RN8: mismo gate que las notas, ADR 0006), el nombre de la
   empresa y el filtro por tenant se resuelven donde ya viven, con el `tenantId` del token. El
   navegador recibe un archivo, no los datos crudos de todos los pendientes del rango.
2. **pdfkit**, con las fuentes estándar de PDF (Helvetica). Es puro JavaScript, sin binarios ni
   navegador embebido, y cubre el español (WinAnsi). El render vive en `pendiente.pdf.ts` como una
   función **pura** —recibe los datos ya hidratados y devuelve el documento—, así se prueba sin base
   de datos. Los caracteres que Helvetica no sabe pintar (emojis) se eliminan del texto.
3. **Síncrono en el proceso web, sin BullMQ.** El usuario espera el archivo en ese mismo clic; una
   cola obligaría a guardar el PDF en algún sitio, avisar cuando esté y descargarlo después, para un
   documento de pocas páginas. El coste se acota con dos topes: el rango no puede pasar de
   **366 días** (`400`) y el reporte no puede tener más de **5000 pendientes** (`422`). La regla 6
   del `CLAUDE.md` (delegar trabajo pesado a BullMQ) habla de los webhooks de Meta, que deben
   responder en milisegundos; aquí el usuario está esperando la respuesta.
4. **Los errores esperables van antes del stream.** El service cuenta primero y lanza `AppError`
   (rango vacío → `404` «No hay pendientes en el rango seleccionado.»; demasiadas filas → `422`)
   antes de crear el documento. Una vez empieza el `pipe` el status ya no se puede cambiar.
5. **El rango viaja como días civiles + zona IANA** (`?desde=AAAA-MM-DD&hasta=AAAA-MM-DD&tz=`). El
   nombre del archivo y el encabezado dicen exactamente las fechas que el usuario eligió, y la
   conversión a instantes se hace en un único sitio (`pendiente.fechas.ts`, solo `Intl`).

## Alternativas

- **jsPDF en el navegador.** Menos backend, pero el reporte dependería de lo que el cliente haya
  recibido, sumaría peso al bundle y obligaría a exponer en JSON todos los pendientes del rango.
- **Puppeteer / HTML a PDF.** Mejor tipografía, pero arrastra un Chromium al droplet y multiplica la
  memoria por petición. Desproporcionado para una lista.
- **Job BullMQ + DO Spaces.** Correcto si los reportes crecieran a miles de páginas; hoy añadiría
  almacenamiento, expiración y un segundo paso de descarga sin beneficio visible.

## Consecuencias

- Nueva dependencia del API: `pdfkit` (+ `@types/pdfkit`).
- Si un tenant necesitara reportes mayores que los topes, la salida es mover el render al worker
  reutilizando `renderReportePendientes` tal cual: es puro y no conoce Express.
- Un futuro reporte en PDF debería seguir el mismo patrón: render puro + service que valida antes
  del stream + controller que solo pone cabeceras y hace `pipe`.
