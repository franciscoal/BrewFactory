import type { Pedido } from '../engine';
import { useCtx } from './contexto';

interface Props {
  pedido: Pedido;
  /** Permite arrastrar la tarjeta. */
  arrastrable?: boolean;
  /** Muestra un botón ✕ que llama a esta función. */
  onQuitar?: () => void;
  compacta?: boolean;
}

export function PedidoCard({ pedido: p, arrastrable = false, onQuitar, compacta = false }: Props) {
  const { vista, setArrastre, arrastre } = useCtx();
  const lineas = vista.lineas.filter((l) => l.actual === p.id || l.siguiente === p.id);
  const asociado = lineas.length > 0;
  const clase = ['card', p.terminado ? 'terminado' : asociado ? 'asociado' : p.producido > 0 ? 'parcial' : ''];
  if (arrastre === p.id) clase.push('arrastrando');
  const contadorClase = p.contador < 0 ? 'retraso' : p.contador <= 1 ? 'urgente' : '';

  return (
    <div
      class={clase.join(' ')}
      draggable={arrastrable}
      onDragStart={(ev) => {
        ev.dataTransfer?.setData('text/plain', p.id);
        if (ev.dataTransfer) ev.dataTransfer.effectAllowed = 'move';
        setArrastre(p.id);
      }}
      onDragEnd={() => setArrastre(null)}
    >
      <div class="card-cab">
        <strong>{p.id}</strong>
        {p.terminado && <span class="etiqueta ok">✔ terminado</span>}
        {lineas.map((l) => (
          <span key={l.id} class="etiqueta linea">
            L{l.id}
            {l.siguiente === p.id ? ' ▸' : ''}
          </span>
        ))}
        {onQuitar && (
          <button class="quitar" title="Quitar" onClick={onQuitar}>
            ✕
          </button>
        )}
      </div>
      <div class="card-datos">
        <span>
          Pedido <b>{p.cantidad}</b>
        </span>
        <span>
          Pendiente <b>{p.cantidad - p.producido}</b>
        </span>
        {!compacta && (
          <span>
            Entrega orig. <b>{p.ciclosEntregaIniciales}</b>
          </span>
        )}
        <span class={contadorClase}>
          Quedan <b>{p.contador}</b> ciclos
        </span>
      </div>
    </div>
  );
}
