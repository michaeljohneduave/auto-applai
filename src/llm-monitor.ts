import Database from "better-sqlite3";
import Fastify from "fastify";

type Model = {
	attachment: boolean;
	cost: {
		input: number;
		output: number;
	};
	id: string;
	knowledge: string;
	last_updated: string;
	limit: {
		context: number;
		output: number;
	};
	modalities: {
		input: string[];
		output: string[];
	};
	name: string;
	open_weights: boolean;
	reasoning: boolean;
	release_date: string;
	temperature: boolean;
	tool_call: boolean;
};

type ModelProvider = {
	doc: string;
	env: string[];
	id: string;
	models: Record<string, Model>;
	name: string;
	npm: string;
};

type ModelsDev = Record<string, ModelProvider>;

const server = Fastify();
const db = new Database("llm-logs.db");
let modelPricing: ModelsDev;

db.exec(`
  CREATE TABLE IF NOT EXISTS llm_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId TEXT NOT NULL,
    llmName TEXT NOT NULL,
    request TEXT NOT NULL,
    response TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

server.post("/log", (request, reply) => {
	const {
		sessionId,
		llmName,
		request: llmRequest,
		response: llmResponse,
	} = request.body as {
		sessionId: string;
		llmName: string;
		request: object;
		response: object;
	};
	const stmt = db.prepare(
		"INSERT INTO llm_logs (sessionId, llmName, request, response) VALUES (?, ?, ?, ?)",
	);
	stmt.run(
		sessionId,
		llmName,
		JSON.stringify(llmRequest),
		JSON.stringify(llmResponse),
	);
	reply.status(201).send({ status: "ok" });
});

server.get("/sessions", (request, reply) => {
	const stmt = db.prepare(
		"SELECT sessionId, MIN(timestamp) as createdAt FROM llm_logs GROUP BY sessionId ORDER BY createdAt DESC",
	);
	const sessions = stmt.all();
	return reply.send(sessions);
});

server.get("/sessions/:sessionId", async (request, reply) => {
	const { sessionId } = request.params as { sessionId: string };
	const { llmName } = request.query as { llmName?: string | string[] };

	let query = "SELECT * FROM llm_logs WHERE sessionId = ?";
	const params: (string | number)[] = [sessionId];

	if (llmName && llmName.length > 0) {
		const llmNames = (
			Array.isArray(llmName) ? llmName : llmName.split(",")
		).filter(Boolean);
		if (llmNames.length > 0) {
			const placeholders = llmNames.map(() => "?").join(",");
			query += ` AND llmName IN (${placeholders})`;
			params.push(...llmNames);
		}
	}

	const stmt = db.prepare(query);
	const logs = stmt.all(params);
	const parsedLogs = logs.map((log) => ({
		...log,
		request: JSON.parse(log.request),
		response: JSON.parse(log.response),
	}));

	const tokenUsage = parsedLogs.reduce(
		(acc, log) => {
			const { response } = log;
			const modelName = response.model;
			if (!response.usage || !modelName) {
				return acc;
			}
			const { prompt_tokens, completion_tokens } = response.usage;
			if (!acc[modelName]) {
				acc[modelName] = {
					prompt_tokens: 0,
					completion_tokens: 0,
					total_tokens: 0,
					cost: 0,
				};
			}
			acc[modelName].prompt_tokens += prompt_tokens;
			acc[modelName].completion_tokens += completion_tokens;
			acc[modelName].total_tokens += prompt_tokens + completion_tokens;

			const modelInfo =
				modelPricing.google[modelName] ??
				Object.values(modelPricing)
					.flatMap((provider: ModelProvider) => Object.values(provider.models))
					.find((model: Model) => model.id === modelName);

			if (modelInfo) {
				const inputCost = (prompt_tokens / 1_000_000) * modelInfo.cost.input;
				const outputCost =
					(completion_tokens / 1_000_000) * modelInfo.cost.output;
				acc[modelName].cost += (inputCost + outputCost) * 100;
			}

			return acc;
		},
		{} as Record<
			string,
			{
				prompt_tokens: number;
				completion_tokens: number;
				total_tokens: number;
				cost: number;
			}
		>,
	);

	return {
		zzlogs: parsedLogs,
		summary: tokenUsage,
	};
});

server.get("/", (request, reply) => {
	return { hello: "world" };
});

const fetchModelPricing = async () => {
	try {
		modelPricing = await fetch("https://models.dev/api.json").then((res) =>
			res.json(),
		);
	} catch (error) {
		console.error("Failed to fetch model pricing:", error);
	}
};

const start = async () => {
	try {
		await fetchModelPricing();
		await server.listen({ port: 4001 });
		console.log("LLM monitor server listening on http://localhost:4001");
	} catch (err) {
		console.error(err);
		process.exit(1);
	}
};

start();
