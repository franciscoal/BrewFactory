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
- **Carga por defecto:** de media 1,3 pedidos por ciclo de 75 a 325 botellas (unas 260 botellas/ciclo), por encima de la capacidad en Estándar (200) y por debajo de la capacidad en Alta (400). La demanda se mueve en **oleadas** de 16 ciclos entre el 20 % y el 180 % de la media, de modo que hay épocas de sobra y épocas de saturación. La fase de la oleada depende de la semilla. Todos estos valores se ajustan en el botón ⚙ (§8.1).
- Para la demo se prepararán **escenarios «enlatados»**: demanda programada en un fichero JSON.

### Cumplimiento (0–100 %, arranca en 100 %)

| Condición (cada ciclo) | Efecto |
|---|---|
| No hay pedidos en la cola de demanda | −20 % |
| Por cada pedido **en producción** y **no en retraso** (contador ≥ 0) | +5 % |
| Por cada pedido de la cola de demanda **en retraso** (contador < 0) | −8 % (original: −5 %) |

- «En producción» = es el pedido **actual** de una línea activa. Un pedido «siguiente» o aparcado no cuenta.
- **Sin doble penalización:** un pedido tardío **no terminado** penaliza solo en Cumplimiento. Una vez **terminado**, penaliza solo en Entrega.

## 4. Líneas de producción

Hay **4 líneas**, cada una con tres velocidades. Su efecto se mide en la **Productividad** (0–100 %, arranca en 100 %).

| Velocidad | Botellas/ciclo | Efecto en Productividad, por línea y ciclo | Realidad que modela |
|---|---|---|---|
| Baja | 25 | −5 % | Fábrica a medio gas, personal ocioso, costes repartidos entre poco producto. |
| Estándar | 50 | +5 % | Velocidad de crucero. |
| Alta | 100 | −6 % | Saturación del personal, averías y gasto de suministros disparado. |

Con estos valores la Productividad funciona como un **nivel de fatiga**: se puede tirar de velocidad Alta para absorber un pico de demanda, pero hay que recuperar después en Estándar. Los valores de la especificación original (Alta −3 %) están en `src/config/balance-original.json` y se recuperan con «Restaurar originales» en ⚙.

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

Cada ciclo el jugador asigna a cada muelle activo uno de los pedidos terminados del stock. Puede dejar los muelles vacíos. En pantalla, **un pedido asignado a un muelle desaparece de la cola del stock** (así no se puede asignar dos veces). Si se arrastra otro pedido a un muelle ocupado, **sustituye** al que había, y todo pedido que finalmente no se expide (por sustitución, por ✕ o porque el muelle 2 se cierra) **vuelve a la cola del stock**. Las tarjetas de un muelle también se pueden arrastrar al otro. Si el muelle 2 se desactiva con un pedido asignado, la asignación se cancela **sin penalización**.

### 5.3 Entrega (0–100 %, arranca en 100 %)

| Condición (cada ciclo) | Efecto |
|---|---|
| Pedido entregado **a tiempo** (contador ≥ 0) | +10 % |
| Pedido entregado **con retraso** (contador < 0) | 0 % (ni bonifica ni penaliza) |
| Pedido terminado en stock, **no expedido**, con contador en **[−2, 0)** (retraso leve) | −8 % |
| Ídem, con contador en **[−6, −2)** (retraso medio) | −16 % |
| Ídem, con contador **< −6** (retraso grave) | −30 % |
| Por cada pedido terminado en stock **no expedido** | −8 % (se suma a lo anterior) |
| Ídem, si hay muelle libre y pedidos candidatos sin asignar | −20 % en vez de −8 % (se suma a los tramos por retraso) |

