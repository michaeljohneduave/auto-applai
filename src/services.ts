export async function checkRequiredServices() {
	console.log("Checking required services...");

	// Check Pandoc Server
	try {
		const pandocResponse = await fetch(`${process.env.PDF_SERVICE_URL}/health`);
		if (!pandocResponse.ok) throw new Error("Pandoc server is not responding");
	} catch (error) {
		console.error(error);
		throw new Error("Pandoc server must be running on port 4000");
	}

	// Check Puppeteer MCP Server
	try {
		const mcpResponse = await fetch(
			`${process.env.PUPPETEER_SERVICE_URL}/health`,
		);
		if (!mcpResponse.ok)
			throw new Error("Puppeteer MCP server is not responding");
	} catch (error) {
		console.error(error);
		throw new Error("Puppeteer MCP server must be running on port 3000");
	}

	console.log("✓ All required services are running");
}
