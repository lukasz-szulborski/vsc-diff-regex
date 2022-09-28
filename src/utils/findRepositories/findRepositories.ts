import * as vscode from "vscode";
import { API as GitAPI } from "../../../declarations/git";
import { FilePathRepoHashMap } from "../../types";
import { matchFiles } from "../matchFiles";

export const findRepositories = async (
  root: vscode.Uri,
  gitApi: GitAPI,
  ignoredDirectories?: string[]
): Promise<FilePathRepoHashMap> => {
  vscode.workspace.fs.readDirectory(root);
  const gitRepositoryDirectories = await matchFiles(
    root,
    ([_, filePath]) => gitApi.getRepository(filePath) !== null,
    ([filename]) =>
      ignoredDirectories === undefined || !ignoredDirectories.includes(filename)
  );
  return gitRepositoryDirectories.reduce<FilePathRepoHashMap>((acc, x) => {
    return {
      ...acc,
      [x.path]: gitApi.getRepository(x)!,
    };
  }, {});
};
