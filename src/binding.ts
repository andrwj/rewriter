import * as vscode from "vscode";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { RewriterConfig, RewriteContext, DEFAULT_MODEL_NAME, SAFETY_SETTINGS } from "./phase";

// [Phase] Session State (In-memory Fallback)
let sessionModelName: string | undefined;

// [Binding] Get Configuration Phase
export function getRewriterConfig(apiKey: string): RewriterConfig {
  const config = vscode.workspace.getConfiguration("rewriter");
  // Priority: 1. Session State (if write failed previously) 2. User Config 3. Default
  const modelName = sessionModelName || config.get<string>("model") || DEFAULT_MODEL_NAME;

  return {
    apiKey,
    modelName,
    prompt: config.get<string>("prompt") || "",
    // debug: false,
    debug: true, // Enable debug for troubleshooting
    examples: config.get<Record<string, string>>("examples") || {},
  };
}

// [Binding] Gemini Service
export async function generateRewrite(
  config: RewriterConfig,
  context: RewriteContext
): Promise<string> {
  const genAI = new GoogleGenerativeAI(config.apiKey);
  const model = genAI.getGenerativeModel({
    model: config.modelName,
    safetySettings: [
      {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
      {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_NONE,
      },
    ]
  });

  const parts = [];

  // System Instruction / Prompt
  const promptText = context.selectionPrompt || config.prompt;
  if (promptText) {
    parts.push(`instruction: ${promptText}`);
  }

  // Examples
  for (const [input, output] of Object.entries(config.examples)) {
    parts.push(`input: ${input}`);
    parts.push(`output: ${output}`);
  }

  // Actual Input
  parts.push(`input: ${context.text}`);
  parts.push(`output: `);

  const result = await model.generateContent(parts);
  const response = await result.response;
  return response.text();
}

// [Binding] List Models
interface ModelInfo {
  name: string;
  displayName: string;
  supportedGenerationMethods: string[];
}

export async function listAvailableModels(apiKey: string): Promise<string[]> {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
    }
    const data = await response.json() as { models: ModelInfo[] };

    return data.models
      .filter(m => m.supportedGenerationMethods.includes("generateContent"))
      .map(m => m.name.replace("models/", "")); // Remove 'models/' prefix for cleaner display/usage
  } catch (error) {
    console.error("Failed to list models:", error);
    throw error;
  }
}

// [Binding] Update Configuration with Defensive Fallback
export async function updateModelConfig(modelName: string): Promise<void> {
  // Always update session state first (Immediate Phase Update)
  sessionModelName = modelName;

  try {
    const config = vscode.workspace.getConfiguration();
    const inspection = config.inspect("rewriter.model");

    // Verify if the configuration key is registered/known
    if (!inspection) {
      console.warn("Configuration 'rewriter.model' not found in inspection. Using session storage only.");
      return;
    }

    // Attempt to update Global setting (Side Effect)
    await config.update("rewriter.model", modelName, vscode.ConfigurationTarget.Global);
    // sessionModelName = undefined; // Keep session state as cache source of truth

  } catch (error) {
    console.warn("Failed to update configuration persistence (using session state):", error);
    // Silent failure for persistence: User flow should not be interrupted.
  }
}

// [Binding] Editor Interaction
export async function replaceSelection(editor: vscode.TextEditor, newText: string): Promise<void> {
  await editor.edit((editBuilder) => {
    editBuilder.replace(editor.selection, newText);
  });
}
