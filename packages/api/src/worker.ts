import { randomUUID } from "node:crypto";
import { type Sessions, sessions } from "@auto-apply/core/src/db/schema";
import { and, desc, eq, isNull, like, or } from "drizzle-orm";
import { runWithHtml, runWithUrl } from "../../core/src/auto-apply";
import { queue } from "../../core/src/utils/queue";
import { db } from "./db";
import { emitSessionUpdate } from "./events";

async function processJob() {
	const job = queue.dequeue();
	if (job) {
		const { userId, jobUrl, html, forceNew } = job;

		let session: Sessions | null = null;
		// Temp workaround for multi-url sessions
		// Ex: job-url.com has the job details and job-url.com/apply has the application form
		const url = jobUrl.split("/").slice(0, -1).join("/");

		// Check if this url has already been processed but with a slightly different url
		// Skip this check if forceNew is true
		if (!forceNew) {
			const [existingSession] = await db
				.select()
				.from(sessions)
				.where(
					and(
						or(eq(sessions.url, jobUrl), like(sessions.url, `${url}%`)),
						eq(sessions.userId, userId),
						isNull(sessions.deletedAt),
					),
				)
				.orderBy(desc(sessions.createdAt))
				.limit(1);

			if (existingSession) {
				session = existingSession;
			}
		}

		// Create new session if no existing session found or if forceNew is true
		if (!session) {
			[session] = await db
				.insert(sessions)
				.values({
					id: randomUUID(),
					url: jobUrl,
					userId: userId,
				})
				.returning();
		}

		emitSessionUpdate({
			userId,
			sessionId: session.id,
		});

		console.log(
			`Processing session ${session.id} for user ${userId} and url ${jobUrl} Mode: ${
				html ? "html" : "url"
			}${forceNew ? " (forced new)" : ""}`,
		);

		if (html) {
			await runWithHtml(userId, session.id, html);
		} else {
			await runWithUrl(userId, session.id, jobUrl);
		}
	}
}

queue.on("newJob", processJob);
console.log("Worker started");
