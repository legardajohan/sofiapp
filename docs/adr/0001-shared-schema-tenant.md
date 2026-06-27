# ADR 0001 — Multi-tenancy: shared database / shared schema con `tenantId`

- **Estado:** Aceptada
- **Fecha:** 2026-06
- **Contexto:** SofiApp es un CRM SaaS que servirá a múltiples empresas bajo un mismo despliegue.
  Se necesita aislamiento de datos fiable con el menor costo operativo en la etapa inicial.

## Decisión

Usar **base de datos compartida / esquema compartido** con una columna discriminadora
`tenantId` obligatoria en cada documento. El aislamiento se fuerza en una única capa: el
*tenant-safe repository* (`base.repository.ts`), que inyecta `tenantId` en toda lectura y
escritura. El `tenantId` nace siempre del JWT.

## Alternativas consideradas

- **Database-per-tenant:** aislamiento físico fuerte, pero mayor costo y complejidad operativa
  (migraciones N veces, provisioning por cliente). Descartada para el MVP; posible evolución
  futura para clientes enterprise.
- **Schema/collection-per-tenant:** complejidad de routing dinámico y de índices. Descartada.

## Consecuencias

- (+) Costo mínimo; escalado horizontal por tenants sin cambiar el esquema; indexable por
  `tenantId`.
- (+) Aislamiento centralizado y testeable (un solo punto: el repositorio base).
- (−) Separación lógica, no física: una violación de las reglas del repositorio causaría fuga.
  Mitigación: tests de aislamiento obligatorios y checklist de PR.
- Excepciones documentadas: `login` y webhook de Meta (`phone_number_id`), más el Superadmin
  cross-tenant. Ver `docs/multi-tenancy.md`.
