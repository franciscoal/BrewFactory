interface Props {
  marcado: boolean;
  onCambio: (marcado: boolean) => void;
  /** Texto a la derecha del interruptor (opcional). */
  etiqueta?: string;
  titulo?: string;
  desactivado?: boolean;
}

/** Interruptor deslizante: el mismo que enciende y apaga las líneas y las opciones de la cabecera. */
export function Interruptor({ marcado, onCambio, etiqueta, titulo, desactivado = false }: Props) {
  return (
    <label class={`interruptor-etiquetado${desactivado ? ' desactivado' : ''}`} title={titulo}>
      <span class="interruptor">
        <input type="checkbox" role="switch" checked={marcado} disabled={desactivado} onChange={(e) => onCambio(e.currentTarget.checked)} />
        <span class="pista" />
      </span>
      {etiqueta && <span class="interruptor-texto">{etiqueta}</span>}
    </label>
  );
}
