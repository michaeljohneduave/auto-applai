import crypto from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import Fastify from "fastify";
import type { Browser, BrowserContext, Page } from "puppeteer";
import puppeteer from "puppeteer";
import Turndown from "turndown";
import { z } from "zod";
const turndownService = new Turndown();

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

const mcpServer = new McpServer({
	name: "puppeteer-sse-server",
	version: "0.1.0",
});

export const connections = new Map<string, SSEServerTransport>();
export const browserContexts = new Map<string, BrowserContext>();
export const pageInstances = new Map<string, Page>();

const quickContentGrabSchema = {
	url: z.string().url().describe("The URL to fetch content from."),
};

mcpServer.prompt<typeof quickContentGrabSchema>(
	"quickContentGrab",
	quickContentGrabSchema,
	({ url }) => {
		return {
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: `
You are a web scraping agent. Your goal is to quickly extract the main textual content from the provided URL.

URL: ${url}

Your workflow should be:
1. Call the 'createBrowser' tool to get a session ID. Remember this as 'sid'.
2. Call the 'navigateTo' tool with 'sid' and the URL: ${url}. This will return a page ID. Remember this as 'pid'.
3. Call the 'extractMarkdown' tool with 'pid'.
4. Call the 'closeBrowser' tool with 'sid'.
Return the extracted Markdown content as the final result.
					`,
					},
				},
			],
		};
	}
);

// --- Prompt Template 2: Click and Extract Content ---
const clickAndExtractContentSchema = {
	url: z.string().url().describe("The URL to navigate to."),
	selectorToClick: z
		.string()
		.describe("CSS selector of the element to click before extraction."),
};

mcpServer.prompt<typeof clickAndExtractContentSchema>(
	"clickAndExtractContent",
	clickAndExtractContentSchema,
	({ url, selectorToClick }) => {
		return {
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: `
You are an interactive web scraping agent. Your task is to navigate to a webpage, click a specific element, and then extract the main textual content.

URL: ${url}
Selector to click: ${selectorToClick}

Your workflow should be:
1. Call 'createBrowser' to get a session ID. Let's call it 'mySession'.
2. Call 'navigateTo' using 'mySession' and the URL '${url}'. This will give you a page ID. Let's call it 'myPage'.
3. Call 'clickElement' using 'mySession', 'myPage', and the selector '${selectorToClick}'.
4. After the click is successful, call 'extractMarkdown' using 'myPage'.
5. Call 'closeBrowser' using 'mySession'.
Return the extracted Markdown content.
					`,
					},
				},
			],
		};
	}
);

// --- Prompt Template 3: Fetch Full HTML for Analysis ---
const fetchFullHtmlSchema = {
	url: z.string().url().describe("The URL to fetch full HTML from."),
	analysisHint: z
		.string()
		.optional()
		.describe(
			"Optional: A brief description of what part of the HTML you might analyze later (e.g., 'main article', 'product table'). This is for context."
		),
};

mcpServer.prompt<typeof fetchFullHtmlSchema>(
	"fetchFullHtml",
	fetchFullHtmlSchema,
	({ url, analysisHint }) => {
		return {
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: `
You are a web scraping agent. Your task is to retrieve the complete HTML content of a webpage.
${analysisHint ? `Later, this HTML might be used to analyze: "${analysisHint}".` : ""}

URL: ${url}

Your workflow should be:
1. Call 'createBrowser' to get a session ID ('sid').
2. Call 'navigateTo' using 'sid' and URL '${url}' to get a page ID ('pid').
3. Call 'extractHtml' using 'sid', 'pid', and set the 'fullHtml' parameter to true.
4. Call 'closeBrowser' using 'sid'.
Return the full HTML content.
					`,
					},
				},
			],
		};
	}
);

// --- Prompt Template 4: Sequential Page Scrape (Same Tab) ---
const sequentialPageScrapeSchema = {
	primaryUrl: z.string().url().describe("The first URL to scrape."),
	secondaryUrl: z
		.string()
		.url()
		.describe(
			"The second URL to scrape after the first, in the same browser tab/page."
		),
};

