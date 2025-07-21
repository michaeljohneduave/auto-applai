import { hrtime } from "node:process";
import { setTimeout } from "node:timers/promises";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type {
	CallToolResult,
	Prompt,
} from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";
import type { ParsedChatCompletion } from "openai/resources/beta/chat/completions.mjs";
import type {
	ChatCompletion,
	ChatCompletionCreateParamsNonStreaming,
	ChatCompletionMessageParam,
	ChatCompletionTool,
} from "openai/resources.mjs";
import { randomString } from "remeda";
import { z } from "zod";

interface MCPClientConfig {
	name: string;
	version: string;
}

interface MCPSSEConfig extends MCPClientConfig {
	transport: "sse";
	url: string;
}

interface MCPStdioConfig extends MCPClientConfig {
	transport: "stdio";
	command: string;
	args?: string[];
}

type LLMOptions = {
	model?: string;
	retries?: number;
	maxRuns?: number;
	useEval?: boolean;
	apiKey?: string;
	baseUrl?: string;
	parallelToolCalls?: boolean;
	sessionId?: string;
};

type NativeTool<T extends z.ZodRawShape> = {
	name: string;
	description: string;
	parameters: T;
	execute: (
		args: z.infer<z.ZodObject<T>>,
	) => CallToolResult | Promise<CallToolResult>;
};

export const GEMINI_25_FLASH = "gemini-2.5-flash-preview-05-20";
export const GEMINI_25_PRO = "gemini-2.5-pro-preview-06-05";
export const GEMINI_20_FLASH = "gemini-2.0-flash";
export const GEMINI_25_FLASH_LITE = "gemini-2.5-flash-lite-preview-06-17";

export const grok = {
	apiKey: process.env.XAI_API_KEY,
	baseUrl: "https://api.x.ai/v1",
	models: {
		MINI: "grok-3-mini",
	},
};

export const google = {
	apiKey: process.env.GEMINI_API_KEY,
	baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
	models: {
		BIG_MODEL: "gemini-2.5-flash-preview-05-20",
		SMART_MODEL: "gemini-2.5-pro-preview-06-05",
		SMALL_MODEL: "gemini-2.0-flash",
	},
};

