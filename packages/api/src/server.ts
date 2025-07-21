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
import { z } from "zod";
import { queue } from "../../core/src/utils/queue.ts";

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
	handler: (req, reply) => {
		return {
			baseResume: "",
			personalInfo: "",
		};
	},
});

app.withTypeProvider<ZodTypeProvider>().route({
	method: "POST",
	url: "/job",
	schema: {
		body: z.object({
			jobUrl: z.string().url(),
		}),
	},
	preHandler: authHandler,
	handler: (req, reply) => {
		queue.enqueue({
			jobUrl: req.body.jobUrl,
			userId: req.session?.userId!,
		});

		reply.code(200).send("Enqueued");
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
