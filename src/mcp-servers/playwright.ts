import crypto from "node:crypto";
import http from "node:http";
import { URL } from "node:url"; // For parsing URL and query parameters if needed
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { type Connection, createConnection } from "@playwright/mcp";

const PORT = 3000;

// Store active connections: Map<connectionId, { playwrightConnection: Connection, sseTransport: SSEServerTransport }>
const activeConnections = new Map();

const server = http.createServer(async (req, res) => {
	const requestUrl = new URL(req.url!, `http://${req.headers.host}`);
	const { pathname } = requestUrl;

	// Basic CORS headers - adjust for your needs
	res.setHeader("Access-Control-Allow-Origin", "*");
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
	res.setHeader(
		"Access-Control-Allow-Headers",
		"Content-Type, X-Requested-With"
	);

	if (req.method === "OPTIONS") {
		res.writeHead(204); // No Content for preflight
		res.end();
		return;
	}

	console.log(`Request: ${req.method} ${pathname}`);

	// 1. SSE Endpoint to establish the connection
	if (req.method === "GET" && pathname === "/sse") {
		const connectionId = crypto.randomUUID();
		const messagePath = `/mcp-messages/${connectionId}`; // Client will POST to this

		console.log(`SSE connection request received. ID: ${connectionId}`);

		// SSEServerTransport will set its own headers (Content-Type: text/event-stream, etc.)
		// Do NOT call res.writeHead() here before the transport is connected.

		let playwrightConnection: Connection;
		let sseTransport: SSEServerTransport;

		try {
			playwrightConnection = await createConnection({
				browser: {
					launchOptions: {
						headless: false, // Or true for production
					},
				},
			});

			// The SSEServerTransport constructor:
			// constructor(postPath: string, response: ServerResponse, request?: IncomingMessage)
			// It will use 'res' to send SSE events and set headers.
			sseTransport = new SSEServerTransport(messagePath, res);

			activeConnections.set(connectionId, {
				playwrightConnection,
				sseTransport,
			});
			console.log(
				`Playwright connection and SSE transport instance created for ${connectionId}`,
				new Date().toISOString()
			);

			// This is where SSEServerTransport will likely write its headers.
			await playwrightConnection.connect(sseTransport);
			console.log(`MCP connection established for ${connectionId}`);

			// NOW that the transport is connected and headers are sent by it,
			// send your custom initial event.
			// Check the SDK for the preferred method to send events.
			if (sseTransport.sendEvent) {
				console.log("Sending mcp-config event to client:", connectionId);
				sseTransport.sendEvent("mcp-config", { messagePath, connectionId });
			} else {
				// Fallback if sendEvent isn't available (check SDK for the correct way)
				console.log(
					"Fallback sending mcp-config event to client:",
					connectionId
				);
				res.write(
					`event: mcp-config\ndata: ${JSON.stringify({
						messagePath,
						connectionId,
					})}\n\n`
				);
			}
			console.log(`Sent mcp-config to client ${connectionId}`);

			// Handle client disconnect
			req.on("close", async () => {
				console.log(
					`SSE connection closed by client: ${connectionId}. Cleaning up.`
				);
				if (playwrightConnection) {
					try {
						await playwrightConnection.close();
						console.log(`Playwright connection closed for ${connectionId}`);
					} catch (closeError) {
						console.error(
							`Error closing Playwright connection for ${connectionId}:`,
							closeError
						);
					}
				}
				activeConnections.delete(connectionId);
				console.log(`Cleaned up resources for ${connectionId}`);
			});

			// Note: For SSE, the response is kept open. We don't call res.end() here.
		} catch (error) {
			console.error(
				`Error setting up SSE or Playwright for ${connectionId}:`,
				error
			);
			if (playwrightConnection) {
				await playwrightConnection
					.close()
					.catch((e) =>
						console.error(
							`Error during cleanup for ${connectionId} after initial error:`,
							e
						)
					);
			}
			activeConnections.delete(connectionId);

			if (!res.headersSent && !res.writableEnded) {
				res.writeHead(500, { "Content-Type": "application/json" });
				res.end(
					JSON.stringify({ error: "Failed to establish MCP connection" })
				);
			} else if (res.writableEnded === false) {
				res.end(); // Try to close the stream if headers were sent but an error occurred
			}
		}
	}
	// 2. Dynamic POST Endpoint for MCP messages
	else if (req.method === "POST" && pathname.startsWith("/mcp-messages/")) {
		const parts = pathname.split("/");
		const connectionId = parts[parts.length - 1]; // Get the last part as ID

		const connectionData = activeConnections.get(connectionId);

		if (connectionData && connectionData.sseTransport) {
			console.log(
				`POST message received for connection ${connectionId}`
				// req.body is not automatically parsed in 'http' module.
				// SSEServerTransport.handlePostMessage should handle the raw request stream.
			);
			// The SSEServerTransport's handlePostMessage expects raw Node.js req/res
			// It will handle reading the body and sending the response.
			connectionData.sseTransport.handlePostMessage(req, res);
		} else {
			console.warn(
				`POST message received for unknown or inactive connection ID: ${connectionId}`
			);
			res.writeHead(404, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ error: "Connection not found or not active" }));
		}
	}
	// 3. Handle other routes
	else {
		res.writeHead(404, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ error: "Not Found" }));
	}
});

server.listen(PORT, () => {
	console.log(`Simple HTTP server for MCP running on http://localhost:${PORT}`);
	console.log(`Connect to /sse to initiate an MCP session.`);
	console.log(
		`Client will receive an 'mcp-config' event with its unique messagePath for POSTing.`
	);
});

process.on("SIGINT", () => {
	console.log("Server shutting down...");
	server.close(() => {
		console.log("HTTP server closed.");
		// Optionally, close all active playwright connections
		activeConnections.forEach(async ({ playwrightConnection }, id) => {
			try {
				if (playwrightConnection) await playwrightConnection.close();
				console.log(`Closed Playwright for ${id} on shutdown.`);
			} catch (e) {
				console.error(`Error closing Playwright for ${id} on shutdown:`, e);
			}
		});
		process.exit(0);
	});
});
