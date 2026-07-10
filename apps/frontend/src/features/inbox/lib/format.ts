/** Iniciales para el avatar a partir del nombre o el teléfono. */
export function initials(nombre: string | null, telefono: string): string {
  const base = nombre?.trim() || telefono;
  const parts = base.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

/** Hora corta para hoy (HH:MM); fecha corta para días anteriores. */
export function shortTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (sameDay) {
    return d.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('es', { day: '2-digit', month: '2-digit' });
}
