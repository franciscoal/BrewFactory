/**
 * Registro de decisiones: parte común a todos los destinos (Google Sheets, PostgreSQL…).
 *
 * La interfaz envía mensajes a `POST /api/registro/<destino>`; cada destino los pone en cola y los entrega en lotes.
 * Un fallo del destino nunca bloquea la partida: se reintenta un par de veces y, si sigue fallando, se descarta el lote
 * y se deja el error visible en `estado()`.
 */

/** Añade filas a una tabla u hoja. Con `unicaPor`, omite las filas cuyo valor en esa columna ya existe. */
export interface MensajeAnadir {
  op: 'anadir';
  hoja: string;
  columnas: string[];
  filas: Record<string, unknown>[];
  unicaPor?: string;
}

/** Actualiza `campos` en las filas que cumplan todo el `filtro` (igualdad por columna). */
export interface MensajeActualizar {
  op: 'actualizar';
  hoja: string;
  filtro: Record<string, string | number>;
  campos: Record<string, unknown>;
}

export type MensajeRegistro = MensajeAnadir | MensajeActualizar;

export interface EstadoRegistro {
  /** Mensajes en cola o en vuelo. */
  pendientes: number;
  /** Mensajes entregados con éxito desde que arrancó el servidor. */
  enviados: number;
  /** Mensajes descartados tras agotar los reintentos. */
  perdidos: number;
  ultimoError: string | null;
}

export interface Registro {
  encolar(mensajes: MensajeRegistro[]): void;
  estado(): EstadoRegistro;
  /** Espera a que se vacíe la cola (para los tests y para cerrar). */
  vaciar(): Promise<void>;
  /** Comprueba que el destino responde y actualiza `ultimoError` (opcional; lo llama la consulta de estado). */
  sondear?(): Promise<void>;
}

const MAX_COLA = 2000;
const MAX_MENSAJES_POR_PETICION = 500;
const MAX_NOMBRE = 60;

const esObjeto = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const esNombre = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= MAX_NOMBRE;

/** Valida la estructura de lo que envía la interfaz. Devuelve los mensajes o un texto con el motivo del rechazo. */
export function validarMensajes(entrada: unknown): MensajeRegistro[] | string {
  const lista = esObjeto(entrada) ? entrada.mensajes : null;
  if (!Array.isArray(lista) || lista.length === 0) return 'Se esperaba {"mensajes": [...]} con al menos un mensaje.';
  if (lista.length > MAX_MENSAJES_POR_PETICION) return `Demasiados mensajes en una petición (máximo ${MAX_MENSAJES_POR_PETICION}).`;
  const salida: MensajeRegistro[] = [];
  for (const [i, m] of lista.entries()) {
    const en = `mensajes[${i}]`;
    if (!esObjeto(m) || !esNombre(m.hoja)) return `${en}: falta el nombre de la hoja.`;
    if (m.op === 'anadir') {
      if (!Array.isArray(m.columnas) || m.columnas.length === 0 || !m.columnas.every(esNombre)) return `${en}: «columnas» no es válido.`;
      if (!Array.isArray(m.filas) || !m.filas.every(esObjeto)) return `${en}: «filas» no es válido.`;
      if (m.unicaPor !== undefined && !esNombre(m.unicaPor)) return `${en}: «unicaPor» no es válido.`;
      salida.push({ op: 'anadir', hoja: m.hoja, columnas: m.columnas as string[], filas: m.filas as Record<string, unknown>[], unicaPor: m.unicaPor as string | undefined });
    } else if (m.op === 'actualizar') {
      if (!esObjeto(m.filtro) || Object.keys(m.filtro).length === 0 || !Object.values(m.filtro).every((v) => typeof v === 'string' || typeof v === 'number')) {
        return `${en}: «filtro» no es válido.`;
      }
      if (!esObjeto(m.campos) || Object.keys(m.campos).length === 0) return `${en}: «campos» no es válido.`;
      salida.push({ op: 'actualizar', hoja: m.hoja, filtro: m.filtro as Record<string, string | number>, campos: m.campos });
    } else {
      return `${en}: operación desconocida.`;
    }
  }
  return salida;
}

export interface OpcionesCola {
  /** Entrega un lote al destino; lanza un error con un mensaje legible si falla. */
  entregar(lote: MensajeRegistro[]): Promise<void>;
  esperar?: (ms: number) => Promise<void>;
  /** Reintentos tras el primer intento. */
  reintentos?: number;
}

/** Cola con reintentos y agrupación en lotes: lo que llega mientras se entrega un lote se entrega junto en el siguiente. */
export function crearCola(opciones: OpcionesCola): Registro & { fijarError(mensaje: string | null): void } {
  const esperar = opciones.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms)));
  const reintentos = opciones.reintentos ?? 2;

  let cola: MensajeRegistro[] = [];
  let enVuelo = 0;
  let enviados = 0;
  let perdidos = 0;
  let ultimoError: string | null = null;
  let bombeando: Promise<void> | null = null;

  async function bombear(): Promise<void> {
    while (cola.length > 0) {
      const lote = cola.splice(0, MAX_MENSAJES_POR_PETICION);
      enVuelo = lote.length;
      let error: string | null = null;
      for (let intento = 0; intento <= reintentos; intento++) {
        try {
          await opciones.entregar(lote);
          error = null;
          break;
        } catch (err) {
          error = (err as Error).message;
          if (intento < reintentos) await esperar(500 * 2 ** intento);
        }
      }
      enVuelo = 0;
      if (error === null) {
        enviados += lote.length;
        ultimoError = null;
      } else {
        perdidos += lote.length;
        ultimoError = error;
      }
    }
  }

  return {
    encolar(mensajes) {
      cola.push(...mensajes);
      if (cola.length > MAX_COLA) {
        perdidos += cola.length - MAX_COLA;
        cola = cola.slice(-MAX_COLA);
      }
      bombeando ??= bombear().finally(() => {
        bombeando = null;
      });
    },
    estado: () => ({ pendientes: cola.length + enVuelo, enviados, perdidos, ultimoError }),
    async vaciar() {
      while (bombeando) await bombeando;
    },
    fijarError(mensaje) {
      ultimoError = mensaje;
    },
  };
}
