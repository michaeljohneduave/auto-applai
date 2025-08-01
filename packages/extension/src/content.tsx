import cssText from "data-text:~style.css";
import type { GetSessionsResponse } from "@auto-apply/api/src/server";
import type { PlasmoCSConfig } from "plasmo";
import type { JobPageMessage } from "~types";

export const config: PlasmoCSConfig = {
	matches: ["<all_urls>"],
};

export const getStyle = (): HTMLStyleElement => {
	const baseFontSize = 16;
	let updatedCssText = cssText.replaceAll(":root", ":host(plasmo-csui)");
	const remRegex = /([\d.]+)rem/g;
	updatedCssText = updatedCssText.replace(remRegex, (_match, remValue) => {
		const pixelsValue = parseFloat(remValue) * baseFontSize;
		return `${pixelsValue}px`;
	});
	const styleElement = document.createElement("style");
	styleElement.textContent = updatedCssText;
	return styleElement;
};

// Global variables for element selection
let isSelectionMode = false;
let highlightedElement: HTMLElement | null = null;
let originalStyles: { [key: string]: string } = {};

// Function to clean HTML by removing unnecessary elements
const cleanHtml = (html: string): string => {
	const parser = new DOMParser();
	const doc = parser.parseFromString(html, "text/html");

	// Remove script tags
	const scripts = doc.querySelectorAll("script");
	scripts.forEach((script) => script.remove());

	// Remove style tags
	const styles = doc.querySelectorAll("style");
	styles.forEach((style) => style.remove());

	// Remove link tags (CSS)
	const links = doc.querySelectorAll('link[rel="stylesheet"]');
	links.forEach((link) => link.remove());

	// Remove meta tags
	const metas = doc.querySelectorAll("meta");
	metas.forEach((meta) => meta.remove());

	// Remove navigation and UI noise
	const navSelectors = [
		"nav",
		"header",
		"footer",
		".nav",
		".navigation",
		".menu",
		".sidebar",
		".breadcrumb",
		".breadcrumbs",
		".pagination",
		".pager",
		".social-share",
		".social-media",
		".share-buttons",
		".cookie-banner",
		".popup",
		".modal",
		".overlay",
		".advertisement",
		".ad",
		".sponsored",
		".promoted",
		".related-jobs",
		".similar-jobs",
		".recommendations",
	];
	navSelectors.forEach((selector) => {
		const elements = doc.querySelectorAll(selector);
		elements.forEach((el) => el.remove());
	});

	// Remove interactive elements that aren't application-related
	const interactiveSelectors = [
		'input[type="search"]',
		'input[type="text"]:not([name*="apply"]):not([name*="job"])',
		'select:not([name*="apply"]):not([name*="job"])',
		'button:not([class*="apply"]):not([class*="submit"]):not([id*="apply"]):not([id*="submit"])',
		".filter",
		".search",
		".sort",
		".dropdown",
	];
	interactiveSelectors.forEach((selector) => {
		const elements = doc.querySelectorAll(selector);
		elements.forEach((el) => el.remove());
	});

	// Remove comments
	const walker = document.createTreeWalker(doc, NodeFilter.SHOW_COMMENT, null);
	const comments: Node[] = [];
	let node: Node | null;
	while (true) {
		node = walker.nextNode();
		if (!node) break;
		comments.push(node);
	}
	comments.forEach((comment) => {
		if (comment.parentNode) {
			comment.parentNode.removeChild(comment);
		}
	});

	// Remove inline styles and non-semantic attributes
	const allElements = doc.querySelectorAll("*");
	allElements.forEach((el) => {
		// Remove inline styles
		el.removeAttribute("style");

		// Remove non-semantic class names (keep semantic ones)
		const classList = el.classList;
		if (classList) {
			const semanticClasses = [
				"job-title",
				"company-name",
				"job-description",
				"apply-button",
				"submit-button",
			];
			const classesToRemove = Array.from(classList).filter(
				(cls) => !semanticClasses.some((semantic) => cls.includes(semantic)),
			);
			classesToRemove.forEach((cls) => el.classList.remove(cls));
		}

		// Remove data attributes (except data-job-* which might be semantic)
		const dataAttrs = Array.from(el.attributes).filter(
			(attr) =>
				attr.name.startsWith("data-") && !attr.name.startsWith("data-job-"),
		);
		dataAttrs.forEach((attr) => el.removeAttribute(attr.name));

		// Remove ARIA attributes (except role and aria-label which might be semantic)
		const ariaAttrs = Array.from(el.attributes).filter(
			(attr) => attr.name.startsWith("aria-") && attr.name !== "aria-label",
		);
		ariaAttrs.forEach((attr) => el.removeAttribute(attr.name));

		// Remove event handlers
		const eventAttrs = Array.from(el.attributes).filter((attr) =>
			attr.name.startsWith("on"),
		);
		eventAttrs.forEach((attr) => el.removeAttribute(attr.name));
	});

	// Remove empty elements
	const emptyElements = doc.querySelectorAll("*");
	emptyElements.forEach((el) => {
		if (el.children.length === 0 && !el.textContent?.trim()) {
			el.remove();
		}
	});

	// Remove redundant whitespace and normalize text
	const textNodes = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT, null);
	const textNodesToProcess: Node[] = [];
	while (true) {
		const textNode = textNodes.nextNode();
		if (!textNode) break;
		textNodesToProcess.push(textNode);
	}

	textNodesToProcess.forEach((textNode) => {
		if (textNode.textContent) {
			// Normalize whitespace: replace multiple spaces/tabs with single space
			textNode.textContent = textNode.textContent.replace(/\s+/g, " ").trim();
		}
	});

	return doc.documentElement.outerHTML;
};

