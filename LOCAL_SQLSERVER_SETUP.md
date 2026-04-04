# Local SQL Server Setup

## 1. Variables de entorno

Crea [`C:\Helpdesk-Saas\.env.local`](C:\Helpdesk-Saas\.env.local) copiando [`C:\Helpdesk-Saas\.env.local.example`](C:\Helpdesk-Saas\.env.local.example) y rellena:

- `SQLSERVER_PASSWORD`
- `MICROSOFT_*` solo si vas a usar login Microsoft

## 2. Tablas esperadas

La app ahora espera estas tablas en SQL Server:

- `SOP_tenants`
- `SOP_users`
- `SOP_schools`
- `SOP_tickets`
- `SOP_comments`
- `SOP_documents`
- `SOP_audit_logs`
- `SOP_sessions`

## 3. Dependencias nuevas

En cuanto tengas acceso a `pnpm`, instala de nuevo para bajar:

- `drizzle-orm@beta`
- `drizzle-kit@beta`
- `mssql`

## 4. Arranque local

Backend:

```powershell
cd C:\Helpdesk-Saas
pnpm install
pnpm --filter @workspace/api-server run build
```

Frontend:

```powershell
cd C:\Helpdesk-Saas
$env:VITE_API_BASE_URL="http://localhost:3001"
pnpm --filter @workspace/helpdesk run dev
```

## 5. Estado de la migración

Ya está adaptado:

- conexión base a SQL Server por variables `SQLSERVER_*`
- esquema `SOP_*`
- serialización JSON para `quick_links`, `custom_fields`, `tags`, `visible_to_roles`, `old_values`, `new_values`
- rutas principales de `tenants`, `users`, `tickets`, `documents`, `audit` y `dashboard`

Pendiente de validar en runtime:

- instalación real de dependencias
- typecheck completo
- arranque local contra tu SQL Server corporativo
- seed inicial y revisión de cualquier query restante dependiente del dialecto
