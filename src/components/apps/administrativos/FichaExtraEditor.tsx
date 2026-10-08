'use client';
import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { Input } from '@/src/components/ui/input';
import { apiFetch } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';
import { partesDeNombre, validarNSS } from '@/src/lib/rfcCurp';
import { ESTADOS_MEXICO } from '@/src/lib/direccionMexico';
import { IDENTIDAD_VACIA, type IdentidadValores } from '@/src/components/forms/IdentidadPersonal';

const ESTADOS_CIVILES = ['Soltero(a)', 'Casado(a)', 'Unión libre', 'Divorciado(a)', 'Viudo(a)'];
const NIVELES_ESTUDIO = [
  'Primaria', 'Secundaria', 'Preparatoria / Bachillerato', 'Técnico / Carrera Comercial',
  'Licenciatura / Universidad', 'Posgrado', 'Sin estudios',
];

/**
 * Ficha básica completa: la identidad (que captura <IdentidadPersonal />, la
 * primera sección de cada formulario) más los datos personales restantes y el
 * domicilio que captura <FichaExtraEditor />.
 */
export interface FichaExtraValores extends IdentidadValores {
  estadoCivil: string; estudios: string; imss: string;
  estatura: string; peso: string;
  calleNumero: string; colonia: string; entreCalles: string; cp: string; delegacionMunicipio: string; estado: string;
  tiempoResidencia: string; tiempoRadicarEstado: string; telefonoEmergencia: string; celular: string;
}

export const FICHA_EXTRA_VACIA: FichaExtraValores = {
  ...IDENTIDAD_VACIA,
  estadoCivil: '', estudios: '', imss: '',
  estatura: '', peso: '',
  calleNumero: '', colonia: '', entreCalles: '', cp: '', delegacionMunicipio: '', estado: '',
  tiempoResidencia: '', tiempoRadicarEstado: '', telefonoEmergencia: '', celular: '',
};

/**
 * Recupera los campos de FICHA_EXTRA_VACIA guardados dentro de ficha_tecnica_json (el resto del JSON -foto, empleos, etc.- se conserva aparte y no se toca aquí).
 * Si se pasa el nombre completo del expediente, las partes del nombre se toman de lo capturado por separado mientras
 * sigan coincidiendo con él y, si no (expedientes antiguos o nombre corregido en otra pantalla), se proponen a partir del nombre.
 */
export function extraerFichaExtra(fichaTecnicaJson?: string | null, nombreCompleto?: string): FichaExtraValores {
  let resultado: FichaExtraValores = { ...FICHA_EXTRA_VACIA };
  if (fichaTecnicaJson) {
    try {
      const parsed = JSON.parse(fichaTecnicaJson);
      for (const campo of Object.keys(FICHA_EXTRA_VACIA) as (keyof FichaExtraValores)[]) {
        if (typeof parsed[campo] === 'string') resultado[campo] = parsed[campo];
      }
    } catch {
      resultado = { ...FICHA_EXTRA_VACIA };
    }
  }
  if (nombreCompleto) resultado = { ...resultado, ...partesDeNombre(nombreCompleto, resultado) };
  return resultado;
}

/** Campo de una sola línea: label diminuto + input bajo, para cuadrículas densas de captura. */
export function CampoCompacto({
  label, value, onChange, placeholder, className, error,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  error?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-0.5', className)}>
      <label className="text-[11px] font-semibold text-muted-foreground truncate block">{label}</label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        className="rounded-lg h-9"
      />
      {error && <p role="alert" className="text-[11px] font-medium leading-snug text-destructive">{error}</p>}
    </div>
  );
}

