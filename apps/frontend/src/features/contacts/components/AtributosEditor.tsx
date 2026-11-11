import { useState } from 'react';
import { Lock, Plus, Settings2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { MOTIVO_DATOS_SENSIBLES, puedeConfigurar } from '@/lib/roles';
import { useAuthStore } from '@/stores/authStore';
import { camposPorKey, useContactFields } from '../hooks/useContactFields.js';
import type { AtributoInput } from '../types.js';
import type { ErroresAtributos } from '../lib/validate.js';
import { CamposPersonalizadosManager } from './CamposPersonalizadosManager.js';

interface Props {
  atributos: AtributoInput[];
  onChange: (atributos: AtributoInput[]) => void;
  /** Sin permiso, las filas sensibles se ven pero no se tocan, y los campos sensibles no se pueden elegir. */
  puedeEditarSensibles: boolean;
  disabled: boolean;
  /** Mensaje por fila (índice → texto): campo repetido, fila a medio llenar. */
  errores?: ErroresAtributos;
}

const MAX_ATRIBUTOS = 30;
const CREAR_CAMPO = '__crear__';

const pressable =
  'transition-[transform,color,background-color] duration-150 ease-out motion-safe:active:scale-[0.98]';

/**
 * Atributos personalizados de la ficha. Desde HU-FLOW-05 ya NO se teclea el nombre de cada atributo:
 * se **elige un campo del catálogo de la empresa** (el mismo que usan las preguntas de los flujos),
 * así «Colegio» es siempre el mismo dato en todos los contactos y la segmentación de campañas lo
 * puede juntar. Si el campo que hace falta no existe, «Crear campo…» abre el gestor del catálogo.
 * Qué es sensible y cómo se llama lo decide el catálogo, no la fila.
 */
export function AtributosEditor({
  atributos,
  onChange,
  puedeEditarSensibles,
  disabled,
  errores = {},
}: Props): React.ReactElement {
  const [gestorAbierto, setGestorAbierto] = useState(false);
  // El catálogo de campos es configuración de la empresa (AUTH-04): solo el Administrador lo edita.
  const gestionaCatalogo = puedeConfigurar(useAuthStore((s) => s.user));
  // Con archivados: un contacto puede conservar un campo que ya se retiró del catálogo, y hay que
  // poder resolver su nombre.
  const { data: campos = [] } = useContactFields(true);
  const porKey = camposPorKey(campos);
  const usadas = new Set(atributos.map((a) => a.key).filter(Boolean));

  function actualizar(indice: number, cambios: Partial<AtributoInput>): void {
    onChange(atributos.map((a, i) => (i === indice ? { ...a, ...cambios } : a)));
  }

  function elegirCampo(indice: number, key: string): void {
    if (key === CREAR_CAMPO) {
      setGestorAbierto(true);
      return;
    }
    const campo = porKey.get(key);
    if (!campo) return;
    actualizar(indice, { key: campo.key, label: campo.label, sensible: campo.sensible });
  }

  function agregar(): void {
    onChange([...atributos, { key: '', label: '', valor: '', sensible: false }]);
  }

  function quitar(indice: number): void {
    onChange(atributos.filter((_, i) => i !== indice));
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label>Campos personalizados</Label>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {atributos.length} / {MAX_ATRIBUTOS}
        </span>
      </div>

      {atributos.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
          Guarda aquí lo que no cabe en los campos fijos: colegio, grado, EPS, presupuesto. Los campos los defines
          una vez para toda la empresa; los marcados como sensibles solo los ve Dirección.
        </p>
      ) : (
        <ul className="space-y-2">
          {atributos.map((atributo, i) => {
            const campoActual = porKey.get(atributo.key);
            // Una fila sensible preexistente queda intacta para quien no puede tocarla.
            const bloqueada = atributo.sensible && !puedeEditarSensibles;
            const error = errores[i];
            const errorId = `atributo-error-${i}`;
            const archivado = campoActual !== undefined && !campoActual.activo;
            return (
              <li
                key={atributo.key || `nuevo-${i}`}
                className={cn(
                  'space-y-2 rounded-lg border bg-muted/30 px-2.5 py-2',
                  // El borde marca la fila entera: el mensaje dice qué pasa, el color dice dónde.
                  error ? 'border-destructive/50' : 'border-border',
                )}
              >
                <div className="flex items-center gap-2">
                  <Select
                    value={atributo.key || undefined}
                    onValueChange={(key) => elegirCampo(i, key)}
                    disabled={disabled || bloqueada}
                  >
                    <SelectTrigger
                      className="h-8 flex-1 text-xs"
                      aria-label={`Campo del atributo ${i + 1}`}
                      aria-invalid={error !== undefined}
                      aria-describedby={error ? errorId : undefined}
                    >
                      <SelectValue placeholder="Elige un campo" />
                    </SelectTrigger>
                    <SelectContent>
                      {campos
                        .filter((c) => c.activo && (c.key === atributo.key || !usadas.has(c.key)))
                        .map((c) => (
                          <SelectItem
                            key={c.key}
                            value={c.key}
                            className="text-xs"
                            disabled={c.sensible && !puedeEditarSensibles}
                          >
                            {c.label}
                            {c.sensible ? ' · sensible' : ''}
                          </SelectItem>
                        ))}
                      {archivado ? (
                        <SelectItem value={atributo.key} disabled className="text-xs">
                          {atributo.label} (archivado)
                        </SelectItem>
                      ) : null}
                      {gestionaCatalogo && (
                        <>
                          <SelectSeparator />
                          <SelectItem value={CREAR_CAMPO} className="text-xs">
                            Crear campo…
                          </SelectItem>
                        </>
                      )}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={cn('h-8 w-8 shrink-0 text-muted-foreground', pressable)}
                    aria-label={`Quitar el atributo ${atributo.label || i + 1}`}
                    disabled={disabled || bloqueada}
                    onClick={() => quitar(i)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <Input
                  aria-label={`Valor del atributo ${atributo.label || i + 1}`}
                  placeholder={atributo.key ? 'San José' : 'Primero elige el campo'}
                  className="h-8 text-xs"
                  value={atributo.valor}
                  disabled={disabled || bloqueada || atributo.key === ''}
                  maxLength={500}
                  aria-invalid={error !== undefined}
                  aria-describedby={error ? errorId : undefined}
                  onChange={(e) => actualizar(i, { valor: e.target.value })}
                />

                {error && (
                  <p id={errorId} className="text-[11px] text-destructive">
                    {error}
                  </p>
                )}

                {atributo.sensible && (
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Lock className="h-3 w-3" aria-hidden="true" />
                    Sensible: solo lo ven Dirección y Gerencia
                  </p>
                )}

                {bloqueada && (
                  <p className="text-[11px] text-muted-foreground">{MOTIVO_DATOS_SENSIBLES}</p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('flex-1', pressable)}
          disabled={disabled || atributos.length >= MAX_ATRIBUTOS}
          onClick={agregar}
        >
          <Plus className="h-4 w-4" />
          Agregar campo
        </Button>
        {gestionaCatalogo && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn('shrink-0 text-muted-foreground', pressable)}
            onClick={() => setGestorAbierto(true)}
          >
            <Settings2 className="h-4 w-4" />
            Administrar
          </Button>
        )}
      </div>

      {gestionaCatalogo && (
        <CamposPersonalizadosManager open={gestorAbierto} onOpenChange={setGestorAbierto} />
      )}
    </div>
  );
}
