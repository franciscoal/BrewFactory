# Proyecto “Fábrica de bebidas”

Vamos a realizar un proyecto, en forma de juego, para una presentación / demostración de una IA controlando diversos aspectos de una fábrica. La idea es que pueda ser jugado por personas y que también una IA pueda conectarse a través de una API u otro sistema que definiremos más adelante.

## Las reglas del juego.

Construiremos un simulador de la cadena de producción de una fábrica de bebidas desde la demanda comercial a la expedición a cliente. El objetivo será atender la demanda comercial con el mínimo coste posible, manteniendo la Fábrica en un estado sostenible, minimizando costes y mejorando la rentabilidad.
La fábrica irá progresando por ciclos discretos, correspondiendo cada ciclo a una hora de producción. Cada ciclo de una hora corresponderá a un número de segundos en el juego que será el tiempo que el jugador tendrá para modificar las diferentes variables. 
Nuestro juego tiene los siguientes componentes.

### 1.- Demanda comercial.

Será una cola priorizada de pedidos que el juego irá generando aleatoriamente y la fábrica producirá. La demanda comercial constará de una cantidad de botellas y uno ciclos de entrega iniciales. A medida que los ciclos vayan transcurriendo los ciclos de entrega de toda la demanda se irán reduciendo en uno pudiendo llegar a valores negativos. El sistema encolará la demanda comercial en un “backlog” de pedidos que se mostrará al jugador en la pantalla.

El jugador no tiene capacidad de actuación en la demanda comercial que le vendrá por sorpresa. La aplicación cuidará que la demanda comercial que va generando no exceda de la capacidad de la Fábrica si bien las decisiones del jugador podrán agotarla antes de tiempo con la penalización correspondiente en productividad o hacer que tengamos pedidos en retraso si no los hemos producido a tiempo.

Esta demanda condicionará los valores de otras variables como el número de líneas de producción operativas, la necesidad de materias primas, etc. Que el jugador tendrá que ir modificando en cada iteración del juego.

La demanda comercial se valorará de 0% a 100%, en un parámetro llamado “Cumplimiento” en función de los siguientes valores:

- En el caso que no haya demanda pendiente porque las líneas hayan avanzado muy deprisa, El valor se reducirá un 20% en cada ciclo. Modelaría el caso en el mundo real de parar la fábrica y absorber los costes estructurales sin ingresos.

- Si la demanda está atendida en fecha, la demanda comercial se irá incrementando un 10% por pedido entregado. Una vez alcanzado el 100% no crecerá más.

- Si tenemos elementos de demanda comercial en valores negativos que no hemos podido producir, cada uno reducirá el valor de demanda comercial en un 5% en cada ciclo.

### 2.- Líneas de producción.

Su contribución se mantendrá en una variable, también de 0% a 100% llamada “productividad”. El sistema constará de 4 líneas de producción que funcionarán a tres velocidades:
- Baja: En baja velocidad, la línea producirá 25 botellas por ciclo. Cada ciclo en el que una línea esté en baja velocidad, Penalizará la variable productividad en un 5%. Corresponde a la situación real de tener una fábrica a medio gas, con personal ocioso/desmotivado, y gastando consumibles y suministros con menos producto en el que repartir los costes)

- Estándar: Es la velocidad de crucero de la fábrica. La productividad crecerá un 5% por cada línea en estado estándar / ciclo. En este estado la línea producirá 50 botellas por ciclo.

- Alta: En este estado la producción se maximiza, a 100 botellas por ciclo, pero la productividad disminuirá al mantener la línea al límite, Modelando el caso real de aumentar la saturación del personal, la posibilidad de averías y el gasto de suministros disparado. Este estado favorecerá otras variables, pero perjudicará a la productividad en un 3% por ciclo por cada línea/Ciclo.
Si en un ciclo un pedido se termina con menos de la producción generada (Al pedido le quedan 15 botellas, pero produzco 50) la línea generará solo los 15 contra el stock de la zona de expediciones en ese ciclo y el resto sobre el pedido siguiente si es que está seleccionado en la línea.

Cada línea de producción tendrá asignada dos líneas / pedidos activos de la demanda comercial. La actual y la siguiente. En cada ciclo se sumará la producción de cada una de las líneas al inventario del pedido actual en el muelle de entregas, que se definirá más adelante. Existirá un control para intercambiar el pedido activo y el siguiente y la asociación de un pedido a una línea con un pedido activo se hará solo en el control del pedido siguiente, siendo el actual de solo lectura. Si la línea no tiene pedido activo la asociación se realizará sobre el pedido activo directamente.

