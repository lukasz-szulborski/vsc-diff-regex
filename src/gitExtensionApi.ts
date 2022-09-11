import * as vscode from "vscode";
import * as parseDiff from "parse-diff";
import * as path from "path";

import { API, APIState, GitExtension, Repository } from "../declarations/git";
import { RepositoryDiffObject, RepositoryFileChange } from "./types";
import { asyncExec, filenameFromPath } from "./utils";

type RemodelParsedDiffConfig = {
  includeUntracked?: boolean;
  cleanAddChange?: boolean;
  cleanDelChange?: boolean;
};

/* 

@TODO: I don't like this class, please have a closer look later at what can be improved.
 */

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
    // @TODO: DRY
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
    const cleanDelChange =
      !configExists ||
      (configExists &&
        (config.cleanDelChange === undefined ||
          config.cleanDelChange === true));

    const parsedDiff = await this.diffToObject();

    const results: RepositoryFileChange[] = [];

    // Include changes from `git diff`
    if (parsedDiff) {
      parsedDiff.diffs.forEach((file, i) => {
        const parsedChangedFile: RepositoryFileChange = {
          changes: file.chunks.flatMap((chunk) => {
            return chunk.changes
              .filter(
                (change) => change.content !== `\\ No newline at end of file`
              )
              .map((change) => {
                if (this.isParseDiffChangeAdd(change)) {
                  return {
                    line: change.ln - 1,
                    content: cleanAddChange
                      ? change.content.replace(/^\+/g, "")
                      : change.content,
                    type: "add",
                    isVisible: true,
                  };
                } else if (this.isParseDiffChangeDelete(change)) {
                  return {
                    line: change.ln - 1,
                    content: cleanDelChange
                      ? change.content.replace(/^\-/g, "")
                      : change.content,
                    type: "del",
                    isVisible: false,
                  };
                } else {
                  return {
                    line: change.ln1 - 1,
                    content: change.content,
                    type: "normal",
                    isVisible: false,
                  };
                }
              });
          }),
          // @NOTE: extension blocks cases where `git diff` cannot be parsed by parse-diff
          filePath: file.from!,
          fileName: filenameFromPath(file.from!),
          fullFilePath: `${parsedDiff.repository.rootUri.path}/${file.from!}`,
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

  public repositoryExist(): boolean {
    return this.getWorkspaceMainRepository() !== null;
  }

  public onDidOpenRepository(cb: (e: Repository) => any) {
    this._vscGitApi.onDidOpenRepository(cb);
  }

  public onDidChangeState(cb: (e: APIState) => any) {
    this._vscGitApi.onDidChangeState(cb);
  }

  public getState(): APIState {
    return this._vscGitApi.state;
  }

  public getWorkspaceMainRepository(): Repository | null {
    const mainRepo = this._vscGitApi.getRepository(
      // @TODO: [roadmap] consider multiple workspaces
      vscode.workspace.workspaceFolders![0].uri
    );
    return mainRepo;
  }

  /*************
   *  Private  *
   *************/

  /**
   * Get file diffs in workspace repositories.
   *
   */
  private async diffToObject(): Promise<RepositoryDiffObject | undefined> {
    const repository = this.getWorkspaceMainRepository();
    if (repository) {
      const result = parseDiff(await repository.diff());
      return {
        diffs: result,
        repository,
      };
    }

    return undefined;
  }

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
        `git -C "${workspacePath}" ls-files -o --exclude-standard`
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
            fullFilePath: string;
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
              const fileLines = fileContent
                .split("\n")
                .map((l) => l.replace(/\r/g, "")); // Remove carriage return character.
              resolve({
                relativeFilePath,
                fileLines,
                fullFilePath: `/${path}`,
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
            fileName: filenameFromPath(relativeFilePath),
            fullFilePath: fileContents.fullFilePath,
            changes: fileLines.map((line, i) => ({
              content: line,
              line: i,
              type: "add",
              isVisible: true,
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