/** Variante de CampoCompacto respaldada por un catálogo cerrado (sexo, estado civil, estudios, etc.). */
export function SelectCompacto({
  label, value, onChange, options, placeholder, className,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-0.5', className)}>
      <label className="text-[11px] font-semibold text-muted-foreground truncate block">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full min-w-0 h-9 rounded-lg border border-input bg-background px-2.5 text-xs"
      >
        <option value="">{placeholder || 'Selecciona...'}</option>
        {options.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}

/**
 * Cuadrícula compartida de "Datos Personales" (lo que no es identidad) y
 * "Domicilio" de la ficha técnica básica: la usan tanto el alta rápida como los
 * modales de edición (lista y perfil). La identidad -nombre por partes,
 * nacimiento, sexo, lugar de nacimiento, CURP y RFC- va ANTES, en
 * <IdentidadPersonal />, porque las claves se calculan con esos datos.
 *
 * - El C.P. consulta un servicio público para desplegar Colonia y Estado
 *   como listas; si no lo reconoce, Colonia cae de vuelta a texto libre.
 */
export function FichaExtraEditor({
  value,
  onChange,
}: {
  value: FichaExtraValores;
  onChange: Dispatch<SetStateAction<FichaExtraValores>>;
}) {
  const [coloniasDisponibles, setColoniasDisponibles] = useState<string[]>([]);
  const [buscandoCp, setBuscandoCp] = useState(false);

  const actualizar = (campo: keyof FichaExtraValores, valor: string) =>
    onChange((f) => ({ ...f, [campo]: valor }));

  // C.P. -> colonias y estado: se consulta un servicio público en cuanto quedan los 5 dígitos.
  useEffect(() => {
    const cp = value.cp.trim();
    if (!/^\d{5}$/.test(cp)) {
      setColoniasDisponibles([]);
      return;
    }
    let cancelado = false;
    setBuscandoCp(true);
    const timer = setTimeout(() => {
      apiFetch<{ colonias: string[]; estado: string | null }>(`/api/utilidades/cp/${cp}`)
        .then((res) => {
          if (cancelado) return;
          setColoniasDisponibles(res.colonias || []);
          if (res.estado) onChange((f) => (f.estado ? f : { ...f, estado: res.estado! }));
        })
        .catch(() => { if (!cancelado) setColoniasDisponibles([]); })
        .finally(() => { if (!cancelado) setBuscandoCp(false); });
    }, 450);
    return () => { cancelado = true; clearTimeout(timer); setBuscandoCp(false); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.cp]);

  // El NSS mide 11 dígitos; mientras se escribe no se avisa, solo cuando ya se pasó.
  const nss = value.imss.replace(/\D/g, '').length > 11 ? validarNSS(value.imss) : null;
  const errorNss = nss && !nss.ok ? nss.motivo : undefined;

  return (
    <>
      <div className="pt-2 border-t border-border">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Datos Personales</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2.5">
          <SelectCompacto label="Estado Civil" value={value.estadoCivil} onChange={v => actualizar('estadoCivil', v)} options={ESTADOS_CIVILES} />
          <SelectCompacto label="Estudios" value={value.estudios} onChange={v => actualizar('estudios', v)} options={NIVELES_ESTUDIO} />
          <CampoCompacto
            label="Afiliación IMSS"
            value={value.imss}
            onChange={v => actualizar('imss', v.replace(/[^\d\s-]/g, ''))}
            placeholder="11 dígitos"
            error={errorNss}
            className="col-span-2 sm:col-span-1"
          />
          <CampoCompacto label="Estatura" value={value.estatura} onChange={v => actualizar('estatura', v)} placeholder="Ej. 1.75 m" />
          <CampoCompacto label="Peso Aproximado" value={value.peso} onChange={v => actualizar('peso', v)} placeholder="Ej. 78 kg" />
        </div>
      </div>

      <div className="pt-2 border-t border-border">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Domicilio</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <CampoCompacto label="Calle y Número" value={value.calleNumero} onChange={v => actualizar('calleNumero', v)} placeholder="Calle, no. ext. e int." className="col-span-2" />
          {coloniasDisponibles.length > 0 ? (
            <SelectCompacto
              label="Colonia"
              value={value.colonia}
              onChange={v => actualizar('colonia', v)}
              options={value.colonia && !coloniasDisponibles.includes(value.colonia) ? [value.colonia, ...coloniasDisponibles] : coloniasDisponibles}
              placeholder="Elige la colonia"
            />
          ) : (
            <CampoCompacto label="Colonia" value={value.colonia} onChange={v => actualizar('colonia', v)} placeholder="Colonia / fracc." />
          )}
          <CampoCompacto
            label={buscandoCp ? 'C.P. (buscando…)' : 'C.P.'}
            value={value.cp}
            onChange={v => actualizar('cp', v.replace(/\D/g, '').slice(0, 5))}
            placeholder="Código postal"
          />
          <CampoCompacto label="Entre las Calles" value={value.entreCalles} onChange={v => actualizar('entreCalles', v)} placeholder="Calles aledañas" className="col-span-2" />
          <CampoCompacto label="Delegación / Municipio" value={value.delegacionMunicipio} onChange={v => actualizar('delegacionMunicipio', v)} placeholder="Alcaldía o municipio" />
          <SelectCompacto
            label="Estado"
            value={value.estado}
            onChange={v => actualizar('estado', v)}
            options={value.estado && !ESTADOS_MEXICO.includes(value.estado) ? [value.estado, ...ESTADOS_MEXICO] : ESTADOS_MEXICO}
            placeholder="Elige el estado"
          />
          <CampoCompacto label="Tiempo de Residencia" value={value.tiempoResidencia} onChange={v => actualizar('tiempoResidencia', v)} placeholder="Ej. 5 años" />
          <CampoCompacto label="Tiempo de Radicar en el Estado" value={value.tiempoRadicarEstado} onChange={v => actualizar('tiempoRadicarEstado', v)} placeholder="Ej. 10 años" />
          <CampoCompacto label="Teléfono de Emergencia" value={value.telefonoEmergencia} onChange={v => actualizar('telefonoEmergencia', v)} placeholder="Contacto familiar" />
          <CampoCompacto label="Celular" value={value.celular} onChange={v => actualizar('celular', v)} placeholder="10 dígitos" />
        </div>
      </div>
    </>
  );
}
