import { existsSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { loadEnv } from 'vite';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import { crearApi } from './servidor/api.ts';
import { geminiDesdeEntorno } from './servidor/gemini.ts';

/** Monta la API para la IA (servidor/api.ts) bajo /api en el servidor de desarrollo y en `vite preview`. */
function apiParaIA(env: Record<string, string>): Plugin {
  // La clave de Gemini se lee de .env.local en el servidor; nunca se expone al navegador.
  const api = crearApi({ ia: geminiDesdeEntorno(env) });
  return {
    name: 'brewfactory-api-ia',
    configureServer: (servidor) => void servidor.middlewares.use('/api', (req, res, siguiente) => void api.manejador(req, res, siguiente)),
    configurePreviewServer: (servidor) => void servidor.middlewares.use('/api', (req, res, siguiente) => void api.manejador(req, res, siguiente)),
  };
}

/**
 * Permite que el botón de configuración (⚙) guarde en el fichero `public/config/balance.json`
 * (y en `dist/config/` si existe una compilación). Solo existe en el servidor de desarrollo y en `vite preview`.
 */
function guardarConfiguracion(): Plugin {
  const manejador = (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('Solo POST');
      return;
    }
    let cuerpo = '';
    req.on('data', (trozo) => (cuerpo += trozo));
    req.on('end', () => {
      try {
        const json = JSON.parse(cuerpo);
        if (json === null || typeof json !== 'object' || Array.isArray(json)) throw new Error('Se esperaba un objeto JSON');
        const texto = `${JSON.stringify(json, null, 2)}\n`;
        writeFileSync(resolve('public/config/balance.json'), texto);
        if (existsSync(resolve('dist/config'))) writeFileSync(resolve('dist/config/balance.json'), texto);
        res.end('ok');
      } catch (err) {
        res.statusCode = 400;
        res.end(String((err as Error).message));
      }
    });
  };
  return {
    name: 'brewfactory-guardar-configuracion',
    configureServer: (servidor) => void servidor.middlewares.use('/__config', manejador),
    configurePreviewServer: (servidor) => void servidor.middlewares.use('/__config', manejador),
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [preact(), guardarConfiguracion(), apiParaIA(loadEnv(mode, process.cwd(), ''))],
  // Guardar la configuración no debe recargar la página (se perdería la partida en curso).
  server: { port: 5173, watch: { ignored: ['**/public/config/**'] } },
  test: { environment: 'node', include: ['src/**/*.test.ts', 'servidor/**/*.test.ts'] },
}));
