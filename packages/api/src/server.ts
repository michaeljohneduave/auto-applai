import fs from "node:fs/promises";
import { clerkPlugin } from "@clerk/fastify";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import fastifySseV2 from "fastify-sse-v2";
import {
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from "fastify-type-provider-zod";
import auth from "./plugins/auth.ts";
import { checkRequiredServices } from "./services.ts";
import { generatePdf } from "./utils.ts";

import "./worker.ts";
import type { Dirent } from "node:fs";
import path from "node:path";
import { emitSessionUpdate, eventBus } from "@auto-apply/common/src/events.ts";
import { db } from "@auto-apply/core/src/db/db.ts";
import {
	jobStatus,
	logs,
	resumeVariants,
	type Sessions,
	sessionHtml,
	sessions,
	type Users,
	users,
} from "@auto-apply/core/src/db/schema";
import { queue } from "@auto-apply/core/src/utils/queue.ts";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { toKebabCase } from "remeda";
import { z } from "zod";
import { transformSessionLogs } from "./log-transformer";
import { getModelPricing } from "./models-cache";
import { urlWhereClause } from "./utils";

declare module "fastify" {
	export interface FastifyInstance {
		authenticate: (
			request: FastifyRequest,
			reply: FastifyReply,
		) => Promise<void>;
	}
}

const app = Fastify({
	logger: {
		level: "info",
		transport: {
			target: "pino-pretty",
			options: {
				translateTime: "HH:MM:ss Z",
				ignore: "pid,hostname",
			},
		},
	},
});

// Prep Directories
await fs.mkdir("assets/failed-scrapes", {
	recursive: true,
});

app.register(clerkPlugin);
app.register(auth);
app.register(fastifySseV2);

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.get("/health", (_, res) => {
	res.status(200).send();
});

const clients = new Map<string, FastifyReply>();

eventBus.on("session:update", (data) => {
	for (const [userId, client] of clients.entries()) {
		if (userId === data.userId) {
			client.sse({
				event: "session:update",
				data: JSON.stringify(data),
			});
		}
	}
});

// Auth handler will attach session into req object if there's valid auth token
const authHandler = async (req: FastifyRequest, reply: FastifyReply) => {
	await app.authenticate(req, reply);
};

app.route({
	method: "GET",
	url: "/events",
	preHandler: authHandler,
	handler: (req, reply) => {
		clients.set(req.authSession.userId!, reply);
		req.raw.on("close", () => {
			clients.delete(req.authSession.userId!);
		});
	},
});

export type GetAssetsResponse = Pick<
	Users,
	"baseResumeLatex" | "baseResumeMd" | "personalInfoMd"
>;

app.withTypeProvider<ZodTypeProvider>().route<{
	Reply: GetAssetsResponse;
}>({
	method: "GET",
	url: "/assets",
	preHandler: authHandler,
	handler: async (req) => {
		const [assets] = await db
			.select({
				baseResumeMd: users.baseResumeMd,
				personalInfoMd: users.personalInfoMd,
				baseResumeLatex: users.baseResumeLatex,
			})
			.from(users)
			.where(eq(users.userId, req.authSession.userId!));

		if (!assets) {
			await db.insert(users).values({
				baseResumeLatex: "",
				baseResumeMd: "",
				personalInfoMd: "",
				userId: req.authSession.userId!,
			});

			return {
				baseResumeLatex: "",
				baseResumeMd: "",
				personalInfoMd: "",
			};
		}

		return assets;
	},
});

const putAssetsSchema = {
	body: z.object({
		baseResumeMd: z.string().optional(),
		baseResumeLatex: z.string().optional(),
		personalInfoMd: z.string().optional(),
	}),
};
export type PutAssetsBody = z.infer<typeof putAssetsSchema.body>;

app.withTypeProvider<ZodTypeProvider>().route({
	method: "PUT",
	url: "/assets",
	schema: putAssetsSchema,
	preHandler: authHandler,
	handler: async (req, reply) => {
		await db
			.update(users)
			.set(req.body)
			.where(eq(users.userId, req.authSession.userId!));

		// if (req.body.baseResumeLatex) {
		// 	const blob = await generatePdf(response.resumeLatex);
		// 	reply.header("content-type", "application/octet-stream");
		// 	return reply.send(Buffer.from(blob));
		// }

		reply.send(200);
	},
});

const postAssetsPdfSchema = {
	body: z.object({
		latex: z.string(),
	}),
};
export type PostAssetsPdfBody = z.infer<typeof postAssetsPdfSchema.body>;

app.withTypeProvider<ZodTypeProvider>().route({
	method: "POST",
	url: "/assets/pdf",
	schema: postAssetsPdfSchema,
	preHandler: authHandler,
	handler: async (req, reply) => {
		const blob = await generatePdf(req.body.latex);
		reply.header("content-type", "application/octet-stream");
		reply.send(Buffer.from(blob));
	},
});

// Poor man's trpc
const postSessionsSchema = {
	body: z.object({
		jobUrl: z.string().url(),
	}),
};
export type PostSessionsResponse = null;
export type PostSessionsBody = z.infer<typeof postSessionsSchema.body>;
app.withTypeProvider<ZodTypeProvider>().route<{
	Reply: PostSessionsResponse;
	Body: PostSessionsBody;
}>({
	method: "POST",
	url: "/sessions",
	schema: postSessionsSchema,
	preHandler: authHandler,
	handler: (req, reply) => {
		const url = new URL(req.body.jobUrl);
		// Remove all search params
		url.search = "";

		queue.enqueue({
			jobUrl: url.toString(),
			userId: req.authSession?.userId!,
		});

		reply.code(200).send("Enqueued");
	},
});

// Extension scrape endpoint
const extensionScrapeSchema = {
	body: z.object({
		html: z.string(),
		url: z.string().url(),
		userId: z.string().optional(),
		forceNew: z.boolean().optional(),
	}),
};

app.withTypeProvider<ZodTypeProvider>().route({
	method: "POST",
	url: "/extension-scrape",
	schema: extensionScrapeSchema,
	preHandler: authHandler,
	handler: (req, reply) => {
		try {
			console.log("Extension scrape request received:");
			console.log("URL:", req.body.url);
			console.log("HTML length:", req.body.html.length);
			console.log("User ID:", req.authSession?.userId);

			// Basic validation
			if (!req.body.html || req.body.html.length < 10) {
				return reply.code(400).send({
					success: false,
					message: "Invalid HTML: too short or empty",
				});
			}

			if (!req.body.url || !req.body.html) {
				return reply.code(400).send({
					success: false,
					message: "Invalid URL or HTML provided",
				});
			}

			queue.enqueue({
				jobUrl: req.body.url,
				html: req.body.html,
				userId: req.authSession?.userId!,
				forceNew: req.body.forceNew,
			});

			reply.code(200).send({
				success: true,
				message: `HTML processed successfully (${req.body.html.length} characters)`,
			});
		} catch (error) {
			console.error("Error processing extension scrape:", error);
			reply.code(500).send({
				success: false,
				message: "Failed to process HTML",
			});
		}
	},
});

const getSessionsSchema = {
	querystring: z.object({
		limit: z.coerce.number().optional().default(25),
		skip: z.coerce.number().optional().default(0),
	}),
};
export type GetSessionsResponse = Array<Sessions>;
export type GetSessionsQueryString = z.infer<
	typeof getSessionsSchema.querystring
>;
app.withTypeProvider<ZodTypeProvider>().route<{
	Querystring: GetSessionsQueryString;
	Reply: GetSessionsResponse;
}>({
	method: "GET",
	url: "/sessions",
	schema: getSessionsSchema,
	preHandler: authHandler,
	handler: async (req) => {
		const response = await db.query.sessions.findMany({
			where: (sessions) =>
				and(
					eq(sessions.userId, req.authSession.userId!),
					isNull(sessions.deletedAt),
				),
			orderBy: (sessions, { desc }) => [desc(sessions.createdAt)],
			limit: req.query.limit,
			offset: req.query.skip,
		});

		return response;
	},
});

// Count sessions endpoint for pagination
app.withTypeProvider<ZodTypeProvider>().route<{
	Reply: { count: number };
}>({
	method: "GET",
	url: "/sessions/count",
	preHandler: authHandler,
	handler: async (req) => {
		const result = await db
			.select({ count: sql<number>`count(*)` })
			.from(sessions)
			.where(
				and(
					eq(sessions.userId, req.authSession.userId!),
					isNull(sessions.deletedAt),
				),
			);

		return { count: result[0]?.count ?? 0 };
	},
});

// New endpoint to get session by URL
const getSessionByUrlSchema = {
	querystring: z.object({
		url: z.string().url(),
	}),
};
export type GetSessionByUrlResponse = Sessions | null;
export type GetSessionByUrlQueryString = z.infer<
	typeof getSessionByUrlSchema.querystring
>;
app.withTypeProvider<ZodTypeProvider>().route<{
	Querystring: GetSessionByUrlQueryString;
	Reply: GetSessionByUrlResponse;
}>({
	method: "GET",
	url: "/sessions/by-url",
	schema: getSessionByUrlSchema,
	preHandler: authHandler,
	handler: async (req) => {
		const response = await db.query.sessions.findFirst({
			where: (sessions) =>
				and(
					eq(sessions.userId, req.authSession.userId!),
					urlWhereClause(req.query.url),
					eq(sessions.sessionStatus, "done"),
					isNull(sessions.deletedAt),
				),
			orderBy: (sessions, { desc }) => [desc(sessions.createdAt)],
		});

		return response;
	},
});

const getGeneratedResumeSchema = {
	querystring: z.object({
		sessionId: z.string(),
	}),
};
app.withTypeProvider<ZodTypeProvider>().route({
	method: "GET",
	url: "/generated-resume",
	schema: getGeneratedResumeSchema,
	preHandler: authHandler,
	handler: async (req, reply) => {
		const [session] = await db
			.select({
				applicationForm: sessions.answeredForm,
				personalInfo: sessions.personalInfo,
				companyInfo: sessions.companyInfo,
				assetPath: sessions.assetPath,
				status: sessions.sessionStatus,
			})
			.from(sessions)
			.where(
				and(
					eq(sessions.userId, req.authSession.userId!),
					eq(sessions.id, req.query.sessionId),
				),
			);

		if (!session || session.status !== "done" || !session.assetPath) {
			reply.send();

			return;
		}

		const fileName = [
			session.assetPath,
			toKebabCase(
				[
					session.personalInfo?.fullName || "",
					session.companyInfo?.shortName.toLowerCase() || "",
					"resume.pdf",
				].join(" "),
			),
		];

		const blob = await fs.readFile(path.join(...fileName));

		reply.header("content-type", "application/octet-stream");
		return reply.send(Buffer.from(blob));
	},
});

// List session assets (optionally filtered by extension)
const getSessionAssetsSchema = {
	params: z.object({
		sessionId: z.string(),
	}),
	querystring: z.object({
		ext: z.string().optional(),
	}),
};
app.withTypeProvider<ZodTypeProvider>().route({
	method: "GET",
	url: "/sessions/:sessionId/assets",
	schema: getSessionAssetsSchema,
	preHandler: authHandler,
	handler: async (req) => {
		const session = await db.query.sessions.findFirst({
			where: (s) =>
				and(
					eq(s.userId, req.authSession.userId!),
					eq(s.id, req.params.sessionId),
					isNull(s.deletedAt),
				),
		});

		if (!session || !session.assetPath) {
			return [] as Array<{
				name: string;
				type: string;
				size: number;
				updatedAt: number;
			}>;
		}

		const assetDir = path.resolve(session.assetPath);
		const entries: Dirent[] = await (await import("node:fs/promises")).readdir(
			assetDir,
			{ withFileTypes: true },
		);
		const extFilter = req.query.ext?.toLowerCase();
		const files = entries.filter((e) => e.isFile());
		const filtered = files.filter((f) =>
			extFilter ? f.name.toLowerCase().endsWith(`.${extFilter}`) : true,
		);

		const results: Array<{
			name: string;
			type: string;
			size: number;
			updatedAt: number;
		}> = [];
		for (const f of filtered) {
			const fullPath = path.join(assetDir, f.name);
			const stat = await fs.stat(fullPath);
			results.push({
				name: f.name,
				type: f.name.split(".").pop() || "",
				size: stat.size,
				updatedAt: stat.mtimeMs,
			});
		}

		return results;
	},
});

// Resume variants endpoints (DB-based)
const getResumeVariantsSchema = {
	params: z.object({ sessionId: z.string() }),
};
app.withTypeProvider<ZodTypeProvider>().route({
	method: "GET",
	url: "/sessions/:sessionId/latex-variants",
	schema: getResumeVariantsSchema,
	preHandler: authHandler,
	handler: async (req, reply) => {
		const session = await db.query.sessions.findFirst({
			where: (s) =>
				and(
					eq(s.userId, req.authSession.userId!),
					eq(s.id, req.params.sessionId),
					isNull(s.deletedAt),
				),
		});

		if (!session) {
			return reply.code(404).send({ error: "Session not found" });
		}

		const rows = await db
			.select()
			.from(resumeVariants)
			.where(eq(resumeVariants.sessionId, req.params.sessionId))
			.orderBy(resumeVariants.orderIndex);

		// If no rows, return empty list (frontend will fallback to file-based)
		const list = rows.map((r) => {
			const baseName = toKebabCase(
				[
					session.personalInfo?.fullName || "",
					session.companyInfo?.shortName || "",
					"resume",
				].join(" "),
			);
			const isBest = r.variantKey === "best" || r.orderIndex === 0;
			const downloadFileName = isBest
				? `${baseName}.pdf`
				: `${baseName}-${r.name.replace(/\.tex$/i, "")}.pdf`;
			return {
				id: r.id,
				name: r.name,
				variantKey: r.variantKey,
				orderIndex: r.orderIndex,
				score: r.score ?? null,
				downloadFileName,
				isBest,
			};
		});

		return list;
	},
});

const getResumeVariantSchema = {
	params: z.object({ sessionId: z.string(), variantId: z.string() }),
};
app.withTypeProvider<ZodTypeProvider>().route({
	method: "GET",
	url: "/sessions/:sessionId/latex-variants/:variantId",
	schema: getResumeVariantSchema,
	preHandler: authHandler,
	handler: async (req, reply) => {
		const session = await db.query.sessions.findFirst({
			where: (s) =>
				and(
					eq(s.userId, req.authSession.userId!),
					eq(s.id, req.params.sessionId),
					isNull(s.deletedAt),
				),
		});
		if (!session) {
			return reply.code(404).send({ error: "Session not found" });
		}

		const variant = await db.query.resumeVariants.findFirst({
			where: (rv) =>
				and(
					eq(rv.id, req.params.variantId),
					eq(rv.sessionId, req.params.sessionId),
				),
		});

		if (!variant) {
			return reply.code(404).send({ error: "Variant not found" });
		}

		return {
			id: variant.id,
			name: variant.name,
			variantKey: variant.variantKey,
			orderIndex: variant.orderIndex,
			score: variant.score ?? null,
			latex: variant.latex,
			eval: variant.eval,
		};
	},
});

const putResumeVariantSchema = {
	params: z.object({ sessionId: z.string(), variantId: z.string() }),
	body: z.object({ latex: z.string() }),
};
app.withTypeProvider<ZodTypeProvider>().route({
	method: "PUT",
	url: "/sessions/:sessionId/latex-variants/:variantId",
	schema: putResumeVariantSchema,
	preHandler: authHandler,
	handler: async (req, reply) => {
		const session = await db.query.sessions.findFirst({
			where: (s) =>
				and(
					eq(s.userId, req.authSession.userId!),
					eq(s.id, req.params.sessionId),
					isNull(s.deletedAt),
				),
		});
		if (!session) {
			return reply.code(404).send({ error: "Session not found" });
		}

		await db
			.update(resumeVariants)
			.set({ latex: req.body.latex })
			.where(
				and(
					eq(resumeVariants.id, req.params.variantId),
					eq(resumeVariants.sessionId, req.params.sessionId),
				),
			);

		return reply.send(200);
	},
});

// Get or update a specific session asset content
const sessionAssetContentSchema = {
	params: z.object({ sessionId: z.string() }),
	querystring: z.object({ name: z.string() }),
};

app.withTypeProvider<ZodTypeProvider>().route({
	method: "GET",
	url: "/sessions/:sessionId/assets/content",
	schema: sessionAssetContentSchema,
	preHandler: authHandler,
	handler: async (req, reply) => {
		const session = await db.query.sessions.findFirst({
			where: (s) =>
				and(
					eq(s.userId, req.authSession.userId!),
					eq(s.id, req.params.sessionId),
					isNull(s.deletedAt),
				),
		});

		if (!session || !session.assetPath) {
			return reply.code(404).send({ error: "Session assets not found" });
		}

		const assetDir = path.resolve(session.assetPath);
		const requested = req.query.name;
		const resolved = path.resolve(assetDir, requested);
		if (!resolved.startsWith(assetDir + path.sep) && resolved !== assetDir) {
			return reply.code(400).send({ error: "Invalid asset path" });
		}

		try {
			const ext = path.extname(resolved).toLowerCase();

			// Restrict viewing to .tex only
			if (ext !== ".tex") {
				return reply.code(400).send({ error: "Viewing limited to .tex files" });
			}
			const text = await fs.readFile(resolved, { encoding: "utf8" });
			return { content: text, contentType: "text" };
		} catch {
			return reply.code(404).send({ error: "Asset not found" });
		}
	},
});

const updateSessionAssetContentSchema = {
	params: z.object({ sessionId: z.string() }),
	querystring: z.object({ name: z.string() }),
	body: z.object({ content: z.string() }),
};

app.withTypeProvider<ZodTypeProvider>().route({
	method: "PUT",
	url: "/sessions/:sessionId/assets/content",
	schema: updateSessionAssetContentSchema,
	preHandler: authHandler,
	handler: async (req, reply) => {
		const session = await db.query.sessions.findFirst({
			where: (s) =>
				and(
					eq(s.userId, req.authSession.userId!),
					eq(s.id, req.params.sessionId),
					isNull(s.deletedAt),
				),
		});

		if (!session || !session.assetPath) {
			return reply.code(404).send({ error: "Session assets not found" });
		}

		const assetDir = path.resolve(session.assetPath);
		const requested = req.query.name;
		const resolved = path.resolve(assetDir, requested);
		if (!resolved.startsWith(assetDir + path.sep) && resolved !== assetDir) {
			return reply.code(400).send({ error: "Invalid asset path" });
		}

		const ext = path.extname(resolved).toLowerCase();
		// Restrict editing to .tex only
		if (ext !== ".tex") {
			return reply.code(400).send({ error: "Editing limited to .tex files" });
		}

		await fs.writeFile(resolved, req.body.content, { encoding: "utf8" });
		return reply.send(200);
	},
});

const putSessionJobStatusSchema = {
	body: z.object({
		jobStatus: z.enum(jobStatus),
	}),
	params: z.object({
		sessionId: z.string(),
	}),
};
export type PutSessionJobStatusBody = z.infer<
	typeof putSessionJobStatusSchema.body
>;
export type PutSessionJobStatusParams = z.infer<
	typeof putSessionJobStatusSchema.params
>;

app.withTypeProvider<ZodTypeProvider>().route({
	method: "PUT",
	url: "/sessions/:sessionId/job-status",
	schema: putSessionJobStatusSchema,
	preHandler: authHandler,
	handler: async (req, reply) => {
		await db
			.update(sessions)
			.set({ jobStatus: req.body.jobStatus })
			.where(
				and(
					eq(sessions.userId, req.authSession.userId!),
					eq(sessions.id, req.params.sessionId),
				),
			);

		reply.send(200);
	},
});

// Update session notes
const putSessionNotesSchema = {
	body: z.object({
		notes: z.string().max(1000),
	}),
	params: z.object({
		sessionId: z.string(),
	}),
};
export type PutSessionNotesBody = z.infer<typeof putSessionNotesSchema.body>;
export type PutSessionNotesParams = z.infer<
	typeof putSessionNotesSchema.params
>;

app.withTypeProvider<ZodTypeProvider>().route({
	method: "PUT",
	url: "/sessions/:sessionId/notes",
	schema: putSessionNotesSchema,
	preHandler: authHandler,
	handler: async (req, reply) => {
		await db
			.update(sessions)
			.set({ notes: req.body.notes })
			.where(
				and(
					eq(sessions.userId, req.authSession.userId!),
					eq(sessions.id, req.params.sessionId),
				),
			);

		emitSessionUpdate({
			userId: req.authSession.userId!,
			sessionId: req.params.sessionId,
		});

		reply.send(200);
	},
});

const deleteSessionSchema = {
	params: z.object({
		sessionId: z.string(),
	}),
};
export type DeleteSessionParams = z.infer<typeof deleteSessionSchema.params>;

app.withTypeProvider<ZodTypeProvider>().route({
	method: "DELETE",
	url: "/sessions/:sessionId",
	schema: deleteSessionSchema,
	preHandler: authHandler,
	handler: async (req, reply) => {
		await db
			.update(sessions)
			.set({ deletedAt: Date.now() })
			.where(
				and(
					eq(sessions.userId, req.authSession.userId!),
					eq(sessions.id, req.params.sessionId),
				),
			);

		reply.send(200);
	},
});

// Retry session endpoint
const retrySessionSchema = {
	params: z.object({
		sessionId: z.string(),
	}),
};
export type RetrySessionParams = z.infer<typeof retrySessionSchema.params>;

app.withTypeProvider<ZodTypeProvider>().route({
	method: "POST",
	url: "/sessions/:sessionId/retry",
	schema: retrySessionSchema,
	preHandler: authHandler,
	handler: async (req, reply) => {
		// Get the session to check ownership and get stored HTML
		const session = await db.query.sessions.findFirst({
			where: (sessions) =>
				and(
					eq(sessions.userId, req.authSession.userId!),
					eq(sessions.id, req.params.sessionId),
					isNull(sessions.deletedAt),
				),
		});

		if (!session) {
			throw new Error("Session not found");
		}

		// Get stored HTML for this session
		const [storedHtml] = await db
			.select()
			.from(sessionHtml)
			.where(eq(sessionHtml.sessionId, req.params.sessionId))
			.orderBy(desc(sessionHtml.createdAt))
			.limit(1);

		if (!storedHtml) {
			throw new Error("No stored HTML found for this session");
		}

		// Transaction
		await db.transaction(async (tx) => {
			// Update session for retry
			await tx
				.update(sessions)
				.set({
					sessionStatus: "processing",
					currentStep: "extracting_info",
					retryCount: sql`retry_count + 1`,
					lastRetryAt: Date.now(),
					title: null,
					applicationForm: null,
					personalInfo: null,
					companyInfo: null,
					jobInfo: null,
					assetPath: null,
					coverLetter: null,
					answeredForm: null,
				})
				.where(
					and(
						eq(sessions.userId, req.authSession.userId!),
						eq(sessions.id, req.params.sessionId),
					),
				);
			// Clear existing logs for this session
			await tx.delete(logs).where(eq(logs.sessionId, req.params.sessionId));
			// Clear existing resume variants for this session
			await tx
				.delete(resumeVariants)
				.where(eq(resumeVariants.sessionId, req.params.sessionId));
		});

		emitSessionUpdate({
			userId: req.authSession.userId!,
			sessionId: req.params.sessionId,
		});

		// Enqueue retry job with stored HTML
		queue.enqueue({
			jobUrl: session.url,
			userId: req.authSession?.userId!,
			html: storedHtml.html || undefined,
			retry: true,
		});

		reply.code(200).send({
			message: "Retry enqueued",
		});
	},
});

// Get transformed session logs
const getSessionLogsSchema = {
	params: z.object({
		sessionId: z.string(),
	}),
};

export type GetSessionLogsParams = z.infer<typeof getSessionLogsSchema.params>;

app.withTypeProvider<ZodTypeProvider>().route({
	method: "GET",
	url: "/sessions/:sessionId/logs",
	schema: getSessionLogsSchema,
	preHandler: authHandler,
	handler: async (req) => {
		// Get the session to check ownership and current step
		const session = await db.query.sessions.findFirst({
			where: (sessions) =>
				and(
					eq(sessions.userId, req.authSession.userId!),
					eq(sessions.id, req.params.sessionId),
					isNull(sessions.deletedAt),
				),
			with: {
				logs: true,
			},
		});

		if (!session) {
			throw new Error("Session not found");
		}

		const transformedLogs = await transformSessionLogs(
			session.logs,
			req.params.sessionId,
			session.currentStep || undefined,
		);

		return transformedLogs;
	},
});

const PORT = 5500;
app
	.listen({ port: PORT, host: "0.0.0.0" })
	.then(async () => {
		app.log.info(`Auto-Apply API Server listening on port ${PORT}`);
		await checkRequiredServices();

		// Initialize model pricing cache
		try {
			await getModelPricing();
			app.log.info("Model pricing cache initialized");
		} catch (error) {
			if (error instanceof Error) {
				app.log.error(
					`Failed to initialize model pricing cache: ${error.message}`,
				);
			} else {
				app.log.error("Failed to initialize model pricing cache");
			}
		}
	})
	.catch((err) => {
		app.log.error(err);
		process.exit(1);
	});
