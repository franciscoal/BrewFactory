import { estadoInicial, step } from '../engine';
import type { Escenario, Okr } from '../engine';
import type { Estrategia } from './estrategias';

export interface ResultadoPartida {
  ciclos: number;
  mediaRentabilidad: number;
  okrFinal: Okr;
  /** Pedidos aún pendientes de entregar al terminar. */
  pedidosAbiertos: number;
}

/** Juega una partida completa con una estrategia. Determinista para una semilla o escenario. */
export function jugar(estrategia: Estrategia, opciones: { ciclos: number; semilla?: number; escenario?: Escenario | null }): ResultadoPartida {
  let e = estadoInicial(opciones.semilla ?? 1, opciones.escenario ?? null);
  for (let i = 0; i < opciones.ciclos; i++) e = step(e, estrategia(e)).estado;
  const media = e.historial.reduce((s, h) => s + h.okr.rentabilidad, 0) / Math.max(1, e.historial.length);
  return { ciclos: e.ciclo, mediaRentabilidad: media, okrFinal: e.okr, pedidosAbiertos: e.pedidos.length };
}

export interface Resumen {
  partidas: number;
  rentabilidadMedia: number;
  rentabilidadMin: number;
  rentabilidadMax: number;
  cumplimiento: number;
  productividad: number;
  entrega: number;
  pedidosAbiertos: number;
}

export function resumir(resultados: ResultadoPartida[]): Resumen {
  const media = (f: (r: ResultadoPartida) => number) => resultados.reduce((s, r) => s + f(r), 0) / resultados.length;
  const rent = resultados.map((r) => r.mediaRentabilidad);
  return {
    partidas: resultados.length,
    rentabilidadMedia: media((r) => r.mediaRentabilidad),
    rentabilidadMin: Math.min(...rent),
    rentabilidadMax: Math.max(...rent),
    cumplimiento: media((r) => r.okrFinal.cumplimiento),
    productividad: media((r) => r.okrFinal.productividad),
    entrega: media((r) => r.okrFinal.entrega),
    pedidosAbiertos: media((r) => r.pedidosAbiertos),
  };
}
