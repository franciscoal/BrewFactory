import { BALANCE } from '../engine/balance';

export function App() {
  return (
    <main class="shell">
      <h1>BrewFactory</h1>
      <p>Simulador de fábrica de bebidas. Ciclo por defecto: {BALANCE.cicloSegundosPorDefecto} s.</p>
    </main>
  );
}
