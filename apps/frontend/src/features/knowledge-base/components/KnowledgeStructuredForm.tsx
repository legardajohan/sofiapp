import { Accordion } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DIAS_SEMANA,
  LIMITE_POR_KIND,
  esVisible,
  limiteDeCampo,
  maxItemsDeCampo,
  valorVacio,
  type KbFieldDef,
  type KbSchemaDef,
} from '../lib/kb-schemas.js';
import type { KbEstructura, KbFieldValue, KbScheduleDay } from '../types/index.js';
import { ConditionalReveal } from './fields/ConditionalReveal.js';
import { FieldCounter, KnowledgeField } from './fields/KnowledgeField.js';
import { KnowledgeSection } from './fields/KnowledgeSection.js';
import { PolicyTriState } from './fields/PolicyTriState.js';
import { RepeatableList } from './fields/RepeatableList.js';
import { ScheduleDayEditor } from './fields/ScheduleDayEditor.js';

const ADICIONAL_MAX = LIMITE_POR_KIND['texto-largo'];
const ERROR_OBLIGATORIO = 'Falta completarlo.';

/**
 * Lecturas seguras del valor guardado. Un campo puede tener guardado un valor de otro `tipo` si el
 * schema cambió de forma entre versiones; en ese caso se parte de vacío en vez de reventar el modal.
 * El dato viejo no se pierde: sigue en `campos` y el serializer lo emite bajo «Otros datos».
 */
function leerTexto(valor: KbFieldValue | undefined): string {
  return valor?.tipo === 'texto' ? valor.valor : '';
}

function leerLista(valor: KbFieldValue | undefined): string[] {
  return valor?.tipo === 'lista' ? valor.valores : [];
}

function leerTriestado(valor: KbFieldValue | undefined): { valor: 'si' | 'no' | 'na'; detalle: string } {
  return valor?.tipo === 'triestado'
    ? { valor: valor.valor, detalle: valor.detalle ?? '' }
    : { valor: 'na', detalle: '' };
}

function leerHorario(valor: KbFieldValue | undefined): KbScheduleDay[] {
  const guardados = valor?.tipo === 'horario' ? valor.dias : [];
  // Siempre los 7 días, en orden canónico: el admin no debería tener que "crear" el martes.
  return DIAS_SEMANA.map(
    (dia) => guardados.find((d) => d.dia === dia) ?? { dia, cerrado: false, intervalos: [] },
  );
}

function leerRepetible(valor: KbFieldValue | undefined): Array<Record<string, string>> {
  return valor?.tipo === 'repetible' ? valor.items : [];
}

interface CampoProps {
  campo: KbFieldDef;
  estructura: KbEstructura;
  onCampoChange: (id: string, valor: KbFieldValue) => void;
  mostrarErrores: boolean;
}

/** Un campo del schema, con el control que le toca a su `kind`. */
function Campo({ campo, estructura, onCampoChange, mostrarErrores }: CampoProps): React.ReactElement {
  const valor = estructura.campos[campo.id];
  const id = `kb-campo-${campo.id}`;
  const max = limiteDeCampo(campo);
  const exigible = campo.requisito !== 'opcional';
  const error = mostrarErrores && exigible && valorVacio(valor) ? ERROR_OBLIGATORIO : undefined;

  const marco = (contenido: React.ReactNode, length?: number): React.ReactElement => (
    <KnowledgeField
      htmlFor={id}
      etiqueta={campo.etiqueta}
      requisito={campo.requisito}
      {...(campo.ayuda !== undefined ? { ayuda: campo.ayuda } : {})}
      {...(length !== undefined ? { length, maxLength: max } : {})}
      {...(error !== undefined ? { error } : {})}
    >
      {contenido}
    </KnowledgeField>
  );

  switch (campo.kind) {
    case 'texto-corto': {
      const texto = leerTexto(valor);
      return marco(
        <Input
          id={id}
          value={texto}
          maxLength={max}
          onChange={(e) => onCampoChange(campo.id, { tipo: 'texto', valor: e.target.value })}
          aria-invalid={error !== undefined}
        />,
        texto.length,
      );
    }

    case 'texto-medio':
    case 'texto-largo': {
      const texto = leerTexto(valor);
      return marco(
        <Textarea
          id={id}
          className="resize-y"
          rows={campo.kind === 'texto-largo' ? 5 : 2}
          value={texto}
          maxLength={max}
          onChange={(e) => onCampoChange(campo.id, { tipo: 'texto', valor: e.target.value })}
          aria-invalid={error !== undefined}
        />,
        texto.length,
      );
    }

    case 'lista': {
      const valores = leerLista(valor);
      return marco(
        <RepeatableList
          items={valores}
          onChange={(siguientes) => onCampoChange(campo.id, { tipo: 'lista', valores: siguientes })}
          crearItem={() => ''}
          maxItems={maxItemsDeCampo(campo)}
          etiquetaAgregar={`Añadir a ${campo.etiqueta.toLocaleLowerCase('es')}`}
          vacio={`Todavía no agregaste nada en ${campo.etiqueta.toLocaleLowerCase('es')}.`}
          nombreItem="elemento"
          renderItem={(item, index, onItemChange) => (
            <Input
              aria-label={`${campo.etiqueta} ${index + 1}`}
              value={item}
              maxLength={max}
              onChange={(e) => onItemChange(e.target.value)}
            />
          )}
        />,
      );
    }

    case 'triestado': {
      const { valor: respuesta, detalle } = leerTriestado(valor);
      return marco(
        <PolicyTriState
          id={id}
          valor={respuesta}
          onValorChange={(siguiente) =>
            onCampoChange(campo.id, { tipo: 'triestado', valor: siguiente, detalle })
          }
          detalle={detalle}
          onDetalleChange={(siguiente) =>
            onCampoChange(campo.id, { tipo: 'triestado', valor: respuesta, detalle: siguiente })
          }
        />,
      );
    }

    case 'horario': {
      const dias = leerHorario(valor);
      return marco(
        <div className="space-y-2">
          {dias.map((dia, index) => (
            <ScheduleDayEditor
              key={dia.dia}
              id={`${id}-${dia.dia}`}
              dia={dia}
              onChange={(siguiente) =>
                onCampoChange(campo.id, {
                  tipo: 'horario',
                  dias: dias.map((d, i) => (i === index ? siguiente : d)),
                })
              }
            />
          ))}
        </div>,
      );
    }

    case 'repetible': {
      const items = leerRepetible(valor);
      const subcampos = campo.subcampos ?? [];
      return marco(
        <RepeatableList
          items={items}
          onChange={(siguientes) => onCampoChange(campo.id, { tipo: 'repetible', items: siguientes })}
          crearItem={() => Object.fromEntries(subcampos.map((sub) => [sub.id, '']))}
          maxItems={maxItemsDeCampo(campo)}
          etiquetaAgregar={`Añadir a ${campo.etiqueta.toLocaleLowerCase('es')}`}
          vacio={`Todavía no agregaste nada en ${campo.etiqueta.toLocaleLowerCase('es')}.`}
          nombreItem="elemento"
          renderItem={(item, index, onItemChange) => (
            <div className="grid gap-2 sm:grid-cols-2">
              {subcampos.map((sub) => (
                <Input
                  key={sub.id}
                  aria-label={`${sub.etiqueta} ${index + 1}`}
                  placeholder={sub.etiqueta}
                  value={item[sub.id] ?? ''}
                  maxLength={sub.maxLength ?? max}
                  onChange={(e) => onItemChange({ ...item, [sub.id]: e.target.value })}
                />
              ))}
            </div>
          )}
        />,
      );
    }
  }
}

