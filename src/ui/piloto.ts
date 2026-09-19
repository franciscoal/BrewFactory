import { useEffect, useMemo } from 'preact/hooks';
import { ESTRATEGIAS, NOMBRES_ESTRATEGIA } from '../bots/estrategias';
import type { Estrategia } from '../bots/estrategias';
import { explicarPlan } from '../bots/explicar';
import { aplicarAccionesIA } from './juego';
import type { Cambios, Juego } from './juego';

/** Modo de juego de una persona. */
export const MANUAL = 'manual';

export type TipoPiloto = 'usuario' | 'bot' | 'ia';

/** Primer desplegable de la cabecera: quién juega. */
export const TIPOS_PILOTO: { id: TipoPiloto; nombre: string }[] = [
  { id: 'usuario', nombre: 'Usuario' },
  { id: 'bot', nombre: 'Bot' },
  { id: 'ia', nombre: 'IA' },
];

/** Segundo desplegable: cómo juega. Depende del piloto. El primero de cada lista es el valor por defecto. */
export const MODOS: Record<TipoPiloto, { id: string; nombre: string }[]> = {
  usuario: [{ id: MANUAL, nombre: 'Manual' }],
  bot: Object.entries(NOMBRES_ESTRATEGIA).map(([id, nombre]) => ({ id, nombre })),
  ia: [
    { id: 'autonomo', nombre: 'Autónomo' },
    { id: 'paso', nombre: 'Paso a paso' },
  ],
};

export const modoPorDefecto = (tipo: TipoPiloto): string => MODOS[tipo][0].id;

/** El bot decide la configuración de este ciclo y se aplica como si la hubiera puesto una IA (con resaltado y razonamiento). */
export function decidirPiloto(j: Juego, estrategia: Estrategia, nombre: string): { juego: Juego; cambios: Cambios } {
  const acciones = estrategia(j.estado);
  const res = aplicarAccionesIA(j, { ...acciones, comentario: explicarPlan(j.estado, acciones, nombre) });
  return { juego: { ...res.juego, decididoEn: j.estado.ciclo }, cambios: res.cambios };
}

/**
 * Piloto automático de bots: al empezar cada ciclo (y al activarlo) el bot elegido configura la fábrica.
 * `bot` es el id del bot o cualquier otro valor (por ejemplo `manual`) para desactivarlo.
 * La persona puede recuperar el control cambiando a Usuario; lo que edite durante el ciclo se respeta hasta el siguiente.
 */
export function usePiloto(bot: string, j: Juego, setJ: (j: Juego) => void, resaltar: (c: Cambios) => void): void {
  const crear = ESTRATEGIAS[bot];
  // Se recrea al cambiar de bot o de partida (el bot aleatorio guarda su propia semilla).
  const estrategia = useMemo(() => (crear ? crear(j.estado.semilla) : null), [bot, j.estado.semilla]);

  useEffect(() => {
    if (!estrategia || j.fase === 'terminado' || j.decididoEn === j.estado.ciclo) return;
    const r = decidirPiloto(j, estrategia, NOMBRES_ESTRATEGIA[bot]);
    setJ(r.juego);
    resaltar(r.cambios);
  }, [estrategia, j.fase, j.estado.ciclo, j.decididoEn]);
}
