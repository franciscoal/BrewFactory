import { useState } from 'preact/hooks';
import { useCtx } from './contexto';
import { juegoNuevo, mediaRentabilidad, resultadoJson } from './juego';

export function FinPartida() {
  const { j, setJ } = useCtx();
  const [oculto, setOculto] = useState(false);
  if (j.fase !== 'terminado' || oculto) return null;

  const guardar = () => {
    const blob = new Blob([resultadoJson(j)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `brewfactory-${j.estado.semilla}-${j.estado.ciclo}ciclos.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div class="modal-fondo">
      <div class="modal" role="dialog" aria-label="Partida terminada">
        <h2>Partida terminada</h2>
        <p>
          Ciclos jugados: <b>{j.estado.ciclo}</b>
        </p>
        <p class="puntuacion">
          Rentabilidad media: <b>{mediaRentabilidad(j.estado).toFixed(1)} %</b>
        </p>
        <p class="vacio">Semilla {j.estado.semilla}</p>
        <div class="botones">
          <button class="btn primario" onClick={guardar}>
            Guardar resultado
          </button>
          <button class="btn" onClick={() => setOculto(true)}>
            Ver tablero
          </button>
          <button
            class="btn"
            onClick={() => {
              setOculto(false);
              setJ(juegoNuevo());
            }}
          >
            Nueva partida
          </button>
        </div>
      </div>
    </div>
  );
}
