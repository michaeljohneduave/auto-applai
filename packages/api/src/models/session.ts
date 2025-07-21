
import { dbManager } from "../dbManager";
import { eventBus } from "../events";
import type { SessionData } from "../types";

// Initialize sessions table
function initializeSessionsTable(db: any) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			sessionId TEXT PRIMARY KEY,
			jobUrl TEXT,
			status TEXT DEFAULT 'processing',
			currentStep TEXT,
			applicationDetails TEXT,
			adjustedResume TEXT,
			resumeEval TEXT,
			latexResume TEXT,
			latexPdf BLOB,
			screenshot BLOB,
			formUrl TEXT,
			companyName TEXT,
			assetPath TEXT,
			completedForm TEXT,
			pendingQuestions TEXT,
			clarificationAnswers TEXT,
			error TEXT,
			createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
			company_name TEXT,
			pdf_link TEXT,
			cover_letter TEXT,
			form TEXT
		)
	`);
}

export function createSession(userId: string, data: Partial<SessionData>) {
	const db = dbManager.getConnection(userId);
	initializeSessionsTable(db);

	const columns = Object.keys(data).join(", ");
	const placeholders = Object.keys(data)
		.map(() => "?")
		.join(", ");
	const values = Object.values(data).map((value) =>
		typeof value === "object" && value !== null ? JSON.stringify(value) : value,
	);

	const stmt = db.prepare(
		`INSERT INTO sessions (${columns}) VALUES (${placeholders})`,
	);
	stmt.run(...values);

	const session = getSession(userId, data.sessionId!);
	eventBus.emit(`session:update:${data.sessionId}`, session);
	return session;
}

export function getSession(userId: string, sessionId: string) {
	const db = dbManager.getConnection(userId);
	initializeSessionsTable(db);

	const stmt = db.prepare("SELECT * FROM sessions WHERE sessionId = ?");
	const row = stmt.get(sessionId) as any;

	if (!row) return null;

	// Parse JSON fields back to objects
	const session = { ...row };
	const jsonFields = [
		"applicationDetails",
		"resumeEval",
		"completedForm",
		"pendingQuestions",
		"clarificationAnswers",
	];
	for (const field of jsonFields) {
		if (session[field]) {
			try {
				session[field] = JSON.parse(session[field]);
			} catch (e) {
				// Keep as string if parsing fails
			}
		}
	}

	return session;
}

export function updateSession(
	userId: string,
	sessionId: string,
	data: Partial<SessionData>,
) {
	const db = dbManager.getConnection(userId);
	initializeSessionsTable(db);

	const updates = Object.keys(data)
		.map((key) => `${key} = ?`)
		.join(", ");
	const values = Object.values(data).map((value) =>
		typeof value === "object" && value !== null ? JSON.stringify(value) : value,
	);

	const stmt = db.prepare(`UPDATE sessions SET ${updates} WHERE sessionId = ?`);
	stmt.run(...values, sessionId);

	const session = getSession(userId, sessionId);
	eventBus.emit(`session:update:${sessionId}`, session);
	return session;
}

export function deleteSession(userId: string, sessionId: string) {
	const db = dbManager.getConnection(userId);
	initializeSessionsTable(db);

	const stmt = db.prepare("DELETE FROM sessions WHERE sessionId = ?");
	return stmt.run(sessionId);
}

export function getAllSessions(userId: string) {
	const db = dbManager.getConnection(userId);
	initializeSessionsTable(db);

	const stmt = db.prepare("SELECT * FROM sessions");
	const rows = stmt.all() as any[];

	// Parse JSON fields back to objects for all sessions
	return rows.map((row) => {
		const session = { ...row };
		const jsonFields = [
			"applicationDetails",
			"resumeEval",
			"completedForm",
			"pendingQuestions",
			"clarificationAnswers",
		];
		for (const field of jsonFields) {
			if (session[field]) {
				try {
					session[field] = JSON.parse(session[field]);
				} catch (e) {
					// Keep as string if parsing fails
				}
			}
		}
		return session;
	});
}
