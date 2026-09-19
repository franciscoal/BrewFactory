/**
 * Todas las cifras de ajuste del juego. Los valores viven en `public/config/balance.json`;
 * este módulo los expone como un objeto vivo (`BALANCE`) que se puede reemplazar en caliente.
 * Los valores de la especificación original están en `src/config/balance-original.json`.
 */
import porDefecto from '../../public/config/balance.json';

export type Velocidad = 'baja' | 'estandar' | 'alta';

export interface Balance {
  numLineas: number;
  velocidades: Record<Velocidad, { botellas: number; productividad: number }>;
  inicial: { cumplimiento: number; productividad: number; entrega: number };
  pesosRentabilidad: { cumplimiento: number; productividad: number; entrega: number };
  cumplimiento: { sinDemanda: number; pedidoEnProduccionATiempo: number; pedidoEnRetraso: number };
  productividad: { incompletoEnStockNoActivo: number; sinStockConDemandaSinActivos: number };
  entrega: {
    aTiempo: number;
    /** Penalización por ciclo de un pedido terminado en stock, con retraso de 1 a `umbralRetrasoLeve` ciclos. */
    retrasoLeve: number;
    /** Retraso de más de `umbralRetrasoLeve` y hasta `umbralRetrasoMedio` ciclos. */
    retrasoMedio: number;
    /** Retraso de más de `umbralRetrasoMedio` ciclos. */
    retrasoGrave: number;
    umbralRetrasoLeve: number;
    umbralRetrasoMedio: number;
    terminadoSinEntregar: number;
    terminadoSinEntregarMuelleLibre: number;
  };
  demanda: {
    pedidosIniciales: number;
    cantidadMin: number;
    cantidadMax: number;
    cantidadPaso: number;
    ciclosEntregaMin: number;
    ciclosEntregaMax: number;
    /** Pedidos nuevos por ciclo de media (p. ej. 1,3 = un pedido y, en el 30 % de los ciclos, otro más). */
    pedidosPorCiclo: number;
    /** Duración en ciclos de una oleada de demanda (0 = demanda constante). */
    oleadaPeriodo: number;
    /** Intensidad de la oleada: 0,5 = la demanda oscila entre el 50 % y el 150 % de la media. */
    oleadaAmplitud: number;
  };
  muelle2MinLineasActivas: number;
  cicloSegundosPorDefecto: number;
  cicloSegundosRango: { min: number; max: number };
}

/** Valores del fichero de configuración empaquetados con la aplicación. */
export const BALANCE_POR_DEFECTO: Balance = porDefecto as Balance;

/** Configuración en uso. Se modifica en su sitio con `aplicarBalance`. */
export const BALANCE: Balance = structuredClone(BALANCE_POR_DEFECTO);

function copiarEnSitio(destino: Record<string, unknown>, origen: Record<string, unknown>): void {
  for (const [k, v] of Object.entries(origen)) {
    if (v !== null && typeof v === 'object') copiarEnSitio(destino[k] as Record<string, unknown>, v as Record<string, unknown>);
    else destino[k] = v;
  }
}

/** Sustituye la configuración en uso. Todos los módulos la leen en cada uso, así que surte efecto al instante. */
export function aplicarBalance(nuevo: Balance): void {
  copiarEnSitio(BALANCE as unknown as Record<string, unknown>, nuevo as unknown as Record<string, unknown>);
}

export type ResultadoBalance = { balance: Balance } | { error: string };

function fusionar(base: Record<string, unknown>, extra: unknown, ruta: string, errores: string[]): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  const origen = (extra !== null && typeof extra === 'object' ? extra : {}) as Record<string, unknown>;
  for (const [k, valorBase] of Object.entries(base)) {
    const valor = origen[k];
    if (valor === undefined) salida[k] = structuredClone(valorBase);
    else if (valorBase !== null && typeof valorBase === 'object') salida[k] = fusionar(valorBase as Record<string, unknown>, valor, `${ruta}${k}.`, errores);
    else if (typeof valor === 'number' && Number.isFinite(valor)) salida[k] = valor;
    else {
      errores.push(`${ruta}${k} debe ser un número`);
      salida[k] = valorBase;
    }
  }
  return salida;
}

/**
 * Valida una configuración (por ejemplo leída de un archivo). Los campos ausentes toman el valor
 * de `base`; los presentes deben ser números y cumplir las reglas de coherencia.
 */
export function validarBalance(entrada: unknown, base: Balance = BALANCE_POR_DEFECTO): ResultadoBalance {
  const errores: string[] = [];
  const b = fusionar(base as unknown as Record<string, unknown>, entrada, '', errores) as unknown as Balance;
  const w = b.pesosRentabilidad;
  if (Math.abs(w.cumplimiento + w.productividad + w.entrega - 1) > 0.001) errores.push('Los pesos de rentabilidad deben sumar 1');
  if (b.demanda.pedidosPorCiclo < 0) errores.push('Los pedidos por ciclo no pueden ser negativos');
  if (b.demanda.oleadaPeriodo < 0) errores.push('El periodo de la oleada de demanda no puede ser negativo');
  if (b.demanda.oleadaAmplitud < 0 || b.demanda.oleadaAmplitud > 1) errores.push('La amplitud de la oleada debe estar entre 0 y 1');
  if (b.demanda.cantidadMin > b.demanda.cantidadMax) errores.push('La cantidad mínima de pedido no puede superar la máxima');
  if (b.demanda.cantidadPaso <= 0) errores.push('El paso de cantidad debe ser mayor que 0');
  if (b.demanda.ciclosEntregaMin > b.demanda.ciclosEntregaMax) errores.push('Los ciclos de entrega mínimos no pueden superar los máximos');
  if (b.entrega.umbralRetrasoLeve > b.entrega.umbralRetrasoMedio) errores.push('El umbral de retraso leve no puede superar el medio');
  for (const [nombre, v] of Object.entries(b.velocidades)) if (v.botellas < 0) errores.push(`Las botellas de la velocidad ${nombre} no pueden ser negativas`);
  return errores.length > 0 ? { error: errores.join('. ') } : { balance: b };
}
