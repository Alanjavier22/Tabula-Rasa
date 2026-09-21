# Changelog

## [0.1.4](https://github.com/Alanjavier22/Tabula-Rasa/compare/v0.1.3...v0.1.4) (2026-09-21)


### Correcciones

* corrige hallazgos de accesibilidad en controles interactivos ([3df9d45](https://github.com/Alanjavier22/Tabula-Rasa/commit/3df9d45b42557ff1b3036350ce062b8ddf151804))


### Seguridad y datos

* elimina aleatoriedad del identificador temporal ([a858c37](https://github.com/Alanjavier22/Tabula-Rasa/commit/a858c3780be1dde5475e2dc3b45afe6a34cf5353))
* genera partículas con crypto del navegador ([4909e4f](https://github.com/Alanjavier22/Tabula-Rasa/commit/4909e4f0c4830415e12673d227abe0747efb3a74))
* usa aleatoriedad segura en stress test ([fcbda0c](https://github.com/Alanjavier22/Tabula-Rasa/commit/fcbda0cbd43c4eb1ec881c32468bc7c9bc1f646b))


### Documentación y mantenimiento

* alinea exclusiones de cobertura con SonarCloud ([744d34f](https://github.com/Alanjavier22/Tabula-Rasa/commit/744d34f15187998b403baa82fe68e4eba70093e6))
* corrige hallazgos críticos de bajo riesgo ([402e11d](https://github.com/Alanjavier22/Tabula-Rasa/commit/402e11dc321dea7b65edd1b1413e05e79d0af428))
* elimina imports innecesarios del inicializador ([c7f765d](https://github.com/Alanjavier22/Tabula-Rasa/commit/c7f765dc18cf5e678397343d2b4b9ff022ac1b55))
* hace explícitos los retornos de stubs async ([6d3eccf](https://github.com/Alanjavier22/Tabula-Rasa/commit/6d3eccfc545db301b44aa1cff7f592b72beb0094))
* usa zona horaria estándar de Python ([7cb96ce](https://github.com/Alanjavier22/Tabula-Rasa/commit/7cb96cea24e69409416a400f96347d26819a1cbe))

## [0.1.3](https://github.com/Alanjavier22/Tabula-Rasa/compare/v0.1.2...v0.1.3) (2026-09-20)


### Correcciones

* **api:** declara default opcional en telemetría ([af8a053](https://github.com/Alanjavier22/Tabula-Rasa/commit/af8a0530ce9a15642242128a3155cd41e8f1000c))
* **async:** usa I/O asíncrono al leer estados ([60782fa](https://github.com/Alanjavier22/Tabula-Rasa/commit/60782fab5267b1f217316bd5dd855d5871575843))
* **async:** usa I/O asíncrono en importación ([a1df65e](https://github.com/Alanjavier22/Tabula-Rasa/commit/a1df65eed73a20d90e95a410da4b7240fc561832))
* remedia hallazgos prioritarios de SonarCloud ([34789f8](https://github.com/Alanjavier22/Tabula-Rasa/commit/34789f8eb2b8bd5737c65a30b4bd066011fc31ec))
* **security:** limita Uvicorn a loopback por defecto ([57de208](https://github.com/Alanjavier22/Tabula-Rasa/commit/57de208f5a45d6a110af3a7b620ebd9ec9c4e17b))
* **security:** sanitiza valores de logs de backups ([090e7a6](https://github.com/Alanjavier22/Tabula-Rasa/commit/090e7a66947038675b04f887456d6ae6b97c18e1))
* **ui:** ordena años fiscales numéricamente ([45e34c3](https://github.com/Alanjavier22/Tabula-Rasa/commit/45e34c3289be29bd34137919b1eb2d75c0566a8c))


### Documentación y mantenimiento

* documenta el binding local de Uvicorn ([6dca25b](https://github.com/Alanjavier22/Tabula-Rasa/commit/6dca25ba83c9d4d079503cb9a8bb14b6720dbcfd))
* excluir bootstrap de cobertura de SonarCloud ([bcc2789](https://github.com/Alanjavier22/Tabula-Rasa/commit/bcc27896560c325e9fb60e24f763139680bb031f))

## [0.1.2](https://github.com/Alanjavier22/Tabula-Rasa/compare/v0.1.1...v0.1.2) (2026-09-20)


### Documentación y mantenimiento

* integra análisis SonarCloud con cobertura backend ([8b92118](https://github.com/Alanjavier22/Tabula-Rasa/commit/8b921186f988d72fc7cbe42b792e676ba0dd91f0))

## [0.1.1](https://github.com/Alanjavier22/Tabula-Rasa/compare/v0.1.0...v0.1.1) (2026-09-20)


### Documentación y mantenimiento

* actualiza el contexto con el flujo automático de PR ([e2217dc](https://github.com/Alanjavier22/Tabula-Rasa/commit/e2217dc13ab364205b1015b6203250ea0d3b2099))
* actualiza README con el estado técnico y GitHub ([ac3edab](https://github.com/Alanjavier22/Tabula-Rasa/commit/ac3edab542e677572e5d62ead7933251fc6dc830))
* alinea README con la implementación vigente ([cef99a8](https://github.com/Alanjavier22/Tabula-Rasa/commit/cef99a853ae9a28d0f9a7e4c4fef0e0b2832d07e))
* añade archivo de versión semver ([164dea3](https://github.com/Alanjavier22/Tabula-Rasa/commit/164dea3affd3745cc62b43fad8b74ec51583f9ff))
* automatiza el flujo de ramas y Pull Requests ([0e027a1](https://github.com/Alanjavier22/Tabula-Rasa/commit/0e027a14f0543ee4fab0f9769a3c68530829592b))
* automatiza el flujo de trabajo con Pull Requests ([c282a2f](https://github.com/Alanjavier22/Tabula-Rasa/commit/c282a2fc012e8d46253d080ca02dea2febfe4c5a))
* automatiza la preparación y publicación de releases ([06b2098](https://github.com/Alanjavier22/Tabula-Rasa/commit/06b20984f0b9eea40720c9211162107fcb2f1653))
* automatiza versionado y publicación de releases ([6ea44bf](https://github.com/Alanjavier22/Tabula-Rasa/commit/6ea44bf2ae5c11e5149fe1e763940eaba99bc5a6))
* configura el versionado semántico automático ([dd23720](https://github.com/Alanjavier22/Tabula-Rasa/commit/dd2372000f6c1ef4ce947e656f9cae5f11b42e3d))
* corrige el contexto de acceso local y red ([2a52c86](https://github.com/Alanjavier22/Tabula-Rasa/commit/2a52c86624aea0cb75b83835ca811fece49eab41))
* documenta el ciclo automático de releases ([120a58e](https://github.com/Alanjavier22/Tabula-Rasa/commit/120a58e4e95edc1b4ffce65b7df0b949f715bff5))
* fija la versión base del componente publicado ([ca00005](https://github.com/Alanjavier22/Tabula-Rasa/commit/ca00005bdf4983ba04bbefdc37a98afb2672490e))
* inicializa el changelog de releases ([5a81916](https://github.com/Alanjavier22/Tabula-Rasa/commit/5a819164a67079ff9261ede41b133acbacc38dc2))
* integra el versionado automático en el flujo operativo ([0bce76d](https://github.com/Alanjavier22/Tabula-Rasa/commit/0bce76dab6fe72ca4c16520d929712073b2f0677))
* registra la automatización completa de releases ([2b0614d](https://github.com/Alanjavier22/Tabula-Rasa/commit/2b0614d4947d1f3b39f82b46b072e72033276852))
* sincroniza el contexto operativo con GitHub ([21c2ca1](https://github.com/Alanjavier22/Tabula-Rasa/commit/21c2ca14721645393d8c28e2a9e49b17077d3947))

## v0.1.0 — Primera versión operativa

- Aplicación financiera local-first con backend FastAPI/SQLite y frontend React/Vite.
- Validación continua de backend y frontend mediante GitHub Actions.
- Análisis CodeQL para Python y JavaScript/TypeScript.
