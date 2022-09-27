import * as vscode from "vscode";
import { API as GitAPI, Repository } from "../../../declarations/git";

export const findRepositories = (
  root: vscode.Uri,
  gitApi: GitAPI
): Record<string, Repository> => {
  vscode.workspace.fs.readDirectory(root);
  traverseDirectoryTree(
    root,
    ({ file: [filePath, fileType] }) => {
      const repo = gitApi.getRepository(filePath); // To nie powinna byc czesc predykatu o przechodzeniu tylko czesc predykatu o reduktorze
      return repo !== null;
    },
    ({ file: [_, fileType] }) => fileType === vscode.FileType.Directory
  );
  return {};
};

const traverseDirectoryTree = async (
  root: vscode.Uri,
  p: (ctx: { file: readonly [vscode.Uri, vscode.FileType] }) => Boolean,
  shouldTakeIntoAccount?: (ctx: {
    file: readonly [vscode.Uri, vscode.FileType];
  }) => Boolean
) => {
  console.log({ root });
  const go = async (
    root: vscode.Uri,
    acc: vscode.Uri[]
  ): Promise<vscode.Uri[]> => {
    const files = await vscode.workspace.fs.readDirectory(root);
    let validUrls: vscode.Uri[] = [];

    await Promise.all(
      files.map(
        async (file) =>
          new Promise((resolve, reject) => {
            // console.log(`${root.path}/${file[0]}`)
            const fileUri = vscode.Uri.from({
              scheme: "file",
              path: `${root.path}/${file[0]}`,
            });
            // console.log({fileUri})
            const currentFullFile = [fileUri, file[1]] as const;

            if (
              shouldTakeIntoAccount === undefined ||
              shouldTakeIntoAccount({ file: currentFullFile }) === true
            ) {
              // kolekcjonuj czy ten wchodzi do akumulatora, rob mnowy akumulator z tym jezelei tak.
              if (p({ file: currentFullFile }) === true) {
                // console.log('jest repem :#')
                // @TODO: this shoudln be mutable
                validUrls = [...validUrls, fileUri];
              }

              // przekaz do kolejnega calla obecna acc (pusta tablica) i czekaj na zwrocenie acc.
              const nextAcc = go(fileUri, acc).then((nextAcc) => {
                // polącz z acc

                validUrls = [...validUrls, ...nextAcc];
                // nic nie rob wiecej
              });
            }
            resolve(true);
          })
      )
    );

    // akumulator obecny i nizsze polaczone - zwroc
    return validUrls;
  };
  const res = await go(root, []);
  // console.log({ res });
};
