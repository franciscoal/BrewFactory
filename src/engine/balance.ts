/** Todas las cifras de ajuste del juego. Ver Docs/gamerules-decisiones.md */
export type Velocidad = 'baja' | 'estandar' | 'alta';

export const BALANCE = {
  numLineas: 4,
  velocidades: {
    baja: { botellas: 25, productividad: -5 },
    estandar: { botellas: 50, productividad: 5 },
    alta: { botellas: 100, productividad: -3 },
  } satisfies Record<Velocidad, { botellas: number; productividad: number }>,

  inicial: { cumplimiento: 100, productividad: 100, entrega: 100 },
  pesosRentabilidad: { cumplimiento: 0.25, productividad: 0.5, entrega: 0.25 },

  cumplimiento: {
    sinDemanda: -20,
    pedidoEnProduccionATiempo: 5,
    pedidoEnRetraso: -5,
  },

  productividad: {
    incompletoEnStockNoActivo: -5,
    sinStockConDemandaSinActivos: -20,
  },

  entrega: {
    aTiempo: 10,
    /** Tramos de retraso sobre pedidos en stock que no llegan a muelle. `min` inclusivo. */
    tramosRetraso: [
      { min: -3, penalizacion: -5 }, // [-3, 0)
      { min: -10, penalizacion: -10 }, // [-10, -3)
      { min: -Infinity, penalizacion: -20 }, // < -10
    ],
    terminadoSinEntregar: -5,
    terminadoSinEntregarMuelleLibre: -15,
  },

  demanda: {
    pedidosIniciales: 6,
    cantidadMin: 50,
    cantidadMax: 300,
    cantidadPaso: 25,
    ciclosEntregaMin: 3,
    ciclosEntregaMax: 8,
    /** Pedidos nuevos por ciclo: 0 con esta probabilidad, 1 con la siguiente, 2 con el resto. */
    probNinguno: 0.15,
    probUno: 0.6,
  },

  muelle2MinLineasActivas: 3,
  cicloSegundosPorDefecto: 15,
  cicloSegundosRango: { min: 3, max: 60 },
} as const;