// Function to highlight an element
const highlightElement = (element: HTMLElement) => {
	if (highlightedElement) {
		// Restore original styles
		Object.keys(originalStyles).forEach((property) => {
			// biome-ignore lint/suspicious/noExplicitAny:  localized as any
			highlightedElement!.style[property as any] = originalStyles[property];
		});
	}

	highlightedElement = element;
	originalStyles = {};

	// Store original styles
	const computedStyle = window.getComputedStyle(element);
	const propertiesToStore = [
		"outline",
		"outlineOffset",
		"backgroundColor",
		"border",
	];
	propertiesToStore.forEach((prop) => {
		originalStyles[prop] = computedStyle.getPropertyValue(prop);
	});

	// Apply highlight styles
	element.style.outline = "3px solid #8b5cf6";
	element.style.outlineOffset = "2px";
	element.style.backgroundColor = "rgba(139, 92, 246, 0.1)";
	element.style.border = "2px solid #8b5cf6";
};

// Function to clear highlighting
const clearHighlighting = () => {
	if (highlightedElement) {
		Object.keys(originalStyles).forEach((property) => {
			// biome-ignore lint/suspicious/noExplicitAny:  localized as any
			highlightedElement!.style[property as any] = originalStyles[property];
		});
		highlightedElement = null;
		originalStyles = {};
	}
};

// Function to enable element selection mode
const enableElementSelection = () => {
	isSelectionMode = true;
	document.body.style.cursor = "crosshair";

	// Add event listeners
	document.addEventListener("mouseover", handleMouseOver);
	document.addEventListener("mouseout", handleMouseOut);
	document.addEventListener("click", handleElementClick);

	// Add escape key listener
	const handleEscape = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			disableElementSelection(); // This will send the cancellation message
		}
	};
	document.addEventListener("keydown", handleEscape);
};

