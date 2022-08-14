import * as parseDiff from "parse-diff";

import { Repository } from "../../declarations/git";
import { Filename } from "./Filename";

type LineChangeType = "normal" | "add" | "del";

export type LineChange = {
  line: number;
  content: string;
  type: LineChangeType;
  isVisible: boolean;
};

export type RepositoryFileChange = {
  fullFilePath: string;
  filePath: string;
  fileName: Filename;
  changes: LineChange[];
};

export interface RepositoryDiffObject {
  diffs: parseDiff.File[];
  repository: Repository;
}
