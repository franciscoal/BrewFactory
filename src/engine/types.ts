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

export type CategoriaDecision = 'anadidos' | 'retirados' | 'prioridad' | 'lineas' | 'velocidad' | 'muelles';
export type CategoriaSuceso = 'produccion' | 'completados' | 'expedidos' | 'demanda';

/** Cambio que hizo el jugador o la IA respecto al estado del ciclo anterior. */
export interface Decision {
  categoria: CategoriaDecision;
  texto: string;
}

/** Algo que ocurrió al resolver el ciclo. */
export interface Suceso {
  categoria: CategoriaSuceso;
  texto: string;
}

/** Variación de un OKR con su causa. */
export interface Efecto {
  okr: 'cumplimiento' | 'productividad' | 'entrega';
  delta: number;
  motivo: string;
}

/** Resumen estructurado de un ciclo: qué se decidió, qué pasó y qué impacto tuvo. */
export interface Informe {
  ciclo: number;
  decisiones: Decision[];
  sucesos: Suceso[];
  efectos: Efecto[];
  antes: Okr;
  despues: Okr;
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
  /** Informe del último ciclo resuelto (null antes del primero). */
  ultimoInforme: Informe | null;
}

/** Acciones declarativas: configuración deseada completa. */
export interface Acciones {
  lineas: { id: number; encendida: boolean; velocidad: Velocidad; actual: PedidoId | null; siguiente: PedidoId | null }[];
  muelles: (PedidoId | null)[];
  comentario?: string;
}
