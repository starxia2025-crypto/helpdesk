import { mssqlTable, int, nvarchar } from "drizzle-orm/mssql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ticketsTable } from "./tickets";
import { usersTable } from "./users";
import { boolColumn, createdAtColumn, idColumn } from "./_shared";

export const commentsTable = mssqlTable("SOP_comments", {
  id: idColumn(),
  ticketId: int("ticket_id").notNull().references(() => ticketsTable.id),
  authorId: int("author_id").notNull().references(() => usersTable.id),
  content: nvarchar("content", { length: "max" }).notNull(),
  isInternal: boolColumn("is_internal", false),
  createdAt: createdAtColumn(),
});

export const insertCommentSchema = createInsertSchema(commentsTable).omit({ id: true, createdAt: true });
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type Comment = typeof commentsTable.$inferSelect;
