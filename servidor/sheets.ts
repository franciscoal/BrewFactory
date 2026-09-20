/**
 * Registro de decisiones en Google Sheets a través de un webhook de Apps Script (ver servidor/apps-script/registro.gs).
 *
 * Reenvía los lotes al webhook añadiendo el secreto, que solo vive en el servidor (`.env.local`).
 * La cola, los reintentos y la validación son comunes a todos los destinos (servidor/registro.ts).
 */
import { crearCola } from './registro.ts';
import type { MensajeRegistro, Registro } from './registro.ts';

export interface OpcionesSheets {
  url: string;
  secreto: string;
  fetch?: typeof fetch;
  esperar?: (ms: number) => Promise<void>;
  /** Reintentos tras el primer intento. */
  reintentos?: number;
  timeoutMs?: number;
}

export function crearRegistroSheets(opciones: OpcionesSheets): Registro {
  const peticion = opciones.fetch ?? fetch;
  const timeoutMs = opciones.timeoutMs ?? 30_000;

  async function entregar(lote: MensajeRegistro[]): Promise<void> {
    const respuesta = await peticion(opciones.url, {
      method: 'POST',
      // Apps Script lee el cuerpo como texto; text/plain evita la comprobación previa (preflight) de CORS.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ secreto: opciones.secreto, mensajes: lote }),
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const texto = await respuesta.text();
    let datos: { ok?: boolean; error?: string };
    try {
      datos = JSON.parse(texto);
    } catch {
      throw new Error(
        `El webhook no devolvió JSON (HTTP ${respuesta.status}). Comprueba la URL del despliegue y que el acceso sea «Cualquier usuario».`,
      );
    }
    if (!respuesta.ok || datos.ok !== true) throw new Error(datos.error ?? `El webhook respondió con el error HTTP ${respuesta.status}.`);
  }

  return crearCola({ entregar, esperar: opciones.esperar, reintentos: opciones.reintentos });
}

/** Crea el registro a partir de las variables de entorno, o `null` si no está configurado (la aplicación arranca igualmente). */
export function registroSheetsDesdeEntorno(env: Record<string, string | undefined>): Registro | null {
  const url = env.SHEETS_WEBHOOK_URL?.trim();
  const secreto = env.SHEETS_SECRET?.trim();
  if (!url || !secreto) return null;
  return crearRegistroSheets({ url, secreto });
}
