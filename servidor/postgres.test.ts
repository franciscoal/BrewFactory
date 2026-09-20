import { describe, expect, it } from 'vitest';
import { construirSentencias, crearRegistroPostgres, esquemaSql, TABLAS } from './postgres';
import type { ClientePg, PoolPg } from './postgres';
import { COLUMNAS_DECISIONES, COLUMNAS_REGLAS } from '../src/ui/registroDecisiones';

const anadir = {
  op: 'anadir' as const,
  hoja: 'decisiones',
  columnas: ['partida_id', 'ciclo', 'timestamp', 'piloto', 'estado_json', 'rentabilidad_antes', 'modelo'],
  filas: [{ partida_id: 'p1', ciclo: 0, timestamp: '2026-09-20T10:00:00.000Z', piloto: 'bot', estado_json: '{"a":1}', rentabilidad_antes: 100, modelo: '' }],
};
const actualizar = { op: 'actualizar' as const, hoja: 'decisiones', filtro: { partida_id: 'p1', ciclo: 2 }, campos: { retorno_3_ciclos: -4.5, rentabilidad_final: '' } };

describe('esquema de PostgreSQL', () => {
  it('coincide con las columnas que envía la interfaz', () => {
    expect(Object.keys(TABLAS.decisiones.columnas).sort()).toEqual([...COLUMNAS_DECISIONES].sort());
    expect(Object.keys(TABLAS.reglas.columnas).sort()).toEqual([...COLUMNAS_REGLAS].sort());
  });

  it('crea tablas, índices y la vista de forma idempotente', () => {
    const sql = esquemaSql().join('\n');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "decisiones"');
    expect(sql).toContain('PRIMARY KEY ("partida_id", "ciclo")');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "reglas"');
    expect(sql).toContain('CREATE OR REPLACE VIEW mejores_jugadas');
    expect(esquemaSql().every((s) => /IF NOT EXISTS|OR REPLACE/.test(s))).toBe(true);
  });
});

describe('construirSentencias', () => {
  it('inserta con parámetros y tipos, y sin duplicar una clave existente', () => {
    const [s] = construirSentencias([anadir]);
    expect(s.texto).toBe(
      'INSERT INTO "decisiones" ("partida_id", "ciclo", "timestamp", "piloto", "estado_json", "rentabilidad_antes", "modelo") VALUES ($1, $2, $3::timestamptz, $4, $5::jsonb, $6, $7) ON CONFLICT ("partida_id", "ciclo") DO NOTHING',
    );
    expect(s.valores).toEqual(['p1', '0', '2026-09-20T10:00:00.000Z', 'bot', '{"a":1}', '100', '']);
  });

  it('actualiza por filtro; el texto vacío en una columna numérica es NULL', () => {
    const [s] = construirSentencias([actualizar]);
    expect(s.texto).toBe('UPDATE "decisiones" SET "retorno_3_ciclos" = $1, "rentabilidad_final" = $2 WHERE "partida_id" = $3 AND "ciclo" = $4');
    expect(s.valores).toEqual(['-4.5', null, 'p1', '2']);
  });

  it('una fila por cada elemento de filas', () => {
    expect(construirSentencias([{ ...anadir, filas: [anadir.filas[0], { ...anadir.filas[0], ciclo: 1 }] }])).toHaveLength(2);
  });

  it.each([
    ['tabla desconocida', { ...anadir, hoja: 'usuarios' }],
    ['tabla con nombre de prototipo', { ...anadir, hoja: '__proto__' }],
    ['columna desconocida al insertar', { ...anadir, columnas: ['partida_id', 'x; DROP TABLE decisiones'] }],
    ['columna desconocida al actualizar', { ...actualizar, campos: { 'a" = 1; --': 1 } }],
    ['columna desconocida en el filtro', { ...actualizar, filtro: { constructor: 'x' } }],
  ])('rechaza: %s (nunca llega texto de la interfaz al SQL)', (_nombre, mensaje) => {
    expect(() => construirSentencias([mensaje])).toThrow(/no existe/);
  });
});

/** Pool falso que apunta las consultas y puede fallar a demanda. */
function poolFalso(fallos: Record<string, Error> = {}) {
  const consultas: { texto: string; valores?: unknown[] }[] = [];
  let conexiones = 0;
  const cliente: ClientePg = {
    async query(texto, valores) {
      consultas.push({ texto, valores });
      const fallo = Object.entries(fallos).find(([parte]) => texto.includes(parte));
      if (fallo) throw fallo[1];
      return {};
    },
    release: () => void conexiones--,
  };
  const pool: PoolPg = {
    async connect() {
      conexiones++;
      return cliente;
    },
    query: async () => ({}),
    end: async () => undefined,
  };
  return { pool, consultas, abiertas: () => conexiones };
}

