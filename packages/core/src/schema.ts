import { z } from "zod";

// --- Enums for common types ---

const ApplicationFieldTypeEnum = z.enum([
	"text", // Short text input
	"textarea", // Multi-line text input
	"select", // Dropdown list (use `options` field)
	"radio", // Radio buttons (use `options` field)
	"checkbox", // Single checkbox
	"multicheckbox", // Multiple checkboxes (use `options` field)
	"number",
	"email",
	"tel", // Phone number
	"date",
	"url",
	"file", // File upload
	"hidden", // For fields that might exist but are not visible
	"unknown", // Fallback for types not explicitly covered
]);

const JobLocationTypeEnum = z.enum([
	"remote",
	"on-site",
	"hybrid",
	"unknown", // Fallback if type isn't clear
]);

const EmploymentTypeEnum = z.enum([
	"full-time",
	"part-time",
	"contract",
	"temporary",
	"internship",
	"volunteer",
	"other",
]);

const SeniorityLevelEnum = z.enum([
	"intern",
	"entry-level",
	"associate",
	"mid-senior",
	"director",
	"executive",
	"not-applicable", // For roles where seniority isn't explicitly mentioned
]);

// --- Reusable Schemas ---

const SalarySchema = z
	.object({
		// Removed .nullable() here. If a min/max isn't found, the LLM
		// should simply omit the field.
		min: z.number().describe("Minimum annual salary in USD."),
		max: z.number().describe("Maximum annual salary in USD."),
		currency: z.string().describe("Currency code, e.g., 'USD', 'EUR'."),
		period: z
			.enum(["annually", "hourly", "monthly", "weekly"])
			.describe("Period of salary, e.g., 'annually', 'hourly'."),
		rawData: z
			.string()
			.describe(
				"The raw salary string if structured data cannot be extracted," +
					" e.g., 'Competitive salary' or '$80,000 - $100,000 / year'",
			),
	})
	.describe("Structured salary information, if available.");

// --- Main Refined Schema ---

export const urlEvalSchema = z.array(
	z.object({
		url: z.string().describe("The url to evaluate"),
		reasoning: z
			.string()
			.describe("The reasoning for why the url is good or bad"),
		rating: z
			.number()
			.min(1)
			.max(10)
			.describe(
				"The rating for the url, 1 being the worst and 10 being the best",
			),
	}),
);

export const contentEvalSchema = z.object({
	url: z.string().describe("The url to evaluate"),
	contentReasoning: z
		.string()
		.describe("The reasoning for why the content is good or bad"),
	contentRating: z
		.number()
		.min(1)
		.max(10)
		.describe(
			"The rating for the content, 1 being the worst and 10 being the best",
		),
});

export const personalInfoSchema = z.object({
	fullName: z.string(),
	email: z.string().email(),
	phoneNumber: z.string(),
	address: z.object({
		street: z.string(),
		city: z.string(),
		region: z.string(),
		postalCode: z.string(),
		country: z.string(),
	}),
	profiles: z.object({
		linkedin: z.string().url(),
		github: z.string().url(),
		website: z.string().url(),
	}),
	timezones: z.array(z.string()),
});

