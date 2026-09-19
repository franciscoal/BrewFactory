import type { Velocidad } from './balance';

export type PedidoId = string;

/** Entidad única: la cola de demanda y el stock de expediciones son vistas de esta lista. */
export interface Pedido {
  id: PedidoId;
  cantidad: number;
  producido: number;
  ciclosEntregaIniciales: number;
  /** Ciclos pendientes de entrega. Negativo = retraso. */
  contador: number;
  terminado: boolean;
  /** Ciclo en que se completó; sirve para ordenar el stock por orden de finalización. */
  terminadoEnCiclo: number | null;
}

export interface Linea {
  id: number;
  encendida: boolean;
  velocidad: Velocidad;
  actual: PedidoId | null;
  siguiente: PedidoId | null;
}

export interface Okr {
  cumplimiento: number;
  productividad: number;
  entrega: number;
  rentabilidad: number;
}

export interface Estado {
  ciclo: number;
  semilla: number;
  /** Estado interno del generador pseudoaleatorio. */
  rng: number;
  /** Contador para generar ids de pedido. */
  siguienteId: number;
  pedidos: Pedido[];
  lineas: Linea[];
  /** Pedido asignado a cada muelle (índice 0 = muelle 1). null = vacío. */
  muelles: (PedidoId | null)[];
  okr: Okr;
  historial: { ciclo: number; okr: Okr }[];
}

/** Acciones declarativas: configuración deseada completa. */
export interface Acciones {
  lineas: { id: number; encendida: boolean; velocidad: Velocidad; actual: PedidoId | null; siguiente: PedidoId | null }[];
  muelles: (PedidoId | null)[];
  comentario?: string;
}
