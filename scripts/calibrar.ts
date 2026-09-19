/**
 * Juega miles de partidas con bots para ver si las cifras del balance producen decisiones interesantes.
 * Uso: npm run calibrar [-- ciclos partidas]
 */
import { ESCENARIOS } from '../src/escenarios';
import { ESTRATEGIAS } from '../src/bots/estrategias';
import { jugar, resumir } from '../src/bots/simulador';

const ciclos = Number(process.argv[2] ?? 48);
const partidas = Number(process.argv[3] ?? 200);
const fmt = (n: number) => Math.round(n * 10) / 10;

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

for (const escenario of ESCENARIOS) {
  const filas: Record<string, ReturnType<typeof resumir>> = {};
  for (const [nombre, crear] of Object.entries(ESTRATEGIAS)) {
    filas[nombre] = resumir([jugar(crear(1), { ciclos, escenario })]);
  }
  tabla(`Escenario «${escenario.nombre}» — ${ciclos} ciclos`, filas);
}
