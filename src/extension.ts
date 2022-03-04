import * as vscode from "vscode";

import GitApi from "./gitExtensionApi";
import { ActivityBarViewProvider } from "./Views";

/**
 ******* NOTES *******
 *
 *
 * 1. Maintaing a valid repository state is a TODO - not so important right now, let's focus on main funcionalities such as:
 * 2. D̶i̶s̶p̶l̶a̶y̶ i̶n̶p̶u̶t̶ f̶i̶e̶l̶d̶ i̶n̶s̶i̶d̶e̶ V̶i̶e̶w̶ a̶n̶d̶ s̶t̶o̶r̶i̶n̶g̶ i̶t̶'̶s̶ v̶a̶l̶u̶e̶ i̶n̶ a̶ V̶S̶C̶'̶s̶ l̶o̶c̶a̶l̶s̶t̶o̶r̶a̶g̶e̶.̶
 * 3. R̶u̶n̶ c̶o̶m̶m̶a̶n̶d̶ w̶h̶i̶c̶h̶ w̶i̶l̶l̶ r̶u̶n̶ `̶g̶i̶t̶ d̶i̶f̶f̶`̶
 * 4. Get changed files from `git diff` (https://github.com/sergeyt/parse-diff) X
 * 5. Open file upon click (is there a quick way to show diff like in a SCM view?)
 * 6. Highlight searched regex inside this file
 * 7. Run `git diff` on file changes X
 * 8. Change highlight in opened window while typing in search input.
 * 9. Don't care bout rename alone (but do care about rename & contents change) (`git diff --no-renames` ???)
 * 10. Show TreeView (controlled by main View) and create easy update mechanism
 * 11. Translate `git diff` to TreeView
 *
 * --- Road map functionalities ---
 * 7. Find and replace occurrences in all files
 * 8. Handle multiple repositeries within opened Workspace
 * 9. Handle multiple Workspaces
 * 10. Create pull request on https://github.com/sergeyt/parse-diff that enables parsing filenames where diff.noprefix === true OR diff.mnemonicPrefix === true
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

    // check config (due to parse limitations of "parse-diff": "^0.9.0")
    // ...
    // git config diff.noprefix === FALSE | undef
    // git config diff.mnemonicPrefix === FALSE | undef

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

    let gitDiff = vscode.commands.registerCommand("vdr.git-diff", async () => {
      const diff = await gitApi.parseDiff();
      console.log(diff);
    });

    context.subscriptions.push(ping, gitDiff);
  }
}

// this method is called when your extension is deactivated
export function deactivate() {}
