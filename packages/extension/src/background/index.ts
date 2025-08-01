import { createClerkClient } from "@clerk/chrome-extension/background";
import type { BackgroundMessage } from "~types";

const publishableKey = process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
	throw new Error(
		"Please add the PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY to the .env.development file",
	);
}

// Store selected HTML for popup access
let selectedHtml: string | null = null;
let selectedUrl: string | null = null;

// Use `createClerkClient()` to create a new Clerk instance
// and use `getToken()` to get a fresh token for the user
async function getToken() {
	const clerk = await createClerkClient({
		publishableKey,
	});

	// If there is no valid session, then return null. Otherwise proceed.
	if (!clerk.session) {
		return null;
	}

	// Return the user's session token
	return await clerk.session?.getToken();
}

// Create a listener to listen for messages from content scripts and popup
// It must return true, in order to keep the connection open and send a response later.
// NOTE: A runtime listener cannot be async.
chrome.runtime.onMessage.addListener(
	(message: BackgroundMessage, _sender, sendResponse) => {
		// Handle token requests from popup or content scripts
		if (message.action === "getToken") {
			getToken()
				.then((token) => sendResponse({ token }))
				.catch((error) => {
					console.error(
						"[Background service worker] Error:",
						JSON.stringify(error),
					);
					// If there is no token then send a null response
					sendResponse({ token: null });
				});
			return true; // REQUIRED: Indicates that the listener responds asynchronously.
		}

		// Handle element selection from content script
		if (message.action === "elementSelected") {
			selectedHtml = message.html;
			selectedUrl = message.url;
			sendResponse({ success: true });
			return true;
		}

		// Handle requests for selected HTML from popup
		if (message.action === "getSelectedHtml") {
			sendResponse({
				success: true,
				html: selectedHtml,
				url: selectedUrl,
			});
			return true;
		}

		// Handle clearing selected HTML
		if (message.action === "clearSelectedHtml") {
			selectedHtml = null;
			selectedUrl = null;
			sendResponse({ success: true });
			return true;
		}

		// Handle storing original tab information for login flow
		if (message.action === "storeOriginalTab") {
			chrome.storage.local.set(
				{
					originalTabId: message.tabId,
					originalTabUrl: message.tabUrl,
				},
				() => {
					sendResponse({ success: true });
				},
			);
			return true;
		}

		// Handle retrieving original tab information
		if (message.action === "getOriginalTab") {
			chrome.storage.local.get(
				["originalTabId", "originalTabUrl"],
				(result) => {
					sendResponse({
						success: true,
						tabId: result.originalTabId,
						tabUrl: result.originalTabUrl,
					});
				},
			);
			return true;
		}

		// Handle clearing original tab information
		if (message.action === "clearOriginalTab") {
			chrome.storage.local.remove(["originalTabId", "originalTabUrl"], () => {
				sendResponse({ success: true });
			});
			return true;
		}

		// Handle return to original tab from frontend
		if (message.action === "returnToOriginalTab") {
			const tabId = message.tabId;
			if (tabId) {
				chrome.tabs
					.get(tabId)
					.then((_tab) => {
						// Focus the original tab
						return chrome.tabs.update(tabId, { active: true });
					})
					.then(() => {
						// Focus the window containing the tab
						return chrome.tabs.get(tabId);
					})
					.then((tab) => {
						return chrome.windows.update(tab.windowId, { focused: true });
					})
					.then(() => {
						sendResponse({ success: true });
					})
					.catch((error) => {
						console.error("Error returning to original tab:", error);
						sendResponse({
							success: false,
							error: "Tab not found or cannot be focused",
						});
					});
			} else {
				sendResponse({ success: false, error: "No tab ID provided" });
			}
			return true;
		}

		// Handle extension scrape requests
		if (message.action === "extensionScrape") {
			getToken()
				.then(async (token) => {
					if (!token) {
						sendResponse({ success: false, error: "No valid session token" });
						return;
					}

					try {
						const response = await fetch(
							"http://localhost:5500/extension-scrape",
							{
								method: "POST",
								headers: {
									"Content-Type": "application/json",
								},
								body: JSON.stringify({
									html: message.html,
									url: message.url,
									userId: message.userId,
								}),
							},
						);

						const result = await response.json();
						sendResponse({ success: response.ok, data: result });
					} catch (error) {
						console.error("[Background service worker] API Error:", error);
						sendResponse({
							success: false,
							error: "Failed to send request to API",
						});
					}
				})
				.catch((error) => {
					console.error(
						"[Background service worker] Error:",
						JSON.stringify(error),
					);
					sendResponse({ success: false, error: "Failed to get token" });
				});
			return true; // REQUIRED: Indicates that the listener responds asynchronously.
		}

		// Handle session queries by URL
		if (message.action === "getSessionByUrl") {
			getToken()
				.then(async (token) => {
					if (!token) {
						sendResponse({ success: false, error: "No valid session token" });
						return;
					}

					try {
						const response = await fetch(
							`http://localhost:5500/sessions/by-url?url=${encodeURIComponent(message.url)}`,
						);

						if (response.ok) {
							const data = await response.json();
							sendResponse({ success: true, data });
						} else {
							sendResponse({
								success: false,
								error: "Failed to fetch session",
							});
						}
					} catch (error) {
						console.error("[Background service worker] API Error:", error);
						sendResponse({
							success: false,
							error: "Failed to send request to API",
						});
					}
				})
				.catch((error) => {
					console.error(
						"[Background service worker] Error:",
						JSON.stringify(error),
					);
					sendResponse({ success: false, error: "Failed to get token" });
				});
			return true;
		}

		// Handle resume downloads
		if (message.action === "downloadResume") {
			getToken()
				.then(async (token) => {
					if (!token) {
						sendResponse({ success: false, error: "No valid session token" });
						return;
					}

					try {
						const response = await fetch(
							`http://localhost:5500/generated-resume?sessionId=${message.sessionId}`,
							{
								method: "GET",
								headers: {
									Authorization: `Bearer ${token}`,
								},
							},
						);

						if (response.ok) {
							const blob = await response.blob();
							const url = URL.createObjectURL(blob);

							// Create a download link and trigger download
							const a = document.createElement("a");
							a.href = url;
							a.download = `resume-${message.sessionId}.pdf`;
							document.body.appendChild(a);
							a.click();
							document.body.removeChild(a);
							URL.revokeObjectURL(url);

							sendResponse({ success: true });
						} else {
							sendResponse({
								success: false,
								error: "Failed to download resume",
							});
						}
					} catch (error) {
						console.error("[Background service worker] API Error:", error);
						sendResponse({
							success: false,
							error: "Failed to download resume",
						});
					}
				})
				.catch((error) => {
					console.error(
						"[Background service worker] Error:",
						JSON.stringify(error),
					);
					sendResponse({ success: false, error: "Failed to get token" });
				});
			return true;
		}

		// Handle resume data fetching for form population
		if (message.action === "fetchResumeData") {
			getToken()
				.then(async (token) => {
					if (!token) {
						sendResponse({ success: false, error: "No valid session token" });
						return;
					}

					try {
						const response = await fetch(
							`http://localhost:5500/generated-resume?sessionId=${message.sessionId}`,
							{
								method: "GET",
								headers: {
									Authorization: `Bearer ${token}`,
								},
							},
						);

						if (response.ok) {
							const arrayBuffer = await response.arrayBuffer();
							// Convert to base64 in chunks to avoid stack overflow
							const uint8Array = new Uint8Array(arrayBuffer);
							const chunkSize = 1024; // Process in 1KB chunks
							let binaryString = "";

							for (let i = 0; i < uint8Array.length; i += chunkSize) {
								const chunk = uint8Array.slice(
									i,
									Math.min(i + chunkSize, uint8Array.length),
								);
								for (let j = 0; j < chunk.length; j++) {
									binaryString += String.fromCharCode(chunk[j]);
								}
							}

							const base64 = btoa(binaryString);
							sendResponse({
								success: true,
								data: base64,
								fileName: `resume-${message.sessionId}.pdf`,
								mimeType: "application/pdf",
							});
						} else {
							sendResponse({
								success: false,
								error: "Failed to fetch resume data",
							});
						}
					} catch (error) {
						console.error("[Background service worker] API Error:", error);
						sendResponse({
							success: false,
							error: "Failed to fetch resume data",
						});
					}
				})
				.catch((error) => {
					console.error(
						"[Background service worker] Error:",
						JSON.stringify(error),
					);
					sendResponse({ success: false, error: "Failed to get token" });
				});
			return true;
		}

		return false;
	},
);
