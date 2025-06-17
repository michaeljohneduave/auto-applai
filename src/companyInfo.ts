import type { z } from "zod";
import { contentEvaluator } from "./contentEvaluator";
import type { jobPostingSchema } from "./schema.ts";
import { urlEvaluator } from "./urlEvaluator.ts";
import { htmlFormCrawler, htmlToMarkdown } from "./utils.ts";

async function asyncGenCollector<T>(genFunction: AsyncGenerator<T>) {
	const collector: T[] = [];
	for await (const item of genFunction) {
		collector.push(item);
	}
	return collector;
}

export async function gatherCompanyInfo(
	validLinks: string[],
	applicationDetails: z.infer<typeof jobPostingSchema>,
) {
	const ratingThreshold = 5;
	const mdContent: {
		markdown: string;
		rating: number;
		url: string;
		reasoning: string;
	}[] = [];

	// Company and job info gathering
	const relevantLinks = (
		await asyncGenCollector(urlEvaluator(validLinks, applicationDetails))
	)
		.flat()
		.filter((l) => l.rating > ratingThreshold);
	const evaluatedUrls = new Set(relevantLinks.map((l) => l.url));

	do {
		const links = relevantLinks.splice(0, 10);
		const results = await Promise.allSettled(
			links.map(async (link) => {
				const { html, validLinks: vls } = await htmlFormCrawler(link.url);
				const markdown = await htmlToMarkdown(html, link.url, {
					removeLinks: true,
					removeDataAttr: true,
				});
				const contentEvaluation = await contentEvaluator(
					{
						url: link.url,
						reasoning: link.reasoning,
						content: markdown,
					},
					applicationDetails,
				);

				// Do we care if content is not relevant and still scrape and
				// evaluate the urls present on that irrelevant page?

				const newLinks = (
					await asyncGenCollector(
						urlEvaluator(
							vls.filter((l) => !evaluatedUrls.has(l)),
							applicationDetails,
						),
					)
				)
					.flat()
					.filter((l) => l.rating >= ratingThreshold);
				console.log("New links", newLinks);

				return {
					currentLink: link,
					newLinks,
					content: {
						markdown,
						rating: contentEvaluation.contentRating,
						reasoning: contentEvaluation.contentReasoning,
					},
				};
			}),
		);

		for (const { value: result } of results.filter(
			(r) => r.status === "fulfilled",
		)) {
			for (const newLink of result.newLinks) {
				if (!evaluatedUrls.has(newLink.url)) {
					evaluatedUrls.add(newLink.url);
					relevantLinks.push(newLink);
				}
			}

			if (result.content.rating >= ratingThreshold) {
				mdContent.push({
					markdown: result.content.markdown,
					rating: result.content.rating,
					reasoning: result.content.reasoning,
					url: result.currentLink.url,
				});
			}
		}

		console.log(
			"mdContent",
			mdContent.length,
			new Set(mdContent.map((c) => c.url)).size,
			"Relevant links",
			relevantLinks.length,
		);
	} while (relevantLinks.length > 0);

	console.log("Application Details:", applicationDetails);
	console.log(
		"Good Content:",
		mdContent.map((c) => ({
			rating: c.rating,
			reasoning: c.reasoning,
			content: c.markdown.slice(0, 200),
			url: c.url,
		})),
	);
}
