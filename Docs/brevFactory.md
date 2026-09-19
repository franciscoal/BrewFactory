# BrewFactory — Especificación del juego

Documento único que integra las reglas originales (`gamerules.md`) y las decisiones adoptadas (`gamerules-decisiones.md`). Ante cualquier duda, **este documento prevalece**.

## 1. Idea general

BrewFactory es un simulador, en forma de juego, de la cadena de producción de una fábrica de bebidas, desde la demanda comercial hasta la expedición al cliente. Sirve para una **demostración de una IA controlando una fábrica**: puede jugarlo una persona con la interfaz gráfica o una IA conectada mediante JSON.

**Objetivo:** atender la demanda al mínimo coste, manteniendo la fábrica en un estado sostenible y mejorando la rentabilidad.

Las cifras de penalización y recompensa son un punto de partida. Se ajustarán al ver el juego funcionar.

### Glosario

| Término | Significado |
|---|---|
| **Ciclo** | Una hora de producción. Tiene una fase de *planificación* y una de *resolución*. |
| **Pedido** | Unidad de demanda comercial: cantidad, botellas producidas y contador de ciclos de entrega. |
| **Contador** («ciclos pendientes») | Ciclos que faltan para el vencimiento. Negativo = retraso. |
| **Cola de demanda** | Vista de los pedidos **no terminados**. |
| **Stock de expediciones** | Vista de los pedidos con producción iniciada o terminada y no entregados. |
| **Pedido terminado** | Producido al completo y pendiente de entregar. |
| **Pedido en curso** | Con producción parcial (en una línea o aparcado). |
| **Línea activa** | Línea encendida y con pedido actual. |
| **Actual / Siguiente** | Los dos huecos de pedido de una línea. |
| **Muelle** | Cada uno de los dos puestos de expedición. |
| **OKR** | Cumplimiento, Productividad y Entrega. |
| **Rentabilidad** | Resultado combinado de los tres OKR. |

## 2. Modelo de ciclo

El tiempo no corre de forma continua. Cada ciclo tiene dos fases:

1. **Planificación**: el juego se detiene el número de segundos configurado. El jugador (o la IA) reconfigura líneas, pedidos y muelles **sobre el estado del ciclo anterior**.
2. **Resolución**: al agotarse el tiempo (o al pulsar *Paso*) el sistema calcula el nuevo estado. **No hay simultaneidad**: cada operación usa solo el estado anterior y sus efectos se ven en el ciclo siguiente.

Orden fijo de la resolución:

| Paso | Operación |
|---|---|
| 1 | Validar y aplicar las acciones del jugador o de la IA. |
| 2 | **Producción**: las líneas 1→4 producen. |
| 3 | **Expedición**: los muelles entregan los pedidos asignados, que ya debían estar terminados al inicio del ciclo. |
| 4 | Los pedidos completados pasan a «terminados» y las líneas avanzan al pedido siguiente. |
| 5 | Cálculo de OKR y Rentabilidad. |
| 6 | El contador de todos los pedidos baja en 1. |
| 7 | Se genera nueva demanda. |

**Consecuencia:** un pedido completado en el ciclo *n* pasa al **stock de expediciones** al terminar *n*. En la planificación de *n+1* el jugador lo asigna a un muelle y en la resolución de *n+1* se **expide**, desapareciendo del stock y del muelle. Nunca se entrega en el mismo ciclo en que se completa.

**«A tiempo»:** lo que ve el jugador es lo que cuenta. Se evalúa con el contador tal como estaba al asignar el pedido al muelle: **≥ 0 = a tiempo**, **< 0 = con retraso**.

Aclaraciones:
- Producción (paso 2) y OKR (paso 5) usan la configuración resultante del paso 1. La única excepción a la «foto» es el reparto secuencial entre líneas (§4.3).
- El estado de las líneas, y con él la activación del muelle 2, se evalúa tras aplicar los cambios de líneas. Si el muelle 2 queda inactivo, su asignación se cancela.
- Un pedido que se completa en este ciclo cuenta todavía como «en producción» y «no terminado» en los OKR de este ciclo.

## 3. Demanda comercial

Es una cola de pedidos que el juego genera aleatoriamente y la fábrica debe producir. El jugador **no puede crear ni modificar** la demanda: le llega por sorpresa.

