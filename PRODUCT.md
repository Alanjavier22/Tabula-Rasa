# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Una persona que administra sus finanzas personales en una aplicación local y privada.

## Product Purpose

Tabula Rasa reúne movimientos, estadísticas y análisis de finanzas personales para ayudar a entender la situación financiera, anticipar compromisos y evaluar posibles escenarios mediante predicciones y proyecciones.

## Positioning

Es una herramienta local de finanzas personales con análisis y proyecciones integrados; las funciones de IA son opcionales y forman parte de los flujos que la aplicación ya ofrece.

## Operating Context

Se utiliza en español desde el equipo anfitrión. Los movimientos y compromisos registrados son la base para revisar actividad, tendencias y escenarios. La aplicación contiene flujos fiscales del SRI de Ecuador.

## Capabilities and Constraints

El frontend es React con Vite. El backend local usa FastAPI y SQLite. Los datos financieros permanecen en la base local. Gemini se utiliza solo en funciones de IA existentes y con el contexto sanitizado por la aplicación. El acceso actual se limita al equipo anfitrión; no hay emparejamiento remoto ni uso multidispositivo. Se conservan los temas claro y oscuro y el diseño web adaptable.

## Evidence on Hand

El repositorio contiene movimientos, cuentas, compromisos, métricas, estadísticas, proyecciones de flujo de caja, escenarios hipotéticos, funciones de IA y herramientas fiscales. Los datos de finanzas pertenecen al usuario y no se deben inventar ni incluir en demostraciones visuales.

## Product Principles

- Presentar primero una lectura comprensible de la situación financiera y sus compromisos.
- Diferenciar datos registrados, proyecciones, escenarios y análisis de IA.
- Mantener la revisión y planificación ligadas a movimientos reales del usuario.
- Respetar el funcionamiento local y evitar enviar datos financieros fuera de los flujos de IA existentes.
- Hacer que los gráficos e interacciones ayuden a comparar, explorar o decidir.
