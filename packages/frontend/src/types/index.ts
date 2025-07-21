export interface Application {
  sessionId: string;
  jobUrl: string;
  status: "processing" | "awaiting_input" | "completed" | "failed";
  currentStep: string;
  companyName?: string;
  company_name?: string;
  applicationDetails?: {
    jobInfo?: {
      title?: string;
    };
    companyInfo?: {
      name?: string;
    };
  };
  adjustedResume?: string;
  latexPdf?: Buffer;
  completedForm?: any;
  cover_letter?: string;
  form?: string;
  createdAt: Date;
  error?: string;
}

export interface BaseAsset {
  id: string;
  name: string;
  type: 'resume' | 'cover-letter' | 'personal-info';
  content: string;
  lastModified: Date;
}