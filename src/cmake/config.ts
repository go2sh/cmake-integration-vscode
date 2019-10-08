/*
 * Copyright 2019 Christoph Seitz
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/
/*
 * CMake configuration handling
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import Ajv from 'ajv';
import { promisify } from 'util';
import { CacheValue } from './model';
import { default as schema } from '../../schema/cmake_configurations.json';
import { equals } from '../helpers/equals';

const lstat = promisify(fs.lstat);
const open = promisify(fs.open);
const write = promisify(fs.write);
const readFile = promisify(fs.readFile);

class CMakeConfiguration {

  readonly name: string;
  readonly description?: string;
  readonly buildType?: string;
  readonly buildDirectory?: string;
  readonly generator?: string;
  readonly toolchain?: string | { readonly [key: string]: string };
  readonly env?: { readonly [key: string]: string | undefined };
  readonly cacheEntries?: ReadonlyArray<CacheValue>;

  constructor(name: string, options?: Partial<CMakeConfiguration>, defaults?: Partial<CMakeConfiguration>) {
    this.name = name;
    if (options) {
      this.description = options.description;
      this.buildType = options.buildType;
      this.buildDirectory = options.buildDirectory;
      this.generator = options.generator;
      this.toolchain = options.toolchain;
      this.env = options.env;
      this.cacheEntries = options.cacheEntries;
    }
    if (defaults) {
      this.description = this.description || defaults.description;
      this.buildType = this.buildType || defaults.buildType;
      this.buildDirectory = this.buildDirectory || defaults.buildDirectory;
      this.generator = this.generator || defaults.generator;
      this.toolchain = this.toolchain || defaults.toolchain;
      this.env = this.env || defaults.env;
      this.cacheEntries = this.cacheEntries || defaults.cacheEntries;
    }
  }

  public createResolved(vars: Map<string, string | undefined>): CMakeConfiguration {
    const varPattern = /(?<=(?:^|[^\$]))\${((?:\w+\:)?\w+)}/g;
    const escaptePattern = /\$(\${(?:\w+\:)?\w+})/g;

    vars.set("name", this.name);
    vars.set("generator", this.generator!);
    vars.set("buildType", this.buildType!);

    let replaceVariables = (value: string | undefined): string | undefined => {
      if (!value) {
        return value;
      }
      value = value.replace(
        varPattern,
        (substring: string, ...args: any[]) => {
          return vars.get(args[0]) || "";
        }
      );
      value = value.replace(escaptePattern, (substring: string, ...args: any[]) => {
        return args[0];
      });
      return value;
    }

    let newBuildDirectory = replaceVariables(this.buildDirectory)!;
    if (!path.isAbsolute(newBuildDirectory)) {
      newBuildDirectory = path.join(vars.get("workspaceFolder")!, newBuildDirectory);
    }

    let newToolchain: CMakeConfiguration["toolchain"] = this.toolchain;
    if (this.toolchain && typeof this.toolchain === "string") {
      newToolchain = replaceVariables(this.toolchain);
    }

    let newEnv: { [key: string]: string | undefined } = {};
    for (let key in this.env) {
      let value = replaceVariables(this.env[key]);
      vars.set("env:" + key, value);
      newEnv[key] = value;
    }

    let newCacheEntries: CacheValue[] = [];
    if (this.cacheEntries) {
      for (let cacheEntry of this.cacheEntries) {
        newCacheEntries.push({ name: cacheEntry.name, type: cacheEntry.type, value: replaceVariables(cacheEntry.value) || "" });
      }
    }

    return new CMakeConfiguration(this.name, {
      description: this.description,
      buildType: this.buildType,
      buildDirectory: newBuildDirectory,
      generator: this.generator,
      toolchain: newToolchain,
      env: newEnv,
      cacheEntries: newCacheEntries
    });
  }
  mustRegenerateBuildDirectory(config: CMakeConfiguration): boolean {
    return !equals(this.toolchain, config.toolchain) || this.generator !== config.generator || this.buildDirectory !== config.buildDirectory;
  }

  mustRemoveBuildDirectory(config: CMakeConfiguration): boolean {
    return (!equals(this.toolchain, config.toolchain) || this.generator !== config.generator) && this.buildDirectory === config.buildDirectory;
  }

  equals(config: CMakeConfiguration): boolean {
    let basicEqual = this.name === config.name
      && this.buildDirectory === config.buildDirectory
      && this.buildType === config.buildType
      && this.generator === config.generator
      && this.description === config.description;
    if (!basicEqual) {
      return false;
    }
    if (!equals(this.toolchain, config.toolchain)) {
      return false;
    }
    if (!equals(this.env, config.env)) {
      return false;
    }
    if (!equals(this.cacheEntries, config.cacheEntries)) {
      return false;
    }
    return true;
  }
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