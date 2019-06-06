import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import { promisify } from 'util';
import { CacheValue } from './model';

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
  cacheEntries?: CacheValue[];
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

import { default as schema } from '../../schema/cmake_configurations.json';

const validator = new Ajv();
const schemaValidate: Ajv.ValidateFunction = validator.compile(schema);

class ConfigurationSchemaError extends Error {
  public message: string;
  constructor(errors: Array<Ajv.ErrorObject> | null | undefined) {
    super();
    this.message = errors!.map((value) => value.dataPath + ": " + value.message).join(" ");
  }
}

async function loadConfigurations(configFile: string): Promise<CMakeConfiguration[] | undefined> {
  let res = await lstat(configFile).catch((e) => undefined);
  if (!res || !res.isFile) {
    return undefined;
  }

  let configs = JSON.parse(await readFile(configFile, { encoding: "utf-8" }));
  const valid = schemaValidate(configs);
  if (!valid) {
    throw new ConfigurationSchemaError(schemaValidate.errors);
  }

  return configs.configurations as CMakeConfiguration[];
}

export {
  CMakeConfiguration, getDefaultConfigurations, buildToolchainFile,
  loadConfigurations
};