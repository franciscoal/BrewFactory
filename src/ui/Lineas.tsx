import { BALANCE, previsionProduccion } from '../engine';
import type { Linea, Velocidad } from '../engine';
import { useCtx } from './contexto';
import { opAsignar, opEncender, opIntercambiar, opQuitar, opVelocidad } from './juego';
import { PedidoCard } from './PedidoCard';

const VELOCIDADES: { id: Velocidad; nombre: string }[] = [
  { id: 'alta', nombre: 'Alta' },
  { id: 'estandar', nombre: 'Estándar' },
  { id: 'baja', nombre: 'Baja' },
];

function LineaPanel({ linea, botellas }: { linea: Linea; botellas: number }) {
  const { vista, arrastre, setArrastre, hacer, esValida, resaltado } = useCtx();
  const pedido =(id: string | null) => vista.pedidos.find((p) => p.id === id);
  const actual = pedido(linea.actual);
  const siguiente = pedido(linea.siguiente);
  const activa = linea.encendida && actual !== undefined;
  const impacto = activa ? BALANCE.velocidades[linea.velocidad].productividad : 0;

  const zona = (hueco: 'actual' | 'siguiente') => {
    const valida = arrastre !== null && esValida((v) => opAsignar(v, arrastre, linea.id, hueco));
    return {
      class: `hueco ${hueco}${valida ? ' destino' : ''}${arrastre !== null && !valida ? ' rechazo' : ''}`,
      onDragOver: (ev: DragEvent) => {
        if (valida) ev.preventDefault();
      },
      onDrop: (ev: DragEvent) => {
        ev.preventDefault();
        const id = ev.dataTransfer?.getData('text/plain') || arrastre;
        setArrastre(null);
        if (id) hacer((v) => opAsignar(v, id, linea.id, hueco));
      },
    };
  };

  return (
    <div class={`linea${linea.encendida ? '' : ' apagada'}${activa ? ' activa' : ''}${resaltado?.lineas.includes(linea.id) ? ' resaltado' : ''}`}>
      <header class="linea-cab">
        <h3>Línea {linea.id}</h3>
        <span class="estado-linea">{!linea.encendida ? 'apagada' : activa ? 'activa' : 'sin pedido'}</span>
        <label class="interruptor" title="Encender / apagar la línea">
          <input
            type="checkbox"
            checked={linea.encendida}
            onChange={(e) => hacer((v) => opEncender(v, linea.id, e.currentTarget.checked))}
          />
          <span class="pista" />
        </label>
      </header>

      <div class="linea-cuerpo">
        <div {...zona('siguiente')}>
          <span class="hueco-titulo">Siguiente</span>
          {siguiente ? (
            <PedidoCard pedido={siguiente} compacta onQuitar={() => hacer((v) => opQuitar(v, linea.id, 'siguiente'))} />
          ) : (
            <span class="hueco-vacio">Suelta aquí</span>
          )}
        </div>

        <button
          class="intercambio"
          title="Intercambiar actual y siguiente"
          disabled={!actual || !siguiente}
          onClick={() => hacer((v) => opIntercambiar(v, linea.id))}
        >
          ⇄
        </button>

        <div {...zona('actual')}>
          <span class="hueco-titulo">Actual</span>
          {actual ? (
            <PedidoCard pedido={actual} onQuitar={() => hacer((v) => opQuitar(v, linea.id, 'actual'))} />
          ) : (
            <span class="hueco-vacio">{linea.encendida ? 'Suelta aquí' : 'Línea apagada'}</span>
          )}
        </div>

        <div class="velocidades" role="radiogroup" aria-label={`Velocidad línea ${linea.id}`}>
          {VELOCIDADES.map((v) => (
            <button
              key={v.id}
              role="radio"
              aria-checked={linea.velocidad === v.id}
              class={`velocidad${linea.velocidad === v.id ? ' elegida' : ''}`}
              disabled={!linea.encendida}
              onClick={() => hacer((vi) => opVelocidad(vi, linea.id, v.id))}
            >
              <b>{v.nombre}</b>
              <small>
                {BALANCE.velocidades[v.id].botellas} bot. · {BALANCE.velocidades[v.id].productividad > 0 ? '+' : ''}
                {BALANCE.velocidades[v.id].productividad} %
              </small>
            </button>
          ))}
        </div>
      </div>

      <footer class="linea-pie">
        Próximo ciclo: <b>+{botellas}</b> botellas · Productividad{' '}
        <b class={impacto > 0 ? 'pos' : impacto < 0 ? 'neg' : ''}>
          {impacto > 0 ? '+' : ''}
          {impacto} %
        </b>
      </footer>
    </div>
  );
}

export function Lineas() {
  const { vista } = useCtx();
  const prevision = previsionProduccion(vista);
  return (
    <section class="panel lineas">
      <header class="panel-cab">
        <h2>Líneas de producción</h2>
      </header>
      <div class="lista">
        {vista.lineas.map((l) => (
          <LineaPanel key={l.id} linea={l} botellas={prevision.get(l.id) ?? 0} />
        ))}
      </div>
    </section>
  );
}
