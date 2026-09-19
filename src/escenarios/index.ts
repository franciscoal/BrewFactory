import type { Escenario } from '../engine';
import entregasUrgentes from './entregas-urgentes.json';
import picoDemanda from './pico-demanda.json';
import tranquilo from './tranquilo.json';

/** Escenarios «enlatados» incluidos para la demo. */
export const ESCENARIOS: Escenario[] = [tranquilo, picoDemanda, entregasUrgentes];