mcpServer.prompt<typeof sequentialPageScrapeSchema>(
	"sequentialPageScrape",
	sequentialPageScrapeSchema,
	({ primaryUrl, secondaryUrl }) => {
		return {
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: `
You are a web scraping agent performing a sequential scrape of two URLs in the same browser page.

Primary URL: ${primaryUrl}
Secondary URL: ${secondaryUrl}

Your workflow should be:
1. Call 'createBrowser' to get a session ID (e.g., 's1').
2. Call 'navigateTo' using 's1' and the primary URL '${primaryUrl}'. This will return a page ID (e.g., 'p1').
3. Call 'extractMarkdown' using 'p1' to get content from the primary URL. Store this as 'primaryContent'.
4. Call 'navigateTo' again, using the same session ID 's1', the secondary URL '${secondaryUrl}', and importantly, the same page ID 'p1' to navigate in the same page.
5. Call 'extractMarkdown' using 'p1' again (as it now contains the secondary URL's content) to get content from the secondary URL. Store this as 'secondaryContent'.
6. Call 'closeBrowser' using 's1'.
Return an object containing two keys: 'primaryContent' with the markdown from the primary URL, and 'secondaryContent' with the markdown from the secondary URL.
					`,
					},
				},
			],
		};
	}
);

// --- Prompt Template 5: Summarize Page Content ---
const summarizePageContentSchema = {
	url: z.string().url().describe("The URL of the page to summarize."),
};

mcpServer.prompt<typeof summarizePageContentSchema>(
	"summarizePageContent",
	summarizePageContentSchema,
	({ url }) => {
		return {
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: `
You are a web exploration agent. Your task is to visit the given URL, extract its main textual content, and then provide a summary.

URL: ${url}

Your tool workflow should be:
1. Call 'createBrowser' to get a session ID.
2. Call 'navigateTo' using the session ID and the URL '${url}' to get a page ID.
3. Call 'extractMarkdown' using the page ID.
4. Call 'closeBrowser' using the session ID.

After completing these tool steps, analyze the extracted Markdown content and provide a concise summary of what the page is about. Your final output should be this summary.
					`,
					},
				},
			],
		};
	}
);

// --- Prompt Template 6: Check Element Exists (via HTML analysis) ---
const checkElementExistsSchema = {
	url: z.string().url().describe("The URL to check."),
	selectorToCheck: z
		.string()
		.describe("CSS selector of the element to check for."),
};

mcpServer.prompt<typeof checkElementExistsSchema>(
	"checkElementExists",
	checkElementExistsSchema,
	({ url, selectorToCheck }) => {
		return {
			messages: [
				{
					role: "user",
					content: {
						type: "text",
						text: `
You are a web inspection agent. Your task is to determine if a specific element exists on a webpage by examining its HTML.

URL: ${url}
Selector to check: ${selectorToCheck}

Your tool workflow should be:
1. Call 'createBrowser' to get a session ID ('sid').
2. Call 'navigateTo' using 'sid' and URL '${url}' to get a page ID ('pid').
3. Call 'extractHtml' using 'sid', 'pid', and set 'fullHtml' to true.
4. Call 'closeBrowser' using 'sid'.

After obtaining the HTML, analyze it to determine if an element matching the CSS selector '${selectorToCheck}' is present.
Your final response should be a short message: "Element '${selectorToCheck}' found." or "Element '${selectorToCheck}' not found.", based on your analysis of the HTML.
					`,
					},
				},
			],
		};
	}
);

// Tools
// Create Browser
// Navigate to URL
// Extract HTML
// Extract Markdown
// Click Element
// Close Browser
const createBrowserTool = mcpServer.tool(
	"createBrowser",
	"Creates a browser instance and returns its session ID.",
	async () => {
		const sessionId = crypto.randomUUID();
		const existingContext = browserContexts.get(sessionId);
		if (existingContext) {
			return {
				content: [
					{
						type: "text",
						text: "Browser instance already exists",
					},
				],
			};
		}

		const browser = await puppeteer.launch({
			headless: false,
			executablePath:
				"/Users/michaeleduave/.cache/puppeteer/chrome/mac_arm-136.0.7103.113/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
		});

		const context = await browser.createBrowserContext();
		browserContexts.set(sessionId, context);

		// navigateToTool.enable();
		// closeBrowserTool.enable();
		// createBrowserTool.disable();

		return {
			content: [
				{
					type: "text",
					text: `Browser successfully created with session ID: ${sessionId}`,
				},
			],
		};
	}
);

