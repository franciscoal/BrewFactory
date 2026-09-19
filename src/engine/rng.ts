/** Mulberry32: devuelve [valor en [0,1), nuevo estado]. Determinista y serializable. */
export function siguienteAleatorio(estado: number): [number, number] {
  const a = (estado + 0x6d2b79f5) >>> 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, a];
}
