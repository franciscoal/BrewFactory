import { describe, expect, it } from 'vitest';
import { estadoInicial, step } from './index';
import type { Acciones, Estado, Pedido } from './index';

function pedido(id: string, cantidad: number, extra: Partial<Pedido> = {}): Pedido {
  return {
    id,
    cantidad,
    producido: 0,
    ciclosEntregaIniciales: 5,
    contador: 5,
    terminado: false,
    terminadoEnCiclo: null,
    ...extra,
  };
}

/** Estado controlado: sin demanda aleatoria inicial y OKR en 50 para ver deltas sin topes. */
function base(pedidos: Pedido[]): Estado {
  const e = estadoInicial(7);
  e.pedidos = pedidos;
  e.okr = { cumplimiento: 50, productividad: 50, entrega: 50, rentabilidad: 50 };
  return e;
}

const acc = (lineas: Partial<Acciones['lineas'][number]>[], muelles: Acciones['muelles'] = [null, null]): Acciones => ({
  lineas: lineas.map((l) => ({ encendida: true, velocidad: 'estandar', actual: null, siguiente: null, ...l }) as Acciones['lineas'][number]),
  muelles,
});

const get = (e: Estado, id: string) => e.pedidos.find((p) => p.id === id)!;

describe('estado inicial', () => {
  it('arranca al 100 % con 6 pedidos y líneas apagadas', () => {
    const e = estadoInicial(1);
    expect(e.okr).toEqual({ cumplimiento: 100, productividad: 100, entrega: 100, rentabilidad: 100 });
    expect(e.pedidos).toHaveLength(6);
    expect(e.lineas.every((l) => !l.encendida)).toBe(true);
  });

  it('es determinista con la misma semilla', () => {
    expect(estadoInicial(42)).toEqual(estadoInicial(42));
    expect(step(estadoInicial(42)).estado).toEqual(step(estadoInicial(42)).estado);
  });

  it('step no muta el estado previo', () => {
    const e = estadoInicial(3);
    const copia = structuredClone(e);
    step(e, acc([{ id: 1, actual: 'P-1' }]));
    expect(e).toEqual(copia);
  });
});

describe('producción', () => {
  it('cada velocidad produce su cantidad', () => {
    const e = base([pedido('A', 500), pedido('B', 500), pedido('C', 500)]);
    const r = step(
      e,
      acc([
        { id: 1, velocidad: 'baja', actual: 'A' },
        { id: 2, velocidad: 'estandar', actual: 'B' },
        { id: 3, velocidad: 'alta', actual: 'C' },
      ]),
    ).estado;
    expect([get(r, 'A').producido, get(r, 'B').producido, get(r, 'C').producido]).toEqual([25, 50, 100]);
  });

  it('el sobrante pasa al pedido siguiente', () => {
    const e = base([pedido('A', 25), pedido('B', 500)]);
    const r = step(e, acc([{ id: 1, velocidad: 'alta', actual: 'A', siguiente: 'B' }])).estado;
    expect(get(r, 'A').terminado).toBe(true);
    expect(get(r, 'B').producido).toBe(75);
    expect(r.lineas[0]).toMatchObject({ actual: 'B', siguiente: null });
  });

  it('el sobrante se pierde si no hay pedido siguiente y la línea queda inactiva', () => {
    const e = base([pedido('A', 25)]);
    const r = step(e, acc([{ id: 1, velocidad: 'alta', actual: 'A' }])).estado;
    expect(get(r, 'A').producido).toBe(25);
    expect(r.lineas[0].actual).toBeNull();
  });

  it('un pedido multilínea: solo la primera línea lo completa y las otras pasan a su siguiente', () => {
    const e = base([pedido('A', 60), pedido('B', 500), pedido('C', 500)]);
    const r = step(
      e,
      acc([
        { id: 1, actual: 'A', siguiente: 'B' },
        { id: 2, actual: 'A', siguiente: 'C' },
      ]),
    ).estado;
    expect(get(r, 'A').producido).toBe(60);
    expect(get(r, 'B').producido).toBe(0);
    expect(get(r, 'C').producido).toBe(40);
    expect(r.lineas[0]).toMatchObject({ actual: 'B' });
    expect(r.lineas[1]).toMatchObject({ actual: 'C' });
  });

  it('un pedido terminado se libera del siguiente de otra línea', () => {
    const e = base([pedido('A', 50), pedido('B', 500)]);
    const r = step(
      e,
      acc([
        { id: 1, actual: 'A' },
        { id: 2, actual: 'B', siguiente: 'A' },
      ]),
    ).estado;
    expect(r.lineas[1]).toMatchObject({ actual: 'B', siguiente: null });
  });
});

