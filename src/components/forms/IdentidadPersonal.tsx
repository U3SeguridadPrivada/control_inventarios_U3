'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Field, FieldGrid } from '@/src/components/ui/field';
import { MESES } from '@/src/components/ui/rango-fechas';
import { cn } from '@/src/lib/utils';
import {
  LUGARES_NACIMIENTO,
  calcularCURP,
  calcularEdad,
  calcularRFC,
  datosFaltantes,
  desglosarCURP,
  fechaNacimientoValida,
  formatearFechaNacimiento,
  parsearFechaNacimiento,
  validarCURP,
  validarRFC,
  type DatosPersona,
} from '@/src/lib/rfcCurp';

export const SEXOS = ['Masculino', 'Femenino'];

/** Datos de identidad: todo lo que hace falta para calcular CURP y RFC, más las dos claves. */
export interface IdentidadValores {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  /** "15 de marzo de 1998"; vacío mientras la fecha esté incompleta o no exista. */
  fechaNacimiento: string;
  edad: string;
  sexo: string;
  /** Entidad donde nació la persona (la que lleva la CURP), no su domicilio. */
  entidadNacimiento: string;
  curp: string;
  rfc: string;
}

export const IDENTIDAD_VACIA: IdentidadValores = {
  nombres: '', apellidoPaterno: '', apellidoMaterno: '', fechaNacimiento: '', edad: '',
  sexo: '', entidadNacimiento: '', curp: '', rfc: '',
};

function Nota({ tono, children }: { tono: 'ok' | 'aviso'; children: ReactNode }) {
  const Icono = tono === 'ok' ? CheckCircle2 : AlertTriangle;
  return (
    <span className={cn('inline-flex items-start gap-1', tono === 'ok' ? 'text-emerald-700' : 'text-amber-700')}>
      <Icono aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0">{children}</span>
    </span>
  );
}

function Accion({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="font-semibold text-primary underline-offset-2 hover:underline">
      {children}
    </button>
  );
}

const soloDigitos = (texto: string, largo: number) => texto.replace(/\D/g, '').slice(0, largo);

/**
 * Bloque de identidad del alta y de las ediciones de guardias y personal
 * administrativo. Se pide en el orden que necesitan las claves oficiales:
 *
 *   nombre(s) y apellidos -> fecha de nacimiento -> sexo -> lugar de nacimiento
 *
 * y solo entonces CURP y RFC, que se proponen solos en cuanto hay datos
 * suficientes (y se actualizan mientras nadie los haya escrito a mano).
 * Si se teclea una CURP válida primero, de ella se toman fecha, sexo y lugar de
 * nacimiento que estén vacíos. Las claves siempre quedan editables: las que
 * calcula el sistema son estimaciones (RENAPO y el SAT asignan un dígito y una
 * homoclave que dependen de homónimos) y se marcan como tales.
 *
 * El componente conserva el borrador de la fecha (día/mes/año sueltos) y solo
 * entrega `fechaNacimiento` cuando es una fecha real; el padre debe volver a
 * montarlo (basta con que el diálogo se cierre y abra) para cargar otro registro.
 */
