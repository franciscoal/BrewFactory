import { BALANCE } from './balance';
import type { Estado, Linea, Pedido } from './types';

/** Línea activa = encendida y con pedido actual. */
export const lineaActiva = (l: Linea): boolean => l.encendida && l.actual !== null;

export const lineasActivas = (e: Estado): number => e.lineas.filter(lineaActiva).length;

/** Muelle 1 siempre activo; muelle 2 con 3 o más líneas activas. */
export const muelleActivo = (e: Estado, indice: number): boolean =>
  indice === 0 || lineasActivas(e) >= BALANCE.muelle2MinLineasActivas;

/** Pedidos que son el pedido actual de alguna línea activa. */
export const pedidosEnProduccion = (e: Estado): Set<string> =>
  new Set(e.lineas.filter(lineaActiva).map((l) => l.actual as string));

/** Cola de demanda: pedidos no terminados. */
export function colaDemanda(e: Estado, orden: 'generacion' | 'vencimiento' = 'generacion'): Pedido[] {
  const cola = e.pedidos.filter((p) => !p.terminado);
  return orden === 'vencimiento' ? [...cola].sort((a, b) => a.contador - b.contador) : cola;
}

/** Stock de expediciones: terminados por orden de finalización, luego los incompletos con producción. */
export function stockExpediciones(e: Estado): Pedido[] {
  const terminados = e.pedidos
    .filter((p) => p.terminado)
    .sort((a, b) => (a.terminadoEnCiclo ?? 0) - (b.terminadoEnCiclo ?? 0));
  const enCurso = e.pedidos.filter((p) => !p.terminado && p.producido > 0);
  return [...terminados, ...enCurso];
}
