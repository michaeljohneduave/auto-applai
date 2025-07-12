import fs from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import LLM, { GEMINI_25_FLASH_LITE } from "../llm.ts";

const readline = createInterface({
	input: stdin,
	output: stdout,
});
const llm = new LLM("test-puppeteer-mcp", {
	model: GEMINI_25_FLASH_LITE,
});

await llm.addMCPClient({
	name: "test-puppeteer-mcp",
	url: "http://localhost:3000/sse",
	version: "1",
	transport: "sse",
});

const messages: ChatCompletionMessageParam[] = [
	{
		role: "system",
		content: `
# Identity
You are a puppeteer automation expert.
# Goal
Your goal is to follow the users commands and complete the tasks.
`,
	},
];

while (true) {
	// const userInput = await readline.question("Enter a command: ");

	messages.push({
		role: "user",
		content: `
Do the following:
1. Go to https://tradablebits.bamboohr.com/careers/94
2. Analyze the html content of the page and extract the application form
3. Classify the form into a schema with required, optional, and non-required fields, input type
`,
	});

	const { completion: response } = await llm.generateOutput({
		messages,
		temperature: 0.2,
		top_p: 0.9,
	});

	console.log(response.choices[0].message.content);

	if (response.choices[0].finish_reason === "stop") {
		break;
	}

	messages.push({
		role: "assistant",
		content: response.choices[0].message.content,
	});
}

process.exit(0);
