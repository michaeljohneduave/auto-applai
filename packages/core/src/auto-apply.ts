import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { emitSessionUpdate } from "@auto-apply/common";
import { and, desc, eq, sql } from "drizzle-orm";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import { toKebabCase } from "remeda";
import type { z } from "zod";
import { llmFormCrawler } from "../src/crawler.ts";
import { generateResume } from "../src/generateResume.ts";
import { db } from "./db/db.ts";
import {
	resumeVariants,
	type Sessions,
	sessionHtml,
	sessions,
	users,
} from "./db/schema.ts";
import { extractInfo } from "./extractInfo.ts";
import { formCompleter } from "./formCompletion.ts";
import LLM, { GEMINI_25_FLASH, GEMINI_25_FLASH_LITE } from "./llm.ts";
import {
	type formCompleterSchema,
	type jobPostingSchema,
	latexResumeSchema,
	personalInfoSchema,
	type resumeCritiqueSchema,
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
	const llm = new LLM("latex-resume-generator", {
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

<preamble>
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
</preamble>

Here is a good reference for a Berkeley-format resume:
---
${latexResume}
---

After the preamble, start with \\begin{document} and end with \\end{document}.  

Parse the Markdown step by step:

1. Header → centered \\textbf{\\Large Name}, location | email (mailto) | website (href).  
2. Summary → plain paragraph under the center block.  
3. Sections ("Skills", "Experience", "Projects", "Education") → \\section*{}  
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

async function loadApplicationContext(sessionId: string, userId: string) {
	try {
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.userId, userId));

		if (!user) {
			throw new Error("User not found.");
		}

		const llm = new LLM("load-personal-info", {
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
${user.baseResumeMd}
</resume>

<personal-info>
${user.personalInfoMd}
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

		return {
			resume: user.baseResumeMd,
			latexReferenceResume: user.baseResumeLatex,
			personalMetadata: user.personalInfoMd,
			personalInfo,
		};
	} catch (error) {
		console.error("Failed to load application context:", error);
		throw error;
	}
}

async function saveAssets(
	userId: string,
	sessionId: string,
	applicationDetails: z.infer<typeof jobPostingSchema>,
	personalInfo: z.infer<typeof personalInfoSchema>,
	latexResume: string,
	adjustedResume: string,
	latexPdf: ArrayBuffer,
	generatedResumes: string[],
	generatedEvals: z.infer<typeof resumeCritiqueSchema>[],
	lesserLatexResumes: string[],
) {
	const companyName = applicationDetails.companyInfo.name.replace(" ", "-");
	const assetPath = `assets/sessions/${userId}/${companyName}/${sessionId}-${isoFileSuffixUTC(
		new Date(),
		{
			isLocal: true,
		},
	)}`;

	await fs.mkdir(assetPath, { recursive: true });
	await fs.writeFile(
		`${assetPath}/${toKebabCase(personalInfo.fullName)}-${toKebabCase(applicationDetails.companyInfo.shortName.toLowerCase())}-resume.pdf`,
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

	for (let i = 0; i < lesserLatexResumes.length; i++) {
		await fs.writeFile(
			`${assetPath}/lesser-latex-resume-${i + 1}.tex`,
			lesserLatexResumes[i],
		);
	}

	await fs.writeFile(
		`${assetPath}/application-details.json`,
		JSON.stringify(applicationDetails),
	);
}

async function storeSessionHtml(
	sessionId: string,
	html: string,
	screenshot?: string,
) {
	await db.insert(sessionHtml).values({
		sessionId,
		html,
		screenshot,
	});
}

async function handleFirstTimeHtml(
	sessionId: string,
	html: string,
): Promise<z.infer<typeof jobPostingSchema>> {
	await storeSessionHtml(sessionId, html);
	return await extractInfo(html, sessionId);
}

async function handleRetryHtml(
	sessionId: string,
): Promise<z.infer<typeof jobPostingSchema>> {
	// For retries, just get the existing HTML and process it
	// No appending or additional checks since it's a manual user action
	const [existingHtml] = await db
		.select()
		.from(sessionHtml)
		.where(eq(sessionHtml.sessionId, sessionId))
		.orderBy(desc(sessionHtml.createdAt))
		.limit(1);

	if (!existingHtml) {
		throw new Error("No stored HTML found for retry");
	}

	// Simply extract info from the existing HTML
	return await extractInfo(existingHtml.html, sessionId);
}

function shouldAppendHtml(
	existingSession: Sessions,
	newApplicationDetails: z.infer<typeof jobPostingSchema>,
): boolean {
	const hasExistingForms =
		existingSession.applicationForm &&
		existingSession.applicationForm.length > 0;
	const hasNewForms = newApplicationDetails.applicationForm.length > 0;
	const hasExistingJobInfo = Boolean(
		existingSession.jobInfo && existingSession.companyInfo,
	);
	const hasNewJobInfo = Boolean(
		newApplicationDetails.jobInfo && newApplicationDetails.companyInfo,
	);

	return (
		(hasExistingForms &&
			!hasNewForms &&
			hasNewJobInfo &&
			!hasExistingJobInfo) || // Existing has forms, new has job info
		(!hasExistingForms &&
			hasNewForms &&
			hasExistingJobInfo &&
			!hasNewJobInfo) || // Existing has job info, new has forms
		(!hasExistingForms && hasNewForms) || // Neither has job info, but new has forms - just append
		(!hasExistingJobInfo && hasNewJobInfo) // Neither has forms, but new has job info - just append
	);
}

async function appendHtmlToExisting(
	sessionId: string,
	newHtml: string,
): Promise<z.infer<typeof jobPostingSchema>> {
	const [existingHtml] = await db
		.select()
		.from(sessionHtml)
		.where(eq(sessionHtml.sessionId, sessionId))
		.orderBy(desc(sessionHtml.createdAt))
		.limit(1);

	if (!existingHtml) {
		throw new Error("No existing HTML found to append to");
	}

	// Append new HTML to existing
	const combinedHtml =
		existingHtml.html + "\n<!-- ADDITIONAL CONTENT -->\n" + newHtml;

	// Update existing record with combined HTML
	await db
		.update(sessionHtml)
		.set({ html: combinedHtml })
		.where(eq(sessionHtml.id, existingHtml.id));

	// Extract info from combined HTML
	return await extractInfo(combinedHtml, sessionId);
}

async function handleExistingSessionHtml(
	existingSession: Sessions,
	sessionId: string,
	html: string,
): Promise<z.infer<typeof jobPostingSchema>> {
	// Extract info from new HTML
	const newApplicationDetails = await extractInfo(html, sessionId);

	// Check if we need to append
	if (shouldAppendHtml(existingSession, newApplicationDetails)) {
		return await appendHtmlToExisting(sessionId, html);
	} else {
		// Use existing session data (avoid duplicates)
		// Create a partial object that matches the schema structure
		const result: Partial<z.infer<typeof jobPostingSchema>> = {
			applicationForm: existingSession.applicationForm || [],
		};

		// Only include non-null values
		if (existingSession.companyInfo) {
			result.companyInfo = existingSession.companyInfo;
		}
		if (existingSession.jobInfo) {
			result.jobInfo = existingSession.jobInfo;
		}

		return result as z.infer<typeof jobPostingSchema>;
	}
}

// Function overloads
async function updateSession(
	userId: string,
	sessionId: string,
	setObj: Partial<Omit<Sessions, "id" | "userId" | "url">>,
	options: { shouldReturn: true },
): Promise<Sessions>;

async function updateSession(
	userId: string,
	sessionId: string,
	setObj: Partial<Omit<Sessions, "id" | "userId" | "url">>,
	options?: { shouldReturn?: false | undefined },
): Promise<void>;

// Implementation
async function updateSession(
	userId: string,
	sessionId: string,
	setObj: Partial<Omit<Sessions, "id" | "userId" | "url">>,
	options: {
		shouldReturn?: boolean;
	} = {
		shouldReturn: false,
	},
): Promise<Sessions | void> {
	const op = db
		.update(sessions)
		.set(setObj)
		.where(and(eq(sessions.userId, userId), eq(sessions.id, sessionId)));

	emitSessionUpdate({
		userId,
		sessionId,
	});

	if (options.shouldReturn) {
		return await op.returning().then((res) => res[0]);
	}

	await op;
}

export async function runWithUrl(
	userId: string,
	sessionId: string,
	jobUrl: string,
) {
	try {
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
		} = await loadApplicationContext(sessionId, userId);

		await updateSession(userId, sessionId, {
			currentStep: "scraping",
		});

		const { html, screenshot } = await htmlCrawler(jobUrl);

		// Store HTML for potential retries (only on first run, not retries)
		const existingHtmlCount = await db
			.select({ count: sql<number>`count(*)` })
			.from(sessionHtml)
			.where(eq(sessionHtml.sessionId, sessionId));

		if (existingHtmlCount[0]?.count === 0) {
			await storeSessionHtml(sessionId, html, screenshot);
		}

		let applicationDetails = await extractInfo(html, sessionId);

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
			applicationDetails = await extractInfo(html22, sessionId);
		}

		await updateSession(userId, sessionId, {
			title: applicationDetails.jobInfo.title,
			companyInfo: applicationDetails.companyInfo,
			jobInfo: applicationDetails.jobInfo,
			applicationForm: applicationDetails.applicationForm,
			personalInfo,
		});

		// await updateSession(userId, sessionId, {
		// 	applicationDetails,
		// 	screenshot: Buffer.from(screenshot, "base64"),
		// });

		if (!applicationDetails.applicationForm.length) {
			await updateSession(userId, sessionId, {
				currentStep: "agentic_scraping",
			});

			const crawledUrl = await llmFormCrawler(jobUrl, sessionId);
			formUrl = crawledUrl.match(urlRegex)?.[0] || jobUrl;

			const { html } = await htmlCrawler(formUrl);
			const details = await extractInfo(html, sessionId);

			if (!details.applicationForm.length) {
				console.log("No application form found");
				// throw new Error("No application form found");
			}
			applicationDetails.applicationForm = details.applicationForm;
		}

		await updateSession(userId, sessionId, {
			currentStep: "generating_resume",
		});

		const currentSession = await db.query.sessions.findFirst({
			where: (s) => and(eq(s.userId, userId), eq(s.id, sessionId)),
		});

		const { adjustedResume, generatedEvals, generatedResumes } =
			await generateResume(
				ogResumeMd,
				applicationDetails,
				sessionId,
				currentSession?.notes || undefined,
			);

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
		const assetPath = `assets/sessions/${userId}/${companyName}/${sessionId}-${isoFileSuffixUTC(
			new Date(),
			{
				isLocal: true,
			},
		)}`;

		// Save assets
		// await updateSession(userId, sessionId, {
		// 	currentStep: "saving assets",
		// 	status: "processing",
		// });

		await fs.mkdir(assetPath, { recursive: true });
		await fs.writeFile(
			`${assetPath}/${toKebabCase(personalInfo.fullName)}-${toKebabCase(applicationDetails.companyInfo.name.toLowerCase())}-resume.pdf`,
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
		// await updateSession(userId, sessionId, {
		// 	company_name: companyName,
		// 	adjustedResume,
		// 	latexResume,
		// 	latexPdf: Buffer.from(latexPdf),
		// 	formUrl,
		// 	assetPath,
		// });

		await updateSession(userId, sessionId, {
			assetPath,
		});

		let completedForm: z.infer<typeof formCompleterSchema> | null = null;

		if (applicationDetails.applicationForm.length) {
			// Complete form with interactive clarifications

			completedForm = await formCompleter({
				sessionId,
				applicationDetails,
				resume: ogResumeMd,
				personalMetadata,
				context: mdContent.map((md) => md.markdown),
				notes: currentSession?.notes || undefined,
			});

			await updateSession(userId, sessionId, {
				answeredForm: completedForm,
				coverLetter: completedForm?.coverLetter,
			});

			await fs.writeFile(
				`${assetPath}/completedForm.json`,
				JSON.stringify(completedForm),
			);
			await fs.writeFile(
				`${assetPath}/${toKebabCase(applicationDetails.companyInfo.name.toLowerCase())}-cover-letter.txt`,
				completedForm.coverLetter,
				{ encoding: "utf-8" },
			);
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
		await updateSession(userId, sessionId, {
			sessionStatus: "done",
			currentStep: "ready_to_use",
		});
		return result;
	} catch (error) {
		// const errorMessage =
		// 	error instanceof Error ? error.message : "Unknown error";
		await updateSession(userId, sessionId, {
			sessionStatus: "failed",
		});
		throw error;
	}
}

export async function runWithHtml(
	userId: string,
	sessionId: string,
	html: string,
	retry: boolean = false,
) {
	try {
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
		} = await loadApplicationContext(sessionId, userId);

		let session = await updateSession(
			userId,
			sessionId,
			{
				currentStep: "extracting_info",
			},
			{
				shouldReturn: true,
			},
		);

		// Retry path: short-circuit to using stored HTML only (no extra queries)
		let applicationDetails: z.infer<typeof jobPostingSchema>;
		if (retry) {
			applicationDetails = await handleRetryHtml(sessionId);
		} else {
			// Check if any HTML exists for the session using an existence-style query
			const [existing] = await db
				.select({ id: sessionHtml.id })
				.from(sessionHtml)
				.where(eq(sessionHtml.sessionId, sessionId))
				.limit(1);

			if (!existing) {
				// First time: store and extract
				applicationDetails = await handleFirstTimeHtml(sessionId, html);
			} else {
				// Existing session: decide whether to append, using the already-fetched session
				applicationDetails = await handleExistingSessionHtml(
					session,
					sessionId,
					html,
				);
			}
		}

		if (!session) {
			throw new Error("Attempted to update session but it failed");
		}

		const setObj = {
			personalInfo,
		} as Partial<Sessions>;
		if (
			applicationDetails.applicationForm.length &&
			!session.applicationForm?.length
		) {
			setObj.applicationForm = applicationDetails.applicationForm;
		}

		if (applicationDetails.companyInfo && !session.companyInfo) {
			setObj.companyInfo = applicationDetails.companyInfo;
		}

		if (applicationDetails.jobInfo && !session.jobInfo) {
			setObj.jobInfo = applicationDetails.jobInfo;
		}

		session = await updateSession(
			userId,
			sessionId,
			{
				...setObj,
				title: session.title || applicationDetails.jobInfo.title,
				companyName:
					session.companyInfo?.name || applicationDetails.companyInfo.name,
				currentStep: "generating_resume",
			},
			{
				shouldReturn: true,
			},
		);

		if (!session) {
			throw new Error("Failed to update session");
		}

		if (!(session.jobInfo && session.companyInfo)) {
			await updateSession(userId, sessionId, {
				sessionStatus: "no-job-info",
			});

			return;
		}

		let assetPath = session.assetPath;

		// If the session doesn't have an assetPath, its lacking the generated resume
		// We only skip this if we encounter a html content for application form (no job+company details)
		if (!assetPath) {
			const { adjustedResume, generatedEvals, generatedResumes } =
				await generateResume(
					ogResumeMd,
					applicationDetails,
					sessionId,
					session?.notes || undefined,
				);

			await updateSession(userId, sessionId, {
				currentStep: "generating_latex",
			});

			const [latexResume, ...lesserLatexResumes] = await Promise.all([
				latexResumeGenerator(latexReferenceResume, adjustedResume, sessionId),
				...generatedResumes
					.filter((resume) => resume !== adjustedResume)
					.map((resume) =>
						latexResumeGenerator(latexReferenceResume, resume, sessionId),
					),
			]);

			await updateSession(userId, sessionId, {
				currentStep: "generating_pdf",
			});

			const latexPdf = await generatePdf(latexResume);

			const companyName = applicationDetails.companyInfo.name.replace(" ", "-");
			assetPath = `assets/sessions/${userId}/${companyName}/${sessionId}-${isoFileSuffixUTC(
				new Date(),
				{
					isLocal: true,
				},
			)}`;

			// Save assets
			await updateSession(userId, sessionId, {
				currentStep: "saving_assets",
				sessionStatus: "processing",
			});

			await saveAssets(
				userId,
				sessionId,
				applicationDetails,
				personalInfo,
				latexResume,
				adjustedResume,
				latexPdf,
				generatedResumes,
				generatedEvals,
				lesserLatexResumes,
			);

			// Persist resume variants in DB (no backfill for old sessions)
			try {
				// Determine best index by matching adjustedResume to generatedResumes
				const bestIndex = generatedResumes.findIndex(
					(r) => r === adjustedResume,
				);
				// Insert best variant
				const bestEval = bestIndex >= 0 ? generatedEvals[bestIndex] : undefined;
				await db.insert(resumeVariants).values({
					id: randomUUID(),
					sessionId,
					variantKey: "best",
					orderIndex: 0,
					name: "resume.tex",
					latex: latexResume,
					eval: bestEval || null,
					score:
						bestEval?.overallGutCheck?.tailoringScore !== undefined
							? Math.round(bestEval.overallGutCheck.tailoringScore)
							: null,
				});

				// Build mapping for lesser variants: generatedResumes minus best, preserving order
				const remainingIndexes: number[] = generatedResumes
					.map((_, idx) => idx)
					.filter((idx) => idx !== bestIndex);

				for (let i = 0; i < lesserLatexResumes.length; i++) {
					const idx = remainingIndexes[i];
					const ev = idx !== undefined ? generatedEvals[idx] : undefined;
					await db.insert(resumeVariants).values({
						id: randomUUID(),
						sessionId,
						variantKey: `lesser-${i + 1}`,
						orderIndex: i + 1,
						name: `lesser-latex-resume-${i + 1}.tex`,
						latex: lesserLatexResumes[i],
						eval: ev || null,
						score:
							ev?.overallGutCheck?.tailoringScore !== undefined
								? Math.round(ev.overallGutCheck.tailoringScore)
								: null,
					});
				}
			} catch (e) {
				console.error("Failed to persist resume variants:", e);
			}

			await updateSession(userId, sessionId, {
				assetPath,
			});
		}

		// Complete form with interactive clarifications
		const completedForm = await formCompleter({
			sessionId,
			applicationDetails,
			resume: ogResumeMd,
			personalMetadata,
			context: mdContent.map((md) => md.markdown),
			notes: session?.notes || undefined,
		});

		await updateSession(userId, sessionId, {
			answeredForm: completedForm,
			coverLetter: completedForm?.coverLetter,
		});

		await fs.writeFile(
			`${assetPath}/completedForm.json`,
			JSON.stringify(completedForm),
		);
		await fs.writeFile(
			`${assetPath}/${toKebabCase(applicationDetails.companyInfo.name.toLowerCase())}-cover-letter.txt`,
			completedForm.coverLetter,
			{ encoding: "utf-8" },
		);

		await updateSession(userId, sessionId, {
			sessionStatus: "done",
			currentStep: "ready_to_use",
		});
	} catch (error) {
		await updateSession(userId, sessionId, {
			sessionStatus: "failed",
		});
		throw error;
	}
}