// Function to disable element selection mode
const disableElementSelection = (sendCancellationMessage = true) => {
	isSelectionMode = false;
	document.body.style.cursor = "";
	clearHighlighting();

	// Remove event listeners
	document.removeEventListener("mouseover", handleMouseOver);
	document.removeEventListener("mouseout", handleMouseOut);
	document.removeEventListener("click", handleElementClick);

	// Remove escape key listener
	document.removeEventListener("keydown", (e) => {
		if (e.key === "Escape") {
			disableElementSelection();
		}
	});

	// Send message to popup to update UI state only if requested
	if (sendCancellationMessage) {
		chrome.runtime.sendMessage({
			action: "elementSelectionCancelled",
		});
	}
};

// Mouse over handler for highlighting
const handleMouseOver = (e: MouseEvent) => {
	if (!isSelectionMode) return;

	const target = e.target as HTMLElement;
	if (target && target !== highlightedElement) {
		highlightElement(target);
	}
};

// Mouse out handler
const handleMouseOut = (e: MouseEvent) => {
	if (!isSelectionMode) return;

	const target = e.target as HTMLElement;
	const relatedTarget = e.relatedTarget as HTMLElement;

	// Only clear if we're not moving to a child element
	if (!target.contains(relatedTarget)) {
		clearHighlighting();
	}
};

// Click handler for element selection
const handleElementClick = (e: MouseEvent) => {
	if (!isSelectionMode) return;

	e.preventDefault();
	e.stopPropagation();

	const target = e.target as HTMLElement;
	if (target) {
		const selectedHtml = cleanHtml(target.outerHTML);

		// Send message to background script instead of popup
		chrome.runtime.sendMessage({
			action: "elementSelected",
			html: selectedHtml,
			url: window.location.href,
		});

		disableElementSelection();
	}
};

// Function to extract job posting content
const extractJobContent = (): string => {
	const jobSelectors = [
		'[class*="job"]',
		'[class*="position"]',
		'[class*="career"]',
		'[class*="employment"]',
		'[id*="job"]',
		'[id*="position"]',
		'[id*="career"]',
		'[id*="employment"]',
		".job-description",
		".job-details",
		".position-description",
		".career-details",
		".employment-details",
		".job-view-layout",
		".jobs-description",
		".jobsearch-JobComponent",
		".jobsearch-JobComponent-description",
		".jobDescriptionContent",
		"main",
		"article",
		".content",
		".main-content",
		".page-content",
	];

	let content = "";

	for (const selector of jobSelectors) {
		const elements = document.querySelectorAll(selector);
		for (const element of elements) {
			const text = element.textContent?.trim();
			if (text && text.length > 100) {
				content += `${element.outerHTML}\n`;
			}
		}
	}

	if (!content) {
		const mainContent =
			document.querySelector("main") ||
			document.querySelector("article") ||
			document.querySelector(".content") ||
			document.querySelector(".main-content");

		if (mainContent) {
			content = mainContent.outerHTML;
		} else {
			content = document.body.innerHTML;
		}
	}

	return cleanHtml(content);
};

// Function to extract application forms
const extractApplicationForms = (): string => {
	const formSelectors = [
		'form[action*="apply"]',
		'form[action*="application"]',
		'form[action*="career"]',
		'form[action*="job"]',
		'form[action*="position"]',
		'form[class*="apply"]',
		'form[class*="application"]',
		'form[class*="career"]',
		'form[class*="job"]',
		'form[id*="apply"]',
		'form[id*="application"]',
		'form[id*="career"]',
		'form[id*="job"]',
		"form",
		'a[href*="apply"]',
		'a[href*="application"]',
		'a[href*="career"]',
		'button[onclick*="apply"]',
		'button[onclick*="application"]',
	];

	let forms = "";

	for (const selector of formSelectors) {
		try {
			const elements = document.querySelectorAll(selector);
			for (const element of elements) {
				const text = element.textContent?.toLowerCase() || "";
				const href = (element as HTMLAnchorElement).href?.toLowerCase() || "";
				const onclick =
					(element as HTMLButtonElement).onclick?.toString().toLowerCase() ||
					"";

				if (
					text.includes("apply") ||
					text.includes("application") ||
					text.includes("submit") ||
					href.includes("apply") ||
					href.includes("application") ||
					onclick.includes("apply") ||
					onclick.includes("application")
				) {
					forms += `${element.outerHTML}\n`;
				}
			}
		} catch (_) {}
	}

	return cleanHtml(forms);
};

