import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  type KbSectionDef,
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
 * Qué tiene que decir la pestaña de una sección sobre su propio estado.
 *
 * Son tres formas distintas y no un número universal, a propósito: «te faltan 2 obligatorios» y
 * «llevas 2 de 5 opcionales» son afirmaciones opuestas, y pintarlas con el mismo `2` convertiría el
 * indicador en un adorno ambiguo. La regla de exigencia es la misma de `camposFaltantes`
 * (`requisito !== 'opcional'` sobre los campos **visibles**), para que la pestaña y el botón Guardar
 * nunca puedan discrepar.
 */
type ProgresoSeccion =
  | { tipo: 'faltan'; cuantos: number }
  | { tipo: 'completa' }
  | { tipo: 'opcionales'; llenos: number; total: number };

function progresoDeSeccion(
  seccion: KbSectionDef,
  campos: Record<string, KbFieldValue>,
): ProgresoSeccion {
  const visibles = seccion.campos.filter((campo) => esVisible(campo, campos));
  const exigibles = visibles.filter((campo) => campo.requisito !== 'opcional');

  if (exigibles.length === 0) {
    return {
      tipo: 'opcionales',
      llenos: visibles.filter((campo) => !valorVacio(campos[campo.id])).length,
      total: visibles.length,
    };
  }

  const faltan = exigibles.filter((campo) => valorVacio(campos[campo.id])).length;
  return faltan === 0 ? { tipo: 'completa' } : { tipo: 'faltan', cuantos: faltan };
}

/**
 * El resumen que acompaña al título en la pestaña.
 *
 * El número del badge va `aria-hidden` y la información la da el `title`: sin eso, el **nombre
 * accesible** del `tab` pasaría a ser «Identidad 2» y quien navegue por voz o con lector de pantalla
 * tendría que adivinar de dónde sale ese número.
 */
function IndicadorSeccion({ progreso }: { progreso: ProgresoSeccion }): React.ReactElement | null {
  if (progreso.tipo === 'completa') {
    return (
      <>
        <Check className="size-3.5 shrink-0 text-success" aria-hidden="true" />
        <span className="sr-only">Sección completa</span>
      </>
    );
  }

  if (progreso.tipo === 'faltan') {
    const { cuantos } = progreso;
    return (
      <span
        title={cuantos === 1 ? 'Falta 1 campo obligatorio' : `Faltan ${cuantos} campos obligatorios`}
        aria-hidden="true"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[10px] font-semibold tabular-nums text-amber-700 dark:bg-amber-950 dark:text-amber-400"
      >
        {cuantos}
      </span>
    );
  }

  // Una sección sin campos visibles no tiene nada que resumir; el `0 de 0` sería ruido.
  if (progreso.total === 0) return null;

  return (
    <span className="shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
      {progreso.llenos} de {progreso.total}
    </span>
  );
}

/**
 * Cuerpo del modo estructurado: recorre el schema y **siempre** cierra con «Información adicional».
 *
 * Las secciones se navegan por **pestañas** desde HU-KB-12. `TabsContent` desmonta lo inactivo, que
 * es lo buscado —el admin ve una cosa a la vez—, y el precio de esa decisión lo paga el indicador de
 * cada pestaña: es lo único que le dice qué le falta en las secciones que no está mirando. Por eso
 * ninguna pestaña puede quedar muda, ni siquiera las que no exigen nada.
 *
 * «Información adicional» se renderiza fuera de las pestañas, a propósito. Es la vía de escape
 * garantizada —lo que el formulario no previó se escribe ahí— y esconderla tras una pestaña la
 * volvería fácil de no encontrar justo cuando más falta hace.
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
        // `defaultValue` y no `value`: el estado de pestaña es interno y se pierde al cerrar el
        // modal, que es lo que se quiere — cada vez que el admin abre una categoría, empieza por el
        // principio. Con `?.` en vez de `!`: el bloque ya está bajo `length > 0`, pero el tipo no lo
        // sabe y una aserción aquí solo serviría para callarlo.
        <Tabs defaultValue={schema.secciones[0]?.id} className="w-full">
          <TabsList className="flex h-auto w-full justify-start gap-1 overflow-x-auto p-1">
            {schema.secciones.map((seccion) => (
              <TabsTrigger key={seccion.id} value={seccion.id} className="shrink-0 gap-2">
                {seccion.titulo}
                <IndicadorSeccion progreso={progresoDeSeccion(seccion, estructura.campos)} />
              </TabsTrigger>
            ))}
          </TabsList>

          {schema.secciones.map((seccion) => (
            <TabsContent key={seccion.id} value={seccion.id} className="mt-4">
              <KnowledgeSection
                {...(seccion.descripcion !== undefined ? { descripcion: seccion.descripcion } : {})}
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
            </TabsContent>
          ))}
        </Tabs>
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
