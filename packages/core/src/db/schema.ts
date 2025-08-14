import type { InferSelectModel } from "drizzle-orm";
import { sql } from "drizzle-orm";
import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";
import type {
	ChatCompletion,
	ChatCompletionCreateParamsNonStreaming,
} from "openai/resources.mjs";
import type z from "zod";
import type {
	formCompleterSchema,
	jobPostingSchema,
	personalInfoSchema,
	resumeCritiqueSchema,
} from "../schema";
import type { SessionCost } from "../types";

type RequestLog = ChatCompletionCreateParamsNonStreaming;
type ResponseLog = ChatCompletion | null;

const sessionStatus = [
	"processing",
	"done",
	"failed",
	"no-company-info",
	"no-job-info",
	"no-application-form",
] as const;
const steps = [
	"scraping",
	"extracting_info",
	"agentic_scraping",
	"generating_resume",
	"generating_pdf",
	"generating_latex",
	"saving_assets",
	"ready_to_use",
] as const;

export const jobStatus = ["in_progress", "applied", "not_applied"] as const;

export const sessions = sqliteTable("sessions", {
	id: t.text().primaryKey(),
	userId: t.text("user_id").notNull(),
	title: t.text("title"),
	companyName: t.text("company_name"),
	url: t.text("url").notNull(),
	// Free-form user-provided notes/markdown for this session
	notes: t.text("notes"),
	sessionStatus: t
		.text("session_status", { enum: sessionStatus })
		.default("processing"),
	sessionStatusReason: t.text("session_status_reason"),
	jobStatus: t.text("job_status", { enum: jobStatus }).default("in_progress"),
	jobStatusReason: t.text("job_status_reason"),
	currentStep: t.text({ enum: steps }).default("scraping"),
	generatedResumeUrl: t.text("generated_resume_url"),
	generatedResumeLatex: t.text("generated_resume_latex"),
	coverLetter: t.text("cover-letter"),
	answeredForm: t
		.text("answered_form", {
			mode: "json",
		})
		.$type<z.infer<typeof formCompleterSchema> | null>(),
	companyInfo: t
		.text("company_info", {
			mode: "json",
		})
		.$type<z.infer<typeof jobPostingSchema.shape.companyInfo> | null>(),
	applicationForm: t
		.text("application_form", {
			mode: "json",
		})
		.$type<z.infer<typeof jobPostingSchema.shape.applicationForm> | null>(),
	jobInfo: t
		.text("job_info", {
			mode: "json",
		})
		.$type<z.infer<typeof jobPostingSchema.shape.jobInfo> | null>(),
	personalInfo: t
		.text("personal_info", {
			mode: "json",
		})
		.$type<z.infer<typeof personalInfoSchema> | null>(),
	cost: t
		.text({
			mode: "json",
		})
		.$type<SessionCost | null>(),
	assetPath: t.text("asset_path"),
	retryCount: t.integer("retry_count").default(0),
	lastRetryAt: t.integer("last_retry_at", {
		mode: "number",
	}),
	createdAt: t
		.integer({
			mode: "number",
		})
		.default(sql`(unixepoch() * 1000)`),
	updatedAt: t
		.integer({
			mode: "number",
		})
		.$onUpdate(() => sql`(unixepoch() * 1000)`),
	deletedAt: t.integer({
		mode: "number",
	}),
});

export const logs = sqliteTable("session_logs", {
	id: t
		.integer({
			mode: "number",
		})
		.primaryKey({
			autoIncrement: true,
		}),
	sessionId: t.text("session_id").notNull(),
	llmName: t.text("llm_name"),
	requestLog: t
		.text("request_log", {
			mode: "json",
		})
		.$type<RequestLog>()
		.notNull(),
	responseLog: t
		.text("response_log", {
			mode: "json",
		})
		.$type<ResponseLog>(),
	duration: t
		.integer({
			mode: "number",
		})
		.notNull(),
	createdAt: t
		.integer({
			mode: "number",
		})
		.default(sql`(unixepoch() * 1000)`),
	updatedAt: t
		.integer({
			mode: "number",
		})
		.$onUpdate(() => sql`(unixepoch() * 1000)`),
});

export const sessionHtml = sqliteTable("session_html", {
	id: t
		.integer({
			mode: "number",
		})
		.primaryKey({
			autoIncrement: true,
		}),
	sessionId: t.text("session_id").notNull(),
	html: t.text("html").notNull(),
	screenshot: t.text("screenshot"),
	createdAt: t
		.integer({
			mode: "number",
		})
		.default(sql`(unixepoch() * 1000)`),
});

export const users = sqliteTable("users", {
	userId: t.text("user_id").notNull().primaryKey(),
	baseResumeMd: t.text("base_resume_md").notNull(),
	personalInfoMd: t.text("personal_info_md").notNull(),
	baseResumeLatex: t.text("base_resume_latex").notNull(),
});

export const resumeVariants = sqliteTable("resume_variants", {
	id: t.text().primaryKey(),
	sessionId: t.text("session_id").notNull(),
	variantKey: t.text("variant_key").notNull(),
	orderIndex: t.integer("order_index", { mode: "number" }).notNull(),
	name: t.text("name").notNull(),
	latex: t.text("latex").notNull(),
	eval: t
		.text("eval", { mode: "json" })
		.$type<z.infer<typeof resumeCritiqueSchema> | null>(),
	// Note: storing score denormalized for easy sort/filter
	score: t.integer("score", { mode: "number" }),
	createdAt: t.integer({ mode: "number" }).default(sql`(unixepoch() * 1000)`),
	updatedAt: t
		.integer({ mode: "number" })
		.$onUpdate(() => sql`(unixepoch() * 1000)`),
});

export type Sessions = InferSelectModel<typeof sessions>;
export type Users = InferSelectModel<typeof users>;
export type Logs = InferSelectModel<typeof logs>;
export type SessionHtml = InferSelectModel<typeof sessionHtml>;
export type ResumeVariant = InferSelectModel<typeof resumeVariants>;