interface KnowledgeStructuredFormProps {
  schema: KbSchemaDef;
  estructura: KbEstructura;
  onEstructuraChange: (estructura: KbEstructura) => void;
  /** Los errores rojos aparecen solo tras un intento de guardado; el marcador ya avisa antes. */
  mostrarErrores: boolean;
}

/**
 * Cuerpo del modo estructurado: recorre el schema y **siempre** cierra con «Información adicional».
 *
 * Ese bloque final se renderiza fuera del acordeón, a propósito. Es la vía de escape garantizada
 * —lo que el formulario no previó se escribe ahí— y esconderla tras una sección plegada la volvería
 * fácil de no encontrar justo cuando más falta hace.
 */
export function KnowledgeStructuredForm({
  schema,
  estructura,
  onEstructuraChange,
  mostrarErrores,
}: KnowledgeStructuredFormProps): React.ReactElement {
  function onCampoChange(id: string, valor: KbFieldValue): void {
    onEstructuraChange({ ...estructura, campos: { ...estructura.campos, [id]: valor } });
  }

  return (
    <div className="space-y-4">
      {schema.secciones.length > 0 && (
        <Accordion
          type="multiple"
          // Todas abiertas de entrada: el acordeón está para poder plegar lo ya resuelto, no para
          // esconder de arranque un formulario que el admin todavía no sabe qué contiene.
          defaultValue={schema.secciones.map((seccion) => seccion.id)}
          className="rounded-lg border border-border px-4"
        >
          {schema.secciones.map((seccion) => {
            const visibles = seccion.campos.filter((campo) => esVisible(campo, estructura.campos));
            const llenos = visibles.filter((campo) => !valorVacio(estructura.campos[campo.id])).length;

            return (
              <KnowledgeSection
                key={seccion.id}
                id={seccion.id}
                titulo={seccion.titulo}
                {...(seccion.descripcion !== undefined ? { descripcion: seccion.descripcion } : {})}
                llenos={llenos}
                total={visibles.length}
              >
                {seccion.campos.map((campo) => (
                  <ConditionalReveal key={campo.id} visible={esVisible(campo, estructura.campos)}>
                    <Campo
                      campo={campo}
                      estructura={estructura}
                      onCampoChange={onCampoChange}
                      mostrarErrores={mostrarErrores}
                    />
                  </ConditionalReveal>
                ))}
              </KnowledgeSection>
            );
          })}
        </Accordion>
      )}

      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <Label htmlFor="kb-adicional">Información adicional</Label>
          <FieldCounter length={estructura.adicional.length} max={ADICIONAL_MAX} />
        </div>
        <p className="text-xs text-muted-foreground">
          Todo lo que la IA deba saber y no encaje en los campos de arriba.
        </p>
        <Textarea
          id="kb-adicional"
          className="resize-y"
          rows={schema.secciones.length === 0 ? 10 : 4}
          value={estructura.adicional}
          maxLength={ADICIONAL_MAX}
          onChange={(e) => onEstructuraChange({ ...estructura, adicional: e.target.value })}
          placeholder="Escribe o pega aquí cualquier dato extra…"
        />
      </div>
    </div>
  );
}
