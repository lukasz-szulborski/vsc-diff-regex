import { FilenameLineHashMap } from "./TextFiles";

export type TextEditorInlinePosition = {
  content: string;
  posStart: number;
  posEnd: number;
};

export type FilesPositionsHashMap = FilenameLineHashMap<
  TextEditorInlinePosition[]
>;
