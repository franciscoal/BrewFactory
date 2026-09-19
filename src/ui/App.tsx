import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Estado } from '../engine';
import { Cabecera } from './Cabecera';
import { useConexionApi } from './conexionApi';
import { Ctx } from './contexto';
import { Demanda } from './Demanda';
import { Muelles, Stock } from './Expediciones';
import { FinPartida } from './FinPartida';
import { InformeCiclo } from './InformeCiclo';
import { juegoNuevo, tick, vistaDe } from './juego';
import type { Cambios, Juego, Resultado } from './juego';
import { consultarIA } from './ia';
import type { DisponibilidadIA } from './ia';
import { MANUAL, modoPorDefecto, usePiloto } from './piloto';
import type { TipoPiloto } from './piloto';
import { Lineas } from './Lineas';
import { Razonamiento } from './Razonamiento';
import { Resultados } from './Resultados';
import { useControlIA } from './useControlIA';

export function App() {
  const [j, setJ] = useState<Juego>(() => juegoNuevo());
  const [arrastre, setArrastre] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mostrarInforme, setMostrarInforme] = useState(false);
  const [apiActiva, setApiActiva] = useState(true);
  const [tipoPiloto, setTipoPiloto] = useState<TipoPiloto>('usuario');
  const [modo, setModo] = useState(MANUAL);
  const [iaDisponible, setIaDisponible] = useState<DisponibilidadIA>({ disponible: false, modelo: null });
  const [pestana, setPestana] = useState<'fabrica' | 'resultados'>('fabrica');
  const [resaltado, setResaltado] = useState<Cambios | null>(null);
  const temporizadorResaltado = useRef<number>();
  const temporizador = useRef<number>();

  // Reloj del ciclo: un tick por segundo mientras se juega.
  useEffect(() => {
    if (j.fase !== 'jugando') return;
    const id = setInterval(() => setJ(tick), 1000);
    return () => clearInterval(id);
  }, [j.fase]);

  const vista = useMemo(() => vistaDe(j.estado, j.plan), [j.estado, j.plan]);

  const mostrarAviso = (texto: string) => {
    setAviso(texto);
    clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setAviso(null), 3500);
  };

  const resaltar = (cambios: Cambios) => {
    setResaltado(cambios);
    clearTimeout(temporizadorResaltado.current);
    temporizadorResaltado.current = window.setTimeout(() => setResaltado(null), 4000);
  };

  const estadoApi = useConexionApi(apiActiva, j, setJ, resaltar);
  usePiloto(tipoPiloto === 'bot' ? modo : MANUAL, j, setJ, resaltar);
  const ia = useControlIA(tipoPiloto === 'ia', tipoPiloto === 'ia' && modo === 'autonomo', j, setJ, resaltar);

  // ¿Tiene el servidor la clave de la IA? Se vuelve a consultar al elegir el piloto IA (por si se acaba de configurar).
  useEffect(() => {
    consultarIA().then(setIaDisponible);
  }, [tipoPiloto === 'ia']);

  const ctx = {
    j,
    setJ,
    vista,
    arrastre,
    setArrastre,
    resaltado,
    resaltar,
    tipoPiloto,
    setTipoPiloto: (tipo: TipoPiloto) => {
      setTipoPiloto(tipo);
      setModo(modoPorDefecto(tipo));
    },
    modo,
    setModo,
    ia,
    iaDisponible,
    apiActiva,
    setApiActiva,
    estadoApi,
    mostrarInforme,
    setMostrarInforme,
    hacer: (op: (v: Estado) => Resultado) => {
      if (j.fase === 'terminado') return;
      const r = op(vista);
      if ('error' in r) mostrarAviso(r.error);
      else setJ((x) => ({ ...x, plan: r.plan }));
    },
    esValida: (op: (v: Estado) => Resultado) => j.fase !== 'terminado' && !('error' in op(vista)),
  };

  return (
    <Ctx.Provider value={ctx}>
      <div class="app">
        <Cabecera />
        {j.errores.length > 0 && (
          <div class="errores" role="status">
            Acciones descartadas en el último ciclo: {j.errores.join(' · ')}
          </div>
        )}
        <Razonamiento />
        {mostrarInforme && <InformeCiclo />}
        <nav class="pestanas" role="tablist">
          {(['fabrica', 'resultados'] as const).map((p) => (
            <button key={p} role="tab" aria-selected={pestana === p} class={`pestana${pestana === p ? ' activa' : ''}`} onClick={() => setPestana(p)}>
              {p === 'fabrica' ? '🍺 Fábrica' : '📈 Resultados'}
            </button>
          ))}
        </nav>
        {pestana === 'fabrica' ? (
          <main class="tablero">
            <Demanda />
            <Lineas />
            <Stock />
            <Muelles />
          </main>
        ) : (
          <main class="pagina-resultados">
            <Resultados />
          </main>
        )}
        {aviso && (
          <div class="aviso" role="alert">
            {aviso}
          </div>
        )}
        <FinPartida />
      </div>
    </Ctx.Provider>
  );
}
