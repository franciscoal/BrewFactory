---
name: jugar-brewfactory
description: Juega a BrewFactory, un simulador por ciclos de una fábrica de bebidas. Úsalo cuando el usuario te pase un JSON con "juego": "BrewFactory" (el estado de la fábrica) y espere que decidas qué producir, a qué velocidad y qué expedir, devolviendo otro JSON con las acciones.
---

# Skill: jugar a BrewFactory

## Qué es esto

BrewFactory es una fábrica de bebidas simulada por ciclos (1 ciclo = 1 hora). El usuario te pasa el **estado** de la fábrica en JSON. Tú decides qué hacer y devuelves un JSON de **acciones**. El usuario lo pega en el juego, se resuelve un ciclo y te da el estado siguiente. Repetís hasta que él pare.

**Tu objetivo:** maximizar la **rentabilidad** media de todos los ciclos (0–100). Es una mezcla ponderada de tres indicadores:

- **Cumplimiento**: sube con pedidos en producción a tiempo, baja con pedidos pendientes en retraso.
- **Productividad**: depende de la velocidad de las líneas (un «nivel de fatiga»).
- **Entrega**: sube al expedir a tiempo, baja con pedidos terminados que se quedan sin expedir o con retraso.

Los pesos y las cifras exactas **cambian de una partida a otra**. La fuente de verdad es el campo `reglas` del estado que recibas: léelo siempre y úsalo por encima de lo que digan estas notas.

## Qué recibes: el estado

Un objeto JSON con estos campos:

| Campo | Significado |
|---|---|
| `reglas` | Lista de reglas con las cifras vigentes. **Léelo primero.** |
| `ciclo` | Último ciclo resuelto. Tus acciones se aplican al ciclo siguiente. |
| `okr` | Valores actuales: `cumplimiento`, `productividad`, `entrega`, `rentabilidad`. |
| `historialOkr` | Últimos ciclos, para ver la tendencia. |
| `velocidades` | Botellas por ciclo y efecto en productividad de `baja`, `estandar` y `alta`. |
| `pedidos` | Todos los pedidos vivos (ver abajo). |
| `lineas` | Las líneas de producción y lo que tienen asignado. |
| `muelles` | Los puestos de expedición, si están activos y qué pedido tienen. |
| `informeCicloAnterior` | Qué se decidió en el ciclo anterior, qué ocurrió y el impacto en cada OKR con su causa. |
| `erroresCicloAnterior` | Acciones tuyas que se descartaron por no estar permitidas. **Corrígelas.** |
| `formatoAcciones` | Plantilla de la respuesta esperada. |

Cada elemento de `pedidos`:

- `id` (por ejemplo `"P-3"`), `cantidad`, `producido`, `pendiente` (= cantidad − producido).
- `ciclosPendientes`: ciclos que faltan para el vencimiento. **Negativo = retraso.** Baja 1 por ciclo.
- `estado`: `pendiente` (sin producir), `en_curso` (producción parcial) o `terminado` (listo para expedir).
- `lineas`: ids de las líneas donde está asignado.

Cada elemento de `lineas`: `id`, `encendida`, `activa` (encendida y con pedido actual), `velocidad`, `actual` (pedido que produce) y `siguiente` (reserva).

Cada elemento de `muelles`: `numero`, `activo` y `pedido`.

## Qué devuelves: las acciones

**Responde únicamente con un objeto JSON**, sin texto alrededor. Es preferible que no lleve bloque de código; si lo llevas, el juego lo tolera, pero cualquier otro texto puede impedir que se lea.

```json
{
  "comentario": "Explicación breve de tu razonamiento (opcional, se muestra en pantalla).",
  "lineas": [
    { "id": 1, "encendida": true, "velocidad": "estandar", "actual": "P-1", "siguiente": "P-4" },
    { "id": 2, "encendida": true, "velocidad": "alta", "actual": "P-2", "siguiente": null },
    { "id": 3, "encendida": true, "velocidad": "estandar", "actual": "P-3", "siguiente": null },
    { "id": 4, "encendida": false, "velocidad": "estandar", "actual": null, "siguiente": null }
  ],
  "muelles": ["P-7", null]
}
```

