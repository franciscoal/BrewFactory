import { aplicarAcciones } from './acciones';
import { BALANCE } from './balance';
import { generarDemandaCiclo } from './demanda';
import { lineaActiva, muelleActivo, pedidosEnProduccion } from './derivados';
import { describirDecisiones, NOMBRE_VELOCIDAD } from './informe';
import type { Acciones, Efecto, Estado, Informe, Okr, Pedido, PedidoId, Suceso } from './types';

export interface ResultadoStep {
  estado: Estado;
  /** Acciones descartadas, en lenguaje legible. */
  errores: string[];
  informe: Informe;
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
 * Devuelve también cada efecto con su causa.
 */
function calcularOkr(e: Estado): { okr: Okr; efectos: Efecto[] } {
  const efectos: Efecto[] = [];
  const acum = { cumplimiento: e.okr.cumplimiento, productividad: e.okr.productividad, entrega: e.okr.entrega };
  const sumar = (okr: Efecto['okr'], delta: number, motivo: string): void => {
    if (delta === 0) return;
    acum[okr] += delta;
    efectos.push({ okr, delta, motivo });
  };

  const enProduccion = pedidosEnProduccion(e);
  const noTerminados = e.pedidos.filter((p) => !p.terminado);

  // Cumplimiento
  if (noTerminados.length === 0) sumar('cumplimiento', BALANCE.cumplimiento.sinDemanda, 'No hay pedidos en la cola de demanda');
  for (const p of noTerminados) {
    if (p.contador < 0) {
      sumar('cumplimiento', BALANCE.cumplimiento.pedidoEnRetraso, `${p.id} en retraso (${-p.contador} ${-p.contador === 1 ? 'ciclo' : 'ciclos'})`);
    } else if (enProduccion.has(p.id)) {
      sumar('cumplimiento', BALANCE.cumplimiento.pedidoEnProduccionATiempo, `${p.id} en producción a tiempo`);
    }
  }

  // Productividad
  for (const l of e.lineas) {
    if (lineaActiva(l)) {
      sumar('productividad', BALANCE.velocidades[l.velocidad].productividad, `Línea ${l.id} en velocidad ${NOMBRE_VELOCIDAD[l.velocidad]}`);
    }
  }
  for (const p of noTerminados) {
    if (p.producido > 0 && !enProduccion.has(p.id)) {
      sumar('productividad', BALANCE.productividad.incompletoEnStockNoActivo, `${p.id} incompleto en stock y sin línea activa`);
    }
  }
  const hayStock = e.pedidos.some((p) => p.producido > 0);
  if (!hayStock && noTerminados.length > 0 && enProduccion.size === 0) {
    sumar('productividad', BALANCE.productividad.sinStockConDemandaSinActivos, 'Sin stock, con demanda y sin pedidos activos');
  }

  // Entrega
  const enMuelle = new Set(e.muelles.filter((m): m is PedidoId => m !== null));
  const terminados = e.pedidos.filter((p) => p.terminado);
  for (const p of terminados) {
    if (enMuelle.has(p.id)) {
      if (p.contador >= 0) sumar('entrega', BALANCE.entrega.aTiempo, `${p.id} expedido a tiempo`);
    } else if (p.contador < 0) {
      sumar('entrega', penalizacionRetraso(p.contador), `${p.id} en stock con ${-p.contador} ${-p.contador === 1 ? 'ciclo' : 'ciclos'} de retraso, sin expedir`);
    }
  }
  const sinExpedir = terminados.filter((p) => !enMuelle.has(p.id));
  const muelleLibre = e.muelles.some((m, i) => m === null && muelleActivo(e, i));
  const conMuelleLibre = muelleLibre && sinExpedir.length > 0;
  const porPedido = conMuelleLibre ? BALANCE.entrega.terminadoSinEntregarMuelleLibre : BALANCE.entrega.terminadoSinEntregar;
  for (const p of sinExpedir) {
    sumar('entrega', porPedido, `${p.id} terminado sin expedir${conMuelleLibre ? ' habiendo muelle libre' : ''}`);
  }

  const okr = {
    cumplimiento: limitar(acum.cumplimiento),
    productividad: limitar(acum.productividad),
    entrega: limitar(acum.entrega),
  };
  return { okr: { ...okr, rentabilidad: rentabilidad(okr) }, efectos };
}

/**
 * Paso 2: las líneas 1→4 producen; el sobrante pasa al pedido siguiente o se pierde.
 * Devuelve las botellas aportadas por cada línea (id de línea → botellas).
 */
function producir(e: Estado): Map<number, number> {
  const porId = new Map(e.pedidos.map((p) => [p.id, p]));
  const porLinea = new Map<number, number>();
  for (const l of e.lineas) {
    if (!lineaActiva(l)) continue;
    let capacidad = BALANCE.velocidades[l.velocidad].botellas;
    let aportado = 0;
    for (const id of [l.actual, l.siguiente]) {
      if (id === null || capacidad <= 0) continue;
      const p = porId.get(id)!;
      const botellas = Math.min(capacidad, p.cantidad - p.producido);
      p.producido += botellas;
      capacidad -= botellas;
      aportado += botellas;
    }
    porLinea.set(l.id, aportado);
  }
  return porLinea;
}

/** Botellas que aportará cada línea en la próxima resolución con la configuración actual. No muta `e`. */
export function previsionProduccion(e: Estado): Map<number, number> {
  return producir(structuredClone(e));
}

/** Paso 3: los muelles expiden los pedidos asignados, que desaparecen del stock y del muelle. */
function expedir(e: Estado): Pedido[] {
  const expedidos = new Set(e.muelles.filter((m): m is PedidoId => m !== null));
  const salen = e.pedidos.filter((p) => expedidos.has(p.id));
  e.pedidos = e.pedidos.filter((p) => !expedidos.has(p.id));
  e.muelles = e.muelles.map(() => null);
  return salen;
}

/** Paso 4: los pedidos completos pasan a terminados y las líneas avanzan al siguiente. Devuelve los recién completados. */
function completar(e: Estado, cicloResuelto: number): Pedido[] {
  const nuevos: Pedido[] = [];
  for (const p of e.pedidos) {
    if (!p.terminado && p.producido >= p.cantidad) {
      p.terminado = true;
      p.terminadoEnCiclo = cicloResuelto;
      nuevos.push(p);
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
  return nuevos;
}

const plural = (n: number, singular: string, pl: string): string => `${n} ${n === 1 ? singular : pl}`;

/**
 * Resuelve un ciclo. No muta `previo`.
 * Orden: acciones → producción → expedición → completados → OKR → contadores → demanda.
 */
export function step(previo: Estado, acciones?: Acciones): ResultadoStep {
  const e = structuredClone(previo);
  const errores = acciones ? aplicarAcciones(e, acciones) : [];
  const cicloResuelto = previo.ciclo + 1;
  const decisiones = describirDecisiones(previo, e);
  const sucesos: Suceso[] = [];

  const { okr, efectos } = calcularOkr(e);

  const actualAntes = new Map(e.lineas.map((l) => [l.id, l.actual]));
  for (const [id, botellas] of producir(e)) {
    sucesos.push({ categoria: 'produccion', texto: `Línea ${id}: +${plural(botellas, 'botella', 'botellas')} en ${actualAntes.get(id)}` });
  }
  for (const p of expedir(e)) {
    sucesos.push({
      categoria: 'expedidos',
      texto: p.contador >= 0 ? `${p.id} expedido a tiempo` : `${p.id} expedido con retraso (${plural(-p.contador, 'ciclo', 'ciclos')}), sin bonificación`,
    });
  }
  for (const p of completar(e, cicloResuelto)) {
    sucesos.push({ categoria: 'completados', texto: `${p.id} completado: pasa al stock de expediciones` });
  }

  e.okr = okr;
  for (const p of e.pedidos) p.contador -= 1;
  const conocidos = new Set(e.pedidos.map((p) => p.id));
  generarDemandaCiclo(e);
  for (const p of e.pedidos.filter((x) => !conocidos.has(x.id))) {
    sucesos.push({ categoria: 'demanda', texto: `Nuevo pedido ${p.id}: ${p.cantidad} botellas, ${plural(p.contador, 'ciclo', 'ciclos')}` });
  }

  const informe: Informe = { ciclo: cicloResuelto, decisiones, sucesos, efectos, antes: previo.okr, despues: okr };
  e.ciclo = cicloResuelto;
  e.historial.push({ ciclo: cicloResuelto, okr });
  e.ultimoInforme = informe;
  return { estado: e, errores, informe };
}
