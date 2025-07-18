import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { setTimeout } from "node:timers/promises";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import {
	serializerCompiler,
	validatorCompiler,
	type ZodTypeProvider,
} from "fastify-type-provider-zod";
import puppeteer from "puppeteer";
import { z } from "zod";
import { extractHtml, extractMarkdown } from "./apiTools.ts";
import mcpRoutes from "./mcp-server.ts";
import { browsers, pageInstances } from "./tools.ts";

// --- Fastify and MCP Server Setup ---
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

app.register(multipart, {
	limits: {
		fileSize: 10 * 1024 * 1024,
		files: 1,
	},
});

app.register(mcpRoutes);

app.withTypeProvider<ZodTypeProvider>().get(
	"/scrape",
	{
		schema: {
			querystring: z.object({
				url: z.string().url(),
				format: z.enum(["html", "markdown"]),
				screenshot: z.string().default("false"),
			}),
		},
	},
	async (req, res) => {
		const browser = await puppeteer.launch({
			headless: true,
			userDataDir: "../linux-chrome-profile",
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox",
				"--disable-dev-shm-usage",
				"--disable-accelerated-2d-canvas",
				"--no-first-run",
				"--no-zygote",
			],
		});

		const page = await browser.newPage();
		let data = "";
		let screenshot = "";

		try {
			await Promise.race([
				setTimeout(10000),
				page.goto(req.query.url, {
					waitUntil: "networkidle0",
				}),
			]);

			if (req.query.screenshot === "true") {
				screenshot = await page.screenshot({
					fullPage: true,
					encoding: "base64",
				});
			}

			if (req.query.format === "markdown") {
				data = await extractMarkdown(page);
			} else {
				data = await extractHtml(page);
			}
		} catch (e) {
			console.error(e);
		}

		await page.close();
		await browser.close();
		res.send({
			data,
			screenshot,
		});
	},
);

app
	.withTypeProvider<ZodTypeProvider>()
	.post("/upload-resume", async (req, res) => {
		const data = await req.file();

		if (!data) {
			return res.status(400).send({
				message: "No file uploaded",
			});
		}

		if (data.mimetype !== "application/pdf") {
			for await (const chunk of data.file) {
				// no op
			}
			return res.status(400).send({
				message: "Only pdf files allowed.",
			});
		}
		const tmpDir = `${os.tmpdir()}/${randomUUID()}`;
		const fileName = "resume.pdf";
		const filePath = path.join(tmpDir, fileName);

		await mkdir(tmpDir, {
			recursive: true,
		});

		const writeStream = fs.createWriteStream(filePath);

		await pipeline(data.file, writeStream);

		res.status(200).send(filePath);
	});

app.get("/health", (req, res) => {
	res.status(200).send();
});

async function cleanup() {
	for (const [sessionId, context] of browsers.entries()) {
		try {
			await context.close();
			await setTimeout(200);
			app.log.info(`Closed browser context for session ID: ${sessionId}`);
		} catch (error) {
			app.log.error(
				`Error closing browser context for session ID ${sessionId}: ${
					error instanceof Error ? error.message : "Unknown error"
				}`,
			);
		}
	}

	browsers.clear();
	pageInstances.clear();
}

process.on("SIGINT", async () => {
	app.log.info("SIGINT received. Closing all browser contexts...");
	await cleanup();
	app.log.info("All browser contexts closed. Exiting process.");
	process.exit(0);
});

process.on("SIGTERM", async () => {
	app.log.info("SIGTERM received. Closing all browser contexts...");
	await cleanup();
	app.log.info("All browser contexts closed. Exiting process.");
	process.exit(0);
});

const PORT = 80;
app
	.listen({ port: PORT, host: "0.0.0.0" })
	.then(() => {
		app.log.info(`Puppeteer SSE MCP Server listening on port ${PORT}`);
	})
	.catch((err) => {
		app.log.error(err);
		process.exit(1);
	});
