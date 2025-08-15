declare module "bun:sqlite" {
	export class Database {
		constructor(filename: string);
		close(): void;
		prepare(query: string): Statement;
		exec(query: string): void;
		transaction<T>(fn: () => T): T;
	}

	export interface Statement {
		run(...params: any[]): { changes: number; lastInsertRowId: number };
		get(...params: any[]): any;
		all(...params: any[]): any[];
		finalize(): void;
	}
}

declare module "bun:*" {
	const value: any;
	export = value;
}
