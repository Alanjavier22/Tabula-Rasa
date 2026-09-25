# Tabula Rasa — contexto operativo del proyecto

Última actualización: 2026-09-20

Este archivo es la fuente operativa única para reanudar el trabajo. Los documentos de trabajo `TECH_DEBT.md` y `PLAN_LLM.md` fueron retirados del nivel raíz después de consolidar sus decisiones vigentes aquí; `HISTORIAL.md` conserva la cronología del proyecto.

## Graphify

Existe un grafo arquitectónico externo en `C:\Users\Alan\Documents\tabularasa_main\graphify-out`, generado por Graphify 0.9.28. Su estado fue actualizado el 2026-09-20 sin llamadas a Gemini: 2.099 nodos, 4.989 relaciones y 145 comunidades. Usarlo para preguntas de arquitectura, dependencias y flujo entre módulos, pero confirmar siempre contra el código porque las relaciones inferidas son orientación, no una fuente normativa.

Para regenerar el grafo después de refactors estructurales:

```powershell
graphify update C:\Users\Alan\Documents\tabularasa_main --force
```

La actualización de código es local y no requiere API key. Las etiquetas de comunidades pueden quedar pendientes de refrescar si cambia la estructura; eso no invalida el grafo de código.

## GitHub

El repositorio público `Alanjavier22/Tabula-Rasa` usa GitHub como respaldo de código y colaboración, no como almacenamiento de datos financieros. La configuración versionada vive en `.github/`: `ci.yml` valida backend y frontend sin llamar a Gemini, `codeql.yml` analiza Python y JavaScript/TypeScript, `release-please.yml` prepara releases mediante Pull Requests, `validate-commit-messages.yml` evita tipos de commit que Release Please no reconoce, las plantillas ordenan Issues y Pull Requests, y `release.yml` conserva la agrupación de notas de GitHub. `release-please-config.json`, `.release-please-manifest.json`, `version.txt` y `CHANGELOG.md` sostienen el versionado automático. Dependabot no forma parte de la estrategia del proyecto.

Las releases deben contener código y documentación, nunca `finance.db`, backups, `.env`, logs ni certificados. La Wiki ya tiene las páginas públicas `Inicio` y `Arquitectura`; GitHub Pages queda fuera de alcance. La protección activa de `main` exige Pull Request, los checks de backend y frontend aprobados y bloquea force push. El release vigente es `v0.1.16`. La fuente normativa de decisiones técnicas sigue siendo este archivo junto con `AGENTS.md`.

Flujo GitHub vigente: trabajar en una rama distinta de `main`, ejecutar la validación local, crear commits atómicos y descriptivos en español con prefijos Conventional Commits, publicar automáticamente la rama de trabajo, abrir o actualizar el Pull Request y esperar a que CI y CodeQL terminen en verde. Nunca hacer push directo a `main`, force push ni merge automático; la configuración del ruleset vive en GitHub y complementa las reglas locales de `AGENTS.md`.

Después de un merge a `main`, `release-please.yml` analiza los commits desde `v0.1.16`. Cuando detecta una funcionalidad, corrección, mejora de rendimiento o cambio incompatible que amerite versión, abre un Pull Request de release. Al fusionar ese PR, actualiza `version.txt` y `CHANGELOG.md`, crea el tag `vX.Y.Z` y publica la release automáticamente. Los cambios puramente documentales o de mantenimiento no se fuerzan como release. Los commits deben usar prefijos reconocibles (`feat:`, `fix:`, `perf:`, `security:`, `docs:`, `ci:`, `refactor:`, `test:` o `chore:`); las traducciones personalizadas del tipo no generan una release.

## Propósito

Tabula Rasa es una aplicación personal de finanzas, local-first, con backend FastAPI/SQLite y frontend React/Vite. La base financiera vive localmente; Gemini se usa únicamente en los flujos de IA que ya existen y con el contexto sanitizado por la aplicación.

## Estado actual

El proyecto está listo para continuar. No hay fallos bloqueantes conocidos.

Verificaciones vigentes:

- Backend: `43 passed`, sin warnings de pytest.
- Dependencias backend: `pip check` sin dependencias rotas.
- Esquema: `alembic check` sin operaciones nuevas.
- Frontend: TypeScript, lint con `--max-warnings 0` y build de producción correctos.
- Runtime: `/health` devuelve `healthy` y la base devuelve `healthy`.
- Integridad local revisada: 197 transacciones, 0 fingerprints nulos y 0 fingerprints duplicados.

