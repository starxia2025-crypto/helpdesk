import { useMemo, useState } from "react";
import { useCreateTenant, useGetMe, useListTenants } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Plus, Building2, Users, Ticket, Link as LinkIcon, Trash2, Upload, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const sidebarPalette = [
  { label: "Azul Macmillan", value: "#0f172a" },
  { label: "Azul profundo", value: "#172554" },
  { label: "Verde aula", value: "#14532d" },
  { label: "Granate", value: "#7f1d1d" },
  { label: "Gris oscuro", value: "#1f2937" },
  { label: "Blanco", value: "#ffffff" },
];

const textPalette = [
  { label: "Blanco", value: "#ffffff" },
  { label: "Crema", value: "#f8fafc" },
  { label: "Azul noche", value: "#0f172a" },
  { label: "Negro", value: "#111827" },
];

const createTenantSchema = z.object({
  name: z.string().trim().min(2, "Indica el nombre del cliente"),
  contactEmail: z.union([z.literal(""), z.string().trim().email("Introduce un email valido")]).optional(),
  sidebarBackgroundColor: z.string().min(1, "Selecciona un color para el menu"),
  sidebarTextColor: z.string().min(1, "Selecciona un color de texto"),
});

type CreateTenantValues = z.infer<typeof createTenantSchema>;
type QuickLinkDraft = {
  id: string;
  label: string;
  url: string;
  icon: string;
};

function slugifyTenantName(name: string) {
  const base = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return base || `cliente-${Date.now()}`;
}

function createEmptyQuickLink(): QuickLinkDraft {
  return {
    id: crypto.randomUUID(),
    label: "",
    url: "",
    icon: "",
  };
}

