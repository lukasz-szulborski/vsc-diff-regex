import * as vscode from "vscode";
import * as parseDiff from "parse-diff";

import { API, GitExtension, Repository } from "../declarations/git";
import { RepositoryFileChange } from "./types";

type RemodelParsedDiffConfig = {
  includeUntracked?: boolean;
  cleanAddChange?: boolean;
};

export default class GitApi {
  private _vscExtension!: vscode.Extension<GitExtension>;
  private _vscGitExtension!: GitExtension;
  private _vscGitApi!: API;

  constructor() {
    try {
      const gitExtension =
        vscode.extensions.getExtension<GitExtension>("vscode.git");
      if (gitExtension == undefined) throw new Error();
      this._vscExtension = gitExtension;
    } catch (error) {
      console.log(error);
    }
  }

  /************
   *  Public  *
   ************/

  public async activateGit(): Promise<boolean> {
    try {
      if (!this._vscExtension.isActive) await this._vscExtension.activate();
      this._vscGitExtension = this._vscExtension.exports;
      this._vscGitApi = this._vscGitExtension.getAPI(1);
      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  public async parseDiff(
    config?: RemodelParsedDiffConfig
  ): Promise<RepositoryFileChange[]> {
    const configExists = config !== undefined;
    const includeUntracked =
      !configExists ||
      (configExists &&
        (config.includeUntracked === undefined ||
          config.includeUntracked === true));
    const cleanAddChange =
      !configExists ||
      (configExists &&
        (config.cleanAddChange === undefined ||
          config.cleanAddChange === true));

    const parsedDiff = await this.diffToObject();
    const results: RepositoryFileChange[] = [];

    // Include changes from `git diff`
    if (parsedDiff) {
      parsedDiff.forEach((file, i) => {
        const parsedChangedFile: RepositoryFileChange = {
          changes: file.chunks.flatMap((chunk) => {
            return chunk.changes.map((change) => {
              if (this.isParseDiffChangeAdd(change)) {
                return {
                  line: change.ln,
                  content: cleanAddChange
                    ? change.content
                        .replace(/^\+/g, "")
                        .replace(/^( |\t)*/g, "")
                    : change.content,
                  type: "add",
                };
              } else if (this.isParseDiffChangeDelete(change)) {
                return {
                  line: change.ln,
                  content: change.content,
                  type: "del",
                };
              } else {
                return {
                  line: change.ln1,
                  content: change.content,
                  type: "normal",
                };
              }
            });
          }),
          // @NOTE: extension blocks cases where `git diff` cannot be parsed by parse-diff
          filePath: file.from!,
        };
        results.push(parsedChangedFile);
      });
    }

    // Also include untracked files (includes by default)
    if (includeUntracked) {
      //...
    }

    return results;
  }

  /*************
   *  Private  *
   *************/

  private getWorkspaceMainRepository(): Repository | null {
    const mainRepo = this._vscGitApi.getRepository(
      vscode.workspace.workspaceFolders![0].uri
    );
    return mainRepo;
  }

  private async diffToObject(): Promise<parseDiff.File[] | undefined> {
    const repository = this.getWorkspaceMainRepository();
    if (repository) {
      const result = parseDiff(await repository.diff());
      return result;
    }

    return undefined;
  }

  // @TODO:
  // For untracked files.
  // `git ls-files -o --exclude-standard`
  // ...

  private isParseDiffChangeNormal(
    change: any
  ): change is parseDiff.NormalChange {
    return change.type === "normal";
  }

  private isParseDiffChangeAdd(change: any): change is parseDiff.AddChange {
    return change.type === "add";
  }

  private isParseDiffChangeDelete(
    change: any
  ): change is parseDiff.DeleteChange {
    return change.type === "del";
  }
}
