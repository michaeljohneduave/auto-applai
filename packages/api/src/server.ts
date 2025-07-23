import fs from "node:fs/promises";
import { clerkPlugin } from "@clerk/fastify";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import {
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from "fastify-type-provider-zod";
import auth from "./plugins/auth.ts";
import { checkRequiredServices } from "./services.ts";

import "./worker.ts";
import { AssetResponseSchema } from "@auto-apply/core/src/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { queue } from "../../core/src/utils/queue.ts";
import { db } from "./db.ts";
import { sessions, users } from "./schema/schema.ts";

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

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.get("/health", (_, res) => {
	res.status(200).send();
});

const authHandler = async (req, reply) => {
	await app.authenticate(req, reply);
};

app.withTypeProvider<ZodTypeProvider>().route({
	method: "GET",
	url: "/assets",
	schema: {
		response: {
			200: AssetResponseSchema,
		},
	},
	preHandler: authHandler,
	handler: async (req) => {
		const [assets] = await db
			.select({
				baseResumeMd: users.baseResumeMd,
				personalInfoMd: users.personalInfoMd,
			})
			.from(users)
			.where(eq(users.userId, req.authSession.userId!));

		if (!assets) {
			return {
				baseResumeMd: "",
				personalInfoMd: "",
			};
		}

		return assets;
	},
});

app.withTypeProvider<ZodTypeProvider>().route({
	method: "POST",
	url: "/session",
	schema: {
		body: z.object({
			jobUrl: z.string().url(),
		}),
	},
	preHandler: authHandler,
	handler: (req, reply) => {
		queue.enqueue({
			jobUrl: req.body.jobUrl,
			userId: req.authSession?.userId!,
		});

		reply.code(200).send("Enqueued");
	},
});

app.withTypeProvider<ZodTypeProvider>().route({
	method: "GET",
	url: "/sessions",
	schema: {
		querystring: z.object({
			limit: z.number().optional(),
			skip: z.number().optional(),
		}),
	},
	preHandler: authHandler,
	handler: async (req) => {
		return await db
			.select()
			.from(sessions)
			.where(eq(sessions.userId, req.authSession.userId!));
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

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

const PORT = 5000;
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