- Cada pedido tiene una **cantidad** de botellas y unos **ciclos de entrega** iniciales. En cada ciclo el contador baja en uno y puede llegar a valores negativos.
- Orden por defecto: **por generación**. Un toggle permite **ordenar por vencimiento**.
- El generador usa una **semilla**, así las partidas son reproducibles.
- La carga media debe rondar la capacidad en velocidad Estándar (200 botellas/ciclo) y nunca superar la capacidad en Alta (400), con picos para que la velocidad Alta tenga sentido.
- Para la demo se prepararán **escenarios «enlatados»**: demanda programada en un fichero JSON.

### Cumplimiento (0–100 %, arranca en 100 %)

| Condición (cada ciclo) | Efecto |
|---|---|
| No hay pedidos en la cola de demanda | −20 % |
| Por cada pedido **en producción** y **no en retraso** (contador ≥ 0) | +5 % |
| Por cada pedido de la cola de demanda **en retraso** (contador < 0) | −5 % |

- «En producción» = es el pedido **actual** de una línea activa. Un pedido «siguiente» o aparcado no cuenta.
- **Sin doble penalización:** un pedido tardío **no terminado** penaliza solo en Cumplimiento. Una vez **terminado**, penaliza solo en Entrega.

## 4. Líneas de producción

Hay **4 líneas**, cada una con tres velocidades. Su efecto se mide en la **Productividad** (0–100 %, arranca en 100 %).

| Velocidad | Botellas/ciclo | Efecto en Productividad, por línea y ciclo | Realidad que modela |
|---|---|---|---|
| Baja | 25 | −5 % | Fábrica a medio gas, personal ocioso, costes repartidos entre poco producto. |
| Estándar | 50 | +5 % | Velocidad de crucero. |
| Alta | 100 | −3 % | Saturación del personal, averías y gasto de suministros disparado. |

### 4.1 Pedidos de cada línea
Cada línea tiene dos huecos: el pedido **actual** y el **siguiente**. Al arrastrar un pedido de la cola de demanda:
- Si la línea no tiene pedido, se asigna como actual.
- Si ya tiene actual, se asigna como **siguiente** (el actual es de solo lectura), y el siguiente anterior se desconecta.

Un botón **intercambia** actual y siguiente. Un pedido puede estar en curso en **varias líneas a la vez**.

### 4.2 Línea apagada
El interruptor de apagado **libera** los pedidos actual y siguiente de esa línea. Lo ya producido queda en el stock de expediciones y lo pendiente sigue en el backlog. La decisión es independiente de otras líneas que produzcan el mismo pedido.

- Una línea apagada, o sin pedido, produce 0 y no suma ni resta productividad.
- No admite asignaciones hasta encenderla; al encenderla parte vacía.
- Liberar un pedido parcialmente producido lo deja «incompleto en stock y no activo», con la penalización del §4.4.

### 4.3 Reparto de producción
- Las líneas se procesan **en orden 1→4**.
- Cada línea aporta `min(su capacidad, botellas pendientes del pedido actual)`.
- Si sobra capacidad, pasa al pedido **siguiente** de la línea. Si no existe, el sobrante **se pierde**.
- Si el pedido actual se completa, el siguiente pasa a actual.
- Si dos líneas trabajan el mismo pedido y se completa, solo la primera carga sobre él; las otras siguen con su pedido siguiente.
- Cambiar el pedido de una línea no borra lo ya producido: permanece en el stock asociado a su pedido original.

### 4.4 Otras penalizaciones de Productividad

| Condición (cada ciclo) | Efecto |
|---|---|
| Por cada pedido incompleto con stock en expediciones que **no es el pedido actual de una línea encendida** | −5 % |
| Stock de expediciones cero, hay demanda y ningún pedido activo | −20 % |

## 5. Expediciones y Entrega

### 5.1 Stock de expediciones
Es una cola de producto con dos tipos de entrada:
- **Pedidos terminados**: disponibles para expedir. En pantalla van arriba, por orden de finalización.
- **Pedidos en curso**: con producción parcial. Muestran su contador pero **no penalizan** en Entrega. En pantalla van debajo.

