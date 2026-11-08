import { Types } from 'mongoose';
import { findByIdScoped } from '../../repositories/base.repository.js';
import { publishRealtime } from '../../realtime/realtime.publisher.js';
import type { IMessageResponse } from '../conversation/conversation.types.js';
import { Cliente } from '../cliente/cliente.model.js';
import type { ICliente } from '../cliente/cliente.types.js';
import type { SandboxEfecto } from './sandbox.types.js';

type TenantId = string | Types.ObjectId;

/** Lo mínimo del cliente que hace falta para saber si es de prueba y de quién. */
export type ClienteDePrueba = Pick<ICliente, 'esPrueba' | 'pruebaOwnerId'>;

/** Dueño de la sesión si el cliente es de prueba; `null` si es un cliente real. */
export function ownerDePrueba(cliente: ClienteDePrueba | null | undefined): string | null {
  return cliente?.esPrueba && cliente.pruebaOwnerId ? String(cliente.pruebaOwnerId) : null;
}

/** Publica un mensaje de la conversación de prueba solo al admin que prueba. */
export async function emitirMensajePrueba(
  tenantId: TenantId,
  ownerId: string,
  message: IMessageResponse,
): Promise<void> {
  await publishRealtime({ type: 'sandbox:message', tenantId: String(tenantId), ownerId, message });
}

/**
 * Cuenta al chat de prueba algo que el sistema hizo. Es un **no-op** para un cliente real, así que
 * los puntos de efecto (flujo, semáforo, transferencia…) lo llaman sin preguntar antes quién es.
 * Nunca lanza: es un aviso, y no puede costarle al flujo el efecto que ya aplicó.
 */
export async function emitirEfectoPrueba(
  tenantId: TenantId,
  clienteId: string,
  efecto: SandboxEfecto,
): Promise<void> {
  try {
    const cliente = await findByIdScoped(Cliente, tenantId, clienteId)
      .select({ esPrueba: 1, pruebaOwnerId: 1 })
      .lean<ClienteDePrueba | null>();
    const ownerId = ownerDePrueba(cliente);
    if (!ownerId) return;
    await publishRealtime({
      type: 'sandbox:effect',
      tenantId: String(tenantId),
      ownerId,
      efecto,
      at: new Date().toISOString(),
    });
  } catch {
    // Un fallo al avisar no debe propagarse al efecto real que ya se aplicó.
  }
}

/**
 * ¿Este hilo es la conversación de prueba de un admin? Para etiquetar el consumo de IA (HU-IA-08):
 * una prueba cuesta tokens reales y debe poder distinguirse del tráfico de clientes. Falla suave: ante
 * cualquier error responde `false`, que es el comportamiento anterior a la historia.
 */
export async function esConversacionDePrueba(tenantId: TenantId, clienteId: string): Promise<boolean> {
  try {
    const cliente = await findByIdScoped(Cliente, tenantId, clienteId)
      .select({ esPrueba: 1 })
      .lean<Pick<ICliente, 'esPrueba'> | null>();
    return cliente?.esPrueba === true;
  } catch {
    return false;
  }
}
