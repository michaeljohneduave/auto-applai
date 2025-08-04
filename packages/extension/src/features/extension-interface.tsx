import type { GetSessionsResponse } from "@auto-apply/api/src/server";
import { useUser } from "@clerk/chrome-extension";
import { useCallback, useEffect, useState } from "react";
import type { ExtensionUIMessage } from "~types";

export const ExtensionInterface = () => {
	const { user } = useUser();
	const [isScraping, setIsScraping] = useState(false);
	const [isSending, setIsSending] = useState(false);
	const [isSelecting, setIsSelecting] = useState(false);
	const [isCopying, setIsCopying] = useState(false);
	const [isPopulatingForm, setIsPopulatingForm] = useState(false);
	const [selectedHtml, setSelectedHtml] = useState<string | null>(null);
	const [currentUrl, setCurrentUrl] = useState<string>("");
	const [status, setStatus] = useState<string>("");
	const [session, setSession] = useState<GetSessionsResponse[number] | null>(
		null,
	);
	const [isLoadingSession, setIsLoadingSession] = useState(false);
	const [showExtractedContent, setShowExtractedContent] = useState(false);

	// Load session data for a given URL
	const loadSessionData = useCallback((url: string) => {
		setIsLoadingSession(true);
		try {
			chrome.runtime.sendMessage(
				{
					action: "getSessionByUrl",
					url: url,
				},
				(response) => {
					if (response.success && response.data) {
						setSession(response.data);
					} else {
						setSession(null);
					}
					setIsLoadingSession(false);
				},
			);
		} catch (error) {
			console.error("Error loading session data:", error);
			setIsLoadingSession(false);
		}
	}, []);

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

				// Load session data for current URL
				if (tab.url) {
					loadSessionData(tab.url);
				}
			} catch (error) {
				console.error("Error getting current URL:", error);
			}
		};
		initialize();
	}, [loadSessionData]);

	// Listen for messages from content script
	useEffect(() => {
		const handleMessage = (message: ExtensionUIMessage) => {
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
			} else if (message.action === "elementSelectionCancelled") {
				// Only handle this for escape key cancellation, not button cancellation
				setIsSelecting(false);
				setStatus("Element selection cancelled (ESC pressed).");
			} else if (message.action === "formPopulated") {
				setIsPopulatingForm(false);
				setStatus("Form populated successfully!");
			} else if (message.action === "formPopulationError") {
				setIsPopulatingForm(false);
				setStatus(`Error: ${message.error}`);
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
		setStatus(
			"Click on any element on the page to select it... (Press ESC to cancel)",
		);
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

	const handleCancelSelection = async () => {
		setIsSelecting(false);
		setStatus("Element selection cancelled.");

		try {
			// Send message to content script to disable element selection
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (tab.id) {
				await chrome.tabs.sendMessage(tab.id, {
					action: "disableElementSelection",
				});
			}
		} catch (error) {
			console.error("Error disabling element selection:", error);
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
						// Reload session data after successful send
						loadSessionData(url);
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

	const handleSendAsNew = async () => {
		if (!selectedHtml) {
			setStatus("No content extracted. Please scrape first.");
			return;
		}

		setIsSending(true);
		setStatus("Creating new session...");

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
					action: "extensionScrapeNew",
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
						// Reload session data after successful send
						loadSessionData(url);
					} else {
						setStatus(`Error: ${response.error}`);
					}
					setIsSending(false);
				},
			);
		} catch (error) {
			console.error("Error sending content as new:", error);
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

	const handleDownloadResume = () => {
		if (!session) return;

		try {
			chrome.runtime.sendMessage(
				{
					action: "downloadResume",
					sessionId: session.id,
				},
				(response) => {
					if (response.success) {
						setStatus("Resume downloaded successfully!");
					} else {
						setStatus(`Error: ${response.error}`);
					}
				},
			);
		} catch (error) {
			console.error("Error downloading resume:", error);
			setStatus("Error: Failed to download resume.");
		}
	};

	const handlePopulateForm = async () => {
		if (!session || session.status !== "done") return;

		setIsPopulatingForm(true);
		setStatus("Populating form fields...");

		try {
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true,
			});
			if (tab.id) {
				await chrome.tabs.sendMessage(tab.id, {
					action: "populateForm",
					sessionData: session,
				});
			}
		} catch (error) {
			console.error("Error populating form:", error);
			setStatus("Error: Could not populate form. Please try again.");
			setIsPopulatingForm(false);
		}
	};

	const getStatusColor = (status: string) => {
		switch (status) {
			case "done":
				return "plasmo-text-green-600";
			case "processing":
				return "plasmo-text-blue-600";
			case "failed":
				return "plasmo-text-red-600";
			default:
				return "plasmo-text-gray-600";
		}
	};

	const getStatusText = (status: string) => {
		switch (status) {
			case "done":
				return "✅ Complete";
			case "processing":
				return "⏳ Processing";
			case "failed":
				return "❌ Failed";
			default:
				return "⏳ Processing";
		}
	};

	return (
		<div className="plasmo-flex plasmo-flex-col plasmo-gap-4 plasmo-min-h-0">
			<div className="plasmo-text-sm plasmo-text-gray-600 plasmo-truncate">
				Welcome, {user?.firstName || user?.emailAddresses[0]?.emailAddress}!
			</div>

			{currentUrl && (
				<div className="plasmo-text-xs plasmo-text-gray-500 plasmo-truncate plasmo-break-all">
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

				{isSelecting && (
					<button
						type="button"
						onClick={handleCancelSelection}
						className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-px-4 plasmo-py-2 plasmo-bg-red-500 plasmo-text-white plasmo-rounded-lg plasmo-transition-all hover:plasmo-bg-red-600"
					>
						Cancel Selection
					</button>
				)}

				<button
					type="button"
					onClick={handleSend}
					disabled={!selectedHtml || isSending}
					className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-px-4 plasmo-py-2 plasmo-bg-green-500 plasmo-text-white plasmo-rounded-lg plasmo-transition-all hover:plasmo-bg-green-600 disabled:plasmo-opacity-50 disabled:plasmo-cursor-not-allowed"
				>
					{isSending ? "Sending..." : "Send"}
				</button>

				{/* Show Send as New button only when there's a completed session */}
				{session && session.status === "done" && selectedHtml && (
					<button
						type="button"
						onClick={handleSendAsNew}
						disabled={!selectedHtml || isSending}
						className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-px-4 plasmo-py-2 plasmo-bg-indigo-500 plasmo-text-white plasmo-rounded-lg plasmo-transition-all hover:plasmo-bg-indigo-600 disabled:plasmo-opacity-50 disabled:plasmo-cursor-not-allowed"
					>
						{isSending ? "Creating..." : "Send as New"}
					</button>
				)}

				{selectedHtml && (
					<div className="plasmo-flex plasmo-gap-2">
						<button
							type="button"
							onClick={handleCopyToClipboard}
							disabled={isCopying}
							className="plasmo-flex-1 plasmo-flex plasmo-items-center plasmo-justify-center plasmo-px-4 plasmo-py-2 plasmo-bg-orange-500 plasmo-text-white plasmo-rounded-lg plasmo-transition-all hover:plasmo-bg-orange-600 disabled:plasmo-opacity-50 disabled:plasmo-cursor-not-allowed"
						>
							{isCopying ? "Copying..." : "Copy"}
						</button>
						<button
							type="button"
							onClick={handleClear}
							className="plasmo-flex-1 plasmo-flex plasmo-items-center plasmo-justify-center plasmo-px-4 plasmo-py-2 plasmo-bg-gray-500 plasmo-text-white plasmo-rounded-lg plasmo-transition-all hover:plasmo-bg-gray-600"
						>
							Clear
						</button>
					</div>
				)}

				{selectedHtml && (
					<div className="plasmo-p-3 plasmo-bg-gray-100 plasmo-rounded-lg">
						<div className="plasmo-flex plasmo-justify-between plasmo-items-center plasmo-mb-2">
							<div className="plasmo-text-sm plasmo-font-semibold">
								Extracted Content:
							</div>
							<button
								type="button"
								onClick={() => setShowExtractedContent(!showExtractedContent)}
								className="plasmo-text-xs plasmo-text-blue-600 hover:plasmo-text-blue-800"
							>
								{showExtractedContent ? "Hide" : "Show"}
							</button>
						</div>
						{showExtractedContent ? (
							<div className="plasmo-text-xs plasmo-text-gray-600 plasmo-break-words plasmo-mb-2 plasmo-max-h-32 plasmo-overflow-y-auto">
								{selectedHtml}
							</div>
						) : (
							<div className="plasmo-text-xs plasmo-text-gray-600 plasmo-truncate plasmo-mb-2">
								{selectedHtml.substring(0, 100)}...
							</div>
						)}
						<div className="plasmo-text-xs plasmo-text-gray-500">
							Length: {selectedHtml.length} characters
						</div>
					</div>
				)}

				{status && (
					<div className="plasmo-p-3 plasmo-bg-blue-50 plasmo-border plasmo-border-blue-200 plasmo-rounded-lg">
						<div className="plasmo-text-sm plasmo-text-blue-800 plasmo-break-words">
							{status}
						</div>
					</div>
				)}
			</div>

			{/* Divider */}
			<div className="plasmo-border-t plasmo-border-gray-200 plasmo-my-4"></div>

			{/* Session Status Section */}
			{isLoadingSession ? (
				<div className="plasmo-p-3 plasmo-bg-gray-50 plasmo-border plasmo-border-gray-200 plasmo-rounded-lg">
					<div className="plasmo-text-sm plasmo-text-gray-600">
						Loading session data...
					</div>
				</div>
			) : session ? (
				<div className="plasmo-p-3 plasmo-bg-gray-50 plasmo-border plasmo-border-gray-200 plasmo-rounded-lg">
					<div className="plasmo-text-sm plasmo-font-semibold plasmo-mb-2">
						Session Status
					</div>
					<div
						className={`plasmo-text-sm plasmo-mb-1 ${getStatusColor(session.status)}`}
					>
						{getStatusText(session.status)}
					</div>
					{session.companyName && (
						<div className="plasmo-text-xs plasmo-text-gray-600 plasmo-mb-1 plasmo-truncate">
							Company: {session.companyName}
						</div>
					)}
					{session.title && (
						<div className="plasmo-text-xs plasmo-text-gray-600 plasmo-mb-1 plasmo-truncate">
							Job: {session.title}
						</div>
					)}
					<div className="plasmo-text-xs plasmo-text-gray-500">
						Created: {new Date(session.createdAt).toLocaleDateString()}
					</div>
				</div>
			) : (
				<div className="plasmo-p-3 plasmo-bg-gray-50 plasmo-border plasmo-border-gray-200 plasmo-rounded-lg">
					<div className="plasmo-text-sm plasmo-text-gray-600">
						No session found for this URL
					</div>
				</div>
			)}

			{/* Assets Section - Only show if session is done */}
			{session && session.status === "done" && (
				<div className="plasmo-p-3 plasmo-bg-green-50 plasmo-border plasmo-border-green-200 plasmo-rounded-lg">
					<div className="plasmo-text-sm plasmo-font-semibold plasmo-mb-2 plasmo-text-green-800">
						Generated Assets
					</div>
					<div className="plasmo-flex plasmo-flex-col plasmo-gap-2">
						<button
							type="button"
							onClick={handleDownloadResume}
							className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-px-3 plasmo-py-2 plasmo-bg-green-500 plasmo-text-white plasmo-rounded-lg plasmo-transition-all hover:plasmo-bg-green-600 plasmo-text-sm"
						>
							📄 Download Resume
						</button>
						{session.coverLetter && (
							<div className="plasmo-p-2 plasmo-bg-blue-50 plasmo-border plasmo-border-blue-200 plasmo-rounded-lg">
								<div className="plasmo-text-xs plasmo-font-semibold plasmo-text-blue-800 plasmo-mb-1">
									Cover Letter:
								</div>
								<div className="plasmo-text-xs plasmo-text-blue-700 plasmo-line-clamp-3">
									{session.coverLetter.substring(0, 200)}...
								</div>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Form Population Section - Only show if session is done */}
			{session && session.status === "done" && (
				<div className="plasmo-p-3 plasmo-bg-purple-50 plasmo-border plasmo-border-purple-200 plasmo-rounded-lg">
					<div className="plasmo-text-sm plasmo-font-semibold plasmo-mb-2 plasmo-text-purple-800">
						Form Population
					</div>
					<button
						type="button"
						onClick={handlePopulateForm}
						disabled={isPopulatingForm}
						className="plasmo-flex plasmo-items-center plasmo-justify-center plasmo-px-4 plasmo-py-2 plasmo-bg-purple-500 plasmo-text-white plasmo-rounded-lg plasmo-transition-all hover:plasmo-bg-purple-600 disabled:plasmo-opacity-50 disabled:plasmo-cursor-not-allowed plasmo-w-full"
					>
						{isPopulatingForm ? "Populating..." : "Auto-Populate Form"}
					</button>
				</div>
			)}
		</div>
	);
};
