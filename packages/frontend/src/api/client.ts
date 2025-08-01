export const useApiClient = () => {
	const apiUrl = "/api";

	const get = async (
		path: string,
		responseType: "json" | "arraybuffer" = "json",
	) => {
		const response = await fetch(`${apiUrl}${path}`);

		if (!response.ok) {
			throw new Error(response.statusText);
		}

		if (responseType === "arraybuffer") {
			return response.arrayBuffer();
		}

		return response.json();
	};

	const post = async (
		path: string,
		body: unknown,
		responseType: "json" | "arraybuffer" = "json",
	) => {
		const response = await fetch(`${apiUrl}${path}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			throw new Error(response.statusText);
		}

		if (responseType === "arraybuffer") {
			return response.arrayBuffer();
		}

		return response.json();
	};

	const put = async (
		path: string,
		body: unknown,
		responseType: "json" | "arraybuffer" = "json",
	) => {
		const response = await fetch(`${apiUrl}${path}`, {
			method: "PUT",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			throw new Error(response.statusText);
		}

		if (responseType === "arraybuffer") {
			return response.arrayBuffer();
		}

		return response.json();
	};

	const del = async (
		path: string,
		responseType: "json" | "arraybuffer" = "json",
	) => {
		const response = await fetch(`${apiUrl}${path}`, {
			method: "DELETE",
		});

		if (!response.ok) {
			throw new Error(response.statusText);
		}

		if (responseType === "arraybuffer") {
			return response.arrayBuffer();
		}

		return response.json();
	};

	return { get, post, put, delete: del };
};
