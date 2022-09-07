import * as vscode from "vscode";
import { Repository } from "../../../declarations/git";
import GitApi from "../../gitExtensionApi";
import { WebviewUriProvider } from "../../Helpers";
import {
  ActivityBarViewLoadingState,
  ActivityBarViewLoadingStateKeys,
  FilenameLineChangesHashMap,
  FilenameLineTextEditorPositionHashMap,
  GetEditorPositionsFromFilenameLineChangeHashMapParams,
  LineChange,
  RepositoryFileChange,
  TextEditorPosition,
  WorkspaceStateKeys,
} from "../../types";
import { myersDiff } from "../../utils";

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
  private _textEditorsDecorations: vscode.TextEditorDecorationType[] = [];
  private _loadingState: ActivityBarViewLoadingState = {
    gitRepositories: true,
  };

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
    vscode.workspace.onDidSaveTextDocument(
      async () => {
        await this._getChangedPositionsPerFile();
      },
      undefined,
      this._disposables
    );

    vscode.workspace.onDidChangeTextDocument(
      async () => {
        // @TODO: Paint changes.
        console.log("keystroke");
      },
      undefined,
      this._disposables
    );

    vscode.window.onDidChangeVisibleTextEditors(
      async () => {
        /*
        Works for: 
          [X] Listen for new tab open.
          [X] Repaint searched term decorations.
          [X] Check if it works for re-opening closed tabs
          [X] Check if it works po splitting into new tab.
      */
        // @TODO: Paint decorations only.
        await this._getChangedPositionsPerFile();
      },
      undefined,
      this._disposables
    );

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

  /**
   * Update variable that holds informations about this view's components loading
   * state.
   * If all components did load then change render state to "ready to render".
   * Next render state (final one) will further handle loading.
   *
   */
  private _updateLoadingState(
    key: ActivityBarViewLoadingStateKeys,
    value: boolean
  ) {
    this._loadingState[key] = value;
    let isLoading = false;
    for (const key in this._loadingState) {
      const element =
        this._loadingState[key as ActivityBarViewLoadingStateKeys];
      if (element === true) {
        isLoading = true;
      }
    }
    if (isLoading === false) {
      this._renderState = RENDER_STATE.VIEW_READY;
    }
  }

  /**
   * Listen for events coming from this activity bar's webview.
   */
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

    // @NOTE: if UI lags, do not await
    // Always when input was changed, check for new search results.
    await this._getChangedPositionsPerFile();
  }

  /**
   * Open text document in an editor.
   *
   * @param fullFilePath path pointing to clicked line of changed document
   * @param line number of line where change occured
   */
  private async _handleChangeClick(fullFilePath: string, change: LineChange) {
    // @TODO: catch statement
    const doc = await vscode.workspace.openTextDocument(fullFilePath);
    const editor = await vscode.window.showTextDocument(doc);
    // Center at the position of the change.
    editor.revealRange(
      new vscode.Range(
        new vscode.Position(change.line, 0),
        new vscode.Position(change.line, 0)
      ),
      vscode.TextEditorRevealType.InCenter
    );
  }

  private _handleGitApiInitialized(): void {
    // @TODO: [roadmap] consider multiple workspaces
    const repository: Repository | null =
      this._gitApi.getWorkspaceMainRepository();
    if (repository) {
      this._updateLoadingState("gitRepositories", false);
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

  private _getEditorPositionsFromFilenameLineChangeHashMap({
    changesHashMap,
    searchedTerm,
    onLineChangeEncountered,
  }: GetEditorPositionsFromFilenameLineChangeHashMapParams): FilenameLineTextEditorPositionHashMap {
    const results: FilenameLineTextEditorPositionHashMap = {};

    for (const fileName in changesHashMap) {
      results[fileName] = {}; // Prepare hash map for given file.
      const changes = changesHashMap[fileName];
      for (const changeLineNumber in changes) {
        /*
          This loop is only concerned with changes within a single line. Thus we can conclude whether we're dealing with insertion or modification.
        */
        const changeLineNumberParsed = parseInt(changeLineNumber);
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

        originalToCurrentEditScript.operations.forEach(async (operation) => {
          // Use only adds.
          if (operation.operation_type !== "Insert") {
            return;
          }

          // Find terms in edit script.
          const foundTerms = searchedTerm.exec(operation.content);

          // @TODO: loop all matches.
          if (foundTerms && foundTerms[0]) {
            termFoundInChanges = true;

            // Find terms in edit script and Extract positions.
            const positionsToPaint: TextEditorPosition = {
              content: currentContent,
              posStart: foundTerms.index + operation.pos_start,
              posEnd:
                foundTerms.index + operation.pos_start + foundTerms[0].length,
            };

            results[fileName][changeLineNumber] = [positionsToPaint];
          }
        });

        if (onLineChangeEncountered) {
          onLineChangeEncountered({
            didMatch: termFoundInChanges,
            fileName: fileName,
            line: changeLineNumberParsed,
          });
        }
      }
    }

    return results;
  }

  /**
   * Inpure function that communicates with active text editors and paints
   * decorations on given positions.
   *
   * @TODO: handle exceptions
   *
   */
  private _paintDecorationsInTextEditors(
    positions: FilenameLineTextEditorPositionHashMap
  ): void {
    // Dispose and clear decorations from previous render.
    this._textEditorsDecorations.forEach((decoration) => decoration.dispose());
    this._textEditorsDecorations = [];

    for (const filePath in positions) {
      // Find editors with this file.
      const editors = vscode.window.visibleTextEditors.filter(
        (e) =>
          e.document.uri.path.toLocaleLowerCase() ===
          filePath.toLocaleLowerCase()
      );

      if (!editors || editors.length === 0) {
        continue;
      }

      for (const fileLine in positions[filePath]) {
        const positionChange = positions[filePath][fileLine];
        const parsedFileLine = parseInt(fileLine);
        // Create decoration.
        const decoration = vscode.window.createTextEditorDecorationType({
          backgroundColor: "green",
          rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
        });
        this._textEditorsDecorations.push(decoration);
        editors.forEach((editor) => {
          /*
            Check whether current content of the document at changed line is equal to passed change position content.
            We do this to prevent painting decoration that are irrelevant.
          */
          const currentEditorLine = editor.document.lineAt(parsedFileLine);
          console.log({ currentEditorLine });
          positionChange.forEach((change) =>
            editor.setDecorations(decoration, [
              new vscode.Range(
                new vscode.Position(parsedFileLine, change.posStart),
                new vscode.Position(parsedFileLine, change.posEnd)
              ),
            ])
          );
        });
      }
    }
  }

  /**
   * Function that is run on file content changes or searched term changes.
   * Analyzes `git diff`, filters by current regex search.
   *
   * @TODO: refactor
   */
  private async _getChangedPositionsPerFile(): Promise<FilenameLineTextEditorPositionHashMap> {
    const searchInputValue = this._getSearchInputFromState;

    /* 
      -----
      -- PARSING SUBROUTINE
      -----

      It will parse "git diff" command and put it into easy-to-interpret (for this special case) objects. 

      Whole process consists of several steps. 
      * Parse "git diff" (text -> array of javascript objects)
      * Filter only "add" and "delete" changes. Also index changes by file path and line numbers.
      * Now, first phase of parsing is done. We have javascript objects that facilitate further manipulations.
    */

    // Run and parse `git diff`.
    const diff = await this._gitApi.parseDiff();

    // Filter with saved regex term.
    const filteredChanges: RepositoryFileChange[] = [];
    // Containing filtered changes (File name -> change line -> change) Hash map. Index to process changes within a single line easier.
    const filteredChangesHashMap: FilenameLineChangesHashMap = {};
    const searchedTermRegex = new RegExp(searchInputValue ?? "");
    diff.forEach((changedFile) => {
      let newIndex: undefined | number = undefined;
      changedFile.changes.forEach((fileChange) => {
        /*
          @NOTE: in future make it a changeable option. This is possible that someone will want to use regexp in context of whole line.
          Also @NOTE that letting all lines in may introduce some computation overhead, monitor this part of the code when some performance problems arise in the future.
        */
        if (
          fileChange.type === "add" /*&&
            fileChange.content.match(searchedTermRegex) !== null*/ ||
          fileChange.type === "del"
        ) {
          // Create different object types for changed files. Later it will be easier to reason about this changed files.
          if (newIndex === undefined) {
            // First change in a file matched.
            newIndex =
              filteredChanges.push({
                filePath: changedFile.filePath,
                fileName: changedFile.fileName,
                fullFilePath: changedFile.fullFilePath,
                changes: [fileChange],
              }) - 1;
          } else {
            // Rest of the changes matched in a file.
            filteredChanges[newIndex].changes.push(fileChange);
          }

          // Index (aggregation) per changed file per line.
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
      -----                           -----
      -- EXTRACTING POSITIONS SUBROUTINE --
      -----                           -----

      It will extract specific changed positions that match searched term and further filter changes by this term.

      * First of all we need to make sure that lines that doesn't contain searched term strictly in *changes* (meaning changed indexes of a string) will be eventually filtered out (filter lines that contain searched term but not in changes). See `changedLinesThatDidntMatchTerm` dictionary.
      * Find added positions in changed lines.
    */

    // Collect positions where searched term occur.
    const changedLinesThatDidntMatchTerm: Record<string, number[]> = {};
    const editorPositionsFromFilenameLineChangeHashMap =
      this._getEditorPositionsFromFilenameLineChangeHashMap({
        changesHashMap: filteredChangesHashMap,
        searchedTerm: searchedTermRegex,
        // Find changes that don't match searched term.
        onLineChangeEncountered: ({ didMatch, fileName, line }) => {
          if (didMatch) {
            return;
          }
          if (!changedLinesThatDidntMatchTerm[fileName]) {
            changedLinesThatDidntMatchTerm[fileName] = [];
          }
          changedLinesThatDidntMatchTerm[fileName].push(line);
        },
      });

    // Second (and final) step of filtering where we filter lines that don't contain searched term in changes (but it may contain the term in the rest of the line contents).
    const fullyFilteredChanges: typeof filteredChanges = filteredChanges.map(
      (fileChange) => {
        const linesToRemove =
          changedLinesThatDidntMatchTerm[fileChange.fullFilePath];
        if (
          !linesToRemove ||
          !Array.isArray(linesToRemove) ||
          linesToRemove.length === 0
        ) {
          return fileChange;
        }
        const updatedFileChange: RepositoryFileChange = { ...fileChange };
        updatedFileChange.changes = fileChange.changes.filter(
          (change) => !linesToRemove.includes(change.line)
        );
        return updatedFileChange;
      }
    );
    
    // @TODO: insert callback hook "onChangesReady"
    this._view.webview.postMessage({
      command: "newResults",
      matches: fullyFilteredChanges,
    });

    // @TODO: "onChangedPositionsReady"
    this._paintDecorationsInTextEditors(
      editorPositionsFromFilenameLineChangeHashMap
    );

    return editorPositionsFromFilenameLineChangeHashMap;
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
