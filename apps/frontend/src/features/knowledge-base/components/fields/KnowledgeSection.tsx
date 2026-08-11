interface KnowledgeSectionProps {
  descripcion?: string;
  children: React.ReactNode;
}

/**
 * Panel de una sección del formulario guiado. Se monta dentro de un `TabsContent`, que es quien
 * decide cuándo está visible.
 *
 * **Ya no lleva contador** (HU-KB-12). Con el acordeón, el `3 de 5` del encabezado era la única
 * información disponible con la sección plegada; con pestañas, ese resumen vive en el
 * `TabsTrigger` —que es donde el admin lo necesita, porque desde una pestaña tiene que poder ver
 * qué le falta **en las otras**—. Dejarlo también aquí sería repetir el mismo número a dos
 * centímetros de sí mismo.
 *
 * Queda tan delgado a propósito: sigue existiendo para que el formulario no tenga que repetir el
 * espaciado ni la tipografía de la descripción en cada rama.
 */
export function KnowledgeSection({
  descripcion,
  children,
}: KnowledgeSectionProps): React.ReactElement {
  return (
    <div className="space-y-4">
      {descripcion && <p className="text-xs text-muted-foreground">{descripcion}</p>}
      {children}
    </div>
  );
}
