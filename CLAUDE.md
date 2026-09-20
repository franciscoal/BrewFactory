# BrewFactory — guía para retomar el trabajo

Simulador por ciclos de una fábrica de bebidas, jugable por una persona, por bots o por una IA (Gemini), pensado para una **demo desde el equipo local del usuario** (compartiendo pantalla). Especificación completa en `Docs/brevFactory.md` (**prevalece** sobre `Docs/gamerules.md` y `Docs/gamerules-decisiones.md`, que son históricos). README con arranque y scripts.

## Cómo trabajar con este usuario

- Responder **en español**. No narrar los pasos; trabajar en silencio y cerrar con un **resumen corto** (decisiones, resultados, pendientes). **No listar los archivos editados** (los ve en git).
- Si algo de lo pedido no tiene sentido o se contradice, **parar y consultarlo** antes de implementar. Los cambios de reglas del juego los decide el usuario.
- Hacer commit solo cuando lo pide. Antes de commitear: `npm run typecheck`, `npm test` y `npm run build` deben pasar.
- Al cambiar algo visible, actualizar `Docs/brevFactory.md` y, si aplica, `README.md` y el skill. Verificar la interfaz en el navegador cuando sea posible.
- Decisiones ya tomadas por el usuario: solo **arrastrar y soltar** (nada de clic-clic); **sin soporte táctil/móvil**; el KPI grande es la **Rentabilidad** y el emoji depende de ella; pesos de rentabilidad **0,33 / 0,34 / 0,33**; el botón «Cargar escenario…» está oculto a propósito.

## Puesta en marcha en un PC nuevo

```bash
git clone <repo> && cd BrewFactory
npm install
cp .env.example .env.local     # y poner GEMINI_API_KEY en .env.local
npm run dev                    # http://localhost:5173 (si está ocupado, Vite usa 5174…)
```

