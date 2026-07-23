// Catálogo BASE global de perfiles de administrador. Es el conjunto que el superadmin puede
// habilitar en un plan (`plan.perfilesPermitidos`). Las etiquetas PROPIAS de cada empresa viven
// tenant-scoped en la colección `admin_profiles` y no forman parte de este catálogo global.
export const PERFILES_BASE = [
  'vendedor',
  'asesor_comercial',
  'coordinador',
  'director',
  'gerente',
] as const;

export type PerfilBase = (typeof PERFILES_BASE)[number];

export interface IPerfilBase {
  key: PerfilBase;
  nombre: string;
}

export const PERFILES_BASE_CATALOGO: readonly IPerfilBase[] = [
  { key: 'vendedor', nombre: 'Vendedor' },
  { key: 'asesor_comercial', nombre: 'Asesor comercial' },
  { key: 'coordinador', nombre: 'Coordinador' },
  { key: 'director', nombre: 'Director' },
  { key: 'gerente', nombre: 'Gerente' },
];
