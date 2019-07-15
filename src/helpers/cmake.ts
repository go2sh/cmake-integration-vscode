import * as child_process from "child_process";
import * as util from "util";
import * as vscode from "vscode";

const exec = util.promisify(child_process.exec);

const versionRegex = /^cmake version (\d+\.\d+\.\d+)/;

export async function getCMakeVersion(): Promise<string> {
  let result = await exec(
    vscode.workspace
      .getConfiguration("cmake")
      .get<string>("cmakePath", "cmake") + " --version"
  );

  let versionMatch = result.stdout.match(versionRegex);
  if (versionMatch === null) {
    throw Error("Version string not found in output.");
  }
  return versionMatch[1];
}
