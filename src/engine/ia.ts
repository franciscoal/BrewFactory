import { BALANCE } from './balance';
import type { Velocidad } from './balance';
import { lineaActiva, muelleActivo } from './derivados';
import type { Acciones, Estado, Informe, Okr, PedidoId } from './types';

const pct = (n: number): string => `${n > 0 ? '+' : ''}${n}`;

/** Reglas resumidas que viajan en el estado para que la IA juegue sin más documentación. Usan las cifras del balance en uso. */
export function reglasIA(): string[] {
  const { velocidades: v, cumplimiento: c, productividad: p, entrega: en, pesosRentabilidad: w, muelle2MinLineasActivas } = BALANCE;
  return [
    'Cada ciclo (1 hora) tú decides la configuración deseada COMPLETA y el sistema resuelve el ciclo: producción, expedición, OKR.',
    `Objetivo: maximizar la rentabilidad = ${w.cumplimiento}·cumplimiento + ${w.productividad}·productividad + ${w.entrega}·entrega (todo de 0 a 100).`,
    `Hay ${BALANCE.numLineas} líneas. Velocidades: baja (${v.baja.botellas} botellas, productividad ${pct(v.baja.productividad)}), estandar (${v.estandar.botellas}, ${pct(v.estandar.productividad)}), alta (${v.alta.botellas}, ${pct(v.alta.productividad)}) por línea activa y ciclo.`,
    'Una línea es activa si está encendida y tiene pedido "actual". "siguiente" es la reserva: recibe el sobrante y pasa a actual al terminar el actual.',
    'Un pedido puede estar en varias líneas a la vez. Apagar una línea (encendida=false) libera sus pedidos: deja actual y siguiente a null.',
    `Cumplimiento: ${pct(c.pedidoEnProduccionATiempo)} por pedido que es actual de una línea activa y no va con retraso (ciclosPendientes >= 0); ${pct(c.pedidoEnRetraso)} por pedido pendiente en retraso; ${pct(c.sinDemanda)} si no queda demanda.`,
    `Productividad: ${pct(p.incompletoEnStockNoActivo)} por pedido con producción parcial que no es actual de ninguna línea activa; ${pct(p.sinStockConDemandaSinActivos)} si no hay stock, hay demanda y ninguna línea activa.`,
    'Un pedido completado en el ciclo n pasa al stock (estado "terminado"). Solo puedes asignarlo a un muelle en el ciclo n+1, y se expide en ese ciclo.',
    `Muelle 1 siempre activo; muelle 2 solo con ${muelle2MinLineasActivas} o más líneas activas. Cada muelle recibe el id de un pedido "terminado" o null.`,
    `Entrega: ${pct(en.aTiempo)} por pedido expedido a tiempo (ciclosPendientes >= 0); expedido con retraso ni suma ni resta.`,
    `Entrega: por cada pedido terminado sin expedir ${pct(en.terminadoSinEntregar)} (${pct(en.terminadoSinEntregarMuelleLibre)} si había un muelle libre); además ${pct(en.retrasoLeve)} (retraso 1-${en.umbralRetrasoLeve} ciclos), ${pct(en.retrasoMedio)} (${en.umbralRetrasoLeve + 1}-${en.umbralRetrasoMedio}) o ${pct(en.retrasoGrave)} (>${en.umbralRetrasoMedio}) si va con retraso.`,
    'Acciones no permitidas (pedido inexistente, no terminado en un muelle, pedidos en línea apagada, mismo pedido actual y siguiente...) se descartan y se notifican en erroresCicloAnterior.',
  ];
}

export interface PedidoIA {
  id: PedidoId;
  cantidad: number;
  producido: number;
  pendiente: number;
  /** Ciclos que faltan para el vencimiento; negativo = retraso. */
  ciclosPendientes: number;
  estado: 'pendiente' | 'en_curso' | 'terminado';
  lineas: number[];
}

export interface EstadoIA {
  juego: 'BrewFactory';
  version: 1;
  reglas: string[];
  /** Último ciclo resuelto. Las acciones que envíes se aplicarán al resolver el ciclo siguiente. */
  ciclo: number;
  okr: Okr;
  historialOkr: { ciclo: number; okr: Okr }[];
  velocidades: Record<Velocidad, { botellas: number; productividad: number }>;
  pedidos: PedidoIA[];
  lineas: { id: number; encendida: boolean; activa: boolean; velocidad: Velocidad; actual: PedidoId | null; siguiente: PedidoId | null }[];
  muelles: { numero: number; activo: boolean; pedido: PedidoId | null }[];
  informeCicloAnterior: Informe | null;
  erroresCicloAnterior: string[];
  /** Formato exacto de la respuesta esperada. */
  formatoAcciones: Acciones;
}

const HISTORIAL_MAX = 10;

