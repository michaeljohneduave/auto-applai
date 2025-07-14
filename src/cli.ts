import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { randomString } from "remeda";
import { checkRequiredServices, orchestrator } from "./auto-apply.ts";

try {
	const sessionId = randomString(10);
	const readline = createInterface({
		input: stdin,
		output: stdout,
	});

	await checkRequiredServices();

	while (true) {
		const url = await readline.question("URL: ");
		await orchestrator(sessionId, url);
	}
} catch (e) {
	console.error(e);
}

process.exit(0);