- Los tramos de retraso se aplican **en cada ciclo**. Los extremos van al tramo más favorable: −2 al leve, −6 al medio.
- Los valores de la especificación original eran −5/−10/−20 % con umbrales de 3 y 10 ciclos (y −5/−15 % para «sin expedir»). Los valores actuales endurecen el retraso para que dejarlo todo en Estándar no compense (§11).
- Solo penalizan los pedidos del stock con contador negativo que **no llegan a un muelle** en ese ciclo.
- Las penalizaciones por «terminado sin entregar» solo aplican a pedidos que ya estaban terminados al inicio del ciclo.
- No hay penalizaciones si no hay pedidos terminados.
- El objetivo de la zona de expediciones es mantener el mínimo stock, entregando a tiempo.

## 6. Rentabilidad

`Rentabilidad = 0.33 · Cumplimiento + 0.34 · Productividad + 0.33 · Entrega`

(La especificación original usaba 0,25 / 0,50 / 0,25. Los pesos se ajustan en ⚙ y deben sumar 1.)

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
- Botones **▶ Play**, **⏸ Pause**, **⏹ Stop** y **⏭ Paso** (avanza un ciclo en pausa). Solo llevan icono; el texto aparece al pasar el ratón. Con el piloto IA cambian de significado (§9.4).
- Campo **Ciclos totales**, contador de **ciclos pendientes** e interruptor **«Limitar ciclos»**. Apagado, la partida es infinita y termina con Stop. Encendido, termina al agotar los ciclos.
- **Tiempo de ciclo**: barra deslizante, por defecto **15 s** (rango 3–60 s). A su derecha, el tiempo que falta para el ciclo siguiente.
- Interruptor **«Mostrar estado por ciclo»**: resume en la parte superior las decisiones del ciclo resuelto y su impacto (§8).
- Interruptor **«Conexión API»**: permite que una IA juegue por HTTP (§9.1).
- Al terminar, por Stop o por agotar ciclos, se ofrece **guardar el resultado**.

## 8. Interfaz

```
┌────────────────────────────────────────────────────────────────────┐
│ ▶ ⏸  Cumplim. · Product. · Entrega · RENTABILIDAD · Ciclo · 😀    ⚙ │
│ ⏹ ⏭                                                                │
│ Listo Piloto Modo Escenario [Cargar…] Conexión API                 │
│  Limitar · Ciclos totales · pendientes · Siguiente · Tiempo ─── ·  │
│  Mostrar estado por ciclo                                          │
├──────────────┬─────────────┐                                       │
│ 🍺 Fábrica   │ 📈 Resultados│   ← pestañas                          │
├───────────┬──┴───────────────────────────┬─────────┬───────────────┤
│ Demanda   │ Línea 1: [Siguiente]⇄[Actual]│ Stock   │ Muelle 1      │
│ comercial │ Línea 2: velocidad ▢▢▢ ⏻     │ exped.  │ Muelle 2      │
│ (tarjetas)│ Línea 3: resultado próximo   │(tarjeta)│               │
│           │ Línea 4: ciclo               │         │               │
└───────────┴──────────────────────────────┴─────────┴───────────────┘
   Pestaña «Resultados»: gráficas (OKR y Rentabilidad) y, debajo, la tabla por ciclo.
```

