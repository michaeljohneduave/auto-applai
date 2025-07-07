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
		.describe("Details about the application form fields."),

	companyInfo: z
		.object({
			name: z.string().describe("The name of the company."),
			// Removed .nullable() from here and other optional fields.
			// If the info isn't there, the LLM should omit the key.
			location: z
				.string()
				.describe(
					"The primary physical location of the company (e.g., 'San" +
						" Francisco, CA').",
				),
			// z.string().url() does not accept null as a valid string to then be validated as a URL.
			// Keeping it optional means if no URL is found, the key is omitted.
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
		})
		.describe("Detailed information about the job posting itself."),

	applicationSteps: z.array(
		z.string().describe("The detailed steps of the application process"),
	),

	url: z.string().describe("The final url for the job application"),

	successfulScrape: z
		.boolean()
		.describe(
			"Whether the scrape was successful and information was extracted.",
		),
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
