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
