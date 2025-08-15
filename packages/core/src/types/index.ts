// Re-export schema types for frontend consumption
export type { Sessions } from "../db/schema";
export type { formCompleterSchema } from "../schema";

export type SessionCost = {
	totalCost: number;
	inputTokens: number;
	outputTokens: number;
	cacheTokens: number;
	perModel: Record<
		string,
		{
			inputTokens: number;
			outputTokens: number;
			cacheTokens: number;
			cost: number;
		}
	>;
};
