import { useState } from 'preact/hooks';
import { BALANCE } from '../engine';
import { Configuracion } from './Configuracion';
import { useCtx } from './contexto';
import { Interruptor } from './Interruptor';
import { cambiarCicloSegundos, detener, pausar, paso, play } from './juego';
import { PanelIA } from './PanelIA';
import { PILOTOS } from './piloto';
import { SelectorEscenario } from './SelectorEscenario';

const pct = (v: number) => `${Math.round(v)} %`;

/** Cara según la rentabilidad: ≥70 sonríe, 50–69 neutro, 30–49 preocupado, <30 enfadado. */
function emoji(rentabilidad: number): string {
  if (rentabilidad >= 70) return '😀';
  if (rentabilidad >= 50) return '😐';
  if (rentabilidad >= 30) return '😟';
  return '😠';
}

interface KpiProps {
  nombre: string;
  valor: number | string;
  /** Fuente mayor (Rentabilidad). */
  grande?: boolean;
  /** Sin color de nivel (para valores que no son un porcentaje, como el ciclo). */
  neutro?: boolean;
}

function Kpi({ nombre, valor, grande = false, neutro = false }: KpiProps) {
  const nivel = neutro || typeof valor === 'string' ? 'neutro' : valor >= 70 ? 'bien' : valor >= 40 ? 'medio' : 'mal';
  return (
    <div class={`kpi ${nivel}${grande ? ' grande' : ''}`}>
      <span class="kpi-nombre">{nombre}</span>
      <span class="kpi-valor">{typeof valor === 'number' && !neutro ? pct(valor) : valor}</span>
    </div>
  );
}

/** Etiqueta y cuadro de texto que solo muestra un valor (mismo formato que los campos editables). */
function CampoLectura({ etiqueta, valor, titulo }: { etiqueta: string; valor: string | number; titulo?: string }) {
  return (
    <label class="campo" title={titulo}>
      {etiqueta}
      <input type="text" readOnly tabIndex={-1} value={String(valor)} />
    </label>
  );
}

const NOMBRE_FASE = { detenido: 'Listo', jugando: 'En juego', pausa: 'En pausa', terminado: 'Terminada' } as const;

export function Cabecera() {
  const { j, setJ, mostrarInforme, setMostrarInforme, apiActiva, setApiActiva, estadoApi, piloto, setPiloto } = useCtx();
  const [iaAbierto, setIaAbierto] = useState(false);
  const [configAbierta, setConfigAbierta] = useState(false);
  const { okr } = j.estado;
  const jugando = j.fase === 'jugando';
  const terminado = j.fase === 'terminado';
  const pendientes = j.limitar ? Math.max(0, j.totalCiclos - j.estado.ciclo) : '∞';

  return (
    <header class="cabecera">
      <div class="okr">
        <div class="botones-control">
          <button class="btn icono primario" disabled={jugando || terminado} onClick={() => setJ(play)} title="Play" aria-label="Play">
            ▶
          </button>
          <button class="btn icono" disabled={!jugando} onClick={() => setJ(pausar)} title="Pause" aria-label="Pause">
            ⏸
          </button>
          <button class="btn icono" disabled={terminado} onClick={() => setJ(detener)} title="Stop" aria-label="Stop">
            ⏹
          </button>
          <button class="btn icono" disabled={jugando || terminado} onClick={() => setJ(paso)} title="Paso: avanza un ciclo" aria-label="Paso">
            ⏭
          </button>
        </div>
        <Kpi nombre="Cumplimiento" valor={okr.cumplimiento} />
        <Kpi nombre="Productividad" valor={okr.productividad} />
        <Kpi nombre="Entrega" valor={okr.entrega} />
        <Kpi nombre="Rentabilidad" valor={okr.rentabilidad} grande />
        <Kpi nombre="Ciclo" valor={j.estado.ciclo} neutro />
        <div class="emoji-kpi" title={`Estado según la rentabilidad (${Math.round(okr.rentabilidad)} %)`} role="img" aria-label="Estado de la fábrica">
          {emoji(okr.rentabilidad)}
        </div>
        <button class="btn engranaje" onClick={() => setConfigAbierta(true)} title="Configuración" aria-label="Configuración">
          ⚙
        </button>
      </div>

      <div class="controles">
        <button
          class="btn ia"
          disabled={jugando || terminado}
          onClick={() => setIaAbierto(true)}
          title="Solo con la partida parada o en pausa"
        >
          🤖 IA mode
        </button>
        <span class="fase">{NOMBRE_FASE[j.fase]}</span>

        <label class="campo" title="Quién juega: una persona o un bot en piloto automático">
          Piloto
          <select value={piloto} onChange={(e) => setPiloto(e.currentTarget.value)}>
            {PILOTOS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>

        <SelectorEscenario />

        <Interruptor
          marcado={apiActiva && estadoApi !== 'no-disponible'}
          onCambio={setApiActiva}
          desactivado={estadoApi === 'no-disponible'}
          etiqueta={`Conexión API${apiActiva ? (estadoApi === 'conectada' ? ' 🟢' : estadoApi === 'ocupada' ? ' 🟠' : '') : ''}`}
          titulo={
            estadoApi === 'no-disponible'
              ? 'No disponible: la API solo existe con npm run dev o npm run preview'
              : estadoApi === 'ocupada' && apiActiva
                ? 'Otra ventana de BrewFactory controla la API. Ciérrala para usar esta.'
                : estadoApi === 'conectada' && apiActiva
                  ? 'Una IA puede leer el estado en /api/estado y enviar acciones a /api/acciones'
                  : 'Permite que una IA juegue a través de la API HTTP local'
          }
        />

        <Interruptor marcado={j.limitar} onCambio={(v) => setJ((x) => ({ ...x, limitar: v }))} etiqueta="Limitar ciclos" />
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
        <CampoLectura etiqueta="Ciclos pendientes" valor={pendientes} />
        <CampoLectura etiqueta="Siguiente ciclo" valor={`${j.restante} s`} titulo="Tiempo que falta para resolver el ciclo" />
        <Interruptor marcado={mostrarInforme} onCambio={setMostrarInforme} etiqueta="Mostrar estado por ciclo" />

        <label class="campo campo-tiempo">
          Tiempo de ciclo: <b>{j.cicloSegundos} s</b>
          <input
            type="range"
            min={BALANCE.cicloSegundosRango.min}
            max={BALANCE.cicloSegundosRango.max}
            value={j.cicloSegundos}
            onInput={(e) => setJ((x) => cambiarCicloSegundos(x, Number(e.currentTarget.value)))}
          />
        </label>
      </div>
      {iaAbierto && <PanelIA onCerrar={() => setIaAbierto(false)} />}
      {configAbierta && <Configuracion onCerrar={() => setConfigAbierta(false)} />}
    </header>
  );
}
