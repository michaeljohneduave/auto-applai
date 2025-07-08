import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { z } from "zod";
import LLM, { BIG_MODEL } from "./llm.ts";
import { jobPostingSchema } from "./schema.ts";

export async function extractJobInfo(
	html: string,
	sessionId: string,
): Promise<z.infer<typeof jobPostingSchema>> {
	console.log("Extracting Job information");
	const llm = new LLM("JobInfoExtractor", {
		model: BIG_MODEL,
		sessionId,
	});

	const response = await llm.generateStructuredOutput({
		messages: [
			{
				role: "system",
				content: `
# Identity
You are a senior job posting analyst specializing in structured data extraction.

# Goal
Extract 100% accurate job application information in structured format.

# Instructions
1. Company Information Extraction:
   - Legal company name
   - Industry sector
   - Company size
   - Location details
   - Company culture indicators

2. Job Details Analysis:
   - Position title (standardized)
   - Required skills (prioritized)
   - Experience requirements
   - Education requirements
   - Salary information if available
   - Employment type
   - Location/remote status

3. Application Form Processing:
   - Identify all input fields
   - Classify field types:
     * Personal Information
     * Professional Experience
     * Education
     * Skills/Qualifications
     * Screening Questions
   - Transform labels to clear questions
   - Note required vs optional fields
   - Identify file upload requirements

4. Field Classification Rules:
   - Personal: name, contact, demographics
   - Professional: work history, references
   - Qualifications: skills, certifications
   - Assessment: custom questions, scenarios

# Output Format
Strictly follow the jobPostingSchema structure with all required fields.

# Validation Criteria
- All required fields must be identified
- Questions must be clear and answerable
- Field types must be correctly classified
- Form structure must be complete
`,
			},
			{
				role: "user",
				content: html,
			},
		],
		temperature: 0.1,
		reasoning_effort: "high",
		response_format: zodResponseFormat(jobPostingSchema, "job-info"),
	});

	if (!response.choices[0].message.parsed) {
		throw new Error("Failed to extract job info");
	}

	return response.choices[0].message.parsed;
}
