# Llamadas web: incremento inicial

Implementación del cliente web en primer plano, basada en `plan_cliente_llamadas.md` y contrastada con el backend local. No instala dependencias nuevas.

## Disponible

- Contratos tipados y eventos cliente/servidor separados sobre el WebSocket autenticado existente.
- Inicio de audio/video desde la cabecera de conversaciones privadas.
- Entrada global a la llamada, independiente del chat abierto; aceptar, rechazar, cancelar y finalizar.
- Un peer por llamada, únicamente en la conexión seleccionada por el servidor.
- Reserva INITIAL antes de crear ofertas; SDP con SHA-256, confirmaciones, deduplicación y cinco intentos de entrega como máximo.
- Candidatos anticipados almacenados por negociación; comprobación de generación ICE y límites del buffer.
- Credenciales autenticadas de `/turn/credentials`; audio/video remoto con reproducción manual si el navegador bloquea autoplay.
- Micrófono y cámara mediante `track.enabled`, sin ofertas adicionales.
- Estado conectado confirmado por el servidor, no por finalización de SDP.
- Sincronización periódica y al regresar a primer plano, correlacionada por syncId y sesión vigente.
- Cierre idempotente y descarte de operaciones tardías; el estado y la selección de conexión se consultan al servidor.

## Diferencias confirmadas con el plan

El backend registra el inicio como `CALL_INIT`, aunque el plan lo nombra `CALL_INITIATE`. El cliente envía `CALL_INIT`. El handler actual `call-initiate.ts` omite requestId en CALL_CREATED. Se conserva el requestId original para CALL_SYNC y solo se admite una solicitud local pendiente. Los estados de llamada son minúsculos; los de negociación son mayúsculos. Los errores del dispatcher no tienen identificadores de correlación: se muestran y se consulta el estado, sin atribuirlos arbitrariamente a una operación.

## Próximas etapas del plan

Este incremento cubre el flujo inicial C0–C4 y parte de C7. Permanecen pendientes C5 (añadir/sustituir dispositivos y renegociar medios), C6 (ICE restart y evidencia de recuperación de la nueva generación), C8 (historial con cursor ID) y C9 (React Native/Expo y notificaciones). C7 aún requiere persistir la referencia de llamada entre recargas completas. No se inventan eventos para cancelar negociaciones ni transferencia de propiedad entre sockets.

La implementación reconoce metadatos de futuras negociaciones, pero no ofrece controles para iniciarlas. Una conexión de medios que falla muestra el fallo; finalizar o volver a llamar sigue disponible.

## Validación

- `pnpm test:calls`: pruebas aisladas con medios y transporte simulados para hashes exactos, selección de conexión, duplicados, ICE anticipado, cierre, permisos tardíos, sincronización de cierres perdidos, reintentos y separación de conectividad/negociación.
- `pnpm build` y ESLint sobre los archivos modificados.
- Pendiente de validación funcional con dos usuarios reales: ejecutar backend y frontend sobre HTTPS (o localhost), iniciar sesión en dos perfiles de navegador y probar audio/video en ambos sentidos, rechazo, cancelación, permisos y desconexión. Repetir en redes diferentes y con `iceTransportPolicy: 'relay'` temporal en el peer para comprobar TURN. Restaurar la configuración normal después de la prueba.

Las pruebas simuladas no demuestran conectividad real ni disponibilidad de TURN. No se han validado segundo plano ni dispositivos móviles.

## Organización en src

- `calls/componentes/`: panel, controles, botones y reproductor. Solo componentes visuales.
- `context/call-context.ts`: contrato del contexto y `useCallContext()`, siguiendo el patrón de UserContext.
- `providers/call-provider.tsx`: estado React `call`, suscripción al flujo y funciones `handle…`, siguiendo el estilo de los providers de usuario y chat. Renderiza sus children.
- `hooks/use-call-*.ts` y `hooks/use-stream-playback.ts`: datos y acciones de presentación, reloj y reproducción.
- `pages/chat-page.tsx`: composición de los providers y del panel visual.
- `clients/call-client.ts`: conecta las funciones del flujo; el contexto expone el estado y las acciones, no este cliente.
- `types/call.ts`: contratos de eventos y tipos compartidos.
- `state/call-session.ts` y `state/call-store.ts`: sesión local y suscripciones internas.
- `services/call-lifecycle.ts`: inicio, aceptación, cierre y sincronización.
- `services/call-negotiation.ts`: SDP, cola de negociación y candidatos ICE.
- `events/`: manejadores de llamada/negociación y registro de suscripciones.
- `rtc/peer-session.ts`: recursos WebRTC y pistas locales/remotas.
- `signaling/`: entrega y reintentos de SDP, y SHA-256.
- `services/ice-api.ts`: consulta autenticada de credenciales ICE.
- `tests/call-client.test.mjs`: pruebas del flujo.