### 5.2 Muelles
| Muelle | Cuándo está activo |
|---|---|
| Muelle 1 | Siempre. |
| Muelle 2 | Con **3 o más líneas activas**. |

Cada ciclo el jugador asigna a cada muelle activo uno de los pedidos terminados del stock. Puede dejar los muelles vacíos. Si el muelle 2 se desactiva con un pedido asignado, la asignación se cancela **sin penalización**.

### 5.3 Entrega (0–100 %, arranca en 100 %)

| Condición (cada ciclo) | Efecto |
|---|---|
| Pedido entregado **a tiempo** (contador ≥ 0) | +10 % |
| Pedido entregado **con retraso** (contador < 0) | 0 % (ni bonifica ni penaliza) |
| Pedido terminado en stock, **no expedido**, con contador en **[−3, 0)** | −5 % |
| Ídem, con contador en **[−10, −3)** | −10 % |
| Ídem, con contador **< −10** | −20 % |
| Por cada pedido terminado en stock **no expedido** | −5 % (se suma a lo anterior) |
| Ídem, si hay muelle libre y pedidos candidatos sin asignar | −15 % en vez de −5 % (se suma a los tramos por retraso) |

- Los tramos de retraso se aplican **en cada ciclo**. Los extremos van al tramo más favorable: −3 al de −5 %, −10 al de −10 %.
- Solo penalizan los pedidos del stock con contador negativo que **no llegan a un muelle** en ese ciclo.
- Las penalizaciones por «terminado sin entregar» solo aplican a pedidos que ya estaban terminados al inicio del ciclo.
- No hay penalizaciones si no hay pedidos terminados.
- El objetivo de la zona de expediciones es mantener el mínimo stock, entregando a tiempo.

## 6. Rentabilidad

`Rentabilidad = 0.25 · Cumplimiento + 0.50 · Productividad + 0.25 · Entrega`

Se muestra como porcentaje de 0 a 100 %. Es un **indicador aproximado de rentabilidad y coste**: no existe un modelo de costes explícito. La puntuación final de la partida es la **media de la Rentabilidad** de todos los ciclos.

## 7. Dinámica de una partida

**Estado inicial:** cola de demanda con pedidos, líneas inactivas, stock vacío y los tres OKR al 100 %. El jugador asigna los primeros pedidos a las líneas y pulsa Play.

**Acciones posibles en cada planificación:**
1. Asociar pedidos a líneas, arrastrando desde la cola de demanda.
2. Intercambiar el pedido actual y el siguiente de una línea.
3. Encender o apagar líneas.
4. Cambiar la velocidad de las líneas.
5. Asignar pedidos terminados a los muelles.

Después llega la resolución del ciclo (§2), que actualiza OKR, stock, contadores y demanda.

**Control de partida:**
- Botones **Play**, **Pause**, **Stop** y **Paso** (avanza un ciclo en pausa).
- Campo **Ciclos totales**, contador de **ciclos pendientes** y toggle **«Limitar ciclos»**. Apagado, la partida es infinita y termina con Stop. Encendido, termina al agotar los ciclos.
- **Tiempo de ciclo**: barra deslizante, por defecto **15 s** (rango 3–60 s).
- Al terminar, por Stop o por agotar ciclos, se ofrece **guardar el resultado**.

## 8. Interfaz

```
┌────────────────────────────────────────────────────────────────────┐
│ OKR: Cumplimiento · PRODUCTIVIDAD (grande) · Entrega               │
│ ▶ Play  ⏸ Pause  ⏹ Stop  ⏭ Paso  [IA mode]  Ciclos / Limitar        │
├───────────┬──────────────────────────────┬─────────┬───────┬───────┤
│ Demanda   │ Línea 1: [Siguiente]⇄[Actual]│ Stock   │Muelle │ Tabla │
│ comercial │ Línea 2: velocidad ▢▢▢ ⏻     │ exped.  │  1    │ KPI   │
│ (tarjetas)│ Línea 3: resultado próximo   │(tarjeta)│Muelle │ por   │
│           │ Línea 4: ciclo               │         │  2    │ ciclo │
└───────────┴──────────────────────────────┴─────────┴───────┴───────┘
```

