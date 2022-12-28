import * as vscode from "vscode";

import GitApi from "./gitExtensionApi";
import { ActivityBarViewProvider } from "./Views";

export async function activate(context: vscode.ExtensionContext) {
  console.log("*** vsc-diff-regex startup ***");

  /***********************
   *  Extension startup  *
   ***********************/
  const gitApi = GitApi.Instance;

  // Make sure git extension is active
  if (await gitApi.activateGit()) {
    try {
      // @NOTE: remove in foreseeable future.
      // https://github.com/sergeyt/parse-diff/pull/44

      context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
          ActivityBarViewProvider.getViewId(),
          new ActivityBarViewProvider(context)
        )
      );

      // Test command
      let ping = vscode.commands.registerCommand("vdr.ping", () => {
        vscode.window.showInformationMessage("Pong");
      });

      context.subscriptions.push(ping);
    } catch (error) {
      console.log({ error });
    }
  }
}

// this method is called when your extension is deactivated
export function deactivate() {}
