import { randomUUID } from "node:crypto";
import { run } from "../../core/src/auto-apply";
import { queue } from "../../core/src/utils/queue";

async function processJob() {
	const job = queue.dequeue();
	if (job) {
		const { userId, jobUrl } = job;
		const sessionId = randomUUID();
		await run(userId, sessionId, jobUrl);
		console.log(`Processing job for user ${userId} and url ${jobUrl}`);
	}
}

queue.on("newJob", processJob);
console.log("Worker started");
