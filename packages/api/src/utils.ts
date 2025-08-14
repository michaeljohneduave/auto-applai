import { sessions } from "@auto-apply/core/src/db/schema";
import { eq, like, or } from "drizzle-orm";

export async function generatePdf(latexResume: string) {
	console.log("Generating PDF using pandoc");
	const response = await fetch(`${process.env.PDF_SERVICE_URL}/compile`, {
		method: "POST",
		body: JSON.stringify({
			latex: latexResume,
		}),
		headers: {
			"Content-Type": "application/json",
		},
	});

	if (!response.ok) {
		console.error("Failed to generate PDF:", response.statusText);
		throw new Error("PDF generation failed");
	}

	return response.arrayBuffer();
}

/**
 * Extracts LinkedIn job ID from various URL formats
 * Returns null if no job ID found
 */
function extractLinkedInJobId(url: string): string | null {
	try {
		const urlObj = new URL(url);

		// Check if it's a LinkedIn jobs URL
		if (
			!urlObj.hostname.includes("linkedin.com") ||
			!urlObj.pathname.includes("/jobs/")
		) {
			return null;
		}

		// Method 1: Extract from path like /jobs/view/{jobId}
		const viewMatch = urlObj.pathname.match(/\/jobs\/view\/(\d+)/);
		if (viewMatch) {
			return viewMatch[1];
		}

		// Method 2: Extract from query parameter currentJobId
		const currentJobId = urlObj.searchParams.get("currentJobId");
		if (currentJobId) {
			return currentJobId;
		}

		// Method 3: Extract from other possible job ID parameters
		const jobId =
			urlObj.searchParams.get("jobId") || urlObj.searchParams.get("id");
		if (jobId) {
			return jobId;
		}

		return null;
	} catch {
		return null;
	}
}

export function urlWhereClause(jobUrl: string) {
	const url = new URL(jobUrl);
	const linkedInJobId = extractLinkedInJobId(jobUrl);
	console.log("linkedInJobId", linkedInJobId);
	// Multi-level matching for LinkedIn URLs
	if (linkedInJobId) {
		// Level 1: Exact URL match
		// Level 2: Job ID match (find any session with same job ID)
		// Level 3: Domain + path match
		return or(
			eq(sessions.url, jobUrl),
			like(sessions.url, `%${linkedInJobId}%`), // Job ID anywhere in URL
			// like(sessions.url, `${url.origin}${url.pathname}%`),
		);
	}

	// Fallback to pure URL matching for non-LinkedIn or URLs without job ID
	return or(
		eq(sessions.url, jobUrl),
		like(sessions.url, `${url.origin}${url.pathname}%`),
	);
}

/**
 * Test function to verify LinkedIn URL matching logic
 */
export function testLinkedInUrlMatching() {
	const testUrls = [
		"https://www.linkedin.com/jobs/view/4275776241",
		"https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4283390056&discover=recommended",
		"https://www.linkedin.com/jobs/collections/top-applicant/?currentJobId=4285754025",
		"https://www.linkedin.com/jobs/search-results/?distance=25&geoId=90009553&keywords=full%20stack%20developer",
		"https://www.linkedin.com/jobs/view/1234567890?refId=abc123",
		"https://www.linkedin.com/jobs/collections/recommended/?currentJobId=9999999999",
		"https://example.com/jobs/view/123", // Non-LinkedIn URL
	];

	console.log("Testing LinkedIn URL matching logic:");
	testUrls.forEach((testUrl) => {
		const jobId = extractLinkedInJobId(testUrl);
		console.log(`URL: ${testUrl}`);
		console.log(`  Job ID: ${jobId || "null"}`);
		console.log(`  Is LinkedIn: ${testUrl.includes("linkedin.com")}`);
		console.log("---");
	});
}
