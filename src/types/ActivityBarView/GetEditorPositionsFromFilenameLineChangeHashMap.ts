import { FilenameLineChangesHashMap } from "../RepositoryFileChange";

interface OnLineChangeEncounteredContext {
  fileName: string;
  line: number;
  didMatch: boolean;
}

type OnLineChangeEncountered = (ctx: OnLineChangeEncounteredContext) => void;

export interface GetEditorPositionsFromFilenameLineChangeHashMapParams {
  changesHashMap: FilenameLineChangesHashMap;
  searchedTerm: RegExp;
  onLineChangeEncountered?: OnLineChangeEncountered;
}
