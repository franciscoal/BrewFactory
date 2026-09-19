import { useState } from 'preact/hooks';
import { useCtx } from './contexto';

async function copiar(texto: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    /* sin permiso de portapapeles: el texto sigue visible para copiarlo a mano */
  }
}

/** Ventana con la respuesta que ha devuelto nuestra API local (y, dentro, el texto exacto del modelo). */
function VentanaRespuesta({ json, onCerrar }: { json: string; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div class="modal-fondo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div class="modal ia" role="dialog" aria-label="Respuesta de la IA">
        <header class="ia-cab">
          <h2>Respuesta recibida de la IA</h2>
          <button class="btn" onClick={onCerrar}>
            Cerrar
          </button>
        </header>
        <p class="vacio izq">
          Es lo que devuelve nuestra API local (<code>POST /api/ia/decidir</code>): las acciones, el modelo, la latencia y, en{' '}
          <code>respuestaCruda</code>, el texto exacto que devolvió el modelo.
        </p>
        <textarea readOnly rows={20} value={json} />
        <div class="botones">
          <button
            class="btn primario"
            onClick={async () => {
              await copiar(json);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            }}
          >
            {copiado ? '✔ Copiado' : 'Copiar'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Franja bajo la cabecera con el razonamiento de quien juega (una IA, un bot o un agente externo).
 * Con el piloto IA muestra el estado de la petición, la decisión pendiente o aplicada y permite ver la respuesta recibida.
 */
export function Razonamiento() {
  const { j, tipoPiloto, modo, ia, iaDisponible } = useCtx();
  const [verJson, setVerJson] = useState(false);
  const s = ia.solicitud;

  if (tipoPiloto !== 'ia') {
    if (!j.comentarioIA) return null;
    return (
      <div class="comentario-ia" role="status">
        <b>🤖 Razonamiento:</b> {j.comentarioIA}
      </div>
    );
  }

  const p = s.propuesta;
  const modelo = p?.respuesta.modelo ?? iaDisponible.modelo;

  if (!iaDisponible.disponible && !p && !s.pensando) {
    return (
      <div class="comentario-ia error-ia" role="alert">
        <b>🤖 IA no disponible.</b>{' '}
        <small>
          No se encuentra <code>GEMINI_API_KEY</code>: crea <code>.env.local</code> con la clave y reinicia el servidor.
        </small>
      </div>
    );
  }

  return (
    <div class={`comentario-ia${s.error ? ' error-ia' : ''}`} role="status">
      {s.pensando && (
        <span class="pensando">
          <b>🤖 La IA está pensando…</b> {modelo && <small>({modelo})</small>}
        </span>
      )}
      {!s.pensando && s.error && (
        <span>
          <b>🤖 La IA no ha podido decidir:</b> {s.error}
          {modo === 'paso' ? ' Pulsa ⏭ para reintentar.' : ''}
        </span>
      )}
      {!s.pensando && !s.error && p && (
        <>
          <span>
            <b>🤖 Razonamiento de la IA:</b> {p.respuesta.comentario ?? p.acciones.comentario ?? '(sin comentario)'}
          </span>
          <small class="meta">
            {p.respuesta.modelo} · {(p.respuesta.latenciaMs / 1000).toFixed(1)} s{p.respuesta.intentos > 1 ? ' · reintentada' : ''} ·{' '}
            {p.aplicada ? 'aplicada' : modo === 'paso' ? 'pendiente: pulsa ⏭ para aplicarla' : 'aplicando…'}
          </small>
        </>
      )}
      {!s.pensando && !s.error && !p && (
        <span>
          <b>🤖 IA lista</b> ({modelo ?? 'sin modelo'}):{' '}
          {modo === 'paso' ? 'pulsa ⏭ para pedirle la primera decisión.' : 'pulsa ▶ para que juegue sola.'}
        </span>
      )}
      {p && (
        <button class="btn pequeno" onClick={() => setVerJson(true)}>
          Ver respuesta
        </button>
      )}
      {verJson && p && <VentanaRespuesta json={JSON.stringify(p.respuesta, null, 2)} onCerrar={() => setVerJson(false)} />}
    </div>
  );
}
