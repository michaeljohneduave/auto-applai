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
import path from "node:path";
import {
	type Logs,
	type Sessions,
	sessions,
	type Users,
	users,
} from "@auto-apply/core/src/db/schema";
import { queue } from "@auto-apply/core/src/utils/queue.ts";
import { and, eq, isNull, or } from "drizzle-orm";
import { toKebabCase } from "remeda";
import { z } from "zod";
import { db } from "./db.ts";
import { eventBus } from "./events.ts";

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
		const [response] = await db
			.update(users)
			.set(req.body)
			.where(eq(users.userId, req.authSession.userId!))
			.returning({
				resumeMd: users.baseResumeMd,
				resumeLatex: users.baseResumeLatex,
				personalInfo: users.personalInfoMd,
			});

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
		limit: z.number().optional().default(10),
		skip: z.number().optional(),
		includeLogs: z.enum(["true", "false"]).optional().default("false"),
	}),
};
export type GetSessionsResponse = Array<
	Sessions & {
		logs?: Logs[];
	}
>;
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
			with: {
				logs: req.query.includeLogs === "true" ? true : undefined,
			},
			limit: req.query.limit,
		});

		return response;
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
		const splitUrl = req.query.url.split("/");

		const response = await db.query.sessions.findFirst({
			where: (sessions) =>
				and(
					eq(sessions.userId, req.authSession.userId!),
					or(
						eq(sessions.url, req.query.url),
						eq(sessions.url, splitUrl.slice(0, -1).join("/")),
					),
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
				status: sessions.status,
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

const putSessionAppliedSchema = {
	body: z.object({
		applied: z.boolean(),
	}),
	params: z.object({
		sessionId: z.string(),
	}),
};
export type PutSessionAppliedBody = z.infer<
	typeof putSessionAppliedSchema.body
>;
export type PutSessionAppliedParams = z.infer<
	typeof putSessionAppliedSchema.params
>;

app.withTypeProvider<ZodTypeProvider>().route({
	method: "PUT",
	url: "/sessions/:sessionId/applied",
	schema: putSessionAppliedSchema,
	preHandler: authHandler,
	handler: async (req, reply) => {
		await db
			.update(sessions)
			.set({ applied: req.body.applied })
			.where(
				and(
					eq(sessions.userId, req.authSession.userId!),
					eq(sessions.id, req.params.sessionId),
				),
			);

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

// Graceful shutdown handling
async function gracefulShutdown() {
	app.log.info("Shutting down gracefully...");
	try {
		await app.close();
		app.log.info("Server closed successfully");
		process.exit(0);
	} catch (error) {
		app.log.error("Error during shutdown:", error);
		process.exit(1);
	}
}

// process.on("SIGINT", gracefulShutdown);
// process.on("SIGTERM", gracefulShutdown);

const PORT = 5500;
app
	.listen({ port: PORT, host: "0.0.0.0" })
	.then(async () => {
		app.log.info(`Auto-Apply API Server listening on port ${PORT}`);
		await checkRequiredServices();
	})
	.catch((err) => {
		app.log.error(err);
		process.exit(1);
	});
