# Prototipos interactivos de Tabula Rasa

Abrir index.html desde un servidor local. Comando: `backend/venv/Scripts/python.exe -m http.server 62000 --bind 127.0.0.1 --directory .impeccable/prototypes`.

Las tres variantes comparten interacciones para comparar la experiencia con datos ficticios: navegación entre Resumen, Movimientos, Planificación y Análisis; horizonte 30/60/90; exploración de puntos con puntero, Tab y flechas; tabla equivalente; filtros y orden de movimientos; categorías que filtran la lista; presupuestos ajustables; simulación de aporte; simulación de gasto extraordinario; nueva transacción temporal; detalles de pagos; desglose de disponible; Centinela ficticio; tema alternativo y restablecimiento.

Son prototipos de interacción, no modelos predictivos ni integración con la aplicación. No llaman APIs ni IA, no persisten cambios ni ejecutan pagos. La proyección usa una fórmula ilustrativa. Cada enlace de variante abre un estado independiente. Las maquetas estáticas originales siguen en ../mocks/decision/.
