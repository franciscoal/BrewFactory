import { describe, expect, it } from 'vitest';
import { usarBalanceOriginal } from '../engine/testing';
import { juegoNuevo, resolver } from './juego';
import type { Juego } from './juego';
import { COLUMNAS_DECISIONES, HOJA_DECISIONES, HOJA_REGLAS, SeguimientoPartida, hashTexto, idPartida, mensajeReglas, seguirTransicion } from './registroDecisiones';
import type { Mensaje, MetaRegistro } from './registroDecisiones';

usarBalanceOriginal();

const meta: MetaRegistro = { piloto: 'ia', modo: 'autonomo', modelo: 'gemini-x' };
const ahora = () => new Date('2026-09-20T10:15:30Z');

/** Juega `n` ciclos guardando la partida antes y después de cada uno. */
function jugar(n: number, semilla = 5) {
  let j = juegoNuevo(semilla);
  const pasos: { antes: Juego; despues: Juego }[] = [];
  for (let i = 0; i < n; i++) {
    const antes: Juego = i === 0 ? { ...j, comentarioIA: 'primero asigno P-1', errores: ['aviso previo'] } : j;
    const despues = resolver(antes);
    pasos.push({ antes, despues });
    j = despues;
  }
  return pasos;
}

const filasDe = (m: Mensaje[], hoja: string): Record<string, unknown>[] => m.flatMap((x) => (x.op === 'anadir' && x.hoja === hoja ? x.filas : []));
const actualizaciones = (m: Mensaje[]) => m.filter((x): x is Extract<Mensaje, { op: 'actualizar' }> => x.op === 'actualizar');

const COLUMNAS_DE_RETORNO = ['retorno_3_ciclos', 'retorno_hasta_final', 'rentabilidad_final', 'ciclos_partida'];

describe('registro de decisiones', () => {
  it('cada ciclo produce una fila con estado, acciones y resultado', () => {
    const [{ antes, despues }] = jugar(1);
    const seg = new SeguimientoPartida('P1', ahora);
    const m = seg.registrar(antes, despues, meta);
    const [fila] = filasDe(m, HOJA_DECISIONES);
    expect(Object.keys(fila).sort()).toEqual(COLUMNAS_DECISIONES.filter((c) => !COLUMNAS_DE_RETORNO.includes(c)).sort());
    expect(fila).toMatchObject({
      partida_id: 'P1',
      ciclo: 0,
      piloto: 'ia',
      modo: 'autonomo',
      modelo: 'gemini-x',
      escenario: 'aleatorio',
      semilla: 5,
      razonamiento: 'primero asigno P-1',
      errores_ciclo_anterior: 'aviso previo',
    });
    expect(fila.timestamp).toBe('2026-09-20T10:15:30.000Z');
    const estado = JSON.parse(fila.estado_json as string);
    expect(estado).toMatchObject({ juego: 'BrewFactory', ciclo: 0 });
    expect(estado.reglas).toBeUndefined();
    expect(estado.formatoAcciones).toBeUndefined();
    expect(estado.erroresCicloAnterior).toEqual(['aviso previo']);
    expect(JSON.parse(fila.acciones_json as string).lineas).toHaveLength(4);
    expect(fila.rentabilidad_despues).toBe(Math.round(despues.estado.okr.rentabilidad * 100) / 100);
    expect(JSON.parse(fila.resultado_json as string).okr).toEqual(despues.estado.okr);
  });

  it('las reglas van aparte: una fila por versión (con clave única) que cada decisión referencia por su hash', () => {
    const [{ antes, despues }] = jugar(1);
    const m = new SeguimientoPartida('P1', ahora).registrar(antes, despues, meta);
    expect(m.some((x) => x.op === 'anadir' && x.hoja === HOJA_REGLAS)).toBe(false);
    const regla = mensajeReglas(ahora());
    expect(regla).toMatchObject({ op: 'anadir', hoja: HOJA_REGLAS, unicaPor: 'balance_hash' });
    expect(filasDe([regla], HOJA_REGLAS)[0].balance_hash).toBe(filasDe(m, HOJA_DECISIONES)[0].balance_hash);
    expect(JSON.parse(filasDe([regla], HOJA_REGLAS)[0].reglas_json as string).length).toBeGreaterThan(0);
  });

  it('a los 3 ciclos completa el retorno de la decisión', () => {
    const pasos = jugar(4);
    const seg = new SeguimientoPartida('P1', ahora);
    const todos = pasos.map((p) => seg.registrar(p.antes, p.despues, meta));
    expect(actualizaciones(todos[0])).toHaveLength(0);
    expect(actualizaciones(todos[1])).toHaveLength(0);
    const u = actualizaciones(todos[2]);
    expect(u).toHaveLength(1);
    expect(u[0].filtro).toEqual({ partida_id: 'P1', ciclo: 0 });
    const esperado = pasos[2].despues.estado.okr.rentabilidad - pasos[0].antes.estado.okr.rentabilidad;
    expect(u[0].campos.retorno_3_ciclos).toBeCloseTo(esperado, 2);
    expect(actualizaciones(todos[3])[0].filtro).toEqual({ partida_id: 'P1', ciclo: 1 });
  });

  it('al finalizar rellena el retorno hasta el final en todas las filas', () => {
    const pasos = jugar(3);
    const seg = new SeguimientoPartida('P1', ahora);
    pasos.forEach((p) => seg.registrar(p.antes, p.despues, meta));
    const u = actualizaciones(seg.finalizar());
    expect(u.map((x) => x.filtro.ciclo)).toEqual([0, 1, 2]);
    const final = pasos[2].despues.estado.okr.rentabilidad;
    expect(u[0].campos).toMatchObject({ ciclos_partida: 3 });
    expect(u[2].campos.retorno_hasta_final).toBeCloseTo(final - pasos[2].antes.estado.okr.rentabilidad, 2);
    expect(new SeguimientoPartida('vacía', ahora).finalizar()).toEqual([]);
  });

  it('el texto del modelo viaja tal cual: es el script quien lo fuerza a texto', () => {
    const [{ antes, despues }] = jugar(1);
    const m = new SeguimientoPartida('P1', ahora).registrar({ ...antes, comentarioIA: '=HYPERLINK("http://malo")' }, despues, meta);
    expect(filasDe(m, HOJA_DECISIONES)[0].razonamiento).toBe('=HYPERLINK("http://malo")');
  });
});

