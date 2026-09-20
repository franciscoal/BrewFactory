import { useEffect, useRef, useState } from 'preact/hooks';
import { BALANCE, estadoParaIA, reglasIA } from '../engine';
import type { EstadoIA } from '../engine';
import type { Juego } from './juego';

/**
 * Registro de decisiones (base de conocimiento para una IA) en Google Sheets y/o PostgreSQL.
 *
 * Por cada ciclo decidido se añade una fila a `decisiones` con lo que vio quien decidió (estado), lo que decidió
 * (acciones y razonamiento) y lo que pasó (resultado). Al avanzar la partida se completan las columnas de retorno
 * (a 3 ciclos y hasta el final). `reglas` guarda, una sola vez por versión, las reglas y el balance con que se jugó.
 * Los mensajes son iguales para todos los destinos; el envío pasa por el servidor local (`/api/registro/<destino>`),
 * que guarda las credenciales.
 */

export const HOJA_DECISIONES = 'decisiones';
export const HOJA_REGLAS = 'reglas';

/** Ciclos que se miran hacia delante para la columna `retorno_3_ciclos`. */
export const HORIZONTE = 3;

export const COLUMNAS_DECISIONES = [
  'partida_id',
  'ciclo',
  'timestamp',
  'piloto',
  'modo',
  'modelo',
  'escenario',
  'semilla',
  'balance_hash',
  'estado_json',
  'errores_ciclo_anterior',
  'acciones_json',
  'razonamiento',
  'acciones_descartadas',
  'rentabilidad_antes',
  'rentabilidad_despues',
  'delta_rentabilidad',
  'delta_cumplimiento',
  'delta_productividad',
  'delta_entrega',
  'resultado_json',
  'retorno_3_ciclos',
  'retorno_hasta_final',
  'rentabilidad_final',
  'ciclos_partida',
] as const;

export const COLUMNAS_REGLAS = ['balance_hash', 'timestamp', 'reglas_json', 'balance_json'] as const;

/** Mensajes para el servidor (mismo formato que `servidor/registro.ts`). */
export type Mensaje =
  | { op: 'anadir'; hoja: string; columnas: readonly string[]; filas: Record<string, unknown>[]; unicaPor?: string }
  | { op: 'actualizar'; hoja: string; filtro: Record<string, string | number>; campos: Record<string, unknown> };

/** Quién jugó el ciclo. */
export interface MetaRegistro {
  piloto: string;
  /** Bot elegido, o modo de la IA (autónomo / paso a paso). */
  modo: string;
  /** Modelo de IA (solo con el piloto IA). */
  modelo: string | null;
}

const redondear = (v: number) => Math.round(v * 100) / 100;

