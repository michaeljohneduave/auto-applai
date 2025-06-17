import fs from "node:fs/promises";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import { z } from "zod";
import LLM, { SMALL_MODEL } from "./llm.ts";
import type { formCompleterSchema } from "./schema.ts";

export async function formFiller({
	completedForm,
	url,
	resumePath,
}: {
	completedForm: z.infer<typeof formCompleterSchema>;
	url: string;
	resumePath: string;
}) {
	const llm = new LLM("form-filler", {
		model: SMALL_MODEL,
		maxRuns: 20,
	});

	const messages: ChatCompletionMessageParam[] = [
		{
			role: "system",
			content: `
# Identity
You are an expert in filling out job applications.

# Instructions
1. You are given a completed form and a URL
2. Your goal is to fill out the job application form with the completed form.
3. Use the tools available to fill out the form
4. If you see an upload resume field, use the "uploadResume" tool and the "uploadFile" tool to upload the resume
5. Verify the form and check for any errors present in the form and correct them.
6. Take a screenshot of the form
7. Submit the form
8. Verify that the form was submitted by rechecking the form's html content
9. Take a screenshot and close the browser
    `,
		},
		{
			role: "user",
			content: `
<completed-form>
${JSON.stringify(completedForm)}
</completed-form>

<url>
${url}
</url>
    `,
		},
	];

	await llm.addMCPClient({
		name: "puppeteer",
		version: "1",
		url: "http://localhost:3000/sse",
		transport: "sse",
	});

	await llm.addTool({
		name: "uploadResume",
		description: "Uploads a resume to the server and returns ",
		parameters: {
			fileName: z.string().describe("File name of the resume to be uploaded"),
		},
		async execute({ fileName }) {
			const formData = new FormData();
			const file = await fs.readFile(resumePath);
			const blob = new Blob([file], { type: "application/pdf" });
			formData.append("file", blob, fileName);
			formData.append("fileName", fileName);

			const response = await fetch("http://localhost:3000/upload-resume", {
				method: "POST",
				body: formData,
			});

			const data = await response.text();

			return {
				content: [
					{
						type: "text",
						text: data,
					},
				],
			};
		},
	});

	const response = await llm.generateOutput({
		messages,
		temperature: 0,
		top_p: 0.9,
	});

	console.log("%o", response.choices[0]);
}
