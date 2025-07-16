import fs from "node:fs/promises";
import * as cheerio from "cheerio";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import Turndown from "turndown";
import { z } from "zod";
import LLM, { GEMINI_25_FLASH } from "./llm.ts";
import { cleanedHtmlSchema } from "./schema.ts";
const turndownService = new Turndown();

function isSocialMediaOrEmail(url: string): boolean {
	const socialMediaOrEmail = [
		"facebook.com",
		"twitter.com",
		"linkedin.com",
		"instagram.com",
		"pinterest.com",
		"mailto:",
		"github.com",
		"calendly.com",
		"discord.gg",
		"discord.com",
		"glassdoor.com",
		"angel.co",
		"youtube.com",
		"x.com",
	];
	return socialMediaOrEmail.some((ext) => url.includes(ext));
}

export async function htmlCrawler(pageUrl: string) {
	console.log("Crawling using regular puppeteer", pageUrl);
	const url = new URL(`${process.env.PUPPETEER_SERVICE_URL}/scrape`);
	url.searchParams.set("url", pageUrl);
	url.searchParams.set("format", "html");
	url.searchParams.set("screenshot", "true");

	if (!z.string().url().safeParse(pageUrl).success) {
		console.log("URL", pageUrl);
		throw new Error("Invalid url");
	}

	const response = await fetch(url.toString());
	const { data, screenshot } = await response.json();

	if (screenshot) {
		await fs.writeFile(
			`assets/${new URL(pageUrl).hostname}.png`,
			Buffer.from(screenshot, "base64"),
		);
	} else {
		console.warn("No screenshot found for ", pageUrl);
	}

	const $ = cheerio.load(data);

	const links = $("a")
		.map((_, el) => $(el).attr("href"))
		.toArray();
	const uniqLinks = new Set(links);
	const validLinks = new Set();

	for (const [value] of uniqLinks.entries()) {
		let url: URL;
		try {
			if (value.startsWith("/")) {
				const u = new URL(pageUrl);
				url = new URL(u.origin + value);
			} else if (value.startsWith("#")) {
				url = new URL(pageUrl);
			} else {
				url = new URL(value);
			}

			url = new URL(url.origin + url.pathname);

			if (!isSocialMediaOrEmail(url.toString())) {
				validLinks.add(url.toString());
			}
		} catch (e) {
			console.log(e.message, value);
		}
	}

	return {
		validLinks: Array.from(validLinks) as string[],
		html: $("body").html() || "",
		screenshot: screenshot as string,
	};
}

export async function htmlToMarkdown(
	html: string,
	url: string,
	options?: {
		removeLinks?: boolean;
		removeDataAttr?: boolean;
	},
) {
	const llm = new LLM("html-cleaner", {
		maxRuns: 1,
		model: GEMINI_25_FLASH,
	});
	const $ = cheerio.load(html);
	if (options?.removeLinks) {
		$("a").remove();
	}

	if (options?.removeDataAttr) {
		$("*").each((_index, element) => {
			const $element = $(element);
			const attributes = $element.attr(); // Get all attributes as an object

			if (attributes) {
				for (const attrName in attributes) {
					if (Object.prototype.hasOwnProperty.call(attributes, attrName)) {
						// Check if it's a data-* attribute
						if (attrName.startsWith("data-")) {
							const attrValue = attributes[attrName];

							// Check if the attribute value is a string and its length exceeds 100 characters
							if (typeof attrValue === "string" && attrValue.length > 100) {
								$element.removeAttr(attrName);
							}
						}
					}
				}
			}
		});
	}

	$("script").remove();
	$("style").remove();
	$("link").remove();
	$("meta").remove();

	llm.setMessages([
		{
			role: "system",
			content: `
# Identity
You are an expert HTML cleaner

# Instructions
1. User will give you an html content and you will clean and remove any css classes and styling that is unrelated to the main content
2. The goal is to produce a clean html file to be converted markdown but you're only mission is to clean the html.
        `,
		},
		{
			role: "user",
			content: $("body").html() || "",
		},
	]);

	const response = await llm.generateStructuredOutput({
		temperature: 0,
		top_p: 0.9,
		reasoning_effort: "low",
		response_format: zodResponseFormat(cleanedHtmlSchema, "html-schema"),
	});

	if (!response.choices[0].message.parsed) {
		throw new Error("Error cleaning html content");
	}

	const parsed = response.choices[0].message.parsed as z.infer<
		typeof cleanedHtmlSchema
	>;
	return turndownService.turndown(parsed.cleanHtml || "");
}

export async function handleCaptcha(url: string) {
	const llm = new LLM("captcha-handler", {
		model: GEMINI_25_FLASH,
		maxRuns: 10,
	});

	llm.setMessages([
		{
			role: "system",
			content: `
SYSTEM:
You are an autonomous web-scraping agent. The URL given to you will be behind one of the following.
- Cloudflare "Verify you are human" captcha

You task will be divided into categories from above.


For Cloudflare:
1. Create a browser instance
2. Go to URL
3. Take a screenshot and analyze the image
4. Use clickElement using the coordinates of the element to click the box
5. Use the extractHTML to see the actual job application behind the cloudflare captcha.

Lastly after the final extractHtml call, return the html content.
		`,
		},
		{
			role: "user",
			content: url,
		},
	]);

	await llm.addMCPClient({
		name: "puppeteer",
		version: "1",
		url: `${process.env.PUPPETEER_SERVICE_URL}/sse`,
		transport: "sse",
	});

	const response = await llm.generateOutput({
		temperature: 0.2,
		top_p: 0.9,
	});

	if (!response.completion.choices[0].message.content) {
		throw new Error("Captcha handler failed: HTML content not found");
	}

	return response.completion.choices[0].message.content;
}

export function isoFileSuffixUTC(
	date = new Date(),
	options?: { isLocal?: boolean },
) {
	let d = date;
	if (options?.isLocal) {
		// Add timezone offset for local time
		const offset = date.getTimezoneOffset() * 60 * 1000; // Convert minutes to milliseconds
		d = new Date(date.getTime() - offset);
	}
	// Format the date to ISO string and replace characters for file naming
	// "2025-07-15T16:05:15.000Z"
	return d
		.toISOString()
		.slice(0, 19) // "2025-07-15T16:05:15"
		.replace(/:/g, "-") // "2025-07-15T16-05-15"
		.replace("T", "_"); // "2025-07-15_16-05-15"
}