describe('línea apagada', () => {
  it('libera sus pedidos y penaliza el incompleto en stock que queda sin línea', () => {
    const e = base([pedido('A', 500, { producido: 50 })]);
    e.lineas[0] = { id: 1, encendida: true, velocidad: 'estandar', actual: 'A', siguiente: null };
    const r = step(e, acc([{ id: 1, encendida: false }])).estado;
    expect(r.lineas[0]).toMatchObject({ encendida: false, actual: null, siguiente: null });
    expect(get(r, 'A').producido).toBe(50);
    expect(r.okr.productividad).toBe(45);
  });

  it('avisa si se le asignan pedidos estando apagada', () => {
    const e = base([pedido('A', 500)]);
    const r = step(e, acc([{ id: 1, encendida: false, actual: 'A' }]));
    expect(r.errores).toHaveLength(1);
    expect(r.estado.lineas[0].actual).toBeNull();
  });
});

describe('Cumplimiento', () => {
  it('+5 % por pedido en producción a tiempo y −5 % por pedido en retraso', () => {
    const e = base([pedido('A', 500), pedido('B', 500), pedido('C', 500, { contador: -1 })]);
    const r = step(e, acc([{ id: 1, actual: 'A' }, { id: 2, actual: 'B' }])).estado;
    expect(r.okr.cumplimiento).toBe(55);
  });

  it('un pedido «siguiente» no cuenta como en producción', () => {
    const e = base([pedido('A', 500), pedido('B', 500)]);
    const r = step(e, acc([{ id: 1, actual: 'A', siguiente: 'B' }])).estado;
    expect(r.okr.cumplimiento).toBe(55);
  });

  it('−20 % si no hay demanda en la cola', () => {
    const r = step(base([])).estado;
    expect(r.okr.cumplimiento).toBe(30);
  });

  it('un pedido tardío terminado no penaliza en Cumplimiento', () => {
    const e = base([pedido('T', 50, { producido: 50, terminado: true, contador: -2 }), pedido('A', 500)]);
    const r = step(e).estado;
    expect(r.okr.cumplimiento).toBe(50);
  });
});

describe('Productividad', () => {
  it('suma o resta según velocidad de cada línea activa', () => {
    const e = base([pedido('A', 500), pedido('B', 500), pedido('C', 500)]);
    const r = step(
      e,
      acc([
        { id: 1, velocidad: 'estandar', actual: 'A' },
        { id: 2, velocidad: 'alta', actual: 'B' },
        { id: 3, velocidad: 'baja', actual: 'C' },
      ]),
    ).estado;
    expect(r.okr.productividad).toBe(50 + 5 - 3 - 5);
  });

  it('−20 % si hay demanda, no hay stock y no hay pedidos activos', () => {
    const r = step(base([pedido('A', 500)])).estado;
    expect(r.okr.productividad).toBe(30);
  });

  it('se limita a 0–100', () => {
    const e = estadoInicial(1);
    const r = step(e, acc([{ id: 1, actual: 'P-1' }, { id: 2, actual: 'P-2' }])).estado;
    expect(r.okr.productividad).toBe(100);
  });
});