Reglas del formato:

- Describe la **configuración deseada completa** para el ciclo, no cambios. Envía siempre las 4 líneas y los 2 muelles.
- `velocidad` es exactamente `"baja"`, `"estandar"` o `"alta"` (sin tilde).
- `actual`, `siguiente` y cada muelle llevan un **id de pedido** o `null` (vacío).
- Un campo que omitas conserva su valor actual; `null` lo vacía. Para evitar sorpresas, no omitas campos.
- `comentario` es texto libre y opcional. Sé breve (una o dos frases).

## Reglas que debes respetar

Si rompes una, esa parte de tu respuesta se **descarta** y se te avisa en `erroresCicloAnterior`; el resto se aplica.

1. Solo puedes asignar a una línea pedidos **que existan** y **no estén terminados**.
2. Una línea **apagada** (`encendida: false`) no puede tener pedidos: `actual` y `siguiente` deben ser `null`. Apagarla libera sus pedidos.
3. Un pedido no puede ser a la vez `actual` y `siguiente` de la misma línea. Sí puede estar en **varias líneas distintas** a la vez.
4. Solo puedes poner en un muelle un pedido con `estado: "terminado"`, y el mismo pedido no puede estar en los dos muelles.
5. El muelle 2 solo se puede usar si `activo` es `true` (depende de cuántas líneas activas haya, ver `reglas`). El muelle 1 está siempre activo.
6. Un pedido que se completa en este ciclo aparece como `terminado` en el estado siguiente, y **hasta entonces no se puede expedir**: nunca se entrega en el mismo ciclo en que se completa.

## Cómo pensar cada ciclo

Sigue este orden.

1. **Lee `erroresCicloAnterior` e `informeCicloAnterior`.** Si algo se descartó, entiende por qué. Mira los efectos negativos del informe: te dicen exactamente qué está costando puntos.
2. **Expide primero.** Todo pedido `terminado` debe salir cuanto antes: cada ciclo que espera cuesta puntos, y más si va con retraso o había un muelle libre. Reparte los terminados en los muelles activos por **urgencia** (menor `ciclosPendientes` primero). Deja un muelle vacío solo si no hay terminados.
3. **Asigna la producción por urgencia.** Ordena los pedidos no terminados por `ciclosPendientes` ascendente. Los que ya van con retraso (negativos) van primero.
   - Cada línea encendida debe tener un `actual`. Una línea encendida sin pedido no produce ni suma.
   - Pon como `siguiente` el pedido más urgente que quede libre: recibe el sobrante de producción y evita que la línea se pare.
   - No dejes pedidos `en_curso` sin línea: son un coste continuo en productividad. Si una línea los libera, retómalos.
   - Si un pedido es grande y urgente, puedes ponerlo como `actual` en varias líneas para acabarlo antes.
4. **Elige la velocidad de cada línea** (aquí está lo difícil):
   - `estandar` es el punto de partida y **recupera** productividad.
   - `alta` produce mucho más pero **gasta** productividad en cada línea y ciclo. Úsala solo cuando haya cartera acumulada o pedidos en riesgo de retraso y te lo puedas permitir.
   - `baja` casi nunca compensa: produce poco y también resta productividad.
   - Estima la **cartera** = suma de `pendiente` de los pedidos no terminados. Si supera lo que producen tus líneas en unos 3 ciclos a `estandar`, sube a `alta` las líneas necesarias (una a una, empezando por las que llevan los pedidos más urgentes).
   - **Vigila la productividad (`okr.productividad`).** Si baja de aproximadamente 65, limita las líneas en `alta`; por debajo de 35, todo a `estandar` para recuperarla. Cuando la cartera se vacíe, vuelve a `estandar`.
5. **Apaga líneas solo con motivo**, por ejemplo cuando no hay pedidos que asignarles. Recuerda que apagar una línea con un pedido a medias lo deja «incompleto sin línea» y eso penaliza.
6. **Comprueba la respuesta** antes de enviarla: ids que existen, ningún pedido terminado en una línea, ninguno no terminado en un muelle, ningún pedido repetido como `actual` y `siguiente`, líneas apagadas sin pedidos, muelle 2 usado solo si está activo.

