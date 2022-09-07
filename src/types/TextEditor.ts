import { FilenameLineHashMap } from "./TextFiles";

export type TextEditorPosition = {
  content: string;
  posStart: number;
  posEnd: number;
};

export type FilenameLineTextEditorPositionHashMap = FilenameLineHashMap<
  TextEditorPosition[]
>;
