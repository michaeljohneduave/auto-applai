import { randomUUID } from "node:crypto";
import { sessions } from "@auto-apply/core/src/db/schema";
import { runWithHtml, runWithUrl } from "../../core/src/auto-apply";
import { queue } from "../../core/src/utils/queue";
import { db } from "./db";
import { emitSessionUpdate } from "./events";

async function processJob() {
	const job = queue.dequeue();
	if (job) {
		const { userId, jobUrl, html } = job;
		const sessionId = randomUUID();

		const [session] = await db
			.insert(sessions)
			.values({
				id: sessionId,
				url: jobUrl,
				userId: userId,
			})
			.returning();

		emitSessionUpdate({
			userId,
			sessionId: session.id,
		});

		console.log(`Processing job for user ${userId} and url ${jobUrl}`);

		if (html) {
			await runWithHtml(userId, sessionId, html);
		} else {
			await runWithUrl(userId, sessionId, jobUrl);
		}
	}
}

queue.on("newJob", processJob);
console.log("Worker started");
