import { createContext } from 'preact';
import { useContext } from 'preact/hooks';
import type { Estado } from '../engine';
import type { EstadoApi } from './conexionApi';
import type { DisponibilidadIA } from './ia';
import type { Activos, EstadosRegistro } from './registroDecisiones';
import type { TipoPiloto } from './piloto';
import type { ControlIAUi } from './useControlIA';
import type { Cambios, Juego, Resultado } from './juego';

export interface Contexto {
  j: Juego;
  setJ: (cambio: Juego | ((anterior: Juego) => Juego)) => void;
  /** Estado con el plan aplicado: lo que se dibuja. */
  vista: Estado;
  /** Id del pedido que se está arrastrando, si hay alguno. */
  arrastre: string | null;
  setArrastre: (id: string | null) => void;
  /** Elementos que acaba de cambiar la IA; se resaltan unos segundos. */
  resaltado: Cambios | null;
  resaltar: (cambios: Cambios) => void;
  /** Quién juega (Usuario, Bot o IA) y cómo (manual, un bot concreto, o autónomo / paso a paso para la IA). */
  tipoPiloto: TipoPiloto;
  setTipoPiloto: (tipo: TipoPiloto) => void;
  modo: string;
  setModo: (modo: string) => void;
  /** Estado de la conversación con la IA y su control. */
  ia: ControlIAUi;
  iaDisponible: DisponibilidadIA;
  /** Conexión con la API HTTP local para la IA. */
  apiActiva: boolean;
  setApiActiva: (v: boolean) => void;
  estadoApi: EstadoApi;
  /** Registro de las decisiones (base de conocimiento) en Google Sheets y en PostgreSQL: un interruptor por destino. */
  registroActivo: Activos;
  setRegistroActivo: (destino: keyof Activos, activo: boolean) => void;
  registro: EstadosRegistro;
  /** Toggle «Mostrar estado por ciclo». */
  mostrarInforme: boolean;
  setMostrarInforme: (v: boolean) => void;
  /** Aplica una operación de edición del plan; si no es válida, muestra el aviso. */
  hacer: (op: (vista: Estado) => Resultado) => void;
  /** Comprueba (sin aplicar) si una operación sería válida; sirve para resaltar destinos. */
  esValida: (op: (vista: Estado) => Resultado) => boolean;
}

export const Ctx = createContext<Contexto>(null as unknown as Contexto);
export const useCtx = (): Contexto => useContext(Ctx);
