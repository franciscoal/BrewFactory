import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Estado } from '../engine';
import type { Juego, Resultado } from './juego';

export interface Contexto {
  j: Juego;
  setJ: (cambio: Juego | ((anterior: Juego) => Juego)) => void;
  /** Estado con el plan aplicado: lo que se dibuja. */
  vista: Estado;
  /** Id del pedido que se está arrastrando, si hay alguno. */
  arrastre: string | null;
  setArrastre: (id: string | null) => void;
  /** Aplica una operación de edición del plan; si no es válida, muestra el aviso. */
  hacer: (op: (vista: Estado) => Resultado) => void;
  /** Comprueba (sin aplicar) si una operación sería válida; sirve para resaltar destinos. */
  esValida: (op: (vista: Estado) => Resultado) => boolean;
}

export const Ctx = createContext<Contexto>(null as unknown as Contexto);
export const useCtx = (): Contexto => useContext(Ctx);
