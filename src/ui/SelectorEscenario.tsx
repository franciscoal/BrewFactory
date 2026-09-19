import { useState } from 'preact/hooks';
import { parsearEscenario } from '../engine';
import type { Escenario } from '../engine';
import { ESCENARIOS } from '../escenarios';
import { useCtx } from './contexto';
import { juegoNuevo } from './juego';

const ALEATORIO = '__aleatorio__';

/** Elige la demanda de la partida. Solo se puede cambiar antes de empezar (ciclo 0). */
export function SelectorEscenario() {
  const { j, setJ } = useCtx();
  const [propios, setPropios] = useState<Escenario[]>([]);
  const [error, setError] = useState<string | null>(null);
  const editable = j.fase === 'detenido' && j.estado.ciclo === 0;
  const actual = j.estado.escenario;
  const todos = [...ESCENARIOS, ...propios];

  const elegir = (nombre: string) => {
    setError(null);
    setJ(juegoNuevo(undefined, nombre === ALEATORIO ? null : (todos.find((e) => e.nombre === nombre) ?? null)));
  };

  const cargar = async (archivo: File | undefined) => {
    if (!archivo) return;
    const r = parsearEscenario(await archivo.text());
    if ('error' in r) {
      setError(r.error);
      return;
    }
    setError(null);
    setPropios((p) => [...p.filter((e) => e.nombre !== r.escenario.nombre), r.escenario]);
    setJ(juegoNuevo(undefined, r.escenario));
  };

  return (
    <div class="ajustes">
      <label class="campo" title={actual?.descripcion ?? 'Demanda aleatoria generada por semilla'}>
        Escenario
        <select value={actual?.nombre ?? ALEATORIO} disabled={!editable} onChange={(e) => elegir(e.currentTarget.value)}>
          <option value={ALEATORIO}>Aleatorio</option>
          {todos.map((e) => (
            <option key={e.nombre} value={e.nombre}>
              {e.nombre}
            </option>
          ))}
        </select>
      </label>
      <label class={`btn archivo${editable ? '' : ' desactivado'}`}>
        Cargar escenario…
        <input type="file" accept=".json,application/json" disabled={!editable} onChange={(e) => cargar(e.currentTarget.files?.[0])} />
      </label>
      {error && (
        <span class="neg" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
