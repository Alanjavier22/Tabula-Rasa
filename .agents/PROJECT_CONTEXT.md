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

El repositorio público `Alanjavier22/Tabula-Rasa` usa GitHub como respaldo de código y colaboración, no como almacenamiento de datos financieros. La configuración versionada vive en `.github/`: `ci.yml` valida backend y frontend sin llamar a Gemini, las plantillas ordenan Issues y Pull Requests, y `release.yml` prepara notas agrupadas para futuras releases. Dependabot no forma parte de la estrategia del proyecto.

Las releases deben contener código y documentación, nunca `finance.db`, backups, `.env`, logs ni certificados. La Wiki es una opción de documentación pública futura; GitHub Pages queda fuera de alcance. La fuente normativa de decisiones técnicas sigue siendo este archivo junto con `AGENTS.md`.

## Propósito

Tabula Rasa es una aplicación personal de finanzas, local-first, con backend FastAPI/SQLite y frontend React/Vite. La base financiera vive localmente; Gemini se usa únicamente en los flujos de IA que ya existen y con el contexto sanitizado por la aplicación.

## Estado actual

El proyecto está listo para continuar. No hay fallos bloqueantes conocidos.

Verificaciones vigentes:

- Backend: `42 passed`, sin warnings de pytest.
- Dependencias backend: `pip check` sin dependencias rotas.
- Esquema: `alembic check` sin operaciones nuevas.
- Frontend: TypeScript, lint con `--max-warnings 0` y build de producción correctos.
- Runtime: `/health` devuelve `healthy` y la base devuelve `healthy`.
- Integridad local revisada: 197 transacciones, 0 fingerprints nulos y 0 fingerprints duplicados.

## Arquitectura y decisiones de producto

### Acceso

- El producto está limitado actualmente a la máquina host.
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
- GitHub Actions valida automáticamente pruebas, migraciones, dependencias, lint y build cuando el workflow se publique en `main`.

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