- **Cabecera, primera fila:** los cuatro botones de control (▶ ⏸ / ⏹ ⏭) en dos filas a la izquierda, los marcos de Cumplimiento, Productividad y Entrega, **Rentabilidad en fuente mayor** por ser el indicador total, el **Ciclo** actual (con el mismo aspecto que Entrega, sin color de nivel), el **emoji de estado** y, pegado al borde derecho, el botón **⚙** de configuración (§8.1). No lleva rótulo «OKR».
- **Cabecera, segunda fila** (de izquierda a derecha): el chip de fase, con colores suaves (**Listo** azul, **En juego** anaranjado, **En pausa** gris, **Terminada** verde); los desplegables **Piloto** y **Modo** (§9.4); el **Escenario**; **Conexión API** con su indicador de actividad; el interruptor **Limitar ciclos**, **Ciclos totales** (editable), **Ciclos pendientes** y **Siguiente ciclo** (estos dos con el mismo formato, pero de solo lectura), el deslizador de **Tiempo de ciclo** y, a continuación, **Mostrar estado por ciclo**. En pantallas estrechas la fila se parte en varias.
- **Franja de razonamiento:** bajo la cabecera, muestra el razonamiento de quien juega (bot, agente externo o IA). Con el piloto IA indica además el estado de la petición y lleva el botón **Ver respuesta** (§9.4).
- **Estilo de los controles:** los interruptores deslizantes son los mismos que encienden y apagan las líneas. El desplegable de escenario tiene el mismo aspecto que el campo «Ciclos totales» (fondo gris, tamaño de letra un punto mayor que su etiqueta).
- **Iconos:** 📋 Demanda comercial, 🏭 Líneas de producción, 📦 Stock de expediciones, 🚚 Muelles. En las velocidades, 🐌 Baja, 🐕 Estándar y 🐎 Alta (un caballo desbocado: velocidad y descontrol).
- **Pantallas pequeñas:** hasta 1200 px de ancho el tablero pasa a dos columnas (con las líneas a todo el ancho) y hasta 720 px a una sola, con la página desplazable. El arrastrar y soltar necesita ratón (el arrastre táctil de los navegadores móviles es poco fiable): para la demo, usar un ordenador.
- **Pestañas:** **Fábrica** (demanda, líneas, stock y muelles) y **Resultados** (gráficas y tabla por ciclo). El estado por ciclo y los OKR de la cabecera se ven en las dos.
- **Estado por ciclo (opcional):** panel bajo la cabecera que resume cada ciclo resuelto. Se activa con el toggle **«Mostrar estado por ciclo»** (ver más abajo).
- **Izquierda, demanda comercial:** tarjetas arrastrables con cantidad inicial, pendiente, ciclos originales, ciclos pendientes y líneas asociadas. Color: **verde tenue** si están asociadas a una línea, **blanco** si no tienen producción, **amarillo tenue** si están parcialmente producidas y sin línea.
- **Centro, líneas:** cada línea tiene un panel pequeño a la izquierda (pedido siguiente) y uno mayor a la derecha (pedido actual), tres controles de velocidad apilados y siempre visibles, un botón para intercambiar los pedidos, un interruptor de apagado y un panel inferior con lo que producirá en el próximo ciclo (unidades e impacto en productividad).
- **Stock de expediciones:** cola de tarjetas arrastrables. Terminados arriba por orden de finalización, incompletos debajo.
- **Muelles:** dos huecos para tarjetas. Se activan o desactivan según el §5.2.
- **Pestaña Resultados:** dos gráficas de líneas (una con los tres OKR y otra solo con Rentabilidad) y, debajo, la tabla con una fila por ciclo (Ciclo, Cumplimiento, Productividad, Entrega, Rentabilidad).

El **emoji** refleja la **Rentabilidad** y se muestra junto a su marco en la cabecera:

| Rentabilidad | Emoji |
|---|---|
| ≥ 70 % | Sonríe |
| 50–69 % | Neutro |
| 30–49 % | Preocupado |
| < 30 % | Enfadado |

### 8.1 Configuración (⚙)
El botón con la rueda dentada abre un panel para ajustar las cifras del juego, agrupadas por acción:

| Grupo | Qué se ajusta |
|---|---|
| Velocidades | Botellas por ciclo y efecto en Productividad de Baja, Estándar y Alta. |
| Cumplimiento, Productividad, Entrega | Cada bonificación y penalización en %, y los umbrales de retraso en ciclos. |
| Peso en la Rentabilidad | Los tres pesos (deben sumar 1). |
| Valores iniciales | OKR de partida. |
| Demanda aleatoria | Pedidos iniciales y por ciclo, cantidades, plazos y oleadas. |
| Muelles y tiempo | Líneas necesarias para el muelle 2 y tiempo de ciclo por defecto. |

