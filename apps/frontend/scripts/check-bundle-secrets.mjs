// Control de build (HT-PAY-05): ningún secreto de Wompi puede llegar al navegador.
// Escanea `dist/` y las variables `VITE_*` del entorno de build. Los hallazgos dicen DÓNDE y QUÉ
// patrón, nunca el texto encontrado. La llave pública (`pub_…`) está permitida.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PATRONES_SECRETOS = [
  /prv_(?:test|prod)_/,
  /(?:test|prod)_events_/,
  /(?:test|prod)_integrity_/,
];

export const NOMBRES_VITE_PROHIBIDOS = /(?:PRIVATE|SECRET|INTEGRITY|EVENTS)/i;

const EXTENSIONES = new Set(['.js', '.mjs', '.css', '.html', '.map']);

function* archivos(dir) {
  for (const nombre of readdirSync(dir)) {
    const ruta = path.join(dir, nombre);
    const stat = statSync(ruta);
    if (stat.isDirectory()) yield* archivos(ruta);
    else if (EXTENSIONES.has(path.extname(nombre))) yield ruta;
  }
}

/**
 * @param {{ dist: string, env: Record<string, string | undefined> }} entrada
 * @returns {{ tipo: 'bundle' | 'variable', ubicacion: string, patron: string }[]}
 */
export function escanear({ dist, env }) {
  const hallazgos = [];

  let existe = true;
  try {
    existe = statSync(dist).isDirectory();
  } catch {
    existe = false;
  }
  if (existe) {
    for (const archivo of archivos(dist)) {
      const contenido = readFileSync(archivo, 'utf8');
      for (const patron of PATRONES_SECRETOS) {
        if (patron.test(contenido)) {
          hallazgos.push({
            tipo: 'bundle',
            ubicacion: path.relative(dist, archivo).split(path.sep).join('/'),
            patron: patron.source,
          });
        }
      }
    }
  }

  for (const nombre of Object.keys(env)) {
    if (nombre.startsWith('VITE_') && NOMBRES_VITE_PROHIBIDOS.test(nombre)) {
      hallazgos.push({
        tipo: 'variable',
        ubicacion: nombre,
        patron: NOMBRES_VITE_PROHIBIDOS.source,
      });
    }
  }

  return hallazgos;
}

function esModuloPrincipal() {
  return process.argv[1] !== undefined && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (esModuloPrincipal()) {
  const hallazgos = escanear({ dist: path.resolve('dist'), env: process.env });
  if (hallazgos.length > 0) {
    console.error('check-bundle-secrets: se encontraron secretos que no deben llegar al navegador:');
    for (const h of hallazgos) {
      console.error(`  - [${h.tipo}] ${h.ubicacion} (patrón ${h.patron})`);
    }
    process.exit(1);
  }
  console.log('check-bundle-secrets: sin secretos en el bundle ni en las variables VITE_*.');
}
