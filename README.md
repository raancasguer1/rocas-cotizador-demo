# ROCAS: prueba aislada cliente–proveedor

## Estado

El flujo de cotización compartida y conversación sigue separado del flujo de presupuestos reales. El servidor solo admite cotizaciones con marcadores DEMO; no se deben enviar estos enlaces a clientes reales. La app principal conserva sus cotizaciones, historial, tarifas y respaldos. El botón “Cliente–proveedor · DEMO” del cotizador solo abre el panel aislado; todavía no toma ni modifica presupuestos guardados. Sus cambios PWA (icono instalable y apertura independiente) son aparte de este flujo de prueba.

La prueba incluye un enlace privado por cotización/revisión, una página de cliente sin cuenta y un hilo persistente de mensajes entre cliente y ROCAS. Las respuestas formales (consulta, cambio, aceptación o rechazo) permanecen separadas de los mensajes del hilo. El panel del propietario refresca los mensajes automáticamente; los mensajes y respuestas quedan ligados al mismo folio y revisión.

Los enlaces vencen a los 30 días y pueden revocarse. Mientras esté activo, el cliente puede volver a abrir el mismo enlace y continuar el hilo. Si el enlace vence o se revoca, el cliente deja de poder escribir; ROCAS conserva el historial.

## Seguridad de la prueba

- Tablas separadas: `rocas_quote_shares`, `rocas_quote_responses`, `rocas_quote_messages` y `rocas_contract_drafts`.
- RLS habilitado; el cliente no accede directamente a las tablas.
- El cliente llega a los datos y al hilo usando un token aleatorio; se guarda únicamente su hash.
- El servidor acepta solo cotizaciones ficticias `ROCAS-DEMO-*` con cliente, proyecto y actividades DEMO.
- La función valida manualmente la sesión del propietario y solo le muestra sus enlaces.
- No se guardan claves secretas en las páginas; no se comparten enlaces de clientes reales en esta fase.

## Archivos principales

- `index.html`: acceso aditivo “Cliente–proveedor · DEMO”; no cambia el historial ni el estado del cotizador.
- `cliente.html`: vista de cliente, respuestas formales y conversación.
- `portal-prueba.html`: panel ROCAS para crear enlaces ficticios, revisar respuestas y responder en el hilo.
- `supabase/functions/rocas-client-share/index.ts`: operaciones protegidas de compartir, consultar, responder, mensajes y revocación.
- `supabase/migrations/20261010_quote_share_layer.sql`: tablas originales de enlaces/respuestas.
- `supabase/migrations/20261010_quote_message_thread.sql`: tabla y política del hilo.
- `supabase/migrations/20261010_contract_draft_test.sql`: borrador de contrato ficticio con acceso de propietario.
- `contrato-prueba.html`: captura de contrato ligada a una aceptación demo; guarda el borrador en la capa aislada, ofrece descarga DOCX y prepara PDF con la impresión del navegador.
- `contract-export.js`: genera el DOCX localmente, sin dependencias de pago ni envío del contenido a un servicio externo.

## Prueba sugerida

1. En el panel ROCAS, crear un enlace ficticio.
2. Abrir el enlace de cliente y enviar un mensaje de prueba.
3. Ver el mensaje en el panel y responder como ROCAS.
4. Volver a la página del cliente y confirmar que aparece la respuesta.
5. Comprobar que ambos mensajes quedan en el mismo hilo y conservar el enlace mientras esté activo.
6. Desde una aceptación DEMO, guardar el borrador y reabrirlo para revisar la persistencia.
7. Descargar DOCX BORRADOR o abrir la impresión para “Guardar como PDF”; verificar los campos POR COMPLETAR y los avisos de no firma.

La aceptación en la app no es firma ni aprobación legal. Un borrador solo se guarda si existe una aceptación ficticia. DOCX y la impresión a PDF quedan marcados BORRADOR y usan campos POR COMPLETAR donde falte información; no modifican el cotizador real ni generan un contrato final.
