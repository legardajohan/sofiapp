import { apiClient } from '../../api/apiClient.js';

/** Latido de actividad (HU-REP-06). Sin cuerpo: quién y cuándo los decide el servidor. */
export async function enviarLatido(): Promise<void> {
  await apiClient.post('/activity/heartbeat');
}
