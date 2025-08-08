import type { Logs } from "@auto-apply/core/src/db/schema";
import {
	calculateTokenCost,
	getModelFromRequest,
	getModelPricing,
} from "./models-cache";

export interface WorkflowStep {
	id: string;
	name: string;
	displayName: string;
	status: "completed" | "in-progress" | "failed" | "pending" | "skipped";
	startTime: number;
	endTime?: number;
	duration?: number;
	logs: LogEntry[];
	totalCost: number;
	totalTokens: {
		input: number;
		output: number;
		cache: number;
	};
	modelUsage: {
		[model: string]: {
			count: number;
			totalCost: number;
			totalTokens: {
				input: number;
				output: number;
				cache: number;
			};
		};
	};
}

export interface LogEntry {
	id: number;
	timestamp: number;
	model: string;
	duration: number;
	cost: number;
	tokens: {
		input: number;
		output: number;
		cache: number;
	};
	requestPreview: string;
	responsePreview: string;
	fullRequest?: Logs["requestLog"]; // ChatCompletionCreateParamsNonStreaming
	fullResponse?: Logs["responseLog"]; // ChatCompletion
}

export interface TransformedLogs {
	sessionId: string;
	workflowSteps: WorkflowStep[];
	totalCost: number;
	totalDuration: number;
	totalTokens: {
		input: number;
		output: number;
		cache: number;
	};
	summary: {
		totalRequests: number;
		uniqueModels: string[];
		averageRequestDuration: number;
		costPerStep: { [step: string]: number };
	};
}

// Define the workflow steps in order
const WORKFLOW_STEPS = [
	{ id: "scraping", name: "scraping", displayName: "Web Scraping" },
	{
		id: "extracting_info",
		name: "extracting_info",
		displayName: "Information Extraction",
	},
	{
		id: "agentic_scraping",
		name: "agentic_scraping",
		displayName: "AI-Powered Scraping",
	},
	{
		id: "generating_resume",
		name: "generating_resume",
		displayName: "Resume Generation",
	},
	{
		id: "generating_latex",
		name: "generating_latex",
		displayName: "LaTeX Conversion",
	},
	{
		id: "generating_pdf",
		name: "generating_pdf",
		displayName: "PDF Generation",
	},
	{ id: "saving_assets", name: "saving_assets", displayName: "Asset Saving" },
	{ id: "ready_to_use", name: "ready_to_use", displayName: "Ready to Use" },
] as const;

