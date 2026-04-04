import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  ApiError,
  customFetch,
  useCreateTicket,
  useGetTenant,
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
import { toast } from "@/hooks/use-toast";

const educationTicketSchema = z.object({
  studentEmail: z.string().trim().email("Indica el correo del alumno"),
  schoolId: z.coerce.number().optional(),
  reporterEmail: z.union([z.literal(""), z.string().trim().email("Indica un correo valido")]).optional(),
  subjectType: z.enum(["Alumno", "Docente"]).optional(),
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
  if (!values.subjectType) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["subjectType"],
      message: "Selecciona si la consulta es sobre un alumno o sobre tu cuenta",
    });
  }
  if (!values.schoolId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["schoolId"],
      message: "Selecciona el colegio",
    });
  }
  if (values.subjectType === "Alumno" && !values.studentEnrollment?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["studentEnrollment"],
      message: "La matrícula es obligatoria cuando la consulta es sobre un alumno",
    });
  }
});

type EducationTicketFormValues = z.infer<typeof educationTicketSchema>;

type MochilaLookupResult = {
  studentEmail: string;
  studentName: string | null;
  studentSurname: string | null;
  studentUser: string | null;
  studentPassword: string | null;
  token: string | null;
  schools: string[];
  records: Array<{
    schoolName: string | null;
    studentName: string | null;
    studentSurname: string | null;
    studentEmail: string | null;
    studentUser: string | null;
    studentPassword: string | null;
    token: string | null;
    description: string | null;
    ean: string | null;
    idConsignaOrder: number;
    esGoogle: boolean | null;
  }>;
};

type ReturnCandidate = {
  key: string;
  description: string;
  isbn: string;
  orderId: string;
  google: string;
  bookCode: string;
};

const FORGOT_PASSWORD_URL = "https://identity.macmillaneducationeverywhere.com/forgot-password?returnUrl=%2Fconnect%2Fauthorize%2Fcallback%3Fclient_id%3D21%26redirect_uri%3Dhttps%253A%252F%252Fliveapi.macmillaneducationeverywhere.com%252Fapi%252Foidcintegration%252Fcode%26response_type%3Dcode%26scope%3Dopenid%2520profile%2520offline_access%26code_challenge_method%3DS256%26code_challenge%3Dno-81rQrMJwoLhRrryqaEx7ZBNWokrmhhAD98uIz5fo%26state%3Daf32b1c7-a894-47d9-842f-73d9fff373f7";
const BLINK_PASSWORD_URL = "https://www.blinklearning.com/v/1774948299/themes/tmpux/launch.php";

function inferMochilaDescription(record: MochilaLookupResult["records"][number]) {
  if (record.description?.trim()) return record.description.trim();
  return (record.token?.trim().length ?? 0) > 15 ? "Inglés" : "Francés/Alemán";
}

