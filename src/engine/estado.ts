import { BALANCE } from './balance';
import { agregarPedido, crearPedido } from './demanda';
import type { Escenario, Estado } from './types';

/** Estado inicial. Con escenario, la semilla y los pedidos iniciales salen de él. */
export function estadoInicial(semilla = 1, escenario: Escenario | null = null): Estado {
  const semillaFinal = escenario ? escenario.semilla : semilla;
  const okr = { ...BALANCE.inicial, rentabilidad: 100 };
  const e: Estado = {
    ciclo: 0,
    semilla: semillaFinal,
    rng: semillaFinal >>> 0,
    siguienteId: 1,
    pedidos: [],
    lineas: Array.from({ length: BALANCE.numLineas }, (_, i) => ({
      id: i + 1,
      // Encendidas pero sin pedido: inactivas hasta que se les asigne uno.
      encendida: true,
      velocidad: 'estandar' as const,
      actual: null,
      siguiente: null,
    })),
    muelles: [null, null],
    okr,
    historial: [],
    ultimoInforme: null,
    escenario,
  };
  if (escenario) {
    for (const p of escenario.pedidosIniciales) agregarPedido(e, p.cantidad, p.ciclosEntrega);
  } else {
    for (let i = 0; i < BALANCE.demanda.pedidosIniciales; i++) crearPedido(e);
  }
  return e;
}
