import type { GetSessionsResponse } from "@auto-apply/api/src/server";

export interface BaseMessage {
	action: string;
	error?: string;
}

export interface JobPageMessage extends BaseMessage {
	action:
		| "scrapePage"
		| "enableElementSelection"
		| "disableElementSelection"
		| "populateForm";
	sessionData?: GetSessionsResponse[number];
}

export interface ExtensionUIMessage extends BaseMessage {
	action:
		| "pageScraped"
		| "elementSelected"
		| "elementSelectionCancelled"
		| "formPopulated"
		| "formPopulationError";
	html?: string;
	url?: string;
}

export interface BackgroundMessage extends BaseMessage {
	action:
		| "elementSelected"
		| "getSelectedHtml"
		| "getToken"
		| "extensionScrape"
		| "extensionScrapeNew"
		| "getSessionByUrl"
		| "downloadResume"
		| "storeOriginalTab"
		| "clearSelectedHtml"
		| "getOriginalTab"
		| "clearOriginalTab"
		| "returnToOriginalTab"
		| "fetchResumeData";
	tabId?: number;
	tabUrl?: string;
	userId?: string;
	sessionId?: string;
	html?: string;
	url?: string;
}
