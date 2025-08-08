import type {
	formCompleterSchema,
	jobPostingSchema,
	personalInfoSchema,
	resumeCritiqueSchema,
} from "@auto-apply/core/src/schema";
import type { z } from "zod";

export interface UserData {
	id: number;
	email: string;
	name: string;
	resume_md?: string;
	resume_latex?: string;
	personal_info?: z.infer<typeof personalInfoSchema>;
	created_at: Date;
	updated_at: Date;
}

export interface SessionData {
	sessionId: string;
	jobUrl: string;
	status: "processing" | "awaiting_input" | "completed" | "failed";
	currentStep: string;
	applicationDetails?: z.infer<typeof jobPostingSchema>;
	adjustedResume?: string;
	resumeEval?: z.infer<typeof resumeCritiqueSchema>;
	latexResume?: string;
	latexPdf?: Buffer;
	screenshot?: Buffer;
	formUrl?: string;
	companyName?: string;
	assetPath?: string;
	completedForm?: z.infer<typeof formCompleterSchema>;
	pendingQuestions?: Array<{
		questionForUser: string;
		originalQuestion: string;
	}>;
	clarificationAnswers?: Array<{
		originalQuestion: string;
		questionForUser: string;
		answer: string;
	}>;
	error?: string;
	createdAt: Date;
	company_name?: string;
	pdf_link?: string;
	cover_letter?: string;
	form?: string;
}

export type Model = {
	attachment: boolean;
	cost: {
		input: number;
		output: number;
	};
	id: string;
	knowledge: string;
	last_updated: string;
	limit: {
		context: number;
		output: number;
	};
	modalities: {
		input: string[];
		output: string[];
	};
	name: string;
	open_weights: boolean;
	reasoning: boolean;
	release_date: string;
	temperature: boolean;
	tool_call: boolean;
};

export type ModelProvider = {
	doc: string;
	env: string[];
	id: string;
	models: Record<string, Model>;
	name: string;
	npm: string;
};

export type ModelsDev = Record<string, ModelProvider>;

export type SessionCost = {
	totalCost: number;
	inputTokens: number;
	outputTokens: number;
	cacheTokens: number;
	perModel: Record<
		string,
		{
			inputTokens: number;
			outputTokens: number;
			cacheTokens: number;
			cost: number;
		}
	>;
};
