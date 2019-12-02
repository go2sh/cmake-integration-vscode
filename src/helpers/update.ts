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
    if (oldMinor <= "3") {
      const actions = ["Edit Configurations", "Documentation", "Changelog"];
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
        env.openExternal(
          Uri.parse("https://go2sh.github.io/cmake-integration-vscode/")
        );
      }
      if (result === actions[2]) {
        env.openExternal(
          Uri.parse(
            "https://github.com/go2sh/cmake-integration-vscode/blob/master/CHANGELOG.md"
          )
        );
      }
    }
    if (oldMinor <= "6") {
      const actions = ["Edit Settings", "Documentation", "Changelog"];
      let result = await window.showInformationMessage(
        `CMake Integration for VS Code has been updated to ${version}. ` +
          `Some settings keys have been placed into new subkeys. ` +
          `Please check your settings files for any mismatches.`,
        ...actions
      );
      if (result === actions[0]) {
        commands.executeCommand("workbench.action.openSettings");
      }
      if (result === actions[1]) {
        env.openExternal(
          Uri.parse(
            "https://go2sh.github.io/cmake-integration-vscode/reference/settings.html#configuration-defaults"
          )
        );
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

async function firstStart(version: string) {
  const actions = ["Edit Settings", "Edit Configurations", "Documentation"];
  let result = await window.showInformationMessage(
    `Welcome to CMake Integration for VS Code version ${version}. ` +
      `Set your desired build environment in the settings, ` +
      `edit your build configurations and you are ready to go!`,
    ...actions
  );
  if (result === actions[0]) {
    commands.executeCommand("workbench.action.openSettings");
  }
  if (result === actions[1]) {
    commands.executeCommand("cmake.editConfiguration");
  }
  if (result === actions[2]) {
    env.openExternal(
      Uri.parse("https://go2sh.github.io/cmake-integration-vscode/")
    );
  }
}

export { checkForUpdate, firstStart };
