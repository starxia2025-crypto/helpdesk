import { mssqlTable, int, nvarchar, datetime2 } from "drizzle-orm/mssql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { boolColumn, createdAtColumn, idColumn, updatedAtColumn } from "./_shared";

export const userRoleEnum = ["superadmin", "admin_cliente", "manager", "tecnico", "usuario_cliente", "visor_cliente"] as const;
export type UserRole = typeof userRoleEnum[number];

export const usersTable = mssqlTable("SOP_users", {
  id: idColumn(),
  email: nvarchar("email", { length: 255 }).notNull().unique(),
  name: nvarchar("name", { length: 255 }).notNull(),
  passwordHash: nvarchar("password_hash", { length: "max" }).notNull(),
  role: nvarchar("role", { length: 50 }).notNull().default("usuario_cliente"),
  tenantId: int("tenant_id").references(() => tenantsTable.id),
  active: boolColumn("active", true),
  lastLoginAt: datetime2("last_login_at", { mode: "date" }),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
