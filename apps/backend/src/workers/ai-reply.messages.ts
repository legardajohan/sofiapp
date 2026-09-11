/**
 * Los mensajes que Sofi envía **sin pasar por el modelo** (HU-IA-02).
 *
 * Viven juntos y aparte porque son *copy de cara al cliente*, no detalle de implementación: se
 * revisan, se aprueban y algún día se traducen como tales. Enterrarlos en medio de un worker los
 * volvería invisibles para quien tiene que cuidarlos.
 *
 * Ambos se envían como `sender: 'bot'`, así que en la bandeja aparecen firmados por Sofi igual que
 * una respuesta generada, y cuentan para la cuota mensual como cualquier saliente.
 */

/**
 * Cuando la generación falla. Dice tres cosas y ninguna más: que se recibió el mensaje, que ahora
 * mismo no hay respuesta, y que ya hay una persona en camino — para que el cliente no repita la
 * pregunta ni se quede esperando en silencio.
 */
export const MENSAJE_FALLO =
  'Estoy teniendo problemas para responderte en este momento. Ya avisé a un asesor para que ' +
  'continúe contigo.';

/**
 * Cuando llega un audio, una imagen o un documento. No se disculpa ni se extiende: nombra el
 * límite y ofrece la salida, que es lo único accionable para quien está al otro lado.
 */
export const MENSAJE_SOLO_TEXTO =
  'Por ahora solo puedo leer mensajes de texto. Si me escribes tu consulta, te respondo enseguida.';

/**
 * Cuando se dispara una regla de handoff (HU-IA-03). Es el **valor de fábrica**: cada empresa lo
 * reescribe desde el panel, así que tiene que funcionar sin saber nada del negocio de nadie.
 *
 * Habla en pasado y en primera persona ("ya le pasé") en vez de prometer un plazo: Sofi no sabe
 * cuándo va a contestar el asesor, y un "en unos minutos" que no se cumple es peor que no decir
 * nada. Tampoco pide disculpas — el cliente pidió una persona y la está obteniendo.
 */
export const MENSAJE_HANDOFF =
  'Ya le pasé tu conversación a un asesor del equipo para que continúe contigo por aquí mismo.';
