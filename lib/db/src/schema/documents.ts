import { mssqlTable, int, nvarchar } from "drizzle-orm/mssql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";
import { boolColumn, createdAtColumn, idColumn, jsonTextColumn, updatedAtColumn } from "./_shared";

export const documentTypeEnum = ["manual", "tutorial", "video", "faq", "link", "other"] as const;
export type DocumentType = typeof documentTypeEnum[number];

export const documentsTable = mssqlTable("SOP_documents", {
  id: idColumn(),
  title: nvarchar("title", { length: 500 }).notNull(),
  description: nvarchar("description", { length: "max" }),
  type: nvarchar("type", { length: 50 }).notNull().default("other"),
  category: nvarchar("category", { length: 255 }),
  url: nvarchar("url", { length: "max" }),
  content: nvarchar("content", { length: "max" }),
  tenantId: int("tenant_id").notNull().references(() => tenantsTable.id),
  tags: jsonTextColumn<string[]>("tags", "[]"),
  visibleToRoles: jsonTextColumn<string[]>("visible_to_roles", '["usuario_cliente","visor_cliente","tecnico","admin_cliente","superadmin"]'),
  published: boolColumn("published", false),
  createdById: int("created_by_id").notNull().references(() => usersTable.id),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const insertDocumentSchema = createInsertSchema(documentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documentsTable.$inferSelect;
