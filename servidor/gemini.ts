import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Cliente mínimo de Gemini (API `generateContent` con salida JSON estructurada).
 * Se usa solo desde el servidor local: la clave nunca llega al navegador.
 */

export interface ConfigGemini {
  clave: string;
  modelo: string;
  /** Solo para pruebas o proxies. Por defecto, la API pública de Google. */
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
  /** Espera entre reintentos (solo para pruebas). */
  esperar?: (ms: number) => Promise<void>;
}

export interface DecisionIA {
  /** Objeto JSON de acciones tal como lo devolvió el modelo. */
  acciones: Record<string, unknown>;
  comentario?: string;
  /** Texto exacto que devolvió el modelo. */
  respuestaCruda: string;
  modelo: string;
  latenciaMs: number;
  /** Peticiones hechas a Gemini: más de 1 si hubo que repetir por un error pasajero o una respuesta no válida. */
  intentos: number;
  uso?: unknown;
}

export class ErrorGemini extends Error {
  constructor(
    mensaje: string,
    /** Código HTTP de Google (0 si no hubo respuesta). */
    readonly estado: number,
  ) {
    super(mensaje);
  }
}

export interface Gemini {
  modelo: string;
  decidir(estado: unknown, sistema: string): Promise<DecisionIA>;
}

/** Esquema de la respuesta: la configuración completa de las líneas y los muelles. */
export const ESQUEMA_ACCIONES = {
  type: 'OBJECT',
  properties: {
    comentario: { type: 'STRING', description: 'Razonamiento breve (una o dos frases).' },
    lineas: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          id: { type: 'INTEGER' },
          encendida: { type: 'BOOLEAN' },
          velocidad: { type: 'STRING', enum: ['baja', 'estandar', 'alta'] },
          actual: { type: 'STRING', nullable: true },
          siguiente: { type: 'STRING', nullable: true },
        },
        required: ['id', 'encendida', 'velocidad', 'actual', 'siguiente'],
      },
    },
    muelles: { type: 'ARRAY', items: { type: 'STRING', nullable: true } },
  },
  required: ['comentario', 'lineas', 'muelles'],
} as const;

/** Instrucciones de sistema: el skill (sin cabecera ni la parte de la API HTTP, que no aplica aquí). */
export function prepararSistema(skillMd: string): string {
  const sinCabecera = skillMd.replace(/^---[\s\S]*?---\s*/, '');
  const fin = sinCabecera.indexOf('## Si juegas por la API HTTP');
  const cuerpo = fin >= 0 ? sinCabecera.slice(0, fin) : sinCabecera;
  return [
    'Estás jugando a BrewFactory. En cada mensaje recibirás el estado de la fábrica en JSON.',
    'Responde ÚNICAMENTE con el objeto JSON de acciones (comentario, lineas y muelles). No añadas texto ni bloques de código.',
    '',
    cuerpo.trim(),
  ].join('\n');
}

export function leerSkill(ruta = resolve('Docs/skill-jugar-brewfactory.md')): string {
  return prepararSistema(readFileSync(ruta, 'utf8'));
}

interface RespuestaGemini {
  candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: unknown;
  error?: { message?: string };
}

const ESTADOS_TRANSITORIOS = new Set([429, 500, 502, 503, 504]);
const REINTENTOS_TRANSITORIOS = 2;
const ESPERA_BASE_MS = 2000;

