import fs from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import type { z } from "zod";
import { formCompleter } from "./formCompletion.ts";
import { formFiller } from "./formFiller.ts";
import LLM, { BIG_MODEL, SMALL_MODEL } from "./llm.ts";
import {
	jobPostingSchema,
	latexResumeSchema,
	urlExtractorSchema,
} from "./schema.ts";
import { htmlFormCrawler } from "./utils.ts";

const readline = createInterface({
	input: stdin,
	output: stdout,
});
const goldilocksRegex =
	/\b(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff-]{0,61})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,63}))(?::\d{2,5})?(?:[/?#]\S*)?/giu;

// Prep Directories
await fs.mkdir("assets/failed-scrapes", {
	recursive: true,
});

async function generatePdf(latexResume: string) {
	console.log("Generating PDF using pandoc");
	const response = await fetch("http://localhost:4000/compile", {
		method: "POST",
		body: JSON.stringify({
			latex: latexResume,
		}),
		headers: {
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		console.error("Failed to generate PDF:", response.statusText);
		throw new Error("PDF generation failed");
	}

	return response.arrayBuffer();
}

async function llmFormCrawler(pageUrl: string) {
	const llm = new LLM("agentic-crawler", {
		model: SMALL_MODEL,
		maxRuns: 10,
	});

	await llm.addMCPClient({
		name: "puppeteer",
		version: "1",
		url: "http://localhost:3000/sse",
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

	const response = await llm.generateOutput({
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
		model: BIG_MODEL,
	});

	const structuredResponse = await llm2.generateStructuredOutput({
		messages: [
			{
				role: "system",
				content: `
You are a strict URL extractor. Given a piece of text, extract the job posting application url.
				`,
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

async function resumeAdjuster(
	resume: string,
	applicationDetails: z.infer<typeof jobPostingSchema>,
) {
	console.log("Adjusting resume");
	const llm = new LLM("ResumeBoss", {
		model: BIG_MODEL,
		maxRuns: 1,
	});

	const systemPrompt = `
# Identity
You are an expert ATS-optimized resume writer with 10+ years experience.

# Goal
Create a perfectly tailored resume matching 90%+ of job requirements while maintaining authenticity.

# Instructions
1. Analyze Input:
   - Base resume structure and content
   - Job posting requirements and keywords
   - Company culture indicators

2. Optimization Rules:
   - Match 90%+ of required skills and qualifications
   - Preserve all verifiable information (dates, degrees, companies)
   - Keep original resume sections and order
   - Maintain professional tone and format

3. Content Modification:
   - Prioritize relevant experience sections
   - Add missing required skills (if truthfully possessed)
   - Remove irrelevant experiences
   - Limit to 2 pages maximum

4. Formatting:
   - Bold only technical skills: languages, frameworks, tools
   - Maintain original section headings
   - Keep bullet point structure
   - Preserve contact information

5. Keywords:
   - Include 80%+ of job posting keywords naturally
   - Match technical terms exactly
   - Use industry standard abbreviations

# Output Format
Return modified resume in exact input format with no additional text.
  `;

	const response = await llm.generateOutput({
		messages: [
			{
				role: "system",
				content: systemPrompt,
			},
			{
				role: "user",
				content: `
<resume>
${resume}
</resume>

<job-posting>
${JSON.stringify(applicationDetails)}
</job-posting>
        `,
			},
		],
		reasoning_effort: "high",
		temperature: 0.2,
		top_p: 0.9,
	});

	return response.choices[0].message.content;
}

async function latexResumeGenerator(reference: string, resume: string) {
	console.log("Generating latex resume");
	const llm = new LLM("LatexBoss", {
		model: SMALL_MODEL,
	});

	const response = await llm.generateStructuredOutput({
		temperature: 0.1,
		top_p: 0.9,
		messages: [
			{
				role: "system",
				content: `
# Identity
You are a LaTeX document specialist with expertise in resume formatting.

# Goal
Generate perfectly formatted LaTeX resume maintaining exact styling of reference.

# Instructions
1. Document Structure:
   - Use identical document class and packages as reference
   - Maintain all custom commands and definitions
   - Preserve margin and spacing settings
   - Keep exact section formatting

2. Content Conversion Rules:
   - Convert markdown bold to \textbf{content}
   - Convert markdown italics to \textit{content}
   - Maintain bullet points using reference format
   - Preserve all whitespace relationships

3. Required Elements:
   - Include all reference preamble commands
   - Maintain document environment structure
   - Keep all custom styling commands
   - Preserve reference's section hierarchy

4. Validation:
   - Ensure all brackets are properly closed
   - Verify special character escaping
   - Check for required package inclusions
   - Confirm environment consistency

# Output Format
Pure LaTeX code without explanations or markdown.
        `,
			},
			{
				role: "user",
				content: `
Reference Resume in latex format: \n
${reference}

My Resume in markdown format: \n
${resume}
        `,
			},
		],
		response_format: zodResponseFormat(latexResumeSchema, "latex-resume"),
	});

	if (!response.choices[0].message.parsed) {
		throw new Error("Failed to generate latex resume");
	}

	const parsed = response.choices[0].message.parsed as z.infer<
		typeof latexResumeSchema
	>;

	return parsed.resume;
}

async function jobInfoExtractor(
	html: string,
): Promise<z.infer<typeof jobPostingSchema>> {
	console.log("Extracting Job information");
	const llm = new LLM("JobInfoExtractor", {
		model: BIG_MODEL,
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

async function loadApplicationContext() {
	try {
		const [resume, latexReferenceResume, personalInfo] = await Promise.all([
			fs.readFile("assets/resume.md", "utf-8").catch(() => {
				throw new Error(
					"Resume file not found. Please ensure assets/resume.md exists.",
				);
			}),
			fs.readFile("assets/resume.tex", "utf-8").catch(() => {
				throw new Error("LaTeX resume template not found.");
			}),
			fs.readFile("assets/personal-info.md", "utf-8").catch(() => {
				throw new Error("Personal info file not found.");
			}),
		]);

		return { resume, latexReferenceResume, personalInfo };
	} catch (error) {
		console.error("Failed to load application context:", error);
		throw error;
	}
}

async function orchestrator(jobUrl: string) {
	const mdContent: {
		markdown: string;
		rating: number;
		url: string;
		reasoning: string;
	}[] = [];
	const { resume, latexReferenceResume, personalInfo } =
		await loadApplicationContext();
	const { html, validLinks, screenshot } = await htmlFormCrawler(jobUrl);
	const applicationDetails = await jobInfoExtractor(html);

	let formUrl = jobUrl;

	if (!applicationDetails.successfulScrape) {
		await fs.writeFile(
			`assets/failed-scrapes/${jobUrl.replace(/\//g, "-")}.html`,
			html,
		);
		await fs.writeFile(
			`assets/failed-scrapes/${jobUrl.replace(/\//g, "-")}.png`,
			Buffer.from(screenshot, "base64"),
		);
		console.log("Scrape failed, terminating early");
		return;
	}

	if (!applicationDetails.applicationForm.length) {
		console.log("No application form found, now using agentic scraper");

		const crawledUrl = await llmFormCrawler(jobUrl);

		formUrl = crawledUrl.match(goldilocksRegex)?.[0] || jobUrl;

		const { html } = await htmlFormCrawler(formUrl);
		const details = await jobInfoExtractor(html);

		if (!details.applicationForm.length) {
			console.log(
				"No application form found even with agentic scraper, terminating early",
			);
			return;
		}

		// We only get the applicationForm, most probably details object
		// would be missing all other data
		applicationDetails.applicationForm = details.applicationForm;
	}

	const updatedResume = await resumeAdjuster(resume, applicationDetails);

	if (!updatedResume) {
		throw new Error("Updated resume not generated");
	}

	const latexResume = await latexResumeGenerator(
		latexReferenceResume,
		updatedResume,
	);
	const latexPdf = await generatePdf(latexResume);

	const companyName = applicationDetails.companyInfo.name.replace(" ", "-");

	// Save asset
	await fs.mkdir(`assets/${companyName}`, { recursive: true });
	await fs.writeFile(`assets/${companyName}/resume.pdf`, Buffer.from(latexPdf));
	await fs.writeFile(`assets/${companyName}/resume.tex`, latexResume);

	// We try to answer all the questions in the application form
	// and do a sense check on the answers
	// Actions will be done later
	const { completedForm } = await formCompleter({
		readline,
		applicationDetails,
		resume,
		personalInfo,
		context: mdContent.map((md) => md.markdown),
	});

	await fs.writeFile(
		`assets/${companyName}/completedForm.json`,
		JSON.stringify(completedForm),
	);

	await formFiller({
		completedForm,
		url: formUrl,
		resumePath: `assets/${companyName}/resume.pdf`,
	});
}

async function checkRequiredServices() {
	console.log("Checking required services...");

	// Check Pandoc Server
	try {
		const pandocResponse = await fetch("http://localhost:4000/health");
		if (!pandocResponse.ok) throw new Error("Pandoc server is not responding");
	} catch (error) {
		throw new Error("Pandoc server must be running on port 4000");
	}

	// Check Puppeteer MCP Server
	try {
		const mcpResponse = await fetch("http://localhost:3000/health");
		if (!mcpResponse.ok)
			throw new Error("Puppeteer MCP server is not responding");
	} catch (error) {
		throw new Error("Puppeteer MCP server must be running on port 3000");
	}

	console.log("✓ All required services are running");
}

try {
	await checkRequiredServices();

	while (true) {
		const url = await readline.question("URL: ");
		await orchestrator(url);
	}
} catch (e) {
	console.error(e);
}

process.exit(0);
