import { Filename } from "../../types";

/**
 * Get filename and it's extension from full file path.
 */
export const filenameFromPath = (path: string): Filename => {
  // split by front/back slash.
  const pathParts = path.split(/[\/\\]/g);

  // Get last element, split by a dot.
  const fileName = pathParts[pathParts.length - 1];
  const fileNameSplitted = fileName.split(".");
  const numOfFilenameElements = fileNameSplitted.length;

  // Return name and extension.
  if (numOfFilenameElements === 1) {
    return {
      name: fileNameSplitted[0],
      extension: null,
    };
  } else {
    return {
      name: fileNameSplitted.slice(0, numOfFilenameElements - 1).join("."),
      extension: fileNameSplitted[numOfFilenameElements - 1],
    };
  }
};
