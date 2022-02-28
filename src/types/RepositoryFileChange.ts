type FileChangeType = "normal" | "add" | "del";

export type RepositoryFileChange = {
  filePath: string;
  changes: {
    line: number;
    content: string;
    type: FileChangeType;
  }[];
};
