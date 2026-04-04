import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { tenantsTable, usersTable, ticketsTable } from "@workspace/db/schema";
import { eq, count, and, sql } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { parseDbJson, stringifyDbJson } from "../lib/db-json.js";
import { containsInsensitive } from "../lib/db-search.js";

const router = Router();

const quickLinkSchema = z.object({
  label: z.string().min(1),
  url: z.string().url(),
  icon: z.string().min(1),
});

const createTenantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/),
  contactEmail: z.string().email().nullable().optional(),
  primaryColor: z.string().nullable().optional(),
  sidebarBackgroundColor: z.string().nullable().optional(),
  sidebarTextColor: z.string().nullable().optional(),
  quickLinks: z.array(quickLinkSchema).optional(),
});

const updateTenantSchema = z.object({
  name: z.string().min(2).optional(),
  contactEmail: z.string().email().nullable().optional(),
  active: z.boolean().optional(),
  primaryColor: z.string().nullable().optional(),
  sidebarBackgroundColor: z.string().nullable().optional(),
  sidebarTextColor: z.string().nullable().optional(),
  quickLinks: z.array(quickLinkSchema).optional(),
  logoUrl: z.string().nullable().optional(),
});

function parseQuickLinks(value: unknown) {
  return parseDbJson<Array<{ label: string; url: string; icon: string }>>(value, []);
}

router.get("/", requireAuth, requireRole("superadmin", "tecnico", "manager"), async (req, res) => {
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 20));
  const search = req.query["search"] as string | undefined;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (search) {
    conditions.push(containsInsensitive(tenantsTable.name, search));
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

  const [tenants, totalResult] = await Promise.all([
    db.select().from(tenantsTable).where(whereClause).limit(limit).offset(offset).orderBy(tenantsTable.createdAt),
    db.select({ count: count() }).from(tenantsTable).where(whereClause),
  ]);

  const total = Number(totalResult[0]?.count ?? 0);

  const tenantsWithStats = await Promise.all(
    tenants.map(async (tenant) => {
      const [userCount, ticketCount, openTicketCount] = await Promise.all([
        db.select({ count: count() }).from(usersTable).where(eq(usersTable.tenantId, tenant.id)),
        db.select({ count: count() }).from(ticketsTable).where(eq(ticketsTable.tenantId, tenant.id)),
        db.select({ count: count() }).from(ticketsTable).where(
          and(eq(ticketsTable.tenantId, tenant.id), sql`${ticketsTable.status} NOT IN ('resuelto', 'cerrado')`)
        ),
      ]);

      return {
        ...tenant,
        quickLinks: parseQuickLinks(tenant.quickLinks),
        totalUsers: Number(userCount[0]?.count ?? 0),
        totalTickets: Number(ticketCount[0]?.count ?? 0),
        openTickets: Number(openTicketCount[0]?.count ?? 0),
      };
    })
  );

  res.json({ data: tenantsWithStats, total, page, limit, totalPages: Math.ceil(total / limit) });
});

router.post("/", requireAuth, requireRole("superadmin", "tecnico", "manager"), async (req, res) => {
  const parsed = createTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: parsed.error.message });
    return;
  }

  const authUser = (req as any).user;
  try {
    const insertValues: Record<string, unknown> = {
      name: parsed.data.name,
      slug: parsed.data.slug,
    };

    if (parsed.data.contactEmail !== undefined) insertValues["contactEmail"] = parsed.data.contactEmail ?? null;
    if (parsed.data.primaryColor !== undefined) insertValues["primaryColor"] = parsed.data.primaryColor ?? null;
    if (parsed.data.sidebarBackgroundColor !== undefined) insertValues["sidebarBackgroundColor"] = parsed.data.sidebarBackgroundColor ?? null;
    if (parsed.data.sidebarTextColor !== undefined) insertValues["sidebarTextColor"] = parsed.data.sidebarTextColor ?? null;
    if (parsed.data.quickLinks !== undefined) insertValues["quickLinks"] = stringifyDbJson(parsed.data.quickLinks);

    const tenant = await db.insert(tenantsTable).values(insertValues as any).returning();

    await createAuditLog({
      action: "create",
      entityType: "tenant",
      entityId: tenant[0]!.id,
      userId: authUser.userId,
      newValues: parsed.data,
    });

    res.status(201).json({
      ...tenant[0],
      quickLinks: parseQuickLinks(tenant[0]?.quickLinks),
      totalUsers: 0,
      totalTickets: 0,
      openTickets: 0,
    });
  } catch (error: any) {
    if (error?.code === "23505" || error?.code === "2627" || error?.code === "2601") {
      res.status(409).json({ error: "Conflict", message: "Ya existe un cliente con ese slug." });
      return;
    }

    console.error("Create tenant failed", error);
    res.status(500).json({ error: "InternalServerError", message: "No se pudo crear el cliente." });
  }
});

