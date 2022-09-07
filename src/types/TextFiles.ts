// Maps T to filename and file line.
export type FilenameLineHashMap<T> = Record<string, Record<number, T>>;