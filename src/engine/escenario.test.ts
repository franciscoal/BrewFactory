import { describe, expect, it } from 'vitest';
import { ESCENARIOS } from '../escenarios';
import { estadoInicial, parsearEscenario, step } from './index';
import type { Escenario } from './index';

const mini: Escenario = {
  nombre: 'mini',
  descripcion: '',
  semilla: 5,
  pedidosIniciales: [{ cantidad: 100, ciclosEntrega: 4 }],
  llegadas: [{ ciclo: 2, pedidos: [{ cantidad: 200, ciclosEntrega: 3 }, { cantidad: 50, ciclosEntrega: 2 }] }],
  aleatoriaTrasGuion: false,
};

describe('escenarios', () => {
  it('crean los pedidos iniciales del guion', () => {
    const e = estadoInicial(99, mini);
    expect(e.semilla).toBe(5);
    expect(e.pedidos.map((p) => [p.id, p.cantidad, p.contador])).toEqual([['P-1', 100, 4]]);
  });

  it('las llegadas ocurren en el ciclo indicado y no antes', () => {
    const e1 = step(estadoInicial(1, mini)).estado;
    expect(e1.pedidos).toHaveLength(1);
    const e2 = step(e1).estado;
    expect(e2.pedidos.map((p) => p.cantidad)).toEqual([100, 200, 50]);
    expect(e2.pedidos[1].contador).toBe(3);
  });

  it('sin aleatoriaTrasGuion no llega más demanda; con ella sí', () => {
    let a = estadoInicial(1, mini);
    let b = estadoInicial(1, { ...mini, aleatoriaTrasGuion: true });
    for (let i = 0; i < 12; i++) {
      a = step(a).estado;
      b = step(b).estado;
    }
    expect(a.pedidos).toHaveLength(3);
    expect(b.pedidos.length).toBeGreaterThan(3);
  });

  it('es determinista', () => {
    const run = () => {
      let e = estadoInicial(1, mini);
      for (let i = 0; i < 6; i++) e = step(e).estado;
      return e;
    };
    expect(run()).toEqual(run());
  });

  it('los escenarios incluidos son válidos', () => {
    expect(ESCENARIOS.length).toBeGreaterThanOrEqual(3);
    for (const esc of ESCENARIOS) {
      const r = parsearEscenario(JSON.stringify(esc));
      expect(r).toEqual({ escenario: esc });
    }
  });
});

describe('parsearEscenario', () => {
  it('rechaza JSON inválido y estructuras incorrectas', () => {
    expect(parsearEscenario('no json')).toEqual({ error: expect.stringContaining('JSON válido') });
    expect(parsearEscenario('{}')).toEqual({ error: expect.stringContaining('nombre') });
    expect(parsearEscenario('{"nombre":"x","pedidosIniciales":[{"cantidad":-1,"ciclosEntrega":2}],"llegadas":[]}')).toEqual({
      error: expect.stringContaining('cantidad'),
    });
    expect(parsearEscenario('{"nombre":"x","pedidosIniciales":[],"llegadas":[{"ciclo":0,"pedidos":[]}]}')).toEqual({
      error: expect.stringContaining('ciclo'),
    });
  });

  it('aplica valores por defecto', () => {
    const r = parsearEscenario('{"nombre":"x","pedidosIniciales":[],"llegadas":[]}');
    expect(r).toEqual({ escenario: { nombre: 'x', descripcion: '', semilla: 1, pedidosIniciales: [], llegadas: [], aleatoriaTrasGuion: false } });
  });
});