export default function ClientsAdmin() {
  const { data: currentUser } = useGetMe();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [quickLinks, setQuickLinks] = useState<QuickLinkDraft[]>([]);

  const { data: tenantsData, isLoading, refetch } = useListTenants({
    page,
    limit: 20,
    search: search || undefined,
  });

  const canCreateTenant = useMemo(
    () => ["superadmin", "tecnico", "manager"].includes(currentUser?.role || ""),
    [currentUser?.role],
  );

  const form = useForm<CreateTenantValues>({
    resolver: zodResolver(createTenantSchema),
    defaultValues: {
      name: "",
      contactEmail: "",
      sidebarBackgroundColor: "#0f172a",
      sidebarTextColor: "#ffffff",
    },
  });

  const sidebarBackgroundColor = form.watch("sidebarBackgroundColor");
  const sidebarTextColor = form.watch("sidebarTextColor");

  const createTenant = useCreateTenant({
    mutation: {
      onSuccess: async () => {
        toast({
          title: "Cliente creado",
          description: "El nuevo cliente ya esta disponible para configurarlo.",
        });
        setOpen(false);
        form.reset({
          name: "",
          contactEmail: "",
          sidebarBackgroundColor: "#0f172a",
          sidebarTextColor: "#ffffff",
        });
        setQuickLinks([]);
        await refetch();
      },
      onError: (error) => {
        const message = error instanceof Error ? error.message : "No se pudo crear el cliente.";
        toast({
          title: "No se pudo crear el cliente",
          description: message,
          variant: "destructive",
        });
      },
    },
  });

  function onSubmit(values: CreateTenantValues) {
    if (!canCreateTenant) {
      toast({
        title: "Accion no permitida",
        description: "Tu perfil no tiene permisos para crear clientes.",
        variant: "destructive",
      });
      return;
    }

    try {
      const normalizedQuickLinks = quickLinks
        .filter((link) => link.label.trim() || link.url.trim() || link.icon.trim())
        .map((link, index) => {
          const label = link.label.trim();
          const url = link.url.trim();
          const icon = link.icon.trim();

          if (!label || !url) {
            throw new Error(`Completa nombre y URL en el acceso directo ${index + 1}.`);
          }

          try {
            new URL(url);
          } catch {
            throw new Error(`La URL del acceso directo ${index + 1} no es valida.`);
          }

          return { label, url, icon: icon || "LINK" };
        });

      createTenant.mutate({
        data: {
          name: values.name.trim(),
          slug: slugifyTenantName(values.name),
          ...(values.contactEmail ? { contactEmail: values.contactEmail.trim().toLowerCase() } : {}),
          sidebarBackgroundColor: values.sidebarBackgroundColor,
          sidebarTextColor: values.sidebarTextColor,
          quickLinks: normalizedQuickLinks,
        } as any,
      });
    } catch (error) {
      toast({
        title: "Accesos directos no validos",
        description: error instanceof Error ? error.message : "Revisa la configuracion de accesos directos.",
        variant: "destructive",
      });
    }
  }

  function addQuickLink() {
    setQuickLinks((current) => [...current, createEmptyQuickLink()]);
  }

  function updateQuickLink(id: string, changes: Partial<QuickLinkDraft>) {
    setQuickLinks((current) => current.map((link) => (link.id === id ? { ...link, ...changes } : link)));
  }

  function removeQuickLink(id: string) {
    setQuickLinks((current) => current.filter((link) => link.id !== id));
  }

  function onShortcutIconSelected(id: string, file?: File | null) {
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        title: "Icono no valido",
        description: "Selecciona una imagen PNG, JPG, SVG o similar.",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 1024 * 1024) {
      toast({
        title: "Icono demasiado grande",
        description: "Usa una imagen de hasta 1 MB para el acceso directo.",
        variant: "destructive",
      });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      updateQuickLink(id, { icon: typeof reader.result === "string" ? reader.result : "" });
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">Clientes y redes escolares</h1>
          <p className="mt-1 text-slate-500">Gestiona grupos educativos, colegios asociados y su operacion de soporte.</p>
        </div>
        {canCreateTenant && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="shrink-0 gap-2">
                <Plus className="h-4 w-4" />
                Anadir cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Alta y configuracion de cliente</DialogTitle>
                <DialogDescription>Crea un nuevo grupo educativo, elige los colores del menu lateral y define accesos directos para su equipo.</DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nombre</FormLabel>
                        <FormControl><Input placeholder="Ej. Grupo Escolar Norte" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email de contacto</FormLabel>
                        <FormControl><Input placeholder="soporte@cliente.es" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid gap-4 md:grid-cols-2">
                    <FormField
                      control={form.control}
                      name="sidebarBackgroundColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Fondo del menu lateral</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Selecciona un color" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {sidebarPalette.map((color) => (
                                <SelectItem key={color.value} value={color.value}>{color.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="sidebarTextColor"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Color del texto del menu</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl><SelectTrigger><SelectValue placeholder="Selecciona un color" /></SelectTrigger></FormControl>
                            <SelectContent>
                              {textPalette.map((color) => (
                                <SelectItem key={color.value} value={color.value}>{color.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="rounded-2xl border p-4">
                    <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <LinkIcon className="h-4 w-4" />
                      Vista previa del menu lateral
                    </div>
                    <div className="rounded-xl p-4" style={{ backgroundColor: sidebarBackgroundColor, color: sidebarTextColor }}>
                      <div className="mb-3 text-sm font-semibold opacity-80">Centro de ayuda</div>
                      <div className="space-y-2 text-sm">
                        <div className="rounded-md px-3 py-2" style={{ backgroundColor: `${sidebarTextColor}22` }}>Tickets de consulta</div>
                        <div className="rounded-md px-3 py-2">Miembros del equipo</div>
                        <div className="mt-4 border-t border-white/20 pt-3 text-base font-bold">{form.watch("name") || "Nombre del cliente"}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Accesos directos</p>
                        <p className="text-xs text-slate-500">Anade enlaces a plataformas del cliente con su icono y URL.</p>
                      </div>
                      <Button type="button" variant="outline" className="gap-2" onClick={addQuickLink}>
                        <Plus className="h-4 w-4" />
                        Anadir acceso
                      </Button>
                    </div>

                    {quickLinks.length === 0 ? (
                      <div className="rounded-xl border border-dashed px-4 py-6 text-sm text-slate-500">
                        Todavia no hay accesos directos. Pulsa en "Anadir acceso" para crear uno.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {quickLinks.map((link, index) => (
                          <div key={link.id} className="rounded-xl border p-4">
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-slate-900">Acceso directo {index + 1}</p>
                              <Button type="button" variant="ghost" size="icon" onClick={() => removeQuickLink(link.id)}>
                                <Trash2 className="h-4 w-4 text-slate-500" />
                              </Button>
                            </div>
                            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr_auto]">
                              <Input
                                placeholder="Ej. MEE Platform"
                                value={link.label}
                                onChange={(event) => updateQuickLink(link.id, { label: event.target.value })}
                              />
                              <div className="relative">
                                <ExternalLink className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <Input
                                  className="pl-9"
                                  placeholder="https://plataforma.macmillan.es"
                                  value={link.url}
                                  onChange={(event) => updateQuickLink(link.id, { url: event.target.value })}
                                />
                              </div>
                              <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50">
                                <Upload className="h-4 w-4" />
                                <span>Subir icono</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="sr-only"
                                  onChange={(event) => onShortcutIconSelected(link.id, event.target.files?.[0])}
                                />
                              </label>
                            </div>
                            <div className="mt-3 flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2">
                              <div className="flex h-10 w-10 items-center justify-center rounded-lg border bg-white">
                                {link.icon ? (
                                  link.icon.startsWith("data:") || link.icon.startsWith("http") ? (
                                    <img src={link.icon} alt={link.label || "Icono"} className="h-6 w-6 object-contain" />
                                  ) : (
                                    <span className="text-lg">{link.icon}</span>
                                  )
                                ) : (
                                  <LinkIcon className="h-5 w-5 text-slate-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-slate-900">{link.label || "Nombre del acceso"}</p>
                                <p className="truncate text-xs text-slate-500">{link.url || "Sin URL configurada"}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                    <Button type="submit" disabled={createTenant.isPending}>
                      {createTenant.isPending ? "Creando..." : "Crear cliente"}
                    </Button>
                  </DialogFooter>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Card className="flex gap-4 p-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder="Buscar clientes por nombre, dominio o correo..."
            className="w-full max-w-md pl-9"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </Card>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-slate-900">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
            <TableRow>
              <TableHead className="font-semibold">Nombre del Cliente</TableHead>
              <TableHead className="font-semibold">Estado</TableHead>
              <TableHead className="text-center font-semibold">Usuarios</TableHead>
              <TableHead className="text-center font-semibold">Tickets Abiertos</TableHead>
              <TableHead className="text-center font-semibold">Total Tickets</TableHead>
              <TableHead className="text-right font-semibold">Creado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><div className="h-5 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></TableCell>
                  <TableCell><div className="h-6 w-16 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" /></TableCell>
                  <TableCell><div className="mx-auto h-5 w-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></TableCell>
                  <TableCell><div className="mx-auto h-5 w-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></TableCell>
                  <TableCell><div className="mx-auto h-5 w-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></TableCell>
                  <TableCell><div className="ml-auto h-5 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></TableCell>
                </TableRow>
              ))
            ) : tenantsData?.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-48 text-center text-slate-500">
                  No se encontraron clientes.
                </TableCell>
              </TableRow>
            ) : (
              tenantsData?.data.map((tenant) => (
                <TableRow key={tenant.id} className="group">
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{tenant.name}</div>
                        <div className="text-xs text-slate-500">{tenant.slug}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={tenant.active ? "default" : "secondary"} className={tenant.active ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-100" : ""}>
                      {tenant.active ? "Activo" : "Inactivo"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1.5 text-slate-600 dark:text-slate-300">
                      <Users className="h-4 w-4 text-slate-400" />
                      {tenant.totalUsers}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1.5 font-medium text-amber-600 dark:text-amber-500">
                      <Ticket className="h-4 w-4" />
                      {tenant.openTickets}
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-slate-500">{tenant.totalTickets}</TableCell>
                  <TableCell className="text-right text-sm text-slate-500">
                    {format(new Date(tenant.createdAt), "d MMM yyyy", { locale: es })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {tenantsData && tenantsData.totalPages > 1 && (
          <div className="flex items-center justify-between border-t bg-slate-50/50 p-4 dark:bg-slate-900/50">
            <span className="text-sm text-slate-500">
              Mostrando {(page - 1) * 20 + 1}-{Math.min(page * 20, tenantsData.total)} de {tenantsData.total}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page === tenantsData.totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
