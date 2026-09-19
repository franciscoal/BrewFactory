import { aplicarAcciones, BALANCE, estadoInicial, muelleActivo, step } from '../engine';
import type { Acciones, Escenario, Estado, Informe, PedidoId, Velocidad } from '../engine';

export type Fase = 'detenido' | 'jugando' | 'pausa' | 'terminado';

export interface EntradaLog {
  ciclo: number;
  acciones: Acciones;
  errores: string[];
  informe: Informe;
}

export interface Juego {
  /** Último estado resuelto. */
  estado: Estado;
  /** Configuración deseada para el próximo ciclo (lo que el jugador va editando). */
  plan: Acciones;
  fase: Fase;
  cicloSegundos: number;
  restante: number;
  limitar: boolean;
  totalCiclos: number;
  errores: string[];
  /** Acciones descartadas al aplicar el plan de una IA durante este ciclo; pasan a `errores` al resolverlo. */
  erroresAcciones: string[];
  log: EntradaLog[];
  /** Razonamiento que acompañó a las últimas acciones de la IA (se limpia al resolver el ciclo). */
  comentarioIA: string | null;
}

/** Elementos que difieren entre dos configuraciones; sirve para resaltar lo que ha cambiado la IA. */
export interface Cambios {
  pedidos: string[];
  lineas: number[];
  muelles: number[];
}

export const planDesde = (e: Estado): Acciones => ({
  lineas: e.lineas.map((l) => ({
    id: l.id,
    encendida: l.encendida,
    velocidad: l.velocidad,
    actual: l.actual,
    siguiente: l.siguiente,
  })),
  muelles: [...e.muelles],
});

/** Estado tal como quedará al aplicar el plan: es lo que se dibuja (lo que ves es lo que cuenta). */
export function vistaDe(estado: Estado, plan: Acciones): Estado {
  const vista = structuredClone(estado);
  aplicarAcciones(vista, plan);
  return vista;
}

export function juegoNuevo(semilla = (Math.random() * 2 ** 31) >>> 0, escenario: Escenario | null = null): Juego {
  const estado = estadoInicial(semilla, escenario);
  return {
    estado,
    plan: planDesde(estado),
    fase: 'detenido',
    cicloSegundos: BALANCE.cicloSegundosPorDefecto,
    restante: BALANCE.cicloSegundosPorDefecto,
    limitar: false,
    totalCiclos: 24,
    errores: [],
    erroresAcciones: [],
    log: [],
    comentarioIA: null,
  };
}

/** Compara la configuración de dos estados y lista qué pedidos, líneas y muelles cambian. */
export function cambiosEntre(antes: Estado, despues: Estado): Cambios {
  const pedidos = new Set<string>();
  const lineas: number[] = [];
  despues.lineas.forEach((n, i) => {
    const p = antes.lineas[i];
    if (p.encendida === n.encendida && p.velocidad === n.velocidad && p.actual === n.actual && p.siguiente === n.siguiente) return;
    lineas.push(n.id);
    const rol = (l: typeof p, id: string) => (l.actual === id ? 'actual' : l.siguiente === id ? 'siguiente' : null);
    for (const id of [p.actual, p.siguiente, n.actual, n.siguiente]) {
      if (id && rol(p, id) !== rol(n, id)) pedidos.add(id);
    }
  });
  const muelles: number[] = [];
  despues.muelles.forEach((m, i) => {
    if (m !== antes.muelles[i]) {
      muelles.push(i);
      for (const id of [m, antes.muelles[i]]) if (id) pedidos.add(id);
    }
  });
  return { pedidos: [...pedidos], lineas, muelles };
}

/** Aplica al plan las acciones de una IA (sin resolver el ciclo). Devuelve los avisos de las acciones descartadas. */
export function aplicarAccionesIA(j: Juego, acciones: Acciones): { juego: Juego; errores: string[]; cambios: Cambios } {
  const antes = vistaDe(j.estado, j.plan);
  const despues = structuredClone(j.estado);
  const errores = aplicarAcciones(despues, acciones);
  return {
    juego: { ...j, plan: planDesde(despues), comentarioIA: acciones.comentario ?? null, erroresAcciones: errores },
    errores,
    cambios: cambiosEntre(antes, despues),
  };
}

// ── Control de partida ──────────────────────────────────────────────────────

export function resolver(j: Juego): Juego {
  const r = step(j.estado, j.plan);
  const fin = j.limitar && r.estado.ciclo >= j.totalCiclos;
  // Las acciones descartadas al aplicar el plan de una IA ya no aparecen en `r.errores` (el plan llegó normalizado):
  // se conservan aquí para que la IA las vea en el estado siguiente.
  const errores = [...j.erroresAcciones, ...r.errores];
  return {
    ...j,
    estado: r.estado,
    plan: planDesde(r.estado),
    errores,
    erroresAcciones: [],
    restante: j.cicloSegundos,
    comentarioIA: null,
    fase: fin ? 'terminado' : j.fase,
    log: [...j.log, { ciclo: r.estado.ciclo, acciones: j.plan, errores, informe: r.informe }],
  };
}

