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

/** Genera la demanda aleatoria de un ciclo (0, 1 o 2 pedidos). Muta `e`. */
export function generarDemandaCiclo(e: Estado): void {
  const d = BALANCE.demanda;
  const r = aleatorio(e);
  const n = r < d.probNinguno ? 0 : r < d.probNinguno + d.probUno ? 1 : 2;
  for (let i = 0; i < n; i++) crearPedido(e);
}

/**
 * Demanda que llega al resolver el ciclo `ciclo`. Sin escenario es aleatoria; con escenario
 * sigue su guion y, si `aleatoriaTrasGuion`, continúa aleatoria una vez agotado. Muta `e`.
 */
export function generarDemanda(e: Estado, ciclo: number): void {
  const esc = e.escenario;
  if (!esc) return generarDemandaCiclo(e);
  for (const llegada of esc.llegadas.filter((l) => l.ciclo === ciclo)) {
    for (const p of llegada.pedidos) agregarPedido(e, p.cantidad, p.ciclosEntrega);
  }
  const ultimo = Math.max(0, ...esc.llegadas.map((l) => l.ciclo));
  if (esc.aleatoriaTrasGuion && ciclo > ultimo) generarDemandaCiclo(e);
}