export async function transformSessionLogs(
	logs: Logs[],
	sessionId: string,
	currentStep?: string,
): Promise<TransformedLogs> {
	const pricing = await getModelPricing();

	// Group logs by workflow step based on LLM name patterns
	const stepLogs: { [stepId: string]: Logs[] } = {};

	// Initialize all steps
	WORKFLOW_STEPS.forEach((step) => {
		stepLogs[step.id] = [];
	});

	// Group logs by LLM name patterns
	logs.forEach((log) => {
		const llmName = log.llmName?.toLowerCase() || "";

		// Map LLM names to workflow steps
		let stepId = "scraping"; // default

		if (llmName.includes("extract") || llmName.includes("info")) {
			stepId = "extracting_info";
		} else if (llmName.includes("agentic") || llmName.includes("crawler")) {
			stepId = "agentic_scraping";
		} else if (llmName.includes("resume") || llmName.includes("generate")) {
			stepId = "generating_resume";
		} else if (llmName.includes("latex") || llmName.includes("tex")) {
			stepId = "generating_latex";
		} else if (llmName.includes("pdf") || llmName.includes("convert")) {
			stepId = "generating_pdf";
		} else if (llmName.includes("form") || llmName.includes("complete")) {
			stepId = "ready_to_use";
		}

		if (!stepLogs[stepId]) {
			stepLogs[stepId] = [];
		}
		stepLogs[stepId].push(log);
	});

	// Transform each step
	const workflowSteps: WorkflowStep[] = [];
	let totalCost = 0;
	let totalDuration = 0;
	let totalInputTokens = 0;
	let totalOutputTokens = 0;
	let totalCacheTokens = 0;

	for (const step of WORKFLOW_STEPS) {
		const stepLogsList = stepLogs[step.id] || [];

		if (stepLogsList.length === 0) {
			// Create empty step
			workflowSteps.push({
				id: step.id,
				name: step.name,
				displayName: step.displayName,
				status: "skipped",
				startTime: 0,
				logs: [],
				totalCost: 0,
				totalTokens: { input: 0, output: 0, cache: 0 },
				modelUsage: {},
			});
			continue;
		}

		// Sort logs by timestamp
		stepLogsList.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

		const startTime = stepLogsList[0].createdAt || 0;
		const endTime = stepLogsList[stepLogsList.length - 1].createdAt || 0;
		const duration = endTime - startTime;

		let stepCost = 0;
		let stepInputTokens = 0;
		let stepOutputTokens = 0;
		let stepCacheTokens = 0;
		const modelUsage: WorkflowStep["modelUsage"] = {};

		const transformedLogs: LogEntry[] = stepLogsList.map((log) => {
			const model = getModelFromRequest(log.requestLog);
			const totalInputTokens = log.responseLog.usage?.prompt_tokens || 0;
			const outputTokens = log.responseLog.usage?.completion_tokens || 0;
			const cacheTokens =
				log.responseLog.usage?.prompt_tokens_details?.cached_tokens || 0;

			// Calculate non-cached input tokens to avoid double-counting for cost calculation
			const nonCachedInputTokens = totalInputTokens - cacheTokens;

			const cost = calculateTokenCost(
				model,
				nonCachedInputTokens,
				outputTokens,
				cacheTokens,
				pricing,
			);

			stepCost += cost;
			stepInputTokens += totalInputTokens; // Track total for display
			stepOutputTokens += outputTokens;
			stepCacheTokens += cacheTokens;

			// Track model usage
			if (!modelUsage[model]) {
				modelUsage[model] = {
					count: 0,
					totalCost: 0,
					totalTokens: { input: 0, output: 0, cache: 0 },
				};
			}
			modelUsage[model].count++;
			modelUsage[model].totalCost += cost;
			modelUsage[model].totalTokens.input += totalInputTokens; // Track total for display
			modelUsage[model].totalTokens.output += outputTokens;
			modelUsage[model].totalTokens.cache += cacheTokens;

			// Create previews
			const requestContent = log.requestLog.messages?.[0]?.content;
			const requestPreview =
				typeof requestContent === "string"
					? requestContent.substring(0, 100)
					: "No content";
			const responseContent = log.responseLog.choices?.[0]?.message?.content;
			const responsePreview =
				typeof responseContent === "string"
					? responseContent.substring(0, 100)
					: "No content";

			return {
				id: log.id,
				timestamp: log.createdAt || 0,
				model,
				duration: log.duration,
				cost,
				tokens: {
					input: totalInputTokens, // Display total input tokens
					output: outputTokens,
					cache: cacheTokens,
				},
				requestPreview,
				responsePreview,
				fullRequest: log.requestLog,
				fullResponse: log.responseLog,
			};
		});

		// Determine step status
		let status: WorkflowStep["status"] = "completed";
		if (step.id === "ready_to_use") {
			status = "completed";
		} else if (currentStep && step.id === currentStep) {
			status = "in-progress";
		} else if (stepLogsList.length === 0) {
			status = "skipped";
		}

		workflowSteps.push({
			id: step.id,
			name: step.name,
			displayName: step.displayName,
			status,
			startTime,
			endTime,
			duration,
			logs: transformedLogs,
			totalCost: stepCost,
			totalTokens: {
				input: stepInputTokens,
				output: stepOutputTokens,
				cache: stepCacheTokens,
			},
			modelUsage,
		});

		totalCost += stepCost;
		totalDuration += duration;
		totalInputTokens += stepInputTokens;
		totalOutputTokens += stepOutputTokens;
		totalCacheTokens += stepCacheTokens;
	}

	// Calculate summary statistics
	const totalRequests = logs.length;
	const uniqueModels = [
		...new Set(logs.map((log) => getModelFromRequest(log.requestLog))),
	];
	const averageRequestDuration =
		totalRequests > 0 ? totalDuration / totalRequests : 0;

	const costPerStep: { [step: string]: number } = {};
	workflowSteps.forEach((step) => {
		costPerStep[step.displayName] = step.totalCost;
	});

	return {
		sessionId,
		workflowSteps,
		totalCost,
		totalDuration,
		totalTokens: {
			input: totalInputTokens,
			output: totalOutputTokens,
			cache: totalCacheTokens,
		},
		summary: {
			totalRequests,
			uniqueModels,
			averageRequestDuration,
			costPerStep,
		},
	};
}