export default function NewEducationTicket() {
  const [, setLocation] = useLocation();
  const { data: user } = useGetMe();
  const [mochilaLookup, setMochilaLookup] = useState<MochilaLookupResult | null>(null);
  const [mochilaLookupError, setMochilaLookupError] = useState<string | null>(null);
  const [isLookingUpMochila, setIsLookingUpMochila] = useState(false);
  const [mochilaActivationSuggested, setMochilaActivationSuggested] = useState(false);
  const [mochilaLookupMode, setMochilaLookupMode] = useState<"email" | "order">("email");
  const [mochilaOrderId, setMochilaOrderId] = useState("");
  const [showTeacherRegistrationRequest, setShowTeacherRegistrationRequest] = useState(false);
  const [teacherRegistrationNotes, setTeacherRegistrationNotes] = useState("");
  const [selectedReturnItemKeys, setSelectedReturnItemKeys] = useState<string[]>([]);

  const { data: tenants } = useListTenants(
    { limit: 100 },
    { query: { enabled: user?.role === "superadmin" || user?.role === "tecnico" } },
  );
  const { data: currentTenant } = useGetTenant(user?.tenantId ?? 0, {
    query: { enabled: !!user?.tenantId && user?.role !== "superadmin" && user?.role !== "tecnico" },
  });

  const availableTenants = user?.role === "superadmin" || user?.role === "tecnico"
    ? tenants?.data ?? []
    : currentTenant ? [currentTenant] : [];

  const form = useForm<EducationTicketFormValues>({
    resolver: zodResolver(educationTicketSchema),
    defaultValues: {
      studentEmail: "",
      schoolId: user?.schoolId ?? undefined,
      reporterEmail: "",
      subjectType: undefined,
      studentEnrollment: "",
      stage: "",
      course: "",
      subject: "Inglés",
      inquiryType: "Alumno sin libros",
      description: "",
      observations: "",
      priority: "media",
      tenantId: user?.tenantId ?? undefined,
    },
  });

  const selectedTenantId = form.watch("tenantId");
  const selectedSchoolId = form.watch("schoolId");
  const studentEmail = form.watch("studentEmail");
  const subjectType = form.watch("subjectType");
  const hasSelectedSubjectType = subjectType === "Alumno" || subjectType === "Docente";
  const usesSchoolReporterFlow = user?.role === "usuario_cliente" || user?.role === "visor_cliente";
  const useSessionSchool = user?.scopeType === "school" || usesSchoolReporterFlow;
  const hideReporterEmailField = usesSchoolReporterFlow;
  const selectedTenant =
    availableTenants.find((tenant) => tenant.id === selectedTenantId) ??
    availableTenants.find((tenant) => tenant.id === user?.tenantId) ??
    currentTenant;
  const tenantPanelBackground = (user as any)?.tenantSidebarBackgroundColor || selectedTenant?.sidebarBackgroundColor || "#0f172a";
  const tenantPanelText = (user as any)?.tenantSidebarTextColor || selectedTenant?.sidebarTextColor || "#ffffff";
  const tenantPanelMuted = tenantPanelText === "#ffffff" || tenantPanelText === "#f8fafc" ? "rgba(255,255,255,0.78)" : "rgba(15,23,42,0.72)";
  const tenantPanelBorder = tenantPanelText === "#ffffff" || tenantPanelText === "#f8fafc" ? "rgba(255,255,255,0.18)" : "rgba(15,23,42,0.1)";
  const mochilasPanelBackground = tenantPanelBackground;
  const mochilasPanelBorder = tenantPanelBorder;
  const mochilasEnabled = Boolean(selectedTenant?.hasMochilasAccess ?? (user as any)?.tenantHasMochilasAccess);
  const orderLookupEnabled = Boolean(selectedTenant?.hasOrderLookup ?? (user as any)?.tenantHasOrderLookup);
  const returnsEnabled = Boolean(selectedTenant?.hasReturnsAccess ?? (user as any)?.tenantHasReturnsAccess);
  const shouldShowMochilasLookup = hasSelectedSubjectType && subjectType === "Alumno" && (mochilasEnabled || orderLookupEnabled || useSessionSchool);
  const tenantSchools = (selectedTenant?.schools ?? []).filter((school) => school.active);
  const selectedSchool = tenantSchools.find((school) => school.id === selectedSchoolId);
  const shouldHideExtendedFields =
    !hasSelectedSubjectType || subjectType === "Docente" || (subjectType === "Alumno" && shouldShowMochilasLookup && !mochilaLookup);
  const summarizedMochilaRecords = useMemo(() => {
    if (!mochilaLookup) return [];

    return mochilaLookup.records.map((record, index) => ({
      key: `${record.idConsignaOrder}-${record.ean?.trim() || "-"}-${record.token?.trim() || "-"}-${index}`,
      description: inferMochilaDescription(record),
      isbn: record.ean?.trim() || "-",
      orderId: String(record.idConsignaOrder),
      google: record.esGoogle === null ? "-" : record.esGoogle ? "Si" : "No",
      bookCode: record.token?.trim() || "-",
    }));
  }, [mochilaLookup]);
  const selectedReturnItems = useMemo(
    () => summarizedMochilaRecords.filter((record) => selectedReturnItemKeys.includes(record.key)),
    [selectedReturnItemKeys, summarizedMochilaRecords]
  );

  useEffect(() => {
    if (!user) return;

    if (user.tenantId) {
      form.setValue("tenantId", user.tenantId);
    }

    if (useSessionSchool && user.schoolId) {
      form.setValue("schoolId", user.schoolId);
    }

    if (hideReporterEmailField && user.email) {
      form.setValue("reporterEmail", user.email);
    }

    if (subjectType === "Docente" && user.email) {
      form.setValue("studentEmail", user.email);
    }
  }, [form, hideReporterEmailField, subjectType, useSessionSchool, user]);

  useEffect(() => {
    if (subjectType !== "Alumno") {
      setMochilaLookupMode("email");
      setMochilaOrderId("");
    }
  }, [subjectType]);

  useEffect(() => {
    if (subjectType !== "Alumno") return;
    if (!(mochilasEnabled || useSessionSchool) && orderLookupEnabled) {
      setMochilaLookupMode("order");
    }
  }, [mochilasEnabled, orderLookupEnabled, subjectType, useSessionSchool]);

  const createMutation = useCreateTicket({
    mutation: {
      onSuccess: (data) => {
        setLocation(`/tickets/${data.id}`);
      },
    },
  });

  const quickAccessIssueMutation = useCreateTicket({
    mutation: {
      onSuccess: () => {
        toast({
          title: "Consulta creada",
          description: "Hemos registrado la incidencia de acceso y te llevamos al listado de tickets.",
        });
        setLocation("/tickets");
      },
      onError: (error) => {
        toast({
          title: "No se pudo crear la consulta",
          description: error instanceof Error ? error.message : "Intentalo de nuevo.",
          variant: "destructive",
        });
      },
    },
  });

  async function lookupStudentInMochilas() {
    const normalizedEmail = studentEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      form.setError("studentEmail", {
        type: "manual",
        message: "Indica el correo del alumno",
      });
      return;
    }

    setIsLookingUpMochila(true);
    setMochilaLookup(null);
    setMochilaLookupError(null);
    setMochilaActivationSuggested(false);
    setSelectedReturnItemKeys([]);

    try {
      const params = new URLSearchParams({ email: normalizedEmail });
      const effectiveTenantId = selectedTenantId || user?.tenantId;
      if (effectiveTenantId) {
        params.set("tenantId", String(effectiveTenantId));
      }

      const result = await customFetch<MochilaLookupResult>(`/api/tickets/mochilas/student?${params.toString()}`);
      setMochilaLookup(result);
    } catch (error) {
      const message =
        error instanceof ApiError && error.status === 404
          ? "No existe informacion del alumno en Mochilas o su compra aun no ha sido activada."
          : error instanceof Error
            ? error.message
            : "No se pudo consultar la informacion de Mochilas.";

      if (error instanceof ApiError && error.status === 404) {
        setMochilaActivationSuggested(true);
      }

      setMochilaLookupError(message);
      toast({
        title: "No se pudo consultar Mochilas",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLookingUpMochila(false);
    }
  }

  async function lookupStudentByOrderInMochilas() {
    const normalizedOrderId = mochilaOrderId.trim();
    if (!normalizedOrderId || Number.isNaN(Number(normalizedOrderId))) {
      setMochilaLookupError("Indica un numero de pedido valido.");
      return;
    }

    setIsLookingUpMochila(true);
    setMochilaLookup(null);
    setMochilaLookupError(null);
    setMochilaActivationSuggested(false);
    setSelectedReturnItemKeys([]);

    try {
      const params = new URLSearchParams({ orderId: normalizedOrderId });
      const effectiveTenantId = selectedTenantId || user?.tenantId;
      if (effectiveTenantId) {
        params.set("tenantId", String(effectiveTenantId));
      }

      const result = await customFetch<MochilaLookupResult>(`/api/tickets/mochilas/order?${params.toString()}`);
      setMochilaLookup(result);
      if (result.studentEmail) {
        form.setValue("studentEmail", result.studentEmail);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "No se pudo consultar la informacion del pedido en Mochilas.";

      setMochilaLookupError(message);
      toast({
        title: "No se pudo consultar el pedido",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsLookingUpMochila(false);
    }
  }

  async function handleForgotStudentPassword() {
    const email = mochilaLookup?.studentEmail?.trim() || studentEmail.trim();
    if (!email) {
      form.setError("studentEmail", {
        type: "manual",
        message: subjectType === "Docente" ? "Indica primero el email de acceso del docente" : "Indica primero el correo del alumno",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(email);
      toast({
        title: "Correo del alumno copiado",
        description: "Se ha copiado el email del afectado para que puedas pegarlo en la pantalla de recuperación.",
      });
    } catch {
      toast({
        title: "Abriendo recuperación de contraseña",
        description: "Si no se copia automáticamente, pega manualmente el correo del alumno en la página externa.",
      });
    }

    window.open(FORGOT_PASSWORD_URL, "_blank", "noopener,noreferrer");
  }

  async function openRecoveryUrl(url: string, email: string, successTitle: string, successDescription: string) {
    if (!email) {
      form.setError("studentEmail", {
        type: "manual",
        message: subjectType === "Docente" ? "Indica primero el email de acceso del docente" : "Indica primero el correo del alumno",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(email);
      toast({
        title: successTitle,
        description: successDescription,
      });
    } catch {
      toast({
        title: "Abriendo recuperación de contraseña",
        description: "Si no se copia automáticamente, pégalo manualmente en la página externa.",
      });
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  async function handleForgotTeacherEnglishPassword() {
    await openRecoveryUrl(
      FORGOT_PASSWORD_URL,
      studentEmail.trim(),
      "Correo del docente copiado",
      "Se ha copiado el email de acceso del docente para que puedas pegarlo en la pantalla de recuperación."
    );
  }

  async function handleForgotTeacherBlinkPassword() {
    await openRecoveryUrl(
      BLINK_PASSWORD_URL,
      studentEmail.trim(),
      "Correo del docente copiado",
      "Se ha copiado el email de acceso del docente para que puedas pegarlo en BlinkLearning."
    );
  }

  function createTeacherRegistrationTicket() {
    const teacherEmail = (user?.email || studentEmail).trim().toLowerCase();
    if (!teacherEmail) {
      toast({
        title: "No se pudo crear la solicitud",
        description: "No hemos podido identificar el correo del docente que solicita el alta.",
        variant: "destructive",
      });
      return;
    }

    const schoolName = selectedSchool?.name || user?.schoolName || "Colegio";
    const tenantId =
      user?.scopeType === "global"
        ? (selectedTenantId as number)
        : (user?.tenantId as number);

    const schoolId =
      useSessionSchool
        ? (user?.schoolId as number)
        : (selectedSchoolId as number);

    quickAccessIssueMutation.mutate({
      data: {
        title: `${schoolName} - Solicitud de alta docente`,
        description: [
          `Colegio: ${schoolName}`,
          `Docente: ${teacherEmail}`,
          `Informador: ${user?.email ?? "-"}`,
          "Motivo: El docente solicita alta o activacion inicial de acceso.",
          teacherRegistrationNotes.trim() ? `Datos facilitados: ${teacherRegistrationNotes.trim()}` : null,
        ].filter(Boolean).join("\n"),
        priority: TicketPriority.media,
        category: "alta_docente",
        customFields: {
          school: schoolName,
          teacherEmail,
          affectedEmail: teacherEmail,
          reporterEmail: user?.email ?? null,
          subjectType: "Docente",
          inquiryType: "Solicitud de alta",
          teacherRegistrationRequested: true,
          teacherRegistrationNotes: teacherRegistrationNotes.trim() || null,
        },
        tenantId,
        schoolId,
      },
    });
  }

  function createAccessIssueTicket() {
    const normalizedStudentEmail = (mochilaLookup?.studentEmail || form.getValues("studentEmail")).trim().toLowerCase();
    if (!normalizedStudentEmail) {
      form.setError("studentEmail", {
        type: "manual",
        message: subjectType === "Docente" ? "Indica primero el email de acceso del docente" : "Indica primero el correo del alumno",
      });
      return;
    }

    const schoolName = selectedSchool?.name || user?.schoolName || "Colegio";
    const tenantId =
      user?.scopeType === "global"
        ? (selectedTenantId as number)
        : (user?.tenantId as number);

    const schoolId =
      useSessionSchool
        ? (user?.schoolId as number)
        : (selectedSchoolId as number);

    quickAccessIssueMutation.mutate({
      data: {
        title: `${schoolName} - ${subjectType === "Docente" ? "El docente" : "El alumno"} aun continua sin poder acceder`,
        description: [
          `Colegio: ${schoolName}`,
          `${subjectType}: ${normalizedStudentEmail}`,
          `Informador: ${user?.email ?? "-"}`,
          `Motivo: Tras la revision inicial y la recuperacion de contrasena, el ${subjectType === "Docente" ? "docente" : "alumno"} aun no puede acceder.`,
          "Accion solicitada: Revision tecnica prioritaria del acceso en Mochilas.",
        ].join("\n"),
        priority: TicketPriority.alta,
        category: "seguimiento_acceso_mochilas",
        customFields: {
          school: schoolName,
          studentEmail: subjectType === "Alumno" ? normalizedStudentEmail : null,
          teacherEmail: subjectType === "Docente" ? normalizedStudentEmail : null,
          affectedEmail: normalizedStudentEmail,
          reporterEmail: user?.email ?? null,
          subjectType,
          inquiryType: "No puede acceder",
          mochilaLookup,
          accessFollowUpRequested: true,
        },
        tenantId,
        schoolId,
      },
    });
  }

  function createUrgentActivationTicket() {
    const normalizedStudentEmail = form.getValues("studentEmail").trim().toLowerCase();
    if (!normalizedStudentEmail) {
      form.setError("studentEmail", {
        type: "manual",
        message: "Indica el correo del alumno",
      });
      return;
    }

    const schoolName = selectedSchool?.name || user?.schoolName || "Colegio";
    const tenantId =
      user?.scopeType === "global"
        ? (selectedTenantId as number)
        : (user?.tenantId as number);

    const schoolId =
      useSessionSchool
        ? (user?.schoolId as number)
        : (selectedSchoolId as number);

    createMutation.mutate({
      data: {
        title: `${schoolName} - Solicitud de activacion urgente`,
        description: [
          `Colegio: ${schoolName}`,
          `Alumno: ${normalizedStudentEmail}`,
          `Informador: ${user?.email ?? "-"}`,
          "Motivo: El alumno no aparece aun en Mochilas o su compra todavia no ha sido activada.",
          "Accion solicitada: Revision y activacion urgente del acceso.",
        ].join("\n"),
        priority: TicketPriority.urgente,
        category: "activacion_mochilas",
        customFields: {
          school: schoolName,
          studentEmail: normalizedStudentEmail,
          reporterEmail: user?.email ?? null,
          inquiryType: "Problemas de activación",
          mochilaLookup: null,
          activationRequested: true,
        },
        tenantId,
        schoolId,
      },
    });
  }

  function toggleReturnItemSelection(itemKey: string) {
    setSelectedReturnItemKeys((current) =>
      current.includes(itemKey) ? current.filter((key) => key !== itemKey) : [...current, itemKey]
    );
  }

  function onSubmit(data: EducationTicketFormValues) {
    if (subjectType === "Alumno" && shouldShowMochilasLookup) {
      const normalizedStudentEmail = data.studentEmail.trim().toLowerCase();
      if (!mochilaLookup || mochilaLookup.studentEmail !== normalizedStudentEmail) {
        toast({
          title: "Consulta Mochilas pendiente",
          description: "Busca primero el alumno por su correo para cargar los datos de Mochilas antes de crear el ticket.",
          variant: "destructive",
        });
        return;
      }
    }

    const schoolName = selectedSchool?.name || user?.schoolName || "Colegio";
    const tenantId =
      user?.scopeType === "global"
        ? data.tenantId!
        : (user?.tenantId as number);

    const schoolId =
      useSessionSchool
        ? (user?.schoolId as number)
        : (data.schoolId as number);

    const reporterEmail = hideReporterEmailField
      ? (user?.email ?? null)
      : (data.reporterEmail?.trim().toLowerCase() || null);

    const title = `${schoolName} - ${data.inquiryType}`;
    const description = [
      `Colegio: ${schoolName}`,
      `${data.subjectType}: ${data.studentEmail}`,
      reporterEmail ? `Informador: ${reporterEmail}` : null,
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
          school: schoolName,
          studentEmail: data.subjectType === "Alumno" ? data.studentEmail.trim().toLowerCase() : null,
          teacherEmail: data.subjectType === "Docente" ? data.studentEmail.trim().toLowerCase() : null,
          affectedEmail: data.studentEmail.trim().toLowerCase(),
          reporterEmail,
          subjectType: data.subjectType,
          studentEnrollment: data.studentEnrollment || null,
          stage: data.stage,
          course: data.course,
          subject: data.subject,
          inquiryType: data.inquiryType,
          observations: data.observations || null,
          mochilaLookup,
          returnItems: subjectType === "Alumno" && selectedReturnItems.length > 0 ? selectedReturnItems : null,
          returnRequested: subjectType === "Alumno" && selectedReturnItems.length > 0,
        },
        tenantId,
        schoolId,
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
              {(user?.role === "superadmin" || user?.role === "tecnico") && (
                <FormField
                  control={form.control}
                  name="tenantId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Red educativa *</FormLabel>
                      <Select onValueChange={(v) => {
                        field.onChange(parseInt(v, 10));
                        form.setValue("schoolId", undefined);
                        setMochilaLookup(null);
                        setMochilaLookupError(null);
                      }} defaultValue={field.value?.toString()}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona una red educativa" />
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

              {!useSessionSchool && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={form.control}
                    name="schoolId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Colegio *</FormLabel>
                        <Select
                          onValueChange={(v) => field.onChange(parseInt(v, 10))}
                          value={field.value?.toString()}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona un colegio" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {tenantSchools.map((school) => (
                              <SelectItem key={school.id} value={school.id.toString()}>{school.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  {!hideReporterEmailField && (
                    <FormField
                      control={form.control}
                      name="reporterEmail"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Correo de contacto</FormLabel>
                          <FormControl>
                            <Input placeholder="Opcional: correo del docente o del informador" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}

              {useSessionSchool && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Colegio activo</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{user?.schoolName || user?.tenantName || "Colegio asignado"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cuenta que registra la consulta</p>
                      <p className="mt-1 text-sm font-medium text-slate-900">{user?.email || "-"}</p>
                    </div>
                  </div>
                </div>
              )}

              <FormField
                control={form.control}
                name="subjectType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>La consulta es sobre *</FormLabel>
                    <Select
                      onValueChange={(value) => {
                            field.onChange(value);
                            form.setValue("studentEmail", value === "Docente" ? (user?.email ?? "") : "");
                            setMochilaLookup(null);
                            setMochilaLookupError(null);
                            setMochilaActivationSuggested(false);
                            setMochilaLookupMode("email");
                            setMochilaOrderId("");
                            setShowTeacherRegistrationRequest(false);
                          }}
                      value={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona una opción" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Alumno">Alumno</SelectItem>
                        <SelectItem value="Docente">Sobre mi cuenta</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {subjectType === "Docente" && (
                <div
                  className="space-y-4 rounded-2xl border p-4"
                  style={{ backgroundColor: tenantPanelBackground, borderColor: tenantPanelBorder, color: tenantPanelText }}
                >
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: tenantPanelText }}>Recuperación de acceso docente</h3>
                    <p className="mt-1 text-xs" style={{ color: tenantPanelMuted }}>
                      La consulta es sobre mi cuenta. Usa los accesos directos para recuperar el acceso o registrar una incidencia.
                    </p>
                  </div>

                  <div className="rounded-xl border px-4 py-3" style={{ borderColor: tenantPanelBorder, backgroundColor: "rgba(255,255,255,0.12)" }}>
                    <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: tenantPanelMuted }}>Sobre mi cuenta</p>
                    <p className="mt-1 text-sm font-medium" style={{ color: tenantPanelText }}>{user?.email || "-"}</p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                    <Button type="button" onClick={handleForgotTeacherEnglishPassword}>
                      He olvidado mi contraseña de Inglés
                    </Button>
                    <Button type="button" onClick={handleForgotTeacherBlinkPassword}>
                      He olvidado mi contraseña de Francés/Alemán
                    </Button>
                    <Button
                      type="button"
                      onClick={createAccessIssueTicket}
                      disabled={quickAccessIssueMutation.isPending}
                    >
                      {quickAccessIssueMutation.isPending ? "Creando consulta..." : "Aún continúo sin poder acceder"}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setShowTeacherRegistrationRequest((current) => !current)}
                    >
                      Solicitar alta
                    </Button>
                  </div>

                  {showTeacherRegistrationRequest && (
                    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Solicitud de alta docente</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Añade algún dato útil para el equipo técnico y registraremos la solicitud directamente.
                        </p>
                      </div>
                      <Textarea
                        value={teacherRegistrationNotes}
                        onChange={(event) => setTeacherRegistrationNotes(event.target.value)}
                        placeholder="Ejemplo: etapa, asignatura, plataforma afectada, si es alta nueva o reactivación..."
                        className="min-h-[120px] resize-y"
                      />
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          onClick={createTeacherRegistrationTicket}
                          disabled={quickAccessIssueMutation.isPending}
                        >
                          {quickAccessIssueMutation.isPending ? "Creando solicitud..." : "Crear solicitud de alta"}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {shouldShowMochilasLookup && (
                <div
                  className="space-y-4 rounded-2xl border p-4"
                  style={{ backgroundColor: mochilasPanelBackground, borderColor: mochilasPanelBorder }}
                >
                  <div>
                    <h3 className="text-sm font-semibold" style={{ color: tenantPanelText }}>Busqueda previa en Mochilas</h3>
                    <p className="mt-1 text-xs" style={{ color: tenantPanelMuted }}>
                      Usa el correo del alumno o el numero de pedido para consultar su informacion de acceso en Mochilas.
                    </p>
                  </div>

                  {(mochilasEnabled || useSessionSchool) && (
                    <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                      <FormField
                        control={form.control}
                        name="studentEmail"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel style={{ color: tenantPanelText }}>Email del alumno *</FormLabel>
                            <FormControl>
                              <Input placeholder="alumno@centro.es" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="flex items-end">
                        <Button
                          type="button"
                          className="w-full md:w-auto"
                          onClick={lookupStudentInMochilas}
                          disabled={isLookingUpMochila || !(selectedTenantId || user?.tenantId)}
                        >
                          {isLookingUpMochila ? "Buscando..." : "Buscar en Mochilas"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {orderLookupEnabled && (
                    <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                      <div className="space-y-2">
                        <label className="text-sm font-medium leading-none" style={{ color: tenantPanelText }}>
                          Pedido *
                        </label>
                        <Input
                          placeholder="Ej. 2068466760"
                          value={mochilaOrderId}
                          onChange={(event) => setMochilaOrderId(event.target.value)}
                        />
                      </div>

                      <div className="flex items-end">
                        <Button
                          type="button"
                          className="w-full md:w-auto"
                          onClick={lookupStudentByOrderInMochilas}
                          disabled={isLookingUpMochila || !(selectedTenantId || user?.tenantId)}
                        >
                          {isLookingUpMochila ? "Buscando..." : "Buscar por pedido"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {mochilaLookupError && (
                    <div className="space-y-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                      <p>{mochilaLookupError}</p>
                      {mochilaActivationSuggested && (
                        <Button type="button" onClick={createUrgentActivationTicket} disabled={createMutation.isPending}>
                          {createMutation.isPending ? "Creando solicitud..." : "Solicitar activacion urgente"}
                        </Button>
                      )}
                    </div>
                  )}

                  {mochilaLookup && (
                    <div className="space-y-4 rounded-xl border bg-white p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Alumno</p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {[mochilaLookup.studentName, mochilaLookup.studentSurname].filter(Boolean).join(" ") || "Sin nombre"}
                          </p>
                          <p className="text-xs text-slate-500">{mochilaLookup.studentEmail}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credenciales</p>
                          <p className="mt-1 text-sm text-slate-900">Usuario: {mochilaLookup.studentUser || "-"}</p>
                          <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-slate-900">Contraseña: {mochilaLookup.studentPassword || "-"}</p>
                            <div className="flex flex-col gap-2 sm:items-end">
                              <Button type="button" size="sm" onClick={handleForgotStudentPassword}>
                                He olvidado mi contraseña
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                onClick={createAccessIssueTicket}
                                disabled={quickAccessIssueMutation.isPending}
                              >
                                {quickAccessIssueMutation.isPending ? "Creando consulta..." : "Aún continúas sin poder acceder"}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Colegios detectados</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {mochilaLookup.schools.map((school) => (
                            <span key={school} className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                              {school}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-xl border border-slate-200">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                              <th className="px-3 py-2 font-semibold">Descripcion</th>
                              <th className="px-3 py-2 font-semibold">ISBN</th>
                              <th className="px-3 py-2 font-semibold">Pedido</th>
                              <th className="px-3 py-2 font-semibold">Google</th>
                              <th className="px-3 py-2 font-semibold">Código de Libro</th>
                              {returnsEnabled && <th className="px-3 py-2 font-semibold text-right">Devolución</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {summarizedMochilaRecords.map((record) => (
                              <tr key={record.key} className="border-t border-slate-200 align-top">
                                <td className="px-3 py-2 text-slate-900">{record.description}</td>
                                <td className="px-3 py-2 text-slate-900">{record.isbn}</td>
                                <td className="px-3 py-2 text-slate-900">{record.orderId}</td>
                                <td className="px-3 py-2 text-slate-900">{record.google}</td>
                                <td className="px-3 py-2 break-all text-slate-900">{record.bookCode}</td>
                                {returnsEnabled && (
                                  <td className="px-3 py-2 text-right">
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant={selectedReturnItemKeys.includes(record.key) ? "default" : "outline"}
                                      onClick={() => toggleReturnItemSelection(record.key)}
                                    >
                                      {selectedReturnItemKeys.includes(record.key) ? "Devolucion anadida" : "Devolucion"}
                                    </Button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {returnsEnabled && selectedReturnItems.length > 0 && (
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
                          Se guardarán {selectedReturnItems.length} línea(s) marcadas para devolución al crear el ticket.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {subjectType === "Alumno" && !shouldShowMochilasLookup && (
                <FormField
                  control={form.control}
                  name="studentEmail"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email del alumno *</FormLabel>
                      <FormControl>
                        <Input placeholder="alumno@centro.es" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {!shouldHideExtendedFields && (
                <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="subjectType"
                  render={({ field }) => (
                    <FormItem className="hidden">
                      <FormLabel>La consulta es sobre *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona una opción" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Alumno">Alumno</SelectItem>
                          <SelectItem value="Docente">Sobre mi cuenta</SelectItem>
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
                </>
              )}
            </CardContent>
            <CardFooter className="bg-slate-50 dark:bg-slate-900/50 flex justify-end gap-3 px-6 py-4 rounded-b-xl border-t">
              <Button type="button" variant="outline" onClick={() => setLocation("/tickets")}>
                Cancelar
              </Button>
              {!shouldHideExtendedFields && (
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar consulta
                </Button>
              )}
            </CardFooter>
          </Card>
        </form>
      </Form>
    </div>
  );
}
