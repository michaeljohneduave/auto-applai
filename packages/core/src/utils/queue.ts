import EventEmitter from "node:events";

interface Job {
	userId: string;
	jobUrl: string;
	html?: string;
	forceNew?: boolean;
}

class InMemoryQueue {
	private jobs: Job[] = [];
	private emitter = new EventEmitter();

	enqueue(job: Job) {
		this.jobs.push(job);
		this.emitter.emit("newJob");
	}

	dequeue(): Job | undefined {
		return this.jobs.shift();
	}

	on(event: "newJob", listener: () => void) {
		this.emitter.on(event, listener);
	}
}

export const queue = new InMemoryQueue();
