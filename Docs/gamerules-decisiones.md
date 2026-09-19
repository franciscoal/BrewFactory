# BrewFactory — Decisiones de diseño (v1)

Complementa y **prevalece sobre** `gamerules.md` en todo lo que aquí se indique. Las cifras de penalización y recompensa son un punto de partida: se ajustarán al ver el juego funcionar (ver §10).

Leyenda: ✅ decidido por el responsable · 🔶 propuesta a confirmar.

## 0. Glosario

| Término | Significado |
|---|---|
| **Ciclo** | Una hora de producción. Se compone de una fase de *planificación* y una de *resolución*. |
| **Pedido** | Unidad de demanda comercial: cantidad, botellas producidas, contador de ciclos de entrega. |
| **Cola de demanda** | Vista de los pedidos **no terminados**. |
| **Stock de expediciones** | Vista de los pedidos con producción iniciada o terminada y no entregados. |
| **Pedido terminado** | Producido al completo y pendiente de entregar. |
| **Pedido en curso** | Con producción parcial (en línea o aparcado). |
| **Línea activa** | Línea encendida y con pedido actual asignado. |
| **Actual / Siguiente** | Los dos huecos de pedido de una línea. |
| **Muelle** | Cada uno de los dos puestos de expedición. |
| **Contador (o «ciclos pendientes»)** | Ciclos que faltan para el vencimiento. Puede ser negativo (retraso). |
| **OKR** | Cumplimiento, Productividad, Entrega. **Rentabilidad** = resultado combinado. |

## 1. Modelo de ciclo (sin simultaneidad) ✅

Cada ciclo tiene dos fases:

1. **Planificación**: el tiempo del juego se detiene el número de segundos configurado. El jugador (o la IA) reconfigura líneas, pedidos y muelles **sobre la foto del estado anterior**. Nada se calcula durante esta fase.
2. **Resolución**: al agotarse el tiempo (o al pulsar *Paso*), el sistema calcula el nuevo estado. **Cada operación usa solo la foto anterior**, sin ver los efectos de las demás en el mismo ciclo.

Orden fijo de la resolución 🔶:

1. Validar y aplicar las acciones del jugador/IA (ver §8.3).
2. **Producción**: líneas 1→4 (ver §3).
3. **Expedición**: los muelles entregan los pedidos que se les asignaron. Solo pueden entregarse pedidos que **ya eran «terminados» al inicio del ciclo**.
4. Los pedidos completados en el paso 2 pasan a «terminados» (visibles en la foto siguiente).
5. Cálculo de OKR y Rentabilidad con la foto del inicio y los eventos del ciclo.
6. Se reduce en 1 el contador de todos los pedidos.
7. Se genera nueva demanda (si toca).

Consecuencia (✅): un pedido completado en el ciclo *n* pasa al **stock de expediciones** al terminar *n* (no a un muelle). En la planificación de *n+1* el jugador lo asigna a un muelle y en la resolución de *n+1* se **expide**, desapareciendo del stock y del muelle. Nunca se entrega en el mismo ciclo en que se completa.

✅ *Lo que ve el jugador es lo que cuenta*: el «a tiempo» de una entrega se evalúa con el contador **tal como estaba en la foto** al asignar el pedido al muelle: **≥ 0 = a tiempo**, **< 0 = con retraso**. Se evalúa antes de decrementarlo en el paso 6.

Aclaraciones de aplicación 🔶:
- Los pasos 2 (producción) y 5 (OKR) trabajan con la configuración resultante del paso 1. La **excepción intencionada a la «foto»** es el reparto entre líneas del §3.3, que consume secuencialmente las botellas pendientes de un pedido.
- El estado de las líneas (y por tanto la activación del muelle 2) se evalúa **tras aplicar los cambios de líneas** en el paso 1. Si una línea se apaga en esa misma planificación y el muelle 2 queda inactivo, su asignación se cancela.
- Un pedido que se completa en este ciclo cuenta como «en producción» y como «no terminado» en los OKR de este ciclo (no como terminado hasta el siguiente).

## 2. Demanda comercial y Cumplimiento

### 2.1 Cola de demanda
- Orden por defecto: **por generación** ✅. Toggle **«Ordenar por vencimiento»** ✅.
- El jugador no puede crear ni modificar demanda ✅.
- 🔶 El generador de demanda no debe superar la capacidad de la fábrica **en Alta** (400 botellas/ciclo), y su carga media debe rondar la capacidad **Estándar** (200) con picos para que la velocidad Alta tenga sentido.

### 2.2 Cumplimiento (0–100 %, arranca en 100 %) ✅
Cada ciclo, se aplican todos los apartados que correspondan:

