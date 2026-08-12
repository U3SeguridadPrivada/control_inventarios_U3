'use client';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ChartTooltip, ResponsiveContainer } from 'recharts';
import { apiFetch } from '@/src/lib/api';
import { useAuth } from '@/src/context/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/src/components/ui/card';
import { Button } from '@/src/components/ui/button';
import { Badge } from '@/src/components/ui/badge';
import { ArrowDownToLine, ArrowUpFromLine, ShieldCheck, AlertCircle, Users, Package } from 'lucide-react';
import { fmtDate } from '@/src/lib/utils';

export default function DashboardApp() {
  const { isEditor } = useAuth();
  const router = useRouter();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dashboardMetrics'],
    queryFn: () => apiFetch<{ metrics: any; chartData: any[]; recentMovements: any[] }>('/api/dashboard/metrics'),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
          <p className="text-sm text-muted-foreground">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex items-center justify-center min-h-[300px] flex-col gap-4">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="w-7 h-7 text-destructive" />
        </div>
        <h2 className="text-xl font-semibold">Error al conectar con el servidor</h2>
        <p className="text-muted-foreground text-center max-w-md text-sm">No se pudo cargar la información del dashboard.</p>
      </div>
    );
  }

  const { metrics, chartData, recentMovements } = data;

  const metricCards = [
    { title: "Total Entradas", value: metrics?.totalEntradas ?? 0, icon: ArrowDownToLine, color: "text-blue-600", bg: "bg-blue-50", appId: "entradas" },
    { title: "Total Salidas", value: metrics?.totalSalidas ?? 0, icon: ArrowUpFromLine, color: "text-orange-600", bg: "bg-orange-50", appId: "salidas" },
    { title: "Items en Campo", value: metrics?.itemsEnCampo ?? 0, icon: Package, color: "text-emerald-600", bg: "bg-emerald-50", appId: "uniformes-campo" },
    { title: "Guardias Activos", value: metrics?.guardiasActivos ?? 0, icon: Users, color: "text-violet-600", bg: "bg-violet-50", appId: "guardias" },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Resumen general del sistema de inventario</p>
        </div>
        {isEditor && (
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => router.push('/entradas')}><ArrowDownToLine className="w-4 h-4 mr-1.5" /> Nueva Entrada</Button>
            <Button size="sm" onClick={() => router.push('/salidas')} className="bg-accent hover:bg-accent/90 text-white"><ArrowUpFromLine className="w-4 h-4 mr-1.5" /> Nueva Salida</Button>
            <Button size="sm" onClick={() => router.push('/uniformes-campo')} variant="outline"><ShieldCheck className="w-4 h-4 mr-1.5" /> En Campo</Button>
          </div>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => router.push(`/${card.appId}`)}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">{card.title}</p>
                    <p className="text-3xl font-bold mt-1 tracking-tight">{card.value}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl ${card.bg}`}>
                    <Icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-7 gap-5">
        <Card className="col-span-4">
          <CardHeader className="pb-4"><CardTitle className="text-base font-semibold">Actividad de Movimientos</CardTitle></CardHeader>
          <CardContent className="h-[280px]">
            {chartData && chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorEntradas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.15} /><stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="colorSalidas" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f97316" stopOpacity={0.15} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
                  <XAxis dataKey="fecha" stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--color-muted-foreground)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <ChartTooltip contentStyle={{ background: '#fff', borderColor: 'var(--color-border)', borderRadius: '10px', boxShadow: '0 4px 16px rgba(0,0,0,0.08)', fontSize: '12px' }} />
                  <Area type="monotone" dataKey="Entradas" stroke="#3b82f6" strokeWidth={2} fillOpacity={1} fill="url(#colorEntradas)" />
                  <Area type="monotone" dataKey="Salidas" stroke="#f97316" strokeWidth={2} fillOpacity={1} fill="url(#colorSalidas)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">Registra entradas o salidas para ver la actividad aquí</div>
            )}
          </CardContent>
        </Card>
        <Card className="col-span-3">
          <CardHeader className="pb-4"><CardTitle className="text-base font-semibold">Movimientos Recientes</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentMovements && recentMovements.length > 0 ? (
                recentMovements.map((move: any) => (
                  <div key={move.id} className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${move.tipo === 'Entrada' ? 'bg-blue-50' : 'bg-orange-50'}`}>
                        {move.tipo === 'Entrada' ? <ArrowDownToLine className="w-4 h-4 text-blue-600" /> : <ArrowUpFromLine className="w-4 h-4 text-orange-600" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm leading-tight">{move.cantidad} × {move.articulo}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{fmtDate(move.fecha)}</p>
                      </div>
                    </div>
                    <Badge variant={move.tipo === 'Entrada' ? "default" : "outline"} className="text-[11px] ml-2 shrink-0">{move.motivo || move.tipo}</Badge>
                  </div>
                ))
              ) : (
                <div className="text-sm text-muted-foreground text-center py-8">No hay movimientos recientes</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
