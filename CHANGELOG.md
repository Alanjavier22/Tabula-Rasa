# Changelog

## [0.1.12](https://github.com/Alanjavier22/Tabula-Rasa/compare/v0.1.11...v0.1.12) (2026-09-22)


### Correcciones

* congela respuestas de herramientas IA ([e9381ef](https://github.com/Alanjavier22/Tabula-Rasa/commit/e9381efa570e9c10596ee17db164f31b53d50ae0))
* evita guardar secretos en texto plano ([8ee0f3c](https://github.com/Alanjavier22/Tabula-Rasa/commit/8ee0f3c56fbfd4e2d0d820dc32774fa2ddfaaeec))


### Documentación y mantenimiento

* centraliza persistencia de secretos ([a783406](https://github.com/Alanjavier22/Tabula-Rasa/commit/a783406a19a533056878db6efe9541d9fbce75d2))
* elimina asignacion redundante del parser ([3329675](https://github.com/Alanjavier22/Tabula-Rasa/commit/3329675be8c86cdf143daf03c4a58235e29bffa7))
* elimina ternario anidado en alertas ([933d93b](https://github.com/Alanjavier22/Tabula-Rasa/commit/933d93b51093abe27f360421065fc5b2d5aeef2c))
* elimina variable temporal sin uso ([ab76928](https://github.com/Alanjavier22/Tabula-Rasa/commit/ab76928420bef341ac337c9389188f1aca4b6aa2))
* reduce complejidad cognitiva del backend ([f728457](https://github.com/Alanjavier22/Tabula-Rasa/commit/f728457885a9227d2968e5b0f94120616ef98cb2))
* separa acumulacion fiscal por transaccion ([c64baa6](https://github.com/Alanjavier22/Tabula-Rasa/commit/c64baa6710d3efc88cf07d59b77961f30e15a9e3))
* separa auditoria de anomalías ([f5f0dbb](https://github.com/Alanjavier22/Tabula-Rasa/commit/f5f0dbb20e8e8979c85b350e14dc80bdfb78920c))
* separa calculos fiscales y exportacion SRI ([1ece5ad](https://github.com/Alanjavier22/Tabula-Rasa/commit/1ece5ad826f322f64f61727075864c7cda6d3eba))
* separa categorizacion en segundo plano ([6627c67](https://github.com/Alanjavier22/Tabula-Rasa/commit/6627c67c42e3001557bb1d5622387018cfe4b76a))
* separa clasificacion SRI por lotes ([b52d7cf](https://github.com/Alanjavier22/Tabula-Rasa/commit/b52d7cf90140bee05b74f63cd19fa28a06a4a32c))
* separa consolidacion de deuda ([303c755](https://github.com/Alanjavier22/Tabula-Rasa/commit/303c7553c6694bb54f6fa4d44519a369d28e495a))
* separa construccion de alertas de pago ([618c22f](https://github.com/Alanjavier22/Tabula-Rasa/commit/618c22f6a93a90209dc82c5726b0d573d88d5183))
* separa construccion de insights financieros ([db0b8f5](https://github.com/Alanjavier22/Tabula-Rasa/commit/db0b8f52393474ed5c6eb7fc5c37c35b5463b3cc))
* separa creacion atomica de transacciones ([b6f0d01](https://github.com/Alanjavier22/Tabula-Rasa/commit/b6f0d015449c5a870c4a55c60faf2c41dc291df7))
* separa deteccion de anomalías ([64a9d72](https://github.com/Alanjavier22/Tabula-Rasa/commit/64a9d72ef49c71587ab327fe0aef210c43e1a674))
* separa ejecucion del asistente IA ([706d1e8](https://github.com/Alanjavier22/Tabula-Rasa/commit/706d1e83bc3e5c6a3c18f0a320018f50d24bbfe2))
* separa parseo de estados de cuenta ([c60f232](https://github.com/Alanjavier22/Tabula-Rasa/commit/c60f232350721e87588f8405073f9f6848747ba8))
* separa parseo inteligente de cuentas ([be58478](https://github.com/Alanjavier22/Tabula-Rasa/commit/be58478e87cc28622ced71fd9642b82484270df0))
* separa pronostico de flujo de caja ([49616a8](https://github.com/Alanjavier22/Tabula-Rasa/commit/49616a83ad49a14528d77547e7d8a9b66f99eae2))
* separa reconciliacion temporal de snapshots ([7e58c97](https://github.com/Alanjavier22/Tabula-Rasa/commit/7e58c974ef90995ac171f39103ec84899662dbae))
* separa registro de rutas CRUD ([9113a34](https://github.com/Alanjavier22/Tabula-Rasa/commit/9113a34869f35efa349288bb380f195894dc8a6e))
* separa resolucion de pagos de tarjeta ([5f96c38](https://github.com/Alanjavier22/Tabula-Rasa/commit/5f96c38f54bcd8a342cda3b44b42a71cb620b497))
* separa respaldo externo en Drive ([f63f95f](https://github.com/Alanjavier22/Tabula-Rasa/commit/f63f95f0f3e8694f22bb944050a43189403e79c7))
* separa resumen de transacciones ([7bfde45](https://github.com/Alanjavier22/Tabula-Rasa/commit/7bfde45d251181db01de9303647729dda63e094a))
* separa rotacion de respaldos locales ([65e368f](https://github.com/Alanjavier22/Tabula-Rasa/commit/65e368f9c575c1e958abca363a3f0f7c517bbc95))
* separa telemetria vehicular ([62d4331](https://github.com/Alanjavier22/Tabula-Rasa/commit/62d433195872f9db4909e19b197263bf8e2a4a34))
* simplifica calculo de snapshots ([9deb386](https://github.com/Alanjavier22/Tabula-Rasa/commit/9deb3866a5ed5e3c87c3c149759f0aeb1940e157))
* simplifica finalizacion de importaciones ([715ca45](https://github.com/Alanjavier22/Tabula-Rasa/commit/715ca45b9d08de668e2ee7116a184bbfa976f1d7))
* simplifica mapeo de tipos SQLite ([3d1d28e](https://github.com/Alanjavier22/Tabula-Rasa/commit/3d1d28e8a86615f1dc12fe65a7015cdf421ba52b))
* simplifica recalculo de saldos ([bee6272](https://github.com/Alanjavier22/Tabula-Rasa/commit/bee62726e49a1a71203fbf3b499550293572a6a4))

## [0.1.11](https://github.com/Alanjavier22/Tabula-Rasa/compare/v0.1.10...v0.1.11) (2026-09-22)


### Documentación y mantenimiento

* elimina ternarios anidados del frontend ([5f9ccd0](https://github.com/Alanjavier22/Tabula-Rasa/commit/5f9ccd0f008f8eaff7c6b647c57d604837975c53))
* **ts:** extrae colores del tooltip fiscal ([751fa3b](https://github.com/Alanjavier22/Tabula-Rasa/commit/751fa3bfdffbfebfb40ec862fdc35c2e029b0d83))
* **ts:** extrae estado de deudas compartidas ([f7b8e6d](https://github.com/Alanjavier22/Tabula-Rasa/commit/f7b8e6d1799191b859b0bac5d2d3975d3fd48372))
* **ts:** extrae estado de resumen de tarjetas ([7aa7453](https://github.com/Alanjavier22/Tabula-Rasa/commit/7aa74535ba3267b85d65abc249f2fed1f276b512))
* **ts:** extrae estados visuales de objetivos ([d07931d](https://github.com/Alanjavier22/Tabula-Rasa/commit/d07931dd5a709485aeee19c6bb91e4a5c2cf2ce4))
* **ts:** extrae estados visuales de presupuestos ([6df76b6](https://github.com/Alanjavier22/Tabula-Rasa/commit/6df76b669761682ae175fa05fc092ad5b1d5fd8f))
* **ts:** extrae estados visuales de recordatorios ([8d0ef43](https://github.com/Alanjavier22/Tabula-Rasa/commit/8d0ef432b245fc090ddd152891dadee81fb61620))
* **ts:** extrae estados visuales del sentinel ([e689a99](https://github.com/Alanjavier22/Tabula-Rasa/commit/e689a99b7f632bd30b8989311682bf32113249a5))
* **ts:** extrae estilos de alertas de pago ([5e124af](https://github.com/Alanjavier22/Tabula-Rasa/commit/5e124af7c706dc12e5f021ba8bdeefaae87475c1))
* **ts:** extrae etiqueta de metodo de pago ([ba349cd](https://github.com/Alanjavier22/Tabula-Rasa/commit/ba349cdc8f72362df2de0696d1528461eb5b8134))
* **ts:** separa estados de la paleta de comandos ([e0d1e73](https://github.com/Alanjavier22/Tabula-Rasa/commit/e0d1e73a247a4c68283f037d5820996c9f12bf89))
* **ts:** separa estados del desglose de gastos ([a25653e](https://github.com/Alanjavier22/Tabula-Rasa/commit/a25653ebd8a8826dc28ad5e96e9f2b03f9df700e))
* **ts:** separa estados del grafico diario ([74b9dca](https://github.com/Alanjavier22/Tabula-Rasa/commit/74b9dca9ab467f60a7f01561b755fe489e4ef79b))
* **ts:** separa estados del historial de backups ([d664794](https://github.com/Alanjavier22/Tabula-Rasa/commit/d664794c165321b127649fb7bceaff47bf617988))
* **ts:** separa etiquetas del simulador what-if ([841ae7e](https://github.com/Alanjavier22/Tabula-Rasa/commit/841ae7eef4bbf92df725b2e2cd65dd69e6efdc23))
* **ts:** simplifica clases del analizador de anomalias ([9b68102](https://github.com/Alanjavier22/Tabula-Rasa/commit/9b681020c3789dededded0b82f41a1c7e0b313fb))
* **ts:** simplifica estados de mantenimiento ([cd62d34](https://github.com/Alanjavier22/Tabula-Rasa/commit/cd62d34767aaf813ad8d280d853f0c3bedaef928))
* **ts:** simplifica etiqueta de categoria ([9e30458](https://github.com/Alanjavier22/Tabula-Rasa/commit/9e30458f619d5a6780f0dbc698b662567e833cf4))
* **ts:** simplifica etiqueta de objetivo ([f8fb687](https://github.com/Alanjavier22/Tabula-Rasa/commit/f8fb68745f78df4843be063a6eebe98d612282d0))
* **ts:** simplifica etiqueta de recordatorio ([13422ac](https://github.com/Alanjavier22/Tabula-Rasa/commit/13422ac4aa2d58a81f5879f9e944a088523d8fac))
* **ts:** simplifica etiqueta de suscripcion ([86955b5](https://github.com/Alanjavier22/Tabula-Rasa/commit/86955b5a827f3902ffb57cbed8670cfe736d0d47))
* **ts:** simplifica titulo del modal de presupuesto ([196f5df](https://github.com/Alanjavier22/Tabula-Rasa/commit/196f5df0dff23935701adc818fa638c78d6df9fc))

## [0.1.10](https://github.com/Alanjavier22/Tabula-Rasa/compare/v0.1.9...v0.1.10) (2026-09-22)


### Correcciones

* elimina sonda de red fija en SSL ([d64a233](https://github.com/Alanjavier22/Tabula-Rasa/commit/d64a2336c42f0ba2905f76645aab8d4c36ccad72))
* **security:** avoid hardcoded network probe ([b6788ea](https://github.com/Alanjavier22/Tabula-Rasa/commit/b6788eaba5bb518972920ae650e98df94784a442))


### Documentación y mantenimiento

* **coverage:** align backend coverage paths ([5b30661](https://github.com/Alanjavier22/Tabula-Rasa/commit/5b30661ce190666412fd0bef76f04aaa4ffab8e0))
* **coverage:** include SSL setup module ([1047266](https://github.com/Alanjavier22/Tabula-Rasa/commit/1047266f4b42d9da0bd08be6e677578278f0c10f))
* resuelve incidencias S7773 de TypeScript ([2356992](https://github.com/Alanjavier22/Tabula-Rasa/commit/23569926123a770a40f8c5d25213ccfdd9bc79a4))
* **sonar:** aclara cobertura temporal del frontend ([f56e474](https://github.com/Alanjavier22/Tabula-Rasa/commit/f56e4741b19a2feea44c98fd33ea7371a7a23b62))
* **ts:** moderniza parseo de configuración ([64cf09c](https://github.com/Alanjavier22/Tabula-Rasa/commit/64cf09c0582aa6eb4823ac50549b08e68d668825))
* **ts:** moderniza parseo de deudas ([08626e3](https://github.com/Alanjavier22/Tabula-Rasa/commit/08626e39ffd1e47051b688d0b4e00f28f7bee393))
* **ts:** moderniza parseo de ingresos y gastos ([5ab0367](https://github.com/Alanjavier22/Tabula-Rasa/commit/5ab0367e18ffa286d48bf83539d6bb0f311bb9f8))
* **ts:** moderniza parseo de patrimonio ([51a0eaf](https://github.com/Alanjavier22/Tabula-Rasa/commit/51a0eaf3210fad6c155b64e748bf260d6d525105))
* **ts:** moderniza parseo de privacidad ([ac53f1b](https://github.com/Alanjavier22/Tabula-Rasa/commit/ac53f1b84c51c4ef67eee1297601a789f47c1fa4))
* **ts:** moderniza parseo de transacciones compartidas ([7ee703e](https://github.com/Alanjavier22/Tabula-Rasa/commit/7ee703e090930a7da65c0a72146a9f7f47263ca8))
* **ts:** moderniza parseo del buffer ([5e9916b](https://github.com/Alanjavier22/Tabula-Rasa/commit/5e9916b7040fed808c8a6f55a718fb2d1450223a))
* **ts:** moderniza parseos de App ([ca163df](https://github.com/Alanjavier22/Tabula-Rasa/commit/ca163dfb47059399597ce63a4055f324559a926d))
* **ts:** moderniza parseos de cuentas ([3e60595](https://github.com/Alanjavier22/Tabula-Rasa/commit/3e6059595fcd49190d764bca65a313287edd76f2))
* **ts:** moderniza parseos de estados de cuenta ([446abfe](https://github.com/Alanjavier22/Tabula-Rasa/commit/446abfeefa740854c8ae7025b7dc33715ea2ca95))
* **ts:** moderniza parseos de flujo de caja ([f9f0ac7](https://github.com/Alanjavier22/Tabula-Rasa/commit/f9f0ac7390d93f9e57ee9f0a6ca900280b3138f6))
* **ts:** moderniza parseos de gasto diario ([a7e0164](https://github.com/Alanjavier22/Tabula-Rasa/commit/a7e01648689dd7e65dc5151128db375a8da79623))
* **ts:** moderniza parseos de gastos ([959aafc](https://github.com/Alanjavier22/Tabula-Rasa/commit/959aafc09fda446d204ee50319fbc2a2838921f5))
* **ts:** moderniza parseos de presupuestos ([9ddb4e5](https://github.com/Alanjavier22/Tabula-Rasa/commit/9ddb4e5a51c79959f92712cb9cff0ff6006de8dc))
* **ts:** moderniza parseos de transacciones ([cbbc7ad](https://github.com/Alanjavier22/Tabula-Rasa/commit/cbbc7ad3abecb273b9dd7d27105df92bf7148453))
* **ts:** moderniza parseos del dashboard ([0cddd81](https://github.com/Alanjavier22/Tabula-Rasa/commit/0cddd81a30e421df044bae32f02cdac3533c910f))
* **ts:** moderniza parseos del formulario ([1c6635d](https://github.com/Alanjavier22/Tabula-Rasa/commit/1c6635d66783b190521afd362204068edfffc027))
* **ts:** moderniza parseos fiscales ([291bbc0](https://github.com/Alanjavier22/Tabula-Rasa/commit/291bbc07e4dca2c4d13d83e87fa1038ab3f853ef))

## [0.1.9](https://github.com/Alanjavier22/Tabula-Rasa/compare/v0.1.8...v0.1.9) (2026-09-22)


### Documentación y mantenimiento

* reduce cash flow projection complexity ([aad469b](https://github.com/Alanjavier22/Tabula-Rasa/commit/aad469bea75097f84d8705abddb2f0f4a78c6446))
* reduce complejidad del dashboard de métricas ([052c4ca](https://github.com/Alanjavier22/Tabula-Rasa/commit/052c4caf55f3518d3241047f2c99bd6d1a8beada))
* reduce complejidad del flujo de caja ([e6015e7](https://github.com/Alanjavier22/Tabula-Rasa/commit/e6015e71881af5a27b04a40ca38485d3b536d9c1))
* reduce complejidad del importador de transacciones ([f5f0a87](https://github.com/Alanjavier22/Tabula-Rasa/commit/f5f0a871e7ba77349aa86a09965c92b599966c5c))
* reduce dashboard metrics complexity ([1d52f20](https://github.com/Alanjavier22/Tabula-Rasa/commit/1d52f20efbebccdd76232ec9ab941259d0f926e1))
* reduce transaction importer complexity ([c66b5c8](https://github.com/Alanjavier22/Tabula-Rasa/commit/c66b5c83683734e07754d01a0487b56ffb2af87e))

## [0.1.8](https://github.com/Alanjavier22/Tabula-Rasa/compare/v0.1.7...v0.1.8) (2026-09-21)


### Documentación y mantenimiento

* **sonar:** divide categorizacion por etapas ([88935f1](https://github.com/Alanjavier22/Tabula-Rasa/commit/88935f14b2c00ca22cfffe8dfdffcf88e6846876))
* **sonar:** reduce complejidad del categorizador ([3954632](https://github.com/Alanjavier22/Tabula-Rasa/commit/39546324eff6a6f04a1132f7c9f00b62529e39ce))

## [0.1.7](https://github.com/Alanjavier22/Tabula-Rasa/compare/v0.1.6...v0.1.7) (2026-09-21)


### Documentación y mantenimiento

* **sonar:** reduce complejidad de finalize_import ([f75496f](https://github.com/Alanjavier22/Tabula-Rasa/commit/f75496fcaec832472ebfa081fd1c9a46866b8ed7))

## [0.1.6](https://github.com/Alanjavier22/Tabula-Rasa/compare/v0.1.5...v0.1.6) (2026-09-21)


### Documentación y mantenimiento

* **sonar:** reduce complejidad del parser local ([db940dd](https://github.com/Alanjavier22/Tabula-Rasa/commit/db940dd23c4c53f539dda1899df14e2755f32316))

## [0.1.5](https://github.com/Alanjavier22/Tabula-Rasa/compare/v0.1.4...v0.1.5) (2026-09-21)


### Correcciones

* ajusta cobertura de cashflow ([fb39a03](https://github.com/Alanjavier22/Tabula-Rasa/commit/fb39a03afc8341a69844cf0894b8500d4dfd7aae))
* ajusta cobertura de Google Drive ([f1a5243](https://github.com/Alanjavier22/Tabula-Rasa/commit/f1a5243acdd7a6694609a44d1719dcada70d8ba1))
* ajusta cobertura de IA asíncrona ([5ca3342](https://github.com/Alanjavier22/Tabula-Rasa/commit/5ca33426f94383adbf1c47798844b577cdd90760))
* ajusta cobertura de importación ([2f38cd6](https://github.com/Alanjavier22/Tabula-Rasa/commit/2f38cd6f4d1bf65e6b4191ee818c55bc79389107))
* ajusta cobertura de reconciliación ([e8ffc75](https://github.com/Alanjavier22/Tabula-Rasa/commit/e8ffc757370e1f91f47eb34ee1f2b9980abe8246))
* ajusta cobertura de respaldo local ([03b6cf4](https://github.com/Alanjavier22/Tabula-Rasa/commit/03b6cf48e1121591a4402411da48d8a5c6a5a866))
* ajusta cobertura de respaldos ([eb5965f](https://github.com/Alanjavier22/Tabula-Rasa/commit/eb5965f928b619d2e6005c117683718d6220e90a))
* ajusta cobertura de UUID ([ec054f3](https://github.com/Alanjavier22/Tabula-Rasa/commit/ec054f337bf055224e27568457a8d0cc4073104b))
* ajusta cobertura del asistente ([b414d69](https://github.com/Alanjavier22/Tabula-Rasa/commit/b414d69d3aecf59dde8c80b1e1d675e9e3a16f7c))
* ajusta cobertura del categorizador ([815cf4d](https://github.com/Alanjavier22/Tabula-Rasa/commit/815cf4dd2381c29cdd82236817980d4ff8cc1d54))
* ajusta cobertura del logging fiscal ([4ad2cbd](https://github.com/Alanjavier22/Tabula-Rasa/commit/4ad2cbd86514c343939ae24c33bea05091811ac5))
* ajusta cobertura del logging what-if ([a783bbb](https://github.com/Alanjavier22/Tabula-Rasa/commit/a783bbb4a9b15f6d184d64295086cf8480501a78))
* ajusta cobertura del parser ([3fe4216](https://github.com/Alanjavier22/Tabula-Rasa/commit/3fe42168a67b5945121efaf8eaa13715758fd559))
* asocia label de carga de estados ([8810405](https://github.com/Alanjavier22/Tabula-Rasa/commit/88104054be4dbe38f8feffa73c8da71454856cdc))
* asocia label de importación bancaria ([de025ff](https://github.com/Alanjavier22/Tabula-Rasa/commit/de025ffba383325e3b266e673d9988df6bc8df2e))
* asocia label de importación documental ([11c68ae](https://github.com/Alanjavier22/Tabula-Rasa/commit/11c68ae16e575769328df9dce9409525a68fe61f))
* asocia label del buffer de liquidez ([4cda6bd](https://github.com/Alanjavier22/Tabula-Rasa/commit/4cda6bdbdc42e4f12a9004ad659e92edba23eb66))
* asocia labels con controles de formulario ([b5fa8db](https://github.com/Alanjavier22/Tabula-Rasa/commit/b5fa8db3c4fdbf359674a32b525e1acbf5459659))
* asocia labels de creación de cuentas ([269853a](https://github.com/Alanjavier22/Tabula-Rasa/commit/269853a5e6ebb511faebb9223b3ec61c1855a55b))
* asocia labels de credenciales AI ([e92afba](https://github.com/Alanjavier22/Tabula-Rasa/commit/e92afbaa40d81332c13ffa0bce95431b8c0341ee))
* asocia labels de deudas compartidas ([6409bd6](https://github.com/Alanjavier22/Tabula-Rasa/commit/6409bd6a9620157222d2afe5af0e482ad5be9274))
* asocia labels de divisiones de transacciones ([230458d](https://github.com/Alanjavier22/Tabula-Rasa/commit/230458db68a0f1681de0f80505dc2e2f66f4be91))
* asocia labels de edición de cuentas ([9f9e066](https://github.com/Alanjavier22/Tabula-Rasa/commit/9f9e066e46b07a360fa39068d956779558bce8e0))
* asocia labels de estados de cuenta ([b0bb67c](https://github.com/Alanjavier22/Tabula-Rasa/commit/b0bb67c532f15f75e3f927d371b091559c827a91))
* asocia labels de metas ([3650c85](https://github.com/Alanjavier22/Tabula-Rasa/commit/3650c85d892c21eeb0b86305a04d7b9262868d34))
* asocia labels de presupuestos ([071b173](https://github.com/Alanjavier22/Tabula-Rasa/commit/071b173d9189e33385a8011d670df122bfb8ff0c))
* asocia labels de recordatorios ([3496569](https://github.com/Alanjavier22/Tabula-Rasa/commit/3496569f3a6a6ea35e584430cccffd670d337262))
* asocia labels de reparto de gastos ([a63c50d](https://github.com/Alanjavier22/Tabula-Rasa/commit/a63c50d8753bb21dd83efdcb7c42a9d3cd418e2f))
* asocia labels de suscripciones ([9e6afe5](https://github.com/Alanjavier22/Tabula-Rasa/commit/9e6afe580bb81eda10b780d46fabf5faa553e4f5))
* corrige logging de excepciones en backend ([ec96834](https://github.com/Alanjavier22/Tabula-Rasa/commit/ec96834994605ff0faeadeda392170244bfb5bd2))
* excluye rama excepcional de cashflow ([45ce6a1](https://github.com/Alanjavier22/Tabula-Rasa/commit/45ce6a1e8ea9231b50d9d3b3d0c220baa89cd05b))
* excluye rama excepcional de IA ([83aa40e](https://github.com/Alanjavier22/Tabula-Rasa/commit/83aa40e05a09b9baa9fdf104ddd6b9f1d2a8db38))
* excluye rama excepcional de what-if ([4dd622b](https://github.com/Alanjavier22/Tabula-Rasa/commit/4dd622b7a6549f88ac1f08ec58cd038922405d2a))
* excluye rama excepcional del categorizador ([b2d8f3d](https://github.com/Alanjavier22/Tabula-Rasa/commit/b2d8f3d4d4c93b70b1dd2d1b9be173efa96563f4))
* excluye rama excepcional del parser ([4efe05c](https://github.com/Alanjavier22/Tabula-Rasa/commit/4efe05c030943425ea869edd3ee5e64fd35428b7))
* excluye ramas excepcionales de Google Drive ([358c435](https://github.com/Alanjavier22/Tabula-Rasa/commit/358c4355e904528d5f33e4da4c2a7745fbc458cf))
* excluye ramas excepcionales de reconciliación ([b7be3e0](https://github.com/Alanjavier22/Tabula-Rasa/commit/b7be3e03a2a24d98e6275d2436fe508370e6dbd9))
* permite asociar labels a DatePicker ([3c28a00](https://github.com/Alanjavier22/Tabula-Rasa/commit/3c28a000c8b41db7714fd60611562231272edb5e))
* permite asociar labels a Select ([bcd44b1](https://github.com/Alanjavier22/Tabula-Rasa/commit/bcd44b113f47d8368c5d4da7aa37c51c764610f1))
* usa logging exception en cashflow ([a14218e](https://github.com/Alanjavier22/Tabula-Rasa/commit/a14218eb571f635122a9ab151717f54ac2505f6c))
* usa logging exception en categorizador ([274c21f](https://github.com/Alanjavier22/Tabula-Rasa/commit/274c21f4a7fed95cb314bd79da0ef170c327ba83))
* usa logging exception en fiscal ([770ff2c](https://github.com/Alanjavier22/Tabula-Rasa/commit/770ff2c5088cd561a2faaf0ce578273e7e21dfc8))
* usa logging exception en Google Drive ([5d731e8](https://github.com/Alanjavier22/Tabula-Rasa/commit/5d731e82a2a7bd23322d8ab9b295780b2d2c1dab))
* usa logging exception en IA asíncrona ([2e8a0ef](https://github.com/Alanjavier22/Tabula-Rasa/commit/2e8a0efa54510697277937839d80a00a3ba869e4))
* usa logging exception en importación ([a39a5c2](https://github.com/Alanjavier22/Tabula-Rasa/commit/a39a5c223f87118fdfc9c8907985520c310695dd))
* usa logging exception en parser ([cc15642](https://github.com/Alanjavier22/Tabula-Rasa/commit/cc15642cbdb0a53b761b5ddef36b749bc133fc9d))
* usa logging exception en reconciliación ([695bec0](https://github.com/Alanjavier22/Tabula-Rasa/commit/695bec014f93e5981ecfba96ad5485c4f454bfb9))
* usa logging exception en respaldo local ([c8411d3](https://github.com/Alanjavier22/Tabula-Rasa/commit/c8411d3dfdab5ada2ac6baedac9ae4360db341f3))
* usa logging exception en respaldos ([e01d5f4](https://github.com/Alanjavier22/Tabula-Rasa/commit/e01d5f4e1fec8bceab712878ee504dded889d3d9))
* usa logging exception en what-if ([3faed59](https://github.com/Alanjavier22/Tabula-Rasa/commit/3faed59bda1e59c83670c74c1f04d225a4205acc))
* usa texto semántico en vista previa ([e3f8aa0](https://github.com/Alanjavier22/Tabula-Rasa/commit/e3f8aa09294f5ad4bb2bb43335f96c4aa4ab52a9))


### Documentación y mantenimiento

* moderniza anotaciones de unión en Python ([ddcb55a](https://github.com/Alanjavier22/Tabula-Rasa/commit/ddcb55ade6ce8c044df349e59de7b550132ad72c))
* moderniza tipos de activos ([b80931d](https://github.com/Alanjavier22/Tabula-Rasa/commit/b80931da34dcc697d2bb6e2dab784d4f6fa01ffa))
* moderniza tipos de claves UUID ([1810f49](https://github.com/Alanjavier22/Tabula-Rasa/commit/1810f4958562563ce22df28929a7e9a398b6c52f))
* moderniza tipos de columnas faltantes ([44c9852](https://github.com/Alanjavier22/Tabula-Rasa/commit/44c985275bbeb73938f771ec0c9a24b3758cea56))
* moderniza tipos de constraints ([fca2e83](https://github.com/Alanjavier22/Tabula-Rasa/commit/fca2e83f09612de30eff0886383d057d7dfb24b0))
* moderniza tipos de crédito ([e119182](https://github.com/Alanjavier22/Tabula-Rasa/commit/e119182ae99ecdd16fabea11a6fe01202882abf7))
* moderniza tipos de dispositivos ([38bad99](https://github.com/Alanjavier22/Tabula-Rasa/commit/38bad99b23ad33b252a5209fc56fa373eafd5ba6))
* moderniza tipos de dispositivos autorizados ([d6aa5cc](https://github.com/Alanjavier22/Tabula-Rasa/commit/d6aa5cc3a60ac4339725b64b27ec27a81c3b6554))
* moderniza tipos de dispositivos emparejados ([26c8596](https://github.com/Alanjavier22/Tabula-Rasa/commit/26c859650e4832e7daa0dfe06f6ccb53b5cf8dea))
* moderniza tipos de importación ([8b57b2c](https://github.com/Alanjavier22/Tabula-Rasa/commit/8b57b2cc4a96bf81c1ff54bcc81f10a323f0f621))
* moderniza tipos de metas ([1e35d24](https://github.com/Alanjavier22/Tabula-Rasa/commit/1e35d24dbb544301236ef8e82009cb76674b17b6))
* moderniza tipos de migración inicial ([c8c9311](https://github.com/Alanjavier22/Tabula-Rasa/commit/c8c93113652e52677ba7bb9d7eb33f8d4c856384))
* moderniza tipos de reconciliación ([83dbe7c](https://github.com/Alanjavier22/Tabula-Rasa/commit/83dbe7c4ee9ef6802284b84a05205612b2e03d18))
* moderniza tipos de saldo corriente ([eb08bc2](https://github.com/Alanjavier22/Tabula-Rasa/commit/eb08bc2dea642cf307a04d1053c14816999e504d))
* moderniza tipos de sincronización ([9acc280](https://github.com/Alanjavier22/Tabula-Rasa/commit/9acc2806b8995a7347dcd2dba2b04abca438c17f))
* moderniza tipos de snapshots ([0494f6f](https://github.com/Alanjavier22/Tabula-Rasa/commit/0494f6fbe2b8a31d64d5ccae4ae3dc67c9580c78))
* moderniza tipos de transacciones ([13821cf](https://github.com/Alanjavier22/Tabula-Rasa/commit/13821cf16d3aa08f9662bf3e695ad9b726507086))
* moderniza tipos de UUID ([1d2f244](https://github.com/Alanjavier22/Tabula-Rasa/commit/1d2f244eaf2d645e10c9cffcfd3b043246d68548))
* moderniza tipos de UUID ([d4885fe](https://github.com/Alanjavier22/Tabula-Rasa/commit/d4885fe68d7830e470f352530730818e2401d7c1))
* moderniza tipos del asistente ([5e36fce](https://github.com/Alanjavier22/Tabula-Rasa/commit/5e36fcea49f3133a420b237a0a23c902661292ae))
* moderniza tipos del parser de fechas ([f54fbd9](https://github.com/Alanjavier22/Tabula-Rasa/commit/f54fbd9a67b2d1d9f6a031b807f72ce233d902ba))
* moderniza tipos monetarios ([1d00fcb](https://github.com/Alanjavier22/Tabula-Rasa/commit/1d00fcb7ee8386b0b6708e805de931d7f2453f35))

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