/** Estado inteligible para una IA. No incluye el plan en edición: describe el ciclo ya resuelto. */
export function estadoParaIA(e: Estado, erroresCicloAnterior: string[] = []): EstadoIA {
  return {
    juego: 'BrewFactory',
    version: 1,
    reglas: reglasIA(),
    ciclo: e.ciclo,
    okr: e.okr,
    historialOkr: e.historial.slice(-HISTORIAL_MAX),
    velocidades: { ...BALANCE.velocidades },
    pedidos: e.pedidos.map((p) => ({
      id: p.id,
      cantidad: p.cantidad,
      producido: p.producido,
      pendiente: p.cantidad - p.producido,
      ciclosPendientes: p.contador,
      estado: p.terminado ? 'terminado' : p.producido > 0 ? 'en_curso' : 'pendiente',
      lineas: e.lineas.filter((l) => l.actual === p.id || l.siguiente === p.id).map((l) => l.id),
    })),
    lineas: e.lineas.map((l) => ({
      id: l.id,
      encendida: l.encendida,
      activa: lineaActiva(l),
      velocidad: l.velocidad,
      actual: l.actual,
      siguiente: l.siguiente,
    })),
    muelles: e.muelles.map((pedido, i) => ({ numero: i + 1, activo: muelleActivo(e, i), pedido })),
    informeCicloAnterior: e.ultimoInforme,
    erroresCicloAnterior,
    formatoAcciones: {
      comentario: 'Explica brevemente tu razonamiento (opcional).',
      lineas: e.lineas.map((l) => ({ id: l.id, encendida: true, velocidad: 'estandar', actual: null, siguiente: null })),
      muelles: [null, null],
    },
  };
}

export type ResultadoParseo = { acciones: Acciones } | { error: string };

const esTextoONulo = (v: unknown): v is string | null => v === null || typeof v === 'string';

/**
 * Convierte el JSON de una IA en `Acciones`. Valida solo la estructura; las reglas del juego
 * las valida `aplicarAcciones`. Los campos ausentes conservan el valor de `base`;
 * `null` explícito vacía el hueco. Acepta el objeto directo o envuelto en `{ acciones: … }`.
 */
export function parsearAcciones(texto: string, base: Estado): ResultadoParseo {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch (err) {
    return { error: `El texto no es JSON válido: ${(err as Error).message}` };
  }
  const raiz = json as { acciones?: unknown } | null;
  const obj = (raiz && typeof raiz === 'object' && 'acciones' in raiz ? raiz.acciones : json) as Record<string, unknown> | null;
  if (!obj || typeof obj !== 'object') return { error: 'Se esperaba un objeto JSON con "lineas" y "muelles".' };

  const lineasIn = obj.lineas;
  if (!Array.isArray(lineasIn)) return { error: 'Falta "lineas": debe ser una lista.' };

  const lineas: Acciones['lineas'] = [];
  for (const [i, raw] of lineasIn.entries()) {
    const l = raw as Record<string, unknown> | null;
    if (!l || typeof l !== 'object' || typeof l.id !== 'number') return { error: `lineas[${i}]: falta el "id" numérico.` };
    const previa = base.lineas.find((x) => x.id === l.id);
    if (l.encendida !== undefined && typeof l.encendida !== 'boolean') return { error: `Línea ${l.id}: "encendida" debe ser true o false.` };
    if (l.velocidad !== undefined && typeof l.velocidad !== 'string') return { error: `Línea ${l.id}: "velocidad" debe ser texto.` };
    for (const campo of ['actual', 'siguiente'] as const) {
      if (l[campo] !== undefined && !esTextoONulo(l[campo])) return { error: `Línea ${l.id}: "${campo}" debe ser un id de pedido o null.` };
    }
    lineas.push({
      id: l.id,
      encendida: (l.encendida as boolean | undefined) ?? previa?.encendida ?? true,
      velocidad: ((l.velocidad as string | undefined) ?? previa?.velocidad ?? 'estandar') as Velocidad,
      actual: l.actual === undefined ? (previa?.actual ?? null) : (l.actual as string | null),
      siguiente: l.siguiente === undefined ? (previa?.siguiente ?? null) : (l.siguiente as string | null),
    });
  }

  let muelles: Acciones['muelles'] = [...base.muelles];
  if (obj.muelles !== undefined) {
    if (!Array.isArray(obj.muelles) || !obj.muelles.every(esTextoONulo)) return { error: '"muelles" debe ser una lista de ids de pedido o null.' };
    muelles = base.muelles.map((previo, i) => (obj.muelles as (string | null)[])[i] ?? (i < (obj.muelles as unknown[]).length ? null : previo));
  }

  if (obj.comentario !== undefined && typeof obj.comentario !== 'string') return { error: '"comentario" debe ser texto.' };
  return { acciones: { lineas, muelles, ...(typeof obj.comentario === 'string' ? { comentario: obj.comentario } : {}) } };
}
