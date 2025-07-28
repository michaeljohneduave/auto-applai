import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { checkRequiredServices } from "@auto-apply/api/src/services.ts";
import { randomString } from "remeda";
import { run } from "./auto-apply.ts";

try {
	const sessionId = randomString(10);
	const readline = createInterface({
		input: stdin,
		output: stdout,
	});

	await checkRequiredServices();

	while (true) {
		const url = await readline.question("URL: ");
		await run("cli-user", sessionId, url, "url", readline);
	}
} catch (e) {
	console.error(e);
}

process.exit(0);
