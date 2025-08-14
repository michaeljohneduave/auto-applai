import type { TransformedLogs } from "@auto-apply/api/src/log-transformer";
import type {
	GetAssetsResponse,
	GetSessionsResponse,
	PostAssetsPdfBody,
	PostSessionsBody,
	PutAssetsBody,
	PutSessionJobStatusBody,
	PutSessionNotesBody,
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
	return (params?: {
		limit?: number;
		skip?: number;
	}): Promise<GetSessionsResponse> => {
		const searchParams = new URLSearchParams();
		if (params?.limit) searchParams.append("limit", params.limit.toString());
		if (params?.skip) searchParams.append("skip", params.skip.toString());
		const query = searchParams.toString();
		return apiClient.get(`/sessions${query ? `?${query}` : ""}`);
	};
};

export const useFetchSessionsCount = () => {
	const apiClient = useApiClient();
	return (): Promise<{ count: number }> => apiClient.get("/sessions/count");
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

// Session asset APIs
export const useListSessionAssets = (sessionId: string) => {
	const apiClient = useApiClient();
	return (ext?: string) =>
		apiClient.get(
			`/sessions/${sessionId}/assets${ext ? `?ext=${encodeURIComponent(ext)}` : ""}`,
		);
};

export const useFetchSessionAssetContent = (sessionId: string) => {
	const apiClient = useApiClient();
	return (name: string) =>
		apiClient.get(
			`/sessions/${sessionId}/assets/content?name=${encodeURIComponent(name)}`,
		);
};

export const useUpdateSessionAssetContent = (sessionId: string) => {
	const apiClient = useApiClient();
	return (name: string, content: string) =>
		apiClient.put(
			`/sessions/${sessionId}/assets/content?name=${encodeURIComponent(name)}`,
			{ content },
		);
};

// DB-backed resume variant APIs
export const useListLatexVariants = (sessionId: string) => {
	const apiClient = useApiClient();
	return () => apiClient.get(`/sessions/${sessionId}/latex-variants`);
};

export const useGetLatexVariant = (sessionId: string) => {
	const apiClient = useApiClient();
	return (variantId: string) =>
		apiClient.get(`/sessions/${sessionId}/latex-variants/${variantId}`);
};

export const useUpdateLatexVariant = (sessionId: string) => {
	const apiClient = useApiClient();
	return (variantId: string, latex: string) =>
		apiClient.put(`/sessions/${sessionId}/latex-variants/${variantId}`, {
			latex,
		});
};

export const useUpdateJobStatus = () => {
	const apiClient = useApiClient();
	return (sessionId: string, body: PutSessionJobStatusBody) =>
		apiClient.put(`/sessions/${sessionId}/job-status`, body);
};

export const useUpdateSessionNotes = () => {
	const apiClient = useApiClient();
	return (sessionId: string, body: PutSessionNotesBody) =>
		apiClient.put(`/sessions/${sessionId}/notes`, body);
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

export const useRetrySession = () => {
	const apiClient = useApiClient();
	return (sessionId: string) =>
		apiClient.post(`/sessions/${sessionId}/retry`, {}, "json");
};
