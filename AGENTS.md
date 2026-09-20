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
- Los commits deben estar siempre en español, ser descriptivos y atómicos, agrupados por archivo o carpeta según el alcance. No usar mensajes pobres de una sola frase: el asunto debe identificar el área y el cambio concreto, y el cuerpo debe explicar el motivo, los cambios realizados y la validación ejecutada. Para que el versionado automático pueda interpretar los cambios, usar prefijos Conventional Commits reconocibles (`feat`, `fix`, `perf`, `security`, `docs`, `ci`, `refactor`, `test` o `chore`) y mantener en español el área, el asunto y el cuerpo. Formato recomendado:
  ```text
  tipo: área y cambio concreto

  Motivo: por qué se necesitaba el cambio.
  Cambios: qué se modificó y qué comportamiento queda establecido.
  Validación: pruebas, lint, build o comprobaciones ejecutadas.
  ```
- Flujo GitHub automático después de una entrega solicitada: trabajar en una rama distinta de `main`, validar el cambio, crear los commits y publicar automáticamente esa rama para abrir o actualizar el Pull Request correspondiente. Si hay commits locales hechos sobre `main` que aún no se han publicado, crear primero una rama de trabajo desde ese estado y continuar allí.
- La automatización anterior autoriza el `push` únicamente de la rama de trabajo y la creación o actualización del Pull Request. Nunca hacer `push` directo a `main`, force push, merge ni cambios remotos ajenos a la solicitud sin autorización explícita. Esperar CI y CodeQL, reportar el enlace del Pull Request y dejar el merge para la política configurada en GitHub o para la decisión del usuario.
- Después de integrar cambios en `main`, el workflow `release-please.yml` prepara automáticamente un Pull Request de release cuando los commits representan una nueva versión. Al integrar ese Pull Request, Release Please actualiza `version.txt` y `CHANGELOG.md`, crea el tag semver y publica la release de GitHub. Los cambios de documentación o mantenimiento que no impliquen una versión no deben forzarse como release.
- No crear commits ni borrar datos del usuario salvo que se solicite expresamente.