export const jobPostingSchema = z.object({
	applicationForm: z
		.array(
			z
				.object({
					// Removed .nullable(). If ID isn't available, omit.
					id: z
						.string()
						.describe(
							"Unique identifier for the form field, if available" +
								" (e.g., HTML 'name' or 'id').",
						),
					question: z
						.string()
						.describe("The label or prompt for the form field."),
					type: ApplicationFieldTypeEnum.describe("The type of input field."),
					// For arrays like options, it's better to default to an empty array []
					// if no options are found, rather than null.
					options: z
						.array(z.string())
						.describe(
							"Array of options for dropdown, radio, or multi-checkbox" +
								" fields. Omit if not applicable or return an empty array" +
								" if no options are found.",
						),
					// Removed .nullable(). If not specified, omit.
					required: z.boolean().describe("Whether the field is mandatory."),
					// Removed .nullable(). If not specified, omit.
					defaultValue: z
						.string()
						.describe("Any pre-filled or default value for the field."),
					// Removed .nullable(). If not specified, omit.
					placeholder: z
						.string()
						.describe("Placeholder text for the input field."),
					xPathSelector: z
						.string()
						.describe("The xpath selector for the field."),
					cssSelector: z.string().describe("The CSS selector for the field."),
				})
				.describe("An individual field within the application form."),
		)
		.describe(
			"Details about the application form fields. Explicity add the fields that are present in the form.",
		),

	companyInfo: z
		.object({
			name: z.string().describe("The name of the company."),
			shortName: z
				.string()
				.describe(
					"The short one word name of the company, Blank if not present in the job details.",
				),
			isConfidential: z
				.boolean()
				.describe(
					"Whether the company is confidential and not present in the job details.",
				),
			location: z
				.string()
				.describe(
					"The primary physical location of the company (e.g., 'San" +
						" Francisco, CA').",
				),
			website: z.string().describe("The official website URL of the company."),
			industry: z
				.string()
				.describe(
					"The industry the company operates in (e.g., 'Software" +
						" Development', 'Finance').",
				),
			size: z
				.string()
				.describe(
					"The size of the company (e.g., '10-50 employees', '500+" +
						" employees').",
				),
			description: z
				.string()
				.describe("A brief description or 'About Us' blurb for the company."),
			// For arrays, prefer an empty array [] if no items are found.
			// Optional means the entire 'values' key can be omitted if no values section is present.
			values: z
				.array(z.string())
				.describe(
					"Key company values, as a list of bullet points or short" +
						" phrases. Returns an empty array if no values are specified.",
				),
			culture: z.string().describe("A summary of the company culture."),
			expectations: z
				.string()
				.describe("General company expectations or work philosophy."),
		})
		.describe("Information about the hiring company."),

	jobInfo: z
		.object({
			title: z.string().describe("The title of the job posting."),
			shortTitle: z.string().describe("The short title of the job posting."),
			description: z.string().describe("The main description of the job role."),
			// Changed arrays back to just .optional(). An empty array [] is the
			// canonical "no items" for a list, not null.
			requirements: z
				.array(z.string())
				.describe(
					"Key skills, qualifications, and experiences required for the" +
						" job, as a list of bullet points. Returns an empty array if" +
						" not specified.",
				),
			responsibilities: z
				.array(z.string())
				.describe(
					"Key duties and responsibilities of the role, as a list of" +
						" bullet points. Returns an empty array if not specified.",
				),
			plusRequirements: z
				.array(z.string())
				.describe(
					"Additional preferred or 'great to have' requirements, as a" +
						" list of bullet points. Returns an empty array if not" +
						" specified.",
				),
			benefits: z
				.array(z.string())
				.describe(
					"Employee benefits offered by the company, as a list of" +
						" bullet points. Returns an empty array if not specified.",
				),
			skills: z
				.array(z.string())
				.describe(
					"A list of specific technical or soft skills required for the" +
						" job (e.g., 'Python', 'React', 'Teamwork'). Returns an empty" +
						" array if not specified.",
				),
			location: z
				.object({
					// Enums like JobLocationTypeEnum already have 'unknown'.
					// No need for .nullable() on the enum itself.
					type: JobLocationTypeEnum.describe(
						"Type of job location (e.g., 'remote', 'on-site'," +
							" 'hybrid'). Defaults to 'unknown' if not clear.",
					),
					city: z.string().describe("The city of the job location."),
					state: z.string().describe("The state/province of the job location."),
					country: z.string().describe("The country of the job location."),
					fullAddress: z
						.string()
						.describe(
							"The full raw location string from the posting if detailed" +
								" parts aren't extractable.",
						),
				})
				// If no location info exists, the whole object can be omitted.
				.describe("Structured location details for the job."),
			// If no salary info exists, the whole object can be omitted.
			salary: SalarySchema.describe(
				"Details about the job's salary or compensation.",
			),
			// Enums like EmploymentTypeEnum already have 'unknown'/'other'.
			// No need for .nullable().
			employmentType: EmploymentTypeEnum.describe(
				"The type of employment (e.g., 'full-time', 'contract')." +
					" Defaults to 'other' if not clear.",
			),
			// Enums like SeniorityLevelEnum already have 'not-applicable'.
			// No need for .nullable().
			seniorityLevel: SeniorityLevelEnum.describe(
				"The seniority level of the role (e.g., 'mid-senior'," +
					" 'entry-level'). Defaults to 'not-applicable' if not clear.",
			),
			// z.string().datetime() expects a string in ISO 8601 format.
			// If `null` is outputted, it would fail the string validation.
			// So, keep it optional; omit if no date is found.
			datePosted: z
				.string()
				.describe("The date the job was posted, in ISO 8601 format."),
			// Add other relevant fields like application deadline, interview process, etc.
			applicationDeadline: z
				.string()
				.describe("The date the application deadline is, in ISO 8601 format."),
		})
		.describe("Detailed information about the job posting itself."),

	applicationSteps: z.array(
		z.string().describe("The detailed steps of the application process"),
	),

	linkedin: z
		.object({
			jobId: z.string().describe("The job id on LinkedIn."),
			companyId: z.string().describe("The company id on LinkedIn."),
			easyApply: z
				.boolean()
				.describe("Whether the job is an easy apply job on LinkedIn."),
		})
		.describe("LinkedIn specific job details"),
	jobBoard: z.string().describe("The job board the job is posted on."),

	url: z
		.string()
		.describe(
			"The final url for the job application, without unnecessary parameters",
		),

	siteUrls: z
		.array(z.string())
		.describe(
			"The relevant urls present in the site, without unnecessary parameters",
		),

	antiBotMeasures: z
		.array(z.string())
		.describe(
			"List of anti-bot or CAPTCHA measures detected in the HTML " +
				"(e.g., 'reCAPTCHA v2', 'honeypot hidden field'). " +
				"Returns an empty array if none detected.",
		),

	successfulScrape: z
		.boolean()
		.describe(
			"Whether the scrape was successful and information was extracted.",
		),

	resumeNotes: z.array(z.string()).describe("Notes about the resume, if any"),
	coverLetterNotes: z
		.array(z.string())
		.describe("Notes about the cover letter, if any"),
});

