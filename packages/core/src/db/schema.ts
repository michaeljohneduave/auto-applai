import type { InferSelectModel } from "drizzle-orm";
import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import type z from "zod";
import type { formCompleterSchema } from "../schema";
import type { SessionCost } from "../types";

const sessionStatus = ["started", "done"] as const;

export const sessions = sqliteTable("sessions", {
	id: t.integer().primaryKey({
		autoIncrement: true,
	}),
	userId: t.text("user_id").notNull(),
	title: t.text("title").notNull(),
	companyName: t.text("company_name").notNull(),
	url: t.text("url").notNull(),
	status: t.text({ enum: sessionStatus }).default("started"),
	generatedResumeUrl: t.text("generated_resume_url").notNull(),
	coverLetter: t.text("cover-letter").notNull(),
	applicationForm: t
		.text("application_form", {
			mode: "json",
		})
		.$type<z.infer<typeof formCompleterSchema>>()
		.notNull(),
	cost: t
		.text({
			mode: "json",
		})
		.$type<SessionCost>()
		.notNull(),
});

export const users = sqliteTable("users", {
	id: t.integer().primaryKey({
		autoIncrement: true,
	}),
	userId: t.text("user_id").notNull(),
	baseResumeMd: t.text("base_resume_md").notNull(),
	personalInfoMd: t.text("personal_info_md").notNull(),
	baseResumeLatex: t.text("base_resume_latex").notNull(),
});

export type Sessions = InferSelectModel<typeof sessions>;
export type Users = InferSelectModel<typeof users>;
