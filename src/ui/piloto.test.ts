import { describe, expect, it } from 'vitest';
import { ESTRATEGIAS } from '../bots/estrategias';
import { explicarPlan } from '../bots/explicar';
import { usarBalanceOriginal } from '../engine/testing';
import { juegoNuevo, resolver } from './juego';
import { decidirPiloto } from './piloto';

usarBalanceOriginal();

describe('piloto automático', () => {
  it('el bot configura las líneas, deja un razonamiento y no resuelve el ciclo', () => {
    const j = juegoNuevo(3);
    const r = decidirPiloto(j, ESTRATEGIAS.gestor(3), 'Gestor');
    expect(r.juego.decididoEn).toBe(0);
    expect(r.juego.estado.ciclo).toBe(0);
    expect(r.juego.plan.lineas.every((l) => l.actual !== null)).toBe(true);
    expect(r.juego.comentarioIA).toMatch(/^Gestor: cartera de \d+ botellas/);
    expect(r.cambios.lineas).toHaveLength(4);
    expect(r.juego.erroresAcciones).toEqual([]);
  });

  it('el razonamiento resume velocidades, el pedido más urgente y las expediciones', () => {
    const j = juegoNuevo(3);
    const acciones = {
      lineas: [
        { id: 1, encendida: true, velocidad: 'alta' as const, actual: 'P-1', siguiente: null },
        { id: 2, encendida: true, velocidad: 'estandar' as const, actual: 'P-2', siguiente: null },
        { id: 3, encendida: true, velocidad: 'estandar' as const, actual: 'P-3', siguiente: null },
        { id: 4, encendida: false, velocidad: 'estandar' as const, actual: null, siguiente: null },
      ],
      muelles: ['P-9', null],
    };
    const texto = explicarPlan(j.estado, acciones, 'Prueba');
    expect(texto).toContain('1 línea en Alta');
    expect(texto).toContain('2 líneas en Estándar');
    expect(texto).toContain('es el más urgente');
    expect(texto).toContain('expide P-9');
  });

  it('jugando ciclo a ciclo solo, el gestor mantiene una rentabilidad alta y nunca descarta acciones', () => {
    let j = juegoNuevo(5);
    const bot = ESTRATEGIAS.gestor(5);
    for (let i = 0; i < 30; i++) {
      j = decidirPiloto(j, bot, 'Gestor').juego;
      j = resolver(j);
      expect(j.errores).toEqual([]);
    }
    expect(j.estado.ciclo).toBe(30);
    expect(j.estado.okr.rentabilidad).toBeGreaterThan(50);
  });

  it('cada bot puede pilotar una partida entera', () => {
    for (const [nombre, crear] of Object.entries(ESTRATEGIAS)) {
      let j = juegoNuevo(7);
      const bot = crear(7);
      for (let i = 0; i < 10; i++) j = resolver(decidirPiloto(j, bot, nombre).juego);
      expect(j.estado.ciclo, nombre).toBe(10);
    }
  });
});
