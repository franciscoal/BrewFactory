import {
  CategoryScale,
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';
import { useEffect, useRef } from 'preact/hooks';
import type { Estado } from '../engine';
import { useCtx } from './contexto';

Chart.register(CategoryScale, LinearScale, LineController, LineElement, PointElement, Legend, Tooltip);

const COLORES = { cumplimiento: '#2f7ed8', productividad: '#e08a00', entrega: '#2a9d5c' };

function Grafica({ estado, series }: { estado: Estado; series: (keyof typeof COLORES)[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);

  useEffect(() => {
    chart.current = new Chart(canvas.current!, {
      type: 'line',
      data: { labels: [], datasets: series.map((s) => ({ label: s, data: [], borderColor: COLORES[s], backgroundColor: COLORES[s], pointRadius: 2, tension: 0.2 })) },
      options: {
        animation: false,
        maintainAspectRatio: false,
        scales: { y: { min: 0, max: 100 } },
        plugins: { legend: { display: series.length > 1, labels: { boxWidth: 10 } } },
      },
    });
    return () => chart.current?.destroy();
  }, []);

  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    c.data.labels = estado.historial.map((h) => h.ciclo);
    c.data.datasets.forEach((d, i) => {
      d.data = estado.historial.map((h) => h.okr[series[i]]);
    });
    c.update();
  }, [estado.historial]);

  return (
    <div class="grafica">
      <canvas ref={canvas} />
    </div>
  );
}

function emoji(productividad: number): string {
  if (productividad >= 70) return '😀';
  if (productividad >= 50) return '😐';
  if (productividad >= 30) return '😟';
  return '😠';
}

export function Resultados() {
  const { j } = useCtx();
  const e = j.estado;
  const filas = [...e.historial].reverse();
  return (
    <section class="panel resultados">
      <header class="panel-cab">
        <h2>Resultados</h2>
      </header>
      <Grafica estado={e} series={['cumplimiento', 'productividad', 'entrega']} />
      <Grafica estado={e} series={['productividad']} />
      <div class="emoji" title={`Productividad ${Math.round(e.okr.productividad)} %`}>
        {emoji(e.okr.productividad)}
      </div>
      <div class="tabla-wrap">
        <table>
          <thead>
            <tr>
              <th>Ciclo</th>
              <th>Cumplimiento</th>
              <th>Productividad</th>
              <th>Entrega</th>
              <th>Rentabilidad</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 && (
              <tr>
                <td colSpan={5} class="vacio">
                  Aún no hay ciclos
                </td>
              </tr>
            )}
            {filas.map((h) => (
              <tr key={h.ciclo}>
                <td>{h.ciclo}</td>
                <td>{Math.round(h.okr.cumplimiento)} %</td>
                <td>{Math.round(h.okr.productividad)} %</td>
                <td>{Math.round(h.okr.entrega)} %</td>
                <td>{Math.round(h.okr.rentabilidad)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
