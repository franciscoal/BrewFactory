import { aplicarBalance, validarBalance } from '../engine';
import type { Balance } from '../engine';

/** Lee `config/balance.json` del servidor y lo aplica. Si no está disponible, se queda con el empaquetado. */
export async function cargarConfiguracion(): Promise<void> {
  try {
    const respuesta = await fetch('/config/balance.json', { cache: 'no-store' });
    if (!respuesta.ok) return;
    const r = validarBalance(await respuesta.json());
    if ('balance' in r) aplicarBalance(r.balance);
    else console.warn(`config/balance.json inválido, se usan los valores empaquetados: ${r.error}`);
  } catch {
    /* sin servidor de ficheros: se usan los valores empaquetados */
  }
}

export interface ResultadoGuardado {
  ok: boolean;
  mensaje: string;
}

/** Escribe la configuración en `public/config/balance.json` (solo con el servidor de desarrollo o `vite preview`). */
export async function guardarEnArchivo(balance: Balance): Promise<ResultadoGuardado> {
  try {
    const respuesta = await fetch('/__config', { method: 'POST', body: JSON.stringify(balance) });
    if (respuesta.ok) return { ok: true, mensaje: 'Guardado en public/config/balance.json.' };
    return { ok: false, mensaje: `No se pudo guardar en el archivo: ${await respuesta.text()}` };
  } catch {
    return { ok: false, mensaje: 'No se pudo guardar en el archivo: no hay servidor de desarrollo. Usa «Exportar».' };
  }
}

export interface Campo {
  ruta: string;
  etiqueta: string;
  unidad?: string;
  paso?: number;
}

export interface Grupo {
  titulo: string;
  ayuda?: string;
  campos: Campo[];
}

