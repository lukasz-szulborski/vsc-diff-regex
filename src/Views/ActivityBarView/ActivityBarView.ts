import * as vscode from "vscode";
import GitApi from "../../gitExtensionApi";
import { WebviewUriProvider } from "../../Helpers";
import { WorkspaceStateKeys } from "../../types";

enum RENDER_STATE {
  VIEW_LOADING, // Waiting for modules that View depends on.
  VIEW_READY, // View is ready to render.
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
  private _gitApi: GitApi = new GitApi();

  constructor(
    extensionContext: vscode.ExtensionContext,
    webviewView: vscode.WebviewView
  ) {
    this._extensionContext = extensionContext;
    this._view = webviewView;

    this._view.webview.options = this._getWebviewOptions(); // Configure Webview.

    this._WebviewUriProvider = new WebviewUriProvider(
      this._view.webview,
      this._extensionContext.extensionUri
    );

    // Listen for messages within the View.
    this._setWebviewMessageListener();

    // Clean disposables.
    this._view.onDidDispose(this.dispose, undefined, this._disposables);

    // Dependent modules configured, ready to render.
    this._renderState = RENDER_STATE.VIEW_READY;
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
    this._view.webview.onDidReceiveMessage(
      (msg: any) => {
        switch (msg.command) {
          case "searchInputChange":
            const { value } = msg;
            this._handleSearchInputChange(value);
            break;
          case "ActivityBarViewDidLoad":
            this._loadDataFromLocalStorage();
            break;

          default:
            break;
        }
      },
      undefined,
      this._disposables
    );
  }

  private _handleSearchInputChange(value: string): void {
    const { workspaceState } = this._extensionContext;
    const currentValue = workspaceState.get(
      WorkspaceStateKeys.ABV_SEARCH_INPUT
    );
    // Avoid unnecessary renders and updates
    if (value !== currentValue) {
      workspaceState.update(WorkspaceStateKeys.ABV_SEARCH_INPUT, value);

      // Filter `git diff` space
      // ...
    }
  }

  /**
   * Loads data from extenstion storage to the view.
   */
  private _loadDataFromLocalStorage(): void {
    const { workspaceState } = this._extensionContext;

    // Load search input content.
    const searchInputValue = workspaceState.get(
      WorkspaceStateKeys.ABV_SEARCH_INPUT
    ) as string;
    if (searchInputValue && searchInputValue.length !== 0) {
      this._view.webview.postMessage({
        command: "setSearchInputValue",
        value: searchInputValue,
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
      case RENDER_STATE.VIEW_READY:
        return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width,initial-scale=1.0">
                    <script type="module" src="${this._WebviewUriProvider.getUiToolkitWebviewUri()}"></script>
                    <script type="module" src="${this._WebviewUriProvider.getScriptWebviewUri(
                      ["ActivityBarScripts.js"]
                    )}"></script>
                </head>
                <body>
                    <vscode-text-field id="searchInput" placeholder='eg. ".*console.log.*"'>
                      Search
                    </vscode-text-field>
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
    this._loadDataFromLocalStorage();
  }
}
