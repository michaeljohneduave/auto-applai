import { relations } from "drizzle-orm";
import { logs, sessions } from "./schema";

export const sessionsRelations = relations(sessions, ({ many }) => ({
	logs: many(logs),
}));

export const logsRelations = relations(logs, ({ one }) => ({
	session: one(sessions, {
		fields: [logs.sessionId],
		references: [sessions.id],
	}),
}));