Una línea sin pedido asociado (bien porque este se ha terminado o por que el usuario ha retirado el pedido activo) se entiende desactivada.

Una vez terminado un pedido, en ese ciclo el sistema eliminará el pedido de la cola de demanda, habrá una línea de stock pendiente de entregar en el almacén de expediciones que heredará lo que quede pendiente del contador de ciclos de entrega de la demanda comercial.
Cambiar el pedido asociado a la línea implicará que el inventario irá a un nuevo “bucket” pero el ya producido permanecerá en el stock de expediciones asociado a su pedido original y no podrá ser entregado hasta que este se complete.

Un pedido puede estar en curso en varias líneas a la vez. Si un pedido multilínea se completa solo una de ellas cargará inventario sobre el pedido original y las otras lo harán sobre el pedido siguiente respectivo que pasará a ser el activo.

Un pedido de demanda comercial solo saldrá de la cola de demanda una vez que esté producido al completo. En este momento estará disponible en el muelle de entregas para ser expedido. Hasta no estar terminado permanecerá en la cola de demanda tanto se mantendrá ahí con un contador de las botellas que tiene pendientes de producir y a la vez, habrá un registro de inventario en el muelle de entregas con el inventario producido y no entregado.

Fragmentar el stock de la zona de expediciones también penalizará a la producción. Cada ciclo en el que haya stock en expediciones de pedidos incompletos (no pueden entregarse) y que no están activos en ninguna línea de producción, el valor de productividad se reducirá un 5% por cada uno.
Si el stock de expediciones es cero, existe demanda comercial y no hay pedidos activos, la productividad se penalizará un 20% por ciclo.

### 3.- Expediciones.

Dispondremos de dos “muelles” de entregas. El primero se activará solo cuando tengamos dos o menos líneas de producción activos. El segundo lo hará cuando se active la línea 3 y/4. El jugador podrá asignar a cada muelle el pedido que se entregará en el ciclo siguiente de entre los pedidos terminados del stock en el área de expediciones. Es posible terminar un ciclo con una o las dos líneas de expediciones vacías.

Dicho stock será de nuevo una única cola de producto terminado (inventario). Cada entrada dispone del número de botellas terminadas y un contador de los ciclos pendientes para su entrega. 

Tendremos dos tipos de entradas:

- Pedidos terminados: La línea de producción ha generado todas las botellas necesarias. Heredaron el contador de ciclos de entrega con el valor que tuviera en el ciclo que se produjeron y están disponibles para ser seleccionados por el usuario para su expedición. En cada ciclo podremos seleccionar un pedido por cada línea muelle de expedición activo y en cada ciclo también se reducirá en uno el valor del contador de tiempo de entrega.

- Pedidos en curso: Estos pedidos están en la línea de producción o bien, el usuario comenzó a producirlos y los retiró de la línea activa quedando a la espera. En ambos casos se ha generado algo de stock que permanece en inventario sin poder ser entregado.  En estos pedidos el contador de ciclos pendientes para entrega será visible pero no penalizará, puesto que ya lo hacen en la demanda comercial.

El objetivo de la zona de expediciones será mantener el mínimo stock, entregando los pedidos a tiempo. Su estado se medirá en un parámetro “Entrega” que se modificará de la forma siguiente:

- 10% adicional en cada pedido entregado a tiempo. (Teniendo 0 o más en su contador de ciclos pendientes de entrega)
- Cada pedido no entregado a tiempo penalizará un 5% si el contador de ciclos es menor que cero y mayor que -3. Si el contador es menor que -3 penalizará un 10% y si éste es menor que -10 lo hará un 20%.
- Cada pedido listo para la entrega, que esté en el stock de inventario y que no se haya entregado, penalizará un 5%. La penalización subirá al 15% si hay líneas de expediciones disponibles y éstas no se han usado habiendo pedidos candidatos. Esta penalización no aplicará si no hay pedidos terminados o el stock en expediciones es cero.

### 4.-Rentabilidad

La puntuación del juego se resumirá en un contador global al que llamaremos rentabilidad que irá del 0% al 100%.

La rentabilidad será el resultado de la operación siguiente, presentado en forma de porcentaje.

Rentabilidad = 0.25*cumplimiento + 0.50*productividad + 0.25*entrega.
Dinámica del juego

Partiremos con una configuración inicial en la que se nos ofrecerá una demanda comercial con las líneas inactivas y el stock de expediciones a cero. Estableceremos el tiempo de ciclo (por defecto 5 segundos)

El jugador asignará la primera demanda comercial a tratar a cada línea y pulsará un botón “play” para comenzar.

## UX

La interfaz gráfica del juego constará de los siguientes elementos:

