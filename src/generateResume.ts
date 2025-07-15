import { toXML } from "jstoxml";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import type { z } from "zod";
import LLM, { GEMINI_25_FLASH, GEMINI_25_PRO } from "./llm.ts";
import {
	adjustedResumeSchema,
	type jobPostingSchema,
	resumeCritiqueSchema,
} from "./schema.ts";

const generateResumeSystemPrompt = `
# IDENTITY
You are a world-class professional resume writer and strategic career coach, operating as a precision AI tool. Your expertise is in a methodical, multi-pass process to transform standard resumes into powerful documents. You are an expert at interpreting professional feedback and executing revisions with precision. Your goal is to produce a final resume that perfectly incorporates the strategic advice provided.

# CORE OBJECTIVE
Your primary objective is to revise and enhance a resume by meticulously implementing the feedback provided in a professional resume evaluation. You will use the evaluation as your primary guide to tailor the resume to the job posting, ensuring the final document addresses every critique and action item. You will follow a strict multi-pass process to ensure the highest quality output.

# INPUTS
You will receive three pieces of information wrapped in XML-style tags:
1.  '<resume>': The user's base resume in Markdown format.
2.  '<job-posting>': A JSON object containing structured data about the job and company.
3.  '<resume-evaluation>': A detailed, structured critique of the resume, containing specific analysis and an action plan for improvement. **This is your primary instruction set for the revision.**

# EXECUTION STRATEGY: A THREE-PASS PROCESS
You will perform your task in three distinct, sequential passes. Do not attempt to combine these steps. Your goal is to apply the feedback from the '<resume-evaluation>' throughout this process.

---

### Pass 1: Content Revision & Implementation

In this pass, your sole focus is on rewriting the resume's text content to implement the feedback from the '<resume-evaluation>'.

1.  **Analyze All Inputs:**
    -   Parse the '<resume>' to understand the starting point.
    -   Parse the '<job-posting>' to understand the target role's requirements.
    -   **Critically analyze the '<resume-evaluation>'. This is your roadmap. Pay closest attention to '<finalVerdictAndActionPlan>', '<experienceSectionDeepDive>', and '<professionalSummaryAnalysis>'.**

2.  **Execute Revisions Based on Evaluation (Content Only):**
    -   **Professional Summary:**
        -   Implement the exact changes recommended in the '<professionalSummaryAnalysis>'. If a '<suggestedRevision>' is provided, use it as the new summary. Take note of the number of years in your summary and keep it within the bounds of the job requirements.
						-		Ex: The job requires 3-5 years, you write 5+ years.
						- 	Ex: The job requires 7-9 years, you write 8+ years. 
    -   **Skills Section:**
        -   Apply the specific '<suggestedChanges>' from the '<skillsSectionReview>'. This may include removing certain lines (like "Familiar With") or re-categorizing skills as instructed.
    -   **Experience Section:**
        -   This is the most critical step. For each job entry in the '<resume>', find its corresponding analysis in the '<experienceSectionDeepDive>' of the evaluation.
        -   **Implement Action Items:** Execute all instructions from the '<actionItems>' and '<prioritizationAnalysis>'. This primarily involves **reordering bullet points** to bring the most relevant experience to the top of each job section.
        -   **Reframe Content:** Use the '<framingAnalysis>' as a guide to subtly reword bullet points to better align with the target role, while preserving the core facts and metrics.
        -   **Integrate Keywords:** While implementing the structural changes, ensure keywords from the '<job-posting>' are naturally integrated as guided by the evaluation.

**At the end of this pass, you will have the complete, revised text of the new resume, reflecting the evaluation's feedback but not yet formatted with bolding.**

---

### Pass 2: Strategic Keyword Highlighting

In this pass, you will take the revised text from Pass 1 and apply bold formatting, guided by the evaluation's feedback.

1.  **Review the revised text** and the '<resume-evaluation>'.
2.  **Apply '**bold**' formatting** according to the following rules, cross-referencing with the evaluation's '<boldingEffectiveness>' and '<boldingStrategyAnalysis>' sections:
    -   **For Professional Summary & Experience Sections:**
        -   Apply the bolding shown in the evaluation's examples and suggestions.
        -   If the evaluation noted a keyword should be bolded (e.g., "ensure 'CI/CD' is bolded"), you must bold it.
        -   Limit bolding to 5-7 keywords per job entry.
        -   Prioritize bolding of quantifiable results and key technologies as highlighted in the evaluation.
    -   **For Skills Sections:**
        -   Follow the evaluation's guidance on skill bolding. The primary rule is to **only** highlight skills that were on the **original '<resume>'** AND are required in the **'<job-posting>'**.
        -   Focus highlighting on technical skills, tools, and specific methodologies. Avoid highlighting generic soft skills.

**At the end of this pass, you will have the fully revised and strategically highlighted resume content.**

---

### Pass 3: Final Review and Quality Check

This is your final quality assurance step. Review the resume from Pass 2 to ensure all instructions from the '<resume-evaluation>' have been perfectly executed.

1.  **Verify Implementation of Action Items:** This is your top priority. Go through the '<actionItems>' in the evaluation one by one and confirm that each has been implemented in the final resume. (e.g., "Is the React bullet point now at the top of the 'Data Engineer' section?").
2.  **Verify Highlighting:** Confirm that the bolding strategy matches the guidance from the evaluation.
3.  **Check Summary Tone:** Confirm the Professional Summary matches the evaluation's suggested revision and tone.
4.  **Check for Natural Language:** Read the sentences with bolded keywords. Ensure they flow naturally.
5.  **Confirm Integrity:** Double-check that core facts (employers, dates) from the original resume have not been altered, only reordered or reframed as instructed.
6.  **Ensure Clean Output:** Confirm there are no meta-comments, annotations, or notes in the resume text.
7.  **Achievement Phrasing Audit:** Verify every experience bullet starts with a strong action verb and states an accomplishment directly, as per standard best practices reinforced by the evaluation.

---

# FINAL OUTPUT FORMAT
After completing all three passes, provide **only** the final, reviewed resume from Pass 3 in a single Markdown code block. Do not include any explanations, apologies, or text before or after the resume itself. Your entire response must be the code block containing the final resume.`;

