import { randomFillSync } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { load } from "cheerio";
import MarkdownIt from "markdown-it";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import type { Page } from "puppeteer";
import { toKebabCase } from "remeda";
import Turndown from "turndown";
import z from "zod";
import MCPClient from "./mcp/playwright/client.ts";
import puppeteer from "./puppeteer.ts";

const turndown = new Turndown();
const md = new MarkdownIt();
const openai = new OpenAI({
	apiKey: process.env.GEMINI_API_KEY,
	baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
});
const tmpDir = "tmp";

const resumeSystemPrompt = `
  You are an expert technical recruiter that can help me tailor my resume to a specific job. \n
  You will be given a job description and my resume. \n
  You will need to generate a new resume that is tailored to the job description. \n
  Think step by step and carefully consider the requirements and the resume. \n
  In tailoring the resume, keep some wiggle room for missing requirements and skills. \n
	The goal is to greatly increase the skills match between the resume and the job description. \n

  There will be a list of questions that are present in the job description. \n
  Try your best to directly answer the questions using the information present in the resume. The goal is to help me get the job. \n
  If you cannot answer the question, you should say so.
`;

const coverLetterSystemPrompt = `
  You are an expert technical writer that can help me write a cover letter for a specific job. \n
  You will be given a job description and my resume. \n
  You will need to write a cover letter that is tailored to the job description. \n
  Think step by step and carefully consider the requirements and the resume. \n
  In tailoring the cover letter, keep some wiggle room for missing requirements and skills. \n

  The cover letter should be in letter format. \n
  The cover letter should be 1-2 paragraphs. \n
	Write the cover letter in raw text.

	Example:
		Dear Motion Hiring Team,

		I am writing to express my keen interest in the Senior Product Engineer (Full Stack) position at Motion. With over 5 years of experience in full-stack development and a passion for building user-facing products, I am confident I possess the skills and drive to thrive in your fast-paced environment. My expertise in React, TypeScript, and Node.js, coupled with my experience in cloud technologies like AWS and data engineering, aligns well with the requirements outlined in the job description. In my previous role at Euclidean, I led the development of core modules for a mental health web dashboard, resulting in a 45% increase in practitioner satisfaction. I am particularly drawn to Motion's focus on leveraging AI/ML to augment creative strategists' abilities, and I am eager to contribute to building cutting-edge solutions in the creative-tech space.

		I am excited about the opportunity to join Motion's ambitious team and contribute to building a category-defining company. The prospect of owning a major initiative within the first three months and working on impactful projects from day one is highly appealing. I am particularly interested in Motion's culture of ownership, collaboration, and continuous learning, and I am confident that my skills and experience would make me a valuable asset to your team. Thank you for your time and consideration. I look forward to hearing from you soon.

		Sincerely,
		Michael John Eduave
`;

const ResumeSchema = z.object({
	resume: z.string().describe("The new resume in markdown format"),
	reasoning: z
		.string()
		.describe("The reasoning and steps taken to generate the new resume"),
	company: z.string().describe("The company name"),
	jobTitle: z.string().describe("The job title"),
	questionsAnswered: z
		.array(z.string())
		.describe(
			"Questions present in the job description with their answers in markdown format. The questions should be in bold and the answers should be in a new line."
		),
});

async function adjustResume(
	requirements: string,
	resume: string
): Promise<{
	data: z.infer<typeof ResumeSchema>;
	usage: {
		prompt_tokens: number;
		completion_tokens: number;
		total_tokens: number;
	};
}> {
	console.log("Adjusting resume based on requirements...");
	const response = await openai.chat.completions.create({
		model: "gemini-2.5-pro-preview-05-06",
		// model: "gemini-2.0-flash",
		response_format: zodResponseFormat(ResumeSchema, "json_object"),
		messages: [
			{ role: "system", content: resumeSystemPrompt },
			{
				role: "user",
				content: `
        Requirements:
        ${requirements}

        Resume:
        ${resume}
      `,
			},
		],
	});

	return {
		data: JSON.parse(response.choices[0].message.content ?? "{}"),
		usage: response.usage!,
	};
}