- Un panel superior, etiquetado OKR con los valores de cumplimiento, productividad, entrega y con un tamaño mayor de fuente, la productividad. También un botón play para arrancar el juego, uno de stop para detenerlo y terminar uno de pause que detendrá el tiempo de ciclo permitiendo al usuario actuar sin presiones y mostrar el estado. En modo pause existirá un botón IA mode actualizará la pantalla con un Json procedente de una IA que podremos cargar, en modo pause, a partir de un archivo que se solicitará al pulsarlo.

- Un panel a la izquierda con una cola de “tarjetas” con la demanda comercial, Las entradas de este panel están en orden de generación y deben permitir arrastrar dichas entradas a la línea de producción para la operación de asociación.  Dichas tarjetas mostrarán la cantidad inicial pedida, la pendiente de producción, los ciclos originales de entrega, los ciclos pendientes y las líneas de producción a las que este pedido está asociado. Aquellos pedidos asociados a líneas se mostrarán en un color diferente (verde claro tenue) mientras las no asociadas permanecerán en blanco (si no tienen producción alguna en la cola de stock) o en amarillo tenue si están parcialmente producidas y no activas en una línea.

- En la parte central de la pantalla, para modelar las líneas de producción dispondremos para cada uno de un conjunto de dos paneles. Uno a la izquierda con el espacio para contener una tarjeta con la información del pedido siguiente y otro a la derecha con un tamaño mayor y la información del pedido actual, tres controles apilados para elegir la velocidad de la línea (deben mostrarse a la vez, no un desplegable…) y un panel a la debajo con el resultado que la línea generará en el próximo ciclo (unidades producidas, impacto en la productividad). Entre los dos paneles habrá un control (botón) entre ellos para intercambiar los pedidos y un interruptor para apagar la línea.

- A la derecha de este conjunto dispondremos de una cola similar a la de la demanda comercial con el stock de expediciones. Los pedidos terminados se colocarán en la parte superior de la cola en orden de finalización y los incompletos debajo de estos. De nuevo el usuario podrá arrastrar tarjetas de esta cola a las líneas de expediciones.

- Más a la derecha, dos espacios para las tarjetas de los dos “muelles de expedición” que se activarán o desactivarán en función de las reglas anteriores.

- En el tope de la derecha habrá un panel que en la parte superior contendrá una tabla en la que se agregará una entrada por cada ciclo con las columnas número de ciclo (etiquetado como Ciclo a secas), cumplimiento, productividad, entrega y rentabilidad para cada ciclo. En la parte superior se irán componiendo con los valores de cada ciclo dos gráficas de líneas, una con los valores de cumplimiento, productividad, entrega y otra separada solo con la productividad. Sobre la tabla mostraremos un e-moji que sonreirá si la productividad está sobre el 70%, mostrará un rostro neutro si está entre el 70% y el 50%, preocupación entre el 50% y el 30% y enfado por debajo del 30%.

## Dinámica del juego

El jugador dispondrá del tiempo de ciclo para realizar ninguna, una o varias acciones del conjunto de las siguientes:

### 1.- Asociar pedidos a líneas de producción

Arrastrando desde la cola de demanda a las líneas en función de que exista pedido activo o siguiente según lo explicado anteriormente. Arrastrar un pedido de la cola a siguiente o activo (si no hay siguiente) implicará la asociación del nuevo pedido a la línea y la desconexión del antiguo de la línea.

### 2.- Cambiar entre pedido activo / siguiente para cada línea
Con el control anteriormente definido en UX

### 3.- Activar / desactivar líneas de producción. 
Con el control definido en UX

### 4.- Modificar las velocidades de trabajo de las líneas.
Con los controles definidos en UX

### 5.- Encolar pedidos para ser entregados en las líneas de expediciones activas.
Tras esto el ciclo terminará, el sistema calculará el impacto sobre los OKR del estado de cada elemento, recalculará los totales y los colocará en el panel de resultados. Así mismo actualizará el nuevo estado del stock de producción, los ciclos pendientes de demanda comercial y stock pendiente de expediciones y pasará los pedidos siguientes a activos en aquellas líneas que hayan terminado.

## Conector AI

El juego dispondrá de dos interfaces en la práctica. Una UI para la interacción humana definida anteriormente y una API que generará un JSon con el todo el estado del ciclo activo, anterior, inteligible para una IA que pueda jugar y que generará otro con las acciones a realizar. Existirá un endpoint que recibirá esta respuesta y configurará la pantalla con el resultado de la IA. En la versión inicial atacaremos ese Endpoint con el botón ModoIA Anteriormente descrito.
