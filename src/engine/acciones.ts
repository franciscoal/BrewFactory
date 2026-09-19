import { BALANCE } from './balance';
import { muelleActivo } from './derivados';
import type { Acciones, Estado, PedidoId } from './types';

/**
 * Valida y aplica unas acciones declarativas sobre `e` (muta `e`).
 * Descarta solo las acciones no permitidas y devuelve un mensaje legible por cada una.
 */
export function aplicarAcciones(e: Estado, a: Acciones): string[] {
  const errores: string[] = [];
  const porId = new Map(e.pedidos.map((p) => [p.id, p]));

  for (const la of a.lineas) {
    const linea = e.lineas.find((l) => l.id === la.id);
    if (!linea) {
      errores.push(`Línea ${la.id}: no existe. Se ignora.`);
      continue;
    }
    if (la.velocidad in BALANCE.velocidades) linea.velocidad = la.velocidad;
    else errores.push(`Línea ${la.id}: la velocidad "${la.velocidad}" no existe. Se mantiene ${linea.velocidad}.`);

    if (!la.encendida) {
      if (la.actual || la.siguiente) errores.push(`Línea ${la.id}: está apagada y no admite pedidos. Se liberan.`);
      linea.encendida = false;
      linea.actual = null;
      linea.siguiente = null;
      continue;
    }
    linea.encendida = true;

    // undefined = acción descartada (se conserva el valor anterior)
    const resolver = (id: PedidoId | null): PedidoId | null | undefined => {
      if (id === null) return null;
      const p = porId.get(id);
      if (!p) {
        errores.push(`Línea ${la.id}: el pedido ${id} no existe. Se ignora.`);
        return undefined;
      }
      if (p.terminado) {
        errores.push(`Línea ${la.id}: el pedido ${id} ya está terminado. Se ignora.`);
        return undefined;
      }
      return id;
    };
    const actual = resolver(la.actual);
    const siguiente = resolver(la.siguiente);
    let nuevoActual = actual === undefined ? linea.actual : actual;
    let nuevoSiguiente = siguiente === undefined ? linea.siguiente : siguiente;

    if (nuevoActual !== null && nuevoActual === nuevoSiguiente) {
      errores.push(`Línea ${la.id}: el pedido ${nuevoActual} no puede ser actual y siguiente a la vez. Se ignora el siguiente.`);
      nuevoSiguiente = null;
    }
    if (nuevoActual === null && nuevoSiguiente !== null) {
      nuevoActual = nuevoSiguiente;
      nuevoSiguiente = null;
    }
    linea.actual = nuevoActual;
    linea.siguiente = nuevoSiguiente;
  }

  // Los muelles se validan tras aplicar las líneas, porque su activación depende de ellas.
  e.muelles.forEach((previo, i) => {
    const pedido = a.muelles[i];
    if (pedido === undefined) return;
    const numero = i + 1;
    if (pedido === null) {
      e.muelles[i] = null;
    } else if (!muelleActivo(e, i)) {
      if (previo !== pedido) errores.push(`Muelle ${numero}: está inactivo. Se ignora.`);
      e.muelles[i] = null;
    } else if (!porId.get(pedido)) {
      errores.push(`Muelle ${numero}: el pedido ${pedido} no existe. Se ignora.`);
      e.muelles[i] = previo;
    } else if (!porId.get(pedido)!.terminado) {
      errores.push(`Muelle ${numero}: el pedido ${pedido} no está terminado. Se ignora.`);
      e.muelles[i] = previo;
    } else if (e.muelles.slice(0, i).includes(pedido)) {
      errores.push(`Muelle ${numero}: el pedido ${pedido} ya está en otro muelle. Se ignora.`);
      e.muelles[i] = previo;
    } else {
      e.muelles[i] = pedido;
    }
  });
  // Una asignación previa en un muelle que ha dejado de estar activo se cancela sin penalización.
  e.muelles.forEach((_, i) => {
    if (!muelleActivo(e, i)) e.muelles[i] = null;
  });

  return errores;
}
