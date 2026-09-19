import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { crearApi } from './api';

let servidor: Server | undefined;
let cerrarApi: (() => void) | undefined;

async function arrancar(opciones = {}) {
  const api = crearApi({ esperaMs: 400, conexionMs: 300, rutaSkill: 'Docs/skill-jugar-brewfactory.md', ...opciones });
  servidor = createServer((req, res) => void api.manejador(req, res));
  cerrarApi = api.cerrar;
  await new Promise<void>((ok) => servidor!.listen(0, '127.0.0.1', ok));
  const base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  const pedir = (ruta: string, init?: RequestInit) => fetch(`${base}${ruta}`, init);
  const post = (ruta: string, cuerpo: unknown) =>
    pedir(ruta, { method: 'POST', body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) });
  return { pedir, post };
}

/** Simula la interfaz: publica el estado y contesta a las órdenes pendientes. */
async function interfaz(h: Awaited<ReturnType<typeof arrancar>>, responder: (p: { id: number; tipo: string; texto?: string }) => object) {
  await h.post('/interno/publicar?c=A', { juego: 'BrewFactory', ciclo: 4 });
  const pendientes = (await (await h.pedir('/interno/pendientes?c=A')).json()) as { id: number; tipo: string; texto?: string }[];
  for (const p of pendientes) await h.post('/interno/resultado?c=A', { id: p.id, ...responder(p) });
  return pendientes;
}

afterEach(async () => {
  cerrarApi?.();
  await new Promise<void>((ok) => (servidor ? servidor.close(() => ok()) : ok()));
  servidor = undefined;
});

describe('API para la IA', () => {
  it('sin interfaz conectada responde 503', async () => {
    const h = await arrancar();
    expect((await h.pedir('/estado')).status).toBe(503);
    expect((await h.post('/acciones', '{}')).status).toBe(503);
    expect((await h.post('/paso', '')).status).toBe(503);
  });

  it('el agente lee el estado que publica la interfaz', async () => {
    const h = await arrancar();
    await h.post('/interno/publicar?c=A', { juego: 'BrewFactory', ciclo: 7 });
    const r = await h.pedir('/estado');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ juego: 'BrewFactory', ciclo: 7 });
  });

  it('se considera desconectada tras un rato sin señales', async () => {
    const h = await arrancar({ conexionMs: 80 });
    await h.post('/interno/publicar?c=A', { ciclo: 1 });
    expect((await h.pedir('/estado')).status).toBe(200);
    await new Promise((ok) => setTimeout(ok, 120));
    expect((await h.pedir('/estado')).status).toBe(503);
  });

  it('las acciones llegan a la interfaz y el agente recibe su respuesta', async () => {
    const h = await arrancar();
    await h.post('/interno/publicar?c=A', { ciclo: 4 });
    const envio = h.post('/acciones', { comentario: 'hola', lineas: [] });
    await new Promise((ok) => setTimeout(ok, 30));
    const pendientes = await interfaz(h, (p) => ({ ok: true, errores: ['Línea 3: el pedido ZZ no existe. Se ignora.'], ciclo: 4, comentario: p.texto ? 'hola' : '' }));
    expect(pendientes).toHaveLength(1);
    expect(pendientes[0].tipo).toBe('acciones');
    expect(JSON.parse(pendientes[0].texto!)).toEqual({ comentario: 'hola', lineas: [] });
    const r = await envio;
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, ciclo: 4, descartadas: ['Línea 3: el pedido ZZ no existe. Se ignora.'] });
  });

  it('un paso devuelve el estado nuevo', async () => {
    const h = await arrancar();
    await h.post('/interno/publicar?c=A', { ciclo: 4 });
    const envio = h.post('/paso', '');
    await new Promise((ok) => setTimeout(ok, 30));
    await interfaz(h, () => ({ ok: true, ciclo: 5, estado: { ciclo: 5 } }));
    const r = await envio;
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, ciclo: 5, estado: { ciclo: 5 } });
  });

  it('un error de la interfaz llega al agente como 400', async () => {
    const h = await arrancar();
    await h.post('/interno/publicar?c=A', { ciclo: 4 });
    const envio = h.post('/acciones', '{}');
    await new Promise((ok) => setTimeout(ok, 30));
    await interfaz(h, () => ({ ok: false, error: 'Falta "lineas".' }));
    const r = await envio;
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: 'Falta "lineas".' });
  });

  it('si la interfaz no responde a tiempo, 504', async () => {
    const h = await arrancar({ esperaMs: 100 });
    await h.post('/interno/publicar?c=A', { ciclo: 4 });
    const r = await h.post('/paso', '');
    expect(r.status).toBe(504);
  });

  it('rechaza un cuerpo vacío en acciones, sirve el skill y responde 404 a rutas desconocidas', async () => {
    const h = await arrancar();
    await h.post('/interno/publicar?c=A', { ciclo: 4 });
    expect((await h.post('/acciones', '  ')).status).toBe(400);
    const skill = await h.pedir('/skill');
    expect(skill.status).toBe(200);
    expect(await skill.text()).toContain('jugar-brewfactory');
    expect((await h.pedir('/nada')).status).toBe(404);
  });

  it('si hay varias interfaces abiertas, solo la primera controla la API', async () => {
    const h = await arrancar({ conexionMs: 150 });
    expect((await h.post('/interno/publicar?c=A', { ciclo: 1 })).status).toBe(200);
    const otra = await h.post('/interno/publicar?c=B', { ciclo: 99 });
    expect(otra.status).toBe(409);
    expect(await otra.json()).toMatchObject({ ocupada: true });
    expect((await h.pedir('/interno/pendientes?c=B')).status).toBe(409);
    expect(await (await h.pedir('/estado')).json()).toEqual({ ciclo: 1 });
    // La primera deja de dar señales: la segunda toma el relevo y el estado antiguo se descarta.
    await new Promise((ok) => setTimeout(ok, 200));
    expect((await h.post('/interno/publicar?c=B', { ciclo: 99 })).status).toBe(200);
    expect(await (await h.pedir('/estado')).json()).toEqual({ ciclo: 99 });
    expect((await h.pedir('/interno/pendientes?c=A')).status).toBe(409);
  });

  it('permite peticiones desde otros orígenes (CORS)', async () => {
    const h = await arrancar();
    const r = await h.pedir('/estado', { method: 'OPTIONS' });
    expect(r.status).toBe(204);
    expect(r.headers.get('access-control-allow-origin')).toBe('*');
  });
});
