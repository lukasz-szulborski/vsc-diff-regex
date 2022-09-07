import { FilenameLineHashMap } from "./TextFiles";

type edit_operation = "Insert" | "Delete";

export type EditScriptOperation = {
  pos_start: number;
  pos_end: number;
  operation_type: edit_operation;
  content: string;
};

export type EditScriptRecovery = {
  operations: EditScriptOperation[];
  is_invalid_path: boolean;
};

export type CordsDiff = {
  x_delta: number;
  y_delta: number;
};
