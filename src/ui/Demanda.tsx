import { useState } from 'preact/hooks';
import { colaDemanda } from '../engine';
import { useCtx } from './contexto';
import { Interruptor } from './Interruptor';
import { PedidoCard } from './PedidoCard';

export function Demanda() {
  const { vista } = useCtx();
  const [porVencimiento, setPorVencimiento] = useState(false);
  const cola = colaDemanda(vista, porVencimiento ? 'vencimiento' : 'generacion');

  return (
    <section class="panel demanda">
      <header class="panel-cab">
        <h2>📋 Demanda comercial</h2>
        <Interruptor marcado={porVencimiento} onCambio={setPorVencimiento} etiqueta="Ordenar por vencimiento" />
      </header>
      <div class="lista">
        {cola.length === 0 && <p class="vacio">Sin pedidos pendientes</p>}
        {cola.map((p) => (
          <PedidoCard key={p.id} pedido={p} arrastrable />
        ))}
      </div>
    </section>
  );
}
