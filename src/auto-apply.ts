import fs from "node:fs/promises";
import type { Interface } from "node:readline/promises";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import { toKebabCase } from "remeda";
import type { z } from "zod";
import { llmFormCrawler } from "./crawler.ts";
import { extractInfo } from "./extractInfo.ts";
import { formCompleter } from "./formCompletion.ts";
import { generateResumeIterative } from "./generateResume.ts";
import LLM, { GEMINI_25_FLASH, GEMINI_25_FLASH_LITE } from "./llm.ts";
import { updateSession } from "./models/session.ts";
import {
	type formCompleterSchema,
	latexResumeSchema,
	personalInfoSchema,
} from "./schema.ts";
import { handleCaptcha, htmlCrawler, isoFileSuffixUTC } from "./utils.ts";

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
You are an expert in converting Markdown resumes to professional LaTeX format. Generate a complete,
compilable LaTeX document with a clean, modern layout suitable for a tech/engineering resume.
Output only the LaTeX code, wrapped in a Markdown code block—no extra explanation.

Use this exact preamble (do not change it):

\\documentclass[10pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage{geometry}
\\geometry{left=0.7in, right=0.7in, top=0.7in, bottom=0.7in}
\\usepackage{enumitem}   % For customizing lists
\\usepackage{titlesec}   % For section formatting
\\usepackage[scaled=0.90]{helvet}
\\usepackage[parskip=full]{parskip}  % Clean, automatic spacing
\\usepackage{hyperref}

% Remove page numbers
\\pagestyle{empty}

% Section spacing
\\titlespacing*{\\section}{0pt}{*2}{*1}
\\titlespacing*{\\subsection}{0pt}{*1}{*0.5}
\\titleformat{\\section}{\\large\\bfseries}{\\thesection}{1em}{}[\\titlerule]

% List spacing
\\setlist[itemize]{leftmargin=*, itemsep=0pt, parsep=0pt, topsep=2pt}

Here is a good reference for a Berkeley-format resume:
---
${latexResume}
---

After the preamble, start with \\begin{document} and end with \\end{document}.  

Parse the Markdown step by step:

1. Header → centered \\textbf{\\Large Name}, location | email (mailto) | website (href).  
2. Summary → plain paragraph under the center block.  
3. Sections (“Skills”, “Experience”, “Projects”, “Education”) → \\section*{}  
4. Skills → itemize [label={}], bold sub-categories.  
5. Experience → for each job use a full-width minipage with \\textbf{\\large Job Title}, Company, Location \\hfill Dates, then itemize bullets. After each entry put \\vspace{2mm}.  
6. Projects → a single minipage wrapping all projects. For each project, \\textbf{Name} — \\href{url}{url}, then bullets, then \\vspace{2mm}.  
7. Education → bold university, \\hfill year, \\newline degree, then \\vspace{2mm}.

Now convert the following Markdown resume to LaTeX:
`,
		},
		{
			role: "user",
			content: `
\`\`\`markdown
${resume}
\`\`\`
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

async function loadApplicationContext(sessionId: string) {
	try {
		const [resume, latexReferenceResume, personalMetadata] = await Promise.all([
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

		const llm = new LLM("personalInfo", {
			model: GEMINI_25_FLASH_LITE,
			sessionId,
		});

		llm.setMessages([
			{
				role: "system",
				content: `
You are an information extractor. Your job is to read the candidate's resume and personal‐info sections. 
`,
			},
			{
				role: "user",
				content: `
<resume>
${resume}
</resume>

<personal-info>
${personalMetadata}
</personal-info>
`,
			},
		]);

		const response = await llm.generateStructuredOutput({
			temperature: 0,
			top_p: 0.9,
			response_format: zodResponseFormat(
				personalInfoSchema,
				"personalInfoSchema",
			),
		});

		if (!response.choices[0].message.parsed) {
			throw new Error("Unable to parse personal info");
		}

		const personalInfo = response.choices[0].message.parsed as z.infer<
			typeof personalInfoSchema
		>;

		return { resume, latexReferenceResume, personalMetadata, personalInfo };
	} catch (error) {
		console.error("Failed to load application context:", error);
		throw error;
	}
}

export async function run(
	userId: string,
	sessionId: string,
	jobUrl: string,
	readline?: Interface,
) {
	try {
		await updateSession(userId, sessionId, {
			currentStep: "loading_context",
			status: "processing",
		});

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
			personalMetadata,
		} = await loadApplicationContext(sessionId, db);

		await updateSession(userId, sessionId, {
			currentStep: "scraping",
			status: "processing",
		});

		const { html, screenshot } = await htmlCrawler(jobUrl);
		let applicationDetails = await extractInfo(html, screenshot, sessionId);

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

			if (!applicationDetails.antiBotMeasures.length) {
				throw new Error("Failed to scrape job posting");
			}

			console.log("Attempting to solve captcha");
			console.log(applicationDetails.antiBotMeasures);

			const html22 = await handleCaptcha(jobUrl);
			console.log("-----html22--------");
			console.log(html22);
			console.log("-----html22--------");
			applicationDetails = await extractInfo(html22, screenshot, sessionId);
		}

		await updateSession(userId, sessionId, {
			applicationDetails,
			screenshot: Buffer.from(screenshot, "base64"),
		});

		if (!applicationDetails.applicationForm.length) {
			await updateSession(userId, sessionId, {
				currentStep: "agentic_scraping",
			});

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

		await updateSession(userId, sessionId, {
			currentStep: "generating_resume",
		});
		const { adjustedResume, generatedEvals, generatedResumes } =
			await generateResumeIterative(ogResumeMd, applicationDetails, sessionId);

		if (!adjustedResume) {
			throw new Error("Updated resume not generated");
		}

		await updateSession(userId, sessionId, {
			currentStep: "generating_latex",
		});
		const latexResume = await latexResumeGenerator(
			latexReferenceResume,
			adjustedResume,
			sessionId,
		);

		await updateSession(userId, sessionId, {
			currentStep: "generating_pdf",
		});
		const latexPdf = await generatePdf(latexResume);

		const companyName = applicationDetails.companyInfo.name.replace(" ", "-");
		const assetPath = `assets/${companyName}/${sessionId}-${isoFileSuffixUTC(
			new Date(),
			{
				isLocal: true,
			},
		)}`;

		// Save assets
		await updateSession(userId, sessionId, {
			currentStep: "saving assets",
			status: "processing",
		});

		await fs.mkdir(assetPath, { recursive: true });
		await fs.writeFile(
			`${assetPath}/${toKebabCase(personalInfo.fullName)}-${applicationDetails.companyInfo.name.toLowerCase()}-resume.pdf`,
			Buffer.from(latexPdf),
		);
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
		await updateSession(userId, sessionId, {
			company_name: companyName,
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
					personalMetadata,
					context: mdContent.map((md) => md.markdown),
				});

				// Save completed form
				await fs.writeFile(
					`${assetPath}/completedForm.json`,
					JSON.stringify(completedForm),
				);
				await fs.writeFile(
					`${assetPath}/${toKebabCase(applicationDetails.companyInfo.name.toLowerCase())}-cover-letter.txt`,
					completedForm.coverLetter,
					{ encoding: "utf-8" },
				);

				await updateSession(userId, sessionId, { completedForm });
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

			await updateSession(userId, sessionId, { status: "completed" });
			return result;
		}
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		await updateSession(userId, sessionId, {
			status: "failed",
			error: errorMessage,
		});
		throw error;
	}
}
