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
import * as fs from "fs";
import * as path from "path";
import Ajv from "ajv";
import { promisify } from "util";
import { CacheValue } from "./model";
import { default as schema } from "../../schema/cmake_configurations.json";
import { equals } from "../helpers/equals";

const lstat = promisify(fs.lstat);
const open = promisify(fs.open);
const write = promisify(fs.write);
const readFile = promisify(fs.readFile);

/**
 * A configuration for CMake
 */
interface CMakeConfiguration {
  /** Display name */
  name: string;
  /** Description */
  description?: string;
  /** Build type or configuration used in CMake */
  buildType?: string;
  /** Path to the build directory */
  buildDirectory?: string;
  /** Build system to generate */
  generator?: string;
  /** Extra build system to generate */
  extraGenerator: string | undefined;
  /** Path to a toolchain file or a object containing toolchain settings */
  toolchain: string | { readonly [key: string]: string } | undefined;
  /** Additional environment variables */
  env?: { readonly [key: string]: string | undefined };
  /** Cache entries to set */
  cacheEntries?: ReadonlyArray<CacheValue>;
}

class CMakeConfigurationImpl implements CMakeConfiguration {
  name: string;
  description?: string;
  buildType: string;
  buildDirectory: string;
  generator: string;
  extraGenerator: string | undefined;
  toolchain: string | { readonly [key: string]: string } | undefined;
  env: { readonly [key: string]: string | undefined };
  cacheEntries: ReadonlyArray<CacheValue>;

  /**
   * Create a new configuration object
   *
   * @param name Name of the configuration
   * @param options Options to set
   * @param defaults Default values to use if not defined in options
   */
  constructor(
    name: string,
    options: Partial<CMakeConfiguration>,
    defaults: Required<CMakeConfiguration>
  ) {
    let settings: Required<CMakeConfiguration> = { ...options, ...defaults };
    this.name = name;
    this.buildType = settings.buildType;
    this.buildDirectory = settings.buildDirectory;
    this.generator = settings.generator;
    this.extraGenerator = settings.extraGenerator;
    this.toolchain = settings.toolchain;
    this.cacheEntries = settings.cacheEntries;
    this.env = settings.env;
  }

  /**
   * Replace variable references with values
   * @param vars Map with values for variable names
   */
  public resolve(vars: Map<string, string | undefined>) {
    const varPattern = /(?<=(?:^|[^\$]))\${((?:\w+\:)?\w+)}/g;
    const escaptePattern = /\$(\${(?:\w+\:)?\w+})/g;

    vars.set("name", this.name);
    vars.set("generator", this.generator!);
    vars.set("buildType", this.buildType!);

    type ReplaceType<T> = T extends undefined ? string | undefined : string;
    let replaceVariables = <U>(value: ReplaceType<U>): ReplaceType<U> => {
      if (!value) {
        return value;
      }
      let result = value.replace(varPattern, (_: string, ...args: any[]) => {
        return vars.get(args[0]) || "";
      });
      result = result.replace(escaptePattern, (_: string, ...args: any[]) => {
        return args[0];
      });
      return result as ReplaceType<U>;
    };

    let newEnv: { [key: string]: string | undefined } = {};
    for (let key in this.env) {
      let value = replaceVariables<string | undefined>(this.env[key]);
      vars.set("env:" + key, value);
      newEnv[key] = value;
    }

    let newBuildDirectory = replaceVariables(this.buildDirectory);
    if (newBuildDirectory) {
      if (!path.isAbsolute(newBuildDirectory)) {
        newBuildDirectory = path.join(
          vars.get("workspaceFolder")!,
          newBuildDirectory
        );
      }
      newBuildDirectory = path.normalize(newBuildDirectory);
    }

    let newToolchain: CMakeConfiguration["toolchain"] = this.toolchain;
    if (this.toolchain && typeof this.toolchain === "string") {
      newToolchain = replaceVariables(this.toolchain);
    }

    let newCacheEntries: CacheValue[] = [];
    if (this.cacheEntries) {
      for (let cacheEntry of this.cacheEntries) {
        newCacheEntries.push({
          name: cacheEntry.name,
          type: cacheEntry.type,
          value: replaceVariables(cacheEntry.value)
        });
      }
    }

    this.buildDirectory = newBuildDirectory;
    this.toolchain = newToolchain;
    this.env = newEnv;
    this.cacheEntries = newCacheEntries;
  }

  /**
   * Check if the build directory must be regenerated
   * @param config Config to compare against
   */
  mustRegenerateBuildDirectory(config: CMakeConfiguration): boolean {
    return (
      !equals(this.toolchain, config.toolchain) ||
      this.generator !== config.generator ||
      this.buildDirectory !== config.buildDirectory
    );
  }

  /**
   * Check if the build directory must be removed for regeneration
   * @param config Config to check against
   */
  mustRemoveBuildDirectory(config: CMakeConfiguration): boolean {
    return (
      (!equals(this.toolchain, config.toolchain) ||
        this.generator !== config.generator) &&
      this.buildDirectory === config.buildDirectory
    );
  }

  /**
   * Check if configurations are equal
   * @param config Config to compare against
   */
  equals(config: CMakeConfiguration): boolean {
    let basicEqual =
      this.name === config.name &&
      this.buildDirectory === config.buildDirectory &&
      this.buildType === config.buildType &&
      this.generator === config.generator &&
      this.description === config.description;
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
  fileName: string,
  config: CMakeConfiguration
): Promise<void> {
  if (config.toolchain && typeof config.toolchain === "object") {
    let file = await open(fileName, "w");
    for (const key in config.toolchain) {
      await write(
        file,
        "set(" + key + " " + config.toolchain[key] + ")\n",
        undefined,
        "utf-8"
      );
    }
  }
}

const validator = new Ajv();
const schemaValidate: Ajv.ValidateFunction = validator.compile(schema);

class ConfigurationSchemaError extends Error {
  public message: string;
  constructor(errors: Array<Ajv.ErrorObject> | null | undefined) {
    super();
    this.message = errors!
      .map((value) => value.dataPath + ": " + value.message)
      .join(" ");
  }
}

async function loadConfigurations(
  configFile: string
): Promise<CMakeConfiguration[] | undefined> {
  let res = await lstat(configFile).catch(() => undefined);
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
  CMakeConfiguration,
  CMakeConfigurationImpl,
  getDefaultConfigurations,
  buildToolchainFile,
  loadConfigurations
};
