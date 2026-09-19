import { describe, expect, it } from 'vitest';
import { BALANCE } from './balance';

describe('BALANCE', () => {
  it('los pesos de rentabilidad suman 1', () => {
    const { cumplimiento, productividad, entrega } = BALANCE.pesosRentabilidad;
    expect(cumplimiento + productividad + entrega).toBeCloseTo(1);
  });

  it('los tramos de retraso van de menos a más severo', () => {
    const p = BALANCE.entrega.tramosRetraso.map((t) => t.penalizacion);
    expect(p).toEqual([...p].sort((a, b) => b - a));
  });
});
