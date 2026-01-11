import * as vscode from "vscode";
import { getRewriterConfig, generateRewrite, replaceSelection, listAvailableModels, updateModelConfig } from "./binding";
import { RewriteContext } from "./phase";

export function activate(context: vscode.ExtensionContext) {
  // [Flow] Set API Key Command
  context.subscriptions.push(
    vscode.commands.registerCommand("rewriter.setApiKey", async () => {
      const apiKey = await vscode.window.showInputBox({
        prompt: "Please enter the API key generated from Google AI Studio",
        placeHolder: "API Key",
        password: true,
        ignoreFocusOut: true,
      });
      if (!apiKey) {
        return;
      }
      await context.secrets.store("rewriter.apiKey", apiKey);
      vscode.window.showInformationMessage("API Key saved successfully.");
    })
  );

  // [Flow] Select Model Command
  context.subscriptions.push(
    vscode.commands.registerCommand("rewriter.selectModel", async () => {
      try {
        const apiKey = await context.secrets.get("rewriter.apiKey");
        if (!apiKey) {
          vscode.window.showErrorMessage(
            "Please set the API key first by running 'Rewriter: Set API Key'"
          );
          return;
        }

        const selectedModel = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Fetching available Gemini models...",
            cancellable: false
          },
          async () => {
            const models = await listAvailableModels(apiKey);
            if (models.length === 0) {
              throw new Error("No available models found for generateContent.");
            }

            return await vscode.window.showQuickPick(models, {
              placeHolder: "Select a Gemini model to use",
              title: "Select Gemini Model"
            });
          }
        );

        if (selectedModel) {
          await updateModelConfig(selectedModel);
          vscode.window.showInformationMessage(`Rewriter model set to: ${selectedModel}`);
        }
      } catch (error) {
        console.error("Select Model Error:", error);
        vscode.window.showErrorMessage(`Failed to list models: ${error instanceof Error ? error.message : "Unknown error"}`);
      }
    })
  );

  // [Flow] Rewrite Command
  context.subscriptions.push(
    vscode.commands.registerCommand("rewriter.rewrite", async (args) => {
  // [Topology] Immediate Context Capture
  // Capture the editor state *synchronously* at the moment of command invocation.
  // This prevents 'State Drift' where the active editor/selection changes during async operations.
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
      }
      const text = editor.document.getText(editor.selection);
      if (!text) {
        vscode.window.showErrorMessage("No text selected");
        return;
      }

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Rewriting...",
          cancellable: false,
        },
        async () => {
          try {
            // 1. Acquire Phase (Configuration)
            const apiKey = await context.secrets.get("rewriter.apiKey");
            if (!apiKey) {
              vscode.window.showErrorMessage(
                "Please set the API key first by running the command 'Rewriter: Set API Key'"
              );
              return;
            }
            const config = getRewriterConfig(apiKey);

            // [Phase] Validation
            // Explicitly check for invalid/deprecated default state.
            // If the user hasn't selected a model (or persistence failed and we reverted to default),
            // and that default is the broken 'gemini-pro', we MUST interrupt the flow.
            if (config.modelName === "gemini-pro") {
              const selection = await vscode.window.showWarningMessage(
                "The default model 'gemini-pro' is deprecated. Please select a valid Gemini model to proceed.",
                "Select Model"
              );
              if (selection === "Select Model") {
                vscode.commands.executeCommand("rewriter.selectModel");
              }
              return; // Halt execution regardless of selection (user needs to pick one first)
            }
            const rewriteContext: RewriteContext = {
              text,
              selectionPrompt: args?.prompt
            };

            // 3. Execute Binding (Generative AI)
            const result = await generateRewrite(config, rewriteContext);

            // 4. Execute Binding (Editor Update)
            // Use the captured 'editor' reference to ensure we write back to the correct document.
            await replaceSelection(editor, result);

          } catch (error) {
            console.error("Rewrite Error:", error);
            if (error instanceof Error) {
              vscode.window.showErrorMessage(`Rewrite failed: ${error.message}`);
            } else {
              vscode.window.showErrorMessage("Rewrite failed with an unknown error.");
            }
          }
        }
      );
    })
  );
}

export function deactivate() {}
