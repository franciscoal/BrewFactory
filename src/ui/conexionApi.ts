import { useEffect, useRef, useState } from 'preact/hooks';
import { estadoParaIA, parsearAcciones } from '../engine';
import { aplicarAccionesIA, paso } from './juego';
import type { Cambios, Juego } from './juego';

/** Orden que un agente externo ha enviado por la API y que la interfaz debe ejecutar. */
export interface Pendiente {
  id: number;
  tipo: 'acciones' | 'paso';
  texto?: string;
}

/** Lo que la interfaz contesta al servidor (y este, al agente). Ver servidor/api.ts. */
export interface ResultadoOrden {
  id: number;
  ok: boolean;
  error?: string;
  errores?: string[];
  ciclo?: number;
  comentario?: string;
  estado?: unknown;
}

export interface Procesado {
  juego: Juego;
  resultado: ResultadoOrden;
  cambios?: Cambios;
}

/** Ejecuta una orden de la API sobre la partida. Pura: devuelve la partida nueva y la respuesta. */
export function procesarPendiente(j: Juego, p: Pendiente): Procesado {
  const fallo = (error: string): Procesado => ({ juego: j, resultado: { id: p.id, ok: false, error } });
  if (j.fase === 'terminado') return fallo('La partida ha terminado.');

  if (p.tipo === 'paso') {
    if (j.fase === 'jugando') return fallo('La partida está en marcha: pulsa Pause en la interfaz para poder avanzar a pasos.');
    const nuevo = paso(j);
    return { juego: nuevo, resultado: { id: p.id, ok: true, ciclo: nuevo.estado.ciclo, estado: estadoParaIA(nuevo.estado, nuevo.errores) } };
  }

  const r = parsearAcciones(p.texto ?? '', j.estado);
  if ('error' in r) return fallo(r.error);
  const res = aplicarAccionesIA(j, r.acciones);
  return {
    juego: res.juego,
    cambios: res.cambios,
    resultado: { id: p.id, ok: true, ciclo: j.estado.ciclo, errores: res.errores, comentario: r.acciones.comentario },
  };
}

/** `ocupada`: hay otra ventana abierta que controla la API; esta espera a que se libere. */
export type EstadoApi = 'buscando' | 'conectada' | 'ocupada' | 'no-disponible';

/** Identifica esta pestaña ante el servidor: solo una controla la API a la vez. */
const CLIENTE = Math.random().toString(36).slice(2) + Date.now().toString(36);

const enviar = (ruta: string, cuerpo: unknown) =>
  fetch(`/api/interno/${ruta}?c=${CLIENTE}`, { method: 'POST', body: JSON.stringify(cuerpo) });

/**
 * Conecta la partida con la API HTTP local (servidor/api.ts): publica el estado para la IA y ejecuta las órdenes que lleguen.
 * Si el servidor no expone la API (por ejemplo, alojamiento estático) se desactiva sola.
 */
export function useConexionApi(activa: boolean, j: Juego, setJ: (j: Juego) => void, resaltar: (c: Cambios) => void): EstadoApi {
  const [estadoApi, setEstadoApi] = useState<EstadoApi>('buscando');
  const actual = useRef(j);
  actual.current = j;

  useEffect(() => {
    if (activa) setEstadoApi('buscando');
  }, [activa]);

  // Publica el estado que verá la IA cada vez que cambia (o al pasar a controlar la API).
  useEffect(() => {
    if (!activa || estadoApi === 'no-disponible' || estadoApi === 'ocupada') return;
    enviar('publicar', estadoParaIA(j.estado, j.errores)).catch(() => undefined);
  }, [activa, estadoApi, j.estado, j.errores]);

  // Recoge y ejecuta las órdenes pendientes.
  useEffect(() => {
    if (!activa || estadoApi === 'no-disponible') return;
    let cancelado = false;
    let ocupado = false;
    let fallos = 0;
    const id = setInterval(async () => {
      if (ocupado) return;
      ocupado = true;
      try {
        const respuesta = await fetch(`/api/interno/pendientes?c=${CLIENTE}`);
        if (respuesta.status === 409) {
          fallos = 0;
          if (!cancelado) setEstadoApi('ocupada');
          return;
        }
        if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
        const lista = (await respuesta.json()) as Pendiente[];
        if (!Array.isArray(lista)) throw new Error('Respuesta inesperada');
        fallos = 0;
        if (!cancelado) setEstadoApi('conectada');
        for (const p of lista) {
          const salida = procesarPendiente(actual.current, p);
          actual.current = salida.juego;
          setJ(salida.juego);
          if (salida.cambios) resaltar(salida.cambios);
          await enviar('resultado', salida.resultado);
        }
      } catch {
        fallos += 1;
        if (fallos >= 3 && !cancelado) setEstadoApi('no-disponible');
      } finally {
        ocupado = false;
      }
    }, 700);
    return () => {
      cancelado = true;
      clearInterval(id);
    };
  }, [activa, estadoApi === 'no-disponible']);

  return estadoApi;
}