| Condición | Efecto |
|---|---|
| No hay pedidos en la cola de demanda | −20 % (una sola vez por ciclo) |
| Por cada pedido **en producción** y **no en retraso** (contador ≥ 0) | **+5 %** *(sustituye al criterio antiguo «+10 % por pedido entregado»)* |
| Por cada pedido de la cola de demanda **en retraso** (contador < 0) | −5 % |

- 🔶 «En producción» = pedido que es el **actual** de alguna línea activa. Un pedido «siguiente» o aparcado no cuenta.
- Tope máximo 100 %, mínimo 0 %.
- ✅ **Sin doble penalización**: un pedido tardío **no terminado** penaliza solo en Cumplimiento. Una vez **terminado**, deja de penalizar en Cumplimiento y pasa a penalizar solo en Entrega (§4).

## 3. Líneas de producción y Productividad

### 3.1 Velocidades
| Velocidad | Botellas/ciclo | Efecto en Productividad por línea y ciclo |
|---|---|---|
| Baja | 25 | −5 % |
| Estándar | 50 | +5 % |
| Alta | 100 | −3 % |

Productividad arranca en **100 %** ✅, con tope 0–100 %.

### 3.2 Línea apagada ✅
- El interruptor de apagado **libera** los pedidos actual y siguiente de esa línea. Lo ya producido queda en el **stock de expediciones** y lo pendiente sigue en el **backlog de la demanda comercial**.
- La decisión es **independiente de otras líneas**: si el pedido también se produce en otras líneas, estas siguen con él.
- Una línea apagada produce 0 y **no suma ni resta** productividad.
- Una línea «sin pedido» está inactiva a todos los efectos (misma consecuencia).
- 🔶 Una línea apagada **no admite asignaciones**; al encenderla parte vacía y se le asignan pedidos arrastrando.
- Consecuencia a tener en cuenta: liberar un pedido parcialmente producido lo deja «incompleto en stock y no activo», con la penalización de productividad del §3.4.

### 3.3 Reparto de producción (multilínea) ✅
- Las líneas se procesan **en orden 1→4**.
- Cada línea aporta `min(su capacidad, botellas pendientes del pedido actual)`.
- Si sobra capacidad, pasa al pedido **siguiente** de la línea (si existe). Si no existe, **el sobrante se pierde**.
- Si el pedido actual se completa, el siguiente pasa a actual en la resolución (paso 4).
- Si dos líneas trabajan el mismo pedido y se completa, solo la primera (en orden) carga sobre él; las demás siguen con su pedido siguiente.

### 3.4 Otras penalizaciones de productividad (se mantienen)
- Cada pedido incompleto con stock en expediciones que **no esté activo en ninguna línea**: −5 % por cada uno y ciclo. 🔶 «Activo» = actual de una línea encendida.
- Stock de expediciones cero, hay demanda y ningún pedido activo: −20 % por ciclo.

## 4. Expediciones y Entrega

### 4.1 Muelles ✅
- **Muelle 1**: siempre activo.
- **Muelle 2**: activo cuando hay **3 o más líneas activas**.
- ✅ Si el muelle 2 se desactiva con un pedido asignado, la asignación se cancela (el pedido sigue en stock) y **no hay penalización**.
- Puede terminarse un ciclo con los muelles vacíos.

### 4.2 Entrega (0–100 %, arranca en 100 %) ✅
Cada ciclo:

| Condición | Efecto |
|---|---|
| Pedido entregado **a tiempo** (contador ≥ 0 en la foto) | +10 % |
| Pedido entregado **con retraso** (contador < 0 en la foto) | 0 % *(ni bonifica ni penaliza)* |
| Pedido terminado en stock, **no expedido en este ciclo**, con contador en **[−3, 0)** | −5 % |
| Ídem, con contador en **[−10, −3)** | −10 % |
| Ídem, con contador **< −10** | −20 % |
| Por cada pedido terminado en stock **no expedido** en este ciclo | −5 % *(se suma a lo anterior)* |
| Ídem, si hay muelle libre y pedidos candidatos sin asignar | −15 % *(en vez de −5 %; se suma a los tramos por retraso)* |

- Los tramos son cerrados por el extremo más favorable: −3 va al tramo de −5 %, −10 va al de −10 %.
- Los tramos se aplican **en cada ciclo**.
- ✅ Los tramos de retraso solo penalizan a pedidos **en el stock de expediciones con contador negativo que no llegan a un muelle** en ese ciclo. Un pedido tardío que se entrega no penaliza.
- 🔶 Las penalizaciones por «terminado sin entregar» solo aplican a pedidos que ya eran terminados **al inicio** del ciclo.
- No aplican penalizaciones si no hay pedidos terminados.
- Los pedidos «en curso» muestran su contador pero **no penalizan** en Entrega (ya lo hacen en Cumplimiento).

