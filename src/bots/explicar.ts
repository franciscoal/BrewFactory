import type { Acciones, Estado } from '../engine';

const plural = (n: number, singular: string, pl: string): string => `${n} ${n === 1 ? singular : pl}`;

/** Frase corta que resume por qué un bot ha configurado la fábrica así (se muestra como «razonamiento»). */
export function explicarPlan(estado: Estado, acciones: Acciones, nombre: string): string {
  const pendientes = estado.pedidos.filter((p) => !p.terminado);
  const cartera = pendientes.reduce((s, p) => s + p.cantidad - p.producido, 0);
  const activas = acciones.lineas.filter((l) => l.encendida && l.actual);
  const cuenta = (v: string) => activas.filter((l) => l.velocidad === v).length;

  const partes = [`${nombre}: cartera de ${cartera} botellas`];
  const velocidades = [
    [cuenta('alta'), 'en Alta'],
    [cuenta('estandar'), 'en Estándar'],
    [cuenta('baja'), 'en Baja'],
  ] as const;
  const reparto = velocidades.filter(([n]) => n > 0).map(([n, v]) => `${plural(n, 'línea', 'líneas')} ${v}`);
  partes.push(reparto.length > 0 ? reparto.join(', ') : 'ninguna línea con pedido');

  const urgente = [...pendientes].sort((a, b) => a.contador - b.contador)[0];
  if (urgente) {
    partes.push(
      urgente.contador < 0
        ? `${urgente.id} va con retraso (${-urgente.contador} ${-urgente.contador === 1 ? 'ciclo' : 'ciclos'})`
        : `${urgente.id} es el más urgente (vence en ${urgente.contador} ${urgente.contador === 1 ? 'ciclo' : 'ciclos'})`,
    );
  }
  const expedidos = acciones.muelles.filter((m): m is string => m !== null);
  if (expedidos.length > 0) partes.push(`expide ${expedidos.join(' y ')}`);
  return `${partes.join('; ')}.`;
}
