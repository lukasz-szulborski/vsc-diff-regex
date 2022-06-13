import * as vscode from "vscode";
import { Repository } from "../../../declarations/git";
import GitApi from "../../gitExtensionApi";
import { WebviewUriProvider } from "../../Helpers";
import { RepositoryFileChange, WorkspaceStateKeys } from "../../types";
import { filenameFromPath } from "../../utils";

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
    vscode.workspace.onDidSaveTextDocument(async (e) => {
      await this._applyChanges();
    });

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
            await this._handleChangeClick(fullFilePath, change.line);
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
  private async _handleChangeClick(fullFilePath: string, line: number) {
    // @TODO: catch statement
    const doc = await vscode.workspace.openTextDocument(`${fullFilePath}`);
    const editor = await vscode.window.showTextDocument(doc);
    editor.revealRange(
      new vscode.Range(
        new vscode.Position(line, 0),
        new vscode.Position(line, 0)
      ),
      vscode.TextEditorRevealType.InCenter
    );
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
   * regex search and repaints changes tree.
   */
  private async _applyChanges() {
    const searchInputValue = this._getSearchInputFromState;
    if (searchInputValue) {
      // Run and parse `git diff`.
      const diff = await this._gitApi.parseDiff();

      // Filter with saved regex term.
      const filteredChanges: RepositoryFileChange[] = [];
      const regex = new RegExp(searchInputValue, "g"); // Parse search term as RegEx.
      diff.forEach((changedFile) => {
        let newIndex: undefined | number = undefined;
        changedFile.changes.forEach((fileChange) => {
          // @NOTE: For now consider only 'add' changes. Maybe later add ability to change this in extension settings.
          if (
            fileChange.type === "add" &&
            fileChange.content.match(regex) !== null
          ) {
            // First change in a file matched.
            if (newIndex === undefined) {
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
          }
        });
      });

      this._view.webview.postMessage({
        command: "newResults",
        matches: filteredChanges,
      });
    }
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
                    ???
                </body>
            </html>
        `;
        break;
    }
  }

  private _renderView(): void {
    this._view.webview.html = this._buildView();
    this._onDidRender();
  }

  private _onDidRender(): void {
    // @TODO: ???
    // this._loadDataFromLocalStorage();
  }
}
