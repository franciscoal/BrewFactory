import { BALANCE } from './balance';
import { crearPedido } from './demanda';
import type { Estado } from './types';

export function estadoInicial(semilla = 1): Estado {
  const okr = { ...BALANCE.inicial, rentabilidad: 100 };
  const e: Estado = {
    ciclo: 0,
    semilla,
    rng: semilla >>> 0,
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
  };
  for (let i = 0; i < BALANCE.demanda.pedidosIniciales; i++) crearPedido(e);
  return e;
}
