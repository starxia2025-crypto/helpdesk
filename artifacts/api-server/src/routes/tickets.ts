import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { auditLogsTable, commentsTable, schoolsTable, tenantsTable, ticketsTable, usersTable } from "@workspace/db/schema";
import { eq, and, count, desc, gte, lte, sql, or } from "drizzle-orm";
import { requireAuth, requireRole } from "../lib/auth.js";
import { createAuditLog } from "../lib/audit.js";
import { parseDbJson, stringifyDbJson } from "../lib/db-json.js";
import { containsInsensitive } from "../lib/db-search.js";
import { findMochilasStudentByEmail } from "../lib/mochilas.js";

const router = Router();

const ticketStatuses = ["nuevo", "pendiente", "en_revision", "en_proceso", "esperando_cliente", "resuelto", "cerrado"] as const;
const ticketPriorities = ["baja", "media", "alta", "urgente"] as const;

const createTicketSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  priority: z.enum(ticketPriorities).default("media"),
  category: z.string().nullable().optional(),
  tenantId: z.number(),
  schoolId: z.number().nullable().optional(),
  customFields: z.record(z.unknown()).nullable().optional(),
});

const updateTicketSchema = z.object({
  title: z.string().min(3).optional(),
  description: z.string().optional(),
  priority: z.enum(ticketPriorities).optional(),
  category: z.string().nullable().optional(),
  schoolId: z.number().nullable().optional(),
  customFields: z.record(z.unknown()).nullable().optional(),
});

const assignTicketSchema = z.object({
  userId: z.number().nullable(),
});

const changeStatusSchema = z.object({
  status: z.enum(ticketStatuses),
  comment: z.string().nullable().optional(),
});

const mochilaStudentLookupSchema = z.object({
  email: z.string().email(),
  tenantId: z.coerce.number().optional(),
});

function generateTicketNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TKT-${timestamp}-${random}`;
}

function parseCustomFields(value: unknown) {
  return parseDbJson<Record<string, unknown> | null>(value, null);
}

function normalizeTicket<T extends { customFields?: unknown }>(ticket: T) {
  return {
    ...ticket,
    customFields: parseCustomFields(ticket.customFields),
  };
}

function getTicketVisibilityConditions(authUser: any) {
  const conditions: any[] = [];

  if (authUser.scopeType === "school" && authUser.schoolId) {
    conditions.push(eq(ticketsTable.schoolId, authUser.schoolId));
  } else if (authUser.scopeType === "tenant" && authUser.tenantId) {
    conditions.push(eq(ticketsTable.tenantId, authUser.tenantId));
  } else if (authUser.role !== "superadmin" && authUser.role !== "tecnico" && authUser.tenantId) {
    conditions.push(eq(ticketsTable.tenantId, authUser.tenantId));
  }

  return conditions;
}

function canUserAccessTicket(ticket: { tenantId: number; schoolId?: number | null }, authUser: any) {
  if (authUser.scopeType === "school") {
    return !!authUser.schoolId && ticket.schoolId === authUser.schoolId;
  }

  if (authUser.scopeType === "tenant") {
    return !!authUser.tenantId && ticket.tenantId === authUser.tenantId;
  }

  if (authUser.role === "superadmin" || authUser.role === "tecnico") {
    return true;
  }

  return !!authUser.tenantId && ticket.tenantId === authUser.tenantId;
}

function canManageTicket(ticket: { createdById: number; tenantId: number; schoolId?: number | null }, authUser: any) {
  if (["superadmin", "tecnico", "admin_cliente"].includes(authUser.role)) {
    return canUserAccessTicket(ticket, authUser);
  }

  return authUser.userId === ticket.createdById && canUserAccessTicket(ticket, authUser);
}

function buildTicketConditions(query: Record<string, any>, authUser: any) {
  const conditions: any[] = [];

  conditions.push(...getTicketVisibilityConditions(authUser));

  if ((authUser.role === "superadmin" || authUser.role === "tecnico") && query["tenantId"]) {
    conditions.push(eq(ticketsTable.tenantId, Number(query["tenantId"])));
  }

  if (query["schoolId"]) {
    conditions.push(eq(ticketsTable.schoolId, Number(query["schoolId"])));
  }

  if (query["status"]) conditions.push(eq(ticketsTable.status, query["status"]));
  if (query["priority"]) conditions.push(eq(ticketsTable.priority, query["priority"]));
  if (query["assignedToId"]) conditions.push(eq(ticketsTable.assignedToId, Number(query["assignedToId"])));
  if (query["category"]) conditions.push(eq(ticketsTable.category, query["category"]));
  if (query["dateFrom"]) conditions.push(gte(ticketsTable.createdAt, new Date(query["dateFrom"])));
  if (query["dateTo"]) {
    const end = new Date(query["dateTo"]);
    end.setHours(23, 59, 59, 999);
    conditions.push(lte(ticketsTable.createdAt, end));
  }
  if (query["search"]) {
    conditions.push(
      or(
        containsInsensitive(ticketsTable.title, query["search"]),
        containsInsensitive(ticketsTable.ticketNumber, query["search"])
      )
    );
  }

  return conditions;
}

router.get("/", requireAuth, async (req, res) => {
  const authUser = (req as any).user;
  const page = Math.max(1, Number(req.query["page"]) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query["limit"]) || 20));
  const offset = (page - 1) * limit;

  const conditions = buildTicketConditions(req.query as any, authUser);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [tickets, totalResult] = await Promise.all([
    (
      offset > 0
        ? db
            .select({
              id: ticketsTable.id,
              ticketNumber: ticketsTable.ticketNumber,
              title: ticketsTable.title,
              description: ticketsTable.description,
              status: ticketsTable.status,
              priority: ticketsTable.priority,
              category: ticketsTable.category,
              tenantId: ticketsTable.tenantId,
              tenantName: tenantsTable.name,
              schoolId: ticketsTable.schoolId,
              schoolName: schoolsTable.name,
              createdById: ticketsTable.createdById,
              createdByName: usersTable.name,
              assignedToId: ticketsTable.assignedToId,
              customFields: ticketsTable.customFields,
              createdAt: ticketsTable.createdAt,
              updatedAt: ticketsTable.updatedAt,
              resolvedAt: ticketsTable.resolvedAt,
            })
            .from(ticketsTable)
            .leftJoin(tenantsTable, eq(ticketsTable.tenantId, tenantsTable.id))
            .leftJoin(schoolsTable, eq(ticketsTable.schoolId, schoolsTable.id))
            .leftJoin(usersTable, eq(ticketsTable.createdById, usersTable.id))
            .where(where)
            .orderBy(desc(ticketsTable.createdAt))
            .offset(offset)
            .fetch(limit)
        : db
            .select({
              id: ticketsTable.id,
              ticketNumber: ticketsTable.ticketNumber,
              title: ticketsTable.title,
              description: ticketsTable.description,
              status: ticketsTable.status,
              priority: ticketsTable.priority,
              category: ticketsTable.category,
              tenantId: ticketsTable.tenantId,
              tenantName: tenantsTable.name,
              schoolId: ticketsTable.schoolId,
              schoolName: schoolsTable.name,
              createdById: ticketsTable.createdById,
              createdByName: usersTable.name,
              assignedToId: ticketsTable.assignedToId,
              customFields: ticketsTable.customFields,
              createdAt: ticketsTable.createdAt,
              updatedAt: ticketsTable.updatedAt,
              resolvedAt: ticketsTable.resolvedAt,
            })
            .top(limit)
            .from(ticketsTable)
            .leftJoin(tenantsTable, eq(ticketsTable.tenantId, tenantsTable.id))
            .leftJoin(schoolsTable, eq(ticketsTable.schoolId, schoolsTable.id))
            .leftJoin(usersTable, eq(ticketsTable.createdById, usersTable.id))
            .where(where)
            .orderBy(desc(ticketsTable.createdAt))
    ),
    db.select({ count: count() }).from(ticketsTable).where(where),
  ]);

  const ticketsWithExtra = await Promise.all(
    tickets.map(async (t) => {
      const [commentCount, assignee] = await Promise.all([
        db.select({ count: count() }).from(commentsTable).where(eq(commentsTable.ticketId, t.id)),
        t.assignedToId
          ? db.select({ name: usersTable.name }).top(1).from(usersTable).where(eq(usersTable.id, t.assignedToId))
          : Promise.resolve([]),
      ]);
      return {
        ...normalizeTicket(t),
        assignedToName: (assignee as any)[0]?.name ?? null,
        commentCount: Number(commentCount[0]?.count ?? 0),
      };
    })
  );

  const total = Number(totalResult[0]?.count ?? 0);
  res.json({ data: ticketsWithExtra, total, page, limit, totalPages: Math.ceil(total / limit) });
});

router.post("/", requireAuth, async (req, res) => {
  const authUser = (req as any).user;
  const parsed = createTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: parsed.error.message });
    return;
  }

  const resolvedTenantId =
    authUser.scopeType === "tenant" || authUser.scopeType === "school"
      ? authUser.tenantId
      : parsed.data.tenantId;

  const resolvedSchoolId =
    authUser.scopeType === "school"
      ? authUser.schoolId
      : (parsed.data.schoolId ?? null);

  if (!resolvedTenantId) {
    res.status(400).json({ error: "ValidationError", message: "Selecciona la red educativa del ticket." });
    return;
  }

  if (!resolvedSchoolId) {
    res.status(400).json({ error: "ValidationError", message: "Selecciona el colegio al que pertenece el ticket." });
    return;
  }

  const schools = await db
    .select({
      id: schoolsTable.id,
      tenantId: schoolsTable.tenantId,
      name: schoolsTable.name,
      active: schoolsTable.active,
    })
    .top(1)
    .from(schoolsTable)
    .where(eq(schoolsTable.id, resolvedSchoolId));

  const school = schools[0];
  if (!school || !school.active || school.tenantId !== resolvedTenantId) {
    res.status(400).json({ error: "ValidationError", message: "El colegio seleccionado no es valido para esta red educativa." });
    return;
  }

  if ((authUser.scopeType === "tenant" || authUser.scopeType === "school") && resolvedTenantId !== authUser.tenantId) {
    res.status(403).json({ error: "Forbidden", message: "Cannot create ticket for another tenant" });
    return;
  }

  const ticketNumber = generateTicketNumber();

  await db.insert(ticketsTable).values({
    ticketNumber,
    title: parsed.data.title,
    description: parsed.data.description,
    priority: parsed.data.priority,
    category: parsed.data.category ?? null,
    tenantId: resolvedTenantId,
    schoolId: resolvedSchoolId,
    createdById: authUser.userId,
    customFields: stringifyDbJson(parsed.data.customFields ?? null),
  });

  const tickets = await db
    .select({
      id: ticketsTable.id,
      ticketNumber: ticketsTable.ticketNumber,
      title: ticketsTable.title,
      description: ticketsTable.description,
      status: ticketsTable.status,
      priority: ticketsTable.priority,
      category: ticketsTable.category,
      tenantId: ticketsTable.tenantId,
      tenantName: tenantsTable.name,
      schoolId: ticketsTable.schoolId,
      schoolName: schoolsTable.name,
      createdById: ticketsTable.createdById,
      createdByName: usersTable.name,
      assignedToId: ticketsTable.assignedToId,
      customFields: ticketsTable.customFields,
      createdAt: ticketsTable.createdAt,
      updatedAt: ticketsTable.updatedAt,
      resolvedAt: ticketsTable.resolvedAt,
    })
    .top(1)
    .from(ticketsTable)
    .leftJoin(tenantsTable, eq(ticketsTable.tenantId, tenantsTable.id))
    .leftJoin(schoolsTable, eq(ticketsTable.schoolId, schoolsTable.id))
    .leftJoin(usersTable, eq(ticketsTable.createdById, usersTable.id))
    .where(eq(ticketsTable.ticketNumber, ticketNumber));

  const ticket = tickets[0];
  if (!ticket) {
    throw new Error("Ticket insert succeeded but could not be reloaded.");
  }

  await createAuditLog({
    action: "create",
    entityType: "ticket",
    entityId: ticket.id,
    userId: authUser.userId,
    tenantId: resolvedTenantId,
    newValues: { title: parsed.data.title, priority: parsed.data.priority, schoolId: resolvedSchoolId },
  });

  res.status(201).json({
    ...normalizeTicket(ticket),
    assignedToName: null,
    commentCount: 0,
  });
});

router.get("/mochilas/student", requireAuth, async (req, res) => {
  const authUser = (req as any).user;
  const parsed = mochilaStudentLookupSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: "Indica un correo de alumno valido." });
    return;
  }

  const tenantId =
    authUser.scopeType === "global"
      ? parsed.data.tenantId
      : authUser.tenantId;

  if (!tenantId) {
    res.status(400).json({ error: "ValidationError", message: "Selecciona primero la red educativa." });
    return;
  }

  const tenants = await db
    .select({
      id: tenantsTable.id,
      name: tenantsTable.name,
      hasMochilasAccess: tenantsTable.hasMochilasAccess,
    })
    .top(1)
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));

  const tenant = tenants[0];
  if (!tenant) {
    res.status(404).json({ error: "NotFound", message: "No se encontro la red educativa seleccionada." });
    return;
  }

  if (!tenant.hasMochilasAccess) {
    res.status(400).json({ error: "MochilasDisabled", message: "Mochilas no esta activado para este colegio o red educativa." });
    return;
  }

  try {
    const student = await findMochilasStudentByEmail(parsed.data.email);
    if (!student) {
      res.status(404).json({ error: "NotFound", message: "No se encontro ningun alumno con ese correo en Mochilas." });
      return;
    }

    res.json(student);
  } catch (error) {
    console.error("Mochilas lookup failed", error);
    res.status(500).json({ error: "InternalServerError", message: "No se pudo consultar la informacion de Mochilas." });
  }
});

router.get("/:ticketId", requireAuth, async (req, res) => {
  const ticketId = Number(req.params["ticketId"]);
  const authUser = (req as any).user;

  const tickets = await db
    .select({
      id: ticketsTable.id,
      ticketNumber: ticketsTable.ticketNumber,
      title: ticketsTable.title,
      description: ticketsTable.description,
      status: ticketsTable.status,
      priority: ticketsTable.priority,
      category: ticketsTable.category,
      tenantId: ticketsTable.tenantId,
      tenantName: tenantsTable.name,
      schoolId: ticketsTable.schoolId,
      schoolName: schoolsTable.name,
      createdById: ticketsTable.createdById,
      createdByName: usersTable.name,
      assignedToId: ticketsTable.assignedToId,
      customFields: ticketsTable.customFields,
      createdAt: ticketsTable.createdAt,
      updatedAt: ticketsTable.updatedAt,
      resolvedAt: ticketsTable.resolvedAt,
    })
    .top(1)
    .from(ticketsTable)
    .leftJoin(tenantsTable, eq(ticketsTable.tenantId, tenantsTable.id))
    .leftJoin(schoolsTable, eq(ticketsTable.schoolId, schoolsTable.id))
    .leftJoin(usersTable, eq(ticketsTable.createdById, usersTable.id))
    .where(eq(ticketsTable.id, ticketId))
    ;

  const ticket = tickets[0];
  if (!ticket) {
    res.status(404).json({ error: "NotFound", message: "Ticket not found" });
    return;
  }

  if (!canUserAccessTicket(ticket, authUser)) {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }

  if (!canManageTicket(ticket, authUser)) {
    res.status(403).json({ error: "Forbidden", message: "You cannot edit this ticket" });
    return;
  }

  const [comments, ticketAuditLogs, commentCount, assignee] = await Promise.all([
    db
      .select({
        id: commentsTable.id,
        ticketId: commentsTable.ticketId,
        authorId: commentsTable.authorId,
        authorName: usersTable.name,
        authorRole: usersTable.role,
        content: commentsTable.content,
        isInternal: commentsTable.isInternal,
        createdAt: commentsTable.createdAt,
      })
      .from(commentsTable)
      .leftJoin(usersTable, eq(commentsTable.authorId, usersTable.id))
      .where(eq(commentsTable.ticketId, ticketId))
      .orderBy(commentsTable.createdAt),
    db
      .select()
      .top(20)
      .from(auditLogsTable)
      .where(and(eq(auditLogsTable.entityType, "ticket"), eq(auditLogsTable.entityId, ticketId)))
      .orderBy(desc(auditLogsTable.createdAt)),
    db.select({ count: count() }).from(commentsTable).where(eq(commentsTable.ticketId, ticketId)),
    ticket.assignedToId
      ? db.select({ name: usersTable.name }).top(1).from(usersTable).where(eq(usersTable.id, ticket.assignedToId))
      : Promise.resolve([]),
  ]);

  const visibleComments = authUser.scopeType === "school" || authUser.role === "usuario_cliente"
    ? comments.filter((c) => !c.isInternal)
    : comments;

  res.json({
    ...normalizeTicket(ticket),
    assignedToName: (assignee as any)[0]?.name ?? null,
    commentCount: Number(commentCount[0]?.count ?? 0),
    comments: visibleComments,
    auditLogs: ticketAuditLogs.map((log) => ({
      ...log,
      oldValues: parseDbJson<Record<string, unknown> | null>(log.oldValues, null),
      newValues: parseDbJson<Record<string, unknown> | null>(log.newValues, null),
    })),
  });
});

router.patch("/:ticketId", requireAuth, async (req, res) => {
  const ticketId = Number(req.params["ticketId"]);
  const authUser = (req as any).user;
  const parsed = updateTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: parsed.error.message });
    return;
  }

  const tickets = await db.select().top(1).from(ticketsTable).where(eq(ticketsTable.id, ticketId));
  const ticket = tickets[0];
  if (!ticket) {
    res.status(404).json({ error: "NotFound", message: "Ticket not found" });
    return;
  }

  if (!canUserAccessTicket(ticket, authUser)) {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }

  if (
    !["superadmin", "tecnico", "admin_cliente", "visor_cliente"].includes(authUser.role) &&
    authUser.userId !== ticket.createdById
  ) {
    res.status(403).json({ error: "Forbidden", message: "You cannot change the status of this ticket" });
    return;
  }

  const updateValues: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
  if (parsed.data.customFields !== undefined) updateValues["customFields"] = stringifyDbJson(parsed.data.customFields);
  if (parsed.data.schoolId !== undefined) updateValues["schoolId"] = parsed.data.schoolId;

  await db
    .update(ticketsTable)
    .set(updateValues as any)
    .where(eq(ticketsTable.id, ticketId));

  const updated = await db.select().top(1).from(ticketsTable).where(eq(ticketsTable.id, ticketId));

  await createAuditLog({
    action: "update",
    entityType: "ticket",
    entityId: ticketId,
    userId: authUser.userId,
    tenantId: ticket.tenantId,
    oldValues: { title: ticket.title, priority: ticket.priority },
    newValues: parsed.data,
  });

  const [tenant, creator, assignee, commentCount] = await Promise.all([
    db.select({ name: tenantsTable.name }).top(1).from(tenantsTable).where(eq(tenantsTable.id, ticket.tenantId)),
    db.select({ name: usersTable.name }).top(1).from(usersTable).where(eq(usersTable.id, ticket.createdById)),
    updated[0]!.assignedToId
      ? db.select({ name: usersTable.name }).top(1).from(usersTable).where(eq(usersTable.id, updated[0]!.assignedToId!))
      : Promise.resolve([]),
    db.select({ count: count() }).from(commentsTable).where(eq(commentsTable.ticketId, ticketId)),
  ]);

  res.json({
    ...normalizeTicket(updated[0]),
    tenantName: tenant[0]?.name ?? "",
    createdByName: creator[0]?.name ?? "",
    assignedToName: (assignee as any)[0]?.name ?? null,
    commentCount: Number(commentCount[0]?.count ?? 0),
  });
});

router.post("/:ticketId/assign", requireAuth, requireRole("superadmin", "tecnico", "admin_cliente", "visor_cliente"), async (req, res) => {
  const ticketId = Number(req.params["ticketId"]);
  const authUser = (req as any).user;
  const parsed = assignTicketSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: parsed.error.message });
    return;
  }

  const tickets = await db.select().top(1).from(ticketsTable).where(eq(ticketsTable.id, ticketId));
  const ticket = tickets[0];
  if (!ticket) {
    res.status(404).json({ error: "NotFound", message: "Ticket not found" });
    return;
  }

  if (!canUserAccessTicket(ticket, authUser)) {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }

  await db
    .update(ticketsTable)
    .set({ assignedToId: parsed.data.userId, updatedAt: new Date() })
    .where(eq(ticketsTable.id, ticketId));

  const updated = await db.select().top(1).from(ticketsTable).where(eq(ticketsTable.id, ticketId));

  await createAuditLog({
    action: "assign",
    entityType: "ticket",
    entityId: ticketId,
    userId: authUser.userId,
    tenantId: ticket.tenantId,
    oldValues: { assignedToId: ticket.assignedToId },
    newValues: { assignedToId: parsed.data.userId },
  });

  const [tenant, creator, assignee, commentCount] = await Promise.all([
    db.select({ name: tenantsTable.name }).top(1).from(tenantsTable).where(eq(tenantsTable.id, ticket.tenantId)),
    db.select({ name: usersTable.name }).top(1).from(usersTable).where(eq(usersTable.id, ticket.createdById)),
    parsed.data.userId
      ? db.select({ name: usersTable.name }).top(1).from(usersTable).where(eq(usersTable.id, parsed.data.userId))
      : Promise.resolve([]),
    db.select({ count: count() }).from(commentsTable).where(eq(commentsTable.ticketId, ticketId)),
  ]);

  res.json({
    ...normalizeTicket(updated[0]),
    tenantName: tenant[0]?.name ?? "",
    createdByName: creator[0]?.name ?? "",
    assignedToName: (assignee as any)[0]?.name ?? null,
    commentCount: Number(commentCount[0]?.count ?? 0),
  });
});

router.post("/:ticketId/status", requireAuth, async (req, res) => {
  const ticketId = Number(req.params["ticketId"]);
  const authUser = (req as any).user;
  const parsed = changeStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: parsed.error.message });
    return;
  }

  const tickets = await db.select().top(1).from(ticketsTable).where(eq(ticketsTable.id, ticketId));
  const ticket = tickets[0];
  if (!ticket) {
    res.status(404).json({ error: "NotFound", message: "Ticket not found" });
    return;
  }

  const updateData: Record<string, unknown> = {
    status: parsed.data.status,
    updatedAt: new Date(),
  };

  if (parsed.data.status === "resuelto" && !ticket.resolvedAt) {
    updateData["resolvedAt"] = new Date();
  }

  if (!canUserAccessTicket(ticket, authUser)) {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }

  await db
    .update(ticketsTable)
    .set(updateData as any)
    .where(eq(ticketsTable.id, ticketId));

  const updated = await db.select().top(1).from(ticketsTable).where(eq(ticketsTable.id, ticketId));

  if (parsed.data.comment) {
    await db.insert(commentsTable).values({
      ticketId,
      authorId: authUser.userId,
      content: parsed.data.comment,
      isInternal: false,
    });
  }

  await createAuditLog({
    action: "status_change",
    entityType: "ticket",
    entityId: ticketId,
    userId: authUser.userId,
    tenantId: ticket.tenantId,
    oldValues: { status: ticket.status },
    newValues: { status: parsed.data.status },
  });

  const [tenant, creator, assignee, commentCount] = await Promise.all([
    db.select({ name: tenantsTable.name }).top(1).from(tenantsTable).where(eq(tenantsTable.id, ticket.tenantId)),
    db.select({ name: usersTable.name }).top(1).from(usersTable).where(eq(usersTable.id, ticket.createdById)),
    updated[0]!.assignedToId
      ? db.select({ name: usersTable.name }).top(1).from(usersTable).where(eq(usersTable.id, updated[0]!.assignedToId!))
      : Promise.resolve([]),
    db.select({ count: count() }).from(commentsTable).where(eq(commentsTable.ticketId, ticketId)),
  ]);

  res.json({
    ...normalizeTicket(updated[0]),
    tenantName: tenant[0]?.name ?? "",
    createdByName: creator[0]?.name ?? "",
    assignedToName: (assignee as any)[0]?.name ?? null,
    commentCount: Number(commentCount[0]?.count ?? 0),
  });
});

router.get("/:ticketId/comments", requireAuth, async (req, res) => {
  const ticketId = Number(req.params["ticketId"]);
  const authUser = (req as any).user;

  const tickets = await db.select().top(1).from(ticketsTable).where(eq(ticketsTable.id, ticketId));
  const ticket = tickets[0];
  if (!ticket) {
    res.status(404).json({ error: "NotFound", message: "Ticket not found" });
    return;
  }

  if (!canUserAccessTicket(ticket, authUser)) {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }

  const comments = await db
    .select({
      id: commentsTable.id,
      ticketId: commentsTable.ticketId,
      authorId: commentsTable.authorId,
      authorName: usersTable.name,
      authorRole: usersTable.role,
      content: commentsTable.content,
      isInternal: commentsTable.isInternal,
      createdAt: commentsTable.createdAt,
    })
    .from(commentsTable)
    .leftJoin(usersTable, eq(commentsTable.authorId, usersTable.id))
    .where(eq(commentsTable.ticketId, ticketId))
    .orderBy(commentsTable.createdAt);

  const filtered = authUser.scopeType === "school" || authUser.role === "usuario_cliente" ? comments.filter((c) => !c.isInternal) : comments;

  res.json(filtered);
});

router.post("/:ticketId/comments", requireAuth, async (req, res) => {
  const ticketId = Number(req.params["ticketId"]);
  const authUser = (req as any).user;

  const commentSchema = z.object({
    content: z.string().min(1),
    isInternal: z.boolean().default(false),
  });
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "ValidationError", message: parsed.error.message });
    return;
  }

  const tickets = await db.select().top(1).from(ticketsTable).where(eq(ticketsTable.id, ticketId));
  if (!tickets[0]) {
    res.status(404).json({ error: "NotFound", message: "Ticket not found" });
    return;
  }

  if (!canUserAccessTicket(tickets[0], authUser)) {
    res.status(403).json({ error: "Forbidden", message: "Access denied" });
    return;
  }

  const isInternal = parsed.data.isInternal && ["superadmin", "tecnico", "admin_cliente", "visor_cliente"].includes(authUser.role);

  await db.insert(commentsTable).values({
    ticketId,
    authorId: authUser.userId,
    content: parsed.data.content,
    isInternal,
  });

  await db.update(ticketsTable).set({ updatedAt: new Date() }).where(eq(ticketsTable.id, ticketId));

  const [comment, author] = await Promise.all([
    db.select().top(1).from(commentsTable).where(eq(commentsTable.ticketId, ticketId)).orderBy(desc(commentsTable.id)),
    db.select({ name: usersTable.name, role: usersTable.role }).top(1).from(usersTable).where(eq(usersTable.id, authUser.userId)),
  ]);

  res.status(201).json({
    ...comment[0],
    authorName: author[0]?.name ?? "",
    authorRole: author[0]?.role ?? "",
  });
});

export default router;
