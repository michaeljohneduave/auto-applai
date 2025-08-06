// Retry helper function with exponential backoff
async function retryWithBackoff<T>(
	operation: () => Promise<T>,
	maxAttempts: number = 3,
	initialDelay: number = 1000,
	backoffMultiplier: number = 2,
	maxDelay: number = 10000,
): Promise<T> {
	let lastError: Error;

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error as Error;

			if (attempt === maxAttempts) {
				throw lastError;
			}

			const delay = Math.min(
				initialDelay * backoffMultiplier ** (attempt - 1),
				maxDelay,
			);
			console.log(`Attempt ${attempt} failed, retrying in ${delay}ms...`);
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}

	throw lastError!;
}

export async function checkRequiredServices() {
	console.log("Checking required services...");

	// Check Pandoc Server
	try {
		await retryWithBackoff(async () => {
			const pandocResponse = await fetch(
				`${process.env.PDF_SERVICE_URL}/health`,
			);
			if (!pandocResponse.ok)
				throw new Error("Pandoc server is not responding");
			console.log("✓ Pandoc server is healthy");
		});
	} catch (error) {
		console.error(
			"Pandoc server health check failed after all retries:",
			error,
		);
		throw new Error("Pandoc server must be running on port 4000");
	}

	// Check Puppeteer MCP Server
	try {
		await retryWithBackoff(async () => {
			const mcpResponse = await fetch(
				`${process.env.PUPPETEER_SERVICE_URL}/health`,
			);
			if (!mcpResponse.ok)
				throw new Error("Puppeteer MCP server is not responding");
			console.log("✓ Puppeteer MCP server is healthy");
		});
	} catch (error) {
		console.error(
			"Puppeteer MCP server health check failed after all retries:",
			error,
		);
		throw new Error("Puppeteer MCP server must be running on port 3000");
	}

	console.log("✓ All required services are running");
}
