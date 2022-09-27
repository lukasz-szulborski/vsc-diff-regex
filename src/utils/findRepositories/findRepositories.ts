import * as vscode from "vscode";
import { API as GitAPI, Repository } from "../../../declarations/git";
import { matchFiles } from "../matchFiles";

export const findRepositories = async (
  root: vscode.Uri,
  gitApi: GitAPI,
  ignoredDirectories?: string[]
): Promise<Record<string, Repository>> => {
  vscode.workspace.fs.readDirectory(root);
  const gitRepositoryDirectories = await matchFiles(
    root,
    ([_, filePath]) => gitApi.getRepository(filePath) !== null,
    ([filename]) =>
      ignoredDirectories === undefined || !ignoredDirectories.includes(filename)
  );
  return gitRepositoryDirectories.reduce<Record<string, Repository>>(
    (acc, x) => {
      return {
        ...acc,
        [x.path]: gitApi.getRepository(x)!,
      };
    },
    {}
  );
};
