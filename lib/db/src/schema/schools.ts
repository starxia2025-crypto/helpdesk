import { int, nvarchar } from "drizzle-orm/mssql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { tenantsTable } from "./tenants";
import { boolColumn, createdAtColumn, dboSchema, idColumn, updatedAtColumn } from "./_shared";

export const schoolsTable = dboSchema.table("SOP_schools", {
  id: idColumn(),
  tenantId: int("tenant_id").notNull().references(() => tenantsTable.id),
  parentSchoolId: int("parent_school_id"),
  name: nvarchar("name", { length: 255 }).notNull(),
  slug: nvarchar("slug", { length: 120 }).notNull(),
  code: nvarchar("code", { length: 80 }),
  active: boolColumn("active", true),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const insertSchoolSchema = createInsertSchema(schoolsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertSchool = z.infer<typeof insertSchoolSchema>;
export type School = typeof schoolsTable.$inferSelect;
