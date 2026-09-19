import { render } from 'preact';
import { App } from './ui/App';
import { cargarConfiguracion } from './ui/ajustes';
import './ui/style.css';

// La configuración (public/config/balance.json) debe estar aplicada antes de crear la primera partida.
cargarConfiguracion().then(() => render(<App />, document.getElementById('app')!));
