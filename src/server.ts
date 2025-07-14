import fs from "node:fs/promises";
import Fastify from "fastify";
import {
	type ZodTypeProvider,
	serializerCompiler,
	validatorCompiler,
} from "fastify-type-provider-zod";
import { randomString } from "remeda";
import { z } from "zod";
import { checkRequiredServices, orchestrator } from "./auto-apply.ts";
import { sessionManager } from "./sessionManager.ts";

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

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

// Prep Directories
await fs.mkdir("assets/failed-scrapes", {
	recursive: true,
});

app.get("/health", (req, res) => {
	res.status(200).send();
});

app.withTypeProvider<ZodTypeProvider>().get(
	"/apply/status/:sessionId",
	{
		schema: {
			params: z.object({
				sessionId: z.string(),
			}),
		},
	},
	(req, res) => {
		const { sessionId } = req.params;
		const session = sessionManager.getSession(sessionId);

		if (!session) {
			res.status(404).send({ error: "Session not found" });
			return;
		}

		res.send({
			sessionId: session.sessionId,
			status: session.status,
			currentStep: session.currentStep,
			companyName: session.companyName,
			assetPath: session.assetPath,
			error: session.error,
			createdAt: session.createdAt,
			pendingQuestions: session.pendingQuestions,
		});
	},
);

app.get("/apply/sessions", async (req, res) => {
	const sessions = sessionManager.getAllSessions().map((session) => ({
		sessionId: session.sessionId,
		jobUrl: session.jobUrl,
		status: session.status,
		currentStep: session.currentStep,
		companyName: session.companyName,
		createdAt: session.createdAt,
		error: session.error,
	}));

	res.send({ sessions });
});

app.withTypeProvider<ZodTypeProvider>().post(
	"/apply",
	{
		schema: {
			body: z.object({
				jobUrl: z.string().url(),
			}),
		},
	},
	async (req, res) => {
		try {
			const sessionId = randomString(10);
			const session = sessionManager.createSession(sessionId, req.body.jobUrl);

			// Start the orchestrator in the background
			orchestrator(sessionId, req.body.jobUrl).catch((error) => {
				app.log.error(`Orchestrator failed for session ${sessionId}:`, error);
			});

			res.send({
				success: true,
				sessionId: sessionId,
			});
		} catch (error) {
			app.log.error(error);
			res.status(500).send({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}
	},
);

app.withTypeProvider<ZodTypeProvider>().get(
	"/apply/stream/:sessionId",
	{
		schema: {
			params: z.object({
				sessionId: z.string(),
			}),
		},
	},
	async (req, res) => {
		const { sessionId } = req.params;
		const session = sessionManager.getSession(sessionId);

		if (!session) {
			res.status(404).send({ error: "Session not found" });
			return;
		}

		// Set up SSE headers
		res.raw.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Headers": "Cache-Control",
		});

		// Send initial status
		const sendEvent = (event: string, data: unknown) => {
			res.raw.write(`event: ${event}\n`);
			res.raw.write(`data: ${JSON.stringify(data)}\n\n`);
		};

		// Send current status
		if (session.status === "completed") {
			sendEvent("completed", {
				sessionId: session.sessionId,
				companyName: session.companyName,
				assetPath: session.assetPath,
				applicationDetails: session.applicationDetails,
				resumeEval: session.resumeEval,
				formUrl: session.formUrl,
			});
			res.raw.end();
			return;
		}
		if (session.status === "failed") {
			sendEvent("error", { error: session.error });
			res.raw.end();
			return;
		}
		if (session.status === "awaiting_input") {
			sendEvent("clarification_request", {
				questions: session.pendingQuestions,
			});
		} else {
			sendEvent("processing", { status: session.currentStep });
		}

		// Listen for session events
		const eventHandler = (event: { type: string; data: unknown }) => {
			sendEvent(event.type, event.data);

			if (event.type === "completed" || event.type === "error") {
				res.raw.end();
			}
		};

		sessionManager.on(`session:${sessionId}`, eventHandler);

		// Clean up when client disconnects
		req.raw.on("close", () => {
			sessionManager.removeListener(`session:${sessionId}`, eventHandler);
		});
	},
);

app.withTypeProvider<ZodTypeProvider>().post(
	"/apply/clarify/:sessionId",
	{
		schema: {
			params: z.object({
				sessionId: z.string(),
			}),
			body: z.object({
				answers: z.array(
					z.object({
						originalQuestion: z.string(),
						questionForUser: z.string(),
						answer: z.string(),
					}),
				),
			}),
		},
	},
	(req, res) => {
		const { sessionId } = req.params;
		const { answers } = req.body;

		const session = sessionManager.getSession(sessionId);
		if (!session) {
			res.status(404).send({ error: "Session not found" });
			return;
		}

		if (session.status !== "awaiting_input") {
			res.status(400).send({ error: "Session is not awaiting input" });
			return;
		}

		sessionManager.provideClarification(sessionId, answers);

		res.send({ success: true });
	},
);

app.withTypeProvider<ZodTypeProvider>().get(
	"/files/:companyName/:sessionId/:fileName",
	{
		schema: {
			params: z.object({
				companyName: z.string(),
				sessionId: z.string(),
				fileName: z.string(),
			}),
		},
	},
	async (req, res) => {
		try {
			const { companyName, sessionId, fileName } = req.params;
			const filePath = `assets/${companyName}/${sessionId}/${fileName}`;

			const fileBuffer = await fs.readFile(filePath);

			// Set appropriate content type based on file extension
			if (fileName.endsWith(".pdf")) {
				res.type("application/pdf");
			} else if (fileName.endsWith(".png")) {
				res.type("image/png");
			} else if (fileName.endsWith(".json")) {
				res.type("application/json");
			} else if (fileName.endsWith(".md")) {
				res.type("text/markdown");
			} else if (fileName.endsWith(".tex")) {
				res.type("text/plain");
			} else if (fileName.endsWith(".txt")) {
				res.type("text/plain");
			}

			res.send(fileBuffer);
		} catch (error) {
			app.log.error(error);
			res.status(404).send({
				success: false,
				error: "File not found",
			});
		}
	},
);

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