export function IdentidadPersonal({
  value,
  onChange,
  autoFocus,
  className,
}: {
  value: IdentidadValores;
  onChange: (cambios: Partial<IdentidadValores>) => void;
  autoFocus?: boolean;
  className?: string;
}) {
  const [fecha, setFecha] = useState(() => parsearFechaNacimiento(value.fechaNacimiento));
  const fechaTocada = useRef(false);
  // Última clave propuesta por el sistema: solo mientras el campo siga igual se vuelve a recalcular.
  const curpPropuesta = useRef<string | null>(null);
  const rfcPropuesto = useRef<string | null>(null);

  const fechaValida = fechaNacimientoValida(fecha.dia, fecha.mes, fecha.anio);
  const edadCalculada = fechaValida ? calcularEdad(fecha.dia, fecha.mes, fecha.anio) : null;
  const datos: DatosPersona = {
    nombres: value.nombres,
    apellidoPaterno: value.apellidoPaterno,
    apellidoMaterno: value.apellidoMaterno,
    dia: fecha.dia,
    mes: fecha.mes,
    anio: fecha.anio,
    sexo: value.sexo,
    lugarNacimiento: value.entidadNacimiento,
  };
  const curpCalculada = calcularCURP(datos);
  const rfcCalculado = calcularRFC(datos);

  /** Completa con una CURP válida lo que siga vacío (fecha, sexo, lugar de nacimiento). */
  const completarDesdeCurp = (curp: string, cambios: Partial<IdentidadValores>) => {
    const d = desglosarCURP(curp);
    if (!d) return;
    if (!value.sexo && d.sexo) cambios.sexo = d.sexo;
    if (!value.entidadNacimiento && d.lugarNacimiento) cambios.entidadNacimiento = d.lugarNacimiento;
    if (!fecha.dia && !fecha.mes && !fecha.anio) {
      fechaTocada.current = true;
      setFecha({ dia: d.dia, mes: d.mes, anio: d.anio });
    }
  };

  // Al abrir un registro existente: si ya trae CURP pero le faltan fecha, sexo o lugar de nacimiento, los recupera
  // de ella; y la edad guardada (que envejece) se pone al día con la fecha de nacimiento.
  useEffect(() => {
    const cambios: Partial<IdentidadValores> = {};
    if (value.curp) completarDesdeCurp(value.curp, cambios);
    if (edadCalculada !== null && String(edadCalculada) !== value.edad) cambios.edad = String(edadCalculada);
    if (Object.keys(cambios).length) onChange(cambios);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fecha de nacimiento: el valor del formulario solo existe cuando la fecha es real.
  useEffect(() => {
    if (!fechaTocada.current) return;
    if (fechaValida) {
      const texto = formatearFechaNacimiento(fecha.dia, fecha.mes, fecha.anio);
      const edad = edadCalculada !== null ? String(edadCalculada) : '';
      if (texto !== value.fechaNacimiento || edad !== value.edad) onChange({ fechaNacimiento: texto, edad });
    } else if (value.fechaNacimiento !== '') {
      onChange({ fechaNacimiento: '', edad: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha.dia, fecha.mes, fecha.anio]);

  // CURP y RFC: se proponen solos, pero nunca pisan lo que alguien escribió a mano.
  useEffect(() => {
    const propuesta = curpCalculada ?? '';
    if (value.curp === '' || value.curp === curpPropuesta.current) {
      curpPropuesta.current = propuesta || null;
      if (value.curp !== propuesta) onChange({ curp: propuesta });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curpCalculada]);

  useEffect(() => {
    const propuesto = rfcCalculado ?? '';
    if (value.rfc === '' || value.rfc === rfcPropuesto.current) {
      rfcPropuesto.current = propuesto || null;
      if (value.rfc !== propuesto) onChange({ rfc: propuesto });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rfcCalculado]);

  const cambiarFecha = (parte: Partial<typeof fecha>) => {
    fechaTocada.current = true;
    setFecha((f) => ({ ...f, ...parte }));
  };

  const cambiarCurp = (texto: string) => {
    const curp = texto.toUpperCase().replace(/[^A-ZÑ0-9]/g, '').slice(0, 18);
    const cambios: Partial<IdentidadValores> = { curp };
    completarDesdeCurp(curp, cambios);
    onChange(cambios);
  };

  const usarCurpCalculada = () => {
    if (!curpCalculada) return;
    curpPropuesta.current = curpCalculada;
    onChange({ curp: curpCalculada });
  };
  const usarRfcCalculado = () => {
    if (!rfcCalculado) return;
    rfcPropuesto.current = rfcCalculado;
    onChange({ rfc: rfcCalculado });
  };

  /* ---------------- mensajes de estado de cada clave ---------------- */

  let curpHint: ReactNode = null;
  let curpError: string | undefined;
  if (!value.curp) {
    const faltan = datosFaltantes(datos, 'curp');
    curpHint = faltan.length
      ? `Se calcula sola al capturar: ${faltan.join(', ')}.`
      : <>Con estos datos sale <b className="font-mono">{curpCalculada}</b>. <Accion onClick={usarCurpCalculada}>Usarla</Accion></>;
  } else {
    const validacion = validarCURP(value.curp);
    const esPropuesta = value.curp === curpPropuesta.current;
    if (!validacion.ok) {
      if (value.curp.length < 18 && !esPropuesta) curpHint = `Faltan ${18 - value.curp.length} caracteres.`;
      else curpError = validacion.motivo;
    } else if (esPropuesta) {
      curpHint = (
        <Nota tono="aviso">
          Estimada: RENAPO asigna la posición 17; confírmala con la CURP oficial.
        </Nota>
      );
    } else if (curpCalculada && value.curp.slice(0, 16) !== curpCalculada.slice(0, 16)) {
      curpHint = (
        <Nota tono="aviso">
          No coincide con la que sale de los datos capturados (<span className="font-mono">{curpCalculada}</span>): revisa nombre, fecha, sexo y lugar de nacimiento.{' '}
          <Accion onClick={usarCurpCalculada}>Usar la calculada</Accion>
        </Nota>
      );
    } else {
      curpHint = <Nota tono="ok">CURP válida.</Nota>;
    }
  }

  let rfcHint: ReactNode = null;
  let rfcError: string | undefined;
  if (!value.rfc) {
    const faltan = datosFaltantes(datos, 'rfc');
    rfcHint = faltan.length
      ? `Se calcula solo al capturar: ${faltan.join(', ')}.`
      : <>Con estos datos sale <b className="font-mono">{rfcCalculado}</b>. <Accion onClick={usarRfcCalculado}>Usarlo</Accion></>;
  } else {
    const validacion = validarRFC(value.rfc);
    const esPropuesto = value.rfc === rfcPropuesto.current;
    if (value.rfc.length === 10 && rfcCalculado?.startsWith(value.rfc)) {
      rfcHint = (
        <Nota tono="aviso">
          Solo tiene letras y fecha. Con homoclave estimada: <span className="font-mono">{rfcCalculado}</span>.{' '}
          <Accion onClick={usarRfcCalculado}>Usarlo</Accion>
        </Nota>
      );
    } else if (!validacion.ok) {
      if (value.rfc.length < 13) rfcHint = `Faltan ${13 - value.rfc.length} caracteres.`;
      else rfcError = validacion.motivo;
    } else if (esPropuesto) {
      rfcHint = (
        <Nota tono="aviso">
          Estimado: el SAT asigna la homoclave; confírmalo en la constancia fiscal.
        </Nota>
      );
    } else if (rfcCalculado && value.rfc.slice(0, 10) !== rfcCalculado.slice(0, 10)) {
      rfcHint = (
        <Nota tono="aviso">
          No coincide con el que sale de los datos capturados (<span className="font-mono">{rfcCalculado}</span>): revisa nombre y fecha.{' '}
          <Accion onClick={usarRfcCalculado}>Usar el calculado</Accion>
        </Nota>
      );
    } else {
      rfcHint = <Nota tono="ok">RFC válido.</Nota>;
    }
  }

  const fechaCompleta = fecha.dia && fecha.mes && fecha.anio.length === 4;
  const errorFecha = fechaCompleta && !fechaValida ? 'Esa fecha no existe o es posterior a hoy.' : undefined;
  // Fichas antiguas pudieron guardar la fecha con otro formato ("15-MAR-1998"): no se pierde, pero hay que recapturarla.
  const fechaEnOtroFormato = value.fechaNacimiento && !fecha.dia && !fecha.mes && !fecha.anio ? value.fechaNacimiento : '';
  const hintFecha = fechaEnOtroFormato
    ? <Nota tono="aviso">La ficha tiene la fecha «{fechaEnOtroFormato}» en otro formato: captúrala en estos campos para calcular la CURP y el RFC.</Nota>
    : fechaValida && edadCalculada !== null && edadCalculada < 18
      ? <Nota tono="aviso">Menor de 18 años: confirma la fecha.</Nota>
      : undefined;

  const lugares = value.entidadNacimiento && !LUGARES_NACIMIENTO.includes(value.entidadNacimiento)
    ? [value.entidadNacimiento, ...LUGARES_NACIMIENTO]
    : LUGARES_NACIMIENTO;

  return (
    <div className={cn('space-y-4', className)}>
      <FieldGrid cols={3}>
        <Field label="Nombre(s)" required>
          <Input
            value={value.nombres}
            onChange={(e) => onChange({ nombres: e.target.value })}
            placeholder="Ej. María Fernanda"
            autoComplete="off"
            autoFocus={autoFocus}
            required
          />
        </Field>
        <Field label="Apellido paterno" required>
          <Input
            value={value.apellidoPaterno}
            onChange={(e) => onChange({ apellidoPaterno: e.target.value })}
            placeholder="Primer apellido"
            autoComplete="off"
            required
          />
        </Field>
        <Field label="Apellido materno" optional>
          <Input
            value={value.apellidoMaterno}
            onChange={(e) => onChange({ apellidoMaterno: e.target.value })}
            placeholder="Segundo apellido"
            autoComplete="off"
          />
        </Field>

        <Field label="Fecha de nacimiento" group span={2} error={errorFecha} hint={hintFecha}>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1.2fr)] gap-2">
            <Input
              inputMode="numeric"
              value={fecha.dia}
              onChange={(e) => cambiarFecha({ dia: soloDigitos(e.target.value, 2) })}
              placeholder="Día"
              aria-label="Día de nacimiento"
              aria-invalid={errorFecha ? true : undefined}
            />
            <Select
              value={fecha.mes}
              onChange={(e) => cambiarFecha({ mes: e.target.value })}
              aria-label="Mes de nacimiento"
              aria-invalid={errorFecha ? true : undefined}
            >
              <option value="">Mes</option>
              {MESES.map((m) => (
                <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>
              ))}
            </Select>
            <Input
              inputMode="numeric"
              value={fecha.anio}
              onChange={(e) => cambiarFecha({ anio: soloDigitos(e.target.value, 4) })}
              placeholder="Año"
              aria-label="Año de nacimiento"
              aria-invalid={errorFecha ? true : undefined}
            />
          </div>
        </Field>
        <Field label="Edad">
          <Input
            inputMode="numeric"
            value={fechaValida ? String(edadCalculada ?? '') : value.edad}
            readOnly={fechaValida !== null}
            onChange={(e) => onChange({ edad: soloDigitos(e.target.value, 3) })}
            placeholder={fechaValida ? '' : 'Con la fecha se calcula'}
            className={cn(fechaValida && 'bg-muted text-muted-foreground')}
          />
        </Field>

        <Field label="Sexo">
          <Select value={value.sexo} onChange={(e) => onChange({ sexo: e.target.value })}>
            <option value="">Seleccionar</option>
            {SEXOS.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        </Field>
        <Field label="Lugar de nacimiento" span={2} hint="Entidad donde nació, no donde vive actualmente.">
          <Select value={value.entidadNacimiento} onChange={(e) => onChange({ entidadNacimiento: e.target.value })}>
            <option value="">Seleccionar entidad</option>
            {lugares.map((o) => <option key={o} value={o}>{o}</option>)}
          </Select>
        </Field>

        <Field label="CURP" span={2} hint={curpHint} error={curpError}>
          <Input
            value={value.curp}
            onChange={(e) => cambiarCurp(e.target.value)}
            placeholder="18 posiciones"
            spellCheck={false}
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono uppercase tracking-wide"
          />
        </Field>
        <Field label="RFC" hint={rfcHint} error={rfcError}>
          <Input
            value={value.rfc}
            onChange={(e) => onChange({ rfc: e.target.value.toUpperCase().replace(/[^A-ZÑ&0-9]/g, '').slice(0, 13) })}
            placeholder="13 posiciones"
            spellCheck={false}
            autoCapitalize="characters"
            autoComplete="off"
            className="font-mono uppercase tracking-wide"
          />
        </Field>
      </FieldGrid>
    </div>
  );
}
