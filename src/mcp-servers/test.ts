import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import fastify from "fastify";
import { z } from "zod";

const app = fastify({
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

const server = new McpServer({
	name: "test-server",
	version: "0.1.0",
});

const connections = new Map<string, SSEServerTransport>();

server.tool(
	"add",
	{
		a: z.number(),
		b: z.number(),
	},
	({ a, b }) => {
		return {
			content: [
				{
					type: "text",
					text: String(a + b),
				},
			],
		};
	}
);

// Only for streamableHttp
app.post("/sse", (request, reply) => {
	reply.status(405).send();
});

app.get("/sse", async (request, reply) => {
	const sessionId = (request.headers["mcp-session-id"] as string) || "";
	let transport: SSEServerTransport;
	console.log("sessionId", sessionId);
	reply.hijack();

	if (connections.has(sessionId)) {
		transport = connections.get(sessionId) as SSEServerTransport;
		console.log(`Handling POST for existing session ID: ${sessionId}`);
	} else {
		console.log("Initializing new session for SSE transport");
		const connectionId = crypto.randomUUID();
		const path = `/messages/${connectionId}`;

		transport = new SSEServerTransport(path, reply.raw);
		transport.onclose = () => {
			if (transport.sessionId) {
				connections.delete(transport.sessionId);
			}
		};

		connections.set(connectionId, transport);

		await server.connect(transport);
		return;
	}

	await transport.handlePostMessage(request.raw, reply.raw, request.body);
});

app.post("/messages/:connectionId", async (request, reply) => {
	const connectionId = (request.params as { connectionId: string })
		.connectionId;
	const transport = connections.get(connectionId);

	if (!transport) {
		reply.status(404).send({ error: "Connection not found" });
		return;
	}

	reply.hijack();
	await transport.handlePostMessage(request.raw, reply.raw, request.body);
});

app
	.listen({
		port: 4500,
	})
	.catch((err) => {
		app.log.error(err);
		process.exit(1);
	});
