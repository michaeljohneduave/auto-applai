import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as relations from "./relations";
import * as schema from "./schema";

const sqlite = new Database("../../sqlite.db");

export const db = drizzle({
	client: sqlite,
	schema: {
		...relations,
		...schema,
	},
});
