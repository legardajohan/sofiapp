import { useMemo } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useCatalogosSegmento } from '../../hooks/useCatalogosSegmento.js';
import { useSegmentFacetas } from '../../hooks/useCampaigns.js';
import {
  combinacionRelevante,
  criteriosAplicados,
  limpiarCriterios,
  quitarCriterio,
} from '../../lib/segmento.js';
import { AudiencePanel } from './AudiencePanel.js';
import { CombinacionSelector } from './CombinacionSelector.js';
import { CriterioGrupo } from './CriterioGrupo.js';
import { CriteriosAplicados } from './CriteriosAplicados.js';
import type { IntencionCompra, SegmentPreviewDTO, SegmentoFiltros } from '../../types.js';

interface Props {
  valor: SegmentoFiltros;
  onChange: (filtros: SegmentoFiltros) => void;
  preview: SegmentPreviewDTO | undefined;
  cargando: boolean;
  actualizando: boolean;
  /** El diálogo está abierto: sin esto no se pide nada al servidor. */
  enabled: boolean;
}

/** Ejes secundarios: refinan la audiencia, no la definen. Van plegados bajo «Más criterios». */
const EJES_SECUNDARIOS = ['semaforoLead', 'intencionCompra', 'nivelInteres'] as const;

/**
 * «¿A quién le escribes?»: el constructor de audiencias de una campaña.
 *
 * Dos columnas en escritorio. A la izquierda se **decide** (etapas del CRM y etiquetas, que es como
 * el equipo ya piensa en su cartera, y debajo los refinamientos); a la derecha se **comprueba**
 * (cuántos, por qué no más, y quiénes). La columna de la derecha se queda fija mientras se recorre
 * la izquierda, para que cada clic tenga su consecuencia a la vista. En móvil se apilan y el
 * resumen queda debajo, tras los criterios, que es el orden natural de lectura.
 */
export function AudienceBuilder({
  valor,
  onChange,
  preview,
  cargando,
  actualizando,
  enabled,
}: Props): React.ReactElement {
  const { catalogos, cargando: cargandoCatalogos } = useCatalogosSegmento();
  const facetas = useSegmentFacetas(enabled);

  const conteoEtapas = useMemo(
    () =>
      facetas.data
        ? Object.fromEntries(facetas.data.etapas.map((e) => [e.key, e.contactos]))
        : undefined,
    [facetas.data],
  );
  const conteoEtiquetas = useMemo(
    () =>
      facetas.data
        ? Object.fromEntries(facetas.data.etiquetas.map((e) => [e.tagId, e.contactos]))
        : undefined,
    [facetas.data],
  );

  const criterios = criteriosAplicados(valor, catalogos);
  const secundariosActivos = EJES_SECUNDARIOS.reduce((n, eje) => n + (valor[eje]?.length ?? 0), 0);

  function parchear(parche: Partial<SegmentoFiltros>): void {
    onChange({ ...valor, ...parche });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="min-w-0 space-y-7">
        <div className="rounded-lg border border-border bg-card px-3 py-2.5">
          <CriteriosAplicados
            criterios={criterios}
            combinacion={valor.combinacion ?? 'y'}
            onQuitar={(eje, key) => onChange(quitarCriterio(valor, eje, key))}
            onLimpiar={() => onChange(limpiarCriterios(valor))}
          />
        </div>

        <CriterioGrupo
          titulo="Etapas del CRM"
          descripcion="En qué punto del embudo está su oportunidad."
          opciones={catalogos.etapas ?? []}
          seleccion={valor.etapas ?? []}
          onChange={(etapas) => parchear({ etapas })}
          conteos={conteoEtapas}
          cargando={cargandoCatalogos}
          vacio="Tu empresa todavía no tiene etapas configuradas. Créalas en Estados."
        />

        {combinacionRelevante(valor) ? (
          <CombinacionSelector
            valor={valor.combinacion ?? 'y'}
            onChange={(combinacion) => parchear({ combinacion })}
          />
        ) : null}

        <CriterioGrupo
          titulo="Etiquetas"
          descripcion="Las que tu equipo pone en las conversaciones."
          opciones={catalogos.tagIds ?? []}
          seleccion={valor.tagIds ?? []}
          onChange={(tagIds) => parchear({ tagIds })}
          conteos={conteoEtiquetas}
          cargando={cargandoCatalogos}
          vacio="Tu empresa todavía no tiene etiquetas. Créalas en Etiquetas."
        />

        <Accordion
          type="single"
          collapsible
          defaultValue={secundariosActivos > 0 ? 'mas' : undefined}
        >
          <AccordionItem value="mas" className="border-b-0 border-t border-border">
            <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
              <span>
                Más criterios
                <span className="ml-2 font-normal text-muted-foreground">
                  {secundariosActivos > 0
                    ? `${secundariosActivos} aplicado${secundariosActivos === 1 ? '' : 's'}`
                    : 'Semáforo, intención de compra e interés'}
                </span>
              </span>
            </AccordionTrigger>
            {/*
              Casillas a la vista y no un desplegable por eje: un `Popover` dentro del acordeón
              dentro del diálogo no llegaba a abrirse, y además así se ve qué hay elegido sin
              abrir nada. Los tres son opcionales: sin marcar ninguno, no restringen.
            */}
            <AccordionContent className="space-y-6 pt-1">
              <CriterioGrupo
                titulo="Semáforo del lead"
                descripcion="Opcional. Cómo va la oportunidad según tu equipo."
                opciones={catalogos.semaforoLead ?? []}
                seleccion={valor.semaforoLead ?? []}
                onChange={(semaforoLead) => parchear({ semaforoLead })}
                conteos={null}
                cargando={false}
                vacio="Tu empresa todavía no tiene semáforos configurados."
              />
              <CriterioGrupo
                titulo="Intención de compra"
                descripcion="Opcional. La que detectó Sofi en la conversación."
                opciones={catalogos.intencionCompra ?? []}
                seleccion={valor.intencionCompra ?? []}
                onChange={(keys) => parchear({ intencionCompra: keys as IntencionCompra[] })}
                conteos={null}
                cargando={false}
                vacio="Sin opciones."
              />
              <CriterioGrupo
                titulo="Nivel de interés"
                descripcion="Opcional. El que se marcó en la ficha del contacto."
                opciones={catalogos.nivelInteres ?? []}
                seleccion={valor.nivelInteres ?? []}
                onChange={(nivelInteres) => parchear({ nivelInteres })}
                conteos={null}
                cargando={false}
                vacio="Tu empresa todavía no tiene niveles de interés configurados."
              />
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      <div className="lg:sticky lg:top-0">
        <AudiencePanel
          filtros={valor}
          onChange={onChange}
          preview={preview}
          cargando={cargando}
          actualizando={actualizando}
          enabled={enabled}
        />
      </div>
    </div>
  );
}
