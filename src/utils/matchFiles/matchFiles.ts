import * as vscode from "vscode";

type Filename = string;
type ContextFile = readonly [Filename, vscode.Uri, vscode.FileType];
type FutureUri = Promise<vscode.Uri[]>;

/**
 * Starting from root Uri (which should be a directory) and traversing down the
 * directory tree return such Uris sequence that every file identified by this
 * sequence's uri passes given predicate and qualification function.
 *
 * Furthermore the function stops directory traversal on a given node when that node
 * passes a predicate.
 */
export const matchFiles = async (
  root: vscode.Uri,
  predicate: (file: ContextFile) => Boolean,
  qualify?: (file: ContextFile) => Boolean
): FutureUri => {
  const go = async (root: vscode.Uri): Promise<FutureUri> => {
    const files = await vscode.workspace.fs.readDirectory(root);
    const results = await Promise.all<FutureUri>(
      files.map(
        async ([filename, fileType]) =>
          new Promise((resolve) => {
            const fileUri = vscode.Uri.from({
              scheme: "file",
              path: `${root.path}/${filename}`,
            });
            const fileWithFullPath: ContextFile = [
              filename,
              fileUri,
              fileType,
            ] as const;

            if (qualify === undefined || qualify(fileWithFullPath)) {
              if (predicate(fileWithFullPath)) {
                resolve([fileUri]);
                return;
              }

              // If it is not a directory then there is no way to go deeper.
              if (fileType !== vscode.FileType.Directory) {
                resolve([]);
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