const navigateSchema = {
	url: z
		.string()
		.url()
		.describe("Required URL to navigate to. Must be a valid URL."),
	sessionId: z
		.string()
		.describe("Required session ID to identify the browser context."),
	pageId: z
		.string()
		.optional()
		.describe(
			"Optional page ID to navigate to a specific url using an existing page in the browser context."
		),
};

const navigateToTool = mcpServer.tool<typeof navigateSchema>(
	"navigateTo",
	"Creates a new page in the browser context and navigates to the specified URL. If a page ID is provided, it will re-use an existing page instead.",
	navigateSchema,
	async ({ url, sessionId, pageId }) => {
		try {
			const browserContext = browserContexts.get(sessionId);
			if (!browserContext) {
				return {
					content: [
						{
							type: "text",
							text: `No browser instance found for session ID: ${sessionId}`,
						},
					],
				};
			}
			const pid = pageId || crypto.randomUUID();
			const page = pageInstances.get(pid) || (await browserContext.newPage());
			pageInstances.set(pid, page);

			if (page.url() === url) {
				return {
					content: [
						{
							type: "text",
							text: `Already at ${url} in browser session ID: ${sessionId}`,
						},
					],
				};
			}

			await page.goto(url, {
				waitUntil: "networkidle0",
			});

			// Enable tools for page interaction
			// clickElementTool.enable();
			// extractHtmlTool.enable();
			// extractMarkdownTool.enable();
			// navigateToTool.disable();

			return {
				content: [
					{
						type: "text",
						text: `
							PageId: ${pid}
							Browser Session ID: ${sessionId}
							Navigated to ${url}
						`,
					},
				],
			};
		} catch (error) {
			return {
				content: [
					{
						type: "text",
						text: `Error navigating to URL: ${error instanceof Error ? error.message : "Unknown error"}`,
					},
				],
			};
		}
	}
);

// navigateToTool.disable();

const clickElementSchema = {
	selector: z.string().describe("A valid CSS selector to click on."),
	sessionId: z
		.string()
		.describe("Required session ID to identify the browser context."),
	pageId: z
		.string()
		.describe(
			"Required page ID to extract HTML from a specific page in the browser context."
		),
};

const clickElementTool = mcpServer.tool<typeof clickElementSchema>(
	"clickElement",
	"Clicks on an element in the current page of the browser instance using a CSS selector.",
	clickElementSchema,
	async ({ selector, sessionId }) => {
		const page = pageInstances.get(sessionId);
		if (!page) {
			return {
				content: [
					{
						type: "text",
						text: `No page instance found for session ID: ${sessionId}`,
					},
				],
			};
		}

		await page.click(selector);

		return {
			content: [
				{
					type: "text",
					text: `Clicked element with selector "${selector}" in browser session ID: ${sessionId}`,
				},
			],
		};
	}
);

// clickElementTool.disable();

const extractHtmlSchema = {
	sessionId: z
		.string()
		.describe("Required session ID to identify the browser context."),
	fullHtml: z
		.boolean()
		.optional()
		.default(false)
		.describe(
			"Optional flag to extract the full HTML content including the <html> tag. Defaults to false, which extracts only the body content."
		),
	pageId: z
		.string()
		.describe(
			"Required page ID to extract HTML from a specific page in the browser context."
		),
};

const extractHtmlTool = mcpServer.tool<typeof extractHtmlSchema>(
	"extractHtml",
	"Extracts the HTML content of the current page in the browser instance.",
	extractHtmlSchema,
	async ({ sessionId, fullHtml, pageId }) => {
		const page = pageInstances.get(pageId);
		if (!page) {
			return {
				content: [
					{
						type: "text",
						text: `No page instance found for page ID: ${pageId}`,
					},
				],
			};
		}

		const content = await page.content();

		if (!fullHtml) {
			// Keep the body content only
			const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/);
			if (bodyMatch?.[1]) {
				return {
					content: [
						{
							type: "text",
							text: bodyMatch[1].trim(),
						},
					],
				};
			}
		}

		return {
			content: [
				{
					type: "text",
					text: content,
				},
			],
		};
	}
);

// extractHtmlTool.disable();

const extractMarkdownSchema = {
	pageId: z
		.string()
		.describe(
			"Required page ID to extract Markdown from a specific page in the browser context."
		),
};

