import { BALANCE } from './balance';
import { siguienteAleatorio } from './rng';
import type { Estado } from './types';

function aleatorio(e: Estado): number {
  const [valor, rng] = siguienteAleatorio(e.rng);
  e.rng = rng;
  return valor;
}

/** Añade un pedido concreto a `e.pedidos` (muta `e`). */
export function agregarPedido(e: Estado, cantidad: number, ciclosEntrega: number): void {
  e.pedidos.push({
    id: `P-${e.siguienteId++}`,
    cantidad,
    producido: 0,
    ciclosEntregaIniciales: ciclosEntrega,
    contador: ciclosEntrega,
    terminado: false,
    terminadoEnCiclo: null,
  });
}

/** Añade un pedido aleatorio a `e.pedidos` (muta `e`). */
export function crearPedido(e: Estado): void {
  const d = BALANCE.demanda;
  const pasos = (d.cantidadMax - d.cantidadMin) / d.cantidadPaso + 1;
  const cantidad = d.cantidadMin + Math.floor(aleatorio(e) * pasos) * d.cantidadPaso;
  const ciclos = d.ciclosEntregaMin + Math.floor(aleatorio(e) * (d.ciclosEntregaMax - d.ciclosEntregaMin + 1));
  agregarPedido(e, cantidad, ciclos);
}

/** Factor de intensidad de la demanda en un ciclo: oscila alrededor de 1 según la oleada (la fase depende de la semilla). */
export function intensidadDemanda(semilla: number, ciclo: number): number {
  const d = BALANCE.demanda;
  if (d.oleadaPeriodo <= 0 || d.oleadaAmplitud <= 0) return 1;
  const fase = ((semilla % 628) / 100) % (2 * Math.PI);
  return 1 + d.oleadaAmplitud * Math.sin((2 * Math.PI * ciclo) / d.oleadaPeriodo + fase);
}

/** Genera la demanda aleatoria del ciclo `ciclo`: `pedidosPorCiclo` de media, modulado por la oleada. Muta `e`. */
export function generarDemandaCiclo(e: Estado, ciclo: number): void {
  const lambda = Math.max(0, BALANCE.demanda.pedidosPorCiclo * intensidadDemanda(e.semilla, ciclo));
  const entero = Math.floor(lambda);
  const n = entero + (aleatorio(e) < lambda - entero ? 1 : 0);
  for (let i = 0; i < n; i++) crearPedido(e);
}

/**
 * Demanda que llega al resolver el ciclo `ciclo`. Sin escenario es aleatoria; con escenario
 * sigue su guion y, si `aleatoriaTrasGuion`, continúa aleatoria una vez agotado. Muta `e`.
 */
export function generarDemanda(e: Estado, ciclo: number): void {
  const esc = e.escenario;
  if (!esc) return generarDemandaCiclo(e, ciclo);
  for (const llegada of esc.llegadas.filter((l) => l.ciclo === ciclo)) {
    for (const p of llegada.pedidos) agregarPedido(e, p.cantidad, p.ciclosEntrega);
  }
  const ultimo = Math.max(0, ...esc.llegadas.map((l) => l.ciclo));
  if (esc.aleatoriaTrasGuion && ciclo > ultimo) generarDemandaCiclo(e, ciclo);
}
