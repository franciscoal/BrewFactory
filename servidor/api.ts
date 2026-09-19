import { readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { ErrorGemini, leerSkill } from './gemini.ts';
import type { Gemini } from './gemini.ts';

/**
 * API HTTP local para que una IA (o cualquier programa) juegue a BrewFactory.
 *
 * El estado de la partida vive en el navegador. Este módulo hace de buzón entre la interfaz y el agente:
 * la interfaz publica su estado y recoge las órdenes pendientes; el agente lee el estado y envía acciones o pasos,
 * y la petición espera a que la interfaz responda. Solo existe con `npm run dev` o `npm run preview`.
 *
 * Para el agente (montada en /api):
 *   GET  /api/estado    → estado de la partida para la IA (JSON)
 *   POST /api/acciones  → cuerpo: JSON de acciones; responde con las acciones descartadas
 *   POST /api/paso      → resuelve un ciclo; responde con el estado nuevo
 *   GET  /api/skill     → instrucciones para que la IA sepa jugar (Markdown)
 * Internas (solo la interfaz, con `?c=<id de la pestaña>`): POST /api/interno/publicar, GET /api/interno/pendientes,
 * POST /api/interno/resultado. Si hay varias pestañas abiertas, solo una controla la API (las demás reciben 409).
 */

export interface Pendiente {
  id: number;
  tipo: 'acciones' | 'paso';
  /** Texto JSON de las acciones (solo `tipo: 'acciones'`). */
  texto?: string;
}

export interface ResultadoInterfaz {
  id: number;
  ok: boolean;
  error?: string;
  /** Acciones descartadas por no estar permitidas. */
  errores?: string[];
  ciclo?: number;
  comentario?: string;
  /** Estado nuevo (tras un paso). */
  estado?: unknown;
  /** La interfaz no contestó a tiempo (lo rellena el servidor). */
  expirado?: boolean;
}

export interface OpcionesApi {
  /** Cliente de la IA (Gemini). Sin él, `/api/ia/*` responde que no está configurada. */
  ia?: Gemini | null;
  /** Instrucciones de sistema para la IA. Por defecto, el skill. */
  sistemaIA?: () => string;
  /** Tiempo máximo que espera una petición del agente a que la interfaz responda. */
  esperaMs?: number;
  /** Tiempo sin señales tras el cual se considera desconectada la interfaz. */
  conexionMs?: number;
  rutaSkill?: string;
}

const LIMITE_CUERPO = 1_000_000;

export function crearApi(opciones: OpcionesApi = {}) {
  const esperaMs = opciones.esperaMs ?? 8000;
  const conexionMs = opciones.conexionMs ?? 4000;
  const rutaSkill = opciones.rutaSkill ?? resolve('Docs/skill-jugar-brewfactory.md');
  const ia = opciones.ia ?? null;
  const sistemaIA = opciones.sistemaIA ?? (() => leerSkill(rutaSkill));

  let estado: unknown = null;
  let vistoEn = 0;
  /** Interfaz (pestaña) que controla la API. Si hay varias abiertas, solo la primera; las demás esperan. */
  let propietario: string | null = null;
  let siguienteId = 1;
  const cola: Pendiente[] = [];
  const esperas = new Map<number, { resolver: (r: ResultadoInterfaz) => void; temporizador: ReturnType<typeof setTimeout> }>();

  const conectada = () => propietario !== null && Date.now() - vistoEn < conexionMs;

  /** Una interfaz reclama la API. Solo lo consigue si está libre, caducó la anterior o ya era suya. */
  const adquirir = (cliente: string): boolean => {
    if (propietario === null || propietario === cliente || Date.now() - vistoEn >= conexionMs) {
      if (propietario !== cliente) estado = null;
      propietario = cliente;
      vistoEn = Date.now();
      return true;
    }
    return false;
  };

  const responder = (res: ServerResponse, codigo: number, cuerpo: unknown, tipo = 'application/json; charset=utf-8') => {
    res.statusCode = codigo;
    res.setHeader('Content-Type', tipo);
    res.end(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
  };

  const leerCuerpo = (req: IncomingMessage): Promise<string> =>
    new Promise((ok, fallo) => {
      let texto = '';
      req.on('data', (trozo) => {
        texto += trozo;
        if (texto.length > LIMITE_CUERPO) {
          fallo(new Error('Cuerpo demasiado grande'));
          req.destroy();
        }
      });
      req.on('end', () => ok(texto));
      req.on('error', fallo);
    });

  const encolar = (pendiente: Omit<Pendiente, 'id'>): Promise<ResultadoInterfaz> =>
    new Promise((resolver) => {
      const id = siguienteId++;
      const temporizador = setTimeout(() => {
        esperas.delete(id);
        const i = cola.findIndex((c) => c.id === id);
        if (i >= 0) cola.splice(i, 1);
        resolver({ id, ok: false, error: 'La interfaz no respondió a tiempo.', expirado: true });
      }, esperaMs);
      esperas.set(id, { resolver, temporizador });
      cola.push({ ...pendiente, id });
    });

  const sinInterfaz = (res: ServerResponse) =>
    responder(res, 503, { error: 'La interfaz no está conectada. Abre la aplicación en el navegador y activa «Conexión API».' });

  /** Respuesta a una orden del agente a partir de lo que devuelve la interfaz. */
  const finalizar = (res: ServerResponse, r: ResultadoInterfaz) => {
    if (r.expirado) return responder(res, 504, { error: r.error });
    if (!r.ok) return responder(res, 400, { error: r.error });
    responder(res, 200, { ok: true, ciclo: r.ciclo, descartadas: r.errores ?? [], comentario: r.comentario, estado: r.estado });
  };

  async function manejador(req: IncomingMessage, res: ServerResponse, siguiente?: () => void): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') return responder(res, 204, '');

    const url = new URL(req.url ?? '/', 'http://local');
    const ruta = (url.pathname.replace(/\/+$/, '') || '/').toLowerCase();
    const cliente = url.searchParams.get('c') ?? 'anonimo';
    const metodo = req.method ?? 'GET';
    const ocupada = (r: ServerResponse) => responder(r, 409, { ocupada: true, error: 'Otra ventana controla la API.' });
    try {
      if (metodo === 'GET' && ruta === '/estado') {
        if (!conectada()) return sinInterfaz(res);
        if (estado === null) return responder(res, 503, { error: 'La interfaz aún no ha publicado el estado.' });
        return responder(res, 200, estado);
      }
      if (metodo === 'POST' && ruta === '/acciones') {
        if (!conectada()) return sinInterfaz(res);
        const texto = await leerCuerpo(req);
        if (texto.trim() === '') return responder(res, 400, { error: 'El cuerpo está vacío: envía el JSON de acciones.' });
        return finalizar(res, await encolar({ tipo: 'acciones', texto }));
      }
      if (metodo === 'POST' && ruta === '/paso') {
        if (!conectada()) return sinInterfaz(res);
        return finalizar(res, await encolar({ tipo: 'paso' }));
      }
      if (metodo === 'GET' && ruta === '/skill') {
        try {
          return responder(res, 200, readFileSync(rutaSkill, 'utf8'), 'text/markdown; charset=utf-8');
        } catch {
          return responder(res, 404, { error: 'No se encuentra el fichero del skill.' });
        }
      }

      // ── IA (Gemini): la interfaz pide una decisión con el estado ─────────
      if (metodo === 'GET' && ruta === '/ia/estado') {
        return responder(res, 200, { disponible: ia !== null, modelo: ia?.modelo ?? null });
      }
      if (metodo === 'POST' && ruta === '/ia/decidir') {
        if (!ia) {
          return responder(res, 503, {
            error: 'La IA no está configurada: crea el fichero .env.local con GEMINI_API_KEY=tu_clave y reinicia el servidor.',
          });
        }
        const estadoPartida = JSON.parse(await leerCuerpo(req));
        try {
          return responder(res, 200, { ok: true, ...(await ia.decidir(estadoPartida, sistemaIA())) });
        } catch (err) {
          if (err instanceof ErrorGemini) return responder(res, err.estado === 0 ? 504 : 502, { error: err.message, estadoGemini: err.estado });
          throw err;
        }
      }

      // ── Internas: solo la interfaz ────────────────────────────────────────
      if (metodo === 'POST' && ruta === '/interno/publicar') {
        if (!adquirir(cliente)) return ocupada(res);
        estado = JSON.parse(await leerCuerpo(req));
        return responder(res, 200, { ok: true });
      }
      if (metodo === 'GET' && ruta === '/interno/pendientes') {
        if (!adquirir(cliente)) return ocupada(res);
        return responder(res, 200, cola.splice(0));
      }
      if (metodo === 'POST' && ruta === '/interno/resultado') {
        if (!adquirir(cliente)) return ocupada(res);
        const r = JSON.parse(await leerCuerpo(req)) as ResultadoInterfaz;
        const espera = esperas.get(r.id);
        if (espera) {
          clearTimeout(espera.temporizador);
          esperas.delete(r.id);
          espera.resolver(r);
        }
        return responder(res, 200, { ok: true });
      }

      if (siguiente) return siguiente();
      return responder(res, 404, { error: `No existe ${metodo} /api${ruta}.` });
    } catch (err) {
      return responder(res, 400, { error: (err as Error).message });
    }
  }

  return {
    manejador,
    /** Cancela las esperas pendientes (para cerrar limpiamente en los tests). */
    cerrar(): void {
      for (const { temporizador } of esperas.values()) clearTimeout(temporizador);
      esperas.clear();
    },
  };
}