// Function to extract apply buttons
const extractApplyButtons = (): string => {
	const applySelectors = [
		'a[href*="apply"]',
		'a[href*="application"]',
		'a[href*="career"]',
		'input[value*="Apply"]',
		'input[value*="Submit"]',
		'[class*="apply"]',
		'[class*="application"]',
		'[id*="apply"]',
		'[id*="application"]',
	];

	let buttons = "";

	for (const selector of applySelectors) {
		try {
			const elements = document.querySelectorAll(selector);
			for (const element of elements) {
				const text = element.textContent?.toLowerCase() || "";
				const value = (element as HTMLInputElement).value?.toLowerCase() || "";

				if (
					text.includes("apply") ||
					text.includes("submit") ||
					value.includes("apply") ||
					value.includes("submit")
				) {
					buttons += `${element.outerHTML}\n`;
				}
			}
		} catch (_) {}
	}

	return cleanHtml(buttons);
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener(
	async (message: JobPageMessage, _sender, sendResponse) => {
		if (message.action === "scrapePage") {
			try {
				const jobContent = extractJobContent();
				const applicationForms = extractApplicationForms();
				const applyButtons = extractApplyButtons();

				let combinedContent = "";

				if (jobContent) {
					combinedContent += `<!-- Job Content -->\n${jobContent}\n\n`;
				}

				if (applicationForms) {
					combinedContent += `<!-- Application Forms -->\n${applicationForms}\n\n`;
				}

				if (applyButtons) {
					combinedContent += `<!-- Apply Buttons -->\n${applyButtons}\n\n`;
				}

				if (!combinedContent) {
					combinedContent = cleanHtml(document.body.innerHTML);
				}

				chrome.runtime.sendMessage({
					action: "pageScraped",
					html: combinedContent,
					url: window.location.href,
				});

				sendResponse({ success: true });
			} catch (error) {
				console.error("Error scraping page:", error);
				sendResponse({ success: false, error: error.message });
			}
		} else if (message.action === "enableElementSelection") {
			try {
				enableElementSelection();
				sendResponse({ success: true });
			} catch (error) {
				console.error("Error enabling element selection:", error);
				sendResponse({ success: false, error: error.message });
			}
		} else if (message.action === "disableElementSelection") {
			try {
				disableElementSelection(false); // Don't send cancellation message since popup already knows
				sendResponse({ success: true });
			} catch (error) {
				console.error("Error disabling element selection:", error);
				sendResponse({ success: false, error: error.message });
			}
		} else if (message.action === "populateForm") {
			try {
				await populateFormFields(message.sessionData);
				sendResponse({ success: true });
			} catch (error) {
				console.error("Error populating form:", error);
				sendResponse({ success: false, error: error.message });
			}
		}

		return true;
	},
);

// Function to populate form fields with session data
const populateFormFields = async (sessionData: GetSessionsResponse[number]) => {
	if (!sessionData.answeredForm?.formAnswers) {
		console.log("No form answers available in session data");
		chrome.runtime.sendMessage({
			action: "formPopulationError",
			error: "No form answers available",
		});
		return;
	}

	const formAnswers = sessionData.answeredForm.formAnswers;
	let populatedCount = 0;
	let totalFields = 0;

	// Common form field selectors - more comprehensive based on applicationForm schema
	const fieldSelectors = [
		'input[type="text"]',
		'input[type="email"]',
		'input[type="tel"]',
		'input[type="url"]',
		'input[type="number"]',
		'input[type="date"]',
		"textarea",
		"select",
		'input[type="radio"]',
		'input[type="checkbox"]',
		'input[type="hidden"]', // Some forms use hidden fields
	];

	// Get all form fields
	const formFields = document.querySelectorAll(fieldSelectors.join(", "));
	totalFields = formFields.length;

	console.log(`Found ${totalFields} form fields to populate`);

	// Create a mapping of common field names to answers
	const fieldMapping: { [key: string]: string } = {};

	formAnswers.forEach((answer) => {
		const question = answer.question.toLowerCase();
		const answerText = answer.answer;

		// Map common question patterns to field names
		if (question.includes("name") || question.includes("full name")) {
			fieldMapping.name = answerText;
			fieldMapping.full_name = answerText;
			fieldMapping.first_name = answerText.split(" ")[0] || answerText;
			fieldMapping.last_name = answerText.split(" ").slice(1).join(" ") || "";
		} else if (question.includes("email")) {
			fieldMapping.email = answerText;
		} else if (question.includes("phone") || question.includes("tel")) {
			fieldMapping.phone = answerText;
			fieldMapping.telephone = answerText;
		} else if (question.includes("address")) {
			fieldMapping.address = answerText;
		} else if (question.includes("city")) {
			fieldMapping.city = answerText;
		} else if (question.includes("state") || question.includes("province")) {
			fieldMapping.state = answerText;
		} else if (question.includes("zip") || question.includes("postal")) {
			fieldMapping.zip = answerText;
			fieldMapping.postal_code = answerText;
		} else if (question.includes("country")) {
			fieldMapping.country = answerText;
		} else if (
			question.includes("experience") ||
			question.includes("work history")
		) {
			fieldMapping.experience = answerText;
		} else if (question.includes("education") || question.includes("degree")) {
			fieldMapping.education = answerText;
		} else if (
			question.includes("cover letter") ||
			question.includes("motivation")
		) {
			fieldMapping.cover_letter = answerText;
		} else {
			// Store the original question-answer pair
			fieldMapping[question.replace(/[^a-zA-Z0-9]/g, "_")] = answerText;
		}
	});

	// Populate form fields
	formFields.forEach((field: Element) => {
		const input = field as
			| HTMLInputElement
			| HTMLTextAreaElement
			| HTMLSelectElement;
		const fieldName = input.name?.toLowerCase() || "";
		const fieldId = input.id?.toLowerCase() || "";
		const fieldPlaceholder =
			"placeholder" in input ? input.placeholder?.toLowerCase() || "" : "";
		const fieldLabel = getFieldLabel(input);

		// Try to find a matching answer
		let answerToUse = null;

		// Check exact matches first
		for (const [key, value] of Object.entries(fieldMapping)) {
			if (
				fieldName.includes(key) ||
				fieldId.includes(key) ||
				fieldPlaceholder.includes(key) ||
				fieldLabel.includes(key)
			) {
				answerToUse = value;
				break;
			}
		}

		// If no exact match, try partial matches
		if (!answerToUse) {
			for (const [key, value] of Object.entries(fieldMapping)) {
				if (
					key.includes(fieldName) ||
					fieldName.includes(key) ||
					key.includes(fieldId) ||
					fieldId.includes(key)
				) {
					answerToUse = value;
					break;
				}
			}
		}

		// Populate the field if we found a match
		if (answerToUse) {
			try {
				if (input.type === "checkbox") {
					(input as HTMLInputElement).checked =
						answerToUse.toLowerCase().includes("yes") ||
						answerToUse.toLowerCase().includes("true") ||
						answerToUse.toLowerCase().includes("1");
				} else if (input.type === "radio") {
					// For radio buttons, we need to find the option that matches
					const radioGroup = document.querySelectorAll(
						`input[name="${input.name}"]`,
					);
					radioGroup.forEach((radio: Element) => {
						const radioInput = radio as HTMLInputElement;
						if (
							radioInput.value
								.toLowerCase()
								.includes(answerToUse.toLowerCase()) ||
							answerToUse.toLowerCase().includes(radioInput.value.toLowerCase())
						) {
							radioInput.checked = true;
						}
					});
				} else if (input.tagName === "SELECT") {
					// For select elements, try to find matching option
					const select = input as HTMLSelectElement;
					for (let i = 0; i < select.options.length; i++) {
						const option = select.options[i];
						if (
							option.text.toLowerCase().includes(answerToUse.toLowerCase()) ||
							answerToUse.toLowerCase().includes(option.text.toLowerCase())
						) {
							select.selectedIndex = i;
							break;
						}
					}
				} else {
					// For text inputs and textareas
					input.value = answerToUse;
					// Trigger change event
					input.dispatchEvent(new Event("input", { bubbles: true }));
					input.dispatchEvent(new Event("change", { bubbles: true }));
				}
				populatedCount++;
			} catch (error) {
				console.error(`Error populating field ${fieldName}:`, error);
			}
		}
	});

	// Auto-populate resume file inputs
	const resumePopulatedCount = await populateResumeFields(sessionData);
	populatedCount += resumePopulatedCount;

	console.log(
		`Successfully populated ${populatedCount} out of ${totalFields} fields (including ${resumePopulatedCount} resume uploads)`,
	);

	// Send success message
	chrome.runtime.sendMessage({
		action: "formPopulated",
		populatedCount,
		totalFields,
		resumePopulatedCount,
	});

	// Log detailed information for debugging
	console.log("Form population summary:", {
		totalFields,
		populatedCount,
		resumePopulatedCount,
		fieldMapping: Object.keys(fieldMapping),
		sessionData: {
			hasAnsweredForm: !!sessionData.answeredForm,
			formAnswersCount: sessionData.answeredForm?.formAnswers?.length || 0,
			hasResume: !!sessionData.assetPath,
		},
	});
};

// Function to populate resume file inputs
const populateResumeFields = async (
	sessionData: GetSessionsResponse[number],
): Promise<number> => {
	let populatedCount = 0;

	// Resume file input selectors
	const resumeSelectors = [
		'input[type="file"]',
		'input[accept*="pdf"]',
		'input[accept*="doc"]',
		'input[accept*="docx"]',
		'input[name*="resume"]',
		'input[name*="cv"]',
		'input[id*="resume"]',
		'input[id*="cv"]',
		'input[class*="resume"]',
		'input[class*="cv"]',
	];

	const fileInputs = document.querySelectorAll(resumeSelectors.join(", "));
	console.log(`Found ${fileInputs.length} potential resume file inputs`);

	for (const input of fileInputs) {
		const fileInput = input as HTMLInputElement;

		// Check if this input is for resume/CV upload
		const isResumeInput = isResumeFileInput(fileInput);

		if (isResumeInput && sessionData.assetPath) {
			try {
				// Create a file object from the resume data
				const resumeFile = await createResumeFile(sessionData);
				if (resumeFile) {
					// Create a FileList-like object
					const dataTransfer = new DataTransfer();
					dataTransfer.items.add(resumeFile);
					fileInput.files = dataTransfer.files;

					// Trigger events
					fileInput.dispatchEvent(new Event("change", { bubbles: true }));
					fileInput.dispatchEvent(new Event("input", { bubbles: true }));

					populatedCount++;
					console.log(
						`Successfully populated resume file input: ${fileInput.name || fileInput.id}`,
					);
				}
			} catch (error) {
				console.error(`Error populating resume file input:`, error);
			}
		}
	}

	return populatedCount;
};

// Function to check if a file input is for resume/CV upload
const isResumeFileInput = (input: HTMLInputElement): boolean => {
	const name = input.name?.toLowerCase() || "";
	const id = input.id?.toLowerCase() || "";
	const placeholder = input.placeholder?.toLowerCase() || "";
	const accept = input.accept?.toLowerCase() || "";
	const className = input.className?.toLowerCase() || "";

	// Check for resume-related keywords
	const resumeKeywords = [
		"resume",
		"cv",
		"curriculum vitae",
		"resume upload",
		"cv upload",
		"resume file",
		"cv file",
		"resume attachment",
		"cv attachment",
	];

	// Check if any resume keywords are present
	const hasResumeKeyword = resumeKeywords.some(
		(keyword) =>
			name.includes(keyword) ||
			id.includes(keyword) ||
			placeholder.includes(keyword) ||
			className.includes(keyword),
	);

	// Check if accept attribute allows document types
	const acceptsDocuments =
		accept.includes("pdf") ||
		accept.includes("doc") ||
		accept.includes("docx") ||
		accept.includes("application/") ||
		accept === ""; // Empty accept means all files

	return hasResumeKeyword || acceptsDocuments;
};

// Function to create a resume file from session data
const createResumeFile = async (
	sessionData: GetSessionsResponse[number],
): Promise<File | null> => {
	try {
		// Try to get resume data from different possible sources
		let resumeData: ArrayBuffer | null = null;
		let fileName = "resume.pdf";
		let mimeType = "application/pdf";

		// Check if we have a PDF buffer
		if (sessionData.assetPath) {
			// resumeData = sessionData.latexPdf;
		}
		// Check if we have an asset path - fetch via background script
		else if (sessionData.assetPath || sessionData.id) {
			try {
				// Use background script to fetch the resume data
				const response = await new Promise<{
					success: boolean;
					data?: string;
					fileName?: string;
					mimeType?: string;
					error?: string;
				}>((resolve) => {
					chrome.runtime.sendMessage(
						{
							action: "fetchResumeData",
							sessionId: sessionData.id,
						},
						resolve,
					);
				});

				if (response.success && response.data) {
					// Convert base64 back to ArrayBuffer
					const binaryString = atob(response.data);
					const bytes = new Uint8Array(binaryString.length);
					for (let i = 0; i < binaryString.length; i++) {
						bytes[i] = binaryString.charCodeAt(i);
					}
					resumeData = bytes.buffer;
					fileName = response.fileName || fileName;
					mimeType = response.mimeType || mimeType;
				} else {
					console.error(
						"Failed to fetch resume from background script:",
						response.error,
					);
					return null;
				}
			} catch (error) {
				console.error("Error fetching resume from background script:", error);
				return null;
			}
		}
		// Check if we have a PDF link
		if (resumeData) {
			// Create a blob from the resume data
			const blob = new Blob([resumeData], { type: mimeType });

			// Create a file object
			const file = new File([blob], fileName, { type: mimeType });

			return file;
		}

		return null;
	} catch (error) {
		console.error("Error creating resume file:", error);
		return null;
	}
};

// Helper function to get field label
const getFieldLabel = (field: Element): string => {
	// Try to find associated label
	const fieldId = field.getAttribute("id");
	if (fieldId) {
		const label = document.querySelector(`label[for="${fieldId}"]`);
		if (label) {
			return label.textContent?.toLowerCase() || "";
		}
	}

	// Try to find label by name
	const fieldName = field.getAttribute("name");
	if (fieldName) {
		const labels = document.querySelectorAll("label");
		for (const label of labels) {
			if (label.textContent?.toLowerCase().includes(fieldName.toLowerCase())) {
				return label.textContent?.toLowerCase() || "";
			}
		}
	}

	// Try to find label in parent elements
	let parent = field.parentElement;
	while (parent) {
		const label = parent.querySelector("label");
		if (label) {
			return label.textContent?.toLowerCase() || "";
		}
		parent = parent.parentElement;
	}

	return "";
};

// Cleanup when popup closes
window.addEventListener("beforeunload", () => {
	disableElementSelection();
});

const PlasmoOverlay = () => {
	return null;
};

export default PlasmoOverlay;
