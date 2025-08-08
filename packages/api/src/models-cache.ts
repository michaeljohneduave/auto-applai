import type { ChatCompletionCreateParamsNonStreaming } from "openai/resources.mjs";

// Types reflecting a narrowed subset of https://models.dev/api.json
interface ModelsDevModel {
	cost?: {
		cache_read?: number;
		cache_write?: number;
		input?: number;
		output?: number;
	};
	limit?: {
		context?: number;
		output?: number;
	};
}

interface ModelsDevProvider {
	models?: Record<string, ModelsDevModel>;
}

type ModelsDevRegistry = Record<string, ModelsDevProvider>;

interface ModelPricing {
	[provider: string]: {
		[model: string]: {
			cost: {
				input: number;
				output: number;
				cache_read: number;
			};
			limit: {
				context: number;
				output: number;
			};
		};
	};
}

let modelPricingCache: ModelPricing | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export async function getModelPricing(): Promise<ModelPricing> {
	const now = Date.now();

	// Return cached data if it's still valid
	if (modelPricingCache && now - lastFetchTime < CACHE_DURATION) {
		return modelPricingCache;
	}

	try {
		const response = await fetch("https://models.dev/api.json");
		if (!response.ok) {
			throw new Error(`Failed to fetch model pricing: ${response.status}`);
		}

		const data: ModelsDevRegistry = await response.json();

		// Transform the data into a more usable format
		const pricing: ModelPricing = {};

		for (const [providerId, provider] of Object.entries(data)) {
			if (!provider || typeof provider !== "object") continue;
			const models = provider.models ?? {};
			pricing[providerId] = {};

			for (const [modelId, model] of Object.entries(models)) {
				if (!model || typeof model !== "object") continue;
				const costIn = model.cost?.input ?? 0;
				const costOut = model.cost?.output ?? 0;
				const costCacheRead = model.cost?.cache_read ?? 0;
				const limitContext = model.limit?.context ?? 0;
				const limitOutput = model.limit?.output ?? 0;

				pricing[providerId][modelId] = {
					cost: {
						input: costIn,
						output: costOut,
						cache_read: costCacheRead,
					},
					limit: {
						context: limitContext,
						output: limitOutput,
					},
				};
			}
		}

		modelPricingCache = pricing;
		lastFetchTime = now;

		console.log(
			`Model pricing cache updated with ${Object.keys(pricing).length} providers`,
		);
		return pricing;
	} catch (error) {
		console.error("Error fetching model pricing:", error);

		// Return cached data if available, even if expired
		if (modelPricingCache) {
			console.log("Using expired cache due to fetch error");
			return modelPricingCache;
		}

		// Return empty object if no cache available
		return {};
	}
}

export function calculateTokenCost(
	modelName: string,
	inputTokens: number,
	outputTokens: number,
	cacheTokens: number,
	pricing: ModelPricing,
): number {
	// Try to find the model in the pricing data
	for (const models of Object.values(pricing)) {
		for (const [modelId, modelData] of Object.entries(models)) {
			// Check if the model name matches (case-insensitive)
			if (
				modelName.toLowerCase().includes(modelId.toLowerCase()) ||
				modelId.toLowerCase().includes(modelName.toLowerCase())
			) {
				const inputCost = (inputTokens / 1_000_000) * modelData.cost.input;
				const outputCost = (outputTokens / 1_000_000) * modelData.cost.output;
				const cacheReadCost =
					(cacheTokens / 1_000_000) * modelData.cost.cache_read;
				return inputCost + outputCost + cacheReadCost;
			}
		}
	}

	// If model not found, return 0
	return 0;
}

export function getModelFromRequest(
	request: ChatCompletionCreateParamsNonStreaming,
): string {
	return request.model || "unknown";
}
