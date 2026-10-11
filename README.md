# ROCAS | Cotizador de mano de obra y mensajes

La aplicación principal permite guardar cotizaciones, compartir una cotización específica con un cliente, recibir sus respuestas y mantener mensajes asociados al mismo folio y revisión.

## Uso

- Desde el historial, comparte una cotización marcada como **Enviada**. ROCAS pide confirmación antes de crear el enlace; no lo envía automáticamente.
- El cliente ve únicamente la cotización compartida y puede responder o enviar mensajes sin crear una cuenta.
- Desde **Mensajes de clientes**, ROCAS ve el folio y el nombre del cliente juntos, revisa las respuestas, responde y administra el enlace.
- Los enlaces vencen a los 30 días. Al eliminar una cotización compartida, el acceso del cliente se cierra y el enlace desaparece de la lista; el presupuesto original sigue en el historial.
- La eliminación de un enlace o mensaje queda protegida por confirmación y se conserva para recuperación. Solo la cuenta propietaria de ROCAS puede efectuarla.

## Seguridad

- Las tablas de enlaces, respuestas y mensajes tienen RLS; el cliente solo accede mediante un token aleatorio cuyo hash se almacena en el servidor.
- El propietario se verifica en el servidor para listar, responder y eliminar. Los clientes no pueden borrar mensajes ni cotizaciones.
- La vista del cliente expone únicamente la cotización compartida; no incluye fotos ni datos del control interno.
- Las claves secretas permanecen en Supabase; la página contiene únicamente la clave pública.

## Archivos principales

- `index.html`: cotizador ROCAS, historial y acceso al buzón.
- `mensajes.html`: cotizaciones compartidas, respuestas y mensajes del cliente.
- `cliente.html`: página del cliente para revisar una cotización y enviar respuestas o mensajes.
- `supabase/functions/rocas-client-share/index.ts`: creación y consulta de enlaces, mensajes, respuestas y eliminación protegida.
- `supabase/migrations/20261011_owner_protected_delete.sql`: campos de eliminación recuperable para enlaces y mensajes.
