import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as ajv from 'ajv';
import { promisify } from 'util';

const lstat = promisify(fs.lstat);
const open = promisify(fs.open);
const write = promisify(fs.write);
const readFile = promisify(fs.readFile);

interface CMakeConfiguration {
  name: string;
  description?: string;
  buildType?: string;
  buildDirectory?: string;
  generator?: string;
  toolchain?: string | { [key: string]: string };
  env?: { [key: string]: string };
  variables?: { [key: string]: string };
}

function getDefaultConfigurations(): CMakeConfiguration[] {
  return ["Debug", "Release", "RelWithDebInfo", "MinSizeRel"].map((config) => {
    return {
      name: config,
      buildType: config
    } as CMakeConfiguration;
  });
}

async function buildToolchainFile(
  workspaceFolder: vscode.WorkspaceFolder,
  config: CMakeConfiguration
): Promise<string | undefined> {
  if (!config.toolchain) {
    return undefined;
  } else if (typeof (config.toolchain) === "string") {
    return config.toolchain;
  } else {
    let fileName = path.join(
      workspaceFolder.uri.fsPath,
      config.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_") + "_toolchain.cmake"
    );
    let file = await open(fileName, "w");
    for (const key in config.toolchain) {
      await write(file, "set(" + key + " " + config.toolchain[key] + ")\n", undefined, "utf-8");
    }
    return fileName;
  }
}

async function loadConfigurations(configFile: string, schemaFile: string): Promise<CMakeConfiguration[]> {
  let res = await lstat(configFile).catch((e) => undefined);
  if (!res) {
    return getDefaultConfigurations();
  } else if (!res.isFile) {
    throw Error("Config " + configFile + " needs to be a file.");
  }

  let schema = JSON.parse(await readFile(schemaFile, { encoding: "utf-8" }));
  let configs = JSON.parse(await readFile(configFile, { encoding: "utf-8" }));

  let validator = new ajv();
  let validate = validator.compile(schema);

  if (!validate(configs)) {
    throw Error("Invalid config file: " + configFile + "\n" + validate.errors);
  }

  return configs.configurations as CMakeConfiguration[];
}

export { CMakeConfiguration, getDefaultConfigurations, buildToolchainFile, loadConfigurations };