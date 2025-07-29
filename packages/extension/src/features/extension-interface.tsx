import { useUser } from "@clerk/chrome-extension";
import { useEffect, useState } from "react";

export const ExtensionInterface = () => {
	const { user } = useUser();
	const [isScraping, setIsScraping] = useState(false);
	const [isSending, setIsSending] = useState(false);
	const [isSelecting, setIsSelecting] = useState(false);
	const [isCopying, setIsCopying] = useState(false);
	const [selectedHtml, setSelectedHtml] = useState<string | null>(null);
	const [currentUrl, setCurrentUrl] = useState<string>("");
	const [status, setStatus] = useState<string>("");

	// Get current tab URL and check for existing selected HTML on mount
	useEffect(() => {
		const initialize = async () => {
			try {
				const [tab] = await chrome.tabs.query({
					active: true,
					currentWindow: true,
				});
				setCurrentUrl(tab.url || "");

				// Check if there's already selected HTML from background script
				chrome.runtime.sendMessage(
					{ action: "getSelectedHtml" },
					(response) => {
						if (response.success && response.html) {
							setSelectedHtml(response.html);
							setStatus(
								'Element previously selected. Click "Send" to process.',
							);
						}
					},
				);
			} catch (error) {
				console.error("Error getting current URL:", error);
			}
		};
		initialize();
	}, []);

	// Listen for messages from content script
	useEffect(() => {
		const handleMessage = (message: any) => {
			if (message.action === "pageScraped") {
				setSelectedHtml(message.html);
				setIsScraping(false);
				setStatus(
					'Page content extracted successfully! Click "Send" to process.',
				);
			} else if (message.action === "elementSelected") {
				setSelectedHtml(message.html);
				setIsSelecting(false);
				setStatus('Element selected successfully! Click "Send" to process.');
			}
		};

		chrome.runtime.onMessage.addListener(handleMessage);

		return () => {
			chrome.runtime.onMessage.removeListener(handleMessage);
		};
	}, []);

	const handleScrape = async () => {
		setIsScraping(true);
		setStatus("Extracting job posting content and application forms...");
		setSelectedHtml(null);

		// Clear any existing selected HTML
		chrome.runtime.sendMessage({ action: "clearSelectedHtml" });

		try {
			// Send message to content script to scrape the page
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (tab.id) {
				await chrome.tabs.sendMessage(tab.id, { action: "scrapePage" });
			}
		} catch (error) {
			console.error("Error scraping page:", error);
			setStatus(
				"Error: Could not scrape the page. Please refresh and try again.",
			);
			setIsScraping(false);
		}
	};

	const handleSelectElement = async () => {
		setIsSelecting(true);
		setStatus("Click on any element on the page to select it...");
		setSelectedHtml(null);

		// Clear any existing selected HTML
		chrome.runtime.sendMessage({ action: "clearSelectedHtml" });

		try {
			// Send message to content script to enable element selection
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (tab.id) {
				await chrome.tabs.sendMessage(tab.id, {
					action: "enableElementSelection",
				});
			}
		} catch (error) {
			console.error("Error enabling element selection:", error);
			setStatus(
				"Error: Could not enable element selection. Please refresh and try again.",
			);
			setIsSelecting(false);
		}
	};

	const handleSend = async () => {
		if (!selectedHtml) {
			setStatus("No content extracted. Please scrape first.");
			return;
		}

		setIsSending(true);
		setStatus("Sending content to server...");

		try {
			// Get current tab URL
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			const url = tab.url || currentUrl;

			// Use background service worker to handle the API call with fresh token
			chrome.runtime.sendMessage(
				{
					action: "extensionScrape",
					html: selectedHtml,
					url: url,
					userId: user?.id,
				},
				(response) => {
					if (response.success) {
						setStatus(`Success! ${response.data.message}`);
						setSelectedHtml(null);
						// Clear the stored HTML after successful send
						chrome.runtime.sendMessage({ action: "clearSelectedHtml" });
					} else {
						setStatus(`Error: ${response.error}`);
					}
					setIsSending(false);
				},
			);
		} catch (error) {
			console.error("Error sending content:", error);
			setStatus(
				`Error: ${error instanceof Error ? error.message : "Failed to send content. Please try again."}`,
			);
			setIsSending(false);
		}
	};

	const handleClear = () => {
		setSelectedHtml(null);
		setStatus("Content cleared.");
		// Clear the stored HTML
		chrome.runtime.sendMessage({ action: "clearSelectedHtml" });
	};

	const handleCopyToClipboard = async () => {
		if (!selectedHtml) {
			setStatus("No content to copy. Please scrape first.");
			return;
		}

		setIsCopying(true);
		setStatus("Copying to clipboard...");

		try {
			// Get current tab URL
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			const url = tab.url || currentUrl;

			// Create the auto-apply preset content
			const autoApplyContent = `<!-- Auto-Apply Extension Content -->
<!-- URL: ${url} -->
<!-- Extracted on: ${new Date().toISOString()} -->

${selectedHtml}

<!-- End of Auto-Apply Extension Content -->`;

			// Copy to clipboard
			await navigator.clipboard.writeText(autoApplyContent);
			setStatus("Content copied to clipboard successfully!");
		} catch (error) {
			console.error("Error copying to clipboard:", error);
			setStatus("Error: Failed to copy to clipboard. Please try again.");
		} finally {
			setIsCopying(false);
		}
	};

	return (
		<div className="plasmo-flex plasmo-flex-col plasmo-gap-4">
			<div className="plasmo-text-sm plasmo-text-gray-600">
				Welcome, {user?.firstName || user?.emailAddresses[0]?.emailAddress}!
			</div>

			{currentUrl && (
				<div className="plasmo-text-xs plasmo-text-gray-500 plasmo-truncate">
					Current page: {currentUrl}
				</div>
			)}

			<div className="plasmo-flex plasmo-flex-col plasmo-gap-3">
				<button
					type="button"
					onClick={handleScrape}
					disabled={isScraping || isSelecting}
					className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-px-4 plasmo-py-2 plasmo-bg-blue-500 plasmo-text-white plasmo-rounded-lg plasmo-transition-all hover:plasmo-bg-blue-600 disabled:plasmo-opacity-50 disabled:plasmo-cursor-not-allowed"
				>
					{isScraping ? "Extracting Content..." : "Scrape Page"}
				</button>

				<button
					type="button"
					onClick={handleSelectElement}
					disabled={isScraping || isSelecting}
					className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-px-4 plasmo-py-2 plasmo-bg-purple-500 plasmo-text-white plasmo-rounded-lg plasmo-transition-all hover:plasmo-bg-purple-600 disabled:plasmo-opacity-50 disabled:plasmo-cursor-not-allowed"
				>
					{isSelecting ? "Selecting Element..." : "Select Element"}
				</button>

				<button
					type="button"
					onClick={handleSend}
					disabled={!selectedHtml || isSending}
					className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-px-4 plasmo-py-2 plasmo-bg-green-500 plasmo-text-white plasmo-rounded-lg plasmo-transition-all hover:plasmo-bg-green-600 disabled:plasmo-opacity-50 disabled:plasmo-cursor-not-allowed"
				>
					{isSending ? "Sending..." : "Send"}
				</button>

				{selectedHtml && (
					<button
						type="button"
						onClick={handleCopyToClipboard}
						disabled={isCopying}
						className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-px-4 plasmo-py-2 plasmo-bg-orange-500 plasmo-text-white plasmo-rounded-lg plasmo-transition-all hover:plasmo-bg-orange-600 disabled:plasmo-opacity-50 disabled:plasmo-cursor-not-allowed"
					>
						{isCopying ? "Copying..." : "Copy to Clipboard"}
					</button>
				)}

				{selectedHtml && (
					<button
						type="button"
						onClick={handleClear}
						className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-px-4 plasmo-py-2 plasmo-bg-gray-500 plasmo-text-white plasmo-rounded-lg plasmo-transition-all hover:plasmo-bg-gray-600"
					>
						Clear Content
					</button>
				)}
			</div>

			{status && (
				<div className="plasmo-mt-4 plasmo-p-3 plasmo-bg-blue-50 plasmo-border plasmo-border-blue-200 plasmo-rounded-lg">
					<div className="plasmo-text-sm plasmo-text-blue-800">{status}</div>
				</div>
			)}

			{selectedHtml && (
				<div className="plasmo-mt-4 plasmo-p-3 plasmo-bg-gray-100 plasmo-rounded-lg">
					<div className="plasmo-text-sm plasmo-font-semibold plasmo-mb-2">
						Extracted Content:
					</div>
					<div className="plasmo-text-xs plasmo-text-gray-600 plasmo-truncate plasmo-mb-2">
						{selectedHtml.substring(0, 100)}...
					</div>
					<div className="plasmo-text-xs plasmo-text-gray-500">
						Length: {selectedHtml.length} characters
					</div>
				</div>
			)}
		</div>
	);
};