export default class LLM {
	#name = "LLM";
	#mcps: Array<{
		name: string;
		client: Client;
		tools: ChatCompletionTool["function"][];
		prompts: Prompt[];
	}> = [];
	#tools: NativeTool<z.ZodRawShape>[] = [];

	#openai: OpenAI;
	#model = GEMINI_20_FLASH; // Default model
	#messages: ChatCompletionMessageParam[];
	#retries = 3;
	#maxRuns: number;

	#isReady = true;
	#useEval = false;
	#parallelToolCalls = false;
	#sessionId: string;

	constructor(name?: string, options?: LLMOptions) {
		switch (options?.model) {
			case grok.models.MINI:
				this.#openai = new OpenAI({
					apiKey: grok.apiKey,
					baseURL: grok.baseUrl,
				});
				break;
			case google.models.BIG_MODEL:
			case google.models.SMALL_MODEL:
			case google.models.SMART_MODEL:
				this.#openai = new OpenAI({
					apiKey: google.apiKey,
					baseURL: google.baseUrl,
				});
				break;
			default:
				this.#openai = new OpenAI({
					apiKey: google.apiKey,
					baseURL: google.baseUrl,
				});
				break;
		}

		if (name) {
			this.#name = name;
		}

		if (options) {
			this.#model = options.model || this.#model;
			this.#maxRuns = options.maxRuns || this.#maxRuns;
			this.#useEval = options.useEval || this.#useEval;
			this.#parallelToolCalls =
				options.parallelToolCalls || this.#parallelToolCalls;
			this.#sessionId = options.sessionId || randomString(10);
			this.#retries = options.retries || this.#retries;
		}
	}

	async #toolNotifHandler() {
		console.log("Tool notification received, refreshing tools...");
		this.#isReady = false;
		// For now we refresh all mcp client tools when a tool notification is received
		for (const mcp of this.#mcps) {
			const tools = await mcp.client.listTools();

			mcp.tools = tools.tools.map((tool) => {
				return {
					name: tool.name,
					description: tool.description,
					inputSchema: tool.inputSchema,
				};
			});
		}
		this.#isReady = true;
	}

	async addMCPClient(params: MCPSSEConfig | MCPStdioConfig) {
		const client = new Client({
			name: params.name,
			version: params.version,
		});

		if (params.transport === "stdio") {
			const stdioTransport: StdioClientTransport = new StdioClientTransport({
				command: params.command,
				args: params.args || [],
			});
			await client.connect(stdioTransport);
		} else if (params.transport === "sse") {
			const sseTransport = new SSEClientTransport(new URL(params.url));
			await client.connect(sseTransport);
		} else {
			throw new Error("Unsupported transport type");
		}

		const toolsResult = await client.listTools();
		const prompts = await client.listPrompts();

		client.setNotificationHandler(
			z.object({
				method: z.literal("notifications/tools/list_changed"),
			}),
			() => this.#toolNotifHandler(),
		);
		this.#mcps.push({
			name: params.name,
			client,
			tools: toolsResult.tools.map((tool) => {
				return {
					name: tool.name,
					description: tool.description,
					parameters: tool.inputSchema,
				};
			}),
			prompts: prompts.prompts,
		});

		console.log(
			"Tools added:",
			toolsResult.tools.map((t) => t.name),
		);
	}

	setMessages(messages: ChatCompletionMessageParam[]) {
		this.#messages = structuredClone(messages);
	}

	addMessage(message: ChatCompletionMessageParam) {
		this.#messages.push(message);
	}

	async callTool({ name, args = "{}" }: { name: string; args?: string }) {
		for (const mcp of this.#mcps) {
			const tool = mcp.tools.find((t) => t.name === name);
			if (!tool) {
				continue;
			}

			let tries = 3;
			while (tries--) {
				const result = await Promise.race([
					mcp.client.callTool({
						name,
						arguments: JSON.parse(args),
					}),
					setTimeout(5000, new Error("Timeout")),
				]);

				// Timeout
				if (result instanceof Error) {
					return {
						isError: true,
						content: [
							{
								type: "text",
								text: "Error occurred on calling tool",
							},
						],
					};
				}

				if (result.error) {
					throw new Error(`Error calling tool ${name}: ${result.error}`);
				}

				return result;
			}
		}

		for (const t of this.#tools) {
			if (t.name === name) {
				return t.execute(JSON.parse(args));
			}
		}

		throw new Error(`Tool ${name} not found`);
	}

	addTool<T extends z.ZodRawShape>(opts: NativeTool<T>) {
		this.#tools.push({
			name: opts.name,
			description: opts.description,
			parameters: opts.parameters,
			execute: (args) =>
				opts.execute(args as unknown as z.infer<z.ZodObject<T>>),
		});
	}

	getTools() {
		return this.#mcps
			.flatMap((mcp) =>
				mcp.tools.map((tool) => ({
					type: "function",
					function: {
						name: tool.name,
						description: tool.description,
						parameters: tool.parameters,
					},
				})),
			)
			.concat(
				this.#tools.map((tool) => ({
					type: "function",
					function: {
						name: tool.name,
						description: tool.description,
						parameters: tool.parameters,
					},
				})),
			) as ChatCompletionTool[];
	}

	async eval({ evalMessages }: { evalMessages: ChatCompletionMessageParam[] }) {
		const response = await this.#openai.chat.completions.create({
			model: this.#model,
			messages: [
				{
					role: "system",
					content: `
# Identity
You are an expert in evaluating LLM workflows and responses

# Instructions
1. You are given a series of messages from an interaction between the LLM and the user.
2. Evaluate the actions of the LLM and in accordance with the instructions and system prompt.
3. Steer the LLM into the correct path to help them help the user.
4. There are tools available to the LLM.
        `,
				},
				{
					role: "user",
					content: `
<messages>
${JSON.stringify(evalMessages)}
</messages>

<tools>
${JSON.stringify(this.getTools())}
</tools>
          `,
				},
			],
			temperature: 0.2,
			top_p: 0.9,
		});

		return response.choices[0].message.content;
	}

	async generateOutput_grok(
		params: Exclude<
			Omit<ChatCompletionCreateParamsNonStreaming, "model" | "messages">,
			"response_format"
		>,
	) {
		await this.#waitForReady();
		let completion: ChatCompletion;

		while (true) {
			const completionParams: ChatCompletionCreateParamsNonStreaming = {
				...params,
				messages: this.#messages,
				model: this.#model,
				tools: this.getTools(),
			};

			completion = await this.#openai.chat.completions.create(completionParams);
			const [choice] = completion.choices;

			await this.#logLlmCall(completionParams, completion);

			if (choice.message.tool_calls) {
				choice.message.tool_calls = choice.message.tool_calls.map((t) => ({
					...t,
					id: t.id || randomString(5),
				}));

				this.#messages.push(choice.message);

				const toolResults = await Promise.all(
					choice.message.tool_calls.map(async (toolCall) => {
						return {
							id: toolCall.id,
							content: await this.callTool({
								name: toolCall.function.name,
								args: toolCall.function.arguments,
							}),
						};
					}),
				);

				for (const toolResult of toolResults) {
					this.#messages.push({
						role: "tool",
						tool_call_id: toolResult.id,
						content: JSON.stringify(toolResult.content),
					});
				}
			} else if (choice.finish_reason === "stop") {
				break;
			}
		}

		return completion;
	}

	async generateOutput(
		params: Exclude<
			Omit<ChatCompletionCreateParamsNonStreaming, "model" | "messages">,
			"response_format"
		>,
	) {
		const totalUsage = {
			promptTokens: 0,
			completionTokens: 0,
		};

		if (Object.values(grok.models).includes(this.#model)) {
			return {
				completion: await this.generateOutput_grok(params),
			};
		}

		await this.#waitForReady();
		let completion: ChatCompletion;
		let runs = 0;

		while (true) {
			runs++;

			const completionParams: ChatCompletionCreateParamsNonStreaming = {
				...params,
				messages: this.#messages,
				model: this.#model,
				tools: this.getTools(),
			};

			completion = await this.#openai.chat.completions.create(completionParams);
			const [choice] = completion.choices;

			if (completion.usage) {
				totalUsage.promptTokens += completion.usage.prompt_tokens;
				totalUsage.completionTokens += completion.usage.completion_tokens;
			}

			await this.#logLlmCall(completionParams, completion);

			if (choice.finish_reason === "stop") {
				break;
			}

			if (this.#maxRuns && this.#maxRuns <= runs) {
				console.log(
					"Max runs reached, telling the LLM to cleanup if necessary",
				);

				break;
			}

			if (
				choice.finish_reason === "tool_calls" ||
				choice.finish_reason === "function_call"
			) {
				if (choice.message.tool_calls) {
					choice.message.tool_calls = choice.message.tool_calls.map((t) => ({
						...t,
						id: t.id || randomString(5),
					}));

					this.#messages.push(choice.message);

					console.log("Tool Calls");
					console.log(
						choice.message.tool_calls.map(
							(t) => `${t.function.name}: ${t.function.arguments}`,
						),
					);

					// No parallel tool calls for now
					for (const toolCall of choice.message.tool_calls) {
						const toolResult = await this.callTool({
							name: toolCall.function.name,
							args: toolCall.function.arguments,
						});
						this.#messages.push({
							role: "tool",
							tool_call_id: toolCall.id,
							content: JSON.stringify(toolResult),
						});

						console.log("Tool Result");
						console.log("%o", toolResult);
					}
				} else {
					console.error(
						`Finish reason is ${choice.finish_reason} but no tool calls`,
					);
					console.error("%o", choice.message);
				}
			} else {
				console.log("Default finish_reason");
				console.log(completion.choices[0]);
				break;
			}
		}

		return { completion };
	}

	async generateStructuredOutput(
		params: Omit<ChatCompletionCreateParamsNonStreaming, "model" | "messages"> &
			Required<Pick<ChatCompletionCreateParamsNonStreaming, "response_format">>,
	) {
		let retries = this.#retries;

		await this.#waitForReady();

		while (retries--) {
			try {
				const completionParams: ChatCompletionCreateParamsNonStreaming = {
					...params,
					messages: this.#messages,
					model: this.#model,
				};
				const response =
					await this.#openai.beta.chat.completions.parse(completionParams);

				await this.#logLlmCall(completionParams, response);

				return response;
			} catch (error) {
				console.error(error);
				if (retries === 0) {
					throw new Error(
						`Error processing query after retries: ${error.message}`,
					);
				}
				console.warn(`Retrying query due to error: ${error.message}`);
			}
		}

		throw new Error("Error processing query: Unable to complete after retries");
	}

	async #logLlmCall<T>(
		request: ChatCompletionCreateParamsNonStreaming,
		response: ParsedChatCompletion<T> | ChatCompletion,
	) {
		try {
			// await fetch("http://localhost:5000/log", {
			// 	method: "POST",
			// 	headers: {
			// 		"Content-Type": "application/json",
			// 	},
			// 	body: JSON.stringify({
			// 		sessionId: this.#sessionId,
			// 		llmName: this.#name,
			// 		request,
			// 		response,
			// 	}),
			// });
		} catch (error) {
			console.error("Failed to log LLM call:", error);
		}
	}

	async #waitForReady() {
		if (this.#isReady) {
			return;
		}
		const start = hrtime.bigint();
		while (!this.#isReady) {
			// await new Promise((resolve) => setTimeout(resolve, 100));
			await setTimeout(100);
		}

		console.log(
			`LLM is ready after ${Number(
				(hrtime.bigint() - start) / BigInt(1_000_000),
			)} ms`,
		);
	}

	async cleanup() {
		for (const mcp of this.#mcps) {
			await mcp.client.close();
		}
	}
}
