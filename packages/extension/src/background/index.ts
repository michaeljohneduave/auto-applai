import { createClerkClient } from "@clerk/chrome-extension/background";

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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	// Handle token requests from popup or content scripts
	if (request.action === "getToken") {
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
	if (request.action === "elementSelected") {
		selectedHtml = request.html;
		selectedUrl = request.url;
		sendResponse({ success: true });
		return true;
	}

	// Handle requests for selected HTML from popup
	if (request.action === "getSelectedHtml") {
		sendResponse({
			success: true,
			html: selectedHtml,
			url: selectedUrl,
		});
		return true;
	}

	// Handle clearing selected HTML
	if (request.action === "clearSelectedHtml") {
		selectedHtml = null;
		selectedUrl = null;
		sendResponse({ success: true });
		return true;
	}

	// Handle extension scrape requests
	if (request.action === "extensionScrape") {
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
								html: request.html,
								url: request.url,
								userId: request.userId,
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

	return false;
});
