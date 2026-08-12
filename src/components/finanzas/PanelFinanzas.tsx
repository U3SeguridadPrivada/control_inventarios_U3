'use client';
import { useEffect, useMemo, useState } from 'react';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as ChartTooltip, ResponsiveContainer, Legend, LabelList,
} from 'recharts';
import { apiFetch } from '@/src/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { CreditCard, Banknote, TrendingUp, TrendingDown, Receipt, Wallet, MapPin } from 'lucide-react';
import { fmtDate } from '@/src/lib/utils';
import { RangoFechas, presetsDeRango } from '@/src/components/ui/rango-fechas';

/**
 * Paleta de datos validada con el verificador de la guía de visualización
 * (banda de luminosidad, croma, separación para daltonismo y contraste sobre
 * superficie blanca). Solo hay dos series categóricas — ingreso y egreso — y el
 * resto de las gráficas son de magnitud, que van en un único tono.
 */
const SERIE_INGRESO = '#2a78d6';
const SERIE_EGRESO = '#eb6834';
const REJILLA = '#e1e0d9';
const EJE = '#898781';

interface PanelDatos {
  movimientos: number;
  existencia: number;
  tarjeta: number;
  efectivo: number;
  ingresos: number;
  egresos: number;
  desde: string | null;
  hasta: string | null;
  saldoPrevio?: number;
  rangoDisponible: { desde: string | null; hasta: string | null };
  serieSemanal: { semana: string; ingresos: number; egresos: number; saldo: number }[];
  porCategoria: { categoria: string; total: number; movimientos: number }[];
  topBeneficiarios: { nombre: string | null; total: number; movimientos: number }[];
  topServicios: { servicio: string | null; total: number; movimientos: number }[];
}

const money = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const moneyCorto = (n: number) => (Math.abs(n) >= 1000 ? `$${Math.round(n / 1000)}k` : `$${Math.round(n)}`);
const diaMes = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };

const ETIQUETA_CAT: Record<string, string> = {
  'H.E. Y DOBLETES': 'H.E. y dobletes',
  'GASTOS DIVERSOS': 'Gastos diversos',
  'ANTICIPOS': 'Anticipos',
};

/** Los valores se leen en pesos, no en la escala abreviada del eje. */
function TooltipDinero({ active, payload, label, sufijo }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-foreground mb-1">{sufijo ? `${sufijo} ${label}` : label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full inline-block" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-foreground tabular-nums">{money(p.value)}</span>
        </p>
      ))}
    </div>
  );
}

function Ficha({ etiqueta, valor, icono: Icono, tono, pie }: {
  etiqueta: string; valor: string; icono: any; tono: string; pie?: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground font-medium">{etiqueta}</p>
        <p className="text-2xl font-bold mt-1 tracking-tight truncate">{valor}</p>
        {pie && <div className="text-[11px] text-muted-foreground mt-1">{pie}</div>}
      </div>
      <div className={`p-2 rounded-xl flex-shrink-0 ${tono}`}><Icono className="w-4 h-4" /></div>
    </div>
  );
}

