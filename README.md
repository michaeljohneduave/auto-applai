# Auto Apply Project Overview

The "Auto Apply" project automates the entire job application process, from gathering job details to submitting the application.

![Diagram Link](/workflow.svg)

## Core Purpose

To automatically apply for jobs by:
1.  Scraping job post information.
2.  Generating a custom, optimized resume.
3.  Filling out and submitting application forms.

## How It Works (Workflow)

The process involves five main steps:

1.  **Information Extraction**: Scrapes the job post URL to extract job details and application form fields.
2.  **Resume Generation**: Creates a customized resume PDF in LaTeX format, tailored for the specific job.
3.  **Response Generation**: Generates answers for the application form, potentially asking clarifying questions.
4.  **Response Refinement**: Evaluates and refines the generated responses based on feedback.
5.  **Application Submission**: Fills out the application form and submits it.

## Key Technologies

*   **LaTeX for Resumes**: Utilized for precise formatting and declarative structure, aiding in AI-friendly resume generation.
*   **Pandoc API**: Converts generated LaTeX files into PDF resumes.
*   **Puppeteer MCP + API**: Manages browser automation for scraping and form submission, ensuring separation of concerns and isolated browser environments.

## Inputs

*   `Resume.md` (Markdown resume)
*   `Resume.tex` (LaTeX resume)
*   `Job post url` (Link to the job posting)

## Output

*   Application submitted

## To Do List

-   [ ] Resume generation feedback, critique and gut check from "hiring manager" LLM.
-   [ ] Robust form parsing and correct fill up.
-   [ ] LLM response evaluations.