export const cleanedHtmlSchema = z.object({
	cleanHtml: z.string().describe("The cleaned html"),
});

export const formCompleterSchema = z.object({
	formAnswers: z
		.array(
			z.object({
				question: z
					.string()
					.describe("The application question originally provided."),
				confidence: z
					.number()
					.min(1)
					.max(10)
					.describe(
						"Your confidence level of this answer, 1 being lowest, 10 being highest",
					),
				answer: z
					.string()
					.describe(
						"The complete, final answer to the question based on the provided context.",
					),
			}),
		)
		.describe(
			"A list of questions from the form that you were able to answer COMPLETELY and CONFIDENTLY with the given information.",
		),
	clarificationRequests: z
		.array(
			z.object({
				originalQuestion: z.string().describe(
					// Context for the AI
					"The original application question that you cannot fully answer yet.",
				),
				questionForUser: z.string().describe(
					// The key field: what the AI should ask
					"The specific, targeted question you need to ask the user to get the missing information.",
				),
				reasoning: z.string().describe(
					// The 'why': helps the user and the AI
					"A brief explanation of why this information is needed to provide a high-quality answer (e.g., 'To tailor the cover letter to the AI/ML requirements mentioned in the job description').",
				),
			}),
		)
		.describe(
			"A list of requests for more information. Use this ONLY when the provided context is insufficient to give a complete, high-quality answer. Do not put final answers here.",
		),
	coverLetter: z.string().describe("Cover letter for the application"),
});

export const evaluatorSchema = z.array(
	formCompleterSchema.shape.formAnswers.element.extend({
		grade: z
			.number()
			.min(1)
			.max(10)
			.describe(
				"The grade of the answer relative to the question 10 is the highest, 1 is the lowest",
			),
		improvements: z.string().describe("Suggestions for improving the answer"),
		reasoning: z.string().describe("Reasoning for the grade"),
	}),
);

export const userClarifications = z
	.array(
		z.object({
			originalQuestion: z.string().describe("The question present in the form"),
			questionForUser: z
				.string()
				.describe("The clarifying question asked to the user"),
			answer: z.string().describe("The answer to the question"),
		}),
	)
	.describe("The list of questions and answers from the user");

export const agenticCrawlerSchema = z.object({
	url: z.string().describe("The final url for the job application"),
});

export const urlExtractorSchema = z.object({
	url: z.string().describe("Job application URL"),
});

export const latexResumeSchema = z.object({
	resume: z.string().describe("The latex resume"),
});

export const adjustedResumeSchema = z.object({
	resume: z.string().describe("The adjusted resume in markdown"),
});

