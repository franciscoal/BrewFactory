import { describe, expect, it } from 'vitest';
import original from '../config/balance-original.json';
import { aplicarBalance, BALANCE, BALANCE_POR_DEFECTO, validarBalance } from './balance';
import type { Balance } from './balance';
import { intensidadDemanda } from './demanda';
import { reglasIA } from './ia';

const clonar = (): Balance => structuredClone(BALANCE_POR_DEFECTO);

describe('balance', () => {
  it('la configuración por defecto y la original son válidas', () => {
    expect(validarBalance(BALANCE_POR_DEFECTO)).toEqual({ balance: BALANCE_POR_DEFECTO });
    expect('balance' in validarBalance(original)).toBe(true);
  });

  it('los pesos de rentabilidad deben sumar 1', () => {
    const b = clonar();
    b.pesosRentabilidad.entrega = 0.5;
    expect(validarBalance(b)).toEqual({ error: expect.stringContaining('sumar 1') });
  });

  it('los campos ausentes toman el valor por defecto y los no numéricos se rechazan', () => {
    const r = validarBalance({ entrega: { aTiempo: 15 } });
    if (!('balance' in r)) throw new Error(r.error);
    expect(r.balance.entrega.aTiempo).toBe(15);
    expect(r.balance.entrega.retrasoLeve).toBe(BALANCE_POR_DEFECTO.entrega.retrasoLeve);
    expect(validarBalance({ entrega: { aTiempo: 'mucho' } })).toEqual({ error: expect.stringContaining('entrega.aTiempo') });
  });

  it('rechaza configuraciones incoherentes', () => {
    const b = clonar();
    b.demanda.cantidadMin = 500;
    expect(validarBalance(b)).toEqual({ error: expect.stringContaining('cantidad mínima') });
    const c = clonar();
    c.demanda.oleadaAmplitud = 1.5;
    expect(validarBalance(c)).toEqual({ error: expect.stringContaining('amplitud') });
  });

  it('las reglas para la IA se generan con las cifras en uso', () => {
    const guardado = structuredClone(BALANCE);
    try {
      const b = clonar();
      b.velocidades.alta.productividad = -9;
      b.entrega.aTiempo = 33;
      aplicarBalance(b);
      const texto = reglasIA().join('\n');
      expect(texto).toContain('alta (100, -9)');
      expect(texto).toContain('Entrega: +33');
    } finally {
      aplicarBalance(guardado);
    }
  });

  it('la oleada de demanda modula la intensidad y mantiene la media', () => {
    const guardado = structuredClone(BALANCE);
    try {
      const b = clonar();
      b.demanda.oleadaPeriodo = 16;
      b.demanda.oleadaAmplitud = 0.8;
      aplicarBalance(b);
      const valores = Array.from({ length: 16 }, (_, c) => intensidadDemanda(5, c + 1));
      expect(Math.max(...valores)).toBeGreaterThan(1.6);
      expect(Math.min(...valores)).toBeLessThan(0.4);
      expect(valores.reduce((s, v) => s + v, 0) / 16).toBeCloseTo(1, 5);
      b.demanda.oleadaAmplitud = 0;
      aplicarBalance(b);
      expect(intensidadDemanda(5, 3)).toBe(1);
    } finally {
      aplicarBalance(guardado);
    }
  });

  it('aplicarBalance sustituye los valores en uso en caliente', () => {
    const guardado = structuredClone(BALANCE);
    try {
      const b = clonar();
      b.velocidades.alta.botellas = 123;
      aplicarBalance(b);
      expect(BALANCE.velocidades.alta.botellas).toBe(123);
    } finally {
      aplicarBalance(guardado);
    }
    expect(BALANCE.velocidades.alta.botellas).toBe(guardado.velocidades.alta.botellas);
  });
});
