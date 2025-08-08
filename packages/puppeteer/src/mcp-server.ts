import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import type { FastifyPluginCallback } from "fastify";
import {
	checkElementExists,
	clickAndExtractContent,
	fetchFullHtml,
	quickContentGrab,
	summarizePageContent,
} from "./prompts.ts";
import tools, { browsers } from "./tools.ts";

export const connections = new Map<string, SSEServerTransport>();

const mcpServer = new McpServer({
	name: "puppeteer-sse-server",
	version: "0.1.0",
});

mcpServer.prompt(
	quickContentGrab.name,
	quickContentGrab.schema,
	quickContentGrab.execute,
);

mcpServer.prompt(
	clickAndExtractContent.name,
	clickAndExtractContent.schema,
	clickAndExtractContent.execute,
);

mcpServer.prompt(
	fetchFullHtml.name,
	fetchFullHtml.schema,
	fetchFullHtml.execute,
);

mcpServer.prompt(
	summarizePageContent.name,
	summarizePageContent.schema,
	summarizePageContent.execute,
);

mcpServer.prompt(
	checkElementExists.name,
	checkElementExists.schema,
	checkElementExists.execute,
);

for (const tool of tools) {
	mcpServer.tool(tool.name, tool.description, tool.schema, tool.execute);
}

const mcpRoutes: FastifyPluginCallback = (fastify, options) => {
	fastify.post("/sse", (_request, reply) => {
		reply.status(405).send({ error: "Method Not Allowed. Use GET for SSE." });
	});

	fastify.get("/sse", async (request, reply) => {
		const sessionId = (request.headers["mcp-session-id"] as string) || "";
		let transport: SSEServerTransport;

		if (browsers.size > 100) {
			fastify.log.warn("Too many browser instances.");
			reply.status(503).send({ error: "Service Unavailable" });
			return;
		}

		fastify.log.info(`SSE request body: ${JSON.stringify(request.body)}`);

		reply.hijack();

		if (connections.has(sessionId)) {
			transport = connections.get(sessionId) as SSEServerTransport;
		} else {
			const connectionId = sessionId || crypto.randomUUID();
			const postMessagesPath = `/messages/${connectionId}`;

			transport = new SSEServerTransport(postMessagesPath, reply.raw);
			transport.onclose = () => {
				fastify.log.info(
					`SSE: Transport closed for session ID: ${transport.sessionId}`,
				);
				if (transport.sessionId) {
					connections.delete(transport.sessionId);
					const context = browsers.get(transport.sessionId);
					if (context) {
						context
							.close()
							.then(() => {
								fastify.log.info(
									`Closed browser context for session ID: ${transport.sessionId}`,
								);
							})
							.catch((error) => {
								fastify.log.error(
									`Error closing browser context for session ID ${transport.sessionId}: ${
										error instanceof Error ? error.message : "Unknown error"
									}`,
								);
							});
					}

					browsers.delete(transport.sessionId);
				}
			};

			if (transport.sessionId) {
				connections.set(connectionId, transport);
			}

			await mcpServer.connect(transport);
			return;
		}

		await transport.handlePostMessage(request.raw, reply.raw, request.body);
	});

	fastify.post("/messages/:connectionId", async (request, reply) => {
		const connectionId = (request.params as { connectionId: string })
			.connectionId;
		const transport = connections.get(connectionId);

		fastify.log.info(`SSE request body: ${JSON.stringify(request.body)}`);

		if (!transport) {
			reply.status(404).send({ error: "Connection not found" });
			return;
		}

		reply.hijack();
		await transport.handlePostMessage(request.raw, reply.raw, request.body);
	});
};

export default mcpRoutes;
