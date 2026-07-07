'use client';
import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Trash2 } from 'lucide-react';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const CDMX_CENTER: [number, number] = [19.4326, -99.1332];

export interface ServicioGuardia {
  id: number;
  guardia_id: number;
  turno: string | null;
  nombre: string;
  numero_elemento: string;
}
export interface Servicio {
  id: number;
  nombre: string;
  direccion: string | null;
  lat: number;
  lng: number;
  guardias: ServicioGuardia[];
}

function ClickCapture({ active, onClick }: { active: boolean; onClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      if (active) onClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface Props {
  servicios: Servicio[];
  addingMode: boolean;
  canEdit: boolean;
  onMapClick: (lat: number, lng: number) => void;
  onMarkerDragEnd: (servicioId: number, lat: number, lng: number) => void;
  onManage: (servicio: Servicio) => void;
  onDelete: (servicio: Servicio) => void;
  onRemoveGuardia: (servicio: Servicio, guardiaId: number) => void;
}

export default function OperationsMap({ servicios, addingMode, canEdit, onMapClick, onMarkerDragEnd, onManage, onDelete, onRemoveGuardia }: Props) {
  return (
    <MapContainer center={CDMX_CENTER} zoom={11} style={{ height: '100%', width: '100%' }} className={addingMode ? 'cursor-crosshair' : ''}>
      <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickCapture active={addingMode} onClick={onMapClick} />
      {servicios.map((s) => (
        <Marker
          key={s.id}
          position={[s.lat, s.lng]}
          draggable={canEdit}
          eventHandlers={canEdit ? { dragend: (e) => { const p = e.target.getLatLng(); onMarkerDragEnd(s.id, p.lat, p.lng); } } : undefined}
        >
          <Popup>
            <div className="min-w-[200px] space-y-2">
              <div>
                <p className="font-semibold text-sm">{s.nombre}</p>
                {s.direccion && <p className="text-xs text-gray-500">{s.direccion}</p>}
              </div>
              <div className="space-y-1">
                {s.guardias.length === 0 ? (
                  <p className="text-xs text-gray-400 italic">Sin guardias asignados</p>
                ) : (
                  s.guardias.map((g) => (
                    <div key={g.id} className="flex items-center justify-between text-xs bg-gray-100 rounded px-2 py-1">
                      <span>{g.nombre}{g.turno ? ` · ${g.turno}` : ''}</span>
                      {canEdit && (
                        <button onClick={() => onRemoveGuardia(s, g.guardia_id)} className="text-red-500 hover:text-red-700 ml-2">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
              {canEdit && (
                <div className="flex gap-2 pt-1">
                  <button onClick={() => onManage(s)} className="text-xs text-blue-600 hover:underline">Asignar guardia</button>
                  <button onClick={() => onDelete(s)} className="text-xs text-red-600 hover:underline">Eliminar</button>
                </div>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
