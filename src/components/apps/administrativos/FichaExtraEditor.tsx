'use client';
import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { Input } from '@/src/components/ui/input';
import { MESES } from '@/src/components/ui/rango-fechas';
import { apiFetch } from '@/src/lib/api';
import { cn } from '@/src/lib/utils';
import { dividirNombreCompleto, calcularEdad, calcularCURP, calcularClaveRFC } from '@/src/lib/rfcCurp';
import { ESTADOS_MEXICO } from '@/src/lib/direccionMexico';

const SEXOS = ['Masculino', 'Femenino'];
const ESTADOS_CIVILES = ['Soltero(a)', 'Casado(a)', 'Unión libre', 'Divorciado(a)', 'Viudo(a)'];
const NIVELES_ESTUDIO = [
  'Primaria', 'Secundaria', 'Preparatoria / Bachillerato', 'Técnico / Carrera Comercial',
  'Licenciatura / Universidad', 'Posgrado', 'Sin estudios',
];

export interface FichaExtraValores {
  fechaNacimiento: string; edad: string; estadoCivil: string; estudios: string; rfc: string; curp: string; imss: string;
  sexo: string; estatura: string; peso: string;
  calleNumero: string; colonia: string; entreCalles: string; cp: string; delegacionMunicipio: string; estado: string;
  tiempoResidencia: string; tiempoRadicarEstado: string; telefonoEmergencia: string; celular: string;
}

export const FICHA_EXTRA_VACIA: FichaExtraValores = {
  fechaNacimiento: '', edad: '', estadoCivil: '', estudios: '', rfc: '', curp: '', imss: '',
  sexo: '', estatura: '', peso: '',
  calleNumero: '', colonia: '', entreCalles: '', cp: '', delegacionMunicipio: '', estado: '',
  tiempoResidencia: '', tiempoRadicarEstado: '', telefonoEmergencia: '', celular: '',
};

/** Recupera los campos de FICHA_EXTRA_VACIA guardados dentro de administrativo.ficha_tecnica_json (el resto del JSON -foto, empleos, etc.- se conserva aparte y no se toca aquí). */
export function extraerFichaExtra(fichaTecnicaJson?: string | null): FichaExtraValores {
  if (!fichaTecnicaJson) return { ...FICHA_EXTRA_VACIA };
  try {
    const parsed = JSON.parse(fichaTecnicaJson);
    const resultado = { ...FICHA_EXTRA_VACIA };
    for (const campo of Object.keys(FICHA_EXTRA_VACIA) as (keyof FichaExtraValores)[]) {
      if (typeof parsed[campo] === 'string') resultado[campo] = parsed[campo];
    }
    return resultado;
  } catch {
    return { ...FICHA_EXTRA_VACIA };
  }
}

function parsearFechaNacimiento(texto: string): { dia: string; mes: string; anio: string } {
  const m = (texto || '').trim().match(/^(\d{1,2})\s+de\s+([a-záéíóúñ]+)\s+de\s+(\d{4})$/i);
  if (!m) return { dia: '', mes: '', anio: '' };
  return { dia: m[1], mes: m[2].toLowerCase(), anio: m[3] };
}

