import * as vscode from "vscode";
import * as fs from "fs";
import { promisify } from "util";
import * as path from "path";

const readFile = promisify(fs.readFile);

async function checkCPPToolsConfig(folder: vscode.Uri): Promise<boolean> {
  const cppConfigFile = await readFile(
    path.join(folder.fsPath, ".vscode", "c_cpp_properties.json"),
    { encoding: "utf8" }
  ).catch(() => undefined);

  const settingsProvider = vscode.workspace
    .getConfiguration("C_Cpp.default", folder)
    .get<string>("configurationProvider");
  const fileProvider: { configurationProvider?: string }[] =
    cppConfigFile !== undefined
      ? <{ configurationProvider?: string }[]>(
          JSON.parse(cppConfigFile).configurations
        )
      : [];

  const fileProviderMissConfig = fileProvider.reduce<boolean>(
    (status, current) => {
      return (
        status ||
        (current.configurationProvider !== undefined &&
          current.configurationProvider !== "go2sh.cmake-integration")
      );
    },
    false
  );
  const settingsProviderMissConfig =
    settingsProvider !== undefined &&
    settingsProvider !== "go2sh.cmake-integration";

  if (fileProviderMissConfig || settingsProviderMissConfig) {
    const items: string[] = ["Don't show again"];
    return (
      (await vscode.window.showWarningMessage(
        `The configuration provider setting in the 'c_cpp_properties.json' ` +
          `file doesn't point to 'go2sh.cmake-integration'. In order to provide ` +
          `accurate results please change the setting.`,
        ...items
      )) === items[0]
    );
  }
  return false;
}

export { checkCPPToolsConfig };
