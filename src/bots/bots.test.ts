import { describe, expect, it } from 'vitest';
import { ESCENARIOS } from '../escenarios';
import { ESTRATEGIAS } from './estrategias';
import { jugar, resumir } from './simulador';

describe('bots', () => {
  it('todas las estrategias juegan partidas completas con OKR dentro de rango', () => {
    for (const [nombre, crear] of Object.entries(ESTRATEGIAS)) {
      for (let semilla = 1; semilla <= 5; semilla++) {
        const r = jugar(crear(semilla), { ciclos: 30, semilla });
        expect(r.ciclos, nombre).toBe(30);
        for (const v of Object.values(r.okrFinal)) {
          expect(v, nombre).toBeGreaterThanOrEqual(0);
          expect(v, nombre).toBeLessThanOrEqual(100);
        }
      }
    }
  });

  it('las partidas son deterministas', () => {
    for (const [nombre, crear] of Object.entries(ESTRATEGIAS)) {
      expect(jugar(crear(3), { ciclos: 20, semilla: 3 }), nombre).toEqual(jugar(crear(3), { ciclos: 20, semilla: 3 }));
    }
  });

  it('funcionan con los escenarios enlatados', () => {
    for (const escenario of ESCENARIOS) {
      const r = jugar(ESTRATEGIAS['adaptativo'](1), { ciclos: 20, escenario });
      expect(r.mediaRentabilidad).toBeGreaterThan(0);
    }
  });

  it('jugar a velocidad Baja es peor que jugar en Estándar', () => {
    const media = (nombre: string) =>
      resumir(Array.from({ length: 20 }, (_, i) => jugar(ESTRATEGIAS[nombre](i + 1), { ciclos: 30, semilla: i + 1 }))).rentabilidadMedia;
    expect(media('todo-estandar')).toBeGreaterThan(media('todo-baja'));
  });
});