export function tick(j: Juego): Juego {
  if (j.fase !== 'jugando') return j;
  return j.restante <= 1 ? resolver(j) : { ...j, restante: j.restante - 1 };
}

export const play = (j: Juego): Juego =>
  j.fase === 'detenido' || j.fase === 'pausa' ? { ...j, fase: 'jugando' } : j;

export const pausar = (j: Juego): Juego => (j.fase === 'jugando' ? { ...j, fase: 'pausa' } : j);

export const detener = (j: Juego): Juego => (j.fase === 'terminado' ? j : { ...j, fase: 'terminado' });

/** Avanza un ciclo manualmente (con la partida parada o en pausa). */
export const paso = (j: Juego): Juego => (j.fase === 'detenido' || j.fase === 'pausa' ? resolver(j) : j);

export function cambiarCicloSegundos(j: Juego, segundos: number): Juego {
  return { ...j, cicloSegundos: segundos, restante: Math.min(j.restante, segundos) };
}

export function mediaRentabilidad(e: Estado): number {
  if (e.historial.length === 0) return 0;
  return e.historial.reduce((s, h) => s + h.okr.rentabilidad, 0) / e.historial.length;
}

// ── Operaciones de edición del plan ─────────────────────────────────────────

export type Resultado = { plan: Acciones } | { error: string };

function editar(vista: Estado, f: (plan: Acciones) => string | void): Resultado {
  const plan = planDesde(vista);
  const error = f(plan);
  return error ? { error } : { plan };
}

export const opAsignar = (vista: Estado, pedidoId: PedidoId, lineaId: number, hueco: 'actual' | 'siguiente'): Resultado =>
  editar(vista, (plan) => {
    const l = plan.lineas.find((x) => x.id === lineaId)!;
    const p = vista.pedidos.find((x) => x.id === pedidoId);
    if (!l.encendida) return `La línea ${lineaId} está apagada: enciéndela primero.`;
    if (!p || p.terminado) return 'Solo se pueden asignar a una línea pedidos pendientes de producir.';
    if (hueco === 'actual' && l.actual !== null) return 'El pedido actual es de solo lectura: suelta en «siguiente».';
    if (l.actual === pedidoId) return `El pedido ${pedidoId} ya es el actual de la línea ${lineaId}.`;
    if (hueco === 'actual') l.actual = pedidoId;
    else l.siguiente = pedidoId;
  });

export const opIntercambiar = (vista: Estado, lineaId: number): Resultado =>
  editar(vista, (plan) => {
    const l = plan.lineas.find((x) => x.id === lineaId)!;
    if (l.actual === null || l.siguiente === null) return 'Hace falta tener pedido actual y siguiente para intercambiarlos.';
    [l.actual, l.siguiente] = [l.siguiente, l.actual];
  });

export const opQuitar = (vista: Estado, lineaId: number, hueco: 'actual' | 'siguiente'): Resultado =>
  editar(vista, (plan) => {
    plan.lineas.find((x) => x.id === lineaId)![hueco] = null;
  });

export const opEncender = (vista: Estado, lineaId: number, encendida: boolean): Resultado =>
  editar(vista, (plan) => {
    const l = plan.lineas.find((x) => x.id === lineaId)!;
    l.encendida = encendida;
    if (!encendida) {
      l.actual = null;
      l.siguiente = null;
    }
  });

export const opVelocidad = (vista: Estado, lineaId: number, velocidad: Velocidad): Resultado =>
  editar(vista, (plan) => {
    plan.lineas.find((x) => x.id === lineaId)!.velocidad = velocidad;
  });

export const opMuelle = (vista: Estado, indice: number, pedidoId: PedidoId | null): Resultado =>
  editar(vista, (plan) => {
    if (pedidoId === null) {
      plan.muelles[indice] = null;
      return;
    }
    const p = vista.pedidos.find((x) => x.id === pedidoId);
    if (!muelleActivo(vista, indice)) return `El muelle ${indice + 1} está inactivo: necesita ${BALANCE.muelle2MinLineasActivas} líneas activas.`;
    if (!p || !p.terminado) return 'Solo se pueden expedir pedidos terminados.';
    plan.muelles = plan.muelles.map((m) => (m === pedidoId ? null : m));
    plan.muelles[indice] = pedidoId;
  });

// ── Guardado de resultado ───────────────────────────────────────────────────

export function resultadoJson(j: Juego): string {
  return JSON.stringify(
    {
      juego: 'BrewFactory',
      version: 1,
      semilla: j.estado.semilla,
      escenario: j.estado.escenario,
      ciclos: j.estado.ciclo,
      cicloSegundos: j.cicloSegundos,
      mediaRentabilidad: mediaRentabilidad(j.estado),
      historial: j.estado.historial,
      acciones: j.log,
    },
    null,
    2,
  );
}