describe('seguirTransicion', () => {
  it('registra un ciclo resuelto y cierra la partida cuando termina', () => {
    const j0 = { ...juegoNuevo(9), limitar: true, totalCiclos: 1 };
    const j1 = resolver(j0);
    expect(j1.fase).toBe('terminado');
    const r = seguirTransicion(null, j0, j1, meta, ahora);
    expect(filasDe(r.mensajes, HOJA_DECISIONES)).toHaveLength(1);
    expect(actualizaciones(r.mensajes).some((u) => 'rentabilidad_final' in u.campos)).toBe(true);
    expect(r.seguimiento).toBeNull();
    expect(r.partidaId).toBe('20260920-1015-9');
  });

  it('ignora los cambios que no resuelven un ciclo (editar el plan)', () => {
    const j0 = juegoNuevo(9);
    const r = seguirTransicion(null, j0, { ...j0, comentarioIA: 'x' }, meta, ahora);
    expect(r.mensajes).toEqual([]);
    expect(r.seguimiento).toBeNull();
  });

  it('una partida nueva cierra la anterior', () => {
    const j0 = juegoNuevo(9);
    const j1 = resolver(j0);
    const r1 = seguirTransicion(null, j0, j1, meta, ahora);
    const r2 = seguirTransicion(r1.seguimiento, j1, juegoNuevo(10), meta, ahora);
    expect(actualizaciones(r2.mensajes)).toHaveLength(1);
    expect(r2.seguimiento).toBeNull();
  });

  it('el identificador incluye fecha, hora y semilla', () => {
    expect(idPartida(42, new Date('2026-09-20T10:15:30Z'))).toBe('20260920-1015-42');
  });

  it('el hash es estable y cambia con el contenido', () => {
    expect(hashTexto('a')).toBe(hashTexto('a'));
    expect(hashTexto('a')).not.toBe(hashTexto('b'));
  });
});
