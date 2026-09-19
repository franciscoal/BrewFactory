/**
 * Juega miles de partidas con bots para ver si las cifras del balance producen decisiones interesantes.
 * Uso: npm run calibrar [-- ciclos partidas --config=ruta/al/balance.json]
 * Sin --config usa public/config/balance.json (el mismo fichero que edita el botón de configuración).
 */
import { readFileSync } from 'node:fs';
import { aplicarBalance, validarBalance } from '../src/engine';
import { ESCENARIOS } from '../src/escenarios';
import { ESTRATEGIAS } from '../src/bots/estrategias';
import { jugar, resumir } from '../src/bots/simulador';

const args = process.argv.slice(2);
const ruta = args.find((a) => a.startsWith('--config='))?.slice('--config='.length) ?? 'public/config/balance.json';
const numeros = args.filter((a) => !a.startsWith('--'));
const ciclos = Number(numeros[0] ?? 48);
const partidas = Number(numeros[1] ?? 200);
const soloAleatorias = args.includes('--solo-aleatorias');
const fmt = (n: number) => Math.round(n * 10) / 10;

const datos = JSON.parse(readFileSync(ruta, 'utf8'));
// Pruebas rápidas sin tocar ficheros: --set=velocidades.alta.productividad=-4 (repetible)
for (const a of args.filter((x) => x.startsWith('--set='))) {
  const [camino, valor] = a.slice('--set='.length).split('=');
  const claves = camino.split('.');
  let nodo = datos;
  for (const k of claves.slice(0, -1)) nodo = nodo[k];
  nodo[claves[claves.length - 1]] = Number(valor);
}
const cargado = validarBalance(datos);
if ('error' in cargado) {
  console.error(`Configuración inválida en ${ruta}: ${cargado.error}`);
  process.exit(1);
}
aplicarBalance(cargado.balance);
console.log(`Configuración: ${ruta}`);

function tabla(titulo: string, filas: Record<string, ReturnType<typeof resumir>>): void {
  console.log(`\n${titulo}`);
  console.table(
    Object.fromEntries(
      Object.entries(filas).map(([nombre, r]) => [
        nombre,
        {
          'Rentab. media': fmt(r.rentabilidadMedia),
          'Rentab. mín': fmt(r.rentabilidadMin),
          'Rentab. máx': fmt(r.rentabilidadMax),
          'Cumplim. final': fmt(r.cumplimiento),
          'Product. final': fmt(r.productividad),
          'Entrega final': fmt(r.entrega),
          'Pedidos abiertos': fmt(r.pedidosAbiertos),
        },
      ]),
    ),
  );
}

const aleatorios: Record<string, ReturnType<typeof resumir>> = {};
for (const [nombre, crear] of Object.entries(ESTRATEGIAS)) {
  const resultados = Array.from({ length: partidas }, (_, i) => jugar(crear(i + 1), { ciclos, semilla: i + 1 }));
  aleatorios[nombre] = resumir(resultados);
}
tabla(`Demanda aleatoria — ${partidas} partidas de ${ciclos} ciclos por estrategia`, aleatorios);

if (!soloAleatorias) {
  for (const escenario of ESCENARIOS) {
    const filas: Record<string, ReturnType<typeof resumir>> = {};
    for (const [nombre, crear] of Object.entries(ESTRATEGIAS)) {
      filas[nombre] = resumir([jugar(crear(1), { ciclos, escenario })]);
    }
    tabla(`Escenario «${escenario.nombre}» — ${ciclos} ciclos`, filas);
  }
}