// A detailed analysis of a single job experience entry from the resume.
const ExperienceEntrySchema = z.object({
	jobTitle: z.string().describe("The job title for this experience entry."),
	company: z.string().describe("The company name for this experience entry."),
	framingAnalysis: z
		.string()
		.describe(
			"Critique of how well the experience is framed for the target role, especially for non-matching titles.",
		),
	prioritizationAnalysis: z
		.string()
		.describe(
			"Analysis of the bullet point order. The most relevant achievement for the target job should be first.",
		),
	impactQuantificationAnalysis: z
		.string()
		.describe(
			"Analysis of the use of metrics and quantified achievements. Identify any weak bullet points.",
		),
	boldingStrategyAnalysis: z
		.string()
		.describe(
			"Critique of the bolding strategy within this section. Does it highlight the most relevant tech and outcomes sparingly for maximum impact?",
		),
});

// The main schema for the entire resume critique output.
export const resumeCritiqueSchema = z.object({
	overallGutCheck: z
		.object({
			impression: z
				.string()
				.describe("A high-level, immediate impression of the resume."),
			tailoringScore: z
				.number()
				.min(1)
				.max(100)
				.describe(
					"A score from 1-100 indicating how well the resume is tailored to the target role.",
				),
			strongestPart: z
				.string()
				.describe("The single strongest section or aspect of the resume."),
			weakestLink: z
				.string()
				.describe(
					"The single weakest section or aspect that needs the most improvement.",
				),
			boldingEffectiveness: z
				.string()
				.describe(
					"A critique of the overall keyword bolding strategy at a glance (helpful or hindering).",
				),
		})
		.describe(
			"The overall first impression and high-level analysis of the resume.",
		),

	professionalSummaryAnalysis: z
		.object({
			isFit: z
				.boolean()
				.describe(
					"Does the summary immediately signal that the candidate is a perfect fit?",
				),
			mirrorsKeywords: z
				.boolean()
				.describe(
					"Does the summary effectively mirror the language, keywords, and values from the job description?",
				),
			boldingStrategy: z
				.string()
				.describe(
					"Critique of the bolding in the summary. Is it strategic or used on generic terms?",
				),
			suggestedRevision: z
				.string()
				.describe(
					"A specific, revised version of the summary if it could be more powerful.",
				),
		})
		.describe("Analysis of the professional summary at the top of the resume."),

	skillsSectionReview: z
		.object({
			areSkillsVisible: z
				.boolean()
				.describe(
					"Are the most relevant skills (as per the job description) immediately visible?",
				),
			isWellOrganized: z
				.boolean()
				.describe(
					"Is the information well-organized for a quick 6-second scan by a recruiter?",
				),
			boldingEffectiveness: z
				.string()
				.describe(
					"Critique of the bolding in the skills section. Does it highlight the exact skills from the job requirements without overdoing it?",
				),
			suggestedChanges: z
				.string()
				.describe(
					"Recommended changes in ordering or formatting to increase impact.",
				),
		})
		.describe(
			"Review of the skills section for clarity, organization, and impact.",
		),

	experienceSectionDeepDive: z
		.array(ExperienceEntrySchema)
		.describe(
			"A detailed, entry-by-entry analysis of the work experience section.",
		),

	projectsSectionRecommendations: z
		.object({
			supportsNarrative: z
				.boolean()
				.describe("Do the projects support the main application narrative?"),
			showcasesPassion: z
				.boolean()
				.describe(
					"Do the projects showcase passion or address any 'plus/nice-to-have' requirements from the job description?",
				),
			critique: z
				.string()
				.describe(
					"A critique of the project descriptions, including whether they are results-oriented.",
				),
			suggestedImprovements: z
				.string()
				.describe(
					"Recommendations for improvement, such as adding a tech stack with strategic bolding.",
				),
		})
		.describe("Analysis of the personal projects section."),

	finalVerdictAndActionPlan: z
		.object({
			summary: z.string().describe("A concluding summary of the findings."),
			isReadyForSubmission: z
				.boolean()
				.describe("Is the resume ready to be submitted?"),
			actionItems: z
				.array(z.string())
				.min(3)
				.max(4)
				.describe(
					"A concise, prioritized list of the top 3-4 most critical changes the candidate should make. Be verbose and clear about what needs to be changed",
				),
		})
		.describe(
			"The final summary and a prioritized list of actionable steps for the candidate.",
		),
});
