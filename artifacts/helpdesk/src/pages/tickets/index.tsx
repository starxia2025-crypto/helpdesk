import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { TicketStatus, useAssignTicket, useChangeTicketStatus, useGetMe, useListTickets } from "@workspace/api-client-react";
import { format, formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Search, Plus, Filter, MessageSquare, Clock, CheckCircle2, Inbox, UserRoundCheck, Eye, ArrowRight } from "lucide-react";

const openStatuses = ["nuevo", "pendiente", "en_revision", "en_proceso", "esperando_cliente"];

function getTicketSubtitle(ticket: any) {
  const school = String(ticket.schoolName || ticket.customFields?.school || ticket.category || ticket.tenantName || "Colegio");
  const inquiryType = String(ticket.customFields?.inquiryType || ticket.customFields?.subjectType || "Consulta general");
  const studentEmail = ticket.customFields?.studentEmail ? String(ticket.customFields.studentEmail) : null;
  return { school, inquiryType, studentEmail };
}

function SupportTicketCard({
  ticket,
  currentUserId,
  onTake,
  onResolve,
  busy,
}: {
  ticket: any;
  currentUserId: number;
  onTake: (ticketId: number) => void;
  onResolve: (ticketId: number) => void;
  busy?: boolean;
}) {
  const [, setLocation] = useLocation();
  const { school, inquiryType, studentEmail } = getTicketSubtitle(ticket);
  const isMine = ticket.assignedToId === currentUserId;
  const occupiedByOther = !!ticket.assignedToId && ticket.assignedToId !== currentUserId;

  return (
    <Card className="overflow-hidden border-slate-200 shadow-sm transition hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs font-semibold text-slate-600">#{ticket.ticketNumber}</span>
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              {occupiedByOther && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Ocupado por {ticket.assignedToName}</span>}
              {isMine && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">En mis manos</span>}
            </div>

            <div>
              <h3 className="line-clamp-2 text-lg font-semibold text-slate-900">{ticket.title}</h3>
              <p className="mt-1 text-sm text-slate-500">{school} · {inquiryType}</p>
            </div>

            <div className="grid gap-3 text-sm text-slate-500 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Informador</p>
                <p className="font-medium text-slate-700">{ticket.createdByName}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Actualizado</p>
                <p className="font-medium text-slate-700">{formatDistanceToNow(new Date(ticket.updatedAt), { addSuffix: true, locale: es })}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-slate-400">Comentarios</p>
                <p className="flex items-center gap-1 font-medium text-slate-700"><MessageSquare className="h-3.5 w-3.5" /> {ticket.commentCount}</p>
              </div>
            </div>
          </div>

          <div className="flex shrink-0 flex-col gap-2 lg:w-[190px]">
            {!ticket.assignedToId && (
              <Button className="gap-2" onClick={() => onTake(ticket.id)}>
                <UserRoundCheck className="h-4 w-4" />
                Tomar ticket
              </Button>
            )}
            {isMine && ticket.status !== "resuelto" && ticket.status !== "cerrado" && (
              <Button variant="secondary" className="gap-2" onClick={() => onResolve(ticket.id)}>
                <CheckCircle2 className="h-4 w-4" />
                Marcar resuelto
              </Button>
            )}
            {busy && occupiedByOther && (
              <Button variant="outline" disabled className="gap-2">
                <Eye className="h-4 w-4" />
                Lo esta viendo otro
              </Button>
            )}
            <Button variant="outline" className="gap-2" onClick={() => setLocation(`/tickets/${ticket.id}`)}>
              Abrir detalle
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Tickets() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const isSupportTech = user?.role === "tecnico";
  const showSchoolColumn = user?.scopeType === "tenant" || user?.scopeType === "global" || user?.role === "superadmin" || user?.role === "tecnico";

  const { data: ticketsData, isLoading, refetch } = useListTickets({
    page,
    limit: isSupportTech ? 100 : 20,
    search: search || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
    priority: priorityFilter !== "all" ? priorityFilter : undefined,
    tenantId: user?.role === "superadmin" || user?.role === "tecnico" ? undefined : user?.tenantId,
  });

  const assignTicket = useAssignTicket({
    mutation: {
      onSuccess: async () => {
        toast({ title: "Ticket tomado", description: "El ticket ya figura en tu bandeja de trabajo." });
        await refetch();
      },
      onError: (error) => {
        toast({
          title: "No se pudo tomar el ticket",
          description: error instanceof Error ? error.message : "Intentalo de nuevo.",
          variant: "destructive",
        });
      },
    },
  });

  const changeStatus = useChangeTicketStatus({
    mutation: {
      onSuccess: async () => {
        toast({ title: "Ticket actualizado", description: "El estado del ticket se ha guardado correctamente." });
        await refetch();
      },
      onError: (error) => {
        toast({
          title: "No se pudo actualizar el ticket",
          description: error instanceof Error ? error.message : "Intentalo de nuevo.",
          variant: "destructive",
        });
      },
    },
  });

  const filteredSupportTickets = useMemo(() => (ticketsData?.data ?? []), [ticketsData?.data]);

  const supportView = useMemo(() => {
    const queue = filteredSupportTickets.filter((ticket) => openStatuses.includes(ticket.status) && !ticket.assignedToId);
    const mine = filteredSupportTickets.filter((ticket) => openStatuses.includes(ticket.status) && ticket.assignedToId === user?.id);
    const occupied = filteredSupportTickets.filter((ticket) => openStatuses.includes(ticket.status) && ticket.assignedToId && ticket.assignedToId !== user?.id);
    const resolved = filteredSupportTickets.filter((ticket) => ticket.status === "resuelto" || ticket.status === "cerrado");
    return { queue, mine, occupied, resolved };
  }, [filteredSupportTickets, user?.id]);

  function handleTakeTicket(ticketId: number) {
    if (!user?.id) return;
    assignTicket.mutate({ ticketId, data: { userId: user.id } });
    changeStatus.mutate({ ticketId, data: { status: TicketStatus.en_proceso } });
  }

  function handleResolveTicket(ticketId: number) {
    changeStatus.mutate({ ticketId, data: { status: TicketStatus.resuelto } });
  }

  if (isSupportTech) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Bandeja tecnica</h1>
            <p className="mt-1 text-slate-500">Toma tickets pendientes, controla los que estan en manos de otros tecnicos y cierra los tuyos cuando queden resueltos.</p>
          </div>

          <Card className="w-full max-w-xl border-0 bg-white/80 shadow-sm">
            <CardContent className="flex flex-col gap-3 p-4 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Buscar ticket, colegio o asunto..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[170px]"><SelectValue placeholder="Prioridad" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    <SelectItem value="baja">Baja</SelectItem>
                    <SelectItem value="media">Media</SelectItem>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="urgente">Urgente</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[170px]"><SelectValue placeholder="Estado" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="nuevo">Nuevo</SelectItem>
                    <SelectItem value="pendiente">Pendiente</SelectItem>
                    <SelectItem value="en_revision">En revision</SelectItem>
                    <SelectItem value="en_proceso">En proceso</SelectItem>
                    <SelectItem value="esperando_cliente">Esperando cliente</SelectItem>
                    <SelectItem value="resuelto">Resuelto</SelectItem>
                    <SelectItem value="cerrado">Cerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-0 bg-gradient-to-br from-slate-900 to-slate-800 text-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/70">Sin asignar</p>
                  <p className="mt-2 text-3xl font-bold">{supportView.queue.length}</p>
                </div>
                <Inbox className="h-8 w-8 text-white/70" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/70">Mis tickets</p>
                  <p className="mt-2 text-3xl font-bold">{supportView.mine.length}</p>
                </div>
                <UserRoundCheck className="h-8 w-8 text-white/70" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 bg-gradient-to-br from-amber-500 to-amber-600 text-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/70">Ocupados por otros</p>
                  <p className="mt-2 text-3xl font-bold">{supportView.occupied.length}</p>
                </div>
                <Eye className="h-8 w-8 text-white/70" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-sm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/70">Resueltos</p>
                  <p className="mt-2 text-3xl font-bold">{supportView.resolved.length}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-white/70" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="queue" className="space-y-4">
          <TabsList className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="queue">Pendientes sin asignar</TabsTrigger>
            <TabsTrigger value="mine">Mis tickets</TabsTrigger>
            <TabsTrigger value="occupied">Ocupados por otros</TabsTrigger>
            <TabsTrigger value="resolved">Resueltos</TabsTrigger>
          </TabsList>

          <TabsContent value="queue" className="space-y-4">
            {supportView.queue.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-slate-500">No hay tickets pendientes sin asignar con los filtros actuales.</CardContent></Card>
            ) : (
              supportView.queue.map((ticket) => (
                <SupportTicketCard key={ticket.id} ticket={ticket} currentUserId={user!.id} onTake={handleTakeTicket} onResolve={handleResolveTicket} />
              ))
            )}
          </TabsContent>

          <TabsContent value="mine" className="space-y-4">
            {supportView.mine.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-slate-500">Todavia no tienes tickets tomados.</CardContent></Card>
            ) : (
              supportView.mine.map((ticket) => (
                <SupportTicketCard key={ticket.id} ticket={ticket} currentUserId={user!.id} onTake={handleTakeTicket} onResolve={handleResolveTicket} />
              ))
            )}
          </TabsContent>

          <TabsContent value="occupied" className="space-y-4">
            {supportView.occupied.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-slate-500">No hay tickets ocupados por otros tecnicos ahora mismo.</CardContent></Card>
            ) : (
              supportView.occupied.map((ticket) => (
                <SupportTicketCard key={ticket.id} ticket={ticket} currentUserId={user!.id} onTake={handleTakeTicket} onResolve={handleResolveTicket} busy />
              ))
            )}
          </TabsContent>

          <TabsContent value="resolved" className="space-y-4">
            {supportView.resolved.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-slate-500">No hay tickets resueltos con los filtros actuales.</CardContent></Card>
            ) : (
              supportView.resolved.map((ticket) => (
                <SupportTicketCard key={ticket.id} ticket={ticket} currentUserId={user!.id} onTake={handleTakeTicket} onResolve={handleResolveTicket} />
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Tickets de consulta</h1>
          <p className="mt-1 text-slate-500">Consulta el estado y la actividad de tus incidencias.</p>
        </div>
        {user?.role !== "visor_cliente" && (
          <Button onClick={() => setLocation("/tickets/new")} className="gap-2 shrink-0">
            <Plus className="h-4 w-4" />
            Nueva consulta
          </Button>
        )}
      </div>

      <Card className="p-4 flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Buscar por asunto, numero o colegio..."
            className="pl-9 w-full"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="flex gap-2 shrink-0">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="nuevo">Nuevo</SelectItem>
              <SelectItem value="pendiente">Pendiente</SelectItem>
              <SelectItem value="en_revision">En revision</SelectItem>
              <SelectItem value="en_proceso">En proceso</SelectItem>
              <SelectItem value="esperando_cliente">Esperando cliente</SelectItem>
              <SelectItem value="resuelto">Resuelto</SelectItem>
              <SelectItem value="cerrado">Cerrado</SelectItem>
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={(v) => { setPriorityFilter(v); setPage(1); }}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Prioridad" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las prioridades</SelectItem>
              <SelectItem value="baja">Baja</SelectItem>
              <SelectItem value="media">Media</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
              <SelectItem value="urgente">Urgente</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon"><Filter className="h-4 w-4" /></Button>
        </div>
      </Card>

      <div className="bg-white dark:bg-slate-900 border rounded-xl overflow-hidden shadow-sm">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
            <TableRow>
              <TableHead className="w-[100px] font-semibold">ID</TableHead>
              <TableHead className="font-semibold">Consulta</TableHead>
              <TableHead className="font-semibold">Estado</TableHead>
              <TableHead className="font-semibold">Prioridad</TableHead>
              {showSchoolColumn && <TableHead className="font-semibold">Colegio</TableHead>}
              <TableHead className="text-right font-semibold">Actividad</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><div className="h-5 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-5 w-64 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></TableCell>
                  <TableCell><div className="h-6 w-20 bg-slate-100 dark:bg-slate-800 rounded-full animate-pulse" /></TableCell>
                  <TableCell><div className="h-6 w-20 bg-slate-100 dark:bg-slate-800 rounded-full animate-pulse" /></TableCell>
                  {user?.role === "superadmin" && <TableCell><div className="h-5 w-24 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></TableCell>}
                  <TableCell><div className="h-5 w-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse ml-auto" /></TableCell>
                </TableRow>
              ))
            ) : ticketsData?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={showSchoolColumn ? 6 : 5} className="h-48 text-center text-slate-500">
                  No se encontraron tickets con los criterios indicados.
                </TableCell>
              </TableRow>
            ) : (
              ticketsData?.data.map((ticket) => {
                const { school, inquiryType, studentEmail } = getTicketSubtitle(ticket);
                return (
                  <TableRow key={ticket.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" onClick={() => setLocation(`/tickets/${ticket.id}`)}>
                    <TableCell className="font-mono text-xs font-medium text-slate-500">#{ticket.ticketNumber}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900 dark:text-slate-100 mb-1 line-clamp-1">{ticket.title}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-2">
                        <span className="truncate max-w-[200px]">{school}</span>
                        <span>·</span>
                        <span>{inquiryType}</span>
                      </div>
                      {studentEmail ? <div className="mt-1 text-xs text-slate-500">Alumno afectado: {studentEmail}</div> : null}
                    </TableCell>
                    <TableCell><StatusBadge status={ticket.status} /></TableCell>
                    <TableCell><PriorityBadge priority={ticket.priority} /></TableCell>
                    {showSchoolColumn && <TableCell className="text-sm">{ticket.schoolName || ticket.tenantName}</TableCell>}
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end gap-1">
                        <div className="flex items-center text-slate-500 text-xs gap-1"><Clock className="h-3 w-3" />{format(new Date(ticket.updatedAt), "d MMM yyyy", { locale: es })}</div>
                        {ticket.commentCount > 0 && <div className="flex items-center text-slate-400 text-xs gap-1"><MessageSquare className="h-3 w-3" />{ticket.commentCount}</div>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>

        {ticketsData && ticketsData.totalPages > 1 && (
          <div className="p-4 border-t flex justify-between items-center bg-slate-50/50 dark:bg-slate-900/50">
            <span className="text-sm text-slate-500">Mostrando {(page - 1) * 20 + 1}-{Math.min(page * 20, ticketsData.total)} de {ticketsData.total}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page === ticketsData.totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