/** Todo lo que se puede ajustar desde el botón ⚙, agrupado por acción. */
export const GRUPOS: Grupo[] = [
  {
    titulo: 'Velocidades de las líneas',
    ayuda: 'Botellas por ciclo y efecto en Productividad por línea activa y ciclo.',
    campos: (['baja', 'estandar', 'alta'] as const).flatMap((v) => {
      const nombre = { baja: 'Baja', estandar: 'Estándar', alta: 'Alta' }[v];
      return [
        { ruta: `velocidades.${v}.botellas`, etiqueta: `${nombre}: botellas por ciclo`, unidad: 'botellas' },
        { ruta: `velocidades.${v}.productividad`, etiqueta: `${nombre}: efecto en productividad`, unidad: '%' },
      ];
    }),
  },
  {
    titulo: 'Cumplimiento',
    campos: [
      { ruta: 'cumplimiento.pedidoEnProduccionATiempo', etiqueta: 'Por pedido en producción y a tiempo', unidad: '%' },
      { ruta: 'cumplimiento.pedidoEnRetraso', etiqueta: 'Por pedido pendiente en retraso', unidad: '%' },
      { ruta: 'cumplimiento.sinDemanda', etiqueta: 'Sin pedidos en la cola de demanda', unidad: '%' },
    ],
  },
  {
    titulo: 'Productividad',
    campos: [
      { ruta: 'productividad.incompletoEnStockNoActivo', etiqueta: 'Por pedido incompleto en stock sin línea activa', unidad: '%' },
      { ruta: 'productividad.sinStockConDemandaSinActivos', etiqueta: 'Sin stock, con demanda y sin pedidos activos', unidad: '%' },
    ],
  },
  {
    titulo: 'Entrega',
    campos: [
      { ruta: 'entrega.aTiempo', etiqueta: 'Pedido expedido a tiempo', unidad: '%' },
      { ruta: 'entrega.retrasoLeve', etiqueta: 'Terminado en stock con retraso leve (por ciclo)', unidad: '%' },
      { ruta: 'entrega.retrasoMedio', etiqueta: 'Terminado en stock con retraso medio (por ciclo)', unidad: '%' },
      { ruta: 'entrega.retrasoGrave', etiqueta: 'Terminado en stock con retraso grave (por ciclo)', unidad: '%' },
      { ruta: 'entrega.umbralRetrasoLeve', etiqueta: 'Retraso leve: hasta', unidad: 'ciclos' },
      { ruta: 'entrega.umbralRetrasoMedio', etiqueta: 'Retraso medio: hasta', unidad: 'ciclos' },
      { ruta: 'entrega.terminadoSinEntregar', etiqueta: 'Por pedido terminado sin expedir', unidad: '%' },
      { ruta: 'entrega.terminadoSinEntregarMuelleLibre', etiqueta: 'Ídem, habiendo muelle libre', unidad: '%' },
    ],
  },
  {
    titulo: 'Peso en la Rentabilidad',
    ayuda: 'Deben sumar 1.',
    campos: [
      { ruta: 'pesosRentabilidad.cumplimiento', etiqueta: 'Cumplimiento', paso: 0.05 },
      { ruta: 'pesosRentabilidad.productividad', etiqueta: 'Productividad', paso: 0.05 },
      { ruta: 'pesosRentabilidad.entrega', etiqueta: 'Entrega', paso: 0.05 },
    ],
  },
  {
    titulo: 'Valores iniciales de los OKR',
    campos: [
      { ruta: 'inicial.cumplimiento', etiqueta: 'Cumplimiento', unidad: '%' },
      { ruta: 'inicial.productividad', etiqueta: 'Productividad', unidad: '%' },
      { ruta: 'inicial.entrega', etiqueta: 'Entrega', unidad: '%' },
    ],
  },
  {
    titulo: 'Demanda aleatoria',
    ayuda: 'La oleada hace oscilar la demanda: amplitud 0,8 = entre el 20 % y el 180 % de la media.',
    campos: [
      { ruta: 'demanda.pedidosIniciales', etiqueta: 'Pedidos iniciales', unidad: 'pedidos' },
      { ruta: 'demanda.pedidosPorCiclo', etiqueta: 'Pedidos nuevos por ciclo (media)', paso: 0.1 },
      { ruta: 'demanda.cantidadMin', etiqueta: 'Cantidad mínima por pedido', unidad: 'botellas' },
      { ruta: 'demanda.cantidadMax', etiqueta: 'Cantidad máxima por pedido', unidad: 'botellas' },
      { ruta: 'demanda.cantidadPaso', etiqueta: 'Múltiplo de la cantidad', unidad: 'botellas' },
      { ruta: 'demanda.ciclosEntregaMin', etiqueta: 'Plazo de entrega mínimo', unidad: 'ciclos' },
      { ruta: 'demanda.ciclosEntregaMax', etiqueta: 'Plazo de entrega máximo', unidad: 'ciclos' },
      { ruta: 'demanda.oleadaPeriodo', etiqueta: 'Oleada: duración (0 = sin oleadas)', unidad: 'ciclos' },
      { ruta: 'demanda.oleadaAmplitud', etiqueta: 'Oleada: amplitud (0 a 1)', paso: 0.05 },
    ],
  },
  {
    titulo: 'Muelles y tiempo',
    campos: [
      { ruta: 'muelle2MinLineasActivas', etiqueta: 'Líneas activas para abrir el muelle 2', unidad: 'líneas' },
      { ruta: 'cicloSegundosPorDefecto', etiqueta: 'Tiempo de ciclo por defecto', unidad: 's' },
    ],
  },
];

export function leer(b: Balance, ruta: string): number {
  return ruta.split('.').reduce((nodo, k) => (nodo as Record<string, unknown>)[k], b as unknown) as number;
}

/** Devuelve una copia de `b` con el valor de `ruta` cambiado. */
export function escribir(b: Balance, ruta: string, valor: number): Balance {
  const copia = structuredClone(b) as unknown as Record<string, unknown>;
  const claves = ruta.split('.');
  let nodo = copia;
  for (const k of claves.slice(0, -1)) nodo = nodo[k] as Record<string, unknown>;
  nodo[claves[claves.length - 1]] = valor;
  return copia as unknown as Balance;
}