## Arquitectura y decisiones de producto

### Acceso

- El flujo de producto está limitado actualmente a la máquina host: CORS y pairing solo contemplan orígenes loopback, y no existe un flujo multidispositivo. El lanzador actual hace que Uvicorn escuche en `0.0.0.0`, por lo que la exposición efectiva también depende del firewall y de la red del equipo.
- Se conserva el pairing local `Host-PC` necesario para la sesión local.
- Se retiraron pantalla QR, scanner QR, pairing remoto, gestión de dispositivos remotos y sus endpoints.
- Los registros antiguos de `paired_devices` no se borraron.

### SRI y Gemini

- Las importaciones nuevas conectan el flujo SRI para gastos automáticos que aún no tienen `sri_category`.
- Las transacciones manuales no deben clasificarse automáticamente.
- No ejecutar backfill histórico de SRI sin autorización explícita: el usuario decidió no gastar llamadas masivas a Gemini en esa tarea.
- Las demás funciones existentes de Gemini siguen operativas; la decisión solo pospone el backfill histórico.

### Datos y migraciones

- La base local actual ya está reconciliada y migrada.
- Se agregaron las migraciones `c1f4a7b8e9d0_reconcile_schema_and_fingerprints.py` y `c2d5e8f9a0b1_align_legacy_constraints.py`.
- Al restaurar una copia en otro computador, instalar dependencias, configurar el entorno y ejecutar Alembic sobre esa copia antes de levantar la aplicación.
- No compartir ni versionar `finance.db`, backups, `.env`, logs o certificados privados.

## Trabajo técnico ya aplicado

- Fingerprints canónicos v2 y asignación única para evitar duplicados de transacciones.
- Registro completo de modelos SQLAlchemy y metadata para Alembic.
- Correcciones en exportación de snapshots y balance sheet.
- Reintentos Gemini fuera del event loop en endpoints async.
- Apagado graceful del backend.
- Resolución de advertencias menores del frontend; la regla `react-hooks/set-state-in-effect` permanece como error para evitar regresiones.
- Migración de 15 esquemas Pydantic a `ConfigDict`.
- Cliente de pruebas alineado con `httpx2==2.13.0`.
- El menú de arranque comprueba también `jwt` dentro del entorno virtual.
- GitHub Actions valida automáticamente pruebas, dependencias, esquema, lint y build en Pull Requests hacia `main`, pushes a `main` y ejecuciones manuales. CodeQL analiza Python y JavaScript/TypeScript en Pull Requests, pushes, agenda semanal y ejecuciones manuales.

## Cómo arrancar

### Windows — recomendado

Desde la raíz, ejecutar `menu.bat` o `menu.ps1`. El menú crea/repara `backend/venv`, instala `backend/requirements.txt`, levanta backend y frontend y verifica `/health`.

### Backend manual

Desde `backend`:

```powershell
.\venv\Scripts\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8001
```

No usar `python -m uvicorn` con el Python global: puede no tener `PyJWT` ni las demás dependencias del proyecto.

### Frontend manual

Desde `frontend`:

```powershell
npm run dev
```

## Validación mínima antes de entregar cambios

Desde `backend`:

```powershell
.\venv\Scripts\python.exe -m pytest -q
.\venv\Scripts\python.exe -m alembic check
.\venv\Scripts\python.exe -m pip check
```

Desde `frontend`:

```powershell
npm run lint -- --max-warnings 0
npm run build
```

## Pendientes reales

No hay pendientes bloqueantes. Quedan como trabajo futuro o decisiones explícitas:

1. Módulo de vehículos: modelo, migraciones, endpoints y UI todavía no existen.
2. Backfill histórico SRI: pospuesto por decisión del usuario.
3. Multidispositivo/QR: pospuesto por decisión del usuario.
4. Flujo completo de restauración en otro computador: validar cuando se vaya a usar una instalación nueva, no como requisito para el desarrollo local actual.

## Forma de retomar una nueva conversación

1. Leer este archivo.
2. Ejecutar `git status --short` y preservar cambios no comprometidos.
3. Confirmar el estado con la validación mínima antes de introducir cambios grandes.
4. Si una solicitud contradice las decisiones de SRI histórico o multidispositivo, pedir confirmación antes de implementarla.