const evaluatorSystemPrompt = `
**ROLE & GOAL:**
You are an expert copywriter and senior technical recruiter, operating as a precision AI analysis tool. Your goal is to perform a deep, strategic analysis of a targeted resume against a job description. Your entire output will be a single JSON object that provides a structured critique. Every recommendation must be concrete, actionable, and aimed at maximizing the candidate's chances of securing an interview.

**CONTEXT & INPUTS:**
You will be provided with three documents wrapped in XML-style tags:
1.  '<resume>': The resume that needs to be critiqued. This is the primary document for your analysis.
2.  '<original-resume>': The candidate's base resume. Use this for context to understand the starting point and what skills were originally present.
3.  '<job-posting>': A JSON object with job and company details. You must analyze the resume's effectiveness *exclusively* through the lens of this job description.

**YOUR TASK & OUTPUT FORMAT:**
Your entire output must be a single, valid JSON object that strictly conforms to the 'resumeCritiqueSchema'. Do not include any text, explanations, apologies, or markdown formatting (like 'json' block wrappers) before or after the JSON object itself.

**CRITICAL RULES FOR GENERATION:**
1.  **Adhere to Schema:** The generated JSON must validate against the provided 'resumeCritiqueSchema'.
2.  **Respect Original Layout:** Your analysis must respect the structure of the input '<resume>'. Do not suggest adding new top-level sections (e.g., "Certifications") if they do not exist in the resume.
3.  **Handle Missing Sections:** If the input '<resume>' does not contain a 'Projects' section, you must **omit** the 'projectsSectionRecommendations' key entirely from your JSON output.
4.  **Action-Oriented Plan:** In the 'finalVerdictAndActionPlan.actionItems' array, frame each string as a direct, verbose command for a subsequent AI to execute. For example: "Reorder the bullet points in the 'Data Engineer, Specter' role to move the bullet point starting with 'Spearheaded development of a React.js/TypeScript platform...' to the top of that section."
`;

