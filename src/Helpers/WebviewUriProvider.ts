import * as vscode from "vscode";

export class WebviewUriProvider {
  private _WebviewView: vscode.Webview;
  private _extenstionUri: vscode.Uri;

  constructor(WebviewView: vscode.Webview, extenstionUri: vscode.Uri) {
    this._WebviewView = WebviewView;
    this._extenstionUri = extenstionUri;
  }

  /************
   *  Public  *
   ************/

  public getUiToolkitWebviewUri(): vscode.Uri {
    return this._getWebviewUri([
      "node_modules",
      "@vscode",
      "webview-ui-toolkit",
      "dist",
      "toolkit.js",
    ]);
  }

  public getScriptWebviewUri(scriptPath: string[]): vscode.Uri {
    return this._getWebviewUri(["media", "scripts", ...scriptPath]);
  }

  /*************
   *  Private  *
   *************/

  private _getWebviewUri(modulePathList: string[]): vscode.Uri {
    return this._WebviewView.asWebviewUri(
      vscode.Uri.joinPath(this._extenstionUri, ...modulePathList)
    );
  }
}
