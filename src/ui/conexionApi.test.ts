import { describe, expect, it } from 'vitest';
import { usarBalanceOriginal } from '../engine/testing';
import { procesarPendiente } from './conexionApi';
import { juegoNuevo, resolver } from './juego';

usarBalanceOriginal();

describe('procesarPendiente (órdenes de la API)', () => {
  it('aplica unas acciones, devuelve las descartadas y el comentario, y no resuelve el ciclo', () => {
    const j = juegoNuevo(3);
    const texto = JSON.stringify({ comentario: 'a producir', lineas: [{ id: 1, actual: 'P-1' }, { id: 2, actual: 'NO-EXISTE' }] });
    const r = procesarPendiente(j, { id: 7, tipo: 'acciones', texto });
    expect(r.resultado).toEqual({ id: 7, ok: true, ciclo: 0, errores: ['Línea 2: el pedido NO-EXISTE no existe. Se ignora.'], comentario: 'a producir' });
    expect(r.juego.estado.ciclo).toBe(0);
    expect(r.juego.plan.lineas[0].actual).toBe('P-1');
    expect(r.cambios?.lineas).toContain(1);
  });

  it('un paso resuelve un ciclo y devuelve el estado nuevo para la IA', () => {
    const j = juegoNuevo(3);
    const r = procesarPendiente(j, { id: 1, tipo: 'paso' });
    expect(r.resultado.ok).toBe(true);
    expect(r.resultado.ciclo).toBe(1);
    expect(r.resultado.estado).toMatchObject({ juego: 'BrewFactory', ciclo: 1 });
    expect(r.juego.estado.ciclo).toBe(1);
  });

  it('las acciones descartadas se conservan para que la IA las vea tras resolver el ciclo', () => {
    let j = juegoNuevo(3);
    j = procesarPendiente(j, { id: 1, tipo: 'acciones', texto: '{"lineas":[{"id":1,"actual":"ZZ"}]}' }).juego;
    expect(j.erroresAcciones).toHaveLength(1);
    j = resolver(j);
    expect(j.errores).toEqual(['Línea 1: el pedido ZZ no existe. Se ignora.']);
    expect(j.erroresAcciones).toEqual([]);
  });

  it('rechaza JSON inválido, un paso con la partida en marcha y órdenes tras el final', () => {
    const j = juegoNuevo(3);
    expect(procesarPendiente(j, { id: 1, tipo: 'acciones', texto: 'nada' }).resultado).toMatchObject({ ok: false, error: expect.stringContaining('JSON') });
    expect(procesarPendiente({ ...j, fase: 'jugando' }, { id: 2, tipo: 'paso' }).resultado).toMatchObject({ ok: false, error: expect.stringContaining('Pause') });
    expect(procesarPendiente({ ...j, fase: 'terminado' }, { id: 3, tipo: 'paso' }).resultado).toMatchObject({ ok: false, error: 'La partida ha terminado.' });
  });
});
