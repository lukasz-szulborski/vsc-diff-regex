import * as cp from "child_process";

/**
 * Run command on a child process.
 */
export const asyncExec = (command: string): Promise<string> => {
  return new Promise<string>((resolve, reject) => {
    cp.exec(command.trim(), (error, stdout) => {
      if (error) {
        reject(error);
      }
      resolve(stdout);
    });
  });
};
