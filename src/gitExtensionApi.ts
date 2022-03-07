import * as vscode from "vscode";
import * as parseDiff from "parse-diff";
import * as path from "path";

import { API, GitExtension, Repository } from "../declarations/git";
import { RepositoryFileChange } from "./types";
import { asyncExec } from "./utils";
import { resolve } from "path";

type RemodelParsedDiffConfig = {
  includeUntracked?: boolean;
  cleanAddChange?: boolean;
};

export default class GitApi {
  private _vscExtension!: vscode.Extension<GitExtension>;
  private _vscGitExtension!: GitExtension;
  private _vscGitApi!: API;
  private static _instance: GitApi;

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

  public static get Instance() {
    return this._instance || (this._instance = new this());
  }

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

    // Also include untracked files (included by default)
    if (includeUntracked) {
      const untrackedChanges: RepositoryFileChange[] =
        await this.parseUntrackedFilesInWorkspace();
      results.push(...untrackedChanges);
    }

    return results;
  }

  /*************
   *  Private  *
   *************/

  private getWorkspaceMainRepository(): Repository | null {
    const mainRepo = this._vscGitApi.getRepository(
      // @TODO: [roadmap] consider multiple workspaces
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

  // For untracked files.
  private async parseUntrackedFilesInWorkspace(): Promise<
    RepositoryFileChange[]
  > {
    try {
      const result: RepositoryFileChange[] = [];

      // @TODO: [roadmap] consider multiple workspaces
      let workspacePath: string =
        vscode.workspace.workspaceFolders![0].uri.path;
      workspacePath = workspacePath.replace(/^\//g, "");
      // Exec command.
      const commandResult: string = await asyncExec(
        `git -C ${workspacePath} ls-files -o --exclude-standard`
      );

      // Get untracked files paths from command result string.
      const filePaths: string[] = commandResult
        .trim()
        .split("\n")
        .map((filename) =>
          path.join(workspacePath, filename).replace(/\\/g, "/")
        );

      // Prepare for getting file contents.
      const contentGetters: Promise<
        | {
            relativeFilePath: string;
            fileLines: string[];
          }
        | undefined
      >[] = [];
      filePaths.forEach((path) => {
        const relativeFilePath = path
          .replace(workspacePath, "")
          .replace(/^\//g, "");

        // Prepare Promises that will retrieve  file contents.
        contentGetters.push(
          new Promise(async (resolve) => {
            try {
              const textDocument = await vscode.workspace.openTextDocument(
                path
              );
              const fileContent = textDocument.getText();
              const fileLines = fileContent.split("\n");
              resolve({
                relativeFilePath,
                fileLines,
              });
            } catch (error) {
              // Terminate silently upon encountering non-text (binary) files.
              resolve(undefined);
            }
          })
        );
      });

      // Get files contents.
      const filesAndContent = await Promise.all(contentGetters);

      // Format to expected out format.
      filesAndContent.forEach((fileContents) => {
        if (fileContents) {
          const { fileLines, relativeFilePath } = fileContents;
          result.push({
            filePath: relativeFilePath,
            changes: fileLines.map((line, i) => ({
              content: line,
              line: i,
              type: "add",
            })),
          });
        }
      });

      return result;
    } catch (error) {
      throw error;
    }
  }

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
