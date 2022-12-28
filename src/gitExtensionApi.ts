import * as vscode from "vscode";
import * as parseDiff from "parse-diff";
import * as path from "path";

import { API as GitAPI, APIState, GitExtension } from "../declarations/git";
import {
  FilePathRepoHashMap,
  RepositoryDiffObject,
  RepositoryFileChange,
} from "./types";
import { asyncExec, filenameFromPath, findRepositories } from "./utils";

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
  private _vscGitApi!: GitAPI;
  private static _instance: GitApi;

  constructor() {
    try {
      const gitExtension =
        vscode.extensions.getExtension<GitExtension>("vscode.git");
      if (gitExtension == undefined) {
        throw new Error();
      }
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
      if (!this._vscExtension.isActive) {
        await this._vscExtension.activate();
      }
      this._vscGitExtension = this._vscExtension.exports;
      this._vscGitApi = this._vscGitExtension.getAPI(1);
      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  public async parseDiffs(
    config?: RemodelParsedDiffConfig
  ): Promise<Record<string, RepositoryFileChange[]>> {
    const getConfigurationProperty = (
      key: keyof RemodelParsedDiffConfig,
      config?: RemodelParsedDiffConfig
    ): boolean => {
      const configExists = config !== undefined;

      return (
        !configExists ||
        (configExists && (config[key] === undefined || config[key] === true))
      );
    };

    const includeUntracked = getConfigurationProperty(
      "includeUntracked",
      config
    );
    const cleanAddChange = getConfigurationProperty("cleanAddChange", config);
    const cleanDelChange = getConfigurationProperty("cleanDelChange", config);

    const parsedDiffs = await this.diffsToObject();

    const changesInRepositories = await Promise.all<
      Record<string, RepositoryFileChange[]>
    >(
      Object.entries(parsedDiffs)
        .map(([path]) => path)
        .map(
          (repoPath) =>
            new Promise(async (resolve) => {
              const parsedDiff = parsedDiffs[repoPath];
              const results: RepositoryFileChange[] = [];

              // Include changes from `git diff`
              if (parsedDiff) {
                parsedDiff.diffs.forEach((file) => {
                  const parsedChangedFile: RepositoryFileChange = {
                    changes: file.chunks.flatMap((chunk) => {
                      return chunk.changes
                        .filter(
                          (change) =>
                            change.content !== `\\ No newline at end of file`
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
                    fullFilePath: `${
                      parsedDiff.repository.rootUri.path
                    }/${file.from!}`,
                  };
                  results.push(parsedChangedFile);
                });
              }

              // Also include untracked files (included by default)
              if (includeUntracked) {
                const untrackedChanges: RepositoryFileChange[] =
                  await this.parseUntrackedFilesInWorkspace(repoPath);
                results.push(...untrackedChanges);
              }

              resolve({
                [repoPath]: results,
              });
            })
        )
    );
    return changesInRepositories.reduce((acc, x) => ({ ...acc, ...x }), {});
  }

  public onDidChangeState(cb: (e: APIState) => any) {
    this._vscGitApi.onDidChangeState(cb);
  }

  public get getState(): APIState {
    return this._vscGitApi.state;
  }

  public async getWorkspaceRepositories(): Promise<FilePathRepoHashMap> {
    const rootUri = vscode.workspace.workspaceFolders![0].uri;
    const rootRepo = this._vscGitApi.getRepository(rootUri);
    if (rootRepo !== null) {
      return {
        [rootUri.path]: rootRepo,
      };
    }
    return await findRepositories(rootUri, this._vscGitApi, ["node_modules"]);
  }

  /*************
   *  Private  *
   *************/

  /**
   * Get file diffs in workspace repositories.
   */
  // working
  private async diffsToObject(): Promise<Record<string, RepositoryDiffObject>> {
    const repositories = await this.getWorkspaceRepositories();
    const result = await Promise.all<Record<string, RepositoryDiffObject>>(
      Object.keys(repositories).map(
        (repoPath) =>
          new Promise(async (resolve) => {
            const repository = repositories[repoPath];
            const result = parseDiff(await repository.diff());
            resolve({
              [repoPath]: {
                diffs: result,
                repository,
              },
            });
          })
      )
    );
    return result.reduce((acc, x) => ({ ...acc, ...x }), {});
  }

  private async parseUntrackedFilesInWorkspace(
    directoryPath: string
  ): Promise<RepositoryFileChange[]> {
    try {
      const result: RepositoryFileChange[] = [];

      const cleanedDirectoryPath = directoryPath.replace(/^\//g, "");

      // Exec command.
      const commandResult: string = await asyncExec(
        `git -C "${cleanedDirectoryPath}" ls-files -o --exclude-standard`
      );

      // Get untracked files paths from command result string.
      const filePaths: string[] = commandResult
        .trim()
        .split("\n")
        .map((filename) =>
          path.join(cleanedDirectoryPath, filename).replace(/\\/g, "/")
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
          .replace(cleanedDirectoryPath, "")
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
