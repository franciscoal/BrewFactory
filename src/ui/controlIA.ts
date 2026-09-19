import { estadoParaIA, parsearAcciones } from '../engine';
import type { Acciones, EstadoIA } from '../engine';
import type { RespuestaIA } from './ia';
import { aplicarAccionesIA, pausar, resolver } from './juego';
import type { Cambios, Juego } from './juego';

/** Decisión propuesta por la IA para un ciclo. */
export interface PropuestaIA {
  /** Ciclo (ya resuelto) sobre cuyo estado decidió la IA. */
  ciclo: number;
  acciones: Acciones;
  respuesta: RespuestaIA;
  /** Ya volcada en la interfaz. */
  aplicada: boolean;
}

export interface SolicitudIA {
  pensando: boolean;
  propuesta: PropuestaIA | null;
  error: string | null;
}

export const SOLICITUD_INICIAL: SolicitudIA = { pensando: false, propuesta: null, error: null };

/** Pausa tras aplicar la decisión, para que se vea lo que ha hecho la IA antes de resolver el ciclo. */
export const PAUSA_VER_DECISION_MS = 1500;

export interface EntornoIA {
  leer(): Juego;
  escribir(j: Juego): void;
  resaltar(c: Cambios): void;
  pedir(estado: EstadoIA): Promise<RespuestaIA>;
  publicar(solicitud: SolicitudIA): void;
}

/** Qué hará la próxima pulsación de ⏭ en el modo «paso a paso». */
export function etiquetaPaso(s: SolicitudIA, j: Juego): string {
  if (s.pensando) return 'La IA está pensando…';
  const p = s.propuesta;
  if (!p || p.ciclo !== j.estado.ciclo) return 'Pedir una decisión a la IA';
  if (!p.aplicada) return 'Aplicar la decisión de la IA';
  return 'Resolver el ciclo y pedir la siguiente decisión';
}

/**
 * Lleva la conversación con la IA: pide una decisión, la aplica a la interfaz y resuelve el ciclo.
 * Sin dependencias de React, para poder probarlo con un entorno falso.
 */
export class ControlIA {
  solicitud: SolicitudIA = SOLICITUD_INICIAL;
  /** Sube cada vez que se cancela o se inicia una petición; las respuestas de generaciones antiguas se descartan. */
  private generacion = 0;

  constructor(private readonly entorno: EntornoIA) {}

  private fijar(s: SolicitudIA): void {
    this.solicitud = s;
    this.entorno.publicar(s);
  }

  /** Olvida cualquier propuesta (nueva partida o cambio de piloto). */
  reiniciar(): void {
    this.generacion++;
    this.fijar(SOLICITUD_INICIAL);
  }

  /** Descarta la petición en curso (pausa, stop o cambio de modo). */
  cancelar(): void {
    this.generacion++;
    if (this.solicitud.pensando) this.fijar({ ...this.solicitud, pensando: false });
  }

  /** Pide una decisión con el estado actual. Devuelve la propuesta, o `null` si falló o se canceló. */
  async pedir(): Promise<PropuestaIA | null> {
    const j = this.entorno.leer();
    const mia = ++this.generacion;
    this.fijar({ ...this.solicitud, pensando: true, error: null });
    try {
      const respuesta = await this.entorno.pedir(estadoParaIA(j.estado, j.errores));
      if (mia !== this.generacion) return null;
      const r = parsearAcciones(JSON.stringify(respuesta.acciones), j.estado);
      if ('error' in r) throw new Error(`La respuesta de la IA no se puede usar: ${r.error}`);
      const acciones: Acciones = { ...r.acciones, comentario: respuesta.comentario ?? r.acciones.comentario };
      const propuesta: PropuestaIA = { ciclo: j.estado.ciclo, acciones, respuesta, aplicada: false };
      this.fijar({ pensando: false, propuesta, error: null });
      return propuesta;
    } catch (err) {
      if (mia !== this.generacion) return null;
      this.fijar({ pensando: false, propuesta: this.solicitud.propuesta, error: (err as Error).message });
      return null;
    }
  }

  /** Vuelca la propuesta pendiente en la interfaz (como plan del ciclo). No resuelve el ciclo. */
  aplicar(): void {
    const p = this.solicitud.propuesta;
    if (!p || p.aplicada) return;
    const res = aplicarAccionesIA(this.entorno.leer(), p.acciones);
    this.entorno.escribir(res.juego);
    this.entorno.resaltar(res.cambios);
    this.fijar({ ...this.solicitud, propuesta: { ...p, aplicada: true } });
  }

  /**
   * Modo «paso a paso»: cada pulsación hace lo siguiente que toque.
   * Pedir a la IA → aplicar su decisión → resolver el ciclo y pedir la siguiente.
   */
  async avanzar(): Promise<void> {
    const s = this.solicitud;
    const j = this.entorno.leer();
    if (s.pensando || j.fase === 'terminado') return;
    const p = s.propuesta;
    if (!p || p.ciclo !== j.estado.ciclo) {
      await this.pedir();
      return;
    }
    if (!p.aplicada) {
      this.aplicar();
      return;
    }
    const nuevo = resolver(this.entorno.leer());
    this.entorno.escribir(nuevo);
    if (nuevo.fase !== 'terminado') await this.pedir();
  }

  /**
   * Modo «autónomo»: la IA juega sola mientras la partida esté en marcha, sin tiempo de ciclo.
   * Se detiene si se cancela, si termina la partida o si la IA falla (entonces deja la partida en pausa).
   */
  async autonomo(esperar: (ms: number) => Promise<void>, cancelado: () => boolean, pausaMs = PAUSA_VER_DECISION_MS): Promise<void> {
    while (!cancelado()) {
      if (this.entorno.leer().fase !== 'jugando') return;
      let p = this.solicitud.propuesta;
      if (!p || p.ciclo !== this.entorno.leer().estado.ciclo) {
        p = await this.pedir();
        if (cancelado()) return;
        if (!p) {
          this.entorno.escribir(pausar(this.entorno.leer()));
          return;
        }
      }
      this.aplicar();
      await esperar(pausaMs);
      if (cancelado()) return;
      const nuevo = resolver(this.entorno.leer());
      this.entorno.escribir(nuevo);
      if (nuevo.fase === 'terminado') return;
      await esperar(250);
    }
  }
}
