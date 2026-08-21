interface ConditionalRevealProps {
  visible: boolean;
  children: React.ReactNode;
}

/**
 * Muestra u oculta un campo dependiente.
 *
 * Desmonta de verdad cuando no procede, en vez de esconderlo con CSS: un campo invisible que sigue
 * en el árbol lo seguirían anunciando los lectores de pantalla y lo seguiría alcanzando el tabulador.
 *
 * La aparición se anima solo bajo `motion-safe`; el valor del campo **no** se borra al ocultarse
 * (eso lo decide el formulario), pero el serializer sí lo excluye del texto que lee la IA.
 */
export function ConditionalReveal({
  visible,
  children,
}: ConditionalRevealProps): React.ReactElement | null {
  if (!visible) return null;

  return (
    <div className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-1 motion-safe:duration-200">
      {children}
    </div>
  );
}
