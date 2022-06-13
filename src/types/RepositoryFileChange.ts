import * as parseDiff from "parse-diff";

import { Repository } from "../../declarations/git";
import { Filename } from "./Filename";

type FileChangeType = "normal" | "add" | "del";

export type FileChange = {
  line: number;
  content: string;
  type: FileChangeType;
};

export type RepositoryFileChange = {
  fullFilePath: string;
  filePath: string;
  fileName: Filename;
  changes: FileChange[];
};

export interface RepositoryDiffObject {
  diffs: parseDiff.File[];
  repository: Repository;
}
