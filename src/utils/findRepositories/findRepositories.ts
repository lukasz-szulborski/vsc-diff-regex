import * as vscode from "vscode";
import { API as GitAPI, Repository } from "../../../declarations/git";

export const findRepositories = async (
  root: vscode.Uri,
  gitApi: GitAPI,
  ignoredDirectories?: string[]
): Promise<Record<string, Repository>> => {
  vscode.workspace.fs.readDirectory(root);
  const gitRepositoryDirectories = await matchFiles(
    root,
    ([_, filePath]) => gitApi.getRepository(filePath) !== null,
    ([filename, __, fileType]) =>
      fileType === vscode.FileType.Directory &&
      (ignoredDirectories === undefined ||
        !ignoredDirectories.includes(filename))
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

const matchFiles = async (
  root: vscode.Uri,
  predicate: (file: readonly [string, vscode.Uri, vscode.FileType]) => Boolean,
  shouldConsider?: (
    file: readonly [string, vscode.Uri, vscode.FileType]
  ) => Boolean
): Promise<vscode.Uri[]> => {
  const go = async (root: vscode.Uri): Promise<vscode.Uri[]> => {
    const files = await vscode.workspace.fs.readDirectory(root);
    const results = await Promise.all<Promise<vscode.Uri[]>>(
      files.map(
        async (file) =>
          new Promise((resolve) => {
            const fileUri = vscode.Uri.from({
              scheme: "file",
              path: `${root.path}/${file[0]}`,
            });
            const fileWithFullPath = [file[0], fileUri, file[1]] as const;

            if (
              shouldConsider === undefined ||
              shouldConsider(fileWithFullPath)
            ) {
              if (predicate(fileWithFullPath)) {
                resolve([fileUri]);
                return;
              }

              go(fileUri).then(resolve);
            }

            resolve([]);
          })
      )
    );

    return results.flat();
  };
  return await go(root);
};
