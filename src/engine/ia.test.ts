import { describe, expect, it } from 'vitest';
import { usarBalanceOriginal } from './testing';
import { estadoInicial, estadoParaIA, parsearAcciones, step } from './index';

usarBalanceOriginal();
describe('estadoParaIA', () => {
  it('es serializable e incluye reglas, pedidos, líneas y muelles', () => {
    const e = estadoInicial(3);
    const ia = estadoParaIA(e, ['aviso']);
    const copia = JSON.parse(JSON.stringify(ia));
    expect(copia).toEqual(ia);
    expect(ia.reglas.length).toBeGreaterThan(5);
    expect(ia.pedidos).toHaveLength(6);
    expect(ia.pedidos.every((p) => p.estado === 'pendiente')).toBe(true);
    expect(ia.lineas).toHaveLength(4);
    expect(ia.muelles.map((m) => m.activo)).toEqual([true, false]);
    expect(ia.erroresCicloAnterior).toEqual(['aviso']);
  });

  it('el formato de acciones que se muestra es parseable', () => {
    const e = estadoInicial(3);
    const r = parsearAcciones(JSON.stringify(estadoParaIA(e).formatoAcciones), e);
    expect('acciones' in r).toBe(true);
  });
});

describe('parsearAcciones', () => {
  const e = estadoInicial(3);

  it('acepta el objeto directo o envuelto en "acciones"', () => {
    const json = { comentario: 'hola', lineas: [{ id: 1, encendida: true, velocidad: 'alta', actual: 'P-1', siguiente: null }], muelles: [null, null] };
    for (const texto of [JSON.stringify(json), JSON.stringify({ acciones: json })]) {
      const r = parsearAcciones(texto, e);
      expect(r).toEqual({ acciones: expect.objectContaining({ comentario: 'hola' }) });
    }
  });

  it('los campos ausentes conservan el valor actual y null vacía el hueco', () => {
    const base = structuredClone(e);
    base.lineas[0].actual = 'P-1';
    base.lineas[0].siguiente = 'P-2';
    const r = parsearAcciones(JSON.stringify({ lineas: [{ id: 1, velocidad: 'baja', siguiente: null }] }), base);
    if (!('acciones' in r)) throw new Error(r.error);
    expect(r.acciones.lineas[0]).toEqual({ id: 1, encendida: true, velocidad: 'baja', actual: 'P-1', siguiente: null });
  });

  it('rechaza JSON inválido y estructuras incorrectas con mensajes legibles', () => {
    expect(parsearAcciones('esto no es json', e)).toEqual({ error: expect.stringContaining('JSON válido') });
    expect(parsearAcciones('{}', e)).toEqual({ error: expect.stringContaining('lineas') });
    expect(parsearAcciones('{"lineas":[{"encendida":true}]}', e)).toEqual({ error: expect.stringContaining('id') });
    expect(parsearAcciones('{"lineas":[{"id":1,"actual":5}]}', e)).toEqual({ error: expect.stringContaining('actual') });
  });

  it('las acciones parseadas se pueden ejecutar en step', () => {
    const r = parsearAcciones(JSON.stringify({ lineas: [{ id: 1, actual: 'P-1' }, { id: 2, actual: 'NO-EXISTE' }] }), e);
    if (!('acciones' in r)) throw new Error(r.error);
    const res = step(e, r.acciones);
    expect(res.estado.pedidos.find((p) => p.id === 'P-1')!.producido).toBe(50);
    expect(res.errores).toEqual(['Línea 2: el pedido NO-EXISTE no existe. Se ignora.']);
  });
});