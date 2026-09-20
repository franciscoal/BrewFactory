import { describe, expect, it } from 'vitest';
import { validarMensajes } from './registro';
import { crearRegistroSheets, registroSheetsDesdeEntorno } from './sheets';

const anadir = { op: 'anadir', hoja: 'decisiones', columnas: ['a', 'b'], filas: [{ a: 1, b: 'x' }] };
const actualizar = { op: 'actualizar', hoja: 'decisiones', filtro: { partida_id: 'p1', ciclo: 2 }, campos: { retorno_3_ciclos: 4 } };

const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });

function conFetch(respuestas: (() => Response | Promise<Response>)[]) {
  const llamadas: { url: string; cuerpo: { secreto: string; mensajes: unknown[] }; init: RequestInit }[] = [];
  const registro = crearRegistroSheets({
    url: 'http://apps-script.local/exec',
    secreto: 'secreto-1',
    esperar: async () => undefined,
    fetch: (async (url: string, init: RequestInit) => {
      llamadas.push({ url, cuerpo: JSON.parse(init.body as string), init });
      return respuestas.length > 1 ? respuestas.shift()!() : respuestas[0]();
    }) as unknown as typeof fetch,
  });
  return { registro, llamadas };
}

describe('validarMensajes', () => {
  it('acepta añadir y actualizar', () => {
    expect(validarMensajes({ mensajes: [anadir, actualizar] })).toHaveLength(2);
  });

  it.each([
    ['sin mensajes', {}],
    ['lista vacía', { mensajes: [] }],
    ['operación desconocida', { mensajes: [{ op: 'borrar', hoja: 'x' }] }],
    ['sin hoja', { mensajes: [{ ...anadir, hoja: '' }] }],
    ['columnas inválidas', { mensajes: [{ ...anadir, columnas: [1] }] }],
    ['filtro vacío', { mensajes: [{ ...actualizar, filtro: {} }] }],
    ['filtro con objetos', { mensajes: [{ ...actualizar, filtro: { a: {} } }] }],
    ['campos vacíos', { mensajes: [{ ...actualizar, campos: {} }] }],
  ])('rechaza: %s', (_nombre, entrada) => {
    expect(typeof validarMensajes(entrada)).toBe('string');
  });
});

describe('registro en Google Sheets', () => {
  it('reenvía los mensajes al webhook con el secreto', async () => {
    const { registro, llamadas } = conFetch([ok]);
    registro.encolar([anadir as never]);
    await registro.vaciar();
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe('http://apps-script.local/exec');
    expect(llamadas[0].cuerpo).toEqual({ secreto: 'secreto-1', mensajes: [anadir] });
    expect(registro.estado()).toEqual({ pendientes: 0, enviados: 1, perdidos: 0, ultimoError: null });
  });

  it('agrupa en un solo envío lo que llega mientras hay uno en curso', async () => {
    const { registro, llamadas } = conFetch([ok]);
    registro.encolar([anadir as never]);
    registro.encolar([actualizar as never]);
    registro.encolar([anadir as never]);
    await registro.vaciar();
    expect(llamadas.length).toBeLessThanOrEqual(2);
    expect(llamadas.reduce((n, l) => n + l.cuerpo.mensajes.length, 0)).toBe(3);
    expect(registro.estado().enviados).toBe(3);
  });

  it('reintenta ante un fallo pasajero', async () => {
    const { registro, llamadas } = conFetch([() => new Response('error', { status: 500 }), ok]);
    registro.encolar([anadir as never]);
    await registro.vaciar();
    expect(llamadas).toHaveLength(2);
    expect(registro.estado()).toMatchObject({ enviados: 1, perdidos: 0, ultimoError: null });
  });

  it('si falla siempre, descarta el lote y deja el error visible sin lanzar', async () => {
    const { registro, llamadas } = conFetch([() => new Response(JSON.stringify({ ok: false, error: 'Secreto incorrecto.' }), { status: 200 })]);
    registro.encolar([anadir as never]);
    await registro.vaciar();
    expect(llamadas).toHaveLength(3);
    expect(registro.estado()).toEqual({ pendientes: 0, enviados: 0, perdidos: 1, ultimoError: 'Secreto incorrecto.' });
  });

  it('si el webhook no devuelve JSON, explica cómo revisar el despliegue', async () => {
    const { registro } = conFetch([() => new Response('<html>Iniciar sesión</html>', { status: 200 })]);
    registro.encolar([anadir as never]);
    await registro.vaciar();
    expect(registro.estado().ultimoError).toContain('Cualquier usuario');
  });

  it('un fallo de red tampoco lanza y un éxito posterior limpia el error', async () => {
    const { registro } = conFetch([
      () => Promise.reject(new Error('sin red')),
      () => Promise.reject(new Error('sin red')),
      () => Promise.reject(new Error('sin red')),
      ok,
    ]);
    registro.encolar([anadir as never]);
    await registro.vaciar();
    expect(registro.estado().ultimoError).toBe('sin red');
    registro.encolar([anadir as never]);
    await registro.vaciar();
    expect(registro.estado()).toMatchObject({ ultimoError: null, enviados: 1, perdidos: 1 });
  });

  it('solo se crea con URL y secreto', () => {
    expect(registroSheetsDesdeEntorno({})).toBeNull();
    expect(registroSheetsDesdeEntorno({ SHEETS_WEBHOOK_URL: 'http://x' })).toBeNull();
    expect(registroSheetsDesdeEntorno({ SHEETS_WEBHOOK_URL: 'http://x', SHEETS_SECRET: 's' })).not.toBeNull();
  });
});
