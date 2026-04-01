import { useListTickets, useListTenants, useListUsers } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { Building2, Users, BookOpen, ArrowRight, LifeBuoy } from "lucide-react";
import { Link } from "wouter";

export default function Admin() {
  const { data: tickets } = useListTickets({ limit: 8, status: "nuevo" });
  const { data: tenants } = useListTenants({ limit: 6 });
  const { data: users } = useListUsers({ limit: 6 });

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Backoffice técnico</h1>
        <p className="text-slate-500">Centro operativo para revisar incidencias, dar de alta clientes y mantener el entorno de soporte de cada escuela.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Tickets nuevos</CardDescription>
            <CardTitle className="text-3xl">{tickets?.data.length || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-500">Incidencias pendientes de primera revisión.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Clientes visibles</CardDescription>
            <CardTitle className="text-3xl">{tenants?.data.length || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-500">Grupos educativos y colegios con soporte activo.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Usuarios recientes</CardDescription>
            <CardTitle className="text-3xl">{users?.data.length || 0}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-500">Base inicial para futuros permisos y gestión por colegio.</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Portal de ayuda</CardDescription>
            <CardTitle className="text-3xl">Activo</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-500">Manuals, vídeos y documentación por cliente.</CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Tickets pendientes de triage</CardTitle>
            <CardDescription>Entrada rápida para el equipo técnico mientras ampliamos el módulo `/admin`.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tickets?.data.length ? (
              tickets.data.map((ticket) => (
                <div key={ticket.id} className="flex flex-col gap-3 rounded-xl border p-4 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">{ticket.title}</span>
                      <StatusBadge status={ticket.status} />
                      <PriorityBadge priority={ticket.priority} />
                    </div>
                    <p className="text-sm text-slate-500">
                      {String(ticket.customFields?.school || ticket.tenantName)} · {String(ticket.customFields?.inquiryType || "Consulta general")}
                    </p>
                  </div>
                  <Link href={`/tickets/${ticket.id}`}>
                    <Button variant="outline" className="gap-2">
                      Abrir ticket
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed p-8 text-center text-slate-500">No hay tickets nuevos en este momento.</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Acciones recomendadas</CardTitle>
            <CardDescription>Atajos operativos mientras seguimos construyendo el área técnica completa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/clients">
              <Button variant="outline" className="w-full justify-start gap-2"><Building2 className="h-4 w-4" /> Alta y configuración de clientes</Button>
            </Link>
            <Link href="/users">
              <Button variant="outline" className="w-full justify-start gap-2"><Users className="h-4 w-4" /> Gestión de usuarios y roles</Button>
            </Link>
            <Link href="/portal">
              <Button variant="outline" className="w-full justify-start gap-2"><BookOpen className="h-4 w-4" /> Contenidos de ayuda</Button>
            </Link>
            <Link href="/tickets">
              <Button variant="outline" className="w-full justify-start gap-2"><LifeBuoy className="h-4 w-4" /> Operativa completa de tickets</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