async function generateLatexResume(reference: string, resume: string) {
	console.log("Generating LaTeX resume based on reference and resume...");
	const response = await openai.chat.completions.create({
		model: "gemini-2.0-flash",
		temperature: 0,
		response_format: zodResponseFormat(
			z.object({
				resume: z.string().describe("The new resume in latex format"),
			}),
			"json_object"
		),
		messages: [
			{
				role: "system",
				content: `
          You are an expert latex writer that can help me generate a latex resume. \n
          You are given a reference resume and my resume. \n
          Follow the reference resume as closely as possible. \n
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

	return JSON.parse(response.choices[0].message.content ?? "{}");
}

async function generateCoverLetter(requirements: string, resume: string) {
	console.log("Generating cover letter based on requirements...");
	const response = await openai.chat.completions.create({
		model: "gemini-2.5-pro-preview-05-06",
		// model: "gemini-2.0-flash",
		temperature: 0.2,
		messages: [
			{ role: "system", content: coverLetterSystemPrompt },
			{
				role: "user",
				content: `
        Requirements:
        ${requirements}

        Resume:
        ${resume}
      `,
			},
		],
	});

	return response.choices[0].message.content;
}

async function generatePdf(latexResume: string) {
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

async function extractPageReq(url: string, playwrightClient: MCPClient) {
	const prompt = `
		You are a web scraper that can extract the main content of a webpage. \n
		Your task is to visit the given URL and extract the main content\n

		You will be given a list of tools that you can use to extract the content. \n
		Only return the content of the page.
	`;

	const messages: ChatCompletionMessageParam[] = [
		{
			role: "system",
			content: prompt,
		},
		{
			role: "user",
			content: url,
		},
	];

	const maxSteps = 10;
	let steps = 0;

	while (steps < maxSteps) {
		steps++;
		const response = await openai.chat.completions.create({
			model: "gemini-2.5-flash-preview-04-17",
			temperature: 0.2,
			messages,
			tools: playwrightClient.tools.map((tool) => ({
				type: "function",
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.inputSchema,
				},
			})),
		});

		if (response.choices[0].finish_reason === "stop") {
			return response.choices[0].message.content || "";
		}

		if (response.choices[0].message.tool_calls) {
			for (const toolCall of response.choices[0].message.tool_calls) {
				const toolName = toolCall.function.name;
				const toolArgs = toolCall.function.arguments;
				const id =
					toolCall.id ||
					`${toolCall.function.name}-${randomFillSync(Buffer.alloc(10)).toString("hex")}`;

				const result = await playwrightClient.callTool({
					name: toolName,
					args: toolArgs,
				});

				messages.push({
					role: "user",
					content: JSON.stringify(result.content),
				});
			}
		}
	}

	return "No content extracted after maximum steps reached.";
}

async function submitApplication(
	dir: string,
	url: string,
	resume: string,
	coverLetter: string,
	playwrightClient: MCPClient
) {
	const prompt = `
		You are a web automation expert that can help me submit a job application. \n
		You will be given a URL to the job application page. \n
		Your task is to fill out the application form but do not submit it. \n
		When filling up the form, use the information provided in the resume and cover letter. Use the available tools in parallel to fill out the form. \n
		You will be given a list of tools that you can use to fill out the form. \n
		The directory for the files needed for the application will be provided by the user.
	`;

	const messages: ChatCompletionMessageParam[] = [
		{
			role: "system",
			content: prompt,
		},
		{
			role: "user",
			content: `
				Please visit the following URL and submit the application: ${url} \n
				Resume: ${dir}/resume.pdf \n
				Cover Letter: ${dir}/cover-letter.txt \n

				Resume in markdown format: \n
				${resume} \n

				Cover Letter: \n
				${coverLetter} \n

				Personal information:\n
				LinkedIn: https://www.linkedin.com/in/meduave/ \n
				GitHub: https://github.com/michaeljohneduave \n
			`,
		},
	];

	const maxSteps = 20;
	let steps = 0;

	while (steps < maxSteps) {
		steps++;
		const response = await openai.chat.completions.create({
			model: "gemini-2.5-flash-preview-04-17",
			temperature: 0.2,
			messages,
			tools: playwrightClient.tools.map((tool) => ({
				type: "function",
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.inputSchema,
				},
			})),
		});

		if (response.choices[0].finish_reason === "stop") {
			return response.choices[0].message.content || "";
		}

		if (response.choices[0].message.tool_calls) {
			for (const toolCall of response.choices[0].message.tool_calls) {
				const toolName = toolCall.function.name;
				const toolArgs = toolCall.function.arguments;
				const id =
					toolCall.id ||
					`${toolCall.function.name}-${randomFillSync(Buffer.alloc(10)).toString("hex")}`;
				console.log("Tool call:", toolName, toolArgs);
				const result = await playwrightClient.callTool({
					name: toolName,
					args: toolArgs,
				});

				messages.push({
					role: "user",
					content: JSON.stringify(result.content),
				});
			}
		}
	}

	return "No content extracted after maximum steps reached.";
}

async function main() {
	const playwrightClient = new MCPClient();

	try {
		const resumeMd = await readFile("assets/resume.md", "utf8");
		const resumeTex = await readFile("assets/resume.tex", "utf8");
		const readline = createInterface({
			input: stdin,
			output: stdout,
			prompt: "Enter the job description URL: ",
		});
		await playwrightClient.connectToServer();

		const url = await readline.question("Enter the job description URL: ");
		const requirements = await extractPageReq(url, playwrightClient);

		const [resumeData, coverLetterData] = await Promise.all([
			adjustResume(requirements, resumeMd),
			generateCoverLetter(requirements, resumeMd),
		]);
		const {
			company: c,
			jobTitle: jt,
			resume: newResume,
			reasoning,
			questionsAnswered,
		} = resumeData.data;
		const { resume: latexResume } = await generateLatexResume(
			resumeTex,
			newResume
		);

		if (!coverLetterData) {
			throw new Error("Cover letter generation failed");
		}

		const jobTitle = toKebabCase(jt);
		const company = toKebabCase(c);

		const pdfGeneration = await generatePdf(latexResume);

		await mkdir(`${tmpDir}/${company}-${jobTitle}`, {
			recursive: true,
		})
			.catch((err) => {
				if (err.code === "EEXIST") {
					console.log(`${company}-${jobTitle} already exists`);
					return rm(`${tmpDir}/${company}-${jobTitle}`, {
						recursive: true,
						force: true,
					});
				}

				throw err;
			})
			.then(() => {
				return Promise.all([
					writeFile(
						`${tmpDir}/${company}-${jobTitle}/requirements.md`,
						requirements
					),
					writeFile(`${tmpDir}/${company}-${jobTitle}/resume.md`, newResume),
					writeFile(`${tmpDir}/${company}-${jobTitle}/reasoning.md`, reasoning),
					writeFile(
						`${tmpDir}/${company}-${jobTitle}/questions-answered.md`,
						questionsAnswered.join("\n")
					),
					writeFile(
						`${tmpDir}/${company}-${jobTitle}/cover-letter.txt`,
						coverLetterData ?? ""
					),
					writeFile(
						`${tmpDir}/${company}-${jobTitle}/resume.tex`,
						latexResume ?? ""
					),
					writeFile(
						`${tmpDir}/${company}-${jobTitle}/resume.pdf`,
						Buffer.from(pdfGeneration)
					),
				]);
			});

		// await submitApplication(
		// 	`${tmpDir}/${company}-${jobTitle}`,
		// 	url,
		// 	newResume,
		// 	coverLetterData,
		// 	playwrightClient
		// );

		// const newResume = await readFile(
		// 	"tmp/ada-senior-engineer/resume.md",
		// 	"utf8"
		// );
		// const coverLetter = await readFile(
		// 	"tmp/ada-senior-engineer/cover-letter.txt",
		// 	"utf8"
		// );

		// await submitApplication(
		// 	`${process.cwd()}/tmp/ada-senior-engineer`,
		// 	"https://job-boards.greenhouse.io/ada18/jobs/4648956007",
		// 	newResume,
		// 	coverLetter,
		// 	playwrightClient
		// );

		playwrightClient.cleanup();
		process.exit(0);
	} catch (e) {
		console.error("Error occurred:", e);
		if (playwrightClient) {
			await playwrightClient.cleanup();
		}
		process.exit(1);
	}
}

main();
