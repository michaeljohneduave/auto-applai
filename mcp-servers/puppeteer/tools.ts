import fs from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import {
	type CallToolResult,
	PaginatedRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { randomInteger } from "remeda";
import Turndown from "turndown";
import { z } from "zod";

const turndownService = new Turndown();

export const browsers = new Map<string, Browser>();
export const pageInstances = new Map<string, Page>();

type ToolTemplate<Schema extends z.ZodRawShape> = {
	name: string;
	description: string;
	schema: Schema;
	execute: (
		args: z.infer<z.ZodObject<Schema>>,
	) => CallToolResult | Promise<CallToolResult>;
};

function createTool<T extends z.ZodRawShape>(options: ToolTemplate<T>) {
	return {
		name: options.name,
		description: options.description,
		schema: options.schema,
		execute: options.execute,
	};
}

const sessionId = z
	.string()
	.describe("Required session ID to identify the browser context to close.");

export const createBrowser = createTool({
	name: "createBrowser",
	description: "Creates a browser instance and returns its session ID.",
	schema: {},
	execute: async () => {
		try {
			const sessionId = crypto.randomUUID();
			const browser = await puppeteer.connect({
				browserURL: "http://127.0.0.1:9222",
				defaultViewport: null,
			});

			// const browser = await puppeteer.launch({
			// 	userDataDir: "./linux-chrome-profile",
			// 	args: [
			// 		"--no-sandbox",
			// 		"--disable-setuid-sandbox",
			// 		"--disable-dev-shm-usage",
			// 		"--disable-accelerated-2d-canvas",
			// 		"--no-first-run",
			// 		"--no-zygote",
			// 	],
			// });

			browsers.set(sessionId, browser);

			// navigateToTool.enable();
			// closeBrowserTool.enable();
			// createBrowserTool.disable();

			return {
				structuredContent: {
					status: "success",
					sessionId,
				},
				content: [
					{
						type: "text",
						text: `Created browser instance with sessionId: ${sessionId}`,
					},
				],
			};
		} catch (e) {
			console.error("create browser error");
			console.error(e);
			return {
				structuredContent: {
					status: "error",
					error: "Failed to create browser instance",
				},
				content: [
					{
						type: "text",
						text: "Failed to create browser instance",
					},
				],
			};
		}
	},
});

export const navigateTo = createTool({
	name: "navigateTo",
	description:
		"Creates a new page in the browser context and navigates to the specified URL. If a page ID is provided, it will re-use an existing page instead.",
	schema: {
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
				"Optional page ID to navigate to a specific url using an existing page in the browser context.",
			),
	},
	async execute({ url, sessionId, pageId }) {
		try {
			const browser = browsers.get(sessionId);
			if (!browser) {
				return {
					content: [
						{
							type: "text",
							text: `No browser instance found for session ID: ${sessionId}`,
						},
					],
				};
			}
			const page = pageInstances.get(sessionId) || (await browser.newPage());
			pageInstances.set(sessionId, page);

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

			await Promise.race([
				page.goto(url, {
					waitUntil: "networkidle0",
				}),
				setTimeout(10_000),
			]);

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
Browser Session ID: ${sessionId}
Page ID: ${pageId}
Navigated to ${url}
              `,
					},
				],
			};
		} catch (error) {
			console.error(error);
			return {
				content: [
					{
						type: "text",
						text: `Error navigating to URL: ${error instanceof Error ? error.message : "Unknown error"}`,
					},
				],
			};
		}
	},
});

export const clickElement = createTool({
	name: "clickElement",
	description:
		"Clicks on an element in the current page of the browser instance using a CSS selector.",
	schema: {
		selector: z.string().describe("A valid CSS selector to click on."),
		sessionId: z
			.string()
			.describe("Required session ID to identify the browser context."),
		// pageId: z
		// 	.string()
		// 	.describe(
		// 		"Required page ID to extract HTML from a specific page in the browser context."
		// 	),
	},
	async execute({ selector, sessionId }) {
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

		await Promise.all([
			page.click(selector),
			Promise.race([
				page.waitForNavigation({
					waitUntil: "networkidle0",
				}),
				setTimeout(10_000),
			]),
		]);

		return {
			content: [
				{
					type: "text",
					text: `Clicked element with selector "${selector}" in browser session ID: ${sessionId}`,
				},
			],
		};
	},
});

export const extractHtml = createTool({
	name: "extractHtml",
	description:
		"Extracts the HTML content of the current page in the browser instance. Use this tool if you plan to interact with the web page",
	schema: {
		sessionId: z
			.string()
			.describe("Required session ID to identify the browser context."),
		leanMode: z
			.boolean()
			.describe(
				"Only extract the body of the html, reducing the payload and removing unnecessary text. Use this first",
			),
		// fullHtml: z
		// 	.boolean()
		// 	.optional()
		// 	.default(false)
		// 	.describe(
		// 		"Optional flag to extract the full HTML content including the <html> tag. Defaults to false, which extracts only the body content."
		// 	),
		// pageId: z
		// 	.string()
		// 	.describe(
		// 		"Required page ID to extract HTML from a specific page in the browser context."
		// 	),
	},
	async execute({ sessionId, leanMode }) {
		const page = pageInstances.get(sessionId);
		if (!page) {
			return {
				content: [
					{
						type: "text",
						text: `No page instance found for page ID: ${sessionId}`,
					},
				],
			};
		}

		const content = await page.content();

		if (leanMode) {
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
	},
});

export const extractMarkdown = createTool({
	name: "extractMarkdown",
	description:
		"Extracts the Markdown content of the current page in the browser instance. Use this if you need the text content of a web page.",
	schema: {
		sessionId,
		// pageId: z
		// 	.string()
		// 	.describe(
		// 		"Required page ID to extract Markdown from a specific page in the browser context."
		// 	),
	},
	async execute({ sessionId }) {
		const page = pageInstances.get(sessionId);
		if (!page) {
			return {
				content: [
					{
						type: "text",
						text: `No page instance found for page ID: ${sessionId}`,
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
	},
});

export const inputText = createTool({
	name: "inputText",
	description: "Inputs text into an editable html element",
	schema: {
		sessionId: z
			.string()
			.describe(
				"Required session ID to identify the browser context to close.",
			),
		selector: z.string().describe("A valid CSS selector to be inputted on."),
		text: z.string().describe("The text to be inputted into the element"),
	},
	async execute({ sessionId, selector, text }) {
		const page = pageInstances.get(sessionId);

		if (!page) {
			return {
				content: [
					{
						type: "text",
						text: `No page instance found for page ID: ${sessionId}`,
					},
				],
			};
		}

		await page.type(selector, text);

		const value = await page.$eval(selector, (el) => el.value);

		if (text !== value) {
			return {
				content: [
					{
						type: "text",
						text: "Successfully inputted the text on the html element but value in the html element didn't match.",
					},
				],
			};
		}

		return {
			content: [
				{
					type: "text",
					text: "Successfully inputted the text on the html element",
				},
			],
		};
	},
});

export const getInputValue = createTool({
	name: "getInputValue",
	description:
		"Get the html input's text value. Useful for verifying the inputted text to an html element.",
	schema: {
		sessionId,
		selector: z.string().describe("A valid CSS selector of an element."),
	},
	async execute(args) {
		const page = pageInstances.get(args.sessionId);
		if (!page) {
			return {
				content: [
					{
						type: "text",
						text: `No page instance found for page ID: ${sessionId}`,
					},
				],
			};
		}

		return {
			content: [
				{
					type: "text",
					text: await page.$eval(args.selector, (node) => node.value),
				},
			],
		};
	},
});

export const takeScreenshot = createTool({
	name: "takeScreenshot",
	description: "Takes a screenshot of the page and returns the url",
	schema: {
		sessionId,
	},
	async execute({ sessionId }) {
		const page = pageInstances.get(sessionId);
		if (!page) {
			return {
				content: [
					{
						type: "text",
						text: `No page instance found for page ID: ${sessionId}`,
					},
				],
			};
		}

		const ss = await page.screenshot({
			fullPage: true,
			encoding: "base64",
		});

		const fp = `./assets/${sessionId}.png`;
		await fs.writeFile(fp, Buffer.from(ss, "base64"));

		return {
			content: [
				{
					type: "text",
					text: fp,
				},
			],
		};
	},
});

export const uploadFile = createTool({
	name: "uploadFile",
	description: "Uploads a file into a file form field",
	schema: {
		sessionId,
		filePath: z.string().describe("The path of the file to upload"),
		selector: z.string().describe("A valid CSS selector of an input element."),
	},
	async execute({ sessionId, filePath, selector }) {
		const page = pageInstances.get(sessionId);

		if (!page) {
			return {
				content: [
					{
						type: "text",
						text: `No page instance found for page ID: ${sessionId}`,
					},
				],
			};
		}

		const fileElement = await page.waitForSelector(selector);

		if (!fileElement) {
			return {
				content: [
					{
						type: "text",
						text: `No file element found for selector: ${selector}`,
					},
				],
			};
		}

		await fileElement.uploadFile(filePath);

		return {
			content: [
				{
					type: "text",
					text: `Successfully uploaded file ${filePath} to ${selector}`,
				},
			],
		};
	},
});

export const closeBrowser = createTool({
	name: "closeBrowser",
	description: "Closes the browser instance and removes it from the server.",
	schema: {
		sessionId: z
			.string()
			.describe(
				"Required session ID to identify the browser context to close.",
			),
	},
	async execute({ sessionId }) {
		const browser = browsers.get(sessionId);
		if (!browser) {
			return {
				content: [
					{
						type: "text",
						text: `No browser instance found for session ID: ${sessionId}`,
					},
				],
			};
		}

		const page = pageInstances.get(sessionId);

		if (page) {
			await page.close();
		}

		// await browser.close();

		browsers.delete(sessionId);
		pageInstances.delete(sessionId);

		return {
			content: [
				{
					type: "text",
					text: `Browser instance with session ID ${sessionId} closed.`,
				},
			],
		};
	},
});

const tools = [
	createBrowser,
	navigateTo,
	clickElement,
	inputText,
	getInputValue,
	extractHtml,
	extractMarkdown,
	takeScreenshot,
	uploadFile,
	closeBrowser,
];

export default tools;
