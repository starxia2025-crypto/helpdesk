import { useState } from "react";
import { 
  useGetDashboardStats, 
  useGetTicketsByStatus, 
  useGetTicketsOverTime, 
  useGetRecentActivity,
  useGetMe
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { 
  LineChart,
  Line,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as RechartsTooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { Ticket, Clock, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { StatusBadge } from "@/components/badges";

export default function Dashboard() {
  const { data: user } = useGetMe();
  const tenantId = user?.role === 'superadmin' ? undefined : user?.tenantId;
  
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats({ tenantId });
  const { data: statusData } = useGetTicketsByStatus({ tenantId });
  const { data: timeData } = useGetTicketsOverTime({ tenantId, period: "day" });
  const { data: activity } = useGetRecentActivity({ tenantId, limit: 5 });

  const COLORS = ['#6366f1', '#14b8a6', '#f59e0b', '#f43f5e', '#ef4444', '#8b5cf6', '#64748b'];

  if (statsLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-64 bg-slate-200 dark:bg-slate-800 rounded"></div>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[1,2,3,4].map(i => (
            <div key={i} className="h-32 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
          <div className="h-96 bg-slate-200 dark:bg-slate-800 rounded-xl"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Estadísticas de soporte</h1>
        <p className="text-slate-500 mt-1">Visión agregada de incidencias, tiempos de resolución y carga operativa por cliente.</p>
      </div>

      {/* Tarjetas KPI */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Tickets Abiertos</CardTitle>
            <Ticket className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.openTickets || 0}</div>
            <p className="text-xs text-slate-500 mt-1">
              <span className="text-red-500 font-medium">{stats?.urgentTickets || 0} urgentes</span> requieren atención
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Tiempo Medio de Resolución</CardTitle>
            <Clock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.avgResolutionHours ? `${stats.avgResolutionHours}h` : 'N/A'}</div>
            <p className="text-xs text-slate-500 mt-1">
              Basado en tickets resueltos recientemente
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Resueltos</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.resolvedTickets || 0}</div>
            <p className="text-xs text-slate-500 mt-1">
              ¡Buen trabajo, equipo!
            </p>
          </CardContent>
        </Card>

        {user?.role === 'superadmin' ? (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Total de Clientes</CardTitle>
              <Building2 className="h-4 w-4 text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.totalTenants || 0}</div>
              <p className="text-xs text-slate-500 mt-1">
                Organizaciones activas
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-500">Tickets Nuevos</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{stats?.newTickets || 0}</div>
              <p className="text-xs text-slate-500 mt-1">
                Pendientes de primera respuesta
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-7">
        {/* Gráfico principal */}
        <Card className="md:col-span-4">
          <CardHeader>
            <CardTitle>Volumen de Tickets</CardTitle>
            <CardDescription>Creados vs. Resueltos en el tiempo</CardDescription>
          </CardHeader>
          <CardContent className="px-2">
            <div className="h-[300px] w-full">
              {timeData && timeData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="date" 
                      tick={{fontSize: 12, fill: '#64748b'}} 
                      axisLine={false} 
                      tickLine={false} 
                      tickFormatter={(val) => format(new Date(val), 'd MMM', { locale: es })}
                    />
                    <YAxis tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                      labelFormatter={(val) => format(new Date(val), "d 'de' MMMM, yyyy", { locale: es })}
                    />
                    <Line type="monotone" dataKey="created" name="Creados" stroke="#6366f1" strokeWidth={3} dot={false} activeDot={{r: 6}} />
                    <Line type="monotone" dataKey="resolved" name="Resueltos" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{r: 6}} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-400">No hay suficientes datos para mostrar</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Donut por estado */}
        <Card className="md:col-span-3">
          <CardHeader>
            <CardTitle>Tickets por Estado</CardTitle>
            <CardDescription>Instantánea actual de todos los tickets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full flex flex-col items-center justify-center">
              {statusData && statusData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="label"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-slate-400">Sin tickets activos</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Actividad reciente */}
      <Card>
        <CardHeader>
          <CardTitle>Actividad Reciente</CardTitle>
          <CardDescription>Últimas actualizaciones en tus operaciones</CardDescription>
        </CardHeader>
        <CardContent>
          {activity && activity.length > 0 ? (
            <div className="space-y-6">
              {activity.map((item) => (
                <div key={item.id} className="flex gap-4">
                  <div className="h-2 w-2 mt-2 rounded-full bg-primary shrink-0" />
                  <div className="flex-1 space-y-1">
                    <p className="text-sm font-medium">
                      <span className="font-bold">{item.userName}</span> {item.action} {item.entityType} 
                      {item.entityTitle && <span className="text-slate-600 dark:text-slate-400"> "{item.entityTitle}"</span>}
                    </p>
                    <div className="flex items-center text-xs text-slate-500 gap-2">
                      <span>{format(new Date(item.createdAt), "d MMM, HH:mm", { locale: es })}</span>
                      {item.tenantName && (
                        <>
                          <span>•</span>
                          <span>{item.tenantName}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-slate-500">Sin actividad reciente</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
