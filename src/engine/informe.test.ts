import { describe, expect, it } from 'vitest';
import { estadoInicial, step } from './index';
import type { Acciones, Estado, Pedido } from './index';

function pedido(id: string, cantidad: number, extra: Partial<Pedido> = {}): Pedido {
  return { id, cantidad, producido: 0, ciclosEntregaIniciales: 5, contador: 5, terminado: false, terminadoEnCiclo: null, ...extra };
}

function base(pedidos: Pedido[]): Estado {
  const e = estadoInicial(7);
  e.pedidos = pedidos;
  e.okr = { cumplimiento: 50, productividad: 50, entrega: 50, rentabilidad: 50 };
  return e;
}

/** Configuración deseada: por defecto todas las líneas encendidas y vacías. */
function plan(e: Estado, cambios: Record<number, Partial<Acciones['lineas'][number]>> = {}, muelles: Acciones['muelles'] = [null, null]): Acciones {
  return {
    lineas: e.lineas.map((l) => ({ id: l.id, encendida: l.encendida, velocidad: l.velocidad, actual: l.actual, siguiente: l.siguiente, ...cambios[l.id] })),
    muelles,
  };
}

const textos = (e: Estado, categoria: string) => (e.ultimoInforme?.decisiones ?? []).filter((d) => d.categoria === categoria).map((d) => d.texto);

describe('informe de decisiones', () => {
  it('sin cambios no hay decisiones', () => {
    const e = base([pedido('A', 500)]);
    expect(step(e, plan(e)).informe.decisiones).toEqual([]);
  });

  it('pedido añadido como actual y como siguiente', () => {
    const e = base([pedido('A', 500), pedido('B', 500)]);
    const r = step(e, plan(e, { 1: { actual: 'A', siguiente: 'B' } })).estado;
    expect(textos(r, 'anadidos')).toEqual([
      'A añadido a producción en la línea 1 (activo)',
      'B reservado como siguiente en la línea 1',
    ]);
  });

  it('intercambio: cambio de prioridad de activo a reserva', () => {
    const e = base([pedido('A', 500), pedido('B', 500)]);
    e.lineas[0] = { ...e.lineas[0], actual: 'A', siguiente: 'B' };
    const r = step(e, plan(e, { 1: { actual: 'B', siguiente: 'A' } })).estado;
    expect(textos(r, 'prioridad')).toHaveLength(1);
    expect(textos(r, 'prioridad')[0]).toContain('B pasa de reserva a activo');
    expect(textos(r, 'anadidos')).toEqual([]);
    expect(textos(r, 'retirados')).toEqual([]);
  });

  it('pedido retirado de producción al apagar la línea', () => {
    const e = base([pedido('A', 500)]);
    e.lineas[0] = { ...e.lineas[0], actual: 'A' };
    const r = step(e, plan(e, { 1: { encendida: false, actual: null } })).estado;
    expect(textos(r, 'lineas')).toEqual(['Línea 1 apagada']);
    expect(textos(r, 'retirados')).toEqual(['A retirado de la línea 1']);
  });

  it('cambio de velocidad y asignación a muelle', () => {
    const e = base([pedido('T', 50, { producido: 50, terminado: true, terminadoEnCiclo: 1 })]);
    const r = step(e, plan(e, { 2: { velocidad: 'alta' } }, ['T', null])).estado;
    expect(textos(r, 'velocidad')).toEqual(['Línea 2: velocidad Estándar → Alta']);
    expect(textos(r, 'muelles')).toEqual(['T asignado al muelle 1 para expedir']);
  });
});

describe('informe de impacto y sucesos', () => {
  it('cada efecto lleva OKR, porcentaje y causa', () => {
    const e = base([pedido('A', 500)]);
    e.lineas[0] = { ...e.lineas[0], actual: 'A', velocidad: 'baja' };
    const { informe } = step(e, plan(e));
    expect(informe.efectos).toContainEqual({ okr: 'productividad', delta: -5, motivo: 'Línea 1 en velocidad Baja' });
    expect(informe.efectos).toContainEqual({ okr: 'cumplimiento', delta: 5, motivo: 'A en producción a tiempo' });
    expect(informe.antes.productividad).toBe(50);
    expect(informe.despues.productividad).toBe(45);
  });

  it('los efectos de cada OKR suman la variación real cuando no hay tope', () => {
    const e = base([pedido('T', 50, { producido: 50, terminado: true, contador: 2 }), pedido('B', 500, { contador: -2 })]);
    const { informe } = step(e, plan(e, {}, ['T', null]));
    for (const okr of ['cumplimiento', 'productividad', 'entrega'] as const) {
      const neto = informe.efectos.filter((f) => f.okr === okr).reduce((s, f) => s + f.delta, 0);
      expect(informe.despues[okr]).toBe(informe.antes[okr] + neto);
    }
    expect(informe.efectos).toContainEqual({ okr: 'entrega', delta: 10, motivo: 'T expedido a tiempo' });
    expect(informe.efectos).toContainEqual({ okr: 'cumplimiento', delta: -5, motivo: 'B en retraso (2 ciclos)' });
  });

  it('sucesos: producción, completados, expedidos y nueva demanda', () => {
    const e = base([pedido('A', 50), pedido('T', 50, { producido: 50, terminado: true, contador: -1 })]);
    e.lineas[0] = { ...e.lineas[0], actual: 'A' };
    const { informe } = step(e, plan(e, {}, ['T', null]));
    const por = (c: string) => informe.sucesos.filter((s) => s.categoria === c).map((s) => s.texto);
    expect(por('produccion')).toEqual(['Línea 1: +50 botellas en A']);
    expect(por('completados')).toEqual(['A completado: pasa al stock de expediciones']);
    expect(por('expedidos')).toEqual(['T expedido con retraso (1 ciclo), sin bonificación']);
  });

  it('el informe queda en el estado resultante', () => {
    const e = base([pedido('A', 500)]);
    const r = step(e, plan(e));
    expect(r.estado.ultimoInforme).toEqual(r.informe);
    expect(r.informe.ciclo).toBe(1);
  });
});
