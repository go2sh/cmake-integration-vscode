import * as vscode from "vscode";

const argsRegex = /(".*?"|\S+)/g;

export function buildArgs(uri: vscode.Uri, section: string): string[] {
  let args: string[] = [];
  let matches = vscode.workspace
    .getConfiguration("cmake", uri)
    .get<string>(section, "")
    .match(argsRegex);
    
  if (matches) {
    for (const match of matches) {
      args.push(match);
    }
  }

  return args;
}