Botones: **Aplicar** (usa los valores sin guardarlos), **Guardar en archivo** (escribe `public/config/balance.json`), **Exportar** e **Importar** un JSON, **Restaurar originales** (valores de la especificación) y **Descartar cambios**. El panel valida la coherencia (pesos, rangos, mínimos y máximos) antes de permitir aplicar o guardar. Si la partida no ha empezado, se reinicia con los nuevos valores manteniendo la semilla. Guardar solo funciona con el servidor de desarrollo o `vite preview`; en otro caso hay que usar Exportar.

El fichero `public/config/balance.json` es la **única fuente** de las cifras: lo lee la aplicación al arrancar, el botón ⚙ lo escribe y `npm run calibrar` lo usa para medir el efecto de cualquier cambio. Las reglas que se envían a la IA se generan desde estas cifras.

### Estado por ciclo

Con el toggle **«Mostrar estado por ciclo»** activado, cada vez que se resuelve un ciclo la parte superior del tablero resume de forma estructurada **qué se decidió y qué efecto tuvo**. El resumen permanece hasta el ciclo siguiente. Es el mismo informe que se incluye en el estado que recibe la IA (§9.2).

| Bloque | Contenido |
|---|---|
| **Decisiones** | Lo que cambió el jugador o la IA respecto al ciclo anterior, agrupado por tipo. |
| **Sucesos** | Lo que ocurrió al resolver el ciclo. |
| **Impacto** | Para cada OKR, el valor antes y después, y cada efecto con su causa. |

Decisiones, agrupadas:
- **Pedidos añadidos a producción** (pasan a ser el actual de una línea o quedan en reserva como siguiente).
- **Pedidos retirados de producción** (liberados de una línea).
- **Cambios de prioridad** (de activo a reserva y viceversa, mediante el intercambio).
- **Líneas encendidas o apagadas** y **cambios de velocidad**.
- **Pedidos asignados a muelle** para su expedición.

Sucesos: botellas producidas por línea, pedidos completados, pedidos expedidos (a tiempo o con retraso) y pedidos nuevos en la demanda.

Impacto: cada efecto indica el OKR, el porcentaje y el motivo. Ejemplos: «Productividad −5 %: línea 2 en velocidad Baja», «Entrega +10 %: P-3 expedido a tiempo», «Cumplimiento −5 %: P-7 en retraso (2 ciclos)». Si el valor llega al tope (0 % o 100 %), se indica que el cambio quedó limitado.

**Interacción:** solo **arrastrar y soltar**. La demo será en remoto y es importante que se vea lo que mueve el ratón.

## 9. Conector IA

El juego tiene dos interfaces: la UI para personas y una API para una IA. Una IA puede jugar de dos maneras: desde la propia aplicación con el **piloto IA** (§9.4, usa Gemini) o desde fuera, con la **API HTTP local** de este apartado.

### 9.1 Flujo
- El fichero [skill-jugar-brewfactory.md](skill-jugar-brewfactory.md) explica a cualquier IA cómo leer el estado, qué devolver y con qué criterios jugar. El piloto IA se lo envía como instrucciones de sistema; a un agente externo se le pasa junto al estado (o lo descarga de `GET /api/skill`).
- El JSON de acciones puede venir dentro de un bloque de código o con texto alrededor: el juego extrae el objeto.
- **API HTTP local** para que una IA o cualquier programa juegue (solo con `npm run dev` o `npm run preview`, con la aplicación abierta en el navegador y el interruptor **Conexión API** activado):

| Petición | Qué hace |
|---|---|
| `GET /api/estado` | Devuelve el estado para la IA (JSON con reglas, pedidos, líneas, muelles, informe del ciclo anterior y errores). |
| `POST /api/acciones` | Cuerpo: el JSON de acciones. La interfaz lo aplica (con resaltado y comentario) y la respuesta lista las acciones descartadas. **No resuelve el ciclo.** |
| `POST /api/paso` | Resuelve un ciclo (la partida debe estar parada o en pausa) y devuelve el estado nuevo. |
| `GET /api/skill` | Devuelve el skill en Markdown para la IA. |

  El estado vive en el navegador: el servidor solo hace de buzón entre la interfaz y el agente, y cada petición espera (hasta 8 s) a que la interfaz responda. Sin interfaz conectada, responde 503. Si hay varias ventanas abiertas, solo la primera controla la API y las demás muestran 🟠 en el interruptor. Los errores del JSON se devuelven como 400 con un mensaje legible. Un agente juega en bucle: `GET /api/estado` → decide → `POST /api/acciones` → `POST /api/paso`.