router.get("/:tenantId", requireAuth, requireRole("superadmin", "tecnico", "admin_cliente", "manager"), async (req, res) => {
  const tenantId = Number(req.params["tenantId"]);
  const authUser = (req as any).user;

  if (authUser.role === "admin_cliente" && authUser.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }

  const tenants = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
  const tenant = tenants[0];
  if (!tenant) {
    res.status(404).json({ error: "NotFound", message: "Tenant not found" });
    return;
  }

  const [userCount, ticketCount, openTicketCount] = await Promise.all([
    db.select({ count: count() }).from(usersTable).where(eq(usersTable.tenantId, tenant.id)),
    db.select({ count: count() }).from(ticketsTable).where(eq(ticketsTable.tenantId, tenant.id)),
    db.select({ count: count() }).from(ticketsTable).where(
      and(eq(ticketsTable.tenantId, tenant.id), sql`${ticketsTable.status} NOT IN ('resuelto', 'cerrado')`)
    ),
  ]);

  res.json({
    ...tenant,
    quickLinks: parseQuickLinks(tenant.quickLinks),
    totalUsers: Number(userCount[0]?.count ?? 0),
    totalTickets: Number(ticketCount[0]?.count ?? 0),
    openTickets: Number(openTicketCount[0]?.count ?? 0),
  });
});

router.patch("/:tenantId", requireAuth, requireRole("superadmin", "admin_cliente", "tecnico", "manager"), async (req, res) => {
  const tenantId = Number(req.params["tenantId"]);
  const authUser = (req as any).user;

  if (authUser.role === "admin_cliente" && authUser.tenantId !== tenantId) {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }

  const parsed = updateTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: parsed.error.message });
    return;
  }

  const tenants = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId)).limit(1);
  const old = tenants[0];
  if (!old) {
    res.status(404).json({ error: "NotFound", message: "Tenant not found" });
    return;
  }

  const updateValues: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.quickLinks !== undefined) {
    updateValues["quickLinks"] = stringifyDbJson(parsed.data.quickLinks);
  }

  const updated = await db
    .update(tenantsTable)
    .set(updateValues as any)
    .where(eq(tenantsTable.id, tenantId))
    .returning();

  await createAuditLog({
    action: "update",
    entityType: "tenant",
    entityId: tenantId,
    userId: authUser.userId,
    tenantId,
    oldValues: old as any,
    newValues: parsed.data,
  });

  const [userCount, ticketCount, openTicketCount] = await Promise.all([
    db.select({ count: count() }).from(usersTable).where(eq(usersTable.tenantId, tenantId)),
    db.select({ count: count() }).from(ticketsTable).where(eq(ticketsTable.tenantId, tenantId)),
    db.select({ count: count() }).from(ticketsTable).where(
      and(eq(ticketsTable.tenantId, tenantId), sql`${ticketsTable.status} NOT IN ('resuelto', 'cerrado')`)
    ),
  ]);

  res.json({
    ...updated[0],
    quickLinks: parseQuickLinks(updated[0]?.quickLinks),
    totalUsers: Number(userCount[0]?.count ?? 0),
    totalTickets: Number(ticketCount[0]?.count ?? 0),
    openTickets: Number(openTicketCount[0]?.count ?? 0),
  });
});

export default router;
