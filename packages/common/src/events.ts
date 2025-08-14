import { EventEmitter } from "node:events";

export type SessionEvent = {
	userId: string;
	sessionId: string;
};

export const eventBus = new EventEmitter();

export const emitSessionUpdate = (data: SessionEvent) => {
	eventBus.emit("session:update", data);
};
