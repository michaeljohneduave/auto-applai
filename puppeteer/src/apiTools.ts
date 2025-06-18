import Turndown from "turndown";
const turndownService = new Turndown();

export async function extractHtml(page) {
	const content = await page.content();
	const bodyMatch = content.match(/<body[^>]*>([\s\S]*)<\/body>/);

	if (bodyMatch?.[1]) {
		return bodyMatch[1].trim();
	}

	return content;
}

export async function extractMarkdown(page) {
	const html = await page.content();

	return turndownService.turndown(html);
}
