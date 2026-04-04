import { mssqlTable, nvarchar } from "drizzle-orm/mssql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { boolColumn, createdAtColumn, idColumn, jsonTextColumn, updatedAtColumn } from "./_shared";

export const tenantsTable = mssqlTable("SOP_tenants", {
  id: idColumn(),
  name: nvarchar("name", { length: 255 }).notNull(),
  slug: nvarchar("slug", { length: 100 }).notNull().unique(),
  legalName: nvarchar("legal_name", { length: 255 }),
  educationGroupType: nvarchar("education_group_type", { length: 80 }).default("school_group"),
  dbSchema: nvarchar("db_schema", { length: 100 }),
  active: boolColumn("active", true),
  logoUrl: nvarchar("logo_url", { length: "max" }),
  primaryColor: nvarchar("primary_color", { length: 20 }),
  sidebarBackgroundColor: nvarchar("sidebar_background_color", { length: 20 }),
  sidebarTextColor: nvarchar("sidebar_text_color", { length: 20 }),
  quickLinks: jsonTextColumn<Array<{ label: string; url: string; icon: string }>>("quick_links", "[]"),
  contactEmail: nvarchar("contact_email", { length: 255 }),
  supportEmail: nvarchar("support_email", { length: 255 }),
  createdAt: createdAtColumn(),
  updatedAt: updatedAtColumn(),
});

export const insertTenantSchema = createInsertSchema(tenantsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTenant = z.infer<typeof insertTenantSchema>;
export type Tenant = typeof tenantsTable.$inferSelect;