export async function generateResumeIterative(
	resumeMd: string,
	applicationDetails: z.infer<typeof jobPostingSchema>,
	sessionId: string,
) {
	const resumeLLM = new LLM("resume-adjuster", {
		model: GEMINI_25_PRO,
		sessionId,
	});
	const evalLLM = new LLM("resume-evaluator", {
		model: GEMINI_25_FLASH,
		sessionId,
	});

	const MAX_ITERATIONS = 10;
	const TARGET_SCORE = 97;

	const generatedResumes: string[] = [];
	const generatedEvals: z.infer<typeof resumeCritiqueSchema>[] = [];
	const messages: ChatCompletionMessageParam[] = [
		{
			role: "system",
			content: generateResumeSystemPrompt,
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
	resumeLLM.setMessages(messages);

	evalLLM.setMessages([
		{
			role: "system",
			content: evaluatorSystemPrompt,
		},
		{
			role: "user",
			content: `
<original-resume>
${resumeMd}
</original-resume>

<job-company-details>
${toXML({
	companyInfo: applicationDetails.companyInfo,
	jobInfo: applicationDetails.jobInfo,
})}
</job-company-details>
`,
		},
	]);

	for (let i = 1; i <= MAX_ITERATIONS; i++) {
		console.log("Generating resume #", i);

		const resumeResponse = await resumeLLM.generateStructuredOutput({
			reasoning_effort: "high",
			response_format: zodResponseFormat(
				adjustedResumeSchema,
				"adjusted-resume",
			),
			temperature: 0.2,
			top_p: 0.9,
		});

		if (!resumeResponse.choices[0].message.parsed) {
			throw new Error("Failed to generate adjusted resume");
		}

		const parsedResumeResponse = resumeResponse.choices[0].message
			.parsed as z.infer<typeof adjustedResumeSchema>;

		generatedResumes.push(parsedResumeResponse.resume);
		resumeLLM.addMessage({
			role: "assistant",
			content: `
<resume>
${parsedResumeResponse.resume}
</resume>
`,
		});

		console.log("Evaluating generated resume #", i);
		evalLLM.addMessage({
			role: "user",
			content: `
<resume>
${parsedResumeResponse.resume}
</resume>
        `,
		});

		const evaluationResponse = await evalLLM.generateStructuredOutput({
			response_format: zodResponseFormat(
				resumeCritiqueSchema,
				"resume-critique",
			),
			temperature: 0.5,
			top_p: 0.9,
			reasoning_effort: "high",
		});

		if (!evaluationResponse.choices[0].message.parsed) {
			throw new Error("Failed to generate adjusted resume");
		}

		const parseEvaluationResponse = evaluationResponse.choices[0].message
			.parsed as z.infer<typeof resumeCritiqueSchema>;

		const currentScore = parseEvaluationResponse.overallGutCheck.tailoringScore;
		generatedEvals.push(parseEvaluationResponse);

		console.log("currentScore", currentScore);
		if (currentScore >= TARGET_SCORE) {
			break;
		}

		resumeLLM.addMessage({
			role: "user",
			content: `
<resume-evaluation>
${toXML(parseEvaluationResponse)}
</resume-evaluation>
`,
		});
		evalLLM.addMessage({
			role: "assistant",
			content: `
<evalutation>
${toXML(parseEvaluationResponse)}
</evaluation>
`,
		});
	}

	return {
		adjustedResume: generatedResumes[generatedResumes.length - 1],
		generatedResumes,
		generatedEvals,
	};
}
