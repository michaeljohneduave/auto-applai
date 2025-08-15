import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import type { z } from "zod";
import LLM, { GEMINI_25_FLASH } from "./llm.ts";
import { jobPostingSchema } from "./schema.ts";

export async function extractInfo(
	html: string,
	sessionId: string,
): Promise<z.infer<typeof jobPostingSchema>> {
	const llm = new LLM("extract-info", {
		model: GEMINI_25_FLASH,
		sessionId,
	});

	const messages: ChatCompletionMessageParam[] = [
		{
			role: "system",
			content: `
# Identity
You are a senior job posting analyst specializing in structured data extraction.

# Goal
Given an image or html, extract 100% accurate job application information in structured format.

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
- Return a single JSON object that validates against 'jobPostingSchema'.
- Do not include any extra text, explanations, or markdown/code fences.

# Extraction & Anti-hallucination Rules
- Only include information you can confidently extract from the provided content.
- When a schema field is required but not explicitly present in the source:
  - Arrays: return an empty array [].
  - Enums with 'unknown'/'other' options: use those conservative defaults as indicated by the schema descriptions.
  - Strings: return an empty string "".
  - Booleans: prefer conservative defaults (e.g., false) unless clearly indicated by the source.
  - Numeric values: if not clearly extractable and the schema expects a number, prefer omitting the field only when it is optional; otherwise do not fabricate.
- Prefer verbatim copying of the source text over paraphrasing when uncertain.
- Do not fabricate specific values.

# Validation
- Your output must validate against 'jobPostingSchema'.
`,
		},
		{
			role: "user",
			content: html,
		},
	];

	llm.setMessages(messages);

	const response = await llm.generateStructuredOutput({
		temperature: 0.1,
		reasoning_effort: "medium",
		response_format: zodResponseFormat(jobPostingSchema, "posting-info"),
	});

	if (!response.choices[0].message.parsed) {
		throw new Error("Failed to extract job info");
	}

	return response.choices[0].message.parsed;
}

export async function extractJobInfo(html: string, sessionId: string) {
	const llm = new LLM("extract-job-info", {
		model: GEMINI_25_FLASH,
		sessionId,
	});

	const messages: ChatCompletionMessageParam[] = [
		{
			role: "system",
			content: `
# Identity
You are a senior job posting analyst specializing in structured data extraction.

# Goal
Given an image or html, extract 100% accurate job information in structured format.

# Output Format
- Return a single JSON object that validates against the 'job-info' schema (jobPostingSchema.shape.jobInfo).
- Do not include any extra text, explanations, or markdown/code fences.

# Extraction & Anti-hallucination Rules
- Only include information you can confidently extract from the provided content.
- Arrays: return [] when no items are found.
- Enums with 'unknown'/'other' options: use those conservative defaults when not clearly indicated.
- Strings: use empty string "" when applicable; otherwise omit optional fields.
- Do not fabricate numeric values; omit optional numeric fields if not extractable.
- Prefer verbatim copying of source snippets when uncertain.

# Validation
- Your output must validate against jobPostingSchema.shape.jobInfo.
`,
		},
		{
			role: "user",
			content: html,
		},
	];

	llm.setMessages(messages);

	const response = await llm.generateStructuredOutput({
		temperature: 0.1,
		reasoning_effort: "high",
		response_format: zodResponseFormat(
			jobPostingSchema.shape.jobInfo,
			"job-info",
		),
	});

	if (!response.choices[0].message.parsed) {
		throw new Error("Failed to extract job info");
	}

	return response.choices[0].message.parsed;
}

export async function extractApplicationForm(html: string, sessionId: string) {
	const llm = new LLM("extract-application-form", {
		model: GEMINI_25_FLASH,
		sessionId,
	});

	const messages: ChatCompletionMessageParam[] = [
		{
			role: "system",
			content: `
# Identity
You are a senior job posting analyst specializing in structured data extraction.

# Goal
Given an image or html, extract 100% accurate job application form information in structured format.

# Output Format
- Return a single JSON array that validates against 'application-form' (jobPostingSchema.shape.applicationForm).
- Do not include any extra text, explanations, or markdown/code fences.

# Extraction & Anti-hallucination Rules
- Only include fields present in the source; do not invent questions or options.
- Arrays: return [] when no items are found.
- For field properties (e.g., 'required', 'defaultValue', 'placeholder') include them only if explicitly present or clearly derivable; otherwise omit.
- For 'options', provide an empty array [] if no options are present for a selectable field.
- Ensure field type classification is conservative and based on clear signals.

# Validation
- Your output must validate against jobPostingSchema.shape.applicationForm.
`,
		},
		{
			role: "user",
			content: html,
		},
	];

	llm.setMessages(messages);

	const response = await llm.generateStructuredOutput({
		temperature: 0.1,
		reasoning_effort: "medium",
		response_format: zodResponseFormat(
			jobPostingSchema.shape.applicationForm,
			"application-form",
		),
	});

	if (!response.choices[0].message.parsed) {
		throw new Error("Failed to extract application form");
	}

	return response.choices[0].message.parsed;
}

export async function extractCompanyInfo(html: string, sessionId: string) {
	const llm = new LLM("extract-company-info", {
		model: GEMINI_25_FLASH,
		sessionId,
	});

	const messages: ChatCompletionMessageParam[] = [
		{
			role: "system",
			content: `
# Identity
You are a senior job posting analyst specializing in structured data extraction.

# Goal
Given an image or html, extract 100% accurate company information in structured format.

# Output Format
- Return a single JSON object that validates against 'company-info' (jobPostingSchema.shape.companyInfo).
- Do not include any extra text, explanations, or markdown/code fences.

# Extraction & Anti-hallucination Rules
- Only include information you can confidently extract from the provided content.
- Strings: use empty string "" when applicable; otherwise omit optional fields.
- Arrays: return [] when no items are found.
- Enums with defaults (e.g., size buckets) should be left unspecified unless clearly indicated.
- Prefer verbatim copying of the source text over paraphrasing when uncertain.

# Validation
- Your output must validate against jobPostingSchema.shape.companyInfo.
`,
		},
		{
			role: "user",
			content: html,
		},
	];

	llm.setMessages(messages);

	const response = await llm.generateStructuredOutput({
		temperature: 0.1,
		reasoning_effort: "medium",
		response_format: zodResponseFormat(
			jobPostingSchema.shape.companyInfo,
			"company-info",
		),
	});

	if (!response.choices[0].message.parsed) {
		throw new Error("Failed to extract company info");
	}

	return response.choices[0].message.parsed;
}
