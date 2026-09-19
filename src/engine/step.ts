import { aplicarAcciones } from './acciones';
import { BALANCE } from './balance';
import { generarDemandaCiclo } from './demanda';
import { lineaActiva, muelleActivo, pedidosEnProduccion } from './derivados';
import type { Acciones, Estado, Okr, PedidoId } from './types';

export interface ResultadoStep {
  estado: Estado;
  /** Acciones descartadas, en lenguaje legible. */
  errores: string[];
}

const limitar = (v: number): number => Math.min(100, Math.max(0, v));

export function rentabilidad(o: Pick<Okr, 'cumplimiento' | 'productividad' | 'entrega'>): number {
  const w = BALANCE.pesosRentabilidad;
  return w.cumplimiento * o.cumplimiento + w.productividad * o.productividad + w.entrega * o.entrega;
}

/** Penalización del tramo de retraso para un contador negativo. */
function penalizacionRetraso(contador: number): number {
  const tramo = BALANCE.entrega.tramosRetraso.find((t) => contador >= t.min);
  return tramo ? tramo.penalizacion : 0;
}

/**
 * Calcula los OKR del ciclo con la configuración resultante de aplicar las acciones y los
 * contadores tal como los veía el jugador (antes de producir, expedir o decrementar).
 */
function calcularOkr(e: Estado): Okr {
  const enProduccion = pedidosEnProduccion(e);
  const noTerminados = e.pedidos.filter((p) => !p.terminado);

  // Cumplimiento
  let cumplimiento = e.okr.cumplimiento;
  if (noTerminados.length === 0) cumplimiento += BALANCE.cumplimiento.sinDemanda;
  for (const p of noTerminados) {
    if (p.contador < 0) cumplimiento += BALANCE.cumplimiento.pedidoEnRetraso;
    else if (enProduccion.has(p.id)) cumplimiento += BALANCE.cumplimiento.pedidoEnProduccionATiempo;
  }

  // Productividad
  let productividad = e.okr.productividad;
  for (const l of e.lineas) {
    if (lineaActiva(l)) productividad += BALANCE.velocidades[l.velocidad].productividad;
  }
  for (const p of noTerminados) {
    if (p.producido > 0 && !enProduccion.has(p.id)) productividad += BALANCE.productividad.incompletoEnStockNoActivo;
  }
  const hayStock = e.pedidos.some((p) => p.producido > 0);
  if (!hayStock && noTerminados.length > 0 && enProduccion.size === 0) {
    productividad += BALANCE.productividad.sinStockConDemandaSinActivos;
  }

  // Entrega
  let entrega = e.okr.entrega;
  const enMuelle = new Set(e.muelles.filter((m): m is PedidoId => m !== null));
  const terminados = e.pedidos.filter((p) => p.terminado);
  for (const p of terminados) {
    if (enMuelle.has(p.id)) {
      if (p.contador >= 0) entrega += BALANCE.entrega.aTiempo;
    } else if (p.contador < 0) {
      entrega += penalizacionRetraso(p.contador);
    }
  }
  const sinExpedir = terminados.filter((p) => !enMuelle.has(p.id));
  const muelleLibre = e.muelles.some((m, i) => m === null && muelleActivo(e, i));
  const porPedido =
    muelleLibre && sinExpedir.length > 0
      ? BALANCE.entrega.terminadoSinEntregarMuelleLibre
      : BALANCE.entrega.terminadoSinEntregar;
  entrega += porPedido * sinExpedir.length;

  const okr = {
    cumplimiento: limitar(cumplimiento),
    productividad: limitar(productividad),
    entrega: limitar(entrega),
  };
  return { ...okr, rentabilidad: rentabilidad(okr) };
}

/** Paso 2: las líneas 1→4 producen; el sobrante pasa al pedido siguiente o se pierde. */
function producir(e: Estado): void {
  const porId = new Map(e.pedidos.map((p) => [p.id, p]));
  for (const l of e.lineas) {
    if (!lineaActiva(l)) continue;
    let capacidad = BALANCE.velocidades[l.velocidad].botellas;
    for (const id of [l.actual, l.siguiente]) {
      if (id === null || capacidad <= 0) continue;
      const p = porId.get(id)!;
      const botellas = Math.min(capacidad, p.cantidad - p.producido);
      p.producido += botellas;
      capacidad -= botellas;
    }
  }
}

/** Paso 3: los muelles expiden los pedidos asignados, que desaparecen del stock y del muelle. */
function expedir(e: Estado): void {
  const expedidos = new Set(e.muelles.filter((m): m is PedidoId => m !== null));
  e.pedidos = e.pedidos.filter((p) => !expedidos.has(p.id));
  e.muelles = e.muelles.map(() => null);
}

/** Paso 4: los pedidos completos pasan a terminados y las líneas avanzan al siguiente. */
function completar(e: Estado, cicloResuelto: number): void {
  for (const p of e.pedidos) {
    if (!p.terminado && p.producido >= p.cantidad) {
      p.terminado = true;
      p.terminadoEnCiclo = cicloResuelto;
    }
  }
  const terminado = new Map(e.pedidos.map((p) => [p.id, p.terminado]));
  for (const l of e.lineas) {
    while (l.actual !== null && terminado.get(l.actual)) {
      l.actual = l.siguiente;
      l.siguiente = null;
    }
    if (l.siguiente !== null && terminado.get(l.siguiente)) l.siguiente = null;
  }
}

/**
 * Resuelve un ciclo. No muta `previo`.
 * Orden: acciones → producción → expedición → completados → OKR → contadores → demanda.
 */
export function step(previo: Estado, acciones?: Acciones): ResultadoStep {
  const e = structuredClone(previo);
  const errores = acciones ? aplicarAcciones(e, acciones) : [];
  const cicloResuelto = previo.ciclo + 1;

  const okr = calcularOkr(e);
  producir(e);
  expedir(e);
  completar(e, cicloResuelto);
  e.okr = okr;
  for (const p of e.pedidos) p.contador -= 1;
  generarDemandaCiclo(e);

  e.ciclo = cicloResuelto;
  e.historial.push({ ciclo: cicloResuelto, okr });
  return { estado: e, errores };
}
