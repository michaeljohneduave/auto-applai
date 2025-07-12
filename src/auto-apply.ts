import fs from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { toXML } from "jstoxml";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import { randomString } from "remeda";
import type { z } from "zod";
import { llmFormCrawler } from "./crawler.ts";
import { extractJobInfo } from "./extractJobInfo.ts";
import { formCompleter } from "./formCompletion.ts";
import LLM, { GEMINI_25_FLASH } from "./llm.ts";
import {
	adjustedResumeSchema,
	type jobPostingSchema,
	latexResumeSchema,
} from "./schema.ts";
import { htmlFormCrawler } from "./utils.ts";

const readline = createInterface({
	input: stdin,
	output: stdout,
});
const urlRegex =
	/\b(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff-]{0,61})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,63}))(?::\d{2,5})?(?:[/?#]\S*)?/giu;

// Prep Directories
await fs.mkdir("assets/failed-scrapes", {
	recursive: true,
});

async function generatePdf(latexResume: string) {
	console.log("Generating PDF using pandoc");
	const response = await fetch(`${process.env.PDF_SERVICE_URL}/compile`, {
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

async function resumeAdjuster(
	resume: string,
	applicationDetails: z.infer<typeof jobPostingSchema>,
	sessionId: string,
) {
	console.log("Adjusting resume");
	const llm = new LLM("ResumeBoss", {
		model: GEMINI_25_FLASH,
		maxRuns: 1,
		sessionId,
	});

	const systemPrompt = `
# IDENTITY
You are a world-class professional resume writer and strategic career coach, operating as a precision AI tool. Your expertise is in algorithmically transforming standard resumes into powerful documents that are aggressively optimized to pass Applicant Tracking Systems (ATS) and impress human hiring managers through strategic skill framing.

# CORE OBJECTIVE
Your primary objective is to maximize the applicant's chances of securing an interview. To do this, you will transform a generic resume into a highly targeted document. You will incorporate keywords from the job posting by reframing existing experience and by strategically adding a new section for skills the applicant is aware of or currently learning.

# INPUTS
You will receive two pieces of information wrapped in XML-style tags:
1.  '<resume>': The user's base resume in Markdown format.
2.  '<job-posting>': A JSON object containing structured data about the job and company.

# STEP-BY-STEP PROCESS
Follow this process with precision:

1.  **Parse & Analyze Structured Data:**
    -   **Job Requirements Analysis:** Scrutinize the JSON object in '<job-posting>'. Extract all critical skills, qualifications, and terminology from 'jobInfo.requirements', 'jobInfo.responsibilities', and 'jobInfo.skills'.
    -   **Company Culture Analysis:** Review 'companyInfo.description' and 'companyInfo.values' to understand the company's ethos.
    -   **Candidate & Gap Analysis:** Parse the '<resume>'. Compare the skills present on the resume against the list of critical skills from the job posting. Create a list of "missing but critical" keywords that are required by the job but absent from the resume.

2.  **Rewrite & Strategically Tailor (Section by Section):**
    -   **Professional Summary:** Rewrite the summary to be a powerful 2-4 sentence "hook." It must directly address the 'jobInfo.title' and the top requirements from 'jobInfo.requirements'.
    -   **Skills Section (Proficiency):** Reorder the user's existing skills from the original resume to prioritize those listed in 'jobInfo.skills'. This section represents the applicant's proficient skills.
    -   **Create a 'Familiar With & Currently Learning' Section:** This is a critical step.
        -   Immediately following the main skills section, create a new section titled '### Familiar With & Currently Learning'.
        -   Populate this new section with the "missing but critical" keywords identified during the Gap Analysis. This transparently includes vital keywords for the ATS while honestly framing them for the human reader as areas of growth.
    -   **Experience Section:**
        -   Rewrite bullet points to start with strong action verbs found in 'jobInfo.responsibilities'.
        -   Integrate keywords from 'jobInfo.requirements' and 'jobInfo.description' wherever possible and natural.
        -   Focus on quantifiable achievements that align with the job's duties.

3.  **Keyword Highlighting:**
    -   In the Professional Summary and Experience sections, **bold** the most impactful keywords ('**keyword**') that you integrated from the 'jobInfo' object to help human readers skim the document.

# RULES & CONSTRAINTS
-   **Segregate Skills by Proficiency:** Skills from the original resume go under the main "Skills" section. Skills from the job posting that are NOT on the original resume **must** go into the '### Familiar With & Currently Learning' section. Do not mix them.
-   **Maintain Factual Integrity of Experience:** Do not alter core facts like employers, dates, or the fundamental nature of job duties described in the original resume. You are reframing experience and adding a new skill section, not inventing job histories.
-   **Clean PDF-Ready Output:** The final resume must be clean text. Do not include any meta-comments, annotations, or special tags. The entire output should be ready to be converted to a PDF.
-   **Preserve Markdown Structure:** Maintain the original Markdown headings and structure of the '<resume>', with the exception of adding the new skills section.
-   **Natural Language:** Keyword integration must be seamless. Avoid "keyword stuffing."
-   **Highlighting Limit:** Do not **bold** more than 5-7 keywords per job entry.
`;

	const messages: ChatCompletionMessageParam[] = [
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

<application-details>
${toXML(
	{
		companyInfo: applicationDetails.companyInfo,
		jobInfo: applicationDetails.jobInfo,
	},
	{
		selfCloseTags: false,
	},
)}
</application-details>
`,
		},
	];

	const response = await llm.generateStructuredOutput({
		messages,
		reasoning_effort: "high",
		response_format: zodResponseFormat(adjustedResumeSchema, "adjusted-resume"),
		temperature: 0.2,
		top_p: 0.9,
	});

	if (!response.choices[0].message.parsed) {
		throw new Error("Failed to generate adjusted resume");
	}

	return response.choices[0].message.parsed as z.infer<
		typeof adjustedResumeSchema
	>;
}

async function latexResumeGenerator(
	reference: string,
	resume: string,
	sessionId: string,
) {
	console.log("Generating latex resume");
	const llm = new LLM("LatexBoss", {
		model: BIG_MODEL,
		sessionId,
	});

	const response = await llm.generateStructuredOutput({
		temperature: 0.2,
		top_p: 0.9,
		messages: [
			{
				role: "system",
				content: `
# Identity
You are a LaTeX document specialist with expertise in resume formatting.

# Goal
Generate perfectly formatted LaTeX resume maintaining layout of the reference.

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
<reference-resume>
${reference}
</reference-resume>

<adjusted-resume>
${resume}
</adjusted-resume>
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
	const sessionId = randomString(10);
	const mdContent: {
		markdown: string;
		rating: number;
		url: string;
		reasoning: string;
	}[] = [];
	const {
		resume: ogResumeMd,
		latexReferenceResume,
		personalInfo,
	} = await loadApplicationContext();
	const { html, validLinks, screenshot } = await htmlFormCrawler(jobUrl);
	const applicationDetails = await extractJobInfo(html, sessionId);

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

		const crawledUrl = await llmFormCrawler(jobUrl, sessionId);

		formUrl = crawledUrl.match(urlRegex)?.[0] || jobUrl;

		const { html, screenshot } = await htmlFormCrawler(formUrl);
		const details = await extractJobInfo(html, sessionId);

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

	const { resume: adjustedResume } = await resumeAdjuster(
		ogResumeMd,
		applicationDetails,
		sessionId,
	);

	if (!adjustedResume) {
		throw new Error("Updated resume not generated");
	}

	const latexResume = await latexResumeGenerator(
		latexReferenceResume,
		adjustedResume,
		sessionId,
	);
	const latexPdf = await generatePdf(latexResume);

	const companyName = applicationDetails.companyInfo.name.replace(" ", "-");

	// Save asset
	await fs.mkdir(`assets/${companyName}/${sessionId}`, { recursive: true });
	await fs.writeFile(
		`assets/${companyName}/${sessionId}/resume.pdf`,
		Buffer.from(latexPdf),
	);
	await fs.writeFile(
		`assets/${companyName}/${sessionId}/resume.tex`,
		latexResume,
	);
	await fs.writeFile(
		`assets/${companyName}/${sessionId}/adjusted-resume.md`,
		adjustedResume,
	);
	await fs.writeFile(
		`assets/${companyName}/${sessionId}/application-details.json`,
		JSON.stringify(applicationDetails),
	);

	// We try to answer all the questions in the application form
	// and do a sense check on the answers
	// Actions will be done later
	const { completedForm } = await formCompleter({
		readline,
		applicationDetails,
		resume: ogResumeMd,
		personalInfo,
		context: mdContent.map((md) => md.markdown),
		sessionId,
	});

	await fs.writeFile(
		`assets/${companyName}/${sessionId}/completedForm.json`,
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
		const pandocResponse = await fetch(`${process.env.PDF_SERVICE_URL}/health`);
		if (!pandocResponse.ok) throw new Error("Pandoc server is not responding");
	} catch (error) {
		throw new Error("Pandoc server must be running on port 4000");
	}

	// Check Puppeteer MCP Server
	try {
		const mcpResponse = await fetch(
			`${process.env.PUPPETEER_SERVICE_URL}/health`,
		);
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