const extractMarkdownTool = mcpServer.tool<typeof extractMarkdownSchema>(
	"extractMarkdown",
	"Extracts the Markdown content of the current page in the browser instance. This is useful for extracting text content from web pages.",
	extractMarkdownSchema,
	async ({ pageId }) => {
		const page = pageInstances.get(pageId);
		if (!page) {
			return {
				content: [
					{
						type: "text",
						text: `No page instance found for page ID: ${pageId}`,
					},
				],
			};
		}

		const html = await page.content();
		const markdown = turndownService.turndown(html);
		return {
			content: [
				{
					type: "text",
					text: markdown,
				},
			],
		};
	}
);

// extractMarkdownTool.disable();

const closeBrowserSchema = {
	sessionId: z
		.string()
		.describe("Required session ID to identify the browser context to close."),
};

const closeBrowserTool = mcpServer.tool<typeof closeBrowserSchema>(
	"closeBrowser",
	"Closes the browser instance and removes it from the server.",
	closeBrowserSchema,
	async ({ sessionId }) => {
		const context = browserContexts.get(sessionId);
		if (!context) {
			return {
				content: [
					{
						type: "text",
						text: `No browser instance found for session ID: ${sessionId}`,
					},
				],
			};
		}

		await context.close();
		await context.browser().close();
		browserContexts.delete(sessionId);
		pageInstances.delete(sessionId);

		return {
			content: [
				{
					type: "text",
					text: `Browser instance with session ID ${sessionId} closed.`,
				},
			],
		};
	}
);

// closeBrowserTool.disable();

app.post("/sse", (_request, reply) => {
	reply.status(405).send({ error: "Method Not Allowed. Use GET for SSE." });
});

app.get("/sse", async (request, reply) => {
	const sessionId = (request.headers["mcp-session-id"] as string) || "";
	let transport: SSEServerTransport;

	if (browserContexts.size > 100) {
		app.log.warn("Too many browser instances.");
		reply.status(503).send({ error: "Service Unavailable" });
		return;
	}

	app.log.info(`SSE request body: ${JSON.stringify(request.body)}`);

	reply.hijack();

	if (connections.has(sessionId)) {
		transport = connections.get(sessionId) as SSEServerTransport;
	} else {
		const connectionId = sessionId || crypto.randomUUID();
		const postMessagesPath = `/messages/${connectionId}`;

		transport = new SSEServerTransport(postMessagesPath, reply.raw);
		transport.onclose = () => {
			app.log.info(
				`SSE: Transport closed for session ID: ${transport.sessionId}`
			);
			if (transport.sessionId) {
				connections.delete(transport.sessionId);
				const context = browserContexts.get(transport.sessionId);
				if (context) {
					context
						.close()
						.then(() => {
							app.log.info(
								`Closed browser context for session ID: ${transport.sessionId}`
							);
						})
						.catch((error) => {
							app.log.error(
								`Error closing browser context for session ID ${transport.sessionId}: ${
									error instanceof Error ? error.message : "Unknown error"
								}`
							);
						});
				}

				browserContexts.delete(transport.sessionId);
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

app.post("/messages/:connectionId", async (request, reply) => {
	const connectionId = (request.params as { connectionId: string })
		.connectionId;
	const transport = connections.get(connectionId);

	app.log.info(`SSE request body: ${JSON.stringify(request.body)}`);

	if (!transport) {
		reply.status(404).send({ error: "Connection not found" });
		return;
	}

	reply.hijack();
	await transport.handlePostMessage(request.raw, reply.raw, request.body);
});

async function cleanup() {
	for (const [sessionId, context] of browserContexts.entries()) {
		try {
			await context.close();
			await new Promise((resolve) => setTimeout(resolve, 200));
			app.log.info(`Closed browser context for session ID: ${sessionId}`);
		} catch (error) {
			app.log.error(
				`Error closing browser context for session ID ${sessionId}: ${
					error instanceof Error ? error.message : "Unknown error"
				}`
			);
		}
	}
	browserContexts.clear();
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

const PORT = 4500;
app
	.listen({ port: PORT, host: "0.0.0.0" })
	.then(() => {
		app.log.info(`Puppeteer SSE MCP Server listening on port ${PORT}`);
	})
	.catch((err) => {
		app.log.error(err);
		process.exit(1);
	});
