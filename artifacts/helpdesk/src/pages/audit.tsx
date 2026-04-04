import { useState } from "react";
import { useListAuditLogs, useGetMe } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Activity, ShieldAlert } from "lucide-react";

export default function Audit() {
  const { data: user } = useGetMe();
  const [page, setPage] = useState(1);

  const { data: auditData, isLoading, isError, error } = useListAuditLogs({
    page,
    limit: 50,
    tenantId: user?.role === "superadmin" ? undefined : user?.tenantId,
  });

  const logs = auditData?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            <ShieldAlert className="h-6 w-6 text-primary" />
            Registros de Auditoría
          </h1>
          <p className="mt-1 text-slate-500">Seguimiento de actividad del sistema y registros de cumplimiento.</p>
        </div>
      </div>

      {isError && (
        <Card className="border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          No se pudo cargar la auditoría: {error instanceof Error ? error.message : "Error desconocido"}.
        </Card>
      )}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-slate-900">
        <Table>
          <TableHeader className="bg-slate-50 dark:bg-slate-800/50">
            <TableRow>
              <TableHead className="w-[180px] font-semibold">Fecha y Hora</TableHead>
              <TableHead className="font-semibold">Usuario</TableHead>
              <TableHead className="font-semibold">Acción</TableHead>
              <TableHead className="font-semibold">Entidad</TableHead>
              <TableHead className="font-semibold">Detalles</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [...Array(10)].map((_, i) => (
                <TableRow key={i}>
                  <TableCell><div className="h-4 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></TableCell>
                  <TableCell><div className="h-4 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></TableCell>
                  <TableCell><div className="h-4 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></TableCell>
                  <TableCell><div className="h-4 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></TableCell>
                  <TableCell><div className="h-4 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" /></TableCell>
                </TableRow>
              ))
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-48 text-center text-slate-500">
                  <Activity className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                  No se encontraron registros de auditoría.
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log) => (
                <TableRow key={log.id} className="text-sm">
                  <TableCell className="whitespace-nowrap text-slate-500">
                    {format(new Date(log.createdAt), "d MMM yyyy HH:mm:ss", { locale: es })}
                  </TableCell>
                  <TableCell className="font-medium">{log.userName || "Sistema"}</TableCell>
                  <TableCell>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono font-semibold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="capitalize">{log.entityType}</span>
                    <span className="ml-1 text-slate-400">#{log.entityId}</span>
                  </TableCell>
                  <TableCell className="max-w-md truncate text-slate-500">
                    {log.newValues ? (
                      <span className="text-xs font-mono">{JSON.stringify(log.newValues).substring(0, 100)}...</span>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {auditData && auditData.totalPages > 1 && (
          <div className="flex items-center justify-between border-t bg-slate-50/50 p-4 dark:bg-slate-900/50">
            <span className="text-sm text-slate-500">
              Mostrando {(page - 1) * 50 + 1}–{Math.min(page * 50, auditData.total)} de {auditData.total}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
              <Button variant="outline" size="sm" disabled={page === auditData.totalPages} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
