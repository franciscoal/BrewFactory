import { describe, expect, it } from 'vitest';
import { crearGemini, ErrorGemini, geminiDesdeEntorno, prepararSistema } from './gemini';

const acciones = { comentario: 'Todo a estándar', lineas: [{ id: 1, encendida: true, velocidad: 'estandar', actual: 'P-1', siguiente: null }], muelles: [null, null] };

/** Respuesta con el formato de generateContent. */
const respuesta = (texto: string, estado = 200) =>
  new Response(JSON.stringify(estado === 200 ? { candidates: [{ content: { parts: [{ text: texto }] }, finishReason: 'STOP' }], usageMetadata: { totalTokenCount: 321 } } : { error: { message: texto } }), {
    status: estado,
    headers: { 'Content-Type': 'application/json' },
  });

function conFetch(respuestas: Response[]) {
  const llamadas: { url: string; init: RequestInit }[] = [];
  const cliente = crearGemini({
    clave: 'clave-secreta',
    modelo: 'modelo-x',
    baseUrl: 'http://gemini.local/',
    esperar: async () => undefined,
    fetch: (async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return respuestas.shift()!;
    }) as unknown as typeof fetch,
  });
  return { cliente, llamadas };
}

describe('cliente de Gemini', () => {
  it('envía el estado, el sistema y el esquema, y devuelve las acciones', async () => {
    const { cliente, llamadas } = conFetch([respuesta(JSON.stringify(acciones))]);
    const r = await cliente.decidir({ juego: 'BrewFactory', ciclo: 3 }, 'INSTRUCCIONES');
    expect(r).toMatchObject({ acciones, comentario: 'Todo a estándar', modelo: 'modelo-x', intentos: 1, uso: { totalTokenCount: 321 } });
    expect(r.respuestaCruda).toBe(JSON.stringify(acciones));

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].url).toBe('http://gemini.local/v1beta/models/modelo-x:generateContent');
    const headers = llamadas[0].init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('clave-secreta');
    const cuerpo = JSON.parse(llamadas[0].init.body as string);
    expect(cuerpo.systemInstruction.parts[0].text).toBe('INSTRUCCIONES');
    expect(cuerpo.contents[0].parts[0].text).toContain('"ciclo":3');
    expect(cuerpo.generationConfig).toMatchObject({ responseMimeType: 'application/json' });
    expect(cuerpo.generationConfig.responseSchema.required).toEqual(['comentario', 'lineas', 'muelles']);
  });

  it('la clave viaja en la cabecera, nunca en la URL', async () => {
    const { cliente, llamadas } = conFetch([respuesta(JSON.stringify(acciones))]);
    await cliente.decidir({}, 's');
    expect(llamadas[0].url).not.toContain('clave-secreta');
  });

  it('repite una vez si la respuesta no es un JSON válido', async () => {
    const { cliente, llamadas } = conFetch([respuesta('esto no es json'), respuesta(JSON.stringify(acciones))]);
    const r = await cliente.decidir({}, 's');
    expect(r.intentos).toBe(2);
    expect(llamadas).toHaveLength(2);
    expect(JSON.parse(llamadas[1].init.body as string).contents[0].parts[1].text).toContain('no era válida');
  });

  it('falla si tras el reintento sigue sin ser válido', async () => {
    const { cliente } = conFetch([respuesta('nada'), respuesta('{"sinLineas":true}')]);
    await expect(cliente.decidir({}, 's')).rejects.toThrow(/no es un JSON de acciones válido/);
  });

  it('traduce los errores de Google a mensajes con pista', async () => {
    const casos: [number, RegExp][] = [
      [404, /GEMINI_MODEL/],
      [403, /GEMINI_API_KEY/],
      [429, /límite de peticiones/],
    ];
    for (const [estado, pista] of casos) {
      // Los errores pasajeros (429) se reintentan; los demás fallan a la primera.
      const { cliente } = conFetch([respuesta('detalle de Google', estado), respuesta('detalle de Google', estado), respuesta('detalle de Google', estado)]);
      const error = await cliente.decidir({}, 's').catch((e) => e as ErrorGemini);
      expect(error).toBeInstanceOf(ErrorGemini);
      expect((error as ErrorGemini).estado).toBe(estado);
      expect((error as ErrorGemini).message).toMatch(pista);
      expect((error as ErrorGemini).message).toContain('detalle de Google');
    }
  });

  it('reintenta solo los errores pasajeros (alta demanda) y lo refleja en los intentos', async () => {
    const { cliente, llamadas } = conFetch([respuesta('high demand', 503), respuesta('high demand', 503), respuesta(JSON.stringify(acciones))]);
    const r = await cliente.decidir({}, 's');
    expect(r.intentos).toBe(3);
    expect(llamadas).toHaveLength(3);

    const definitivo = conFetch([respuesta('x', 503), respuesta('x', 503), respuesta('x', 503), respuesta(JSON.stringify(acciones))]);
    await expect(definitivo.cliente.decidir({}, 's')).rejects.toThrow(/503/);
    expect(definitivo.llamadas).toHaveLength(3);

    const noReintenta = conFetch([respuesta('modelo inexistente', 404), respuesta(JSON.stringify(acciones))]);
    await expect(noReintenta.cliente.decidir({}, 's')).rejects.toThrow(/404/);
    expect(noReintenta.llamadas).toHaveLength(1);
  });

  it('avisa si Gemini no devuelve texto o bloquea la petición', async () => {
    const vacio = new Response(JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] }), { status: 200 });
    await expect(conFetch([vacio]).cliente.decidir({}, 's')).rejects.toThrow(/no devolvió texto.*SAFETY/);
    const bloqueada = new Response(JSON.stringify({ promptFeedback: { blockReason: 'OTHER' } }), { status: 200 });
    await expect(conFetch([bloqueada]).cliente.decidir({}, 's')).rejects.toThrow(/bloque/);
  });

  it('un fallo de red o un timeout llegan con estado 0', async () => {
    const cliente = crearGemini({
      clave: 'k',
      modelo: 'm',
      fetch: (async () => {
        throw new Error('sin conexión');
      }) as unknown as typeof fetch,
    });
    const error = (await cliente.decidir({}, 's').catch((e) => e)) as ErrorGemini;
    expect(error.estado).toBe(0);
    expect(error.message).toContain('sin conexión');
  });
});

describe('configuración', () => {
  it('sin clave no hay cliente; con clave usa el modelo por defecto o el indicado', () => {
    expect(geminiDesdeEntorno({})).toBeNull();
    expect(geminiDesdeEntorno({ GEMINI_API_KEY: '  ' })).toBeNull();
    expect(geminiDesdeEntorno({ GEMINI_API_KEY: 'k' })?.modelo).toBe('gemini-3.6-flash');
    expect(geminiDesdeEntorno({ GEMINI_API_KEY: 'k', GEMINI_MODEL: 'otro' })?.modelo).toBe('otro');
  });

  it('el sistema quita la cabecera y la parte de la API HTTP del skill', () => {
    const skill = '---\nname: x\n---\n# Skill\n\nContenido útil\n\n## Si juegas por la API HTTP\n\nNo aplica\n\n## Cómo lo usa la persona\n\nTampoco';
    const sistema = prepararSistema(skill);
    expect(sistema).toContain('Contenido útil');
    expect(sistema).toContain('Responde ÚNICAMENTE');
    expect(sistema).not.toContain('name: x');
    expect(sistema).not.toContain('No aplica');
    expect(sistema).not.toContain('Tampoco');
  });
});
