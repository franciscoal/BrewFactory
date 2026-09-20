/**
 * Registro de decisiones en PostgreSQL. Mismos mensajes que Google Sheets (servidor/registro.ts), pero cada «hoja» es una tabla
 * con columnas tipadas que se crean solas al primer uso (`CREATE TABLE IF NOT EXISTS`).
 *
 * Las tablas y columnas válidas salen de `TABLAS`: lo que llega de la interfaz nunca se usa como identificador SQL sin
 * comprobar contra esa lista, y todos los valores viajan como parámetros.
 */
import pg from 'pg';
import { crearCola } from './registro.ts';
import type { MensajeRegistro, Registro } from './registro.ts';

type Tipo = 'text' | 'int' | 'bigint' | 'numeric' | 'timestamptz' | 'jsonb';

interface Tabla {
  columnas: Record<string, Tipo>;
  clave: string[];
  /** Columnas que no admiten nulo. */
  obligatorias: string[];
}

/** Esquema de la base. Debe coincidir con las columnas que envía `src/ui/registroDecisiones.ts`. */
export const TABLAS: Record<string, Tabla> = {
  reglas: {
    columnas: { balance_hash: 'text', timestamp: 'timestamptz', reglas_json: 'jsonb', balance_json: 'jsonb' },
    clave: ['balance_hash'],
    obligatorias: ['balance_hash', 'timestamp'],
  },
  decisiones: {
    columnas: {
      partida_id: 'text',
      ciclo: 'int',
      timestamp: 'timestamptz',
      piloto: 'text',
      modo: 'text',
      modelo: 'text',
      escenario: 'text',
      semilla: 'bigint',
      balance_hash: 'text',
      estado_json: 'jsonb',
      errores_ciclo_anterior: 'text',
      acciones_json: 'jsonb',
      razonamiento: 'text',
      acciones_descartadas: 'text',
      rentabilidad_antes: 'numeric',
      rentabilidad_despues: 'numeric',
      delta_rentabilidad: 'numeric',
      delta_cumplimiento: 'numeric',
      delta_productividad: 'numeric',
      delta_entrega: 'numeric',
      resultado_json: 'jsonb',
      retorno_3_ciclos: 'numeric',
      retorno_hasta_final: 'numeric',
      rentabilidad_final: 'numeric',
      ciclos_partida: 'int',
    },
    clave: ['partida_id', 'ciclo'],
    obligatorias: ['partida_id', 'ciclo', 'timestamp', 'piloto'],
  },
};

const q = (identificador: string) => `"${identificador}"`;

/** Sentencias que crean las tablas, los índices y la vista (idempotentes). */
export function esquemaSql(): string[] {
  const tablas = Object.entries(TABLAS).map(([nombre, t]) => {
    const columnas = Object.entries(t.columnas).map(([c, tipo]) => `${q(c)} ${tipo}${t.obligatorias.includes(c) ? ' NOT NULL' : ''}`);
    return `CREATE TABLE IF NOT EXISTS ${q(nombre)} (${columnas.join(', ')}, PRIMARY KEY (${t.clave.map(q).join(', ')}))`;
  });
  return [
    ...tablas,
    'CREATE INDEX IF NOT EXISTS decisiones_balance_hash ON decisiones (balance_hash)',
    'CREATE INDEX IF NOT EXISTS decisiones_piloto ON decisiones (piloto, modo)',
    // Decisiones ya valoradas, de mayor a menor retorno: base para elegir ejemplos para la IA.
    `CREATE OR REPLACE VIEW mejores_jugadas AS
       SELECT * FROM decisiones WHERE retorno_3_ciclos IS NOT NULL ORDER BY retorno_3_ciclos DESC`,
  ];
}

export interface Sentencia {
  texto: string;
  valores: unknown[];
}

const tabla = (nombre: string): Tabla => {
  const t = Object.hasOwn(TABLAS, nombre) ? TABLAS[nombre] : undefined;
  if (!t) throw new Error(`La tabla «${nombre}» no existe en el esquema.`);
  return t;
};

const columna = (t: Tabla, nombre: string, tabla: string): Tipo => {
  const tipo = Object.hasOwn(t.columnas, nombre) ? t.columnas[nombre] : undefined;
  if (!tipo) throw new Error(`La columna «${nombre}» no existe en la tabla «${tabla}».`);
  return tipo;
};

/** Un valor de la interfaz (a menudo texto vacío para «sin dato») convertido a lo que espera la columna. */
function convertir(valor: unknown, tipo: Tipo): unknown {
  if (valor === null || valor === undefined) return null;
  if (tipo === 'text') return String(valor);
  if (valor === '') return null;
  return typeof valor === 'string' ? valor : String(valor);
}

const marcador = (n: number, tipo: Tipo) => `$${n}${tipo === 'jsonb' ? '::jsonb' : tipo === 'timestamptz' ? '::timestamptz' : ''}`;

