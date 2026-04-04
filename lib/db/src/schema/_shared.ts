import { sql } from "drizzle-orm";
import { bit, datetime2, int, nvarchar } from "drizzle-orm/mssql-core";

export function idColumn(name = "id") {
  return int(name).primaryKey().generatedAlwaysAsIdentity();
}

export function createdAtColumn(name = "created_at") {
  return datetime2(name, { mode: "date" }).notNull().default(sql`SYSUTCDATETIME()`);
}

export function updatedAtColumn(name = "updated_at") {
  return datetime2(name, { mode: "date" }).notNull().default(sql`SYSUTCDATETIME()`);
}

export function boolColumn(name: string, defaultValue: boolean) {
  return bit(name).notNull().default(defaultValue);
}

export function jsonTextColumn<T>(name: string, fallbackJson: string | null = null) {
  const column = nvarchar(name, { length: "max" }).$type<T>();
  return fallbackJson === null ? column : column.notNull().default(fallbackJson as T);
}