- Node ≥ 20 (se ha usado 22). Sin `.env.local` la app arranca igual; al elegir Piloto → IA se muestra «IA no disponible».
- **Nunca poner la clave en `.env.example`** (se versiona). `.env.local` está ignorado por git (`*.local`).
- El modelo por defecto es `gemini-3.6-flash` (`GEMINI_MODEL` en `.env.local` para cambiarlo; ids vigentes en https://ai.google.dev/gemini-api/docs/models).

## Comandos

| Comando | Para qué |
|---|---|
| `npm run db:up` / `npm run db:down` | Arranca / para el contenedor PostgreSQL propio (`brewfactory-db`, `docker-compose.yml`, puerto 5433). Necesita Docker y `BREWFACTORY_DB_PASSWORD` en `.env.local`. |
| `npm run dev` / `npm run preview` | Servidor de desarrollo / de la build. Ambos montan `/api` (agentes e IA) y `/__config` (guardar balance). |
| `npm test`, `npm run typecheck`, `npm run build` | Comprobaciones. Son 149 tests (motor, informe, IA, bots, servidor, configuración, registro en Sheets y Postgres). |
| `npx tsx scripts/calibrar.ts 48 200 [--solo-aleatorias] [--set=grupo.campo=valor] [--config=x.json]` | Juega miles de partidas con bots y muestra tablas. No modifica ficheros. Con opciones hay que llamarlo así: `npm run calibrar -- …` no las reenvía bien. |

## Arquitectura

- `src/engine/` — **motor puro**, sin DOM: `step(estado, acciones) → {estado, errores, informe}`, determinista (semilla), serializable. Orden de resolución: acciones → producción (líneas 1→4) → expedición → completados → OKR → contadores −1 → demanda. Un pedido completado en el ciclo *n* se expide como pronto en *n+1*. `acciones.ts` valida y **descarta solo la acción no permitida** (mensajes legibles). `ia.ts`: estado y reglas para la IA (`estadoParaIA`, `reglasIA()` se genera desde el balance) y `parsearAcciones` (tolera bloques de código).
- **Cifras en un único fichero**: `public/config/balance.json` (lo lee la app al arrancar, lo escribe el botón ⚙, lo usa `calibrar`). `BALANCE` es un objeto vivo que se sustituye con `aplicarBalance`. Los valores de la especificación original están en `src/config/balance-original.json` y **los tests de reglas los usan** (`usarBalanceOriginal()` en `src/engine/testing.ts`): no dependen del ajuste actual.
- `src/ui/` — Preact. `juego.ts`: estado de la partida (`Juego`), `plan` (lo que el jugador edita) y `vistaDe(estado, plan)` (lo que se dibuja); operaciones de edición `opAsignar`, `opMuelle`… `contexto.ts` reparte el estado. Cabecera con **Piloto** (Usuario / Bot / IA) y **Modo**.
- `src/bots/` — estrategias (`gestor`, `adaptativo-fino`, …) usadas por `calibrar` y por el piloto Bot; `explicar.ts` genera su «razonamiento».
- `src/ui/controlIA.ts` — conversación con la IA **sin React** (`ControlIA`, probada con entorno falso): modo *paso a paso* (⏭: pedir → aplicar → resolver y pedir) y *autónomo* (▶: bucle sin tiempo de ciclo). `useControlIA.ts` lo conecta a React.
- `servidor/` — lado servidor montado por Vite: `api.ts` (buzón para agentes externos: `/api/estado|acciones|paso|skill`, y `/api/ia/*`) y `gemini.ts` (cliente `generateContent` con salida JSON estructurada, clave en cabecera `x-goog-api-key`, reintenta 429/5xx hasta 2 veces).
- **Registro de decisiones** (interruptores «Registro Sheets» y «Registro Db», independientes): `src/ui/registroDecisiones.ts` genera los mensajes (filas, retorno a 3 ciclos y al final; `useRegistro`) y los envía a `/api/registro/<destino>`; en `servidor/`, `registro.ts` (validación y cola con reintentos, común), `sheets.ts` + `apps-script/registro.gs` (webhook que se pega en la hoja) y `postgres.ts` (esquema `TABLAS`, SQL parametrizado, `pg`). Config en `.env.local`: `SHEETS_WEBHOOK_URL`/`SHEETS_SECRET` y `BREWFACTORY_DATABASE_URL`/`BREWFACTORY_DB_PASSWORD`. Si se añade una columna, va en `COLUMNAS_DECISIONES` **y** en `TABLAS` (un test las compara). Detalle en `Docs/brevFactory.md` §9.5.
- `src/escenarios/` — escenarios enlatados en JSON. `Docs/skill-jugar-brewfactory.md` — instrucciones para cualquier IA (se envía a Gemini como *system instruction*, sin la parte de la API HTTP).

## Cosas que no son obvias

- **Foto del estado**: producción y OKR usan la configuración resultante de aplicar las acciones; la única excepción es el reparto secuencial entre líneas. Detalle en `Docs/brevFactory.md` §2.
- **Stock y muelles (solo interfaz)**: un pedido asignado a un muelle sale de la cola del stock; si no se expide, vuelve. El motor no cambia.
- **Errores de acciones de una IA**: se guardan en `Juego.erroresAcciones` y pasan a `erroresCicloAnterior` al resolver (si no, la IA nunca los vería).
- **API para agentes**: solo **una ventana** controla la API (las demás reciben 409 y muestran 🟠). Si tienes otra pestaña abierta en el mismo puerto, prueba en otro (`npx vite --port 5175`).
- **IA real**: sin tiempo de ciclo (el deslizador queda deshabilitado). Latencia típica 5–15 s por decisión; en la demo conviene «Limitar ciclos». La IA se equivoca a veces (p. ej. asignar pedidos ya terminados): se descartan y se avisa. El usuario ha dicho que no necesita mejorar su calidad, solo que se vea la dinámica.
- **Probar la IA sin clave real**: `GEMINI_BASE_URL` apunta a un servidor que imite `generateContent` (así se probó).
- **Balance actual**: Alta −6 %, demanda 1,3 pedidos/ciclo en oleadas, retrasos duros (−8/−16/−30 %). El bot «gestor» gana a «todo Estándar» por unos 19 puntos. Los tres se muestran con `calibrar`.

## PostgreSQL en Docker

- El contenedor de BrewFactory es `brewfactory-db` (postgres:16-alpine, `127.0.0.1:5433`, volumen `brewfactory-db-datos`). **En este equipo hay otras instancias de Docker de otra herramienta (`prodigy-db` en el 5432, `prodigy-backend`, `prodigy-qdrant`): no tocarlas.**
- La contraseña se generó al configurar este equipo y está solo en `.env.local` (ignorado por git). En un equipo nuevo hay que definirla antes de `npm run db:up` (ver README).
- El pool de `pg` emite `error` si la base se cae con conexiones inactivas: `postgres.ts` lo escucha; sin eso se cae todo el servidor de Vite.

## Entorno Windows (PowerShell 5.1)

- `Set-Content`/`Get-Content` sin `-Encoding` **rompen los emoji y caracteres fuera de cp1252**. Editar con la herramienta Edit/Write o escribir UTF-8 sin BOM con .NET.
- Los avisos «LF will be replaced by CRLF» de git son normales.
- El `.claude/launch.json` del repo permite `preview_start` con el nombre `brewfactory`, pero solo si la sesión de Claude se abrió en esta carpeta; si no, lanzar `npm run dev` en segundo plano.

## Estado y pendiente

Hecho: motor y reglas, interfaz completa (pestañas Fábrica/Resultados, informe «estado por ciclo», configuración ⚙, escenarios, emoji, chips de fase), bots, calibración, API para agentes, piloto IA con Gemini real (autónomo y paso a paso) probado con `gemini-3.6-flash`.

Ideas sin hacer: seguir ajustando el balance con ⚙ y `calibrar`; afinar el skill si Gemini juega demasiado mal para la demo; arrastre táctil (descartado por ahora).

## Convenciones de código

TypeScript estricto; nombres y comentarios en español; sin dependencias nuevas sin motivo; motor sin DOM ni efectos; toda cifra de juego va al `balance.json`, no al código; cada regla nueva lleva test con Vitest.
