import { useState } from 'react';
import { AlertTriangle, Settings2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { CamposPersonalizadosManager } from '@/features/contacts/components/CamposPersonalizadosManager';
import { camposPorKey, useContactFields } from '@/features/contacts/hooks/useContactFields';
import { useContactOptions } from '@/features/contacts/hooks/useContactOptions';
import { TIPO_DATO_LABEL } from '@/features/contacts/types';
import { CAMPOS_FIJOS_CONTACTO, type CampoFijoContacto, type ConfigNodo, type DestinoCaptura } from '../types.js';

type Config = Extract<ConfigNodo, { tipo: 'captura' }>;

interface Props {
  config: Config;
  onChange: (config: ConfigNodo) => void;
}

const CREAR_CAMPO = '__crear__';

const LABEL_CAMPO_FIJO: Record<CampoFijoContacto, string> = {
  nombre: 'Nombre',
  correo: 'Correo',
  documento: 'Documento',
  rolContacto: 'Rol del contacto',
};

function Field({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function valorDeDestino(destino: DestinoCaptura | undefined): string {
  if (!destino || destino.tipo === 'variable') return 'variable';
  return destino.tipo === 'contacto' ? `contacto:${destino.campo}` : `atributo:${destino.key}`;
}

function Interruptor({
  titulo,
  ayuda,
  checked,
  onCheckedChange,
}: {
  titulo: string;
  ayuda: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}): React.ReactElement {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
      <div className="space-y-0.5">
        <Label className="text-xs font-medium text-foreground">{titulo}</Label>
        <p className="text-[11px] text-muted-foreground">{ayuda}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={titulo} className="mt-0.5" />
    </div>
  );
}

/**
 * Inspector del nodo `captura` (HU-FLOW-05). Lo nuevo es **«Guardar en»**: la respuesta puede quedarse
 * solo en una variable del flujo (como antes), llegar a un dato fijo de la ficha del contacto, o a un
 * campo personalizado del catálogo de la empresa. Con destino de ficha el nombre de la variable lo
 * fija el destino (así una condición siempre lee `var:nombre`, nunca un sinónimo) y el tipo de dato
 * también, por eso se muestran de solo lectura.
 */
export function CapturaForm({ config, onChange }: Props): React.ReactElement {
  const [gestorAbierto, setGestorAbierto] = useState(false);
  const { data: campos = [], isSuccess: camposListos } = useContactFields();
  const { data: opciones } = useContactOptions();

  const destino = config.destino ?? { tipo: 'variable' as const };
  const aFicha = destino.tipo !== 'variable';
  const porKey = camposPorKey(campos);
  const campoElegido = destino.tipo === 'atributo' ? porKey.get(destino.key) : undefined;
  // El campo elegido ya no está disponible (se archivó o se borró después de guardar el flujo).
  const campoPerdido = destino.tipo === 'atributo' && destino.key !== '' && camposListos && !campoElegido;
  const rolesActivos = (opciones?.rol ?? []).filter((o) => o.activo);

  function elegirDestino(valor: string): void {
    if (valor === CREAR_CAMPO) {
      setGestorAbierto(true);
      return;
    }
    if (valor === 'variable') {
      // Vuelve al comportamiento de siempre: el nombre de la variable se vuelve editable otra vez.
      const { saltarSiExiste: _s, sobrescribir: _o, ...resto } = config;
      void _s;
      void _o;
      onChange({ ...resto, destino: { tipo: 'variable' } });
      return;
    }
    const comunes = { saltarSiExiste: config.saltarSiExiste ?? true, sobrescribir: config.sobrescribir ?? false };
    if (valor.startsWith('contacto:')) {
      const campo = valor.slice('contacto:'.length) as CampoFijoContacto;
      onChange({ ...config, ...comunes, destino: { tipo: 'contacto', campo }, campo, tipoDato: 'texto' });
      return;
    }
    const key = valor.slice('atributo:'.length);
    const elegido = porKey.get(key);
    onChange({
      ...config,
      ...comunes,
      destino: { tipo: 'atributo', key },
      campo: key,
      tipoDato: elegido?.tipoDato ?? config.tipoDato,
    });
  }

  const ayudaDestino =
    destino.tipo === 'variable'
      ? 'La respuesta solo se usa dentro de este flujo.'
      : destino.tipo === 'contacto'
        ? `Se guarda en la ficha del contacto: ${LABEL_CAMPO_FIJO[destino.campo].toLowerCase()}.`
        : campoElegido
          ? `Se guarda en el campo personalizado «${campoElegido.label}».`
          : 'Elige el campo personalizado donde se guardará.';

  return (
    <div className="space-y-4">
      <Field label="Pregunta que se le hace al cliente">
        <Textarea
          value={config.pregunta}
          onChange={(e) => onChange({ ...config, pregunta: e.target.value })}
          placeholder="¿Cuál es tu correo?"
          rows={2}
        />
      </Field>

      <Field label="Guardar en">
        <Select value={valorDeDestino(config.destino)} onValueChange={elegirDestino}>
          <SelectTrigger className="h-9 text-sm" aria-label="Guardar en">
            <SelectValue placeholder="Elige dónde guardar la respuesta" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Solo en el flujo</SelectLabel>
              <SelectItem value="variable">Variable del flujo</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Dato del contacto</SelectLabel>
              {CAMPOS_FIJOS_CONTACTO.map((c) => (
                <SelectItem key={c} value={`contacto:${c}`}>
                  {LABEL_CAMPO_FIJO[c]}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Campo personalizado</SelectLabel>
              {campos.map((c) => (
                <SelectItem key={c.key} value={`atributo:${c.key}`}>
                  {c.label}
                </SelectItem>
              ))}
              {campoPerdido ? (
                <SelectItem value={`atributo:${destino.tipo === 'atributo' ? destino.key : ''}`} disabled>
                  {destino.tipo === 'atributo' ? destino.key : ''} (archivado)
                </SelectItem>
              ) : null}
              <SelectItem value={CREAR_CAMPO}>Crear campo…</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{ayudaDestino}</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="-ml-2 h-7 text-xs text-muted-foreground"
          onClick={() => setGestorAbierto(true)}
        >
          <Settings2 className="mr-1 h-3.5 w-3.5" />
          Administrar campos personalizados
        </Button>
      </Field>

      {campoPerdido ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive-subtle px-3 py-2 text-xs text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            El campo «{destino.tipo === 'atributo' ? destino.key : ''}» ya no está disponible. Elige otro para poder
            guardar el flujo.
          </span>
        </div>
      ) : null}

      <Field label={aFicha ? 'Nombre del dato (lo fija el destino)' : 'Nombre del dato (variable)'}>
        {aFicha ? (
          <Input readOnly value={`var:${config.campo}`} className="bg-muted/40 font-mono text-xs" aria-label="Variable" />
        ) : (
          <Input
            value={config.campo}
            onChange={(e) => onChange({ ...config, campo: e.target.value })}
            placeholder="correo"
          />
        )}
      </Field>

      <Field label="Qué se espera (para la IA que extrae la respuesta)">
        <Input
          value={config.descripcion}
          onChange={(e) => onChange({ ...config, descripcion: e.target.value })}
          placeholder="Correo electrónico del cliente"
        />
        {destino.tipo === 'contacto' && destino.campo === 'rolContacto' ? (
          <div className="mt-1.5 space-y-1">
            <p className="text-[11px] text-muted-foreground">La IA solo reconocerá estos roles de tu catálogo:</p>
            <div className="flex flex-wrap gap-1">
              {rolesActivos.length === 0 ? (
                <span className="text-[11px] text-muted-foreground">Aún no tienes roles activos.</span>
              ) : (
                rolesActivos.map((o) => (
                  <Badge key={o.id} variant="secondary" className="text-[10px] font-normal">
                    {o.label}
                  </Badge>
                ))
              )}
            </div>
          </div>
        ) : null}
      </Field>

      <Field label="Tipo de dato">
        {aFicha ? (
          <Input
            readOnly
            value={TIPO_DATO_LABEL[config.tipoDato]}
            className="bg-muted/40 text-sm"
            aria-label="Tipo de dato"
          />
        ) : (
          <Select
            value={config.tipoDato}
            onValueChange={(v) => onChange({ ...config, tipoDato: v as typeof config.tipoDato })}
          >
            <SelectTrigger className="h-9 text-sm" aria-label="Tipo de dato">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="texto">Texto</SelectItem>
              <SelectItem value="numero">Número</SelectItem>
              <SelectItem value="fecha">Fecha</SelectItem>
              <SelectItem value="booleano">Sí / No</SelectItem>
            </SelectContent>
          </Select>
        )}
      </Field>

      {aFicha ? (
        <div className="space-y-2">
          <Interruptor
            titulo="Saltar la pregunta si ya lo tengo"
            ayuda="Si el contacto ya tiene este dato, el flujo no se lo vuelve a preguntar y sigue de largo."
            checked={config.saltarSiExiste ?? true}
            onCheckedChange={(v) => onChange({ ...config, saltarSiExiste: v })}
          />
          <Interruptor
            titulo="Reemplazar el dato si ya existe"
            ayuda="Apagado: lo que ya está en la ficha no se pisa, aunque el cliente diga otra cosa."
            checked={config.sobrescribir ?? false}
            onCheckedChange={(v) => onChange({ ...config, sobrescribir: v })}
          />
        </div>
      ) : null}

      <CamposPersonalizadosManager open={gestorAbierto} onOpenChange={setGestorAbierto} />
    </div>
  );
}
