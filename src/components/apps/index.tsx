import type { ComponentType } from 'react';
import DashboardApp from './DashboardApp';
import InventarioApp from './InventarioApp';
import EntradasApp from './EntradasApp';
import SalidasApp from './SalidasApp';
import UniformesCampoApp from './UniformesCampoApp';
import GuardiasApp from './GuardiasApp';
import BajasApp from './BajasApp';
import UsuariosApp from './UsuariosApp';
import NuevoUsuarioApp from './NuevoUsuarioApp';
import CorreoApp from './CorreoApp';
import CalendarioApp from './CalendarioApp';
import MapaOperacionesApp from './MapaOperacionesApp';
import ProtocolosApp from './ProtocolosApp';

export const APP_COMPONENTS: Record<string, ComponentType> = {
  dashboard: DashboardApp,
  inventario: InventarioApp,
  entradas: EntradasApp,
  salidas: SalidasApp,
  'uniformes-campo': UniformesCampoApp,
  guardias: GuardiasApp,
  bajas: BajasApp,
  usuarios: UsuariosApp,
  'nuevo-usuario': NuevoUsuarioApp,
  correo: CorreoApp,
  calendario: CalendarioApp,
  'mapa-operaciones': MapaOperacionesApp,
  protocolos: ProtocolosApp,
};
