import type { TransformedLogs } from "@auto-apply/api/src/log-transformer";
import type {
	GetAssetsResponse,
	GetSessionsResponse,
	PostAssetsPdfBody,
	PostSessionsBody,
	PutAssetsBody,
	PutSessionAppliedBody,
} from "@auto-apply/api/src/server.ts";
import { useApiClient } from "./client";

export const useFetchBaseAssets = () => {
	const apiClient = useApiClient();
	return (): Promise<GetAssetsResponse> => apiClient.get("/assets");
};

export const useMutateBaseAssets = () => {
	const apiClient = useApiClient();
	return (body: PutAssetsBody) => {
		return apiClient.put("/assets", body, "json");
	};
};

export const useGeneratePdf = () => {
	const apiClient = useApiClient();
	return (body: PostAssetsPdfBody): Promise<ArrayBuffer> =>
		apiClient.post("/assets/pdf", body, "arraybuffer");
};

export const useFetchSessions = () => {
	const apiClient = useApiClient();
	return (): Promise<GetSessionsResponse> => apiClient.get("/sessions");
};

export const useFetchAssetContent = (id: string) => {
	const apiClient = useApiClient();
	return async () => {
		const data = await apiClient.get(`/assets/${id}`);
		return data.content;
	};
};

export const useNewSession = () => {
	const apiClient = useApiClient();

	return (body: PostSessionsBody) => apiClient.post("/sessions", body);
};

export const useFetchResumePdf = () => {
	const apiClient = useApiClient();

	return (sessionId: GetSessionsResponse[number]["id"]): Promise<ArrayBuffer> =>
		// TRPC not so bad now?
		apiClient.get(`/generated-resume?sessionId=${sessionId}`, "arraybuffer");
};

export const useUpdateAssetContent = (id: string) => {
	const apiClient = useApiClient();
	return async (content: string) => {
		await apiClient.post(`/assets/${id}`, { content });
	};
};

export const useUpdateSessionApplied = () => {
	const apiClient = useApiClient();
	return (sessionId: string, body: PutSessionAppliedBody) =>
		apiClient.put(`/sessions/${sessionId}/applied`, body);
};

export const useDeleteSession = () => {
	const apiClient = useApiClient();
	return (sessionId: string) => apiClient.delete(`/sessions/${sessionId}`);
};

export const useFetchSessionLogs = () => {
	const apiClient = useApiClient();
	return (sessionId: string): Promise<TransformedLogs> =>
		apiClient.get(`/sessions/${sessionId}/logs`);
};
