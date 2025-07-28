import { Database } from "bun:sqlite";
import * as relations from "@auto-apply/core/src/db/relations";
import * as schema from "@auto-apply/core/src/db/schema";
import { drizzle } from "drizzle-orm/bun-sqlite";

const sqlite = new Database("../../sqlite.db");

export const db = drizzle({
	client: sqlite,
	schema: {
		...relations,
		...schema,
	},
});
