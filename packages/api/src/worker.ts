import { randomUUID } from "node:crypto";
import { emitSessionUpdate } from "@auto-apply/common/src/events";
import { db } from "@auto-apply/core/src/db/db.ts";
import { type Sessions, sessions } from "@auto-apply/core/src/db/schema";
import { and, desc, eq, isNull, like, not, or } from "drizzle-orm";
import { runWithHtml, runWithUrl } from "../../core/src/auto-apply";
import { queue } from "../../core/src/utils/queue";

async function processJob() {
	const job = queue.dequeue();
	if (job) {
		const { userId, jobUrl, html, forceNew, retry } = job;

		let session: Pick<Sessions, "id"> | null = null;
		// Temp workaround for multi-url sessions
		const url = new URL(jobUrl);

		console.log("--------------------------------");
		console.log("New Job");
		console.log(job);
		console.log("--------------------------------");

		// Check if this url has already been processed but with a slightly different url
		// Skip this check if forceNew is true
		if (!forceNew) {
			const [existingSession] = await db
				.select({
					id: sessions.id,
				})
				.from(sessions)
				.where(
					and(
						or(
							eq(sessions.url, jobUrl),
							like(sessions.url, `${url.origin}${url.pathname}%`),
						),
						eq(sessions.userId, userId),
						not(eq(sessions.sessionStatus, "failed")),
						// retry ? undefined : eq(sessions.sessionStatus, "done"),
						isNull(sessions.deletedAt),
					),
				)
				.orderBy(desc(sessions.createdAt))
				.limit(1);

			if (existingSession) {
				session = existingSession;
			} else {
				console.warn(
					"No existing session found for url. Creating new session",
					jobUrl,
					userId,
					forceNew,
					retry,
					`${url.origin}${url.pathname}`,
				);
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
				.returning({
					id: sessions.id,
				});
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
