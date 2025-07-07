import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { z } from "zod";
import LLM, { SMALL_MODEL } from "./llm.ts";
import { contentEvalSchema, type jobPostingSchema } from "./schema.ts";

export async function contentEvaluator(
	urlSet: { url: string; reasoning: string; content: string },
	jobContext: z.infer<typeof jobPostingSchema>,
): Promise<z.infer<typeof contentEvalSchema>> {
	const llm = new LLM("content-evaluator", {
		model: SMALL_MODEL,
	});

	const response = await llm.generateStructuredOutput({
		temperature: 0.1,
		messages: [
			{
				role: "system",
				content: `
# Identity
You are an expert content evaluator.

# Instructions
1. You are given a set of urls, evaluations and contents
2. Your goal is to evaluate the content and determine if it will help the applicant answer the job application form.
3. Rate each url from 1 to 10, 1 being the worst and 10 being the best on being relevant to the applicant's job application.

Here is the job context:
<job-context>
${JSON.stringify(jobContext)}
</job-context>
        `,
			},
			{
				role: "user",
				content: `
Url: ${urlSet.url}\nReasoning: ${urlSet.reasoning}\nContent: ${urlSet.content}
        `,
			},
		],
		response_format: zodResponseFormat(contentEvalSchema, "content-evaluation"),
	});

	if (!response.choices[0].message.parsed) {
		throw new Error("Failed to evaluate content");
	}

	return response.choices[0].message.parsed;
}
