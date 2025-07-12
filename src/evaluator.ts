import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { z } from "zod";
import LLM, { GEMINI_25_FLASH } from "./llm.ts";
import {
	evaluatorSchema,
	type formCompleterSchema,
	type jobPostingSchema,
	type userClarifications,
} from "./schema.ts";

export async function evaluator(
	applicationDetails: z.infer<typeof jobPostingSchema>,
	completedForm: z.infer<typeof formCompleterSchema>,
	userAnswers: z.infer<typeof userClarifications>,
	resume: string,
	context: string[],
	sessionId: string,
): Promise<z.infer<typeof evaluatorSchema>> {
	const llm = new LLM("evaluator", {
		model: GEMINI_25_FLASH,
		sessionId,
	});

	const response = await llm.generateStructuredOutput({
		messages: [
			{
				role: "system",
				content: `
# Identity
You are an expert in evaluating the sense, correctness and relevance of an answer.

# Instructions
1. You will be given an application form, the applicant's resume, and some context about the company and the role.
2. Evaluate the answers based on the resume and context.
3. The goal is to evaluate the answers and provide feedback on how to improve them.
4. Give a grade of 1 for questions that weren't answered properly (This may be because of missing information in the resume or context)
5. Avoid glazing the answer, provide specific and strict feedback on what needs to be improved.

Examples:
Q: What is your LinkedIn profile URL? 
A: long text of other unrelated information and not answering the question
Grade: 1

<application-details>
${JSON.stringify(applicationDetails)}
</application-details>

<resume>
${resume}
</resume>

<company-context>
${context.join("\n")}
</company-context>
      `,
			},
			{
				role: "user",
				content: `
<completed-form>
${JSON.stringify(completedForm)}
</completed-form>
<personal-answers>
${JSON.stringify(userAnswers)}
</personal-answers>

      `,
			},
		],
		temperature: 0.1,
		top_p: 0.9,
		response_format: zodResponseFormat(evaluatorSchema, "evaluator"),
	});

	if (!response.choices[0].message.parsed) {
		throw new Error("Failed to evaluate answers");
	}

	console.log("Evaluations");
	console.log("%o", response.choices[0].message.parsed);

	return response.choices[0].message.parsed;
}
