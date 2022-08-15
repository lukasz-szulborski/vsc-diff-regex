import * as vscode from "vscode";
import { Repository } from "../../../declarations/git";
import GitApi from "../../gitExtensionApi";
import { WebviewUriProvider } from "../../Helpers";
import {
  LineChange,
  RepositoryFileChange,
  WorkspaceStateKeys,
} from "../../types";
import { filenameFromPath, myersDiff } from "../../utils";

enum RENDER_STATE {
  VIEW_LOADING, // Waiting for modules that View depends on.
  VIEW_READY, // View is ready to render.
  NO_REPO, // Git VSCode API didn't find any repositories within open workspaces.
}

/**
 * Class responsible for managing vdr-activity-bar-view WebviewView.
 */
export class ActivityBarView implements vscode.Disposable {
  private _view: vscode.WebviewView;
  private _WebviewUriProvider: WebviewUriProvider;
  private _renderState: RENDER_STATE = RENDER_STATE.VIEW_LOADING;
  private _disposables: vscode.Disposable[] = [];
  private _extensionContext: vscode.ExtensionContext;
  private _gitApi: GitApi = GitApi.Instance;

  constructor(
    extensionContext: vscode.ExtensionContext,
    webviewView: vscode.WebviewView
  ) {
    this._extensionContext = extensionContext;
    this._view = webviewView;

    this._WebviewUriProvider = new WebviewUriProvider(
      this._view.webview,
      this._extensionContext.extensionUri
    );

    this._view.webview.options = this._getWebviewOptions(); // Configure Webview.

    // Listen for messages within the View.
    this._setWebviewMessageListener();

    // Listen for text document save.
    const saveListener = vscode.workspace.onDidSaveTextDocument(async () => {
      await this._applyChanges();
    });

    // Changing tabs.
    const closeListener = vscode.workspace.onDidOpenTextDocument(async () => {
      // @TODO:
      // [X] Listen for new tab open.
      // [X] Repaint searched term decorations.
      // [ ] Check if it works for re-opening closed tabs
      // [ ] Check if it works po splitting into new tab.
      await this._applyChanges();
    });
    this._disposables.push(saveListener, closeListener);

    // Clean disposables.
    this._view.onDidDispose(this.dispose, undefined, this._disposables);

    if (this._gitApi.getState() === "initialized") {
      this._handleGitApiInitialized();
    } else {
      this._gitApi.onDidChangeState((e) => {
        if (e === "initialized") {
          this._handleGitApiInitialized();
        }
      });
    }

    this._renderView();
  }

