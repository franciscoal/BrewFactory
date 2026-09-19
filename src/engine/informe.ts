import type { Velocidad } from './balance';
import type { Decision, Estado } from './types';

export const NOMBRE_VELOCIDAD: Record<Velocidad, string> = { baja: 'Baja', estandar: 'Estándar', alta: 'Alta' };

/**
 * Compara la configuración del ciclo anterior (`previo`) con la resultante de aplicar las acciones (`e`)
 * y describe lo que decidió el jugador o la IA. Solo hay decisiones si algo cambió.
 */
export function describirDecisiones(previo: Estado, e: Estado): Decision[] {
  const d: Decision[] = [];

  e.lineas.forEach((n, i) => {
    const p = previo.lineas[i];
    const L = `Línea ${n.id}`;

    if (p.encendida !== n.encendida) d.push({ categoria: 'lineas', texto: `${L} ${n.encendida ? 'encendida' : 'apagada'}` });
    if (p.velocidad !== n.velocidad) {
      d.push({ categoria: 'velocidad', texto: `${L}: velocidad ${NOMBRE_VELOCIDAD[p.velocidad]} → ${NOMBRE_VELOCIDAD[n.velocidad]}` });
    }

    const intercambio = p.actual && p.siguiente && n.actual === p.siguiente && n.siguiente === p.actual;
    if (intercambio) {
      d.push({ categoria: 'prioridad', texto: `${L}: ${n.actual} pasa de reserva a activo y ${n.siguiente} de activo a reserva` });
      return;
    }

    if (n.actual !== p.actual) {
      if (n.actual && n.actual === p.siguiente) {
        d.push({ categoria: 'prioridad', texto: `${L}: ${n.actual} pasa de reserva a activo` });
      } else if (n.actual) {
        d.push({ categoria: 'anadidos', texto: `${n.actual} añadido a producción en la ${L.toLowerCase()} (activo)` });
      }
      if (p.actual && p.actual === n.siguiente) {
        d.push({ categoria: 'prioridad', texto: `${L}: ${p.actual} pasa de activo a reserva` });
      } else if (p.actual && p.actual !== n.actual) {
        d.push({ categoria: 'retirados', texto: `${p.actual} retirado de la ${L.toLowerCase()}` });
      }
    }

    if (n.siguiente !== p.siguiente) {
      if (n.siguiente && n.siguiente !== p.actual) {
        d.push({ categoria: 'anadidos', texto: `${n.siguiente} reservado como siguiente en la ${L.toLowerCase()}` });
      }
      if (p.siguiente && p.siguiente !== n.actual && p.siguiente !== n.siguiente) {
        d.push({ categoria: 'retirados', texto: `${p.siguiente} retirado de la reserva de la ${L.toLowerCase()}` });
      }
    }
  });

  e.muelles.forEach((nuevo, i) => {
    const anterior = previo.muelles[i];
    if (nuevo === anterior) return;
    if (nuevo) d.push({ categoria: 'muelles', texto: `${nuevo} asignado al muelle ${i + 1} para expedir` });
    else if (anterior) d.push({ categoria: 'muelles', texto: `Muelle ${i + 1}: se libera ${anterior}` });
  });

  return d;
}
