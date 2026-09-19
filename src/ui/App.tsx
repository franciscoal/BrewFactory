import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { Estado } from '../engine';
import { Cabecera } from './Cabecera';
import { Ctx } from './contexto';
import { Demanda } from './Demanda';
import { Muelles, Stock } from './Expediciones';
import { FinPartida } from './FinPartida';
import { InformeCiclo } from './InformeCiclo';
import { juegoNuevo, tick, vistaDe } from './juego';
import type { Cambios, Juego, Resultado } from './juego';
import { Lineas } from './Lineas';
import { Resultados } from './Resultados';

export function App() {
  const [j, setJ] = useState<Juego>(() => juegoNuevo());
  const [arrastre, setArrastre] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [mostrarInforme, setMostrarInforme] = useState(false);
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

  const ctx = {
    j,
    setJ,
    vista,
    arrastre,
    setArrastre,
    resaltado,
    resaltar,
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
        {j.comentarioIA && (
          <div class="comentario-ia" role="status">
            <b>🤖 Razonamiento de la IA:</b> {j.comentarioIA}
          </div>
        )}
        {mostrarInforme && <InformeCiclo />}
        <main class="tablero">
          <Demanda />
          <Lineas />
          <Stock />
          <Muelles />
          <Resultados />
        </main>
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