- **Panel superior (OKR):** cumplimiento, productividad (en fuente mayor) y entrega. Botones de control. En pausa, botón **IA mode** para cargar el JSON de una IA.
- **Izquierda, demanda comercial:** tarjetas arrastrables con cantidad inicial, pendiente, ciclos originales, ciclos pendientes y líneas asociadas. Color: **verde tenue** si están asociadas a una línea, **blanco** si no tienen producción, **amarillo tenue** si están parcialmente producidas y sin línea.
- **Centro, líneas:** cada línea tiene un panel pequeño a la izquierda (pedido siguiente) y uno mayor a la derecha (pedido actual), tres controles de velocidad apilados y siempre visibles, un botón para intercambiar los pedidos, un interruptor de apagado y un panel inferior con lo que producirá en el próximo ciclo (unidades e impacto en productividad).
- **Stock de expediciones:** cola de tarjetas arrastrables. Terminados arriba por orden de finalización, incompletos debajo.
- **Muelles:** dos huecos para tarjetas. Se activan o desactivan según el §5.2.
- **Panel de resultados:** tabla con una fila por ciclo (Ciclo, Cumplimiento, Productividad, Entrega, Rentabilidad), dos gráficas de líneas (una con los tres OKR y otra solo con Productividad) y, sobre la tabla, un emoji de estado.

| Productividad | Emoji |
|---|---|
| ≥ 70 % | Sonríe |
| 50–69 % | Neutro |
| 30–49 % | Preocupado |
| < 30 % | Enfadado |

**Interacción:** solo **arrastrar y soltar**. La demo será en remoto y es importante que se vea lo que mueve el ratón.

## 9. Conector IA

El juego tiene dos interfaces: la UI para personas y una API para una IA.

### 9.1 Flujo
- Botón **IA mode** (solo en pausa): carga un JSON desde archivo y actualiza la pantalla.
- Además, **«Copiar estado»** y una caja **«Pegar acciones»**, para usar cualquier IA sin servidor.
- Más adelante, un endpoint HTTP local (`GET /state`, `POST /actions`) que reutilice la misma función de aplicación de acciones.

### 9.2 Formato
- **Estado (salida):** el estado del ciclo actual y del anterior, con reglas resumidas, histórico de OKR, acciones posibles y los errores del ciclo anterior.
- **Acciones (entrada):** **declarativas**, con la configuración deseada completa. Por línea: encendida, velocidad, actual y siguiente (una línea apagada implica ambos vacíos). Por muelle: pedido.
- Campo opcional **`comentario`** con el razonamiento de la IA, mostrado en un panel.
- La UI **resalta** lo que ha cambiado la IA.

### 9.3 Acciones no permitidas
Es la acción que rompe las reglas. Ejemplos: un pedido inexistente, una velocidad que no existe, un pedido no terminado en un muelle, el muelle 2 estando inactivo, el mismo pedido como actual y siguiente de una línea, o pedidos en una línea apagada.

El sistema **descarta solo esa acción**, aplica el resto y muestra un mensaje legible («Línea 3: el pedido P-14 no existe. Se ignora.»). Esa lista viaja en el estado del ciclo siguiente para que la IA se corrija. La UI humana ya impide estas acciones.

## 10. Arquitectura técnica

- **Stack:** Vite + TypeScript + Preact + Chart.js. El Canvas solo hace falta para las gráficas.
- **Motor puro sin DOM:** `step(estado, acciones) → estado`, determinista y serializable. Sobre él van la UI, la API de IA, los tests (Vitest) y el replay.
- **Entidad única `Pedido`:** la cola de demanda y el stock de expediciones son vistas filtradas de una misma lista.
- **Semilla** en el generador de demanda y **escenarios «enlatados»** para la demo.
- **Guardado de partida:** semilla, escenario, acciones por ciclo y tabla de KPI, exportable. Permite reproducir la partida y comparar humano contra IA.
- **Fichero único de balance** con todas las cifras (porcentajes, capacidades, umbrales), para ajustar sin tocar la lógica.

## 11. Pendiente para después
- Calibrar el equilibrio con **bots** (todo Estándar, todo Alta, aleatorio, IA). Con las reglas actuales, todo Estándar satura la Productividad al 100 % y la demanda debe forzar decisiones.
- Ajustar penalizaciones y recompensas tras jugar.
- Diseñar los escenarios enlatados de la demo.
