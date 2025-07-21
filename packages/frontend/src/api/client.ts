export const useApiClient = () => {
  const apiUrl = "/api";

  const get = async (path: string) => {
    const response = await fetch(`${apiUrl}${path}`);
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    return response.json();
  };

  const post = async (path: string, body: any) => {
    const response = await fetch(`${apiUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(response.statusText);
    }
    return response.json();
  };

  return { get, post };
};