const esperar = async () => undefined;

describe('registro en PostgreSQL', () => {
  it('crea el esquema una vez y escribe cada lote en una transacción', async () => {
    const { pool, consultas, abiertas } = poolFalso();
    const registro = crearRegistroPostgres({ url: 'x', pool, esperar });
    registro.encolar([anadir]);
    await registro.vaciar();
    registro.encolar([actualizar]);
    await registro.vaciar();
    const textos = consultas.map((c) => c.texto);
    expect(textos.filter((t) => t.startsWith('CREATE TABLE'))).toHaveLength(2);
    expect(textos.filter((t) => t === 'BEGIN')).toHaveLength(2);
    expect(textos.filter((t) => t === 'COMMIT')).toHaveLength(2);
    expect(textos.some((t) => t.startsWith('INSERT'))).toBe(true);
    expect(textos.some((t) => t.startsWith('UPDATE'))).toBe(true);
    expect(registro.estado()).toEqual({ pendientes: 0, enviados: 2, perdidos: 0, ultimoError: null });
    expect(abiertas()).toBe(0);
  });

  it('si una sentencia falla, deshace el lote, libera la conexión y deja el error visible', async () => {
    const { pool, consultas, abiertas } = poolFalso({ INSERT: new Error('violación de restricción') });
    const registro = crearRegistroPostgres({ url: 'x', pool, esperar });
    registro.encolar([anadir]);
    await registro.vaciar();
    expect(consultas.some((c) => c.texto === 'ROLLBACK')).toBe(true);
    expect(consultas.some((c) => c.texto === 'COMMIT')).toBe(false);
    expect(registro.estado()).toEqual({ pendientes: 0, enviados: 0, perdidos: 1, ultimoError: 'violación de restricción' });
    expect(abiertas()).toBe(0);
  });

  it('un mensaje fuera del esquema se descarta con un error claro sin tocar la base', async () => {
    const { pool, consultas } = poolFalso();
    const registro = crearRegistroPostgres({ url: 'x', pool, esperar });
    registro.encolar([{ ...anadir, hoja: 'usuarios' }]);
    await registro.vaciar();
    expect(consultas).toEqual([]);
    expect(registro.estado().ultimoError).toContain('no existe');
  });

  it('explica los fallos habituales de conexión y contraseña', async () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
    const registro = crearRegistroPostgres({ url: 'x', pool: poolFalso({ 'CREATE TABLE': refused }).pool, esperar });
    registro.encolar([anadir]);
    await registro.vaciar();
    expect(registro.estado().ultimoError).toContain('npm run db:up');

    const clave = Object.assign(new Error('password authentication failed'), { code: '28P01' });
    const r2 = crearRegistroPostgres({ url: 'x', pool: poolFalso({ 'CREATE TABLE': clave }).pool, esperar });
    r2.encolar([anadir]);
    await r2.vaciar();
    expect(r2.estado().ultimoError).toContain('contraseña');
  });

  it('sondear informa del error sin escribir y lo limpia cuando la base responde', async () => {
    let caida = true;
    const { pool } = poolFalso();
    const conectar = pool.connect.bind(pool);
    pool.connect = async () => {
      if (caida) throw Object.assign(new Error('x'), { code: 'ECONNREFUSED' });
      return conectar();
    };
    const registro = crearRegistroPostgres({ url: 'x', pool, esperar });
    await registro.sondear!();
    expect(registro.estado().ultimoError).toContain('No se puede conectar');
    caida = false;
    await registro.sondear!();
    expect(registro.estado().ultimoError).toBeNull();
  });

  it('un error del pool (la base se cae con conexiones inactivas) se recoge y no tumba el servidor', () => {
    const { pool } = poolFalso();
    let escucha: ((err: Error) => void) | undefined;
    pool.on = (_evento, f) => void (escucha = f);
    const registro = crearRegistroPostgres({ url: 'x', pool, esperar });
    expect(escucha).toBeDefined();
    escucha!(Object.assign(new Error('terminating connection'), { code: 'ECONNREFUSED' }));
    expect(registro.estado().ultimoError).toContain('npm run db:up');
  });
});