/** Campo de una sola línea: label diminuto + input bajo, para cuadrículas densas de captura. */
export function CampoCompacto({
  label, value, onChange, placeholder, className,
}: {
  label: string;
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('space-y-0.5', className)}>
      <label className="text-[11px] font-semibold text-muted-foreground truncate block">{label}</label>
      <Input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg h-9"
      />
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
    <div className={cn('space-y-0.5', className)}>
      <label className="text-[11px] font-semibold text-muted-foreground truncate block">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full h-9 rounded-lg border border-input bg-background px-2.5 text-xs"
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
 * Cuadrícula compartida de "Datos Personales" + "Domicilio" de la ficha técnica
 * básica: la usan tanto el alta rápida como los modales de edición (lista y
 * perfil), para que cualquiera de las tres pantallas pueda tocar el mismo
 * juego completo de campos en vez de solo los datos generales del puesto.
 *
 * - RFC y CURP se proponen solos con nombre + fecha de nacimiento + sexo +
 *   estado, y dejan de tocarse en cuanto el usuario los edita a mano.
 * - La edad se recalcula sola en cuanto la fecha de nacimiento queda completa.
 * - El C.P. consulta un servicio público para desplegar Colonia y Estado
 *   como listas; si no lo reconoce, Colonia cae de vuelta a texto libre.
 */
export function FichaExtraEditor({
  nombreCompleto,
  value,
  onChange,
}: {
  nombreCompleto: string;
  value: FichaExtraValores;
  onChange: Dispatch<SetStateAction<FichaExtraValores>>;
}) {
  const inicial = parsearFechaNacimiento(value.fechaNacimiento);
  const [diaNac, setDiaNac] = useState(inicial.dia);
  const [mesNac, setMesNac] = useState(inicial.mes);
  const [anioNac, setAnioNac] = useState(inicial.anio);
  const [rfcTocadoManualmente, setRfcTocadoManualmente] = useState(false);
  const [curpTocadaManualmente, setCurpTocadaManualmente] = useState(false);
  const [coloniasDisponibles, setColoniasDisponibles] = useState<string[]>([]);
  const [buscandoCp, setBuscandoCp] = useState(false);

  const actualizar = (campo: keyof FichaExtraValores, valor: string) =>
    onChange((f) => ({ ...f, [campo]: valor }));

  // Fecha de nacimiento (texto) + edad: se recalculan solas en cuanto día/mes/año quedan completos.
  useEffect(() => {
    if (!diaNac || !mesNac || !anioNac) return;
    const texto = `${diaNac} de ${mesNac} de ${anioNac}`;
    const edadCalculada = calcularEdad(diaNac, mesNac, anioNac);
    onChange((f) => (
      f.fechaNacimiento === texto && (edadCalculada === null || f.edad === String(edadCalculada))
        ? f
        : { ...f, fechaNacimiento: texto, edad: edadCalculada !== null ? String(edadCalculada) : f.edad }
    ));
  }, [diaNac, mesNac, anioNac, onChange]);

  // RFC y CURP: se proponen solos, pero dejan de tocarse en cuanto el usuario los edita a mano.
  useEffect(() => {
    if (!nombreCompleto || !diaNac || !mesNac || !anioNac) return;
    const { nombres, apellidoPaterno, apellidoMaterno } = dividirNombreCompleto(nombreCompleto);
    const datos = { nombres, apellidoPaterno, apellidoMaterno, dia: diaNac, mes: mesNac, anio: anioNac, sexo: value.sexo, estado: value.estado };

    if (!rfcTocadoManualmente) {
      const claveRfc = calcularClaveRFC(datos);
      if (claveRfc) onChange((f) => (f.rfc === claveRfc ? f : { ...f, rfc: claveRfc }));
    }
    if (!curpTocadaManualmente) {
      const curp = calcularCURP(datos);
      if (curp) onChange((f) => (f.curp === curp ? f : { ...f, curp }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nombreCompleto, diaNac, mesNac, anioNac, value.sexo, value.estado, rfcTocadoManualmente, curpTocadaManualmente]);

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

  return (
    <>
      <div className="pt-2 border-t border-border">
        <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">Datos Personales</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="space-y-0.5 col-span-2">
            <label className="text-[11px] font-semibold text-muted-foreground">Fecha de Nacimiento</label>
            <div className="grid grid-cols-[1fr_1.6fr_1fr] gap-2">
              <Input
                type="number"
                min={1}
                max={31}
                value={diaNac}
                onChange={e => setDiaNac(e.target.value)}
                placeholder="Día"
                className="rounded-lg h-9"
              />
              <select
                value={mesNac}
                onChange={e => setMesNac(e.target.value)}
                className="h-9 rounded-lg border border-input bg-background px-2 text-sm"
              >
                <option value="">Mes</option>
                {MESES.map((m) => (
                  <option key={m} value={m} className="capitalize">{m}</option>
                ))}
              </select>
              <Input
                type="number"
                min={1940}
                max={new Date().getFullYear()}
                value={anioNac}
                onChange={e => setAnioNac(e.target.value)}
                placeholder="Año"
                className="rounded-lg h-9"
              />
            </div>
          </div>
          <CampoCompacto label="Edad (auto)" value={value.edad} onChange={v => actualizar('edad', v)} placeholder="Se calcula con la fecha de nacimiento" />
          <SelectCompacto label="Sexo" value={value.sexo} onChange={v => actualizar('sexo', v)} options={SEXOS} />
          <SelectCompacto label="Estado Civil" value={value.estadoCivil} onChange={v => actualizar('estadoCivil', v)} options={ESTADOS_CIVILES} />
          <SelectCompacto label="Estudios" value={value.estudios} onChange={v => actualizar('estudios', v)} options={NIVELES_ESTUDIO} />
          <CampoCompacto
            label="RFC (auto, verifica en INE)"
            value={value.rfc}
            onChange={v => { setRfcTocadoManualmente(true); actualizar('rfc', v.toUpperCase()); }}
            placeholder="13 posiciones"
            className="uppercase"
          />
          <CampoCompacto
            label="CURP (auto, verifica en INE)"
            value={value.curp}
            onChange={v => { setCurpTocadaManualmente(true); actualizar('curp', v.toUpperCase()); }}
            placeholder="18 posiciones"
            className="uppercase"
          />
          <CampoCompacto label="Afiliación IMSS" value={value.imss} onChange={v => actualizar('imss', v)} placeholder="NSS 11 dígitos" />
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
            label={buscandoCp ? 'C.P. (buscando colonias…)' : 'C.P.'}
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
