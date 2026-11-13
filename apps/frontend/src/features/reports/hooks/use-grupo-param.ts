import { useSearchParams } from 'react-router-dom';
import { parsearGrupoQuery } from '@sofiapp/shared';
import type { FiltroRolUsuario } from '@/lib/grupos-usuarios';

const OBJECT_ID = /^[0-9a-f]{24}$/i;

/**
 * AUTH-06 (ajuste) — Un par de filtros «rol o grupo + persona» en la URL, para que una vista filtrada
 * se pueda compartir por enlace. Cada sección del reporte usa sus propias claves y son independientes:
 * `grupo`/`persona` (indicadores y barras), `actividadGrupo`/`asesor` (tiempo activo) y
 * `tablaGrupo`/`tablaPersona` (detalle). La persona solo vale si hay un grupo elegido.
 */
export function useFiltroRolUsuarioParam(
  claveGrupo: string,
  clavePersona: string,
): { value: FiltroRolUsuario; setValue: (v: FiltroRolUsuario) => void } {
  const [params, setParams] = useSearchParams();
  const crudo = params.get(claveGrupo) ?? '';
  const grupo = crudo && parsearGrupoQuery(crudo) ? crudo : undefined;
  const personaCruda = params.get(clavePersona) ?? '';
  const persona = grupo && OBJECT_ID.test(personaCruda) ? personaCruda : undefined;

  return {
    value: { grupo, persona },
    setValue: (v) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (v.grupo) next.set(claveGrupo, v.grupo);
          else next.delete(claveGrupo);
          if (v.grupo && v.persona) next.set(clavePersona, v.persona);
          else next.delete(clavePersona);
          return next;
        },
        { replace: true },
      ),
  };
}
