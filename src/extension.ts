import * as vscode from "vscode";

import GitApi from "./gitExtensionApi";
import { asyncExec } from "./utils";
import { ActivityBarViewProvider } from "./Views";

/**
 ******* NOTES *******
 *
 *
 * 9. Don't care bout rename alone (but do care about rename & contents change) (`git diff --no-renames` ???)
 *
 * --- Road map functionalities ---
 * 7. Find and replace occurrences in all files
 * 8. Handle multiple repositeries within opened Workspace
 * 9. Handle multiple Workspaces
 *
 */

export async function activate(context: vscode.ExtensionContext) {
  console.log("*** vsc-diff-regex startup ***");

  /***********************
   *  Extension startup  *
   ***********************/

  const gitApi = GitApi.Instance;

  // Make sure git extension is active
  if (await gitApi.activateGit()) {
    // Check git configuration (due to parse limitations of "parse-diff": "^0.9.0")
    // @NOTE: remove in foreseeable future.
    // https://github.com/sergeyt/parse-diff/pull/44
    const isDiffMnemonicPrefixEnabled = await asyncExec(
      "git config diff.mnemonicprefix"
    );
    if (isDiffMnemonicPrefixEnabled.trim() === "true") {
      vscode.window.showWarningMessage(
        'Extension may not work correctly when diff.mnemonicPrefix equals true in your git configuration. Please run "git config --global diff.mnemonicPrefix false".'
      );
    }

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
  }
}

// this method is called when your extension is deactivated
export function deactivate() {}
