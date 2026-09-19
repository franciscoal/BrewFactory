import type { EstadoIA } from '../engine';

/** Lo que devuelve nuestra API local (`POST /api/ia/decidir`) tras consultar al modelo. */
export interface RespuestaIA {
  ok: true;
  /** JSON de acciones tal como lo devolvió el modelo. */
  acciones: Record<string, unknown>;
  comentario?: string;
  /** Texto exacto del modelo, antes de interpretarlo. */
  respuestaCruda: string;
  modelo: string;
  latenciaMs: number;
  /** 2 si el servidor tuvo que repetir la petición por una respuesta no válida. */
  intentos: number;
  uso?: unknown;
}

/** Pide una decisión a la IA con el estado de la partida. Lanza un error con un mensaje legible si falla. */
export async function pedirDecision(estado: EstadoIA): Promise<RespuestaIA> {
  let respuesta: Response;
  try {
    respuesta = await fetch('/api/ia/decidir', { method: 'POST', body: JSON.stringify(estado) });
  } catch {
    throw new Error('No se pudo contactar con el servidor local. La IA solo funciona con npm run dev o npm run preview.');
  }
  const datos = (await respuesta.json().catch(() => ({}))) as { error?: string };
  if (!respuesta.ok) throw new Error(datos.error ?? `La API respondió con el error HTTP ${respuesta.status}.`);
  return datos as RespuestaIA;
}

export interface DisponibilidadIA {
  disponible: boolean;
  modelo: string | null;
}

/** ¿Tiene el servidor la clave de la IA configurada? */
export async function consultarIA(): Promise<DisponibilidadIA> {
  try {
    const respuesta = await fetch('/api/ia/estado');
    const datos = (await respuesta.json()) as DisponibilidadIA;
    return typeof datos.disponible === 'boolean' ? datos : { disponible: false, modelo: null };
  } catch {
    return { disponible: false, modelo: null };
  }
}
