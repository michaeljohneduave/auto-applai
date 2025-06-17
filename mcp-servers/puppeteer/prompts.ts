import type { GetPromptResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

type PromptTemplate<Schema extends z.ZodRawShape> = {
	name: string;
	description?: string;
	schema: Schema;
	execute: (args: z.infer<z.ZodObject<Schema>>) => GetPromptResult;
};

function createPromptTemplate<T extends z.ZodRawShape>(
	options: PromptTemplate<T>
) {
	return {
		name: options.name,
		description: options.description,
		schema: options.schema,
		execute: options.execute,
	};
}

export const quickContentGrab = createPromptTemplate({
	name: "Quick Content Grab",
	description: "Quickly extract main content from a webpage.",
	schema: {
		url: z.string().url().describe("The URL of the page to grab content from"),
	},
	execute: ({ url }) => {
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
	},
});

export const clickAndExtractContent = createPromptTemplate({
	name: "Click and Extract Content",
	schema: {
		url: z.string().url().describe("The URL to navigate to."),
		selectorToClick: z
			.string()
			.describe("CSS selector of the element to click before extraction."),
	},
	execute({ url, selectorToClick }) {
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
	},
});

export const fetchFullHtml = createPromptTemplate({
	name: "Fetch Full HTML",
	schema: {
		url: z.string().url().describe("The URL to fetch full HTML from."),
		analysisHint: z
			.string()
			.optional()
			.describe(
				"Optional: A brief description of what part of the HTML you might analyze later (e.g., 'main article', 'product table'). This is for context."
			),
	},
	execute({ url, analysisHint }) {
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
	},
});

export const summarizePageContent = createPromptTemplate({
	name: "Summarize Page Content",
	schema: {
		url: z.string().url().describe("The URL of the page to summarize."),
	},
	execute({ url }) {
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
	},
});

export const checkElementExists = createPromptTemplate({
	name: "Check Element Exists",
	schema: {
		url: z.string().url().describe("The URL to check."),
		selectorToCheck: z
			.string()
			.describe("CSS selector of the element to check for."),
	},
	execute({ url, selectorToCheck }) {
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
	},
});
