import { useLocation } from "wouter";
import {
  useCreateTicket,
  useListTenants,
  useGetMe,
  TicketPriority,
} from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Loader2 } from "lucide-react";

const educationTicketSchema = z.object({
  school: z.string().min(2, "Indica el colegio"),
  reporterEmail: z.string().min(3, "Indica el correo del informador"),
  subjectType: z.enum(["Alumno", "Docente"]),
  studentEnrollment: z.string().optional(),
  stage: z.string().min(2, "Indica la etapa educativa"),
  course: z.string().min(1, "Indica el curso"),
  subject: z.enum(["Inglés", "Alemán", "Francés", "Todas"]),
  inquiryType: z.enum(["Alumno sin libros", "No puede acceder", "Problemas de activación", "No funciona el libro", "Otro"]),
  description: z.string().min(10, "La descripción debe tener al menos 10 caracteres"),
  observations: z.string().optional(),
  priority: z.enum(["baja", "media", "alta", "urgente"] as const).optional(),
  tenantId: z.coerce.number().optional(),
}).superRefine((values, ctx) => {
  if (values.subjectType === "Alumno" && !values.studentEnrollment?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["studentEnrollment"],
      message: "La matrícula es obligatoria cuando la consulta es sobre un alumno",
    });
  }
});

type EducationTicketFormValues = z.infer<typeof educationTicketSchema>;

export default function NewEducationTicket() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();

  const { data: tenants } = useListTenants(
    { limit: 100 },
    { query: { enabled: user?.role === "superadmin" } },
  );

  const form = useForm<EducationTicketFormValues>({
    resolver: zodResolver(educationTicketSchema),
    defaultValues: {
      school: "",
      reporterEmail: "",
      subjectType: "Alumno",
      studentEnrollment: "",
      stage: "",
      course: "",
      subject: "Inglés",
      inquiryType: "Alumno sin libros",
      description: "",
      observations: "",
      priority: "media",
      tenantId: user?.role !== "superadmin" ? user?.tenantId : undefined,
    },
  });

  const createMutation = useCreateTicket({
    mutation: {
      onSuccess: (data) => {
        setLocation(`/tickets/${data.id}`);
      },
    },
  });

  function onSubmit(data: EducationTicketFormValues) {
    const title = `${data.school} - ${data.inquiryType}`;
    const description = [
      `Colegio: ${data.school}`,
      `Informador: ${data.reporterEmail}`,
      `Consulta sobre: ${data.subjectType}`,
      data.studentEnrollment ? `Matrícula: ${data.studentEnrollment}` : null,
      `Etapa: ${data.stage}`,
      `Curso: ${data.course}`,
      `Asignatura: ${data.subject}`,
      `Tipo de consulta: ${data.inquiryType}`,
      `Descripción: ${data.description}`,
      data.observations ? `Observaciones: ${data.observations}` : null,
    ].filter(Boolean).join("\n");

    createMutation.mutate({
      data: {
        title,
        description,
        priority: data.priority,
        category: "consulta_educativa",
        customFields: {
          school: data.school,
          reporterEmail: data.reporterEmail,
          subjectType: data.subjectType,
          studentEnrollment: data.studentEnrollment || null,
          stage: data.stage,
          course: data.course,
          subject: data.subject,
          inquiryType: data.inquiryType,
          observations: data.observations || null,
        },
        tenantId: user?.role === "superadmin" ? data.tenantId! : (user?.tenantId as number),
      },
    });
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => setLocation("/tickets")} className="gap-2 -ml-4 text-slate-500">
        <ArrowLeft className="h-4 w-4" />
        Volver a Tickets
      </Button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Nueva consulta educativa</h1>
        <p className="text-slate-500 mt-1">Registra una incidencia de forma guiada para que el equipo técnico pueda atenderla con rapidez.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card>
            <CardHeader>
              <CardTitle>Datos de la incidencia</CardTitle>
              <CardDescription>Formulario pensado para colegios, alumnado y profesorado dentro del soporte de Macmillan.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {user?.role === "superadmin" && (
                <FormField
                  control={form.control}
                  name="tenantId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Cliente *</FormLabel>
                      <Select onValueChange={(v) => field.onChange(parseInt(v, 10))} defaultValue={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona un cliente" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {tenants?.data.map((tenant) => (
                            <SelectItem key={tenant.id} value={tenant.id.toString()}>{tenant.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="school"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Colegio *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. Peñalar, Valdefuentes..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reporterEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correo del informador *</FormLabel>
                      <FormControl>
                        <Input placeholder="nombre.apellido o correo de contacto" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="subjectType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>La consulta es sobre *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona una opción" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Alumno">Alumno</SelectItem>
                          <SelectItem value="Docente">Docente</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="priority"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Prioridad</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona prioridad" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={TicketPriority.baja}>Baja</SelectItem>
                          <SelectItem value={TicketPriority.media}>Media</SelectItem>
                          <SelectItem value={TicketPriority.alta}>Alta</SelectItem>
                          <SelectItem value={TicketPriority.urgente}>Urgente</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <FormField
                  control={form.control}
                  name="studentEnrollment"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Matrícula alumno</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. 2153" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="stage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Etapa *</FormLabel>
                      <FormControl>
                        <Input placeholder="Primaria, Secundaria..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="course"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Curso *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ej. 2º ESO" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="subject"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Asignatura *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona asignatura" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Inglés">Inglés</SelectItem>
                          <SelectItem value="Alemán">Alemán</SelectItem>
                          <SelectItem value="Francés">Francés</SelectItem>
                          <SelectItem value="Todas">Todas</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="inquiryType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de consulta *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona el tipo" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Alumno sin libros">Alumno sin libros</SelectItem>
                          <SelectItem value="No puede acceder">No puede acceder</SelectItem>
                          <SelectItem value="Problemas de activación">Problemas de activación</SelectItem>
                          <SelectItem value="No funciona el libro">No funciona el libro</SelectItem>
                          <SelectItem value="Otro">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descripción de la consulta/incidencia *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Cuéntanos qué ocurre, en qué plataforma y cómo reproducirlo..."
                        className="min-h-[160px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="observations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observaciones</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Detalles adicionales, contexto pedagógico o notas para el equipo técnico..."
                        className="min-h-[120px] resize-y"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 px-6 py-4 rounded-b-xl border-t">
              <Button type="button" variant="outline" onClick={() => setLocation("/tickets")}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Enviar consulta
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
