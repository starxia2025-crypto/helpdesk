import { sql } from "drizzle-orm";

export function containsInsensitive(column: unknown, value: string) {
  const normalized = `%${value.toLowerCase()}%`;
  return sql`LOWER(${column}) LIKE ${normalized}`;
}

export function jsonArrayContains(column: unknown, value: string) {
  return sql`${column} LIKE ${`%"${value}"%`}`;
}
