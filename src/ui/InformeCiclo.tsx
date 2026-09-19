import type { CategoriaDecision, CategoriaSuceso, Efecto, Informe } from '../engine';
import { useCtx } from './contexto';

const TITULO_DECISION: Record<CategoriaDecision, string> = {
  anadidos: 'Añadidos a producción',
  retirados: 'Retirados de producción',
  prioridad: 'Cambios de prioridad',
  lineas: 'Líneas encendidas / apagadas',
  velocidad: 'Cambios de velocidad',
  muelles: 'Asignados a muelle',
};

const TITULO_SUCESO: Record<CategoriaSuceso, string> = {
  produccion: 'Producción',
  completados: 'Completados',
  expedidos: 'Expedidos',
  demanda: 'Nueva demanda',
};

const OKRS: { id: Efecto['okr']; nombre: string }[] = [
  { id: 'cumplimiento', nombre: 'Cumplimiento' },
  { id: 'productividad', nombre: 'Productividad' },
  { id: 'entrega', nombre: 'Entrega' },
];

const signo = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)} %`;

/** Agrupa elementos por categoría respetando el orden de los títulos. */
function agrupar<C extends string>(items: { categoria: C; texto: string }[], orden: Record<C, string>) {
  return (Object.keys(orden) as C[])
    .map((c) => ({ titulo: orden[c], textos: items.filter((i) => i.categoria === c).map((i) => i.texto) }))
    .filter((g) => g.textos.length > 0);
}

function Grupos({ grupos }: { grupos: { titulo: string; textos: string[] }[] }) {
  return (
    <>
      {grupos.map((g) => (
        <div key={g.titulo} class="grupo">
          <h4>{g.titulo}</h4>
          <ul>
            {g.textos.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function Impacto({ informe }: { informe: Informe }) {
  return (
    <>
      {OKRS.map(({ id, nombre }) => {
        const efectos = informe.efectos.filter((f) => f.okr === id);
        if (efectos.length === 0) return null;
        const neto = efectos.reduce((s, f) => s + f.delta, 0);
        const limitado = Math.abs(informe.antes[id] + neto - informe.despues[id]) > 0.001;
        return (
          <div key={id} class="grupo">
            <h4>
              {nombre} {Math.round(informe.antes[id])} → {Math.round(informe.despues[id])} %
              {limitado && <small> (limitado por el tope)</small>}
            </h4>
            <ul>
              {efectos.map((f, i) => (
                <li key={i}>
                  <b class={f.delta > 0 ? 'pos' : 'neg'}>{signo(f.delta)}</b> {f.motivo}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p class="impacto-total">
        Rentabilidad {informe.antes.rentabilidad.toFixed(1)} → <b>{informe.despues.rentabilidad.toFixed(1)} %</b>
      </p>
    </>
  );
}

export function InformeCiclo() {
  const { j } = useCtx();
  const informe = j.estado.ultimoInforme;

  if (!informe) {
    return (
      <section class="informe">
        <p class="vacio">El estado por ciclo aparecerá aquí al resolverse el primer ciclo.</p>
      </section>
    );
  }
  const decisiones = agrupar(informe.decisiones, TITULO_DECISION);

  return (
    <section class="informe" aria-label={`Estado del ciclo ${informe.ciclo}`}>
      <div class="informe-col">
        <h3>Ciclo {informe.ciclo} · Decisiones</h3>
        {decisiones.length === 0 && <p class="vacio izq">Sin cambios respecto al ciclo anterior.</p>}
        <Grupos grupos={decisiones} />
      </div>
      <div class="informe-col">
        <h3>Sucesos</h3>
        <Grupos grupos={agrupar(informe.sucesos, TITULO_SUCESO)} />
      </div>
      <div class="informe-col">
        <h3>Impacto</h3>
        <Impacto informe={informe} />
      </div>
    </section>
  );
}
