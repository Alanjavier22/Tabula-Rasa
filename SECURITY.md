# Política de seguridad

## Alcance

Tabula Rasa es una aplicación financiera local-first. La base de datos, los respaldos y la configuración sensible deben permanecer en la máquina del usuario y no deben publicarse en GitHub.

## Reportar una vulnerabilidad

No abras un issue público para reportar una vulnerabilidad. Utiliza un reporte privado de vulnerabilidad desde la pestaña **Security** del repositorio:

<https://github.com/Alanjavier22/Tabula-Rasa/security/advisories/new>

Incluye, sin adjuntar información financiera real:

- descripción clara del problema;
- pasos mínimos para reproducirlo;
- impacto estimado;
- versión, commit o entorno afectado;
- una posible mitigación, si la conoces.

Si el formulario de reporte privado no estuviera disponible, contacta al mantenedor mediante su perfil de GitHub y solicita un canal privado. No publiques tokens, claves, cookies, bases de datos, backups ni certificados.

## Secretos y datos que nunca deben versionarse

- `finance.db`, archivos SQLite y backups;
- `.env` y `.env.local`;
- `GEMINI_API_KEY`, `JWT_SECRET`, `CONFIG_ENCRYPTION_KEY` y credenciales de Google Drive;
- logs con contexto financiero o tokens;
- certificados y claves privadas.

El `.gitignore` del proyecto excluye estos archivos, pero cada contribución debe comprobar que no se hayan agregado accidentalmente.

## Versiones con soporte

Mientras no exista una release publicada, la rama `main` es la única línea de desarrollo soportada. Las versiones etiquetadas tendrán soporte según lo indicado en sus notas de release.
