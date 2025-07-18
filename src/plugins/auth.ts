import { getAuth, type SessionAuthObject } from "@clerk/fastify";
import type {
	FastifyPluginCallback,
	FastifyReply,
	FastifyRequest,
} from "fastify";
import fp from "fastify-plugin";

declare module "fastify" {
	interface FastifyInstance {
		authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void>;
	}
	interface FastifyRequest {
		session: SessionAuthObject | null;
	}
}

const authPlugin: FastifyPluginCallback = (fastify, _, done) => {
	fastify.decorateRequest("session", null);

	fastify.decorate(
		"authenticate",
		async (req: FastifyRequest, reply: FastifyReply) => {
			const user = await getAuth(req);
			if (user.userId) {
				req.session = user;
			} else {
				reply.code(401).send({ error: "Invalid or expired token" });
			}
		},
	);

	done();
};

export default fp(authPlugin);
