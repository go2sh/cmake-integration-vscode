import { window, env, Uri, commands } from "vscode";

async function checkForUpdate(version: string, oldVersion: string) {
  const [major, minor] = version.split(".");
  const [oldMajor, oldMinor] = oldVersion.split(".");

  // Nothing to do on downgrade
  if (major < oldMajor || minor < oldMinor) {
    return;
  }

  // Major update, pr
  if (major > oldMajor) {
    const actions = ["Changelog"];
    let result = await window.showInformationMessage(
      `CMake Integration for VS Code has been updated to ${version}.`,
      ...actions
    );
    if (result === actions[0]) {
      env.openExternal(
        Uri.parse(
          "https://github.com/go2sh/cmake-integration-vscode/blob/master/CHANGELOG.md"
        )
      );
    }
    return;
  }

  // Dev updates
  if (oldMajor === "0") {
    if (oldMinor === "3") {
      const actions = [
        "Edit Configurations",
        "Documentation",
        "Changelog"
      ];
      let result = await window.showInformationMessage(
        `CMake Integration for VS Code has been updated to ${version}. ` + 
        `The configuration through settings has changed to a custom ` +
        `configuration file called "cmake_configurations.json"`,
        ...actions
      );
      if (result === actions[0]) {
        commands.executeCommand("cmake.editConfiguration");
      }
      if (result === actions[1]) {
        env.openExternal(Uri.parse("https://go2sh.github.io/cmake-integration-vscode/"));
      }
      if (result === actions[2]) {
        env.openExternal(
          Uri.parse(
            "https://github.com/go2sh/cmake-integration-vscode/blob/master/CHANGELOG.md"
          )
        );
      }
    }
  }
}

export { checkForUpdate };
