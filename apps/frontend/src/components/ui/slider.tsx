import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

interface SliderProps extends React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root> {
  /**
   * `transparente` (HU-OMNI-07): pista y rango invisibles, para montar el slider encima de otra
   * representación del progreso (la onda de una nota de voz) y conservar su accesibilidad —rol
   * `slider`, flechas, `aria-valuetext`— sin pintar una barra encima.
   */
  variant?: "default" | "transparente"
  /** Clases extra del pulgar (p. ej. su color sobre una burbuja saliente). */
  thumbClassName?: string
  /**
   * Nombre y valor accesibles. Van al **pulgar**, que es el elemento con rol `slider` en Radix:
   * puestos en la raíz, el lector de pantalla anuncia un slider sin nombre.
   */
  thumbAriaLabel?: string
  thumbAriaValueText?: string
}

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  SliderProps
>(({ className, variant = "default", thumbClassName, thumbAriaLabel, thumbAriaValueText, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    className={cn(
      "relative flex w-full touch-none select-none items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track
      className={cn(
        "relative w-full grow overflow-hidden rounded-full",
        variant === "transparente" ? "h-full bg-transparent" : "h-1.5 bg-primary/20"
      )}
    >
      <SliderPrimitive.Range
        className={cn("absolute h-full", variant === "transparente" ? "bg-transparent" : "bg-primary")}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb
      aria-label={thumbAriaLabel}
      aria-valuetext={thumbAriaValueText}
      className={cn(
        "block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
        thumbClassName
      )}
    />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