describe('expediciones y Entrega', () => {
  const terminado = (id: string, contador: number) => pedido(id, 50, { producido: 50, terminado: true, terminadoEnCiclo: 1, contador });

  it('un pedido a tiempo se expide, desaparece del stock y bonifica +10 %', () => {
    const e = base([terminado('T', 2)]);
    const r = step(e, acc([], ['T', null])).estado;
    expect(r.pedidos.some((p) => p.id === 'T')).toBe(false);
    expect(r.muelles).toEqual([null, null]);
    expect(r.okr.entrega).toBe(60);
  });

  it('un pedido entregado con retraso ni bonifica ni penaliza', () => {
    const e = base([terminado('T', -1)]);
    expect(step(e, acc([], ['T', null])).estado.okr.entrega).toBe(50);
  });

  it('un pedido completado este ciclo no puede expedirse en el mismo ciclo', () => {
    const e = base([pedido('A', 50)]);
    const r = step(e, acc([{ id: 1, actual: 'A' }], ['A', null]));
    expect(r.errores.some((m) => m.includes('no está terminado'))).toBe(true);
    expect(get(r.estado, 'A').terminado).toBe(true);
  });

  it('tramos de retraso en el stock: [-3,0) −5 %, [-10,-3) −10 %, <-10 −20 %', () => {
    const casos: [number, number][] = [[-1, -5], [-3, -5], [-4, -10], [-10, -10], [-11, -20]];
    for (const [contador, delta] of casos) {
      const e = base([terminado('T', contador), terminado('X', 1)]);
      // X ocupa el muelle 1 (+10); muelle 2 inactivo, así que no hay «muelle libre».
      const r = step(e, acc([], ['X', null])).estado;
      expect(r.okr.entrega).toBe(50 + 10 + delta - 5);
    }
  });

  it('−5 % por pedido terminado sin expedir; −15 % si había muelle libre', () => {
    const e = base([terminado('T', 3)]);
    expect(step(e).estado.okr.entrega).toBe(50 - 15);
    const conMuelleOcupado = base([terminado('T', 3), terminado('U', 3)]);
    expect(step(conMuelleOcupado, acc([], ['T', null])).estado.okr.entrega).toBe(50 + 10 - 5);
  });

  it('muelle 2 inactivo con menos de 3 líneas: se descarta y se avisa', () => {
    const e = base([terminado('T', 3)]);
    const r = step(e, acc([], [null, 'T']));
    expect(r.errores.some((m) => m.includes('Muelle 2'))).toBe(true);
    expect(r.estado.pedidos.some((p) => p.id === 'T')).toBe(true);
  });

  it('muelle 2 activo con 3 líneas activas', () => {
    const e = base([terminado('T', 3), pedido('A', 500), pedido('B', 500), pedido('C', 500)]);
    const r = step(e, acc([{ id: 1, actual: 'A' }, { id: 2, actual: 'B' }, { id: 3, actual: 'C' }], [null, 'T']));
    expect(r.errores).toEqual([]);
    expect(r.estado.pedidos.some((p) => p.id === 'T')).toBe(false);
  });

  it('el pedido no puede estar en dos muelles', () => {
    const e = base([terminado('T', 3), pedido('A', 500), pedido('B', 500), pedido('C', 500)]);
    const r = step(e, acc([{ id: 1, actual: 'A' }, { id: 2, actual: 'B' }, { id: 3, actual: 'C' }], ['T', 'T']));
    expect(r.errores).toHaveLength(1);
  });
});

describe('ciclo', () => {
  it('decrementa los contadores, avanza el ciclo y registra el historial', () => {
    const e = base([pedido('A', 500)]);
    const r = step(e).estado;
    expect(get(r, 'A').contador).toBe(4);
    expect(r.ciclo).toBe(1);
    expect(r.historial).toHaveLength(1);
    expect(r.historial[0].okr).toEqual(r.okr);
  });

  it('rentabilidad = 0.25·C + 0.5·P + 0.25·E', () => {
    const e = base([pedido('A', 500)]);
    e.okr = { cumplimiento: 100, productividad: 100, entrega: 100, rentabilidad: 100 };
    const r = step(e, acc([{ id: 1, actual: 'A' }])).estado;
    const { cumplimiento: c, productividad: p, entrega: en, rentabilidad } = r.okr;
    expect(rentabilidad).toBeCloseTo(0.25 * c + 0.5 * p + 0.25 * en);
  });

  it('genera demanda nueva de forma determinista', () => {
    let e = estadoInicial(5);
    for (let i = 0; i < 10; i++) e = step(e).estado;
    expect(e.pedidos.length).toBeGreaterThan(6);
  });
});

describe('acciones no permitidas', () => {
  it('descarta solo la acción inválida y aplica el resto', () => {
    const e = base([pedido('A', 500)]);
    const r = step(e, acc([{ id: 1, actual: 'ZZ' }, { id: 2, velocidad: 'alta', actual: 'A' }]));
    expect(r.errores).toEqual(['Línea 1: el pedido ZZ no existe. Se ignora.']);
    expect(get(r.estado, 'A').producido).toBe(100);
  });

  it('el mismo pedido no puede ser actual y siguiente de una línea', () => {
    const e = base([pedido('A', 500)]);
    const r = step(e, acc([{ id: 1, actual: 'A', siguiente: 'A' }]));
    expect(r.errores).toHaveLength(1);
    expect(r.estado.lineas[0].siguiente).toBeNull();
  });

  it('si solo se da siguiente en una línea vacía, pasa a actual', () => {
    const e = base([pedido('A', 500)]);
    expect(step(e, acc([{ id: 1, siguiente: 'A' }])).estado.lineas[0].actual).toBe('A');
  });
});
