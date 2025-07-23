import { useApiClient } from "./client";

export const useFetchBaseAssets = () => {
	const apiClient = useApiClient();
	return () => apiClient.get("/assets");
};

export const useFetchApplications = () => {
	const apiClient = useApiClient();
	return () => apiClient.get("/sessions");
};

export const useFetchAssetContent = (id: string) => {
	const apiClient = useApiClient();
	return async () => {
		const data = await apiClient.get(`/assets/${id}`);
		return data.content;
	};
};

export const useUpdateAssetContent = (id: string) => {
	const apiClient = useApiClient();
	return async (content: string) => {
		await apiClient.post(`/assets/${id}`, { content });
	};
};