- Las acciones descartadas al aplicar (por el piloto IA o por la API) se conservan y aparecen en `erroresCicloAnterior` del estado siguiente.

### 9.2 Formato
- **Estado (salida):** el estado del ciclo actual y del anterior, con reglas resumidas, histórico de OKR, acciones posibles, los errores del ciclo anterior y el **informe del ciclo** (decisiones, sucesos e impacto, §8).
- **Acciones (entrada):** **declarativas**, con la configuración deseada completa. Por línea: encendida, velocidad, actual y siguiente (una línea apagada implica ambos vacíos). Por muelle: pedido.
- Campo opcional **`comentario`** con el razonamiento de la IA, mostrado en un panel.
- La UI **resalta** lo que ha cambiado la IA.

### 9.3 Acciones no permitidas
Es la acción que rompe las reglas. Ejemplos: un pedido inexistente, una velocidad que no existe, un pedido no terminado en un muelle, el muelle 2 estando inactivo, el mismo pedido como actual y siguiente de una línea, o pedidos en una línea apagada.

El sistema **descarta solo esa acción**, aplica el resto y muestra un mensaje legible («Línea 3: el pedido P-14 no existe. Se ignora.»). Esa lista viaja en el estado del ciclo siguiente para que la IA se corrija. La UI humana ya impide estas acciones.

### 9.4 Piloto y modo
Dos desplegables de la cabecera deciden quién juega y cómo:

| Piloto | Modo | Comportamiento |
|---|---|---|
| **Usuario** | Manual | Juega una persona, arrastrando (el modo de siempre). |
| **Bot** | Gestor, Adaptativo fino, Adaptativo, Mixto, Todo Estándar, Todo Alta, Todo Baja, Aleatorio | Un bot de `npm run calibrar` juega solo, con el tiempo de ciclo. |
| **IA** | Autónomo | Con ▶ la IA juega sola, sin tiempo de ciclo. |
| **IA** | Paso a paso | Con ⏭ se avanza de decisión en decisión (ver abajo). |

**Bots.** Al empezar cada ciclo (y al activarlo) el bot configura la fábrica: asigna pedidos por urgencia, fija velocidades y expide los terminados. Se ve cómo se mueven las tarjetas, se resalta lo cambiado y la franja de razonamiento explica la decisión, por ejemplo «Gestor: cartera de 775 botellas; 3 líneas en Alta, 1 línea en Estándar; P-1 es el más urgente (vence en 5 ciclos); expide P-6.». La partida avanza con ▶ (con el tiempo de ciclo) o con ⏭. Lo que edite una persona durante el ciclo se respeta hasta el siguiente, y con **Usuario** se recupera el control.

**IA (Gemini).** El servidor local envía a Gemini el estado de la partida (con el skill como instrucciones de sistema) y recibe las acciones como JSON estructurado. La clave nunca llega al navegador (§10). Con la IA **no hay tiempo de ciclo**: el deslizador y «Siguiente ciclo» quedan deshabilitados, porque se espera la respuesta del modelo.

- **Autónomo:** al pulsar ▶ se repite sin intervención: pedir la decisión (la franja muestra «La IA está pensando…») → aplicarla en la interfaz (con resaltado) → una pausa breve de 1,5 s para verla → resolver el ciclo → siguiente petición. ⏸ y ⏹ lo detienen (la respuesta que llegue tarde se descarta). «Limitar ciclos» pone el límite de peticiones. Si la IA falla, la partida queda en pausa con el error a la vista.
- **Paso a paso:** ▶ está deshabilitado y ⏭ hace en cada pulsación lo siguiente (su texto emergente lo indica):
  1. **Pedir la decisión** a la IA y esperar la respuesta. La franja muestra su razonamiento y el estado «pendiente», sin tocar la fábrica.
  2. **Aplicar** la decisión en la interfaz: se mueven las tarjetas y se resalta lo cambiado.
  3. **Resolver el ciclo** (con la actualización del estado y los OKR) y **pedir la decisión siguiente**. Se vuelve al punto 2 cuando llega la respuesta.