  dispose() {
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) disposable.dispose();
    }
  }

  /*************
   *  Private  *
   *************/

  private _getWebviewOptions(): vscode.WebviewOptions {
    return {
      enableScripts: true, // For UI Toolkit
    };
  }

  private _setWebviewMessageListener(): void {
    let inputChangeWasNoted = false;

    // Webview messages.
    this._view.webview.onDidReceiveMessage(
      async (msg: any) => {
        switch (msg.command) {
          case "searchInputChange":
            const { value } = msg;
            this._handleSearchInputChange(value, !inputChangeWasNoted);
            inputChangeWasNoted = true;
            break;
          case "ActivityBarViewDidLoad":
            this._loadDataFromLocalStorage();
            break;
          case "changeClick":
            const { fullFilePath, change } = msg;
            await this._handleChangeClick(
              fullFilePath as string,
              change as LineChange
            );
            break;
          case "log":
            console.log(msg.value);
            break;

          default:
            break;
        }
      },
      undefined,
      this._disposables
    );
  }

  private get _getSearchInputFromState(): string | undefined {
    const { workspaceState } = this._extensionContext;
    const currentValue = workspaceState.get(
      WorkspaceStateKeys.ABV_SEARCH_INPUT
    ) as string;
    if (!currentValue) return undefined;
    return currentValue;
  }

  private async _handleSearchInputChange(
    value: string,
    force: boolean = false
  ): Promise<void> {
    const { workspaceState } = this._extensionContext;
    const currentValue = this._getSearchInputFromState;
    // Avoid unnecessary renders and updates
    // @TODO: force should be made on every reload of this view (leaving the sidebar aswell)
    if (value !== currentValue || force) {
      workspaceState.update(WorkspaceStateKeys.ABV_SEARCH_INPUT, value);
    }

    if (value && value.length !== 0) {
      // @NOTE: if UI lags, do not await
      // Always when input was changed, check for new search results.
      await this._applyChanges();
    }
  }

  /**
   * Open text document in an editor.
   *
   * @param fullFilePath path pointing to clicked line of changed document
   * @param line number of line where change occured
   */
  private async _handleChangeClick(fullFilePath: string, change: LineChange) {
    // @TODO: catch statement
    const doc = await vscode.workspace.openTextDocument(`${fullFilePath}`);
    const editor = await vscode.window.showTextDocument(doc);
    // Center at the position of the change.
    editor.revealRange(
      new vscode.Range(
        new vscode.Position(change.line, 0),
        new vscode.Position(change.line, 0)
      ),
      vscode.TextEditorRevealType.InCenter
    );

    // @TODO: move to painting subroutine
    // Highlight change occurances (using decorations).
    const decoration = vscode.window.createTextEditorDecorationType({
      backgroundColor: "red",
    });
    editor.setDecorations(decoration, [
      new vscode.Range(new vscode.Position(20, 0), new vscode.Position(20, 40)),
    ]);
  }

  private _handleGitApiInitialized(): void {
    // @TODO: [roadmap] consider multiple workspaces
    const repository: Repository | null =
      this._gitApi.getWorkspaceMainRepository();
    if (repository) {
      this._renderState = RENDER_STATE.VIEW_READY;
    } else {
      this._renderState = RENDER_STATE.NO_REPO;
    }
    this._renderView();
  }

  /**
   * Loads data from extenstion storage to the view.
   */
  private _loadDataFromLocalStorage(): void {
    // Load search input content.
    const searchInputValue = this._getSearchInputFromState;
    this._view.webview.postMessage({
      command: "setSearchInputValue",
      value: searchInputValue ?? "",
    });
  }

  /**
   * Subroutine that is run on changes. Analyzes `git diff`, filters by current
   * regex search, repaints changes tree and decorated active editor.
   */
  private async _applyChanges() {
    // If searched term does not exist then stop the routine.
    const searchInputValue = this._getSearchInputFromState;
    if (
      !searchInputValue ||
      typeof searchInputValue !== "string" ||
      searchInputValue.length === 0
    ) {
      return;
    }

    /* 
      -----
      -- PARSING SUBROUTINE
      -----

      It will parse "git diff" command and put it into easy-to-interpret (for this special case) objects. 

      Whole process consists of several steps. 
      * Parse "git diff" (text -> array of javascript objects)
      * Filter only "add" and "delete" changes. Also keep only these lines where searched term can be found anywhere inside line (even if searched term is not "add" change). Also index changes by file path and line numbers.
      * Now, first phase of parsing is done. We have javascript objects that facilitate further manipulations.
    */

    // Run and parse `git diff`.
    const diff = await this._gitApi.parseDiff();

    // Filter with saved regex term.
    const filteredChanges: RepositoryFileChange[] = [];
    // Containing filtered changes (File name -> change line -> change) Hash map. Index to process changes within a single line easier.
    const filteredChangesHashMap: Record<
      string,
      Record<number, LineChange[]>
    > = {};
    const searchedTermRegex = new RegExp(searchInputValue);
    diff.forEach((changedFile) => {
      let newIndex: undefined | number = undefined;
      changedFile.changes.forEach((fileChange) => {
        if (
          (fileChange.type === "add" &&
            fileChange.content.match(searchedTermRegex) !== null) ||
          fileChange.type === "del"
        ) {
          // Create different object types for changed files. Later it will be easier to reason about this changed files.
          if (newIndex === undefined) {
            // First change in a file matched.
            newIndex =
              filteredChanges.push({
                filePath: changedFile.filePath,
                fileName: filenameFromPath(changedFile.filePath),
                fullFilePath: changedFile.fullFilePath,
                changes: [fileChange],
              }) - 1;
          } else {
            // Rest of the changes matched in a file.
            filteredChanges[newIndex].changes.push(fileChange);
          }

          // Index (aggregation) for changed files per line.
          if (!filteredChangesHashMap[changedFile.fullFilePath])
            filteredChangesHashMap[changedFile.fullFilePath] = {};
          if (
            !filteredChangesHashMap[changedFile.fullFilePath][fileChange.line]
          )
            filteredChangesHashMap[changedFile.fullFilePath][fileChange.line] =
              [];
          filteredChangesHashMap[changedFile.fullFilePath][
            fileChange.line
          ].push(fileChange);
        }
      });
    });

    /* 
      -----
      -- PAINTING CHANGES SUBROUTINE
      -----

      It will further filter changes by searched term and visualise searched changes. 

      * First of all we need to make sure that lines that doesn't contain searched term strictly in *changes* will be eventually filtered out (filter lines that contain searched term but not in changes). See `filteredChangesLinesToFilterOut` array.
      * Find added positions in changed lines.
      * Decorate these positions.
    */

    // Get all visible to the user editors
    const editors = vscode.window.visibleTextEditors;

    // Array of changed files' indices in `filteredChanges` array and lines to filter out (where changes doesn't contain searched term).
    const filteredChangesLinesToFilterOut: number[][] = [];

    filteredChanges.forEach((fileChange, fileChangeIndex) => {
      const changedFileFullPath = fileChange.fullFilePath;
      // For every changed file, try to find active editor.
      const editor = editors.find(
        (e) =>
          e.document.uri.path.toLocaleLowerCase() ===
          changedFileFullPath.toLocaleLowerCase()
      );
      if (!editor) return;

      // If active editor with changes exist, get changed lines for this editor and find out what changed on a line level using some kind of LCS algorithm. After line changes are found filter them further to leave only positions that match with a searched term.
      const changes = filteredChangesHashMap[changedFileFullPath];

      for (const changeLineNumber in changes) {
        const change = changes[changeLineNumber];
        let isModified = change.length === 2;
        let isPlainAdd = change.length === 1;
        let originalContent: string, currentContent: string;
        if (isPlainAdd) {
          // Consider whole line as changed.
          originalContent = "";
          const changeUnit = change[0];
          if (changeUnit.type !== "add") {
            // Do not analyze deletions as a single unit. There is nothing to paint there.
            continue;
          }
          currentContent = changeUnit.content;
        } else if (isModified) {
          const addChangeIndex = change.findIndex((c) => c.type === "add");
          const delChange = change[1 - addChangeIndex];
          const addChange = change[addChangeIndex];
          originalContent = delChange.content;
          currentContent = addChange.content;
        } else {
          // Don't paint changes. Change at line shouldn't be longer than 2.
          continue;
        }

        const originalToCurrentEditScript = myersDiff(
          originalContent,
          currentContent
        );

        let termFoundInChanges = false;
          
        originalToCurrentEditScript.operations.forEach((operation) => {
          // Use only adds.
          if (operation.operation_type !== "Insert") {
            return;
          }

          // Find terms in edit script.
          const foundTerms = searchedTermRegex.exec(operation.content);
          
          if (foundTerms && foundTerms[0]) {
            termFoundInChanges = true;
          }

          // Find terms in edit script and Extract positions.

          // Create decorations.
          // ...

          // Apply styles in found positions (vector or tuples (line, startCol, endCol)).
          // ...
        });

        // If "add change" doesn't contain searched term then mark this line as irrelevant.
        if (!filteredChangesLinesToFilterOut[fileChangeIndex]) {
          filteredChangesLinesToFilterOut[fileChangeIndex] = [];
        }
        if (!termFoundInChanges) {
          filteredChangesLinesToFilterOut[fileChangeIndex].push(
            parseInt(changeLineNumber)
          );
        }
      }
    });

    // Second (and final) step of filtering where we filter lines that don't contain searched term in changes (but it may contain the term in the rest of the line contents).
    const fullyFilteredChanges: typeof filteredChanges = filteredChanges.map(
      (fileChange, fileChangeIndex) => {
        const linesToFilter = filteredChangesLinesToFilterOut[fileChangeIndex];
        const updatedFileChange: RepositoryFileChange = { ...fileChange };
        if (
          linesToFilter &&
          Array.isArray(linesToFilter) &&
          linesToFilter.length > 0
        ) {
          updatedFileChange.changes = fileChange.changes.filter(
            (change) => !linesToFilter.includes(change.line)
          );
        }

        return updatedFileChange;
      }
    );

    this._view.webview.postMessage({
      command: "newResults",
      matches: fullyFilteredChanges,
    });
  }

  /**
   * Generate Webview HTML basing on current View state.
   */
  private _buildView(): string {
    switch (this._renderState) {
      case RENDER_STATE.VIEW_LOADING:
        return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width,initial-scale=1.0">
                </head>
                <body>
                    Extension is loading...
                </body>
            </html>
        `;
        break;
      case RENDER_STATE.NO_REPO:
        return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width,initial-scale=1.0">
                </head>
                <body>
                    It looks like you don't have any repositories inside opened workspaces.
                </body>
            </html>
        `;
        break;
      case RENDER_STATE.VIEW_READY:
        return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width,initial-scale=1.0">
                    <script type="module" src="${this._WebviewUriProvider.getUiToolkitWebviewUri()}"></script>
                    <script type="module" src="${this._WebviewUriProvider.getRedomWebviewUri()}"></script>
                    <script type="module" src="${this._WebviewUriProvider.getFileIconsJsWebviewUri()}"></script>
                    <script type="module" src="${this._WebviewUriProvider.getScriptWebviewUri(
                      ["ActivityBarScripts.js"]
                    )}"></script>
                    <link rel="stylesheet" href="${this._WebviewUriProvider.getFileIconsCssWebviewUri()}">
                    <link rel="stylesheet" href="${this._WebviewUriProvider.getStyleWebviewUri(
                      ["activity-bar-scripts.css"]
                    )}">
                </head>
                
                <body>
                    <vscode-text-field id="searchInput" placeholder='eg. ".*console.log.*"'>
                      Search
                    </vscode-text-field>
                    <div class="empty-search-input" id="emptySearchInput">Feel free to use above search input.</div>
                    <div class="results-container" id="resultsContainer"></div>
                </body>
            </html>
        `;
        break;

      default:
        return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width,initial-scale=1.0">
                </head>
                <body>
                    Extension didn't load correctly. Please try reloading VSC window.
                </body>
            </html>
        `;
        break;
    }
  }

  private _renderView(): void {
    this._view.webview.html = this._buildView();
  }
}