## Consejos de estrategia

- La **regularidad** gana: una fábrica con todas las líneas en `estandar` produce 200 botellas por ciclo y mantiene la productividad, pero no da abasto cuando la demanda sube. La demanda llega en **oleadas** (épocas de sobra y de saturación): anticípate.
- Mira la tendencia en `historialOkr` y los pedidos que se acercan a 0 en `ciclosPendientes`: te avisan de retrasos futuros.
- No corrijas en exceso: cambiar de pedido una línea a medias dispersa el stock y cuesta productividad. Mantén el `actual` mientras no sea urgente cambiarlo.
- Piensa en el ciclo siguiente: lo que completes ahora se expide en el próximo. Deja siempre libre un muelle para ello.

## Ejemplo mínimo

Estado (recortado):

```json
{
  "juego": "BrewFactory",
  "ciclo": 3,
  "okr": { "cumplimiento": 90, "productividad": 100, "entrega": 100, "rentabilidad": 96.6 },
  "pedidos": [
    { "id": "P-1", "cantidad": 100, "producido": 100, "pendiente": 0,   "ciclosPendientes": 2, "estado": "terminado", "lineas": [] },
    { "id": "P-2", "cantidad": 200, "producido": 50,  "pendiente": 150, "ciclosPendientes": 1, "estado": "en_curso",  "lineas": [1] },
    { "id": "P-3", "cantidad": 125, "producido": 0,   "pendiente": 125, "ciclosPendientes": 4, "estado": "pendiente", "lineas": [] }
  ],
  "lineas": [
    { "id": 1, "encendida": true, "activa": true,  "velocidad": "estandar", "actual": "P-2", "siguiente": null },
    { "id": 2, "encendida": true, "activa": false, "velocidad": "estandar", "actual": null,  "siguiente": null }
  ],
  "muelles": [ { "numero": 1, "activo": true, "pedido": null }, { "numero": 2, "activo": false, "pedido": null } ]
}
```

Respuesta razonada: expido `P-1` (terminado). `P-2` vence en 1 ciclo y le faltan 150: lo subo a `alta` en la línea 1 y también lo pongo en la línea 2 para acabarlo antes. `P-3` queda de siguiente en la línea 2 para no perder el sobrante.

```json
{
  "comentario": "Expido P-1. P-2 vence en 1 ciclo: lo saco en dos líneas y la 1 va en alta. P-3 queda de reserva.",
  "lineas": [
    { "id": 1, "encendida": true, "velocidad": "alta", "actual": "P-2", "siguiente": "P-3" },
    { "id": 2, "encendida": true, "velocidad": "estandar", "actual": "P-2", "siguiente": "P-3" },
    { "id": 3, "encendida": true, "velocidad": "estandar", "actual": null, "siguiente": null },
    { "id": 4, "encendida": true, "velocidad": "estandar", "actual": null, "siguiente": null }
  ],
  "muelles": ["P-1", null]
}
```

## Errores frecuentes

- Devolver solo los cambios en lugar de la configuración completa.
- Escribir `"estándar"` con tilde o `"normal"`: la velocidad se descarta.
- Asignar un pedido `terminado` a una línea, o uno `pendiente` a un muelle.
- Usar el muelle 2 cuando `activo` es `false`.
- Dejar líneas encendidas sin pedido, o pedidos `en_curso` sin línea.
- Poner `alta` en todas las líneas de forma sostenida: hunde la productividad.
- Añadir texto antes o después del JSON.

## Cómo lo usa la persona

1. En el juego, con la partida parada o en **Pause**, pulsa **🤖 IA mode**.
2. **Copiar estado** y pégalo en la conversación con la IA junto a este skill.
3. Pega en el cuadro **Acciones de la IA** el JSON que devuelva, o cárgalo desde un archivo, y pulsa **Aplicar acciones**.
4. El juego resalta lo que ha cambiado la IA y muestra su `comentario`. Pulsa **Paso** (o **Play**) para resolver el ciclo y repite.
