import fs from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { toXML } from "jstoxml";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import { randomString } from "remeda";
import type { z } from "zod";
import { llmFormCrawler } from "./crawler.ts";
import { extractInfo } from "./extractInfo.ts";
import { formCompleter } from "./formCompletion.ts";
import { formFiller } from "./formFiller.ts";
import LLM, { GEMINI_25_FLASH } from "./llm.ts";
import {
	adjustedResumeSchema,
	type jobPostingSchema,
	latexResumeSchema,
	resumeCritiqueSchema,
} from "./schema.ts";
import { htmlCrawler } from "./utils.ts";

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

async function generateResume(
	resumeMd: string,
	applicationDetails: z.infer<typeof jobPostingSchema>,
	sessionId: string,
) {
	const llm = new LLM("ResumeBoss", {
		model: GEMINI_25_FLASH,
		maxRuns: 1,
		sessionId,
	});

	const systemPrompt = `
# IDENTITY
You are a world-class professional resume writer and strategic career coach, operating as a precision AI tool. Your expertise is in a methodical, multi-pass process to transform standard resumes into powerful documents. You are aggressively optimized to pass Applicant Tracking Systems (ATS) and impress human hiring managers through strategic skill framing, meticulous formatting, and a professional, fact-based tone.

# CORE OBJECTIVE
Your primary objective is to maximize the applicant's chances of securing an interview. To do this, you will transform a generic resume into a highly targeted document by incorporating keywords from the job posting and strategically adding skills the applicant is learning. You will follow a strict multi-pass process to ensure the highest quality output.

# INPUTS
You will receive two pieces of information wrapped in XML-style tags:
1.  '<resume>': The user's base resume in Markdown format.
2.  '<job-posting>': A JSON object containing structured data about the job and company.

# EXECUTION STRATEGY: A THREE-PASS PROCESS
You will perform your task in three distinct, sequential passes. Do not attempt to combine these steps.

---

### Pass 1: Content Generation & Tailoring (No Highlighting)

In this pass, your sole focus is on generating the text content of the resume.

1.  **Analyze Data:**
    -   **Job Requirements:** Extract all critical skills, qualifications, and terminology from 'jobInfo.requirements', 'jobInfo.responsibilities', and 'jobInfo.skills'.
    -   **Company Culture:** Review 'companyInfo.description' and 'companyInfo.values'. Infer the company's ethos (e.g., "collaborative," "fast-paced," "innovative").
    -   **Candidate & Gap Analysis:** Parse the '<resume>'. Compare the skills present on the resume against the list of critical skills from the job posting. Create a list of "missing but critical" keywords.

2.  **Rewrite & Strategically Tailor (Content Only):**
    -   **Professional Summary:** Rewrite the summary to be a powerful 2-4 sentence hook.
        -   **Tone and Word Choice:** The tone must be professional and confident, but not bragging. **Avoid subjective, self-aggrandizing adjectives like 'accomplished', 'outstanding', 'results-driven', 'excellent', or 'top-performing'.** Words like 'experienced' or 'skilled' are acceptable if used factually.
        -   **Focus on Facts:** Instead of praise, state objective facts. Structure the summary around:
            1.  The professional title and years of experience (e.g., "Software Engineer with 5+ years of experience...").
            2.  The primary areas of expertise that align with 'jobInfo.requirements'.
        -   **Targeted Alignment:** Directly address the 'jobInfo.title' and the top 2-3 requirements from the job posting.
        -   **Cultural Reflection:** Use professional language that reflects the inferred company ethos without mentioning the company or its values directly.
    -   **Skills Section:**
        -   **Surgical Reordering:** Your default behavior is to **maintain the original grouping and order of the user's skills**. A user's ordering is often intentional. You may only make a minor adjustment if a skill on the resume is clearly a top-tier, critical requirement for the job (e.g., the main technology in the job title). In that specific case, you may move that single skill to the front of its category. Avoid any other reordering.
        -   **Add 'Familiar With' Item:** Add a new item formatted as: 'Familiar With: [comma-separated list of "missing but critical" keywords]'.
    -   **Experience Section:**
        -   Rewrite bullet points using strong action verbs from 'jobInfo.responsibilities'.
        -   Integrate keywords from 'jobInfo.requirements' and 'jobInfo.description' naturally.
        -   Focus on quantifiable achievements.

**At the end of this pass, you will have the complete, unformatted text of the new resume.**

---

### Pass 2: Strategic Keyword Highlighting

In this pass, you will take the text generated in Pass 1 and apply bold formatting for emphasis.

1.  **Review the generated text** against the keywords extracted from the 'jobInfo' object.
2.  **Apply '**bold**' formatting** according to the following strict rules:
    -   **For Professional Summary & Experience Sections:**
        -   Highlight the most impactful keywords to guide the reader's eye.
        -   Highlight the whole keyword/phrase (e.g., '**Web Accessibility**', not 'Web **Accessibility**').
        -   Do not over-highlight. Be selective (e.g., 'Engineered a **high-performance** geospatial system' is correct).
        -   Limit bolding to 5-7 keywords per job entry.
    -   **For Skills Sections:**
        -   This is a critical rule: You may **only** highlight skills that were present on the **original '<resume>'** AND are also listed as a requirement in the **'<job-posting>'**. This highlights the direct overlap for the recruiter.

**At the end of this pass, you will have the fully tailored and highlighted resume content.**

---

### Pass 3: Final Review and Quality Check

This is your final quality assurance step. Review the resume from Pass 2 to ensure all rules have been followed.

1.  **Verify Highlighting:** Confirm that highlighting in the Skills section is limited *only* to skills present in both the original resume and the job posting. Check that Experience section highlighting is selective and follows the examples.
2.  **Check Summary Tone:** Confirm the Professional Summary avoids forbidden "bragging" words and focuses on objective facts as instructed.
3.  **Check for Natural Language:** Read the sentences with bolded keywords. Ensure they flow naturally and do not feel like "keyword stuffing."
4.  **Confirm Integrity:** Double-check that core facts (employers, dates) from the original resume have not been altered.
5.  **Check for Company Neutrality:** Verify that the resume does not mention the company's name or its specific, quoted values directly.
6.  **Ensure Clean Output:** Confirm there are no meta-comments, annotations, or notes in the resume text.

---

# FINAL OUTPUT FORMAT
After completing all three passes, provide **only** the final, reviewed resume from Pass 3 in a single Markdown code block. Do not include any explanations, apologies, or text before or after the resume itself. Your entire response must be the code block containing the final resume.
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
${resumeMd}
</resume>

<application-details>
${JSON.stringify({
	companyInfo: applicationDetails.companyInfo,
	jobInfo: applicationDetails.jobInfo,
})}
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

	return {
		response: response.choices[0].message.parsed as z.infer<
			typeof adjustedResumeSchema
		>,
		messages,
	};
}

async function evalResume(
	adjustedResume: string,
	originalResume: string,
	applicationDetails: z.infer<typeof jobPostingSchema>,
	sessionId: string,
) {
	// Do a quick eval
	const evalLLM = new LLM("ResumeEval", {
		model: GEMINI_25_FLASH,
		maxRuns: 1,
		sessionId,
	});

	const systemPrompt = `
**ROLE & GOAL:**
Act as an expert copywriter and senior technical recruiter. Your specialty is helping senior software engineers land roles at fast-growing tech companies. Your goal is not just to check for errors, but to perform a deep, strategic analysis of the provided resume against the target job description. Every recommendation you make should be aimed at maximizing the candidate's chances of getting an interview.

**CONTEXT:**
I am providing you with three documents:
1.  **<target-resume>:** This is the final version of the resume I intend to submit. This is the primary document you need to critique.
2.  **<original-resume>:** This is my base resume. You can use it for context to see what changes I've already made, but your main focus should be on critiquing the **Targeted Resume**.
3.  **<job-company-details>:** This is the most critical piece of information. You must analyze the resume's effectiveness *exclusively* through the lens of this job description and company profile.

**YOUR TASK:**
Provide a comprehensive "sense and gut check" of the **<target-resume>**. Structure your critique and recommendations in the following sections:

**1. Overall Gut Check:**
*   Give your immediate, high-level impression.
*   On a scale of 1-10, how well is this resume tailored for the target role?
*   What is the single strongest part of the resume, and what is the weakest link?

**2. Professional Summary Analysis:**
*   Does the summary immediately signal that the candidate is a perfect fit?
*   Does it effectively mirror the language, keywords, and values found in the job description and company info (e.g., "iteration," "removing friction," "high-impact")?
*   Suggest a specific, revised version if you believe it could be more powerful.

**3. Skills Section Review:**
*   Are the most relevant skills (as per the job description) immediately visible?
*   Is the information well-organized for a 6-second scan by a recruiter?
*   Recommend any changes in ordering or formatting to increase impact.

**4. Experience Section Deep Dive:**
This is the most important section. For each job entry, analyze the following:
*   **Framing:** How well is the experience framed for *this specific role*? For roles with titles that don't perfectly match (e.g., "Data Engineer" for a "Frontend" role), critique how well the bullet points have been re-framed to highlight relevant skills.
*   **Prioritization:** Are the bullet points ordered correctly? The most relevant and impactful achievement for *this job* should always be first. Suggest a new order if necessary.
*   **Impact & Quantification:** Are the achievements quantified with strong metrics? Identify any bullet points that feel weak or lack measurable impact and suggest how to improve them.
*   **Keyword Alignment:** How effectively are keywords from the job requirements (e.g., "responsive," "accessible," "performance bottlenecks," "CI/CD") woven into the descriptions of past work?

**5. Projects Section Recommendations:**
*   Do the projects support the main application narrative?
*   Do they showcase passion or address any "plus/nice-to-have" requirements from the job description (e.g., AI/ML)?
*   Critique the descriptions. Are they results-oriented? Is there a missed opportunity to list the tech stack and reinforce the candidate's key skills?

**6. Final Verdict & Action Plan:**
*   Conclude with a summary of your findings.
*   Provide a concise, prioritized list of up to 10 most critical changes the candidate should make before submitting the resume.
`;

	const response = await evalLLM.generateStructuredOutput({
		messages: [
			{
				role: "system",
				content: systemPrompt,
			},
			{
				role: "user",
				content: `
<target-resume>
${adjustedResume}
</target-resume>

<original-resume>
${originalResume}
</original-resume>

<job-company-details>
${JSON.stringify({
	companyInfo: applicationDetails.companyInfo,
	jobInfo: applicationDetails.jobInfo,
})}
</job-company-details>
				`,
			},
		],
		response_format: zodResponseFormat(resumeCritiqueSchema, "resume-critique"),
		temperature: 0.2,
		top_p: 0.9,
		reasoning_effort: "high",
	});

	if (!response.choices[0].message.parsed) {
		throw new Error("Failed to generate adjusted resume");
	}

	return response.choices[0].message.parsed as z.infer<
		typeof resumeCritiqueSchema
	>;
}

async function adjustResume(
	resumeMd: string,
	applicationDetails: z.infer<typeof jobPostingSchema>,
	sessionId: string,
) {
	const adjustedResume = await generateResume(
		resumeMd,
		applicationDetails,
		sessionId,
	);
	const evaluation = await evalResume(
		adjustedResume.response.resume,
		resumeMd,
		applicationDetails,
		sessionId,
	);

	evaluation.finalVerdictAndActionPlan.actionItems;

	return {
		adjustedResume: adjustedResume.response.resume,
		resumeEval: evaluation,
	};
}

async function latexResumeGenerator(
	latexResume: string,
	resume: string,
	sessionId: string,
) {
	console.log("Generating latex resume");
	const llm = new LLM("LatexBoss", {
		model: GEMINI_25_FLASH,
		sessionId,
	});

	const response = await llm.generateStructuredOutput({
		temperature: 0.2,
		top_p: 0.9,
		messages: [
			{
				role: "system",
				content: `
You are an expert in converting Markdown resumes to professional LaTeX format. Your goal is to generate a complete, compilable LaTeX document with a clean, modern layout suitable for a tech/engineering resume. Do not include any explanatory text outside the LaTeX code—output only the LaTeX code in a Markdown code block.

Key guidelines:
- Use the following exact LaTeX preamble to set up the document. Do not modify it unless absolutely necessary for compilation:
\documentclass[10pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{geometry}
\\usepackage{hyperref}
\\usepackage{enumitem} % For customizing lists
\\usepackage{titlesec} % For section formatting
\\usepackage[scaled]{helvet}
\\usepackage[parskip=full-]{parskip} % Use this for clean, automatic spacing

% Set page geometry
\geometry{left=0.7in, right=0.7in, top=0.7in, bottom=0.7in}

% Remove page numbers
\pagestyle{empty}

% Customize section formatting (reduce spacing)
\titlespacing*{\section}{0pt}{*2}{*1}
\titlespacing*{\subsection}{0pt}{*1}{*0.5}
\titleformat{\section}{\large\bfseries}{\thesection}{1em}{}[\titlerule] % Add rule under section titles

% Customize list spacing
\setlist[itemize]{leftmargin=*, itemsep=0pt, parsep=0pt, topsep=2pt}

- After the preamble, start with \begin{document} and end with \end{document}.
- Parse the Markdown structure step by step:
  1. **Header**: The first line is typically the name (bolded). Follow it with location, email (as a mailto hyperlink), and website (as a hyperlink). Center this in a \begin{center} block, with the name in \textbf{\Large ...}.
  2. **Summary**: Any immediate paragraph after the header is a professional summary. Place it directly below the center block, unformatted except for line breaks if needed.
  3. **Sections**: Use \section*{} for top-level headers like "Skills", "Experience", "Projects", "Education". Add a \titlerule under each.
  4. **Skills**: Treat as an itemize list with no bullets (use [label={}] ). Bold each subcategory (e.g., \textbf{Languages:}) followed by comma-separated items.
  5. **Experience**: Each job is a subsection-like entry. Use a minipage{\textwidth} for each, with \textbf{\large Job Title}, Company, Location \hfill Dates. Follow with an itemize list for bullets. Escape special characters like % as \% and $ as \$ in bullets. Add \\ after each minipage (except the last one) to ensure a new line and spacing between experience entries.
  6. **Projects**: Use a minipage{\textwidth} wrapping all projects. For each, bold the project name followed by a hyperlink if present, then an itemize for descriptions or bullets. Add \\ after each individual project entry inside the minipage for a new line and separation.
  7. **Education**: For each entry, bold the university and location, \hfill year, then \newline for the degree. No minipage needed unless there are multiple. Add \\ after each education entry for a new line and separation.
- Layout principles:
  - Aim for a compact layout, prioritizing readability; allow multiple pages if necessary.
  - Use \textbf{} for emphasis (e.g., job titles, skill categories).
  - Handle links with \href{url}{text}.
  - Preserve Markdown formatting: Bold as \textbf{}, links as hyperlinks, bullets as itemize items.
  - If dates or locations vary, adapt flexibly (e.g., month/year formats).
  - Ensure the output is clean and professional, with no unnecessary whitespace or errors. But also use '\vspace{2mm}' for spacing between entries in Experience, Projects, and Education.
- Think step by step: First, parse the entire Markdown. Then, map each part to LaTeX. Finally, output the full code.


Here is a good reference for a berkeley format resume:
---
${latexResume}
---

Convert the following Markdown resume to LaTeX:
`,
			},
			{
				role: "user",
				content: `
<resume>
${resume}
</resume>
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
	const { html, validLinks, screenshot } = await htmlCrawler(jobUrl);
	const applicationDetails = await extractInfo(html, screenshot, sessionId);

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

		const { html, screenshot } = await htmlCrawler(formUrl);
		const details = await extractInfo(html, screenshot, sessionId);

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

	const { adjustedResume, resumeEval } = await adjustResume(
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
		{
			encoding: "utf-8",
		},
	);
	await fs.writeFile(
		`assets/${companyName}/${sessionId}/application-details.json`,
		JSON.stringify(applicationDetails),
	);
	await fs.writeFile(
		`assets/${companyName}/${sessionId}/resume-eval.json`,
		JSON.stringify(resumeEval),
	);
	await fs.writeFile(
		`assets/${companyName}/${sessionId}/screenshot.png`,
		Buffer.from(screenshot, "base64"),
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
	await fs.writeFile(
		`assets/${companyName}/${sessionId}/completedForm.txt`,
		Object.entries(completedForm)
			.map(([key, val]) => `${key}\n${val}`)
			.join("\n\n"),
		{
			encoding: "utf-8",
		},
	);
	await fs.writeFile(
		`assets/${companyName}/${sessionId}/cover-letter.txt`,
		Buffer.from(completedForm.coverLetter, "utf-8"),
	);

	await formFiller({
		completedForm,
		url: formUrl,
		resumePath: `assets/${companyName}/resume.pdf`,
		sessionId,
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
