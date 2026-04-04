import { mssqlTable, int, nvarchar, datetime2 } from "drizzle-orm/mssql-core";
import { usersTable } from "./users";
import { createdAtColumn, idColumn } from "./_shared";

export const sessionsTable = mssqlTable("SOP_sessions", {
  id: idColumn(),
  sessionToken: nvarchar("session_token", { length: 255 }).notNull().unique(),
  userId: int("user_id").notNull().references(() => usersTable.id),
  expiresAt: datetime2("expires_at", { mode: "date" }).notNull(),
  createdAt: createdAtColumn(),
});

export type Session = typeof sessionsTable.$inferSelect;
