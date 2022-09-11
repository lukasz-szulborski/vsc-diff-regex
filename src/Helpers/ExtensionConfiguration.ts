import * as vscode from "vscode";
import { ConfigurationKeys } from "../types";

export class ExtensionConfiguration {
  private constructor() {}

  public static getKey<T>(key: ConfigurationKeys): T | null {
    return vscode.workspace.getConfiguration("vsc-diff-regex").get(key) ?? null;
  }
}
