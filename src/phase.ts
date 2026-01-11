export interface RewriterConfig {
  apiKey: string;
  modelName: string;
  prompt: string;
  debug: boolean;
  examples: Record<string, string>;
}

export interface RewriteContext {
  text: string;
  selectionPrompt?: string; // Optional prompt override from arguments
}

export const DEFAULT_MODEL_NAME = "gemini-2.0-flash";

export const SAFETY_SETTINGS = [
  {
    category: "HARM_CATEGORY_HARASSMENT",
    threshold: "BLOCK_NONE",
  },
  {
    category: "HARM_CATEGORY_HATE_SPEECH",
    threshold: "BLOCK_NONE",
  },
  {
    category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    threshold: "BLOCK_NONE",
  },
  {
    category: "HARM_CATEGORY_DANGEROUS_CONTENT",
    threshold: "BLOCK_NONE",
  },
];
