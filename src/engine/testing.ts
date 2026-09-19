import { afterAll, beforeAll } from 'vitest';
import original from '../config/balance-original.json';
import { aplicarBalance, BALANCE } from './balance';
import type { Balance } from './balance';

/** Los tests comprueban las reglas con los valores originales de la especificación, no con el balance en ajuste. */
export function usarBalanceOriginal(): void {
  let guardado: Balance;
  beforeAll(() => {
    guardado = structuredClone(BALANCE);
    aplicarBalance(original as Balance);
  });
  afterAll(() => aplicarBalance(guardado));
}
