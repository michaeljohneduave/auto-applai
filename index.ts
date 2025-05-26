import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { load } from "cheerio";
import MarkdownIt from "markdown-it";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { Page } from "puppeteer";
import Turndown from "turndown";
import z from "zod";
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
  The cover letter should be 1-2 paragraphs.
`

const ResumeSchema = z.object({
  resume: z.string().describe("The new resume in markdown format"),
  reasoning: z.string().describe("The reasoning and steps taken to generate the new resume"),
  company: z.string().describe("The company name"),
  jobTitle: z.string().describe("The job title"),
  questionsAnswered: z.array(z.string()).describe("Questions present in the job description with their answers in markdown format. The questions should be in bold and the answers should be in a new line."),
})

async function generateResume(requirements: string, resume: string): Promise<{
  data: z.infer<typeof ResumeSchema>,
  usage: ReturnType<typeof openai.chat.completions.create>["responsePromise"]["usage"],
}> {
  const response = await openai.chat.completions.create({
    model: "gemini-2.5-pro-preview-05-06",
    response_format: zodResponseFormat(ResumeSchema, "json_object"),
    messages: [
      { role: "system", content: resumeSystemPrompt },
      { role: "user", content: `
        Requirements:
        ${requirements}

        Resume:
        ${resume}
      ` },
    ],
  });

  return {
    data: JSON.parse(response.choices[0].message.content ?? "{}"),
    usage: response.usage,
  };
}

async function generateLatexResume(reference: string, resume: string) {
  const response = await openai.chat.completions.create({
    model: "gemini-2.0-flash",
    temperature: 0,
    response_format: zodResponseFormat(z.object({
      resume: z.string().describe("The new resume in latex format"),
    }), "json_object"),
    messages: [
      { role: "system", content: `
          You are an expert latex writer that can help me generate a latex resume. \n
          You are given a reference resume and my resume. \n
          Follow the reference resume as closely as possible. \n
      ` },
      { role: "user", content: `
        Reference Resume:
        ${reference}

        My Resume:
        ${resume}
      ` },
    ],
  });

  return JSON.parse(response.choices[0].message.content ?? "{}");
}

async function generateCoverLetter(requirements: string, resume: string) {
  const response = await openai.chat.completions.create({
    model: "gemini-2.5-pro-preview-05-06",
    temperature: 0.2,
    messages: [
      { role: "system", content: coverLetterSystemPrompt },
      { role: "user", content: `
        Requirements:
        ${requirements}

        Resume:
        ${resume}
      ` },
    ],
  });

  return response.choices[0].message.content;
}

async function generatePdf(page: Page, resume: string) {
  const content = md.render(resume);
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>My PDF</title>
      <style>
        body { font-family: sans-serif; margin: 2em; }
        h1 { color: #333; }
        pre { background-color: #f4f4f4; padding: 1em; border-radius: 5px; }
        code { font-family: monospace; }
      </style>
    </head>
    <body>
      ${content}
    </body>
    </html>
  `;

  page.setContent(html, { waitUntil: "domcontentloaded" });
  await page.pdf({ path: "new-resume.pdf", format: "A4" });
  await page.close();
}

async function main() {
  const resumeMd = await readFile("assets/resume.md", "utf8")
  const resumeTex = await readFile("assets/resume.tex", "utf8")
  const readline = createInterface({
    input: stdin,
    output: stdout,
  });

  const muppeteer = new puppeteer();
  await muppeteer.initialize();

  // Wait for user to input via cli
  const input = await readline.question("Enter a URL: ");
  const page = await muppeteer.newPage(input);
  const html = await page.content();
  const $ = load(html);

  await page.close();
  $('script, style, link, meta, noscript, iframe, header, footer, nav, aside, .cookie-banner, .ads')
  .remove();

  const requirements = turndown.turndown($("body").html());
  const [resumeData, coverLetterData] = await Promise.all([
    generateResume(requirements, resumeMd),
    generateCoverLetter(requirements, resumeMd),
  ]);
  const {company, jobTitle, resume: newResume, reasoning, questionsAnswered} = resumeData.data;
  const {resume: latexResume} = await generateLatexResume(resumeTex, newResume);

  await mkdir(`${tmpDir}/${company}-${jobTitle}`, {
    recursive: true,
  })
  .catch(err => {
    if (err.code === "EEXIST") {
      console.log(`${company}-${jobTitle} already exists`);
      return rm(`${tmpDir}/${company}-${jobTitle}`, { recursive: true, force: true });
    }

    throw err;
  }).then(() => {
    return Promise.all([
      writeFile(`${tmpDir}/${company}-${jobTitle}/requirements.md`, requirements),
      writeFile(`${tmpDir}/${company}-${jobTitle}/resume.md`, newResume),
      writeFile(`${tmpDir}/${company}-${jobTitle}/reasoning.md`, reasoning),
      writeFile(`${tmpDir}/${company}-${jobTitle}/questions-answered.md`, questionsAnswered.join("\n")),
      writeFile(`${tmpDir}/${company}-${jobTitle}/cover-letter.txt`, coverLetterData ?? ""),
      writeFile(`${tmpDir}/${company}-${jobTitle}/resume.tex`, latexResume ?? ""),
    ]);
  });

  if (!newResume) {
    console.error("Failed to generate new resume");
    process.exit(1);
  }

  await generatePdf(await muppeteer.newPage(), newResume);

  await muppeteer.close();
  process.exit(0);
}

main();