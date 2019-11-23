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
 * Base class for all CMake clients
 */
import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as util from "util";
import * as vscode from "vscode";
import * as kill from "tree-kill";
import { Project, Target, CacheValue, Toolchain } from "./model";
import {
  CMakeConfiguration,
  getDefaultConfigurations,
  loadConfigurations,
  CMakeConfigurationImpl
} from "./config";
import { removeDir, makeRecursivDirectory } from "../helpers/fs";
import {
  ProblemMatcher,
  getProblemMatchers,
  CMakeMatcher
} from "../helpers/problemMatcher";
import { LineTransform } from "../helpers/stream";
import { buildArgs } from "../helpers/config";

const stat = util.promisify(fs.stat);

class ProjectContext {
  currentTargetName: string = "";
}

interface ProjectContextMap {
  [key: string]: ProjectContext;
}

class ClientContext {
  currentProjectName: string = "";
  currentConfiguration: string = "Debug";
  projectContexts: ProjectContextMap = {};
}

abstract class CMakeClient implements vscode.Disposable {
  protected disposables: vscode.Disposable[] = [];
  /**
   * Create a new CMake client in a given source folder
   *
   * @param sourceUri A (uri)[#vscode.Uri] to the source folder
   * @param workspaceFolder A (workspace folder)[vscode.WorkspaceFolder] containing the source
   * @param extensionContext The (extension context)[vscode.extensionContext]
   */
  constructor(
    public readonly sourceUri: vscode.Uri,
    public readonly workspaceFolder: vscode.WorkspaceFolder,
    protected readonly extensionContext: vscode.ExtensionContext
  ) {
    this.sourcePath = this.sourceUri.fsPath
      .replace(/\\/g, "/")
      .replace(/^\w\:\//, (c) => c.toUpperCase());
    this.clientContext = this.extensionContext.workspaceState.get(
      this.name + "-context",
      new ClientContext()
    );
    this.configurationsFile = path.join(
      this.sourceUri.fsPath,
      ".vscode",
      "cmake_configurations.json"
    );

    // Ui elements
    this.console = vscode.window.createOutputChannel(`CMake - ${this.name}`);
    this.diagnostics = vscode.languages.createDiagnosticCollection(
      "cmake-" + this.name
    );
    this.disposables.push(this.console, this.diagnostics);

    // CMake config watcher
    this.configFileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(
        workspaceFolder,
        ".vscode/cmake_configurations.json"
      )
    );
    this.configFileWatcher.onDidChange(() => this.loadConfigurations());
    this.configFileWatcher.onDidCreate(() => this.loadConfigurations());
    this.configFileWatcher.onDidDelete(() => this.loadConfigurations());
    this.disposables.push(this.configFileWatcher);

    // Default config
    this._originalConfig =
      this._configs.find(
        (value) => value.name === this.clientContext.currentConfiguration
      ) || this._configs[0];
    this._config = new CMakeConfigurationImpl(
      this._originalConfig.name,
      this._originalConfig,
      this.defaultConfig
    );
    this._matchers = getProblemMatchers(this.buildDirectory);

    // VSCode config watcher
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        this.vscodeConfigurationChange(e);
      })
    );
  }

  protected sourcePath: string;

  public get name(): string {
    return path.basename(this.sourceUri.path);
  }

  async hasConfigurationsFile() {
    try {
      await stat(this.configurationsFile);
      return true;
    } catch (e) {
      return false;
    }
  }

  /*
   * Model functions
   */

  protected _onModelChange: vscode.EventEmitter<
    CMakeClient
  > = new vscode.EventEmitter();

  /**
   * An [event](#vscode.Event) which fires when the internal model got updated.
   */
  readonly onModelChange: vscode.Event<CMakeClient> = this._onModelChange.event;

  public isModelValid: boolean = false;

  private _project: Project | undefined = undefined;
  private _projectTargets: Map<Project, Target[]> = new Map();
  protected _projects: Project[] = [];

  /**
   * The projects of the CMake client
   */
  public get projects(): ReadonlyArray<Project> {
    return this._projects;
  }

  /**
   * The currently selected project.
   *
   * Note: Changing the project might change the target as well.
   */
  public get project(): Project | undefined {
    return this._project;
  }
  public set project(v: Project | undefined) {
    if (v && this._projectTargets.has(v)) {
      this._project = v;

      this._target =
        this.projectTargets.find(
          (value) => value.name === this.projectContext!.currentTargetName
        ) || this.projectTargets[0];
    } else {
      this._project = undefined;
      this._target = undefined;
    }
    this.updateContext();
  }

  /**
   * The targets of the currently selected project
   */
  public get projectTargets(): Target[] {
    if (this.project) {
      return this.project.targets;
    } else {
      return [];
    }
  }

  protected _targets: Target[] = [];
  private _target: Target | undefined;
  private _targetProject: Map<Target, Project> = new Map();

  /**
   * The targets of the CMake client
   */
  public get targets(): ReadonlyArray<Target> {
    return this._targets;
  }

  /**
   * The currently select target
   *
   * Note: Changing the target might change the project as well.
   */
  public get target(): Target | undefined {
    return this._target;
  }
  public set target(v: Target | undefined) {
    if (v && this._targetProject.has(v)) {
      this._target = v;
      this._project = this._targetProject.get(v)!;
    } else {
      this._target = undefined;
    }
    this.updateContext();
  }

  protected cache: Map<string, CacheValue> = new Map();

  /**
   * Returns a value from the CMake Cache.
   *
   * @param key A CMake Cache property name
   * @returns A [value](#CacheValue) or undefined if not found
   */
  public getCacheValue(key: string): CacheValue | undefined {
    return this.cache.get(key);
  }

  protected _toolchain: Toolchain = new Toolchain();

  public get toolchain(): Toolchain {
    return this._toolchain;
  }

  protected guessToolchain() {
    let stringOrUndefined = (
      cacheKey: string,
      toolchainKey?: string
    ): string | undefined => {
      if (!toolchainKey) {
        toolchainKey = cacheKey;
      }
      const toolchain = this.configuration.toolchain;
      if (typeof toolchain === "object" && toolchain[toolchainKey]) {
        return toolchain[toolchainKey];
      }
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey)!.value;
      }
      return undefined;
    };
    this._toolchain = new Toolchain({
      windowsSdkVersion: stringOrUndefined(
        "CMAKE_VS_WINDOWS_TARGET_PLATFORM_VERSION",
        "CMAKE_SYSTEM_VERSION"
      ),
      cCompiler: stringOrUndefined("CMAKE_C_COMPILER"),
      cppCompiler: stringOrUndefined("CMAKE_CXX_COMPILER")
    });
  }

  /*
   * Configuration
   */

  private configFileWatcher: vscode.FileSystemWatcher;
  private configChangeEvent: vscode.EventEmitter<
    void
  > = new vscode.EventEmitter();
  public onDidChangeConfiguration: vscode.Event<void> = this.configChangeEvent
    .event;
  public readonly configurationsFile: string;
  protected _configs: CMakeConfiguration[] = getDefaultConfigurations();
  private _originalConfig: CMakeConfiguration;
  protected _config: CMakeConfigurationImpl;

  /**
   * Configurations of the client
   */
  public get configurations(): ReadonlyArray<CMakeConfiguration> {
    return this._configs;
  }

  /**
   * The current configuration.
   */
  public get configuration(): Readonly<CMakeConfiguration> {
    return this._config;
  }

  public set configuration(config: Readonly<CMakeConfiguration>) {
    const newConfig = new CMakeConfigurationImpl(
      config.name,
      config,
      this.defaultConfig
    );

    let vars: Map<string, string | undefined> = new Map();
    vars.set("workspaceFolder", this.workspaceFolder.uri.fsPath);
    vars.set("sourceFolder", this.sourceUri.fsPath);
    newConfig.resolve(vars);

    const oldConfig = this._config;
    this._originalConfig = config;
    this._config = newConfig;

    this.handleConfigUpdate(oldConfig, newConfig);
  }

  private async handleConfigUpdate(
    oldConfig: CMakeConfigurationImpl,
    newConfig: CMakeConfigurationImpl
  ) {
    if (!oldConfig.equals(newConfig)) {
      let removeBuildDirectory = newConfig.mustRemoveBuildDirectory(oldConfig);
      let regenerateBuildDirectory = newConfig.mustRegenerateBuildDirectory(
        oldConfig
      );
      if (removeBuildDirectory) {
        await removeDir(oldConfig.buildDirectory);
      }
      if (regenerateBuildDirectory) {
        await this.regenerateBuildDirectory();
      }
      this.updateContext();
      this.configChangeEvent.fire();
    }
  }

  protected get generator(): string {
    return this._config.generator;
  }

  protected get extraGenerator(): string | undefined {
    return this._config.extraGenerator;
  }

  protected get generatorString(): string {
    if (this.extraGenerator) {
      return `${this.extraGenerator} - ${this.generator}`;
    } else {
      return this.generator;
    }
  }

  public get buildDirectory(): string {
    return this._config.buildDirectory;
  }

  public get buildType(): string {
    return this._config.buildType;
  }

  public get toolchainFile(): string | undefined {
    if (
      typeof this.configuration.toolchain === "string" ||
      typeof this.configuration.toolchain === "undefined"
    ) {
      return this.configuration.toolchain;
    } else {
      return path.join(
        this.workspaceFolder.uri.fsPath,
        this.configuration.name.toLowerCase().replace(/[^a-zA-Z0-9]/g, "_") +
          "_toolchain.cmake"
      );
    }
  }

  public get environment(): { readonly [key: string]: string | undefined } {
    return this._config.env!;
  }

  public get cacheEntries(): ReadonlyArray<CacheValue> {
    return this._config.cacheEntries!;
  }

  private get defaultConfig(): Required<CMakeConfiguration> {
    const configSection = vscode.workspace.getConfiguration(
      "cmake",
      this.sourceUri
    );

    const defaultConfig: Required<CMakeConfiguration> = {
      name: "",
      description: "",
      buildType: configSection.get("buildType", "Debug"),
      buildDirectory: configSection.get(
        "buildDirectory",
        "${workspaceFolder}/build/"
      ),
      generator: configSection.get("generator", "Ninja"),
      extraGenerator: configSection.get("extraGenerator"),
      toolchain: undefined,
      env: { ...process.env, ...configSection.get("env") },
      cacheEntries: configSection.get("cacheEntries", [] as CacheValue[])
    };
    return defaultConfig;
  }

  /**
   * Wether this client uses a multi configuration generator.
   * (Visual Studio, Xcode)
   */
  public get isConfigurationGenerator(): boolean {
    return this.generator.match(/^(Xcode|Visual Studio)/) !== null;
  }

  private async vscodeConfigurationChange(
    event: vscode.ConfigurationChangeEvent
  ) {
    if (event.affectsConfiguration("cmake", this.sourceUri)) {
      this.configuration = this._originalConfig;
    }
  }

  /*
   * Workflow functions
   */

  /**
   * Initialize the CMake client. It tries to load the
   * CMakeConfig.json file and parses it. Then a configuration
   * gets selected and the client will be set up arcordingly.
   */
  public async loadConfigurations() {
    let fileConfigs;
    try {
      fileConfigs = await loadConfigurations(this.configurationsFile);
    } catch (e) {
      let item = await vscode.window.showWarningMessage(
        "Failed to validate CMake Configurations for " +
          this.name +
          ": " +
          e.message,
        "Edit Configurations"
      );
      if (item) {
        vscode.window.showTextDocument(
          vscode.Uri.file(this.configurationsFile)
        );
      }
    }

    if (fileConfigs) {
      this._configs = fileConfigs;
    } else {
      this._configs = getDefaultConfigurations();
    }

    this.configuration =
      this._configs.find(
        (value) => value.name === this.clientContext.currentConfiguration
      ) || this._configs[0];
  }

  /**
   * Regenerate the build directory files. After a build
   * directory change, it handles the necessary steps to
   * generate the new build directory.
   */
  abstract regenerateBuildDirectory(): Promise<void>;

  protected _cmakeMatcher = new CMakeMatcher(this.sourcePath);
  private _matchers: ProblemMatcher[];
  private buildProc: child_process.ChildProcess | undefined;

  get cmakeExecutable(): string {
    return vscode.workspace
      .getConfiguration("cmake", this.sourceUri)
      .get("cmakePath", "cmake");
  }

  public getBuildArguments(targets?: string[]): string[] {
    let args: string[] = [];

    args.push("--build", this.buildDirectory);
    if (targets) {
      args.push("--target", ...targets);
    }
    if (this.isConfigurationGenerator) {
      args.push("--config", this.buildType);
    }
    args.push(...buildArgs(this.sourceUri, "buildArguments"));
    return args;
  }
  /**
   * Build a target
   *
   * @param target A target name to build or undefined for all
   */
  async build(targets?: string[]): Promise<void> {
    this.buildProc = child_process.spawn(
      this.cmakeExecutable,
      this.getBuildArguments(targets),
      {
        cwd: this.buildDirectory,
        env: this.environment
      }
    );
    this.buildProc.stdout
      .pipe(new LineTransform())
      .on("data", (chunk: string) => {
        this.console.appendLine(chunk);
        this._matchers.forEach((matcher) => matcher.match(chunk));
      });
    this.buildProc.stderr
      .pipe(new LineTransform())
      .on("data", (chunk: string) => {
        this.console.appendLine(chunk);
        this._matchers.forEach((matcher) => matcher.match(chunk));
      });

    this._matchers.forEach((value) => {
      value.buildPath = this.buildDirectory;
      value.clear();
      value
        .getDiagnostics()
        .forEach((diag) => this.diagnostics.delete(diag[0]));
    });
    this._cmakeMatcher.buildPath = this.sourcePath;
    this._cmakeMatcher
      .getDiagnostics()
      .forEach((uri) => this.diagnostics.delete(uri[0]));
    this._cmakeMatcher.clear();
    this.diagnostics.clear();

    this.mayShowConsole();

    return new Promise((resolve, reject) => {
      let error = false;
      if (!this.buildProc) {
        resolve();
      }
      this.buildProc!.on("error", (err) => {
        error = true;
        reject(err);
      });
      this.buildProc!.on("exit", (_code, signal) => {
        if (signal !== null) {
          reject(`CMake process stopped unexpectedly with ${signal}`);
        }
        this.diagnostics.set(
          this._matchers.reduce(
            (previous, current) => previous.concat(current.getDiagnostics()),
            [] as [vscode.Uri, vscode.Diagnostic[] | undefined][]
          )
        );
        this.diagnostics.set(this._cmakeMatcher.getDiagnostics());
        this.buildProc = undefined;
        if (!error) {
          resolve();
        }
      });
    });
  }

  public stopBuild(): void {
    if (this.buildProc) {
      kill.default(this.buildProc.pid);
      this.buildProc = undefined;
    }
  }

  /**
   * Configure the build system. This function configures and
   * generates the build system. Afterwards, the client is ready
   * to build.
   */
  abstract configure(): Promise<void>;

  /**
   * VSCode connection
   */

  protected console: vscode.OutputChannel;
  protected diagnostics: vscode.DiagnosticCollection;

  protected mayShowConsole() {
    if (
      vscode.workspace
        .getConfiguration("cmake")
        .get("showConsoleAutomatically", true)
    ) {
      this.console.show();
    }
  }

  /*
   * Build directory function
   */

  /** Check if build directory exists
   *
   * @return true if directory exists
   */
  public async hasBuildDirectory(): Promise<boolean> {
    let result = await stat(this.buildDirectory).catch(() => undefined);
    if (result) {
      if (result.isDirectory()) {
        return true;
      } else {
        throw new Error(
          "Build directory (" +
            this.buildDirectory +
            ") exists, but is not a directory."
        );
      }
    }
    return false;
  }

  /**
   * Create the build directory recursivly.
   */
  public async createBuildDirectory() {
    await makeRecursivDirectory(this.buildDirectory);
  }

  /**
   * Remove build directory
   */
  public async removeBuildDirectory() {
    await removeDir(this.buildDirectory);
  }

  /*
   * Context handling
   */
  protected clientContext: ClientContext;

  protected get projectContext(): ProjectContext | undefined {
    if (this.project) {
      let projectContext: ProjectContext;
      if (
        !this.clientContext.projectContexts.hasOwnProperty(this.project.name)
      ) {
        projectContext = new ProjectContext();
        this.clientContext.projectContexts[this.project.name] = projectContext;
      } else {
        projectContext = this.clientContext.projectContexts[this.project.name];
      }
      return projectContext;
    }
    return undefined;
  }

  protected updateContext() {
    if (this.project) {
      this.clientContext.currentProjectName = this.project.name;

      if (this.target) {
        this.projectContext!.currentTargetName = this.target.name;
      }
    }
    this.clientContext.currentConfiguration = this.configuration.name;
    this.extensionContext.workspaceState.update(
      this.name + "-context",
      this.clientContext
    );
  }

  protected selectContext() {
    this._projectTargets.clear();
    this._targetProject.clear();
    this._targets = [];

    this._projects.forEach((project) => {
      this._targets.splice(this._targets.length, 0, ...project.targets);
      this._projectTargets.set(project, project.targets);
      project.targets.forEach((target) =>
        this._targetProject.set(target, project)
      );
    });

    if (this._projects.length > 0) {
      this._project =
        this._projects.find(
          (value) => value.name === this.clientContext.currentProjectName
        ) || this._projects[0];
      this.clientContext.currentProjectName = this._project.name;

      let context = this.projectContext!;
      let targets = this.projectTargets;
      if (targets && targets.length > 0) {
        let target =
          targets.find((value) => context.currentTargetName === value.name) ||
          targets[0];
        this._target = target;
        context.currentTargetName = target.name;
      } else {
        this._target = undefined;
      }
      this.updateContext();
    } else {
      this._project = undefined;
      this._target = undefined;
    }
  }

  public dispose() {
    this.disposables.forEach((disposable) => disposable.dispose());
  }
}

export { CMakeClient };