El recorrido de inicio es: `start` → `CALL_CREATED` → `CALL_ACCEPT` → reserva de negociación → oferta/respuesta → confirmación de conexión del servidor. Los handlers de eventos reciben explícitamente el store y las funciones que necesitan. Los recursos de peer y entrega se crean mediante funciones con estado local a cada sesión.

El cliente WebSocket conserva su API original (`emit` y `on`). Las llamadas no observan el transporte ni interpretan un retorno de `emit` como confirmación. Los cierres se aplican mediante eventos del servidor o snapshots `CALL_STATE`; la consulta periódica permite reconciliar eventos perdidos. Una desconexión no genera limpieza inmediata por sí sola en el módulo de llamadas.

## Interfaz y tono entrante

El panel usa una presentación oscura con avatar, nombre del participante disponible en las conversaciones y controles circulares. En móvil ocupa toda la pantalla; en escritorio aparece como un diálogo centrado con navegación de teclado y foco contenido. El video remoto ocupa el fondo y el local aparece como miniatura.

`hooks/use-incoming-call-sound.ts` reproduce el tono únicamente mientras la llamada sea entrante y esté en `ringing`. Al cambiar el estado, cambiar de llamada o desmontarse, detiene el audio. Si el navegador bloquea autoplay, se reintenta al interactuar con la aplicación.

`services/call-ringtone.ts` administra la reproducción en bucle y su limpieza. `public/sounds/incoming-call.wav` es un tono original generado para la aplicación; no utiliza el audio de WhatsApp ni requiere descargas externas.

## Notificaciones de llamadas

Los avisos de llamadas reutilizan el permiso de notificaciones y la suscripción push gestionados por UserProvider. No hay una activación independiente en el menú de llamadas.

`services/call-notifications.ts` observa los snapshots en la suscripción de `CallProvider`. Muestra una notificación entrante por llamada y la cierra al dejar de sonar o expirar. Muestra una notificación perdida cuando el servidor indica `missed` o `NO_ANSWER`, incluso por sincronización. Rechazar, atender en otro dispositivo y realizar llamadas salientes no producen avisos de llamada perdida.

Se utiliza `ServiceWorkerRegistration.showNotification` si existe un worker activo. Las notificaciones entrantes incluyen **Aceptar** y **Rechazar**; las perdidas solo abren el chat. Pulsar el cuerpo de un aviso entrante equivale a Aceptar: abre el chat y atiende la llamada después de consultar su estado. En escritorio/desarrollo, `Notification` sirve como alternativa sin botones, y su clic también entrega la intención de aceptar al cliente. La presentación de las acciones depende del navegador y del sistema operativo.

Los avisos recibidos por push se muestran en `sw.ts`, incluso con la aplicación cerrada. El worker y el cliente utilizan la misma etiqueta por tipo de aviso y callId para reemplazar notificaciones repetidas. La push perdida cierra el aviso entrante de esa llamada. La suscripción sigue siendo administrada por UserProvider; denegar el permiso no impide recibir llamadas dentro de la interfaz.

## Responder desde una notificación

El service worker entrega la acción elegida (Aceptar también al pulsar el cuerpo) mediante `CALL_NOTIFICATION_ACTION` y un MessageChannel con confirmación. Aceptar enfoca el chat; Rechazar puede entregarse a un chat abierto en segundo plano. No se recarga una pestaña activa. Si no hay chat listo, se abre `/chat?answerCall=<callId>` o `/chat?rejectCall=<callId>`. El hook `use-notification-call-action.ts` consume la intención una sola vez y conserva los demás parámetros de navegación.

`answerFromNotification` y `rejectFromNotification` guardan la intención y solicitan CALL_SYNC. El snapshot del servidor determina participante, rol, medio y estado. Solo se envía CALL_ACCEPT o CALL_REJECT cuando la llamada sigue timbrando para el receptor y no ha expirado. No se toma una llamada atendida en otra conexión ni se reemplaza una llamada local distinta. Las respuestas repetidas no duplican el envío. No se cambian la autenticación ni la API del cliente WebSocket.

Mientras se consulta/responde no se muestra otro aviso entrante. Una consulta sin respuesta cancela la intención a los 15 segundos. Los permisos de micrófono/cámara siguen siendo gestionados por el navegador. Con la app cerrada, Rechazar necesita abrirla para autenticar y enviar la respuesta mediante el WebSocket existente.
