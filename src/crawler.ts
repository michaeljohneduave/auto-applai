import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import type { z } from "zod";
import LLM, { GEMINI_25_FLASH, GEMINI_20_FLASH } from "./llm.ts";
import { urlExtractorSchema } from "./schema.ts";

export async function llmFormCrawler(pageUrl: string, sessionId: string) {
	const llm = new LLM("agentic-crawler", {
		model: GEMINI_20_FLASH,
		maxRuns: 10,
		sessionId,
	});

	await llm.addMCPClient({
		name: "puppeteer",
		version: "1",
		url: `${process.env.PUPPETEER_SERVICE_URL}/sse`,
		transport: "sse",
	});

	const messages: ChatCompletionMessageParam[] = [
		{
			role: "system",
			content: `
# Identity
You are an expert web crawler specializing in job application form detection.

# Goal
Find the primary job application form URL with 100% accuracy.

# Instructions
1. Given a job posting URL, analyze the page HTML
2. Identify application forms using these criteria:
   - Contains input fields for job applications
   - Has submit/apply button
   - Related to job application process
3. If no form found on main page:
   - Explore links containing keywords: apply, application, career, job
   - Maximum exploration depth: 2 levels
   - Forms can also be embedded in iframes or iframes themselves, look for links inside iframes
   - Skip external domains except approved job platforms
4. Return exactly one URL in this format:
   <form-url>https://example.com/apply</form-url>

# Output Format
Single URL wrapped in form-url tags. No other text.
`,
		},
		{
			role: "user",
			content: `
<url>
${pageUrl}
</url>
      `,
		},
	];

	const { completion: response } = await llm.generateOutput({
		messages,
		temperature: 0,
		top_p: 0.9,
		// response_format: zodResponseFormat(agenticCrawlerSchema, "agentic-crawler"),
	});

	if (!response.choices[0].message.content) {
		console.log("%o", response.choices[0]);
		throw new Error("Failed to extract relevant html");
	}

	const llm2 = new LLM("url-extractor", {
		model: GEMINI_25_FLASH,
		sessionId,
	});

	const structuredResponse = await llm2.generateStructuredOutput({
		messages: [
			{
				role: "system",
				content:
					"You are a strict URL extractor. Given a piece of text, extract the job posting application url.",
			},
			{
				role: "user",
				content: response.choices[0].message.content,
			},
		],
		temperature: 0,
		response_format: zodResponseFormat(urlExtractorSchema, "url-extractor"),
	});

	if (!structuredResponse.choices[0].message.parsed) {
		throw new Error("Failed to extract URL");
	}

	const parsed = structuredResponse.choices[0].message.parsed as z.infer<
		typeof urlExtractorSchema
	>;

	return parsed.url;
}
