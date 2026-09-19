import { siguienteAleatorio } from '../engine/rng';
import type { Acciones, Estado, PedidoId, Velocidad } from '../engine';
import { BALANCE } from '../engine';

/** Una estrategia decide la configuración deseada del ciclo a partir del estado. */
export type Estrategia = (estado: Estado) => Acciones;

type ElegirVelocidad = (estado: Estado, lineaId: number) => Velocidad;

/**
 * Asignación común a todos los bots: mantiene el pedido actual de cada línea, rellena huecos con
 * los pedidos pendientes más urgentes (menor contador) y expide los terminados más urgentes.
 * Lo único que cambia entre estrategias es la velocidad de cada línea.
 */
function planificar(e: Estado, velocidad: ElegirVelocidad): Acciones {
  const pendientes = e.pedidos.filter((p) => !p.terminado).sort((a, b) => a.contador - b.contador);
  const vivos = new Set(pendientes.map((p) => p.id));
  const reservados = new Set<PedidoId>();

  const lineas = e.lineas.map((l) => {
    const actual = l.actual && vivos.has(l.actual) ? l.actual : null;
    if (actual) reservados.add(actual);
    return { linea: l, actual };
  });
  const siguiente = () => pendientes.find((p) => !reservados.has(p.id))?.id ?? null;

  const resultado = lineas.map(({ linea, actual }) => {
    let a = actual;
    if (!a) {
      a = siguiente();
      if (a) reservados.add(a);
    }
    return { id: linea.id, encendida: true, velocidad: velocidad(e, linea.id), actual: a, siguiente: null as PedidoId | null };
  });
  for (const l of resultado) {
    const s = siguiente();
    if (s) {
      l.siguiente = s;
      reservados.add(s);
    }
  }

  const activas = resultado.filter((l) => l.actual !== null).length;
  const terminados = e.pedidos.filter((p) => p.terminado).sort((a, b) => a.contador - b.contador);
  const muelles: (PedidoId | null)[] = [terminados[0]?.id ?? null, activas >= BALANCE.muelle2MinLineasActivas ? (terminados[1]?.id ?? null) : null];
  return { lineas: resultado, muelles };
}

const fija = (v: Velocidad): Estrategia => (e) => planificar(e, () => v);

/** Botellas pendientes de producir en toda la cola de demanda. */
const cartera = (e: Estado): number => e.pedidos.filter((p) => !p.terminado).reduce((s, p) => s + p.cantidad - p.producido, 0);

/** Velocidad aleatoria (semilla propia) por línea y ciclo. */
function aleatoria(semilla: number): Estrategia {
  let estado = semilla >>> 0;
  const velocidades: Velocidad[] = ['baja', 'estandar', 'alta'];
  return (e) =>
    planificar(e, () => {
      const [r, s] = siguienteAleatorio(estado);
      estado = s;
      return velocidades[Math.floor(r * velocidades.length)];
    });
}

export const ESTRATEGIAS: Record<string, (semilla: number) => Estrategia> = {
  'todo-estandar': () => fija('estandar'),
  'todo-alta': () => fija('alta'),
  'todo-baja': () => fija('baja'),
  aleatorio: aleatoria,
  /** Estándar por defecto; Alta en todas las líneas cuando la cartera supera lo que 4 líneas estándar hacen en 3 ciclos. */
  adaptativo: () => (e) => planificar(e, () => (cartera(e) > 600 ? 'alta' : 'estandar')),
  /** Dos líneas siempre en Alta y dos en Estándar. */
  'mixto-2alta': () => (e) => planificar(e, (_, id) => (id <= 2 ? 'alta' : 'estandar')),
  /** Como adaptativo-fino, pero cuida la Productividad: se frena si está baja para recuperarla en Estándar. */
  gestor: () => (e) => {
    const pedidas = Math.min(BALANCE.numLineas, Math.max(0, Math.floor((cartera(e) - 300) / 150)));
    const p = e.okr.productividad;
    const k = p < 35 ? 0 : p < 65 ? Math.min(pedidas, 1) : pedidas;
    return planificar(e, (_, id) => (id <= k ? 'alta' : 'estandar'));
  },
  /** Sube a Alta tantas líneas como pida la cartera (una más por cada 150 botellas sobre 300). */
  'adaptativo-fino': () => (e) => {
    const k = Math.min(BALANCE.numLineas, Math.max(0, Math.floor((cartera(e) - 300) / 150)));
    return planificar(e, (_, id) => (id <= k ? 'alta' : 'estandar'));
  },
};

/** Nombres para mostrar en la interfaz. El orden es el del selector de piloto. */
export const NOMBRES_ESTRATEGIA: Record<string, string> = {
  gestor: 'Gestor',
  'adaptativo-fino': 'Adaptativo fino',
  adaptativo: 'Adaptativo',
  'mixto-2alta': 'Mixto (2 líneas en Alta)',
  'todo-estandar': 'Todo Estándar',
  'todo-alta': 'Todo Alta',
  'todo-baja': 'Todo Baja',
  aleatorio: 'Aleatorio',
};
