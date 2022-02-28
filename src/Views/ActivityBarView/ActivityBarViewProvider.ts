import * as vscode from "vscode";
import { ActivityBarView } from ".";
import { WebviewUriProvider } from "../../Helpers/WebviewUriProvider";

/**
 * Class responsible for resolving vdr-activity-bar-view WebviewView.
 */
export class ActivityBarViewProvider implements vscode.WebviewViewProvider {
  private static readonly _viewId = "vdr-activity-bar-view";

  private _ActibityBarView: ActivityBarView | undefined;
  private _extensionContext: vscode.ExtensionContext;

  constructor(extensionContext: vscode.ExtensionContext) {
    this._extensionContext = extensionContext;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this._ActibityBarView = new ActivityBarView(
      this._extensionContext,
      webviewView
    );
  }

  /************
   *  Public  *
   ************/

  public static getViewId(): string {
    return this._viewId;
  }
}
