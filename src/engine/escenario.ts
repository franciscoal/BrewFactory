import type { Escenario } from './types';

export type ResultadoEscenario = { escenario: Escenario } | { error: string };

function pedidosValidos(v: unknown, donde: string): string | null {
  if (!Array.isArray(v)) return `${donde}: debe ser una lista de pedidos.`;
  for (const [i, p] of v.entries()) {
    const o = p as { cantidad?: unknown; ciclosEntrega?: unknown } | null;
    if (!o || !Number.isInteger(o.cantidad) || (o.cantidad as number) <= 0) return `${donde}[${i}]: "cantidad" debe ser un entero positivo.`;
    if (!Number.isInteger(o.ciclosEntrega)) return `${donde}[${i}]: "ciclosEntrega" debe ser un entero.`;
  }
  return null;
}

/** Valida un escenario «enlatado» leído de JSON. */
export function parsearEscenario(texto: string): ResultadoEscenario {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch (err) {
    return { error: `El texto no es JSON válido: ${(err as Error).message}` };
  }
  const o = json as Partial<Escenario> | null;
  if (!o || typeof o !== 'object') return { error: 'Se esperaba un objeto JSON.' };
  if (typeof o.nombre !== 'string' || o.nombre === '') return { error: 'Falta "nombre".' };
  const errIniciales = pedidosValidos(o.pedidosIniciales, 'pedidosIniciales');
  if (errIniciales) return { error: errIniciales };
  if (!Array.isArray(o.llegadas)) return { error: '"llegadas" debe ser una lista.' };
  for (const [i, l] of o.llegadas.entries()) {
    if (!l || !Number.isInteger(l.ciclo) || l.ciclo < 1) return { error: `llegadas[${i}]: "ciclo" debe ser un entero desde 1.` };
    const err = pedidosValidos(l.pedidos, `llegadas[${i}].pedidos`);
    if (err) return { error: err };
  }
  return {
    escenario: {
      nombre: o.nombre,
      descripcion: typeof o.descripcion === 'string' ? o.descripcion : '',
      semilla: Number.isInteger(o.semilla) ? (o.semilla as number) : 1,
      pedidosIniciales: o.pedidosIniciales!,
      llegadas: o.llegadas,
      aleatoriaTrasGuion: o.aleatoriaTrasGuion === true,
    },
  };
}
