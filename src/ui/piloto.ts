import { useEffect, useMemo } from 'preact/hooks';
import { ESTRATEGIAS, NOMBRES_ESTRATEGIA } from '../bots/estrategias';
import type { Estrategia } from '../bots/estrategias';
import { explicarPlan } from '../bots/explicar';
import { aplicarAccionesIA } from './juego';
import type { Cambios, Juego } from './juego';

/** Valor del selector cuando juega una persona. */
export const MANUAL = 'manual';

/** Opciones del selector de piloto: la persona y cada bot. */
export const PILOTOS: { id: string; nombre: string }[] = [
  { id: MANUAL, nombre: 'Manual' },
  ...Object.entries(NOMBRES_ESTRATEGIA).map(([id, nombre]) => ({ id, nombre: `Bot: ${nombre}` })),
];

/** El bot decide la configuración de este ciclo y se aplica como si la hubiera puesto una IA (con resaltado y razonamiento). */
export function decidirPiloto(j: Juego, estrategia: Estrategia, nombre: string): { juego: Juego; cambios: Cambios } {
  const acciones = estrategia(j.estado);
  const res = aplicarAccionesIA(j, { ...acciones, comentario: explicarPlan(j.estado, acciones, nombre) });
  return { juego: { ...res.juego, decididoEn: j.estado.ciclo }, cambios: res.cambios };
}

/**
 * Piloto automático: al empezar cada ciclo (y al activarlo) el bot elegido configura la fábrica.
 * La persona puede recuperar el control con «Manual»; lo que edite durante el ciclo se respeta hasta el siguiente.
 */
export function usePiloto(piloto: string, j: Juego, setJ: (j: Juego) => void, resaltar: (c: Cambios) => void): void {
  const crear = ESTRATEGIAS[piloto];
  // Se recrea al cambiar de piloto o de partida (el bot aleatorio guarda su propia semilla).
  const estrategia = useMemo(() => (crear ? crear(j.estado.semilla) : null), [piloto, j.estado.semilla]);

  useEffect(() => {
    if (!estrategia || j.fase === 'terminado' || j.decididoEn === j.estado.ciclo) return;
    const r = decidirPiloto(j, estrategia, NOMBRES_ESTRATEGIA[piloto]);
    setJ(r.juego);
    resaltar(r.cambios);
  }, [estrategia, j.fase, j.estado.ciclo, j.decididoEn]);
}
