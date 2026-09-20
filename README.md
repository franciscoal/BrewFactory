# BrewFactory

Simulador por ciclos de una fábrica de bebidas, jugable por una persona o por una IA, pensado para una demostración. Hay que atender una demanda comercial que llega por sorpresa, decidiendo en cada ciclo qué produce cada línea, a qué velocidad y qué se expide, para maximizar la **rentabilidad**.

La especificación completa está en [Docs/brevFactory.md](Docs/brevFactory.md). Para que una IA juegue, ver [Docs/skill-jugar-brewfactory.md](Docs/skill-jugar-brewfactory.md).

## Requisitos

- [Node.js](https://nodejs.org) 20 o superior (probado con 22) y npm.

## Arrancar en local

```bash
npm install
npm run dev
```

Abre <http://localhost:5173>. Los cambios en el código se ven al instante.

Para la demo, con la aplicación compilada:

```bash
npm run build
npm run preview
```

Se sirve en <http://localhost:4173>. Para abrirla desde otro equipo de la red, añade `-- --host` al comando (`npm run dev -- --host`).

## Scripts

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con recarga en caliente (puerto 5173). Permite guardar la configuración desde el botón ⚙. |
| `npm run build` | Comprueba los tipos y compila la aplicación en `dist/`. |
| `npm run preview` | Sirve la compilación de `dist/` (puerto 4173). También permite guardar la configuración. |
| `npm test` | Ejecuta los tests (reglas del motor, informe, conector IA, escenarios, bots y configuración). |
| `npm run typecheck` | Comprueba los tipos de TypeScript sin compilar. |
| `npm run calibrar` | Juega miles de partidas con bots y muestra por pantalla cómo de equilibradas están las cifras. No modifica ningún fichero. |

`npm run calibrar` admite opciones, pero hay que lanzarlo directamente porque npm no las reenvía bien:

```bash
npx tsx scripts/calibrar.ts 48 200                              # 48 ciclos, 200 partidas por estrategia
npx tsx scripts/calibrar.ts 48 200 --solo-aleatorias            # sin los escenarios enlatados
npx tsx scripts/calibrar.ts 48 200 --set=velocidades.alta.productividad=-4   # probar una cifra sin tocar ficheros
npx tsx scripts/calibrar.ts 48 200 --config=otro-balance.json   # probar otro fichero de balance
```

## Cómo se juega

1. Arrastra pedidos de **Demanda comercial** a las líneas de producción (hueco *actual* o *siguiente*).
2. Elige la velocidad de cada línea y enciende o apaga las que quieras.
3. Cuando un pedido termina, arrástralo desde el **Stock de expediciones** a un **muelle** para expedirlo.
4. Pulsa ▶ (el ciclo avanza solo, 15 s por defecto), ⏸ para pausar o ⏭ para avanzar un ciclo a mano.

Otras funciones de la cabecera:

- **Escenario**: demanda aleatoria por semilla o uno de los escenarios enlatados (`src/escenarios/`).- **Mostrar estado por ciclo**: resume qué se decidió en cada ciclo y el impacto en los OKR.
- **▶ ⏸ ⏹ ⏭**: Play, Pause, Stop y Paso (un ciclo manual).
- **Piloto y Modo**: **Usuario** (manual, juegas tú), **Bot** (Gestor, Todo Estándar… juega solo y explica sus decisiones) o **IA** (Gemini; ver más abajo). Con un bot, baja el tiempo de ciclo para verlo rápido.
- **Conexión API**: permite que un agente externo juegue por HTTP.
- **Registro Sheets** y **Registro Db**: guardan estado, acciones y resultado de cada ciclo en una hoja de Google Sheets y/o en PostgreSQL (apagados por defecto; ver «Registro de decisiones»). Son independientes: se pueden activar los dos a la vez.
- **⚙ Configuración**: ajusta todas las bonificaciones y penalizaciones y las guarda en `public/config/balance.json`.
- Pestaña **Resultados**: gráficas y tabla por ciclo. Al terminar la partida se puede guardar el resultado en JSON.

## Registro de decisiones (base de conocimiento para una IA)

Dos destinos independientes, cada uno con su interruptor. Ambos guardan lo mismo: una fila por ciclo en `decisiones` y una por versión de reglas en `reglas`. Los fallos de un destino no afectan a la partida ni al otro (el indicador pasa a 🔴).

### Google Sheets

Con el interruptor **Registro Sheets** activo, cada ciclo añade una fila a la hoja `decisiones` (estado que vio quien decidió, acciones propuestas, razonamiento, resultado y retorno a 3 ciclos y hasta el final de la partida) y, una vez por versión de reglas/balance, una fila en `reglas`. Se registran todos los pilotos (columna `piloto`). Los fallos de Google no afectan a la partida: el indicador pasa a 🔴.

Preparación (una vez, con tu cuenta de Google; el script se ejecuta como tú, así que **la hoja puede seguir siendo privada**):

1. En la hoja: **Extensiones → Apps Script**. Pega [servidor/apps-script/registro.gs](servidor/apps-script/registro.gs) y guarda.
2. **Ajustes del proyecto → Propiedades de la secuencia de comandos**: añade `SECRETO` con un texto largo y aleatorio.
3. **Implementar → Nueva implementación → Aplicación web**. Ejecutar como *Yo*; acceso *Cualquier usuario* (solo permite llamar a la URL; sin el secreto no escribe nada). Autoriza los permisos que pida.
4. En `.env.local`: `SHEETS_WEBHOOK_URL` (la URL que termina en `/exec`) y `SHEETS_SECRET` (el mismo secreto). Reinicia `npm run dev`.

Si cambias el script hay que publicar una **versión nueva** (Implementar → Administrar implementaciones → editar). Si tu cuenta es de una organización, el administrador puede impedir el acceso «Cualquier usuario».

### PostgreSQL (Docker)

**Registro Db** escribe en una base PostgreSQL **propia de BrewFactory**: un contenedor `brewfactory-db` (postgres:16-alpine, solo accesible desde este equipo en `127.0.0.1:5433`) definido en [docker-compose.yml](docker-compose.yml). No usa ni toca ninguna otra instancia de Postgres que tengas en Docker.

En un equipo nuevo, una sola vez:

1. En `.env.local` define una contraseña y la URL (la misma contraseña en las dos):
   ```
   BREWFACTORY_DB_PASSWORD=una_contraseña_larga
   BREWFACTORY_DATABASE_URL=postgres://brewfactory:una_contraseña_larga@localhost:5433/brewfactory
   ```
2. `npm run db:up` crea y arranca el contenedor (espera a que esté sano). Las tablas (`decisiones`, `reglas`) y la vista `mejores_jugadas` se crean solas al activar el interruptor.
3. Reinicia `npm run dev`. `npm run db:down` para el contenedor sin borrar los datos (viven en el volumen `brewfactory-db-datos`).

Consulta rápida de datos:

```bash
docker exec brewfactory-db psql -U brewfactory -d brewfactory -c "select * from mejores_jugadas limit 10"
```

Si cambias `BREWFACTORY_DB_PASSWORD` con datos ya creados, la base seguirá con la contraseña antigua (solo se aplica al crear el volumen): bórralo con `docker compose --env-file .env.local down -v` (**pierde los datos**) o cámbiala con `ALTER USER`.

## Jugar con una IA

Hay dos formas. Ambas necesitan `npm run dev` o `npm run preview`.

1. **Piloto IA integrado (Gemini).** Crea el fichero `.env.local` a partir de `.env.example` y pon tu clave:

   ```
   GEMINI_API_KEY=tu_clave
   # GEMINI_MODEL=gemini-3.6-flash   (opcional, es el valor por defecto; identificadores vigentes en https://ai.google.dev/gemini-api/docs/models)
   ```

   Reinicia el servidor y elige **Piloto → IA**. La clave solo la usa el servidor local y `.env.local` no se sube a git (no la pongas en `.env.example`, que sí se versiona). Sin clave la aplicación arranca igual y, al elegir la IA, muestra «IA no disponible». Con la IA no hay tiempo de ciclo, y cada decisión tarda unos segundos:
   - **Autónomo**: pulsa ▶ y la IA juega sola (pide la decisión, la aplica, resuelve el ciclo y repite). Usa «Limitar ciclos» para acotar las peticiones.
   - **Paso a paso**: ⏭ pide la decisión a la IA; otra pulsación la aplica; la siguiente resuelve el ciclo y pide la próxima. **Ver respuesta** muestra el JSON recibido.
2. **Agente externo por la API HTTP.** Con la aplicación abierta en el navegador y el interruptor **Conexión API** activado, un agente puede jugar solo:

```bash
curl -s http://localhost:5173/api/estado                      # estado para la IA
curl -s -X POST http://localhost:5173/api/acciones -H "Content-Type: application/json" -d @acciones.json
curl -s -X POST http://localhost:5173/api/paso                # resuelve un ciclo y devuelve el estado nuevo
curl -s http://localhost:5173/api/skill                       # instrucciones para la IA
```

`/api/paso` solo funciona con la partida parada o en pausa. Si hay varias ventanas abiertas, solo la primera controla la API (las demás muestran 🟠). El estado vive en el navegador; el servidor solo hace de buzón.

## Estructura

| Ruta | Contenido |
|---|---|
| `src/engine/` | Motor del juego, sin dependencias de la interfaz: `step(estado, acciones)`, reglas, informe por ciclo, conector IA y escenarios. |
| `src/ui/` | Interfaz (Preact): paneles, arrastrar y soltar, configuración, pilotos (bots e IA). |
| `src/bots/` | Estrategias automáticas y simulador usados para calibrar. |
| `src/escenarios/` | Escenarios enlatados en JSON. |
| `servidor/` | Lado servidor, montado por Vite en desarrollo y en `preview`: API HTTP para agentes externos (`api.ts`) y cliente de Gemini (`gemini.ts`). |
| `public/config/balance.json` | **Cifras del juego** (fuente única). |
| `src/config/balance-original.json` | Cifras de la especificación original, usadas por los tests y por «Restaurar originales». |
| `scripts/calibrar.ts` | Script de calibración. |
| `Docs/` | Especificación, reglas originales y skill para IA. |

## Configuración del juego

Todas las cifras (porcentajes, capacidades, umbrales, demanda) están en `public/config/balance.json`. Se editan desde el botón ⚙ o a mano, y el mismo fichero lo usa `npm run calibrar`. El botón **Guardar en archivo** solo funciona con `npm run dev` o `npm run preview`; en otro caso, usa **Exportar**.
