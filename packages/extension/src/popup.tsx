import {
	ClerkProvider,
	SignedIn,
	SignedOut,
	SignInButton,
	UserButton,
	useUser,
} from "@clerk/chrome-extension";
import { useEffect, useState } from "react";

import { ExtensionInterface } from "~features/extension-interface";

import "~style.css";

const PUBLISHABLE_KEY = process.env.PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const SYNC_HOST = process.env.PLASMO_PUBLIC_CLERK_SYNC_HOST;
const EXTENSION_URL = chrome.runtime.getURL(".");
const FRONTEND_URL = process.env.PLASMO_PUBLIC_WEB_URL;

if (!PUBLISHABLE_KEY || !SYNC_HOST) {
	throw new Error(
		"Please add the PLASMO_PUBLIC_CLERK_PUBLISHABLE_KEY and PLASMO_PUBLIC_CLERK_SYNC_HOST to the .env.development file",
	);
}

// Component to handle the signed-out state with redirect to frontend
const SignedOutContent = () => {
	const [originalTabId, setOriginalTabId] = useState<number | null>(null);
	const [originalTabUrl, setOriginalTabUrl] = useState<string>("");

	useEffect(() => {
		// Get current tab information when component mounts
		const getCurrentTab = async () => {
			try {
				const [tab] = await chrome.tabs.query({
					active: true,
					currentWindow: true,
				});
				if (tab.id && tab.url) {
					setOriginalTabId(tab.id);
					setOriginalTabUrl(tab.url);
					// Store in background script for later retrieval
					chrome.runtime.sendMessage({
						action: "storeOriginalTab",
						tabId: tab.id,
						tabUrl: tab.url,
					});
				}
			} catch (error) {
				console.error("Error getting current tab:", error);
			}
		};
		getCurrentTab();
	}, []);

	const handleLoginRedirect = async () => {
		try {
			// Create a new tab with the frontend URL and original tab info
			const loginUrl = new URL(FRONTEND_URL);
			if (originalTabId && originalTabUrl) {
				loginUrl.searchParams.set("returnTabId", originalTabId.toString());
				loginUrl.searchParams.set("returnTabUrl", originalTabUrl);
			}

			await chrome.tabs.create({ url: loginUrl.toString() });
			// Close the popup after redirecting
			window.close();
		} catch (error) {
			console.error("Error redirecting to frontend:", error);
		}
	};

	return (
		<div className="plasmo-flex plasmo-flex-col plasmo-items-center plasmo-justify-center plasmo-h-full plasmo-gap-4">
			<div className="plasmo-text-center">
				<h2 className="plasmo-text-xl plasmo-font-semibold plasmo-mb-2">
					Welcome to Auto-Apply
				</h2>
				<p className="plasmo-text-gray-600 plasmo-mb-6">
					Sign in to start using the extension
				</p>
				<button
					type="button"
					onClick={handleLoginRedirect}
					className="plasmo-bg-blue-600 plasmo-text-white plasmo-px-6 plasmo-py-3 plasmo-rounded-lg plasmo-font-medium plasmo-hover:bg-blue-700 plasmo-transition-colors"
				>
					Click here to login
				</button>
			</div>
		</div>
	);
};

// Component to handle the signed-in state with return guidance
const SignedInContent = () => {
	const { user } = useUser();
	const [showReturnGuidance, setShowReturnGuidance] = useState(false);
	const [originalTabId, setOriginalTabId] = useState<number | null>(null);
	const [_originalTabUrl, setOriginalTabUrl] = useState<string>("");

	useEffect(() => {
		// Check if we have stored original tab info
		chrome.runtime.sendMessage({ action: "getOriginalTab" }, (response) => {
			if (response.success && response.tabId) {
				setOriginalTabId(response.tabId);
				setOriginalTabUrl(response.tabUrl);
				setShowReturnGuidance(true);
			}
		});
	}, []);

	const handleReturnToOriginalTab = async () => {
		if (originalTabId) {
			try {
				// Check if the original tab still exists
				const tab = await chrome.tabs.get(originalTabId);
				if (tab) {
					// Clear the stored info after successful return
					await chrome.runtime.sendMessage({ action: "clearOriginalTab" });
					// Focus the original tab
					await chrome.tabs.update(originalTabId, { active: true });
					// Focus the window containing the tab
					await chrome.windows.update(tab.windowId, { focused: true });
				} else {
					// Tab was closed, maybe we can open a new tab for that URL?
					// and also clear the old tab data

					chrome.runtime.sendMessage({ action: "clearOriginalTab" });
					setShowReturnGuidance(false);
				}
			} catch (error) {
				console.error("Error returning to original tab:", error);
				// Tab might have been closed, clear stored info
				chrome.runtime.sendMessage({ action: "clearOriginalTab" });
				setShowReturnGuidance(false);
			}
		}
	};

	if (showReturnGuidance) {
		return (
			<div className="plasmo-flex plasmo-flex-col plasmo-items-center plasmo-justify-center plasmo-h-full plasmo-gap-4">
				<div className="plasmo-text-center">
					<h2 className="plasmo-text-xl plasmo-font-semibold plasmo-mb-2 plasmo-text-green-600">
						Login Successful!
					</h2>
					<p className="plasmo-text-gray-600 plasmo-mb-4">
						Welcome back,{" "}
						{user?.firstName || user?.emailAddresses[0]?.emailAddress}!
					</p>
					<p className="plasmo-text-gray-600 plasmo-mb-6">
						You can now return to your original tab to continue using the
						extension.
					</p>
					<button
						type="button"
						onClick={handleReturnToOriginalTab}
						className="plasmo-bg-green-600 plasmo-text-white plasmo-px-6 plasmo-py-3 plasmo-rounded-lg plasmo-font-medium plasmo-hover:bg-green-700 plasmo-transition-colors"
					>
						Return to Original Tab
					</button>
				</div>
			</div>
		);
	}

	// Show the normal extension interface if no return guidance needed
	return <ExtensionInterface />;
};

function IndexPopup() {
	return (
		<ClerkProvider
			publishableKey={PUBLISHABLE_KEY}
			afterSignOutUrl={`${EXTENSION_URL}/popup.html`}
			signInFallbackRedirectUrl={`${EXTENSION_URL}/popup.html`}
			signUpFallbackRedirectUrl={`${EXTENSION_URL}/popup.html`}
			allowedRedirectOrigins={["chrome-extension://*"]}
			syncHost={SYNC_HOST}
		>
			<div className="plasmo-flex plasmo-flex-col plasmo-h-[600px] plasmo-w-[400px] plasmo-overflow-hidden">
				<header className="plasmo-flex-shrink-0 plasmo-w-full plasmo-flex plasmo-justify-between plasmo-items-center plasmo-p-4 plasmo-border-b plasmo-border-gray-200">
					<h1 className="plasmo-text-lg plasmo-font-semibold">
						Auto-Apply Extension
					</h1>
					<SignedOut>
						<div className="plasmo-w-8 plasmo-h-8" />{" "}
						{/* Spacer to maintain layout */}
					</SignedOut>
					<SignedIn>
						<UserButton />
					</SignedIn>
				</header>
				<main className="plasmo-flex-1 plasmo-w-full plasmo-overflow-y-auto plasmo-p-4">
					<SignedOut>
						<SignedOutContent />
					</SignedOut>
					<SignedIn>
						<SignedInContent />
					</SignedIn>
				</main>
			</div>
		</ClerkProvider>
	);
}

export default IndexPopup;
