import { EventEmitter } from "node:events";
import type { z } from "zod";
import type {
	formCompleterSchema,
	jobPostingSchema,
	resumeCritiqueSchema,
} from "./schema.ts";

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
}

export interface SessionEvent {
	type: "processing" | "clarification_request" | "completed" | "error";
	data: unknown;
}

class SessionManager extends EventEmitter {
	private sessions = new Map<string, SessionData>();
	private sessionTimeouts = new Map<string, NodeJS.Timeout>();

	createSession(sessionId: string, jobUrl: string): SessionData {
		const session: SessionData = {
			sessionId,
			jobUrl,
			status: "processing",
			currentStep: "initializing",
			createdAt: new Date(),
		};

		this.sessions.set(sessionId, session);

		// Auto-cleanup session after 1 hour
		const timeout = setTimeout(
			() => {
				this.cleanupSession(sessionId);
			},
			60 * 60 * 1000,
		);

		this.sessionTimeouts.set(sessionId, timeout);

		return session;
	}

	getSession(sessionId: string): SessionData | undefined {
		return this.sessions.get(sessionId);
	}

	updateSession(sessionId: string, updates: Partial<SessionData>): void {
		const session = this.sessions.get(sessionId);
		if (session) {
			Object.assign(session, updates);
			this.sessions.set(sessionId, session);
		}
	}

	emitEvent(sessionId: string, event: SessionEvent): void {
		this.emit(`session:${sessionId}`, event);
	}

	waitForClarification(
		sessionId: string,
		questions: Array<{
			questionForUser: string;
			originalQuestion: string;
		}>,
	): Promise<
		Array<{
			originalQuestion: string;
			questionForUser: string;
			answer: string;
		}>
	> {
		return new Promise((resolve) => {
			this.updateSession(sessionId, {
				status: "awaiting_input",
				pendingQuestions: questions,
			});

			this.emitEvent(sessionId, {
				type: "clarification_request",
				data: { questions },
			});

			// Listen for clarification answers
			const handler = (
				answers: Array<{
					originalQuestion: string;
					questionForUser: string;
					answer: string;
				}>,
			) => {
				this.updateSession(sessionId, {
					status: "processing",
					clarificationAnswers: answers,
					pendingQuestions: undefined,
				});
				resolve(answers);
			};

			this.once(`clarification:${sessionId}`, handler);
		});
	}

	provideClarification(
		sessionId: string,
		answers: Array<{
			originalQuestion: string;
			questionForUser: string;
			answer: string;
		}>,
	): void {
		this.emit(`clarification:${sessionId}`, answers);
	}

	completeSession(sessionId: string, result: unknown): void {
		this.updateSession(sessionId, {
			status: "completed",
		});

		this.emitEvent(sessionId, {
			type: "completed",
			data: result,
		});

		// Clean up after a delay
		setTimeout(
			() => {
				this.cleanupSession(sessionId);
			},
			5 * 60 * 1000,
		); // 5 minutes
	}

	failSession(sessionId: string, error: string): void {
		this.updateSession(sessionId, {
			status: "failed",
			error,
		});

		this.emitEvent(sessionId, {
			type: "error",
			data: { error },
		});

		// Clean up after a delay
		setTimeout(
			() => {
				this.cleanupSession(sessionId);
			},
			5 * 60 * 1000,
		); // 5 minutes
	}

	updateProgress(sessionId: string, step: string, message?: string): void {
		this.updateSession(sessionId, {
			currentStep: step,
		});

		this.emitEvent(sessionId, {
			type: "processing",
			data: { status: step, message },
		});
	}

	private cleanupSession(sessionId: string): void {
		this.sessions.delete(sessionId);
		const timeout = this.sessionTimeouts.get(sessionId);
		if (timeout) {
			clearTimeout(timeout);
			this.sessionTimeouts.delete(sessionId);
		}
		this.removeAllListeners(`session:${sessionId}`);
		this.removeAllListeners(`clarification:${sessionId}`);
	}

	getAllSessions(): SessionData[] {
		return Array.from(this.sessions.values());
	}
}

export const sessionManager = new SessionManager();
