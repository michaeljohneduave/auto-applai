import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/index.mjs";

export default class MCPClient {
	private mcp: Client;
	private openai: OpenAI;
	private transport: SSEClientTransport | null = null;
	tools: Tool[] = [];

	constructor() {
		this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
		this.openai = new OpenAI({
			apiKey: process.env.GEMINI_API_KEY,
			baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
		});
	}

	async connectToServer() {
		try {
			this.transport = new SSEClientTransport(
				new URL("http://localhost:3000/sse")
			);
			await this.mcp.connect(this.transport);

			const toolsResult = await this.mcp.listTools();
			this.tools = toolsResult.tools.map((tool) => {
				return {
					name: tool.name,
					description: tool.description,
					inputSchema: tool.inputSchema,
				};
			});
		} catch (e) {
			console.log("Failed to connect to MCP server: ", e);
			throw e;
		}
	}

	async callTool({
		name,
		args = "{}",
	}: {
		name: string;
		args?: string;
	}) {
		const tool = this.tools.find((t) => t.name === name);

		if (!tool) {
			throw new Error(`Tool ${name} not found`);
		}

		const result = await this.mcp.callTool({
			name: name,
			arguments: JSON.parse(args),
		});

		if (result.error) {
			throw new Error(`Error calling tool ${name}: ${result.error}`);
		}

		return result;
	}

	async processQuery(messages: ChatCompletionMessageParam[]) {
		const response = await this.openai.chat.completions.create({
			model: "gemini-2.0-flash",
			messages,
			tools: this.tools.map((tool) => ({
				type: "function",
				function: {
					name: tool.name,
					description: tool.description,
					parameters: tool.inputSchema,
				},
			})),
		});

		const finalText: string[] = [];
		const toolResults: Awaited<ReturnType<typeof this.mcp.callTool>>[] = [];

		if (response.choices[0].message.tool_calls) {
			for (const toolCall of response.choices[0].message.tool_calls) {
				const toolName = toolCall.function.name;
				const toolArgs = toolCall.function.arguments;
				console.log("Tool call:", toolName, toolArgs);
				const result = await this.mcp.callTool({
					name: toolName,
					arguments: JSON.parse(toolArgs),
				});

				toolResults.push(result);
				finalText.push(
					`[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`
				);

				messages.push({
					role: "user",
					content: JSON.stringify(result.content),
				});

				const response = await this.openai.chat.completions.create({
					model: "gemini-2.5-flash-preview-04-17",
					messages,
					tools: this.tools.map((tool) => ({
						type: "function",
						function: {
							name: tool.name,
							description: tool.description,
							parameters: tool.inputSchema,
						},
					})),
				});

				finalText.push(response.choices[0].message.content as string);
			}
		} else if (response.choices[0].message.content) {
			finalText.push(response.choices[0].message.content);
		} else {
			console.log("No content or tool calls found in the response");
			console.log(response.choices[0].message);
		}

		return finalText.join("\n");
	}
	async cleanup() {
		await this.mcp.close();
	}
}
