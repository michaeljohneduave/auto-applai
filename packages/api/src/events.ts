import { EventEmitter } from "node:events";
import type { Sessions } from "@auto-apply/core/src/db/schema";

type SessionEvent = {
	userId: Sessions["userId"];
	sessionId: string;
};

export const eventBus = new EventEmitter();

export const emitSessionUpdate = (data: SessionEvent) => {
	eventBus.emit("session:update", data);
};
