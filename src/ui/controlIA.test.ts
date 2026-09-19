import { describe, expect, it } from 'vitest';
import { usarBalanceOriginal } from '../engine/testing';
import { ControlIA, etiquetaPaso, SOLICITUD_INICIAL } from './controlIA';
import type { SolicitudIA } from './controlIA';
import type { RespuestaIA } from './ia';
import { juegoNuevo } from './juego';
import type { Juego } from './juego';

usarBalanceOriginal();

/** IA falsa: asigna los pedidos pendientes a las líneas y expide el primer terminado. */
function respuestaFalsa(estado: { pedidos: { id: string; estado: string }[]; ciclo: number }): RespuestaIA {
  const pendientes = estado.pedidos.filter((p) => p.estado !== 'terminado').map((p) => p.id);
  const terminado = estado.pedidos.find((p) => p.estado === 'terminado');
  return {
    ok: true,
    acciones: {
      comentario: `Decisión del ciclo ${estado.ciclo}`,
      lineas: [1, 2, 3, 4].map((id, i) => ({ id, encendida: true, velocidad: 'estandar', actual: pendientes[i] ?? null, siguiente: null })),
      muelles: [terminado?.id ?? null, null],
    },
    comentario: `Decisión del ciclo ${estado.ciclo}`,
    respuestaCruda: '{}',
    modelo: 'falso',
    latenciaMs: 10,
    intentos: 1,
  };
}

function entorno(partida: Juego, opciones: { fallar?: boolean; lenta?: () => Promise<void> } = {}) {
  const registro = { peticiones: 0, resaltados: 0, publicadas: [] as SolicitudIA[] };
  const e = {
    juego: partida,
    leer: () => e.juego,
    escribir: (j: Juego) => (e.juego = j),
    resaltar: () => void registro.resaltados++,
    publicar: (s: SolicitudIA) => void registro.publicadas.push(s),
    pedir: async (estado: never) => {
      registro.peticiones++;
      if (opciones.lenta) await opciones.lenta();
      if (opciones.fallar) throw new Error('Gemini respondió con un error (429).');
      return respuestaFalsa(estado);
    },
  };
  return { e, registro };
}

describe('IA paso a paso', () => {
  it('cada pulsación hace lo siguiente: pedir → aplicar → resolver y pedir', async () => {
    const { e, registro } = entorno(juegoNuevo(3));
    const control = new ControlIA(e);
    expect(etiquetaPaso(control.solicitud, e.juego)).toBe('Pedir una decisión a la IA');

    await control.avanzar(); // pide
    expect(registro.peticiones).toBe(1);
    expect(control.solicitud.propuesta).toMatchObject({ ciclo: 0, aplicada: false });
    expect(e.juego.plan.lineas[0].actual).toBeNull(); // todavía no se ha aplicado
    expect(etiquetaPaso(control.solicitud, e.juego)).toBe('Aplicar la decisión de la IA');

    await control.avanzar(); // aplica
    expect(control.solicitud.propuesta?.aplicada).toBe(true);
    expect(e.juego.plan.lineas[0].actual).toBe('P-1');
    expect(e.juego.estado.ciclo).toBe(0);
    expect(registro.resaltados).toBe(1);
    expect(etiquetaPaso(control.solicitud, e.juego)).toBe('Resolver el ciclo y pedir la siguiente decisión');

    await control.avanzar(); // resuelve el ciclo y pide la siguiente
    expect(e.juego.estado.ciclo).toBe(1);
    expect(registro.peticiones).toBe(2);
    expect(control.solicitud.propuesta).toMatchObject({ ciclo: 1, aplicada: false });
  });

  it('mientras la IA piensa, las pulsaciones no hacen nada', async () => {
    let soltar!: () => void;
    const { e, registro } = entorno(juegoNuevo(3), { lenta: () => new Promise<void>((ok) => (soltar = ok)) });
    const control = new ControlIA(e);
    const primera = control.avanzar();
    expect(control.solicitud.pensando).toBe(true);
    await control.avanzar();
    expect(registro.peticiones).toBe(1);
    soltar();
    await primera;
    expect(control.solicitud.pensando).toBe(false);
  });

  it('un error de la IA se muestra y la siguiente pulsación reintenta', async () => {
    const { e, registro } = entorno(juegoNuevo(3), { fallar: true });
    const control = new ControlIA(e);
    await control.avanzar();
    expect(control.solicitud).toMatchObject({ pensando: false, propuesta: null, error: 'Gemini respondió con un error (429).' });
    await control.avanzar();
    expect(registro.peticiones).toBe(2);
  });

  it('descarta una respuesta que llega tras cancelar', async () => {
    let soltar!: () => void;
    const { e } = entorno(juegoNuevo(3), { lenta: () => new Promise<void>((ok) => (soltar = ok)) });
    const control = new ControlIA(e);
    const espera = control.avanzar();
    control.cancelar();
    soltar();
    await espera;
    expect(control.solicitud).toEqual({ ...SOLICITUD_INICIAL });
  });

  it('las acciones descartadas por la IA llegan al estado siguiente', async () => {
    const { e } = entorno(juegoNuevo(3));
    e.pedir = async () => ({ ...respuestaFalsa({ pedidos: [], ciclo: 0 }), acciones: { lineas: [{ id: 1, actual: 'NO-EXISTE' }] } });
    const control = new ControlIA(e);
    await control.avanzar();
    await control.avanzar();
    await control.avanzar();
    expect(e.juego.errores).toEqual(['Línea 1: el pedido NO-EXISTE no existe. Se ignora.']);
  });
});

describe('IA autónoma', () => {
  const sinEspera = async () => undefined;

  it('juega sola hasta el límite de ciclos, sin tiempo de ciclo', async () => {
    const { e, registro } = entorno({ ...juegoNuevo(3), fase: 'jugando', limitar: true, totalCiclos: 4 });
    const control = new ControlIA(e);
    await control.autonomo(sinEspera, () => false);
    expect(e.juego.estado.ciclo).toBe(4);
    expect(e.juego.fase).toBe('terminado');
    expect(registro.peticiones).toBe(4);
    expect(e.juego.log).toHaveLength(4);
  });

  it('se detiene al cancelar y no resuelve más ciclos', async () => {
    const { e } = entorno({ ...juegoNuevo(3), fase: 'jugando' });
    const control = new ControlIA(e);
    let vueltas = 0;
    await control.autonomo(sinEspera, () => ++vueltas > 6);
    expect(e.juego.estado.ciclo).toBeLessThan(4);
    expect(e.juego.fase).toBe('jugando');
  });

  it('si la IA falla, deja la partida en pausa y conserva el error', async () => {
    const { e } = entorno({ ...juegoNuevo(3), fase: 'jugando' }, { fallar: true });
    const control = new ControlIA(e);
    await control.autonomo(sinEspera, () => false);
    expect(e.juego.fase).toBe('pausa');
    expect(e.juego.estado.ciclo).toBe(0);
    expect(control.solicitud.error).toContain('429');
  });

  it('no hace nada si la partida no está en marcha', async () => {
    const { e, registro } = entorno(juegoNuevo(3));
    await new ControlIA(e).autonomo(sinEspera, () => false);
    expect(registro.peticiones).toBe(0);
  });
});
