import fs from "node:fs/promises";
import { setTimeout } from "node:timers/promises";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import * as cheerio from "cheerio";
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

			browsers.set(sessionId, browser);
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

export const extractHtml = createTool({
	name: "extractHtml",
	description: `
Extracts the HTML content of the current page in the browser instance.
Use this tool if you plan to interact with the web page.
Optionally provide a CSS selector to extract the HTML from a specific element.
`,
	schema: {
		sessionId: z
			.string()
			.describe("Required session ID to identify the browser context."),
		selector: z
			.string()
			.optional()
			.describe("A valid CSS selector to extract HTML from."),
	},
	async execute({ sessionId, selector }) {
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
		const $ = cheerio.load(content);

		if (selector) {
			const $element = $(selector);
			if ($element.length === 0) {
				return {
					content: [
						{
							type: "text",
							text: `No element found with selector "${selector}"`,
						},
					],
				};
			}

			return {
				content: [
					{
						type: "text",
						text: $element.html() || "",
					},
				],
			};
		}

		// Keep the body content only
		const body = $("body").html();

		return {
			content: [
				{
					type: "text",
					text: body || "",
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

export const clickElement = createTool({
	name: "clickElement",
	description:
		"Clicks on an element in the current page of the browser instance using a CSS selector or xpath selector or fullXPathSelector.",
	schema: {
		selector: z
			.string()
			.optional()
			.describe("A valid CSS selector to click on."),
		xPathSelector: z
			.string()
			.optional()
			.describe("A valid relative xpath selector to click on."),
		fullXPathSelector: z
			.string()
			.optional()
			.describe("A valid full xpath selector to click on."),
		sessionId: z
			.string()
			.describe("Required session ID to identify the browser context."),
		coordinates: z
			.object({
				x: z.number().describe("X coordinate of the click."),
				y: z.number().describe("Y coordinate of the click."),
			})
			.optional()
			.describe(
				"Optional coordinates to click on. Use this if selector fails to click.",
			),
	},
	async execute({ selector, xPathSelector, sessionId, coordinates }) {
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

		if (coordinates) {
			await page.mouse.click(coordinates.x, coordinates.y, {
				delay: randomInteger(200, 500),
			});
		} else if (selector) {
			await Promise.all([
				page.locator(selector).click(),
				Promise.race([
					page.waitForNavigation({
						waitUntil: "networkidle0",
					}),
					setTimeout(10_000),
				]),
			]);
		} else if (xPathSelector) {
			await Promise.all([
				page.locator(`::-p-xpath${xPathSelector}`).click(),
				Promise.race([
					page.waitForNavigation({
						waitUntil: "networkidle0",
					}),
					setTimeout(10_000),
				]),
			]);
		} else {
			return {
				content: [
					{
						type: "text",
						text: "No selector or xPathSelector provided.",
					},
				],
			};
		}

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

export const inputText = createTool({
	name: "inputText",
	description:
		"Inputs text into an editable html element, use either selector or xPathSelector or fullXPathSelector",
	schema: {
		sessionId: z
			.string()
			.describe(
				"Required session ID to identify the browser context to close.",
			),
		xPathSelector: z
			.string()
			.optional()
			.describe("A valid relative xpath selector to click on."),
		fullXPathSelector: z
			.string()
			.optional()
			.describe("A valid full xpath selector to click on."),
		selector: z
			.string()
			.optional()
			.describe("A valid CSS selector to be inputted on."),
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

		await page
			.locator(selector)
			.setEnsureElementIsInTheViewport(true)
			.fill(text);

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
		"Get the html input's text value. Useful for verifying the inputted text to an html element. Use either selector or xPathSelector or fullXPathSelector",
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

export const getElementCoordinates = createTool({
	name: "getElementCoordinates",
	description: "Get the coordinates of an element",
	schema: {
		sessionId,
		selector: z.string().describe("A valid CSS selector of an element."),
	},
	async execute({ sessionId, selector }) {
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

		const element = await page.$(selector);

		if (!element) {
			return {
				content: [
					{
						type: "text",
						text: `No element found with selector "${selector}"`,
					},
				],
			};
		}

		const boundingBox = await element.boundingBox();
		if (!boundingBox) {
			return {
				content: [
					{
						type: "text",
						text: `Could not get the coordinates for "${selector}"`,
					},
				],
			};
		}

		const x =
			boundingBox.x + randomInteger(boundingBox.width / 2, boundingBox.width);
		const y =
			boundingBox.y + randomInteger(boundingBox.height / 2, boundingBox.height);

		return {
			content: [
				{
					type: "text",
					text: `Coordinates: x: ${x}, y: ${y}`,
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
	description:
		"Closes the browser instance and removes it from the server. Always call this tool to wrap up the session.",
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

		await browser.close();
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
	getElementCoordinates,
	inputText,
	getInputValue,
	extractHtml,
	extractMarkdown,
	takeScreenshot,
	uploadFile,
	closeBrowser,
];

export default tools;
