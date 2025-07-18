import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import LRUCache from "./utils/LRU";

const DB_CACHE_SIZE = 200;
const DB_ROOT = "dbs";

class DBManager {
	private dbCache = new LRUCache<Database.Database>(DB_CACHE_SIZE);

	constructor() {
		this.dbCache.on("evict", (_key, db) => db.close());
	}

	private getDBPath(userId: string): string {
		const sanitizedUserId = userId.replace(/[^a-zA-Z0-9]/g, "_");
		const parts = sanitizedUserId.match(/.{1,2}/g) || [];
		const dirPath = path.join(DB_ROOT, ...parts);
		fs.mkdirSync(dirPath, { recursive: true });
		return path.join(dirPath, "main.db");
	}

	getConnection(userId: string): Database.Database {
		const dbPath = this.getDBPath(userId);
		let db = this.dbCache.get(userId);

		if (!db) {
			db = new Database(dbPath);
			this.dbCache.set(userId, db);
		}

		return db;
	}
}

export const dbManager = new DBManager();
