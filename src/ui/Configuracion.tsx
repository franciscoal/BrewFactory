import { useState } from 'preact/hooks';
import original from '../config/balance-original.json';
import { aplicarBalance, BALANCE, validarBalance } from '../engine';
import type { Balance } from '../engine';
import { escribir, GRUPOS, guardarEnArchivo, leer } from './ajustes';
import { useCtx } from './contexto';
import { juegoNuevo } from './juego';

function descargar(nombre: string, texto: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
  a.download = nombre;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Panel ⚙: ajusta las cifras del juego y las guarda en el fichero de configuración. */
export function Configuracion({ onCerrar }: { onCerrar: () => void }) {
  const { j, setJ } = useCtx();
  const [borrador, setBorrador] = useState<Balance>(() => structuredClone(BALANCE));
  // Los campos son «no controlados» (permiten escribir negativos); al reemplazar el borrador se remontan.
  const [version, setVersion] = useState(0);
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const validacion = validarBalance(borrador);
  const invalido = 'error' in validacion;
  const sumaPesos = Object.values(borrador.pesosRentabilidad).reduce((s, v) => s + v, 0);

  const reemplazar = (b: Balance) => {
    setBorrador(structuredClone(b));
    setVersion((v) => v + 1);
    setMensaje(null);
  };

  /** Aplica el borrador a la partida. Si aún no ha empezado, se regenera con los nuevos valores manteniendo la semilla. */
  const aplicar = (): Balance | null => {
    if ('error' in validacion) return null;
    aplicarBalance(validacion.balance);
    if (j.fase === 'detenido' && j.estado.ciclo === 0) setJ(juegoNuevo(j.estado.semilla, j.estado.escenario));
    return validacion.balance;
  };

  const importar = async (archivo: File | undefined) => {
    if (!archivo) return;
    try {
      const r = validarBalance(JSON.parse(await archivo.text()));
      if ('error' in r) setMensaje({ tipo: 'error', texto: r.error });
      else {
        reemplazar(r.balance);
        setMensaje({ tipo: 'ok', texto: 'Configuración importada. Pulsa Aplicar o Guardar para usarla.' });
      }
    } catch {
      setMensaje({ tipo: 'error', texto: 'El archivo no es JSON válido.' });
    }
  };

  return (
    <div class="modal-fondo" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div class="modal config" role="dialog" aria-label="Configuración">
        <header class="ia-cab">
          <h2>⚙ Configuración del juego</h2>
          <button class="btn" onClick={onCerrar}>
            Cerrar
          </button>
        </header>
        <p class="vacio izq">
          Cambios de bonificación y penalización por acción. «Guardar» los escribe en <code>public/config/balance.json</code>, el mismo
          fichero que usa <code>npm run calibrar</code>. Los valores afectan a los ciclos siguientes; si la partida no ha empezado se
          reinicia con ellos.
        </p>

        <div class="config-grupos">
          {GRUPOS.map((g) => (
            <fieldset key={g.titulo} class="config-grupo">
              <legend>{g.titulo}</legend>
              {g.ayuda && <p class="vacio izq">{g.ayuda}</p>}
              {g.campos.map((c) => (
                <label key={`${version}-${c.ruta}`} class="config-campo">
                  <span>{c.etiqueta}</span>
                  <span class="config-valor">
                    <input
                      type="number"
                      step={c.paso ?? 1}
                      defaultValue={leer(borrador, c.ruta)}
                      onInput={(e) => {
                        const n = e.currentTarget.valueAsNumber;
                        if (!Number.isNaN(n)) setBorrador((b) => escribir(b, c.ruta, n));
                      }}
                    />
                    <small>{c.unidad ?? ''}</small>
                  </span>
                </label>
              ))}
              {g.titulo === 'Peso en la Rentabilidad' && (
                <p class={Math.abs(sumaPesos - 1) > 0.001 ? 'neg' : 'pos'}>Suma: {Math.round(sumaPesos * 1000) / 1000}</p>
              )}
            </fieldset>
          ))}
        </div>

        {invalido && <p class="neg">{validacion.error}</p>}
        {mensaje && <p class={mensaje.tipo === 'ok' ? 'pos' : 'neg'}>{mensaje.texto}</p>}

        <div class="botones config-pie">
          <button
            class="btn"
            disabled={invalido}
            onClick={() => {
              if (aplicar()) setMensaje({ tipo: 'ok', texto: 'Aplicado (sin guardar en archivo).' });
            }}
          >
            Aplicar
          </button>
          <button
            class="btn primario"
            disabled={invalido}
            onClick={async () => {
              const b = aplicar();
              if (!b) return;
              const r = await guardarEnArchivo(b);
              setMensaje({ tipo: r.ok ? 'ok' : 'error', texto: r.mensaje });
            }}
          >
            Guardar en archivo
          </button>
          <button class="btn" disabled={invalido} onClick={() => 'balance' in validacion && descargar('balance.json', `${JSON.stringify(validacion.balance, null, 2)}\n`)}>
            Exportar
          </button>
          <label class="btn archivo">
            Importar…
            <input type="file" accept=".json,application/json" onChange={(e) => importar(e.currentTarget.files?.[0])} />
          </label>
          <button class="btn" onClick={() => reemplazar(original as Balance)} title="Valores de la especificación inicial">
            Restaurar originales
          </button>
          <button class="btn" onClick={() => reemplazar(BALANCE)}>
            Descartar cambios
          </button>
        </div>
      </div>
    </div>
  );
}
