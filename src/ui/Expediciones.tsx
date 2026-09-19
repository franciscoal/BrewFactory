import { BALANCE, muelleActivo, stockExpediciones } from '../engine';
import { useCtx } from './contexto';
import { opMuelle } from './juego';
import { PedidoCard } from './PedidoCard';

export function Stock() {
  const { vista } = useCtx();
  const stock = stockExpediciones(vista);
  return (
    <section class="panel stock">
      <header class="panel-cab">
        <h2>📦 Stock de expediciones</h2>
      </header>
      <div class="lista">
        {stock.length === 0 && <p class="vacio">Stock vacío</p>}
        {stock.map((p) => (
          <PedidoCard key={p.id} pedido={p} arrastrable={p.terminado} compacta />
        ))}
      </div>
    </section>
  );
}

export function Muelles() {
  const { vista, arrastre, setArrastre, hacer, esValida, resaltado } = useCtx();
  return (
    <section class="panel muelles">
      <header class="panel-cab">
        <h2>🚚 Muelles</h2>
      </header>
      <div class="lista">
        {vista.muelles.map((asignado, i) => {
          const activo = muelleActivo(vista, i);
          const pedido = vista.pedidos.find((p) => p.id === asignado);
          const valido = arrastre !== null && esValida((v) => opMuelle(v, i, arrastre));
          return (
            <div
              key={i}
              class={`muelle${activo ? '' : ' inactivo'}${resaltado?.muelles.includes(i) ? ' resaltado' : ''}${valido ? ' destino' : ''}${arrastre !== null && !valido ? ' rechazo' : ''}`}
              onDragOver={(ev) => {
                if (valido) ev.preventDefault();
              }}
              onDrop={(ev) => {
                ev.preventDefault();
                const id = ev.dataTransfer?.getData('text/plain') || arrastre;
                setArrastre(null);
                if (id) hacer((v) => opMuelle(v, i, id));
              }}
            >
              <h3>Muelle {i + 1}</h3>
              {!activo && (
                <p class="vacio">
                  Inactivo: requiere {BALANCE.muelle2MinLineasActivas} líneas activas
                </p>
              )}
              {activo && !pedido && <p class="hueco-vacio">Suelta un pedido terminado</p>}
              {activo && pedido && <PedidoCard pedido={pedido} compacta onQuitar={() => hacer((v) => opMuelle(v, i, null))} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}
