import * as vscode from "vscode";

/**
 * Helper for retrieving URLs to be used on a web views.
 */
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

  public getRedomWebviewUri(): vscode.Uri {
    return this._getWebviewUri([
      "node_modules",
      "redom",
      "dist",
      "redom.min.js",
    ]);
  }

  public getFileIconsJsWebviewUri(): vscode.Uri {
    return this._getWebviewUri([
      "node_modules",
      "file-icons-js",
      "dist",
      "file-icons.js",
    ]);
  }

  public getFileIconsCssWebviewUri(): vscode.Uri {
    return this._getWebviewUri([
      "node_modules",
      "file-icons-js",
      "css",
      "style.css",
    ]);
  }

  public getScriptWebviewUri(scriptPath: string[]): vscode.Uri {
    return this._getWebviewUri(["media", "scripts", ...scriptPath]);
  }

  public getStyleWebviewUri(scriptPath: string[]): vscode.Uri {
    return this._getWebviewUri(["media", "styles", ...scriptPath]);
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