- **Ver respuesta:** el botón de la franja abre una ventana con el JSON que devolvió nuestra API (`POST /api/ia/decidir`): las acciones, el modelo, la latencia, los reintentos, los tokens usados y, en `respuestaCruda`, el texto exacto del modelo.
- **Errores:** los errores pasajeros de Google («alta demanda» 503, límite momentáneo 429, fallos 5xx) se reintentan automáticamente hasta 2 veces con espera creciente (2 s y 4 s). Si Gemini devuelve un JSON inválido, se repite una vez indicándole el fallo. Otros errores (clave incorrecta, modelo inexistente, sin conexión) se muestran con una pista; no se cambia en silencio a otro piloto. En «paso a paso», ⏭ reintenta. Una respuesta que necesitó repetirse lo indica en la franja («reintentada»).
- **Configuración:** crear `.env.local` (a partir de `.env.example`) con `GEMINI_API_KEY` y, si se quiere, `GEMINI_MODEL` (por defecto `gemini-3.6-flash`). `.env.local` no se sube a git; **no poner la clave en `.env.example`**, que sí se versiona.
- **Sin clave, la aplicación arranca igual.** Al elegir Piloto → IA, la franja de razonamiento muestra «IA no disponible» con el motivo, y el resto del juego (usuario y bots) funciona con normalidad.
- **Latencia real:** con `gemini-3.6-flash` cada decisión tarda unos 5–15 s, así que en el modo autónomo una partida de pocos ciclos dura un rato: conviene limitar los ciclos en la demo.

## 10. Arquitectura técnica

- **Stack:** Vite + TypeScript + Preact + Chart.js. El Canvas solo hace falta para las gráficas.
- **Motor puro sin DOM:** `step(estado, acciones) → estado`, determinista y serializable. Sobre él van la UI, la API de IA, los tests (Vitest) y el replay.
- **Entidad única `Pedido`:** la cola de demanda y el stock de expediciones son vistas filtradas de una misma lista.
- **Semilla** en el generador de demanda y **escenarios «enlatados»** para la demo.
- **Guardado de partida:** semilla, escenario, acciones por ciclo y tabla de KPI, exportable. Permite reproducir la partida y comparar humano contra IA.
- **Clave de la IA solo en el servidor:** `GEMINI_API_KEY` se lee de `.env.local` (fuera de git) en el proceso de Vite. El navegador solo habla con `/api/ia/decidir`, que llama a Gemini (`generateContent` con salida JSON estructurada, cabecera `x-goog-api-key`). El cliente (`servidor/gemini.ts`) se prueba con respuestas simuladas; la lógica de conversación (`src/ui/controlIA.ts`) no depende de React y también se prueba aislada.
- **Fichero único de balance** (`public/config/balance.json`) con todas las cifras (porcentajes, capacidades, umbrales, demanda), editable desde el botón ⚙ (§8.1) y sin tocar la lógica. Los valores de la especificación original se conservan en `src/config/balance-original.json`; los tests de reglas usan estos últimos para no depender del ajuste.

## 11. Escenarios y calibración

### Escenarios enlatados
Ficheros JSON en `src/escenarios/` con pedidos iniciales y llegadas programadas por ciclo. Se eligen en la cabecera (**Escenario**) antes de empezar. La carga de un escenario propio desde archivo (**Cargar escenario…**) está implementada pero **oculta** por ahora (constante `MOSTRAR_CARGA_ESCENARIO` en `SelectorEscenario.tsx`). Al agotarse el guion pueden seguir con demanda aleatoria (`aleatoriaTrasGuion`). Incluidos:

| Escenario | Qué muestra |
|---|---|
| Jornada tranquila | Demanda moderada y plazos holgados. Mecánica básica. |
| Pico de demanda | Avalancha de pedidos grandes hacia el ciclo 5: exige velocidad Alta y prioridades. |
| Entregas urgentes | Pedidos pequeños con plazos de 2–3 ciclos: exige expedir a tiempo con los dos muelles. |

### Bots de calibración
`npm run calibrar [-- ciclos partidas]` juega partidas completas con estrategias automáticas sobre demanda aleatoria y sobre cada escenario. Muestra rentabilidad media, mínima y máxima y los OKR finales. Opciones: `--config=ruta.json` (otro fichero de balance), `--set=grupo.campo=valor` (cambiar una cifra sin tocar ficheros, repetible) y `--solo-aleatorias`. Con opciones hay que lanzarlo directamente (`npx tsx scripts/calibrar.ts 48 200 --solo-aleatorias`), porque npm no las reenvía bien.

Estrategias: Todo Estándar, Todo Alta, Todo Baja, Aleatorio, Adaptativo (Alta en todas las líneas si hay mucha cartera), Mixto (2 líneas en Alta), Adaptativo fino (sube a Alta las líneas que pida la cartera) y **Gestor** (como el fino, pero se frena para recuperar la Productividad).

### Reequilibrado
**Problema inicial** (valores originales): todo Estándar daba un 95 % sin tomar ninguna decisión y la velocidad Alta nunca compensaba (Alta −3 %/línea hundía la Productividad y no había demanda que la exigiera).

**Cambios:**
- Alta pasa de −3 % a **−6 %**: usar Alta cuesta fatiga real.
- La demanda sube a **1,3 pedidos/ciclo de 75 a 325 botellas** (Estándar ya no basta).
- La demanda llega en **oleadas** (16 ciclos, amplitud 0,8): un ajuste estático no vale, hay que reaccionar.
- Pesos de la Rentabilidad **0,33 / 0,34 / 0,33** (decisión del responsable): Cumplimiento y Entrega pesan más y dejar pedidos sin servir sale más caro.
- **Retrasos ampliados** para penalizar el «todo Estándar»: retraso leve −8 %, medio −16 %, grave −30 % con umbrales de 2 y 6 ciclos; «terminado sin expedir» −8 % (−20 % con muelle libre) y pedido en retraso en Cumplimiento −8 %.

Resultados (48 ciclos, 200 partidas de demanda aleatoria por estrategia):

| Estrategia | Rentabilidad media | Observación |
|---|---|---|
| Gestor | 86 % | La mejor: usa Alta en los picos y recupera después. |
| Mixto (2 líneas en Alta) | 78 % | Productividad agotada, pero sirve la demanda. |
| Adaptativo | 77 % | Alta sostenida en todas las líneas hunde la Productividad. |
| Adaptativo fino | 75 % | Ídem, más suave. |
| Todo Estándar | 68 % | Cumplimiento a 0 % y Entrega al 46 %: no llega a la demanda. |
| Todo Alta | 63 % | Productividad 0 %. |
| Aleatorio | 44 % | Sin criterio. |
| Todo Baja | 38 % | Cumplimiento y productividad a 0 %. |

Los escenarios enlatados reproducen el orden (Gestor frente a Todo Estándar: Jornada tranquila 93 % vs 85 %, Pico de demanda 92 % vs 82 %, Entregas urgentes 78 % vs 60 %).

**Resultado del ajuste:** la ventaja del mejor bot sobre Todo Estándar pasó de unos 4 puntos a **unos 19**. Los bots aún no usan todas las palancas (apagar líneas, priorizar con criterios distintos del vencimiento, uso del muelle 2), que es donde una persona o una IA pueden ganar más.

## 12. Pendiente para después
- Seguir ajustando con ⚙ y `npm run calibrar`.
- Piloto automático con una IA de verdad (modelo de lenguaje): ver §9.4. El arrastre táctil y el soporte de móviles y tabletas quedan descartados por ahora.
