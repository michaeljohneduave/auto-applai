import fs from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import type { z } from "zod";
import { formCompleter } from "./formCompletion.ts";
import { formFiller } from "./formFiller.ts";
import LLM, { BIG_MODEL, SMALL_MODEL } from "./llm.ts";
import { jobPostingSchema, urlExtractorSchema } from "./schema.ts";
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
You are an agentic expert crawler with a singular goal of finding the job application form

# Instructions
1. You are given a url of a job posting
2. Use the tools provided for you to scrape and analyze the html content of the page
3. If you don't see an application form, try to check the links in the page.
4. Write the url of the page that achieves the user's goal in plain text.
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
You are an expert resume writer.

# Instructions
1. You are given a base resume from the user and an html content of the job posting.
2. Your goal is to carefully adjust the resume to fit the job posting.
3. Add or remove content from the base resume to tailor fit the new resume to the job posting
4. Strictly follow the formatting of the base resume
5. Convert relevant skills into bold font weights, strictly for technical skills and technologies
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

	const response = await llm.generateOutput({
		temperature: 0.1,
		top_p: 0.9,
		messages: [
			{
				role: "system",
				content: `
# Identity
You are an expert in generating latex documents.

# Instructions
1. You will be given a reference latex resume and an updated resume in markdown format.
2. Convert the updated resume in latex.
3. Do not include any other text or formatter, just directly output the resume in latex format.
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
	});

	if (!response.choices[0].message.content) {
		throw new Error("Failed to generate latex resume");
	}

	return response.choices[0].message.content;
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
You are a expert in job information extraction.

# Instructions
1. Given an html, look for the following information, Company info, Job info, Application form.
2. Extract ALL the fields and labels in the form.
3. Transform the label into a question and infer what type of question
4. The goal is to extract all the information needed to apply to the job
5. Carefully analyze the html for forms, the application form must be present in order to be considered part of the applicationForm output
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

async function orchestrator(jobUrl: string) {
	const ratingThreshold = 8;
	const mdContent: {
		markdown: string;
		rating: number;
		url: string;
		reasoning: string;
	}[] = [];
	const [resume, latexReferenceResume, personalInfo] = await Promise.all([
		fs.readFile("assets/resume.md", "utf-8"),
		fs.readFile("assets/resume.tex", "utf-8"),
		fs.readFile("assets/personal-info.md", "utf-8"),
	]);
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

try {
	while (true) {
		const url = await readline.question("URL: ");
		await orchestrator(url);
	}
} catch (e) {
	console.error(e);
}

process.exit(0);
