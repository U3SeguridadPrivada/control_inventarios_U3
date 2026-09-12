'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/src/lib/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/src/components/ui/dialog';
import { Button } from '@/src/components/ui/button';
import { Input } from '@/src/components/ui/input';
import { Select } from '@/src/components/ui/select';
import { Badge } from '@/src/components/ui/badge';
import {
  FileCheck, Sparkles, User, Building2, DollarSign, Calendar,
  Shield, Check, Loader2, ArrowRight, Info
} from 'lucide-react';
import { toast } from 'sonner';
import { DATOS_CONTRATO_DEFAULT, extraerDatosDeGuardia, numeroALetrasPesos, formatearFechaLegal } from '@/src/lib/generadorContrato';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  guardiaIdInicial?: number;
}

export default function ModalGenerarContrato({ open, onOpenChange, guardiaIdInicial }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [guardiaId, setGuardiaId] = useState<string>(guardiaIdInicial ? String(guardiaIdInicial) : '');
  const [tab, setTab] = useState<'trabajador' | 'condiciones' | 'beneficiario'>('trabajador');

  const [form, setForm] = useState({
    nombreTrabajador: DATOS_CONTRATO_DEFAULT.nombreTrabajador,
    puesto: DATOS_CONTRATO_DEFAULT.puesto,
    edad: DATOS_CONTRATO_DEFAULT.edad,
    estadoCivil: DATOS_CONTRATO_DEFAULT.estadoCivil,
    nacionalidad: DATOS_CONTRATO_DEFAULT.nacionalidad,
    rfcTrabajador: DATOS_CONTRATO_DEFAULT.rfcTrabajador,
    curpTrabajador: DATOS_CONTRATO_DEFAULT.curpTrabajador,
    domicilioTrabajador: DATOS_CONTRATO_DEFAULT.domicilioTrabajador,

    salarioMensualNumero: DATOS_CONTRATO_DEFAULT.salarioMensualNumero,
    periodicidadPago: DATOS_CONTRATO_DEFAULT.periodicidadPago,
    diasLaboralesSemana: DATOS_CONTRATO_DEFAULT.diasLaboralesSemana,
    diasPruebaInicial: DATOS_CONTRATO_DEFAULT.diasPruebaInicial,
    diasPruebaMaximo: DATOS_CONTRATO_DEFAULT.diasPruebaMaximo,
    fechaContrato: DATOS_CONTRATO_DEFAULT.fechaContrato,
    fechaInicioVigencia: DATOS_CONTRATO_DEFAULT.fechaInicioVigencia,

    beneficiarioNombre: DATOS_CONTRATO_DEFAULT.beneficiarioNombre,
    beneficiarioPorcentaje: DATOS_CONTRATO_DEFAULT.beneficiarioPorcentaje,
    beneficiarioParentesco: DATOS_CONTRATO_DEFAULT.beneficiarioParentesco,

    representantePatronal: DATOS_CONTRATO_DEFAULT.representantePatronal,
    razonSocialPatronal: DATOS_CONTRATO_DEFAULT.razonSocialPatronal,
    rfcPatronal: DATOS_CONTRATO_DEFAULT.rfcPatronal,
    domicilioPatronal: DATOS_CONTRATO_DEFAULT.domicilioPatronal,
  });

  // Lista de guardias para selector
  const { data: guardias = [] } = useQuery({
    queryKey: ['guardias'],
    queryFn: () => apiFetch<any[]>('/api/guardias'),
    enabled: open,
  });

  // Si se selecciona un guardia o cambia el guardia inicial, autocompletar
  useEffect(() => {
    if (!guardiaId) return;
    const g = guardias.find((item: any) => String(item.id) === String(guardiaId));
    if (g) {
      const extraidos = extraerDatosDeGuardia(g);
      setForm((prev) => ({
        ...prev,
        nombreTrabajador: extraidos.nombreTrabajador || g.nombre || prev.nombreTrabajador,
        puesto: extraidos.puesto || prev.puesto,
        rfcTrabajador: extraidos.rfcTrabajador || prev.rfcTrabajador,
        curpTrabajador: extraidos.curpTrabajador || prev.curpTrabajador,
        edad: extraidos.edad || prev.edad,
        estadoCivil: extraidos.estadoCivil || prev.estadoCivil,
        nacionalidad: extraidos.nacionalidad || prev.nacionalidad,
        domicilioTrabajador: extraidos.domicilioTrabajador || g.direccion || prev.domicilioTrabajador,
        fechaInicioVigencia: extraidos.fechaInicioVigencia || prev.fechaInicioVigencia,
        fechaContrato: extraidos.fechaInicioVigencia || prev.fechaContrato,
      }));
    }
  }, [guardiaId, guardias]);

  useEffect(() => {
    if (guardiaIdInicial) {
      setGuardiaId(String(guardiaIdInicial));
    }
  }, [guardiaIdInicial]);

  const generarMutation = useMutation({
    mutationFn: (payload: any) =>
      apiFetch<{ ok: boolean; id: number; url: string }>('/api/contratos/generar', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['guardia-contrato'] });
      queryClient.invalidateQueries({ queryKey: ['guardia-documentos'] });
      queryClient.invalidateQueries({ queryKey: ['guardias'] });
      toast.success('Contrato generado en el expediente del guardia exitosamente');
      onOpenChange(false);
      router.push(data.url);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Error al generar contrato');
    },
  });

  const handleGenerar = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.nombreTrabajador.trim()) {
      toast.error('El nombre del trabajador es obligatorio');
      return;
    }
    generarMutation.mutate({
      guardia_id: guardiaId ? Number(guardiaId) : undefined,
      datosPersonalizados: {
        ...form,
        salarioMensualNumero: Number(form.salarioMensualNumero) || 9451.2,
      },
    });
  };

  const salarioLetras = numeroALetrasPesos(Number(form.salarioMensualNumero) || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleGenerar} className="space-y-4">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-lg">Generar Contrato Laboral Automático</DialogTitle>
                <DialogDescription>
                  Genera el contrato oficial (periodo de prueba LFT Art. 39-A) e intégralo al editor oficial en hojas tamaño Carta.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {/* Selector de Guardia existente */}
          <div className="p-3.5 rounded-xl bg-muted/50 border border-border space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-primary" /> Seleccionar Guardia para Auto-llenar
              </label>
              <span className="text-[11px] text-muted-foreground">O llena los datos a mano</span>
            </div>
            <Select
              value={guardiaId}
              onChange={(e) => setGuardiaId(e.target.value)}
              className="w-full text-xs bg-background"
            >
              <option value="">— Ninguno (llenar datos manualmente) —</option>
              {guardias.map((g: any) => (
                <option key={g.id} value={g.id}>
                  {g.numero_elemento ? `[#${g.numero_elemento}] ` : ''}{g.nombre} ({g.estado || 'Activo'})
                </option>
              ))}
            </Select>
          </div>

          {/* Pestañas de sección */}
          <div className="flex border-b border-border text-xs">
            <button
              type="button"
              onClick={() => setTab('trabajador')}
              className={`pb-2 px-3 font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                tab === 'trabajador'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <User className="w-3.5 h-3.5" /> 1. Datos del Trabajador
            </button>
            <button
              type="button"
              onClick={() => setTab('condiciones')}
              className={`pb-2 px-3 font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                tab === 'condiciones'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" /> 2. Salario y Condiciones
            </button>
            <button
              type="button"
              onClick={() => setTab('beneficiario')}
              className={`pb-2 px-3 font-medium transition-colors border-b-2 -mb-px flex items-center gap-1.5 ${
                tab === 'beneficiario'
                  ? 'border-primary text-primary font-bold'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Shield className="w-3.5 h-3.5" /> 3. Beneficiario y Patrón
            </button>
          </div>

          {/* TAB 1: TRABAJADOR */}
          {tab === 'trabajador' && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold">Nombre Completo del Trabajador *</label>
                  <Input
                    value={form.nombreTrabajador}
                    onChange={(e) => setForm({ ...form, nombreTrabajador: e.target.value })}
                    placeholder="Ej. JUAN PÉREZ LÓPEZ"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Puesto a Desempeñar</label>
                  <Input
                    value={form.puesto}
                    onChange={(e) => setForm({ ...form, puesto: e.target.value })}
                    placeholder="GUARDIA DE SEGURIDAD PRIVADA"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">R.F.C.</label>
                  <Input
                    value={form.rfcTrabajador}
                    onChange={(e) => setForm({ ...form, rfcTrabajador: e.target.value.toUpperCase() })}
                    placeholder="MOSI891125H59"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">C.U.R.P.</label>
                  <Input
                    value={form.curpTrabajador}
                    onChange={(e) => setForm({ ...form, curpTrabajador: e.target.value.toUpperCase() })}
                    placeholder="MOSI891125HMCNNS02"
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Edad</label>
                    <Input
                      value={form.edad}
                      onChange={(e) => setForm({ ...form, edad: e.target.value })}
                      placeholder="35 AÑOS"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Estado Civil</label>
                    <Select
                      value={form.estadoCivil}
                      onChange={(e) => setForm({ ...form, estadoCivil: e.target.value })}
                    >
                      <option value="SOLTERO">Soltero</option>
                      <option value="CASADO">Casado</option>
                      <option value="UNIÓN LIBRE">Unión Libre</option>
                      <option value="DIVORCIADO">Divorciado</option>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold">Nacionalidad</label>
                    <Input
                      value={form.nacionalidad}
                      onChange={(e) => setForm({ ...form, nacionalidad: e.target.value })}
                      placeholder="MEXICANA"
                    />
                  </div>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-xs font-semibold">Domicilio Particular Completo</label>
                  <Input
                    value={form.domicilioTrabajador}
                    onChange={(e) => setForm({ ...form, domicilioTrabajador: e.target.value })}
                    placeholder="Calle, número, colonia, código postal, municipio, estado"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONDICIONES */}
          {tab === 'condiciones' && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Sueldo Mensual Bruto ($ MXN)</label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.salarioMensualNumero}
                    onChange={(e) => setForm({ ...form, salarioMensualNumero: parseFloat(e.target.value) || 0 })}
                    placeholder="9451.20"
                    required
                  />
                  <p className="text-[11px] text-muted-foreground italic truncate" title={salarioLetras}>
                    En letra: {salarioLetras}
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Periodicidad de Pago</label>
                  <Select
                    value={form.periodicidadPago}
                    onChange={(e) => setForm({ ...form, periodicidadPago: e.target.value })}
                  >
                    <option value="catorcenal">Catorcenal (esquema estándar U3)</option>
                    <option value="quincenal">Quincenal</option>
                    <option value="mensual">Mensual</option>
                    <option value="semanal">Semanal</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Días Laborales por Semana</label>
                  <Select
                    value={String(form.diasLaboralesSemana)}
                    onChange={(e) => setForm({ ...form, diasLaboralesSemana: parseInt(e.target.value, 10) || 6 })}
                  >
                    <option value="6">6 días a la semana (1 día descanso)</option>
                    <option value="5">5 días a la semana</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Periodo de Prueba Inicial</label>
                  <Select
                    value={String(form.diasPruebaInicial)}
                    onChange={(e) => setForm({ ...form, diasPruebaInicial: parseInt(e.target.value, 10) || 30 })}
                  >
                    <option value="30">30 días (Art. 39-A LFT, ampliable a 180)</option>
                    <option value="60">60 días</option>
                    <option value="90">90 días</option>
                    <option value="180">180 días improrrogables</option>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold">Fecha de Inicio de Vigencia y Antigüedad</label>
                  <Input
                    value={form.fechaInicioVigencia}
                    onChange={(e) => setForm({ ...form, fechaInicioVigencia: e.target.value, fechaContrato: e.target.value })}
                    placeholder="el día 16 de enero del año 2026"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BENEFICIARIO Y PATRON */}
          {tab === 'beneficiario' && (
            <div className="space-y-4 pt-1">
              <div className="p-3 bg-muted/40 rounded-lg border border-border space-y-2">
                <p className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-blue-600" /> Beneficiario Designado (Art. 501 Ley Federal del Trabajo)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-2 space-y-1">
                    <label className="text-[11px] font-medium">Nombre Completo del Beneficiario</label>
                    <Input
                      value={form.beneficiarioNombre}
                      onChange={(e) => setForm({ ...form, beneficiarioNombre: e.target.value })}
                      placeholder="Ej. NANCY SAN MARTIN GONZALEZ"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-medium">Parentesco</label>
                    <Input
                      value={form.beneficiarioParentesco}
                      onChange={(e) => setForm({ ...form, beneficiarioParentesco: e.target.value })}
                      placeholder="MADRE / ESPOSA / HIJO"
                    />
                  </div>
                </div>
              </div>

              <div className="p-3 bg-muted/20 rounded-lg border border-border space-y-2 text-xs">
                <p className="font-bold text-foreground flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-primary" /> Datos del Patrón (Representación Legal U3)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Razón Social</span>
                    <span className="font-medium text-foreground">{form.razonSocialPatronal}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-[10px] uppercase font-bold block">Representante Patronal</span>
                    <Input
                      value={form.representantePatronal}
                      onChange={(e) => setForm({ ...form, representantePatronal: e.target.value })}
                      className="h-7 text-xs mt-0.5"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={generarMutation.isPending}
              className="gap-2"
            >
              {generarMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Generando Contrato...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Generar y Abrir en Editor
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