export function crearGemini(cfg: ConfigGemini): Gemini {
  const llamar = cfg.fetch ?? fetch;
  const esperar = cfg.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const base = (cfg.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
  const timeoutMs = cfg.timeoutMs ?? 90_000;

  async function pedir(estado: unknown, sistema: string, aviso?: string): Promise<{ texto: string; uso?: unknown }> {
    const partes = [{ text: `Estado actual de la partida (JSON):\n${JSON.stringify(estado)}` }];
    if (aviso) partes.push({ text: aviso });
    const cuerpo = {
      systemInstruction: { parts: [{ text: sistema }] },
      contents: [{ role: 'user', parts: partes }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: ESQUEMA_ACCIONES, temperature: 0.3 },
    };
    const control = new AbortController();
    const temporizador = setTimeout(() => control.abort(), timeoutMs);
    let respuesta: Response;
    try {
      respuesta = await llamar(`${base}/v1beta/models/${encodeURIComponent(cfg.modelo)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.clave },
        body: JSON.stringify(cuerpo),
        signal: control.signal,
      });
    } catch (err) {
      const abortada = (err as Error).name === 'AbortError';
      throw new ErrorGemini(abortada ? `Gemini no respondió en ${Math.round(timeoutMs / 1000)} s.` : `No se pudo contactar con Gemini: ${(err as Error).message}`, 0);
    } finally {
      clearTimeout(temporizador);
    }

    const datos = (await respuesta.json().catch(() => ({}))) as RespuestaGemini;
    if (!respuesta.ok) {
      const detalle = datos.error?.message ?? `HTTP ${respuesta.status}`;
      const pista =
        respuesta.status === 404
          ? ` Comprueba el modelo «${cfg.modelo}» (variable GEMINI_MODEL).`
          : respuesta.status === 400 || respuesta.status === 403
            ? ' Comprueba la clave (GEMINI_API_KEY).'
            : respuesta.status === 429
              ? ' Se ha superado el límite de peticiones: espera un poco o revisa tu cuota.'
              : '';
      throw new ErrorGemini(`Gemini respondió con un error (${respuesta.status}): ${detalle}.${pista}`, respuesta.status);
    }
    if (datos.promptFeedback?.blockReason) throw new ErrorGemini(`Gemini bloqueó la petición (${datos.promptFeedback.blockReason}).`, 200);
    const texto = (datos.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
    if (texto.trim() === '') {
      throw new ErrorGemini(`Gemini no devolvió texto (finishReason: ${datos.candidates?.[0]?.finishReason ?? 'desconocido'}).`, 200);
    }
    return { texto, uso: datos.usageMetadata };
  }

  return {
    modelo: cfg.modelo,
    async decidir(estado, sistema) {
      const inicio = Date.now();
      let aviso: string | undefined;
      let intentos = 0;
      let transitorios = 0;
      let malformadas = 0;
      for (;;) {
        intentos++;
        let respuesta: { texto: string; uso?: unknown };
        try {
          respuesta = await pedir(estado, sistema, aviso);
        } catch (err) {
          // «Alta demanda», límite momentáneo o error del servidor de Google: se reintenta con espera creciente.
          if (err instanceof ErrorGemini && ESTADOS_TRANSITORIOS.has(err.estado) && transitorios < REINTENTOS_TRANSITORIOS) {
            transitorios++;
            await esperar(ESPERA_BASE_MS * transitorios);
            continue;
          }
          throw err;
        }
        try {
          const acciones = JSON.parse(respuesta.texto) as Record<string, unknown>;
          if (acciones === null || typeof acciones !== 'object' || !Array.isArray(acciones.lineas)) throw new Error('falta la lista "lineas"');
          return {
            acciones,
            comentario: typeof acciones.comentario === 'string' ? acciones.comentario : undefined,
            respuestaCruda: respuesta.texto,
            modelo: cfg.modelo,
            latenciaMs: Date.now() - inicio,
            intentos,
            uso: respuesta.uso,
          };
        } catch (err) {
          if (++malformadas >= 2) throw new ErrorGemini(`La respuesta de Gemini no es un JSON de acciones válido: ${(err as Error).message}.`, 200);
          aviso = `Tu respuesta anterior no era válida (${(err as Error).message}). Responde solo con el JSON pedido.`;
        }
      }
    },
  };
}

export const MODELO_POR_DEFECTO = 'gemini-3.6-flash';

/** Crea el cliente a partir de las variables de entorno, o `null` si no hay clave (la aplicación arranca igualmente). */
export function geminiDesdeEntorno(env: Record<string, string | undefined>): Gemini | null {
  const clave = env.GEMINI_API_KEY?.trim();
  if (!clave) return null;
  return crearGemini({ clave, modelo: env.GEMINI_MODEL?.trim() || MODELO_POR_DEFECTO, baseUrl: env.GEMINI_BASE_URL?.trim() || undefined });
}
