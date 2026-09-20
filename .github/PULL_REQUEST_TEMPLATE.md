## Propósito

<!-- Explica el problema y el resultado que busca este cambio. -->

## Cambios realizados

<!-- Resume los cambios por archivo o carpeta, con el nivel de detalle suficiente para revisarlos. -->

## Validación

- [ ] Backend: `pytest -q`
- [ ] Backend: `alembic check` y `pip check` cuando aplique
- [ ] Frontend: `npm run lint -- --max-warnings 0`
- [ ] Frontend: `npm run build`
- [ ] Health check o validación manual relevante ejecutada

## Seguridad y datos

- [ ] No incluye `finance.db`, backups, `.env`, logs, certificados ni datos financieros reales.
- [ ] No introduce llamadas masivas a Gemini ni secretos en el repositorio.
- [ ] Las migraciones y cambios de esquema fueron revisados, si aplica.

## Convenciones del proyecto

- [ ] Los commits están en español, son descriptivos y atómicos por archivo o carpeta.
- [ ] La documentación operativa fue actualizada si cambió una decisión o procedimiento.
- [ ] No se reintroduce pairing remoto, QR o multidispositivo sin autorización explícita.
