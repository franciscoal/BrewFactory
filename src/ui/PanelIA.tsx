import { useState } from 'preact/hooks';
import { estadoParaIA, parsearAcciones } from '../engine';
import { useCtx } from './contexto';
import { aplicarAccionesIA } from './juego';

async function copiar(texto: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const area = document.createElement('textarea');
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
}

function descargar(nombre: string, texto: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function PanelIA({ onCerrar }: { onCerrar: () => void }) {
  const { j, setJ, resaltar } = useCtx();
  const [texto, setTexto] = useState('');
  const [mensajes, setMensajes] = useState<{ tipo: 'error' | 'ok'; texto: string }[]>([]);
  const [copiado, setCopiado] = useState(false);

  const estadoJson = JSON.stringify(estadoParaIA(j.estado, j.errores), null, 2);

  const aplicar = () => {
    const r = parsearAcciones(texto, j.estado);
    if ('error' in r) {
      setMensajes([{ tipo: 'error', texto: r.error }]);
      return;
    }
    const res = aplicarAccionesIA(j, r.acciones);
    setJ(res.juego);
    resaltar(res.cambios);
    const descartadas = res.errores.map((t) => ({ tipo: 'error' as const, texto: t }));
    if (descartadas.length === 0) {
      onCerrar();
    } else {
      setMensajes([{ tipo: 'ok', texto: 'Acciones aplicadas. Se descartaron estas:' }, ...descartadas]);
    }
  };

  const cargarArchivo = async (archivo: File | undefined) => {
    if (archivo) setTexto(await archivo.text());
  };

  return (
    <div class="modal-fondo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div class="modal ia" role="dialog" aria-label="Modo IA">
        <header class="ia-cab">
          <h2>Modo IA</h2>
          <button class="btn" onClick={onCerrar}>
            Cerrar
          </button>
        </header>

        <div class="ia-columnas">
          <section>
            <h3>1. Estado para la IA</h3>
            <p class="vacio izq">Cópialo y pégalo en la IA. Incluye reglas, pedidos, líneas, muelles y el informe del ciclo anterior.</p>
            <textarea readOnly value={estadoJson} rows={14} />
            <div class="botones">
              <button
                class="btn primario"
                onClick={async () => {
                  await copiar(estadoJson);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1500);
                }}
              >
                {copiado ? '✔ Copiado' : 'Copiar estado'}
              </button>
              <button class="btn" onClick={() => descargar(`brewfactory-estado-ciclo${j.estado.ciclo}.json`, estadoJson)}>
                Descargar
              </button>
            </div>
          </section>

          <section>
            <h3>2. Acciones de la IA</h3>
            <p class="vacio izq">Pega el JSON de acciones que devuelva la IA, o cárgalo desde un archivo.</p>
            <textarea
              value={texto}
              rows={14}
              placeholder='{ "comentario": "...", "lineas": [ { "id": 1, "encendida": true, "velocidad": "estandar", "actual": "P-1", "siguiente": null } ], "muelles": [null, null] }'
              onInput={(e) => setTexto(e.currentTarget.value)}
            />
            <div class="botones">
              <button class="btn primario" disabled={texto.trim() === ''} onClick={aplicar}>
                Aplicar acciones
              </button>
              <label class="btn archivo">
                Cargar archivo…
                <input type="file" accept=".json,application/json" onChange={(e) => cargarArchivo(e.currentTarget.files?.[0])} />
              </label>
            </div>
            <ul class="mensajes">
              {mensajes.map((m, i) => (
                <li key={i} class={m.tipo}>
                  {m.texto}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