/** Traduce los mensajes a sentencias SQL parametrizadas. Lanza si algún nombre no está en el esquema. */
export function construirSentencias(mensajes: MensajeRegistro[]): Sentencia[] {
  const salida: Sentencia[] = [];
  for (const m of mensajes) {
    const t = tabla(m.hoja);
    if (m.op === 'anadir') {
      const tipos = m.columnas.map((c) => columna(t, c, m.hoja));
      for (const fila of m.filas) {
        const valores = m.columnas.map((c, i) => convertir(fila[c], tipos[i]));
        salida.push({
          texto: `INSERT INTO ${q(m.hoja)} (${m.columnas.map(q).join(', ')}) VALUES (${tipos.map((tipo, i) => marcador(i + 1, tipo)).join(', ')}) ON CONFLICT (${t.clave.map(q).join(', ')}) DO NOTHING`,
          valores,
        });
      }
    } else {
      const valores: unknown[] = [];
      const asignaciones = Object.entries(m.campos).map(([c, v]) => {
        const tipo = columna(t, c, m.hoja);
        valores.push(convertir(v, tipo));
        return `${q(c)} = ${marcador(valores.length, tipo)}`;
      });
      const condiciones = Object.entries(m.filtro).map(([c, v]) => {
        const tipo = columna(t, c, m.hoja);
        valores.push(convertir(v, tipo));
        return `${q(c)} = ${marcador(valores.length, tipo)}`;
      });
      salida.push({ texto: `UPDATE ${q(m.hoja)} SET ${asignaciones.join(', ')} WHERE ${condiciones.join(' AND ')}`, valores });
    }
  }
  return salida;
}

/** Lo mínimo que necesitamos de un pool de `pg` (se sustituye en los tests). */
export interface ClientePg {
  query(texto: string, valores?: unknown[]): Promise<unknown>;
  release(): void;
}
export interface PoolPg {
  connect(): Promise<ClientePg>;
  on?(evento: 'error', escuchar: (err: Error) => void): unknown;
  query(texto: string): Promise<unknown>;
  end(): Promise<void>;
}

/** Mensaje comprensible para los fallos más habituales al usar la base. */
function explicar(err: unknown): string {
  const e = err as { code?: string; message?: string; errors?: { code?: string }[] };
  const codigo = e.code ?? e.errors?.[0]?.code;
  if (codigo === 'ECONNREFUSED' || codigo === 'ETIMEDOUT') return 'No se puede conectar con PostgreSQL. ¿Está arrancado? Ejecuta npm run db:up.';
  if (codigo === '28P01') return 'PostgreSQL rechazó la contraseña: revisa BREWFACTORY_DATABASE_URL en .env.local.';
  if (codigo === '3D000') return 'La base de datos indicada en BREWFACTORY_DATABASE_URL no existe.';
  return e.message || 'Error desconocido al escribir en PostgreSQL.';
}

export interface OpcionesPostgres {
  url: string;
  pool?: PoolPg;
  esperar?: (ms: number) => Promise<void>;
  reintentos?: number;
}

export function crearRegistroPostgres(opciones: OpcionesPostgres): Registro {
  const pool: PoolPg = opciones.pool ?? (new pg.Pool({ connectionString: opciones.url, max: 2, connectionTimeoutMillis: 3000 }) as unknown as PoolPg);
  let esquema: Promise<void> | null = null;

  /** Crea las tablas la primera vez que se puede (y lo reintenta si falló). */
  const asegurarEsquema = (): Promise<void> => {
    esquema ??= (async () => {
      const cliente = await pool.connect();
      try {
        for (const sql of esquemaSql()) await cliente.query(sql);
      } finally {
        cliente.release();
      }
    })().catch((err) => {
      esquema = null;
      throw err;
    });
    return esquema;
  };

  async function entregar(lote: MensajeRegistro[]): Promise<void> {
    try {
      const sentencias = construirSentencias(lote);
      await asegurarEsquema();
      const cliente = await pool.connect();
      try {
        await cliente.query('BEGIN');
        for (const s of sentencias) await cliente.query(s.texto, s.valores);
        await cliente.query('COMMIT');
      } catch (err) {
        await cliente.query('ROLLBACK').catch(() => undefined);
        throw err;
      } finally {
        cliente.release();
      }
    } catch (err) {
      throw new Error(explicar(err));
    }
  }

  const cola = crearCola({ entregar, esperar: opciones.esperar, reintentos: opciones.reintentos });
  // Si la base se cae con conexiones inactivas, el pool emite «error»; sin escucharlo tumbaría el servidor entero.
  pool.on?.('error', (err) => cola.fijarError(explicar(err)));
  return {
    encolar: cola.encolar,
    estado: cola.estado,
    vaciar: cola.vaciar,
    async sondear() {
      try {
        await asegurarEsquema();
        await pool.query('SELECT 1');
        cola.fijarError(null);
      } catch (err) {
        cola.fijarError(explicar(err));
      }
    },
  };
}

/** Crea el registro a partir de las variables de entorno, o `null` si no está configurado (la aplicación arranca igualmente). */
export function registroPostgresDesdeEntorno(env: Record<string, string | undefined>): Registro | null {
  const url = env.BREWFACTORY_DATABASE_URL?.trim();
  return url ? crearRegistroPostgres({ url }) : null;
}