## 5. Rentabilidad ✅

`Rentabilidad = 0.25·Cumplimiento + 0.50·Productividad + 0.25·Entrega`

- Es un **proxy de rentabilidad/coste**: no existe un modelo de costes explícito.
- Puntuación final de la partida = **media de Rentabilidad** por ciclo. 🔶

## 6. Control de partida

### 6.1 Panel superior ✅
Play · Pause · Stop · **Paso** 🔶 (avanza un ciclo estando en pausa) · **Ciclos totales** (campo numérico) · **Contador de ciclos pendientes** · toggle **«Limitar ciclos»**.

- «Limitar ciclos» **apagado**: partida infinita. Termina con **Stop**.
- «Limitar ciclos» **encendido**: la partida termina al agotar los ciclos.
- Se puede cambiar el tiempo de ciclo con una **barra deslizante**, por defecto **15 s** ✅ (rango sugerido 3–60 s 🔶).
- Al terminar (por Stop o por agotar ciclos) se ofrece **guardar el resultado** ✅: semilla, escenario, acciones por ciclo y tabla de KPI (ver §9).

### 6.2 Emoji de estado (Productividad) ✅
≥ 70 % sonríe · 50–69 % neutro · 30–49 % preocupado · < 30 % enfadado.

### 6.3 Interacción ✅
**Solo arrastrar y soltar** (no clic-clic): la demo será en remoto y hay que ver lo que hace el ratón.

## 7. Estado inicial ✅
Cola de demanda con pedidos, líneas inactivas, stock de expediciones vacío. Cumplimiento, Productividad y Entrega al 100 %. El jugador asigna pedidos a las líneas y pulsa Play.

## 8. Conector IA

### 8.1 Flujo
- Botón **«IA mode»** (solo en pausa): carga un JSON desde archivo ✅.
- 🔶 Adicionalmente: **«Copiar estado»** y una caja **«Pegar acciones»**, para poder usar cualquier IA sin servidor.
- Más adelante: endpoint HTTP local (`GET /state`, `POST /actions`) que reutilice la misma función `aplicarAcciones`.

### 8.2 Formato
- **Estado (salida)**: todo el estado del ciclo actual y del anterior, con reglas resumidas, histórico de OKR y acciones posibles.
- **Acciones (entrada)**: **declarativas**, con la configuración deseada completa: por línea (encendida, velocidad, actual, siguiente; una línea apagada implica actual y siguiente vacíos) y por muelle (pedido). No es una lista de comandos.
- Campo opcional **`comentario`** con el razonamiento de la IA, mostrado en un panel ✅.
- La UI **resalta** lo que ha cambiado la IA (parpadeo de tarjetas movidas).

### 8.3 Validación: acciones no permitidas
Una acción **no permitida** es la que rompe las reglas del juego. Ejemplos: asignar un pedido inexistente, usar una velocidad que no existe, poner en un muelle un pedido no terminado, usar el muelle 2 estando inactivo, poner el mismo pedido como actual y siguiente de una línea, asignar pedidos a una línea apagada.

Comportamiento: el sistema **descarta solo esa acción**, aplica el resto y muestra una lista legible («Línea 3: el pedido P-14 no existe. Se ignora.»). En el estado del ciclo siguiente se incluye esa lista, para que la IA pueda corregir. La UI humana ya impide estas acciones, por lo que esto afecta sobre todo a la IA.

## 9. Arquitectura técnica ✅ (salvo lo marcado)

- **Stack**: Vite + TypeScript + Preact + Chart.js 🔶. Canvas solo para gráficas.
- **Motor puro sin DOM**: `step(estado, acciones) → estado`, determinista y serializable. Sobre él van la UI, la API de IA, los tests (Vitest) y el replay.
- **Entidad única `Pedido`**: cola de demanda y stock de expediciones son vistas filtradas de una misma lista.
- **Semilla** en el generador de demanda: partidas reproducibles.
- **Escenarios «enlatados»** para la demo: ficheros JSON con demanda programada (picos, retrasos...).
- **Guardado de partida**: semilla + escenario + acciones por ciclo + tabla de KPI, exportable. Permite replay y comparar humano contra IA.
- **Un único fichero de balance** (`balance`) con todas las cifras (porcentajes, capacidades, umbrales) para ajustar sin tocar la lógica.

## 10. Pendiente para después ✅
- Calibrar el equilibrio con **bots** (todo Estándar, todo Alta, aleatorio, IA).
- Ajustar penalizaciones y recompensas tras jugar. Es esperable que aparezcan desequilibrios.
- Diseñar los escenarios enlatados de la demo.
