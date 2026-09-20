# Tabula Rasa — instrucciones de continuidad

Antes de modificar el proyecto, leer `.agents/PROJECT_CONTEXT.md`. Ese archivo es el resumen operativo vigente: arquitectura, decisiones de producto, estado técnico, comandos de validación y pendientes reales.

Para contexto histórico y decisiones anteriores, consultar `HISTORIAL.md`.

Para preguntas de arquitectura, relaciones entre archivos o flujo de datos, usar el grafo Graphify externo en `C:\Users\Alan\Documents\tabularasa_main\graphify-out`. Consultar primero su `graph.json`/`GRAPH_REPORT.md`; regenerarlo después de refactors estructurales con `graphify update C:\Users\Alan\Documents\tabularasa_main --force`.

Reglas de continuidad:

- Preservar cambios existentes y revisar `git status` antes de editar.
- No ejecutar backfill histórico de SRI ni consumir Gemini masivamente sin autorización explícita.
- No reintroducir pairing remoto, QR ni multidispositivo sin una nueva decisión de producto.
- Usar `backend/venv` para Python; no asumir que el Python global tiene las dependencias del proyecto.
- Validar cambios proporcionales al alcance; como mínimo, conservar la suite backend, `alembic check`, lint y build del frontend en verde.
- Los commits deben estar siempre en español, ser descriptivos y atómicos, agrupados por archivo o carpeta según el alcance. No usar mensajes pobres de una sola frase: el asunto debe identificar el área y el cambio concreto, y el cuerpo debe explicar el motivo, los cambios realizados y la validación ejecutada. Formato recomendado:
  ```text
  tipo: área y cambio concreto

  Motivo: por qué se necesitaba el cambio.
  Cambios: qué se modificó y qué comportamiento queda establecido.
  Validación: pruebas, lint, build o comprobaciones ejecutadas.
  ```
- No ejecutar `push` ni ninguna operación remota sin confirmación explícita del usuario.
- No crear commits ni borrar datos del usuario salvo que se solicite expresamente.
