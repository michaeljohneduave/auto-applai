import fs from "node:fs/promises";
import type { Interface } from "node:readline/promises";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import type { z } from "zod";
import { llmFormCrawler } from "./crawler.ts";
import { extractInfo } from "./extractInfo.ts";
import { formCompleter } from "./formCompletion.ts";
import { formCompleterAsync } from "./formCompletionAsync.ts";
import { generateResumeIterative } from "./generateResume.ts";
import LLM, { GEMINI_25_FLASH } from "./llm.ts";
import { type formCompleterSchema, latexResumeSchema } from "./schema.ts";
import { sessionManager } from "./sessionManager.ts";
import { htmlCrawler } from "./utils.ts";

const urlRegex =
	/\b(?:(?:https?|ftp):\/\/)(?:\S+(?::\S*)?@)?(?:(?!(?:10|127)(?:\.\d{1,3}){3})(?!(?:169\.254|192\.168)(?:\.\d{1,3}){2})(?!172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?:[1-9]\d?|1\d\d|2[01]\d|22[0-3])(?:\.(?:1?\d{1,2}|2[0-4]\d|25[0-5])){2}(?:\.(?:[1-9]\d?|1\d\d|2[0-4]\d|25[0-4]))|(?:(?:[a-z0-9\u00a1-\uffff][a-z0-9\u00a1-\uffff-]{0,61})?[a-z0-9\u00a1-\uffff]\.)+(?:[a-z\u00a1-\uffff]{2,63}))(?::\d{2,5})?(?:[/?#]\S*)?/giu;

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

	const messages: ChatCompletionMessageParam[] = [
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
	];

	llm.setMessages(messages);

	const response = await llm.generateStructuredOutput({
		temperature: 0.2,
		top_p: 0.9,
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

export async function orchestrator(
	sessionId: string,
	jobUrl: string,
	readline?: Interface,
) {
	try {
		sessionManager.updateProgress(
			sessionId,
			"loading_context",
			"Loading application context...",
		);

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

		sessionManager.updateProgress(
			sessionId,
			"scraping",
			"Scraping job posting...",
		);
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
			throw new Error("Failed to scrape job posting");
		}

		sessionManager.updateSession(sessionId, {
			applicationDetails,
			screenshot: Buffer.from(screenshot, "base64"),
		});

		if (!applicationDetails.applicationForm.length) {
			sessionManager.updateProgress(
				sessionId,
				"agentic_scraping",
				"Using agentic scraper to find application form...",
			);

			const crawledUrl = await llmFormCrawler(jobUrl, sessionId);
			formUrl = crawledUrl.match(urlRegex)?.[0] || jobUrl;

			const { html, screenshot } = await htmlCrawler(formUrl);
			const details = await extractInfo(html, screenshot, sessionId);

			if (!details.applicationForm.length) {
				console.log("No application form found");
				// throw new Error("No application form found");
			}
			applicationDetails.applicationForm = details.applicationForm;
		}

		sessionManager.updateProgress(
			sessionId,
			"generating_resume",
			"Generating tailored resume...",
		);
		const { adjustedResume, generatedEvals, generatedResumes } =
			await generateResumeIterative(ogResumeMd, applicationDetails, sessionId);

		if (!adjustedResume) {
			throw new Error("Updated resume not generated");
		}

		sessionManager.updateProgress(
			sessionId,
			"generating_latex",
			"Converting resume to LaTeX...",
		);
		const latexResume = await latexResumeGenerator(
			latexReferenceResume,
			adjustedResume,
			sessionId,
		);

		sessionManager.updateProgress(
			sessionId,
			"generating_pdf",
			"Generating PDF resume...",
		);
		const latexPdf = await generatePdf(latexResume);

		const companyName = applicationDetails.companyInfo.name.replace(" ", "-");
		const assetPath = `assets/${companyName}/${sessionId}`;

		// Save assets
		sessionManager.updateProgress(
			sessionId,
			"saving_assets",
			"Saving generated assets...",
		);
		await fs.mkdir(assetPath, { recursive: true });
		await fs.writeFile(`${assetPath}/resume.pdf`, Buffer.from(latexPdf));
		await fs.writeFile(`${assetPath}/resume.tex`, latexResume);
		await fs.writeFile(`${assetPath}/adjusted-resume.md`, adjustedResume, {
			encoding: "utf-8",
		});

		for (let i = 0; i < generatedResumes.length; i++) {
			await fs.writeFile(
				`${assetPath}/generated-resume-${i + 1}.md`,
				generatedResumes[i],
				{
					encoding: "utf-8",
				},
			);
		}

		for (let i = 0; i < generatedEvals.length; i++) {
			await fs.writeFile(
				`${assetPath}/resume-eval-${i + 1}.json`,
				JSON.stringify(generatedEvals[i]),
			);
		}

		await fs.writeFile(
			`${assetPath}/application-details.json`,
			JSON.stringify(applicationDetails),
		);

		await fs.writeFile(
			`${assetPath}/screenshot.png`,
			Buffer.from(screenshot, "base64"),
		);

		// Update session with all generated data
		sessionManager.updateSession(sessionId, {
			companyName,
			adjustedResume,
			latexResume,
			latexPdf: Buffer.from(latexPdf),
			formUrl,
			assetPath,
		});

		let completedForm: z.infer<typeof formCompleterSchema> | null = null;

		if (applicationDetails.applicationForm.length) {
			// Complete form with interactive clarifications

			if (readline) {
				completedForm = await formCompleter({
					sessionId,
					readline,
					applicationDetails,
					resume: ogResumeMd,
					personalInfo,
					context: mdContent.map((md) => md.markdown),
				});
			} else {
				completedForm = await formCompleterAsync({
					sessionId,
					applicationDetails,
					resume: ogResumeMd,
					personalInfo,
					context: mdContent.map((md) => md.markdown),
				});
			}

			// Save completed form
			await fs.writeFile(
				`${assetPath}/completedForm.json`,
				JSON.stringify(completedForm),
			);
			await fs.writeFile(
				`${assetPath}/cover-letter.txt`,
				completedForm.coverLetter,
				{ encoding: "utf-8" },
			);

			sessionManager.updateSession(sessionId, { completedForm });
		}

		const result = {
			sessionId,
			companyName,
			applicationDetails,
			adjustedResume,
			latexResume,
			latexPdf: Buffer.from(latexPdf),
			screenshot: Buffer.from(screenshot, "base64"),
			formUrl,
			assetPath,
			completedForm,
		};

		sessionManager.completeSession(sessionId, result);
		return result;
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		sessionManager.failSession(sessionId, errorMessage);
		throw error;
	}
}

export async function checkRequiredServices() {
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