export default function PanelFinanzas({
  libroId,
  libroNombre,
  onRangoChange,
}: {
  libroId: string;
  libroNombre: string;
  onRangoChange?: (rango: { desde: string; hasta: string } | null) => void;
}) {
  // Sin rango se pide la cuenta completa; el primer resultado fija los límites
  // del selector para no ofrecer fechas donde no hay nada.
  const [rango, setRango] = useState<{ desde: string; hasta: string } | null>(null);

  const cambiarRango = (nuevo: { desde: string; hasta: string } | null) => {
    setRango(nuevo);
    onRangoChange?.(nuevo);
  };

  const consulta = rango ? `&desde=${rango.desde}&hasta=${rango.hasta}` : '';
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['finanzas-panel', libroId, rango?.desde ?? '', rango?.hasta ?? ''],
    queryFn: () => apiFetch<PanelDatos>(`/api/finanzas/panel?libro=${encodeURIComponent(libroId)}${consulta}`),
    // Al cambiar el rango se conserva la vista anterior atenuada: sin parpadeo
    // de esqueleto ni saltos de maquetación.
    placeholderData: keepPreviousData,
  });

  const limites = data?.rangoDisponible ?? { desde: null, hasta: null };
  const presets = useMemo(() => presetsDeRango(limites.desde, limites.hasta), [limites.desde, limites.hasta]);

  // Al cambiar de cuenta, el rango de la anterior deja de tener sentido
  useEffect(() => {
    setRango(null);
    onRangoChange?.(null);
  }, [libroId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando el panel...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return <p className="text-center text-sm text-muted-foreground py-16">No se pudo cargar el panel de esta cuenta.</p>;
  }

  if (!limites.desde) {
    return <p className="text-center text-sm text-muted-foreground py-16">Esta cuenta todavía no tiene movimientos capturados.</p>;
  }

  const selector = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-muted-foreground">
        {rango
          ? <>Viendo del <span className="font-medium text-foreground">{fmtDate(rango.desde)}</span> al <span className="font-medium text-foreground">{fmtDate(rango.hasta)}</span></>
          : <>Viendo <span className="font-medium text-foreground">todo el histórico</span> de la cuenta</>}
      </p>
      <RangoFechas
        desde={rango?.desde ?? limites.desde}
        hasta={rango?.hasta ?? limites.hasta!}
        min={limites.desde}
        max={limites.hasta}
        presets={presets}
        onChange={(d, h) => cambiarRango(d === limites.desde && h === limites.hasta ? null : { desde: d, hasta: h })}
      />
    </div>
  );

  if (!data.movimientos) {
    return (
      <div className="space-y-5">
        {selector}
        <p className="text-center text-sm text-muted-foreground py-16">
          No hay movimientos en el rango elegido. Hay datos del {fmtDate(limites.desde)} al {fmtDate(limites.hasta!)}.
        </p>
      </div>
    );
  }

  const serie = data.serieSemanal;
  const ultima = serie.at(-1);
  const previa = serie.at(-2);
  const delta = ultima && previa ? ultima.saldo - previa.saldo : null;

  const categorias = data.porCategoria.map((c) => ({
    ...c,
    etiqueta: ETIQUETA_CAT[c.categoria] ?? c.categoria,
    porcentaje: data.egresos ? Math.round((c.total / data.egresos) * 100) : 0,
  }));
  const beneficiarios = data.topBeneficiarios.map((b) => ({
    ...b,
    etiqueta: (b.nombre ?? '').length > 22 ? (b.nombre ?? '').slice(0, 21) + '…' : b.nombre ?? '',
  }));

  return (
    <div className={`space-y-5 animate-in fade-in duration-300 ${isFetching ? 'opacity-60 transition-opacity' : ''}`}>
      {/* El rango va en una sola fila arriba y alcanza a todo lo de abajo */}
      {selector}

      {/* ── Cifra principal y fichas del periodo ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="rounded-2xl p-6 text-white shadow-sm" style={{ background: 'linear-gradient(135deg, #16357a 0%, #2a78d6 100%)' }}>
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wide text-white/85">Existencia · {libroNombre}</p>
            <Wallet className="w-4 h-4 text-white/85" />
          </div>
          <p className="text-[44px] leading-tight font-bold mt-2">{money(data.existencia)}</p>
          {/* El saldo es acumulado, así que con un rango parcial hay que decir a qué día corresponde */}
          {rango && data.hasta && (
            <p className="text-[11px] text-white/85 mt-0.5">Saldo al {fmtDate(data.hasta)}</p>
          )}
          {delta !== null && (
            <p className="text-xs text-white/85 flex items-center gap-1 mt-1">
              {delta >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {delta >= 0 ? '+' : '−'}{money(Math.abs(delta))} respecto a la semana anterior
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-white/20">
            <div>
              <p className="text-[11px] text-white/85 flex items-center gap-1"><CreditCard className="w-3 h-3" /> Tarjeta</p>
              <p className="text-lg font-semibold mt-0.5">{money(data.tarjeta)}</p>
            </div>
            <div>
              <p className="text-[11px] text-white/85 flex items-center gap-1"><Banknote className="w-3 h-3" /> Efectivo</p>
              <p className="text-lg font-semibold mt-0.5">{money(data.efectivo)}</p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 grid grid-cols-2 gap-4">
          <Ficha
            etiqueta="Ingresos del periodo" valor={money(data.ingresos)}
            icono={TrendingUp} tono="bg-blue-50 text-blue-600"
            pie={data.desde && data.hasta ? `${fmtDate(data.desde)} – ${fmtDate(data.hasta)}` : undefined}
          />
          <Ficha
            etiqueta="Egresos del periodo" valor={money(data.egresos)}
            icono={TrendingDown} tono="bg-orange-50 text-orange-600"
            pie={`${serie.length} ${serie.length === 1 ? 'semana' : 'semanas'} con movimiento`}
          />
          <Ficha
            etiqueta="Movimientos capturados" valor={data.movimientos.toLocaleString('es-MX')}
            icono={Receipt} tono="bg-violet-50 text-violet-600"
            pie={`${categorias.length} categorías de egreso`}
          />
          <Ficha
            etiqueta="Servicio con más gasto"
            valor={data.topServicios[0] ? moneyCorto(data.topServicios[0].total) : '—'}
            icono={MapPin} tono="bg-emerald-50 text-emerald-600"
            pie={data.topServicios[0]?.servicio ?? 'Sin servicios registrados'}
          />
        </div>
      </div>

      {/* ── Dos series: por eso lleva leyenda ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Flujo semanal de la cuenta</CardTitle>
          <p className="text-xs text-muted-foreground">Cuánto entró y cuánto salió cada semana. Los traspasos entre tarjeta y efectivo no cuentan aquí.</p>
        </CardHeader>
        <CardContent className="h-[320px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={serie} margin={{ top: 8, right: 8, left: 4, bottom: 4 }} barGap={2}>
              <CartesianGrid vertical={false} stroke={REJILLA} />
              <XAxis dataKey="semana" tickFormatter={diaMes} stroke={EJE} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={moneyCorto} stroke={EJE} fontSize={11} tickLine={false} axisLine={false} width={54} />
              <ChartTooltip content={<TooltipDinero sufijo="Semana del" />} cursor={{ fill: 'rgba(11,11,11,0.04)' }} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              <Bar dataKey="ingresos" name="Ingresos" fill={SERIE_INGRESO} radius={[4, 4, 0, 0]} maxBarSize={22} />
              <Bar dataKey="egresos" name="Egresos" fill={SERIE_EGRESO} radius={[4, 4, 0, 0]} maxBarSize={22} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ── Magnitud: un solo tono, con el valor siempre visible ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">En qué se va el dinero</CardTitle>
            <p className="text-xs text-muted-foreground">Egresos acumulados por categoría</p>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="space-y-4">
              {categorias.map((c) => (
                <div key={c.categoria}>
                  <div className="flex items-baseline justify-between text-sm mb-1">
                    <span className="font-medium">{c.etiqueta}</span>
                    <span className="tabular-nums font-semibold">{money(c.total)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${c.porcentaje}%`, background: SERIE_EGRESO }} />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">{c.porcentaje}% del egreso · {c.movimientos} movimientos</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Quién concentra el gasto</CardTitle>
            <p className="text-xs text-muted-foreground">Los 8 nombres con mayor importe acumulado</p>
          </CardHeader>
          <CardContent className="h-[300px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={beneficiarios} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 4 }}>
                <CartesianGrid horizontal={false} stroke={REJILLA} />
                <XAxis type="number" tickFormatter={moneyCorto} stroke={EJE} fontSize={11} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="etiqueta" stroke={EJE} fontSize={11} tickLine={false} axisLine={false} width={140} />
                <ChartTooltip content={<TooltipDinero />} cursor={{ fill: 'rgba(11,11,11,0.04)' }} />
                <Bar dataKey="total" name="Importe" fill={SERIE_EGRESO} radius={[0, 4, 4, 0]} maxBarSize={18}>
                  <LabelList dataKey="total" position="right" formatter={(v: any) => moneyCorto(Number(v))} style={{ fontSize: 11, fill: '#52514e' }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* ── Una sola serie: el título la nombra, no necesita leyenda ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Cómo evolucionó el saldo</CardTitle>
          <p className="text-xs text-muted-foreground">Saldo acumulado al cierre de cada semana</p>
        </CardHeader>
        <CardContent className="h-[260px] pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={serie} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="degradadoSaldo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIE_INGRESO} stopOpacity={0.18} />
                  <stop offset="95%" stopColor={SERIE_INGRESO} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={REJILLA} />
              <XAxis dataKey="semana" tickFormatter={diaMes} stroke={EJE} fontSize={11} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={moneyCorto} stroke={EJE} fontSize={11} tickLine={false} axisLine={false} width={54} />
              <ChartTooltip content={<TooltipDinero sufijo="Semana del" />} />
              <Area type="monotone" dataKey="saldo" name="Saldo" stroke={SERIE_INGRESO} strokeWidth={2} fill="url(#degradadoSaldo)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff' }} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        El saldo es acumulado: arrastra lo que la cuenta traía antes del periodo. Ingresos y egresos sí son solo del rango elegido.
      </p>
    </div>
  );
}
