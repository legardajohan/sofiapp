import { useState } from 'react';
import { Smile } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  EmojiPicker,
  EmojiPickerContent,
  EmojiPickerFooter,
  EmojiPickerSearch,
} from '@/components/ui/emoji-picker';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface Props {
  disabled: boolean;
  /** Recibe el emoji ya con el tono de piel elegido. */
  onElegir: (emoji: string) => void;
  /** Al abrir: el composer guarda dónde estaba el cursor antes de que el foco salga del campo. */
  onAbrir: () => void;
  /** Al cerrar: el composer devuelve el foco al campo de texto, no a este botón. */
  onCerrar: () => void;
}

/**
 * Botón y selector de emojis del composer (HU-OMNI-07).
 *
 * **No se cierra al elegir**: lo normal es poner dos o tres seguidos (🙌🏽🎉), y reabrirlo cada vez
 * sería un clic de más por emoji. Se cierra con Esc, al pulsar fuera o volviendo a pulsar el botón.
 */
export function EmojiButton({ disabled, onElegir, onAbrir, onCerrar }: Props): React.ReactElement {
  const [abierto, setAbierto] = useState(false);

  return (
    <Popover
      open={abierto && !disabled}
      onOpenChange={(siguiente) => {
        if (siguiente) onAbrir();
        setAbierto(siguiente);
      }}
    >
      {/* `disabled` en el disparador además del botón: con `asChild` Radix no lo hereda (mismo
          motivo que el menú de adjuntar). */}
      <PopoverTrigger asChild disabled={disabled}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          aria-label="Insertar emoji"
          className="shrink-0 transition-transform duration-150 ease-out active:scale-95"
        >
          <Smile />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-fit p-0"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onCerrar();
        }}
      >
        <EmojiPicker
          className="h-[340px]"
          locale="es"
          columns={8}
          onEmojiSelect={({ emoji }) => onElegir(emoji)}
        >
          <EmojiPickerSearch placeholder="Buscar emoji" aria-label="Buscar emoji" autoFocus />
          <EmojiPickerContent labels={{ loading: 'Cargando emojis…', empty: 'Ningún emoji coincide.' }} />
          <EmojiPickerFooter emptyLabel="Elige un emoji" />
        </EmojiPicker>
      </PopoverContent>
    </Popover>
  );
}
