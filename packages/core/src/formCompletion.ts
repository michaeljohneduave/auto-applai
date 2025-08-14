import { toXML } from "jstoxml";
import { zodResponseFormat } from "openai/helpers/zod.mjs";
import type { ChatCompletionMessageParam } from "openai/resources.mjs";
import type { z } from "zod";
import LLM, { GEMINI_25_FLASH } from "./llm.ts";
import {
	type evaluatorSchema,
	formCompleterSchema,
	type jobPostingSchema,
	type userClarifications,
} from "./schema.ts";

export async function formCompleter({
	applicationDetails,
	resume,
	personalMetadata,
	context,
	sessionId,
	notes,
}: {
	applicationDetails: z.infer<typeof jobPostingSchema>;
	resume: string;
	personalMetadata: string;
	context: string[];
	sessionId: string;
	notes?: string;
}) {
	const llm = new LLM("form-completer", {
		model: GEMINI_25_FLASH,
		sessionId,
	});
	const clarifications: z.infer<typeof userClarifications> = [];
	let completedForm: z.infer<typeof formCompleterSchema> = {
		coverLetter: "",
		formAnswers: [],
		clarificationRequests: [],
	};
	const evaluation: z.infer<typeof evaluatorSchema> = [];

	// const llm = new LLM("form-completer", {
	// 	model: grok.models.MINI,
	// });

	const messages: ChatCompletionMessageParam[] = [
		{
			role: "system",
			content: `
# Identity
You are a world-class technical recruiter and career coach. You function as a
collaborative partner to the user. Your primary goal is to help complete job
applications by answering questions directly, incorporating user feedback, or
requesting clarification when necessary.

# Execution Flow
Your process is now prioritized into three main stages:

**Priority 1: Process User-Provided Answers**
1.  First, check if the <applicant-clarifications> tag exists and contains
    information.
2.  If it does, this is your highest priority. For each item in the array:
    a.  Identify the originalQuestion.
    b.  Take the userAnswer and treat it as the primary source of truth to
        resolve that question.
    c.  Synthesize this new information with the existing context (<applicant-resume>,
        <job-context>) to create a final, high-quality answer.
    d.  Place the completed question and its new answer into the
        formAnswers array in your JSON output.

**Priority 2: Process Remaining Application Questions**
1.  After processing all user feedback, look at the full list of application
    questions.
2.  For any question that was **not** addressed in Priority 1, follow the
    standard procedure:
    a.  Analyze the question (Factual vs. Creative).
    b.  Scan all available context (including the original documents).
    c.  If you have sufficient information, generate the answer and add it to
        the formAnswers array.
    d.  If information is still missing, create a new request in the
        clarificationRequests array.
		e. Check the question type to avoid writing more than necessary (Ex. A yes or no question should only be answered by yes or no)
		f. Any explanations would be collated into a relevant text area question.
		g. Long form responses must be formatted correctly (e.g. have newlines and not just a blob of text)

**Priority 3: Writing an effective cover letter**
1. After considering all context and information, write a chill and compelling but not over-the-top cover letter addressed to the hiring team/manager.
2. Refer to the <personal-info> section for cover letter reference.
3. Do not add any styling (bold, italic) in the cover letter. It should in plain text format

If <applicant-notes> is provided, incorporate any relevant details into both the form answers and the cover letter.

# Example of the Full Feedback Loop
1. You see an application form and try your best to answer it with relevant context.
2. If you don't have enough context, ask for clarification.
3. User adds the clarifications (in <clarification-answers> tags) and you incorporate it to the answers.
4. An evaluation (in <evaluation> tags) will be done to your answers, if there's any inaccuracies or improvements to be made.
5. Continue to improve your answers based on the evaluation.
---

<job-context>
${toXML({
	companyInfo: applicationDetails.companyInfo,
	jobInfo: applicationDetails.jobInfo,
	applicationSteps: applicationDetails.applicationSteps,
})}
</job-context>

<applicant-resume>
${resume}
</applicant-resume>

<personal-info>
${personalMetadata}
</personal-info>

<company-context>
${context.join("\n")}
</company-context>

${notes?.length ? `<applicant-notes>\n${notes}\n</applicant-notes>` : ""}
	`,
		},
		{
			role: "user",
			content: `
Help me answer this form.
${toXML(applicationDetails.applicationForm)}
			`,
		},
	];

	llm.setMessages(messages);

	// while (true) {
	const response = await llm.generateStructuredOutput({
		temperature: 0.3,
		top_p: 0.9,
		reasoning_effort: "high",
		response_format: zodResponseFormat(formCompleterSchema, "form-completer"),
	});

	if (!response.choices[0].message.parsed) {
		throw new Error("Form completer parsed response not found");
	}

	completedForm = response.choices[0].message.parsed as z.infer<
		typeof formCompleterSchema
	>;

	if (!completedForm) {
		throw new Error("Failed to complete form");
	}

	// 		if (completedForm.clarificationRequests.length) {
	// 			for (const q of completedForm.clarificationRequests) {
	// 				const answer = await readline.question(
	// 					`${q.questionForUser}\n Your answer: `,
	// 				);

	// 				clarifications.push({
	// 					originalQuestion: q.originalQuestion,
	// 					questionForUser: q.questionForUser,
	// 					answer: answer,
	// 				});
	// 			}

	// 			llm.addMessage({
	// 				role: "assistant",
	// 				content: `
	// <form-answers>
	// ${toXML(completedForm.formAnswers)}
	// </form-answers>

	// <clarification-requests>
	// ${toXML(completedForm.clarificationRequests)}
	// </clarification-requests>
	// 				`,
	// 			});

	// 			llm.addMessage({
	// 				role: "user",
	// 				content: `
	// <clarification-answers>
	// ${toXML(clarifications)}
	// </clarification-answers>
	// 				`,
	// 			});
	// 		} else {
	// 			evaluation = await evaluator(
	// 				applicationDetails,
	// 				completedForm,
	// 				clarifications,
	// 				resume,
	// 				context,
	// 				sessionId,
	// 			);
	// 			const totalScore =
	// 				evaluation.reduce((acc, evl) => evl.grade + acc, 0) / evaluation.length;

	// 			llm.addMessage({
	// 				role: "user",
	// 				content: `
	// <evaluation>
	// ${toXML(evaluation)}
	// </evaluation>
	//         `,
	// 			});

	// 			if (totalScore < 5) {
	// 				continue;
	// 			}

	// 			break;
	// 		}
	// }

	return completedForm;
}
