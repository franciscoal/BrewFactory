import { useEffect, useRef, useState } from 'preact/hooks';
import { ControlIA, etiquetaPaso, SOLICITUD_INICIAL } from './controlIA';
import type { SolicitudIA } from './controlIA';
import { pedirDecision } from './ia';
import type { Cambios, Juego } from './juego';

const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

export interface ControlIAUi {
  solicitud: SolicitudIA;
  /** Pulsación de ⏭ en el modo paso a paso. */
  avanzar: () => void;
  /** Qué hará la próxima pulsación de ⏭. */
  etiquetaPaso: string;
}

/**
 * Conecta el ControlIA con React. Con el piloto IA en modo autónomo, al pulsar Play la IA juega sola;
 * en modo paso a paso, cada pulsación de ⏭ hace lo siguiente (pedir, aplicar, resolver).
 */
export function useControlIA(ia: boolean, autonomo: boolean, j: Juego, setJ: (j: Juego) => void, resaltar: (c: Cambios) => void): ControlIAUi {
  const jRef = useRef(j);
  jRef.current = j;
  const resaltarRef = useRef(resaltar);
  resaltarRef.current = resaltar;
  const [solicitud, setSolicitud] = useState<SolicitudIA>(SOLICITUD_INICIAL);

  const control = useRef<ControlIA>();
  if (!control.current) {
    control.current = new ControlIA({
      leer: () => jRef.current,
      escribir: (nuevo) => {
        jRef.current = nuevo;
        setJ(nuevo);
      },
      resaltar: (c) => resaltarRef.current(c),
      pedir: pedirDecision,
      publicar: setSolicitud,
    });
  }

  // Al dejar el piloto IA o empezar otra partida se olvida la propuesta anterior.
  useEffect(() => {
    control.current!.reiniciar();
    return () => control.current!.cancelar();
  }, [ia, j.estado.semilla]);

  // Modo autónomo: mientras la partida esté en marcha, la IA decide, se aplica y se resuelve el ciclo.
  useEffect(() => {
    if (!ia || !autonomo || j.fase !== 'jugando') return;
    let cancelado = false;
    control.current!.autonomo(esperar, () => cancelado).catch(() => undefined);
    return () => {
      cancelado = true;
      control.current!.cancelar();
    };
  }, [ia, autonomo, j.fase]);

  return { solicitud, avanzar: () => void control.current!.avanzar(), etiquetaPaso: etiquetaPaso(solicitud, j) };
}
