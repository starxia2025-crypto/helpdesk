import { useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  useGetTicket,
  useListTicketComments,
  useAddTicketComment,
  useChangeTicketStatus,
  useGetMe,
  useUpdateTicket,
  TicketStatus,
  TicketPriority,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Send, Clock, User, Building, Paperclip, Lock, LockOpen, Pencil, XCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";

function readField(ticket: any, key: string) {
  return ticket?.customFields && key in ticket.customFields ? ticket.customFields[key] : null;
}

function formatTicketFieldLabel(key: string) {
  const labels: Record<string, string> = {
    studentEmail: "Email del alumno",
    reporterEmail: "Cuenta que registra la consulta",
    inquiryType: "Tipo de consulta",
    subjectType: "La consulta es sobre",
    stage: "Etapa",
    course: "Curso",
    studentEnrollment: "Matricula del alumno",
    subject: "Asignatura",
    observations: "Observaciones",
    activationRequested: "Activacion urgente",
  };

  return labels[key] ?? key;
}

export default function TicketDetail() {
  const [location, setLocation] = useLocation();
  const params = useParams();
  const idFromPath = Number(location.split("/").filter(Boolean).pop() ?? "0");
  const id = parseInt((params as any).id || (params as any).ticketId || String(idFromPath || 0), 10);
  
  const { data: user } = useGetMe();
  const { data: ticket, isLoading: ticketLoading, refetch: refetchTicket } = useGetTicket(id);
  const { data: comments, refetch: refetchComments } = useListTicketComments(id);
  
  const [commentText, setCommentText] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPriority, setEditPriority] = useState<TicketPriority>(TicketPriority.media);
  const [editStudentEmail, setEditStudentEmail] = useState("");

  const addComment = useAddTicketComment({
    mutation: {
      onSuccess: async () => {
        setCommentText("");
        await Promise.all([refetchComments(), refetchTicket()]);
      }
    }
  });

  const changeStatus = useChangeTicketStatus({
    mutation: {
      onSuccess: async () => {
        await refetchTicket();
      },
      onError: (error) => {
        toast({
          title: "No se pudo actualizar el estado",
          description: error instanceof Error ? error.message : "Intentalo de nuevo.",
          variant: "destructive",
        });
      },
    }
  });

  const updateTicket = useUpdateTicket({
    mutation: {
      onSuccess: async () => {
        setEditOpen(false);
        toast({
          title: "Consulta actualizada",
          description: "Los cambios se han guardado correctamente.",
        });
        await refetchTicket();
      },
      onError: (error) => {
        toast({
          title: "No se pudo actualizar la consulta",
          description: error instanceof Error ? error.message : "Intentalo de nuevo.",
          variant: "destructive",
        });
      },
    },
  });

  const isStaff = ["superadmin", "tecnico", "admin_cliente"].includes(user?.role ?? "");
  const canManageTicket = !!user && !!ticket && (isStaff || ticket.createdById === user.id);
  const incidentData = useMemo(() => {
    if (!ticket?.customFields) return [];

    const orderedKeys = [
      "studentEmail",
      "reporterEmail",
      "inquiryType",
      "subjectType",
      "studentEnrollment",
      "stage",
      "course",
      "subject",
      "observations",
      "activationRequested",
    ];

    return orderedKeys
      .filter((key) => ticket.customFields[key] !== undefined && ticket.customFields[key] !== null && String(ticket.customFields[key]).trim() !== "")
      .map((key) => ({
        key,
        label: formatTicketFieldLabel(key),
        value: ticket.customFields[key],
      }));
  }, [ticket]);

  const extraCustomFields = useMemo(() => {
    if (!ticket?.customFields) return [];

    const hidden = new Set([
      "studentEmail",
      "reporterEmail",
      "inquiryType",
      "subjectType",
      "studentEnrollment",
      "stage",
      "course",
      "subject",
      "observations",
      "activationRequested",
      "mochilaLookup",
      "school",
    ]);

    return Object.entries(ticket.customFields).filter(([key, value]) => !hidden.has(key) && value !== null && value !== undefined && String(value).trim() !== "");
  }, [ticket]);

  if (ticketLoading) {
    return (
      <div className="space-y-6 max-w-5xl mx-auto animate-pulse">
        <div className="h-8 w-32 bg-slate-200 rounded" />
        <div className="h-32 bg-slate-200 rounded-xl" />
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 h-96 bg-slate-200 rounded-xl" />
          <div className="h-64 bg-slate-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!ticket) return <div>Ticket no encontrado</div>;

  const handleStatusChange = (status: string) => {
    changeStatus.mutate({ 
      ticketId: id, 
      data: { status: status as TicketStatus } 
    });
  };

  const handlePostComment = () => {
    if (!commentText.trim()) return;
    addComment.mutate({
      ticketId: id,
      data: { content: commentText, isInternal }
    });
  };

  const handleOpenEdit = () => {
    setEditTitle(ticket.title ?? "");
    setEditDescription(ticket.description ?? "");
    setEditCategory(ticket.category ?? "");
    setEditPriority((ticket.priority as TicketPriority) ?? TicketPriority.media);
    setEditStudentEmail(String(readField(ticket, "studentEmail") ?? ""));
    setEditOpen(true);
  };

  const handleSaveEdit = () => {
    updateTicket.mutate({
      ticketId: id,
      data: {
        title: editTitle.trim(),
        description: editDescription.trim(),
        category: editCategory.trim() || null,
        priority: editPriority,
        customFields: {
          ...(ticket.customFields ?? {}),
          studentEmail: editStudentEmail.trim() || null,
        },
      },
    });
  };

  const handleDeactivateTicket = () => {
    changeStatus.mutate({
      ticketId: id,
      data: {
        status: TicketStatus.cerrado,
        comment: "Consulta desactivada por el usuario.",
      },
    });
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => setLocation("/tickets")} className="gap-2 -ml-4 text-slate-500">
        <ArrowLeft className="h-4 w-4" />
        Volver a Tickets
      </Button>

      {/* Cabecera */}
      <Card className="border-t-4 border-t-primary shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                  #{ticket.ticketNumber}
                </span>
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
                {ticket.title}
              </h1>
              <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500 mt-2">
                <span className="flex items-center gap-1.5"><User className="h-4 w-4" /> {ticket.createdByName}</span>
                <span className="flex items-center gap-1.5"><Building className="h-4 w-4" /> {ticket.schoolName || ticket.tenantName}</span>
                <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" /> {format(new Date(ticket.createdAt), "d MMM yyyy HH:mm", { locale: es })}</span>
              </div>
            </div>

            {isStaff && (
              <div className="flex flex-col sm:flex-row gap-3 md:min-w-[200px] shrink-0">
                <Select value={ticket.status} onValueChange={handleStatusChange}>
                  <SelectTrigger className="font-medium">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TicketStatus.nuevo}>Nuevo</SelectItem>
                    <SelectItem value={TicketStatus.pendiente}>Pendiente</SelectItem>
                    <SelectItem value={TicketStatus.en_revision}>En RevisiÃ³n</SelectItem>
                    <SelectItem value={TicketStatus.en_proceso}>En Proceso</SelectItem>
                    <SelectItem value={TicketStatus.esperando_cliente}>Esperando Cliente</SelectItem>
                    <SelectItem value={TicketStatus.resuelto}>Resuelto</SelectItem>
                    <SelectItem value={TicketStatus.cerrado}>Cerrado</SelectItem>
                  </SelectContent>
                </Select>
                {canManageTicket && (
                  <>
                    <Button variant="outline" className="gap-2" onClick={handleOpenEdit}>
                      <Pencil className="h-4 w-4" />
                      Editar consulta
                    </Button>
                    <Button
                      variant="outline"
                      className="gap-2 text-rose-600 border-rose-200 hover:bg-rose-50"
                      disabled={ticket.status === TicketStatus.cerrado || changeStatus.isPending}
                      onClick={handleDeactivateTicket}
                    >
                      <XCircle className="h-4 w-4" />
                      Desactivar consulta
                    </Button>
                  </>
                )}
              </div>
            )}
            {!isStaff && canManageTicket && (
              <div className="flex flex-col sm:flex-row gap-3 md:min-w-[200px] shrink-0">
                <Button variant="outline" className="gap-2" onClick={handleOpenEdit}>
                  <Pencil className="h-4 w-4" />
                  Editar consulta
                </Button>
                <Button
                  variant="outline"
                  className="gap-2 text-rose-600 border-rose-200 hover:bg-rose-50"
                  disabled={ticket.status === TicketStatus.cerrado || changeStatus.isPending}
                  onClick={handleDeactivateTicket}
                >
                  <XCircle className="h-4 w-4" />
                  Desactivar consulta
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
      </Card>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Hilo principal */}
        <div className="md:col-span-2 space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="pb-3">
              <h2 className="text-lg font-semibold text-slate-900">Datos de la incidencia</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              {incidentData.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {incidentData.map((item) => (
                    <div key={item.key} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-xs uppercase tracking-wide text-slate-500">{item.label}</div>
                      <div className="mt-1 text-sm font-medium text-slate-900 whitespace-pre-wrap">
                        {typeof item.value === "boolean" ? (item.value ? "Si" : "No") : String(item.value)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                  Esta consulta no tiene datos adicionales de incidencia guardados.
                </div>
              )}
            </CardContent>
          </Card>
          {/* DescripciÃ³n original */}
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="prose dark:prose-invert max-w-none whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                {ticket.description}
              </div>
            </CardContent>
          </Card>

          {/* Lista de comentarios */}
          <div className="space-y-4">
            {comments?.map((comment) => (
              <Card 
                key={comment.id} 
                className={`shadow-sm border-l-4 ${
                  comment.isInternal 
                    ? "border-l-amber-400 bg-amber-50/30 dark:bg-amber-900/10" 
                    : comment.authorRole.includes('cliente') 
                      ? "border-l-blue-400" 
                      : "border-l-slate-200 dark:border-l-slate-700"
                }`}
              >
                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between space-y-0">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center font-semibold text-xs text-slate-600 dark:text-slate-300">
                      {comment.authorName.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {comment.authorName}
                        {comment.isInternal && (
                          <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded flex items-center gap-1">
                            <Lock className="h-3 w-3" /> Interno
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{format(new Date(comment.createdAt), "d MMM, HH:mm", { locale: es })}</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <div className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">
                    {comment.content}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Caja de comentario nuevo */}
          <Card className={`shadow-sm border-2 ${isInternal ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/20' : 'border-primary/20 focus-within:border-primary'}`}>
            <CardContent className="p-4">
              <Textarea 
                placeholder={isInternal ? "Escribe una nota interna (los clientes no la verÃ¡n)..." : "Escribe una respuesta..."}
                className={`min-h-[120px] resize-y border-0 focus-visible:ring-0 p-0 shadow-none text-base bg-transparent ${isInternal ? 'placeholder:text-amber-700/40' : ''}`}
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
              />
              
              <Separator className="my-4" />
              
              <div className="flex items-center justify-between">
                <div className="flex gap-2">
                  {isStaff && (
                    <Button 
                      type="button" 
                      variant={isInternal ? "secondary" : "ghost"} 
                      size="sm"
                      className={`gap-2 ${isInternal ? 'bg-amber-100 hover:bg-amber-200 text-amber-900' : 'text-slate-500'}`}
                      onClick={() => setIsInternal(!isInternal)}
                    >
                      {isInternal ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                      Nota Interna
                    </Button>
                  )}
                  <Button type="button" variant="ghost" size="sm" className="gap-2 text-slate-500">
                    <Paperclip className="h-4 w-4" />
                    Adjuntar
                  </Button>
                </div>
                <Button 
                  onClick={handlePostComment} 
                  disabled={!commentText.trim() || addComment.isPending}
                  className={`gap-2 ${isInternal ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                >
                  <Send className="h-4 w-4" />
                  {isInternal ? 'Guardar Nota' : 'Enviar Respuesta'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Panel lateral */}
        <div className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader className="p-4 pb-2">
              <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500">Propiedades</h3>
            </CardHeader>
            <CardContent className="p-4 pt-0 space-y-4">
              <div>
                <div className="text-xs text-slate-500 mb-1">CategorÃ­a</div>
                <div className="font-medium text-sm capitalize">{ticket.category || 'Sin categorÃ­a'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Asignado a</div>
                <div className="font-medium text-sm">{ticket.assignedToName || 'Sin asignar'}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Red educativa</div>
                <div className="font-medium text-sm">{ticket.tenantName}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500 mb-1">Colegio</div>
                <div className="font-medium text-sm">{ticket.schoolName || ticket.tenantName}</div>
              </div>
              {extraCustomFields.length > 0 && (
                <>
                  <Separator />
                  {extraCustomFields.map(([key, val]) => (
                    <div key={key}>
                      <div className="text-xs text-slate-500 mb-1">{formatTicketFieldLabel(key)}</div>
                      <div className="font-medium text-sm whitespace-pre-wrap">{String(val)}</div>
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          {isStaff && ticket.auditLogs && ticket.auditLogs.length > 0 && (
            <Card className="shadow-sm">
              <CardHeader className="p-4 pb-2">
                <h3 className="font-semibold text-sm uppercase tracking-wider text-slate-500">Historial</h3>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="space-y-4">
                  {ticket.auditLogs.slice(0, 5).map((log) => (
                    <div key={log.id} className="flex gap-3 text-sm">
                      <div className="h-2 w-2 mt-1.5 rounded-full bg-slate-300 shrink-0" />
                      <div>
                        <span className="font-medium">{log.userName}</span> {log.action}
                        <div className="text-xs text-slate-500 mt-0.5">
                          {format(new Date(log.createdAt), "d MMM, HH:mm", { locale: es })}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar consulta</DialogTitle>
            <DialogDescription>Actualiza los datos visibles de la incidencia sin borrar el historial.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="ticket-title">Asunto</Label>
              <Input id="ticket-title" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="ticket-student-email">Email del alumno</Label>
                <Input id="ticket-student-email" value={editStudentEmail} onChange={(e) => setEditStudentEmail(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="ticket-category">Categoria</Label>
                <Input id="ticket-category" value={editCategory} onChange={(e) => setEditCategory(e.target.value)} />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Prioridad</Label>
              <Select value={editPriority} onValueChange={(value) => setEditPriority(value as TicketPriority)}>
                <SelectTrigger>
                  <SelectValue placeholder="Prioridad" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TicketPriority.baja}>Baja</SelectItem>
                  <SelectItem value={TicketPriority.media}>Media</SelectItem>
                  <SelectItem value={TicketPriority.alta}>Alta</SelectItem>
                  <SelectItem value={TicketPriority.urgente}>Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="ticket-description">Descripcion</Label>
              <Textarea id="ticket-description" className="min-h-[180px]" value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button onClick={handleSaveEdit} disabled={updateTicket.isPending}>Guardar cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