/** Hash corto y estable (FNV-1a) para identificar una versión de reglas + balance. */
export function hashTexto(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Reglas y balance vigentes, con su hash. Cada fila de decisiones apunta a esta versión. */
export function versionReglas(): { hash: string; reglas: string[]; balance: unknown } {
  const reglas = reglasIA();
  const balance = structuredClone(BALANCE);
  return { hash: hashTexto(JSON.stringify({ reglas, balance })), reglas, balance };
}

/**
 * Seguimiento de una partida: genera las filas y las actualizaciones de retorno.
 * Sin efectos: devuelve mensajes; quien lo usa decide cómo enviarlos.
 */
export class SeguimientoPartida {
  /** Rentabilidad al llegar a cada ciclo (índice = ciclo). */
  private readonly rentabilidad = new Map<number, number>();
  /** Ciclos decididos (el de la fila, no el resultante). */
  private readonly ciclos: number[] = [];
  private readonly hash: string;

  constructor(
    readonly id: string,
    private readonly ahora: () => Date = () => new Date(),
  ) {
    this.hash = versionReglas().hash;
  }

  /** Genera los mensajes de un ciclo que se acaba de resolver: `antes` es la partida justo antes de resolver, `despues` justo después. */
  registrar(antes: Juego, despues: Juego, meta: MetaRegistro): Mensaje[] {
    const mensajes: Mensaje[] = [];
    const entrada = despues.log[despues.log.length - 1];
    const ciclo = antes.estado.ciclo;
    const okrAntes = antes.estado.okr;
    const okrDespues = despues.estado.okr;
    const marca = this.ahora().toISOString();

    // Las reglas y el formato de respuesta son constantes: viven en la tabla `reglas`, no se repiten en cada fila.
    const estadoVisto: Partial<EstadoIA> = estadoParaIA(antes.estado, antes.errores);
    delete estadoVisto.reglas;
    delete estadoVisto.formatoAcciones;
    const acciones = { lineas: entrada.acciones.lineas, muelles: entrada.acciones.muelles };

    this.rentabilidad.set(ciclo, okrAntes.rentabilidad);
    this.rentabilidad.set(despues.estado.ciclo, okrDespues.rentabilidad);
    this.ciclos.push(ciclo);

    mensajes.push({
      op: 'anadir',
      hoja: HOJA_DECISIONES,
      columnas: COLUMNAS_DECISIONES,
      filas: [
        {
          partida_id: this.id,
          ciclo,
          timestamp: marca,
          piloto: meta.piloto,
          modo: meta.modo,
          modelo: meta.modelo ?? '',
          escenario: antes.estado.escenario?.nombre ?? 'aleatorio',
          semilla: antes.estado.semilla,
          balance_hash: this.hash,
          estado_json: JSON.stringify(estadoVisto),
          errores_ciclo_anterior: antes.errores.join(' | '),
          acciones_json: JSON.stringify(acciones),
          razonamiento: antes.comentarioIA ?? '',
          acciones_descartadas: entrada.errores.join(' | '),
          rentabilidad_antes: redondear(okrAntes.rentabilidad),
          rentabilidad_despues: redondear(okrDespues.rentabilidad),
          delta_rentabilidad: redondear(okrDespues.rentabilidad - okrAntes.rentabilidad),
          delta_cumplimiento: redondear(okrDespues.cumplimiento - okrAntes.cumplimiento),
          delta_productividad: redondear(okrDespues.productividad - okrAntes.productividad),
          delta_entrega: redondear(okrDespues.entrega - okrAntes.entrega),
          resultado_json: JSON.stringify({ sucesos: entrada.informe.sucesos, efectos: entrada.informe.efectos, okr: okrDespues }),
        },
      ],
    });

    // Ya se conoce la rentabilidad HORIZONTE ciclos después de la decisión más antigua que aún no la tiene.
    const decidido = despues.estado.ciclo - HORIZONTE;
    const base = this.rentabilidad.get(decidido);
    if (this.ciclos.includes(decidido) && base !== undefined) {
      mensajes.push({
        op: 'actualizar',
        hoja: HOJA_DECISIONES,
        filtro: { partida_id: this.id, ciclo: decidido },
        campos: { retorno_3_ciclos: redondear(okrDespues.rentabilidad - base) },
      });
    }
    return mensajes;
  }

  /** Cierra la partida: rellena el retorno hasta el final y la rentabilidad final en todas las filas. */
  finalizar(): Mensaje[] {
    if (this.ciclos.length === 0) return [];
    const ultimo = Math.max(...this.rentabilidad.keys());
    const final = this.rentabilidad.get(ultimo)!;
    return this.ciclos.map((ciclo) => ({
      op: 'actualizar' as const,
      hoja: HOJA_DECISIONES,
      filtro: { partida_id: this.id, ciclo },
      campos: {
        retorno_hasta_final: redondear(final - (this.rentabilidad.get(ciclo) ?? final)),
        rentabilidad_final: redondear(final),
        ciclos_partida: ultimo,
      },
    }));
  }
}

/** Fila de `reglas` con la versión vigente de reglas y balance (cada destino la guarda una sola vez por versión). */
export function mensajeReglas(ahora = new Date()): Mensaje {
  const v = versionReglas();
  return {
    op: 'anadir',
    hoja: HOJA_REGLAS,
    columnas: COLUMNAS_REGLAS,
    unicaPor: 'balance_hash',
    filas: [{ balance_hash: v.hash, timestamp: ahora.toISOString(), reglas_json: JSON.stringify(v.reglas), balance_json: JSON.stringify(v.balance) }],
  };
}

/** Identificador legible y único de una partida: fecha, hora y semilla. */
export function idPartida(semilla: number, ahora = new Date()): string {
  return `${ahora.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}-${semilla}`;
}

/**
 * Decide qué mensajes genera el paso de una partida a la siguiente. Puro, para poder probarlo sin React.
 * Devuelve el seguimiento a conservar (o `null`), los mensajes a enviar y el id de la partida a la que pertenecen.
 */
export function seguirTransicion(
  seguimiento: SeguimientoPartida | null,
  antes: Juego,
  despues: Juego,
  meta: MetaRegistro,
  ahora: () => Date = () => new Date(),
): { seguimiento: SeguimientoPartida | null; mensajes: Mensaje[]; partidaId: string | null } {
  const mensajes: Mensaje[] = [];
  let actual = seguimiento;
  const partidaId = () => actual?.id ?? null;

  // Otra partida distinta (nueva semilla o reinicio): se cierra la anterior.
  if (antes.estado.semilla !== despues.estado.semilla || despues.log.length < antes.log.length) {
    const id = partidaId();
    if (actual) mensajes.push(...actual.finalizar());
    return { seguimiento: null, mensajes, partidaId: id };
  }

  if (despues.log.length === antes.log.length + 1) {
    actual ??= new SeguimientoPartida(idPartida(despues.estado.semilla, ahora()), ahora);
    mensajes.push(...actual.registrar(antes, despues, meta));
  }

  const id = partidaId();
  if (despues.fase === 'terminado' && antes.fase !== 'terminado' && actual) {
    mensajes.push(...actual.finalizar());
    actual = null;
  }
  return { seguimiento: actual, mensajes, partidaId: id };
}

// ── Comunicación con el servidor ────────────────────────────────────────────

export type Destino = 'sheets' | 'db';
export const DESTINOS: Destino[] = ['sheets', 'db'];

export interface EstadoRegistroUi {
  /** El servidor tiene configurado el destino. `null` = todavía no se sabe. */
  disponible: boolean | null;
  pendientes: number;
  enviados: number;
  perdidos: number;
  ultimoError: string | null;
}

export const REGISTRO_INICIAL: EstadoRegistroUi = { disponible: null, pendientes: 0, enviados: 0, perdidos: 0, ultimoError: null };

/** Consulta al servidor si el destino está configurado y cómo va el envío. Con `sondear`, comprueba también que responde. */
export async function consultarRegistro(destino: Destino, sondear = false): Promise<EstadoRegistroUi> {
  try {
    const r = await fetch(`/api/registro/${destino}/estado${sondear ? '?sondear=1' : ''}`);
    const datos = (await r.json()) as Partial<EstadoRegistroUi>;
    if (typeof datos.disponible !== 'boolean') return { ...REGISTRO_INICIAL, disponible: false };
    return { ...REGISTRO_INICIAL, ...datos, disponible: datos.disponible };
  } catch {
    return { ...REGISTRO_INICIAL, disponible: false };
  }
}

async function enviarMensajes(destino: Destino, mensajes: Mensaje[]): Promise<void> {
  await fetch(`/api/registro/${destino}`, { method: 'POST', body: JSON.stringify({ mensajes }) });
}

export type Activos = Record<Destino, boolean>;
export type EstadosRegistro = Record<Destino, EstadoRegistroUi>;

/**
 * Registra las decisiones de la partida en los destinos activos (cada uno con su interruptor).
 * Los fallos de un destino no afectan a la partida ni a los demás: se muestran en su indicador de la cabecera.
 */
export function useRegistro(activos: Activos, j: Juego, meta: MetaRegistro): EstadosRegistro {
  const [estados, setEstados] = useState<EstadosRegistro>({ sheets: REGISTRO_INICIAL, db: REGISTRO_INICIAL });
  const previo = useRef<Juego>(j);
  const seguimiento = useRef<SeguimientoPartida | null>(null);
  const activosPrevios = useRef<Activos>(activos);
  /** Destinos que ya tienen la fila de `reglas` de la partida en curso. */
  const conReglas = useRef(new Set<string>());
  const metaRef = useRef(meta);
  metaRef.current = meta;

  // ¿Está configurado cada destino? Y, mientras esté activo, cómo va el envío.
  useEffect(() => {
    let vivo = true;
    const consultar = (d: Destino) =>
      consultarRegistro(d, activos[d]).then((e) => {
        if (vivo) setEstados((x) => ({ ...x, [d]: e }));
      });
    const ids = DESTINOS.map((d) => {
      void consultar(d);
      return activos[d] ? setInterval(() => void consultar(d), 3000) : null;
    });
    return () => {
      vivo = false;
      ids.forEach((id) => id !== null && clearInterval(id));
    };
  }, [activos.sheets, activos.db]);

  useEffect(() => {
    const antes = previo.current;
    previo.current = j;
    const previos = activosPrevios.current;
    activosPrevios.current = activos;

    /** Entrega los mensajes a cada destino; a los que aún no tienen las reglas de esta partida se las añade delante. */
    const enviar = (destinos: Destino[], partidaId: string | null, mensajes: Mensaje[]) => {
      if (mensajes.length === 0) return;
      const hayFilas = mensajes.some((m) => m.op === 'anadir');
      for (const d of destinos) {
        const clave = `${partidaId}/${d}`;
        const lote = hayFilas && !conReglas.current.has(clave) ? [mensajeReglas(), ...mensajes] : mensajes;
        if (hayFilas) conReglas.current.add(clave);
        void enviarMensajes(d, lote).catch(() => undefined);
      }
    };

    const destinos = DESTINOS.filter((d) => activos[d]);
    if (destinos.length === 0) {
      // Al apagar todos se cierra la partida en curso (con lo que se sepa) y se empieza de cero al reactivar.
      if (seguimiento.current) {
        const id = seguimiento.current.id;
        const mensajes = seguimiento.current.finalizar();
        seguimiento.current = null;
        enviar(DESTINOS.filter((d) => previos[d]), id, mensajes);
        conReglas.current.clear();
      }
      return;
    }
    const r = seguirTransicion(seguimiento.current, antes, j, metaRef.current);
    seguimiento.current = r.seguimiento;
    enviar(destinos, r.partidaId, r.mensajes);
    if (r.seguimiento === null) conReglas.current.clear();
  }, [j, activos.sheets, activos.db]);

  return estados;
}
