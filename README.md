# Auto-ApplAI 🤖

An intelligent job application automation system that uses AI to customize resumes, extract job requirements, and automatically fill out application forms.

## 🌟 Features

- **AI-Powered Resume Customization**: Automatically tailors your resume to match specific job postings
- **Intelligent Web Scraping**: Extracts job details and application forms from job posting URLs
- **Automated Form Filling**: Uses AI to complete job application forms with relevant information
- **PDF Generation**: Converts customized resumes to professional PDF format using LaTeX
- **Agentic Crawling**: Smart navigation to find application forms when not immediately visible
- **Multi-Model AI Support**: Integrates with Google AI and Grok models for different tasks

## 🏗️ Architecture

The system consists of several key components:

- **LLM Engine**: Manages multiple AI models and MCP (Model Context Protocol) clients
- **Web Scraper**: Extracts HTML content and takes screenshots of job postings
- **Resume Adjuster**: AI-powered resume customization based on job requirements
- **Form Processor**: Intelligent form field detection and completion
- **PDF Generator**: LaTeX-based resume compilation service

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- Docker and Docker Compose
- Chrome/Chromium (for web scraping)

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/auto-applai.git
cd auto-applai
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up your assets**
```bash
mkdir -p assets
# Add your base resume as assets/resume.md
# Add your LaTeX resume template as assets/resume.tex  
# Add your personal info as assets/personal-info.md
```

4. **Configure environment variables**
```bash
cp .env.example .env
# Edit .env with your API keys and service URLs
```

5. **Start all services with Docker Compose**
```bash
docker compose up -d
```

6. **Run the application**
```bash
npm start
```

## 📁 Project Structure

```
auto-applai/
├── services/                # Containerized services
│   ├── pdf/                # PDF generation service
│   │   ├── Dockerfile
│   │   └── src/
│   └── puppeteer/          # Browser automation service
│       ├── Dockerfile
│       └── src/
├── src/
│   ├── auto-apply.ts       # Main orchestration logic
│   ├── llm.ts              # LLM management and MCP integration
│   ├── formCompletion.ts   # AI form field completion
│   ├── formFiller.ts       # Automated form filling
│   ├── schema.ts           # Zod schemas for data validation
│   └── utils.ts            # Utility functions
├── assets/
│   ├── resume.md           # Your base resume (Markdown)
│   ├── resume.tex          # LaTeX resume template
│   ├── personal-info.md    # Personal information
│   └── failed-scrapes/     # Debug output for failed scrapes
├── docker-compose.yml      # Service orchestration
├── package.json            # Project dependencies
└── linux-chrome-profile/   # Chrome profile for consistent scraping
```

## 🔧 Configuration

### Docker Compose Services

The `docker-compose.yml` file includes:
- PDF generation service
- Puppeteer MCP server

### Environment Variables

```env
# AI Model API Keys
GOOGLE_API_KEY=your_google_ai_key
GROK_API_KEY=your_grok_api_key

# Service URLs (Docker Compose)
PDF_SERVICE_URL=http://pdf-service:4000/compile
PUPPETEER_SERVICE_URL=http://puppeteer-service:3000/sse
```

### Required Assets

1. **resume.md**: Your base resume in Markdown format
2. **resume.tex**: LaTeX template for PDF generation
3. **personal-info.md**: Personal details for form filling

## 🎯 Usage

1. **Start the application**
```bash
npm start
```

2. **Enter job posting URLs when prompted**
```
URL: https://company.com/jobs/software-engineer
```

3. **Review generated outputs**
   - Customized resume: `assets/[company-name]/resume.pdf`
   - LaTeX source: `assets/[company-name]/resume.tex`
   - Form responses: `assets/[company-name]/completedForm.json`

## 🔄 Workflow

1. **URL Input**: Provide a job posting URL
2. **Content Extraction**: Scrape job details and requirements
3. **Resume Customization**: AI adjusts your resume to match the job
4. **PDF Generation**: Convert to professional PDF format
5. **Form Detection**: Locate and analyze application forms
6. **Form Completion**: AI generates appropriate responses
7. **Automated Submission**: Fill out forms automatically

## 🛠️ Advanced Features

### MCP Integration

The system uses Model Context Protocol (MCP) for extensible tool integration:

- **Puppeteer MCP**: Web scraping and browser automation
- **Custom Tools**: Extensible architecture for additional capabilities

### Multi-Model AI Strategy

- **Large Models**: Complex reasoning tasks (resume customization, job analysis)
- **Small Models**: Quick tasks (URL extraction, form parsing)
- **Specialized Models**: Task-specific optimizations

### Intelligent Crawling

When application forms aren't immediately visible, the system:
1. Analyzes page links and navigation
2. Uses AI to determine likely application paths
3. Crawls intelligently to find forms
4. Validates form completeness

## 🔍 Troubleshooting

### Common Issues

**Failed Scrapes**
- Check `assets/failed-scrapes/` for debug output
- Verify Chrome profile permissions
- Ensure target sites are accessible
- ERR: "The profile appears to be in use by another Chromium process"
   - If using an existing chrome profile, ensure locks are released, and a chrome instance is not running
   - Delete "SingletonLock", "SingletonSocket", and "SingletonCookie" after killing the chrome process

**PDF Generation Errors**
- Confirm LaTeX service is running on port 4000
- Validate resume.tex template syntax
- Check Docker container logs

**Form Filling Issues**
- Review `completedForm.json` for response quality
- Adjust AI model parameters in configuration
- Verify form field detection accuracy

**Docker Compose**
- Check service logs: `docker compose logs [service-name]`
- Verify all containers are running: `docker compose ps`
- Restart services: `docker compose restart`
- Rebuild containers: `docker compose up -d --build`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This tool is designed to assist with job applications by automating repetitive tasks. Users are responsible for:
- Ensuring accuracy of generated content
- Complying with website terms of service
- Reviewing all submissions before sending
- Following applicable laws and regulations

## 🙏 Acknowledgments

- [Sourcegraph Cody](https://sourcegraph.com/cody) for AI assistance
- [OpenAI](https://openai.com) for language model APIs
- [Model Context Protocol](https://modelcontextprotocol.io) for tool integration
- [Puppeteer](https://pptr.dev) for web automation

---

**Made with ❤️ and AI**