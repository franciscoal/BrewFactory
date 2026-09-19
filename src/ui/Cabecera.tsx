import { BALANCE } from '../engine';
import { useCtx } from './contexto';
import { cambiarCicloSegundos, detener, pausar, paso, play } from './juego';

const pct = (v: number) => `${Math.round(v)} %`;

function Kpi({ nombre, valor, grande = false }: { nombre: string; valor: number; grande?: boolean }) {
  const nivel = valor >= 70 ? 'bien' : valor >= 40 ? 'medio' : 'mal';
  return (
    <div class={`kpi ${nivel}${grande ? ' grande' : ''}`}>
      <span class="kpi-nombre">{nombre}</span>
      <span class="kpi-valor">{pct(valor)}</span>
    </div>
  );
}

export function Cabecera() {
  const { j, setJ } = useCtx();
  const { okr } = j.estado;
  const jugando = j.fase === 'jugando';
  const terminado = j.fase === 'terminado';
  const pendientes = j.limitar ? Math.max(0, j.totalCiclos - j.estado.ciclo) : '∞';

  return (
    <header class="cabecera">
      <div class="okr">
        <h2>OKR</h2>
        <Kpi nombre="Cumplimiento" valor={okr.cumplimiento} />
        <Kpi nombre="Productividad" valor={okr.productividad} grande />
        <Kpi nombre="Entrega" valor={okr.entrega} />
        <Kpi nombre="Rentabilidad" valor={okr.rentabilidad} />
      </div>

      <div class="controles">
        <div class="botones">
          <button class="btn primario" disabled={jugando || terminado} onClick={() => setJ(play)}>
            ▶ Play
          </button>
          <button class="btn" disabled={!jugando} onClick={() => setJ(pausar)}>
            ⏸ Pause
          </button>
          <button class="btn" disabled={terminado} onClick={() => setJ(detener)}>
            ⏹ Stop
          </button>
          <button class="btn" disabled={jugando || terminado} onClick={() => setJ(paso)} title="Avanza un ciclo">
            ⏭ Paso
          </button>
        </div>

        <div class="reloj">
          <span class="fase">{{ detenido: 'Listo', jugando: 'En juego', pausa: 'En pausa', terminado: 'Terminada' }[j.fase]}</span>
          <span>
            Ciclo <b>{j.estado.ciclo}</b>
          </span>
          <span>
            Siguiente en <b>{j.restante} s</b>
          </span>
        </div>

        <div class="ajustes">
          <label class="campo">
            Tiempo de ciclo: <b>{j.cicloSegundos} s</b>
            <input
              type="range"
              min={BALANCE.cicloSegundosRango.min}
              max={BALANCE.cicloSegundosRango.max}
              value={j.cicloSegundos}
              onInput={(e) => setJ((x) => cambiarCicloSegundos(x, Number(e.currentTarget.value)))}
            />
          </label>
          <label class="campo">
            Ciclos totales
            <input
              type="number"
              min={1}
              value={j.totalCiclos}
              disabled={!j.limitar}
              onInput={(e) => setJ((x) => ({ ...x, totalCiclos: Math.max(1, Number(e.currentTarget.value) || 1) }))}
            />
          </label>
          <label class="toggle">
            <input
              type="checkbox"
              checked={j.limitar}
              onChange={(e) => setJ((x) => ({ ...x, limitar: e.currentTarget.checked }))}
            />
            Limitar ciclos
          </label>
          <span class="pendientes">
            Ciclos pendientes: <b>{pendientes}</b>
          </span>
        </div>
      </div>
    </header>
  );
}
