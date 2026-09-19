import { BALANCE } from './balance';
import { siguienteAleatorio } from './rng';
import type { Estado } from './types';

function aleatorio(e: Estado): number {
  const [valor, rng] = siguienteAleatorio(e.rng);
  e.rng = rng;
  return valor;
}

/** Añade un pedido aleatorio a `e.pedidos` (muta `e`). */
export function crearPedido(e: Estado): void {
  const d = BALANCE.demanda;
  const pasos = (d.cantidadMax - d.cantidadMin) / d.cantidadPaso + 1;
  const cantidad = d.cantidadMin + Math.floor(aleatorio(e) * pasos) * d.cantidadPaso;
  const ciclos = d.ciclosEntregaMin + Math.floor(aleatorio(e) * (d.ciclosEntregaMax - d.ciclosEntregaMin + 1));
  e.pedidos.push({
    id: `P-${e.siguienteId++}`,
    cantidad,
    producido: 0,
    ciclosEntregaIniciales: ciclos,
    contador: ciclos,
    terminado: false,
    terminadoEnCiclo: null,
  });
}

/** Genera la demanda nueva de un ciclo (0, 1 o 2 pedidos). Muta `e`. */
export function generarDemandaCiclo(e: Estado): void {
  const d = BALANCE.demanda;
  const r = aleatorio(e);
  const n = r < d.probNinguno ? 0 : r < d.probNinguno + d.probUno ? 1 : 2;
  for (let i = 0; i < n; i++) crearPedido(e);
}
