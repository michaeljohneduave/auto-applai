import Database from "better-sqlite3";
import Fastify from "fastify";

const server = Fastify();
const db = new Database("llm-logs.db");

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
	const stmt = db.prepare("SELECT * FROM llm_logs WHERE sessionId = ?");
	const logs = stmt.all(sessionId);
	return logs.map((log) => ({
		...log,
		request: JSON.parse(log.request),
		response: JSON.parse(log.response),
	}));
});

server.get("/", (request, reply) => {
	return { hello: "world" };
});

const start = async () => {
	try {
		await server.listen({ port: 4001 });
		console.log("LLM monitor server listening on http://localhost:4001");
	} catch (err) {
		console.error(err);
		process.exit(1);
	}
};

start();
