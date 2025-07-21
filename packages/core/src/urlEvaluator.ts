import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { z } from "zod";
import LLM, { SMALL_MODEL } from "./llm.ts";
import type { jobPostingSchema } from "./schema.ts";
import { urlEvalSchema } from "./schema.ts";

export async function* urlEvaluator(
	urls: string[],
	jobContext: z.infer<typeof jobPostingSchema>,
): AsyncGenerator<z.infer<typeof urlEvalSchema>> {
	const llm = new LLM("url-evaluator", {
		model: SMALL_MODEL,
	});
	const size = 50;

	for (let i = 0; i < urls.length; i += size) {
		const chunk = urls.slice(i, i + size);
		const response = await llm.generateStructuredOutput({
			temperature: 0,
			messages: [
				{
					role: "system",
					content: `
# Identity
You are an expert url evaluator.

# Instructions
1. You are given a set of urls from the user.
2. Your goal is to evaluate each url and determine if it is relevant to the application and application's requirements
3. Rate each url from 1 to 10, 1 being the worst and 10 being the best on being relevant to the applicant's job application.
4. Other career page urls should not be relevant to the applicant's job application.
5. Take note of the company's domain name when evaluating urls.
6. Email or social media urls are not relevant.

Example:
https://www.example.com/careers/4549380005 -> 1 (Not relevant)
https://www.example.com/careers/other-hiring-postion -> 1 (Not relevant)
https://jobs.example.com/other-hiring-postion -> 1 (Not relevant)
https://jobs.example.com/51230213 -> 1 (Not relevant)
https://www.example.com/about -> 10 (Very relevant, Information about the company)
https://www.example.com/mission -> 10 (Very relevant, Mission of the company)
https://www.example.com/privacy -> 1 (Not relevant, privacy policy of the company)

Here is the context:

<job-context>
${JSON.stringify(jobContext.jobInfo)}
</job-context>
<application-form>
${JSON.stringify(jobContext.applicationForm)}
</application-form>
      `,
				},
				{
					role: "user",
					content: `
Urls:
${chunk.join("\n")}
      `,
				},
			],
			response_format: zodResponseFormat(urlEvalSchema, "url-evaluation"),
		});
		if (!response.choices[0].message.parsed) {
			throw new Error("Failed to evaluate urls");
		}

		console.log("URL Evaluation:", response.choices[0].message.parsed);

		yield response.choices[0].message.parsed;
	}
}
