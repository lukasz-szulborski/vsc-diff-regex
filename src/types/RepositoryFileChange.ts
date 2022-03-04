type FileChangeType = "normal" | "add" | "del";

export type FileChange = {
  line: number;
  content: string;
  type: FileChangeType;
};

export type RepositoryFileChange = {
  filePath: string;
  changes: FileChange[];
};
