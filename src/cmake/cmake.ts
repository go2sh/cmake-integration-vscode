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
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';
import { Project, Target, CacheValue } from './model';
import { CMakeConfiguration, getDefaultConfigurations, buildToolchainFile, loadConfigurations } from './config';
import { removeDir, makeRecursivDirectory } from '../helpers/fs';
import { ProblemMatcher, getProblemMatchers, CMakeMatcher } from '../helpers/problemMatcher';
import { LineTransform } from '../helpers/stream';

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

abstract class CMake implements vscode.Disposable {

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
    this.sourcePath = this.sourceUri.fsPath.replace(/\\/g, "/").replace(/^\w\:\//, (c) => c.toUpperCase());

    this.console = vscode.window.createOutputChannel(this.name);
    this.diagnostics = vscode.languages.createDiagnosticCollection("cmake-" + this.name);

    this.clientContext = this.extensionContext.workspaceState.get(this.name + "-context", new ClientContext());

    this.configFileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolder, ".vscode/cmake_configurations.json")
    );
    this.configFileWatcher.onDidChange(
      (e) => this.loadConfigurations()
    );
    this.configFileWatcher.onDidCreate((e) => this.loadConfigurations());
    this.configFileWatcher.onDidDelete((e) => this.loadConfigurations());
    this.configurationsFile = path.join(
      this.sourceUri.fsPath, ".vscode", "cmake_configurations.json"
    );
  }

  protected sourcePath: string;

  public get name(): string {
    return path.basename(this.sourceUri.path);
  }

  /*
   * Model functions
   */

  protected _onModelChange: vscode.EventEmitter<CMake> = new vscode.EventEmitter();

  /**
   * An [event](#vscode.Event) which fires when the internal model got updated.
   */
  readonly onModelChange: vscode.Event<CMake> = this._onModelChange.event;

  public isModelValid: boolean = false;

  private _project: Project | undefined = undefined;
  private _projectTargets: Map<Project, Target[]> = new Map();
  protected _projects: Project[] = [];

  /**
   * The projects of the CMake client
   */
  public get projects(): Project[] {
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

      this._target = this.projectTargets.find(
        (value) =>
          value.name === this.projectContext!.currentTargetName
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
  public get targets(): Target[] {
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

  /*
   * Configuration
   */

  private configFileWatcher: vscode.FileSystemWatcher;
  private configChangeEvent: vscode.EventEmitter<void> = new vscode.EventEmitter();
  public onDidChangeConfiguration: vscode.Event<void> = this.configChangeEvent.event;
  public readonly configurationsFile: string;
  protected _configs: CMakeConfiguration[] = getDefaultConfigurations();
  protected _config: CMakeConfiguration = this._configs[0];

  /**
   * Configurations of the client
   */
  public get configurations(): CMakeConfiguration[] {
    return this._configs;
  }

  /**
   * The current configuration.
   *
   * Note: Use [updateConfiguration](#updateConfiguration) for setting a
   * new configuration.
   *
   * @see updateConfiguration
   */
  public get configuration(): CMakeConfiguration {
    return this._config;
  }

  protected generator: string = "";
  protected buildDirectory: string = "";
  protected buildType: string = "";
  protected toolchainFile: string | undefined;
  protected environment: { [key: string]: string | undefined } = {};
  protected variables: { [key: string]: string | undefined } = {};

  /**
   * Update the client to a new configuration
   *
   * @param config The configuration to use
   */
  public async updateConfiguration(config: CMakeConfiguration): Promise<void> {
    let vars = this.setupVariables(config);

    /* Load new config values */
    let nextGenerator = config.generator ||
      vscode.workspace.getConfiguration("cmake", this.sourceUri).get("generator", "Ninja");
    let nextBuildDirectory = config.buildDirectory ||
      vscode.workspace.getConfiguration("cmake", this.sourceUri).get(
        "buildDirectory",
        "${workspaceFolder}/build/");
    let nextBuildType = config.buildType ||
      vscode.workspace.getConfiguration("cmake", this.sourceUri).get("buildType", "Debug");
    let nextToolchainFile =
      await buildToolchainFile(this.workspaceFolder, config);

    /* Resolve build directory */
    nextBuildDirectory = nextBuildDirectory.replace(
      /\${((?:\w+\.)?\w+)}/g,
      (substring: string, ...args: any[]) => {
        return vars.get(args[0]) || "";
      }
    );
    if (!path.isAbsolute(nextBuildDirectory)) {
      nextBuildDirectory = path.join(this.sourceUri.fsPath, nextBuildDirectory);
    }

    /* Check if build directory needs to be removed */
    let buildDirectoryDiff = this.buildDirectory !== nextBuildDirectory;
    let generatorDiff = this.generator !== nextGenerator;
    let toolchainDiff = this.toolchainFile !== nextToolchainFile;

    if ((toolchainDiff || generatorDiff) && !buildDirectoryDiff) {
      await this.removeBuildDirectory();
    }

    /* Set new config values */
    this._config = config;
    this.updateContext();
    this.configChangeEvent.fire();

    this.generator = nextGenerator;
    this.buildType = nextBuildType;
    this.buildDirectory = nextBuildDirectory;
    this.toolchainFile = nextToolchainFile;
    this.buildDirectory = nextBuildDirectory;

    if (buildDirectoryDiff || toolchainDiff || generatorDiff) {
      await this.regenerateBuildDirectory();
    }
  }

  private setupVariables(config: CMakeConfiguration): Map<string, string> {
    let vars: Map<string, string> = new Map();

    vars.set("workspaceFolder", this.workspaceFolder.uri.fsPath);
    vars.set("sourceFolder", this.sourceUri.fsPath);
    vars.set("name", config.name);
    vars.set("generator",
      config.generator ||
      vscode.workspace.getConfiguration("cmake", this.sourceUri).get("generator", "Ninja")
    );
    vars.set("buildType", config.buildType);

    this.environment = { ...process.env };
    for (let key in process.env) {
      vars.set("env." + key, process.env[key]!);
    }
    for (let key in config.env) {
      let value = config.env[key].replace(/\${((?:\w+\.)?\w+)}/g, (substring: string, ...args: any[]) => {
        return vars.get(args[0]) || "";
      });
      vars.set("env." + key, value);
      this.environment[key] = value;
    }
    return vars;
  }

  /**
   * Wether this client uses a multi configuration generator.
   * (Visual Studio, Xcode)
   */
  public get isConfigurationGenerator(): boolean {
    return this.generator.match(/^(Xcode|Visual Studio)/) !== null;
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
      fileConfigs = await loadConfigurations(
        this.configurationsFile
      );
    } catch (e) {
      let item = await vscode.window.showWarningMessage(
        "Failed to validate CMake Configurations for " +
        this.name + ": " + e.message,
        "Edit Configurations"
      );
      if (item) {
        vscode.window.showTextDocument(vscode.Uri.file(this.configurationsFile));
      }
    }

    if (fileConfigs) {
      this._configs = fileConfigs;
    } else {
      this._configs = getDefaultConfigurations();
    }

    let config = this._configs.find((value) => value.name === this.clientContext.currentConfiguration);
    if (config) {
      this._config = config;
    } else {
      this._config = this._configs[0];
    }
    await this.updateConfiguration(this.configuration);
  }

  /**
   * Regenerate the build directory files. After a build
   * directory change, it handles the necessary steps to
   * generate the new build directory.
   */
  abstract regenerateBuildDirectory(): Promise<void>;

  protected _cmakeMatcher = new CMakeMatcher(this.sourcePath);
  private _matchers: ProblemMatcher[] = getProblemMatchers(this.buildDirectory);

  /**
   * Build a target
   *
   * @param target A target name to build or undefined for all
   */
  async build(target?: string): Promise<void> {
    let cmakePath = vscode.workspace.getConfiguration("cmake", this.sourceUri).get("cmakePath", "cmake");
    let args: string[] = [];

    args.push("--build", this.buildDirectory);
    if (target) {
      args.push("--target", target);
    }
    if (this.isConfigurationGenerator) {
      args.push("--config", this.buildType);
    }

    let buildProc = child_process.execFile(cmakePath, args, {
      env: this.environment
    });
    buildProc.stdout.pipe(new LineTransform()).on("data", (chunk: string) => {
      this.console.appendLine(chunk);
      this._matchers.forEach((matcher) => matcher.match(chunk));
    });
    buildProc.stderr.pipe(new LineTransform()).on("data", (chunk: string) => {
      this.console.appendLine(chunk);
      this._matchers.forEach((matcher) => matcher.match(chunk));
    });

    this._matchers.forEach((value) => {
      value.buildPath = this.buildDirectory;
      value.clear();
      value.getDiagnostics().forEach(
        (diag) => this.diagnostics.delete(diag[0])
      );
    });
    this._cmakeMatcher.buildPath = this.sourcePath;
    this._cmakeMatcher.getDiagnostics().forEach(
      (uri) => this.diagnostics.delete(uri[0])
    );
    this._cmakeMatcher.clear();

    this.mayShowConsole();

    return new Promise((resolve, reject) => {
      let error = false;
      buildProc.on("error", (err) => {
        error = true;
        reject(err);
      });
      buildProc.on("exit", (code, signal) => {
        this.diagnostics.set(
          this._matchers.reduce((previous, current) =>
            previous.concat(current.getDiagnostics()),
            [] as [vscode.Uri, vscode.Diagnostic[] | undefined][])
        );
        this.diagnostics.set(this._cmakeMatcher.getDiagnostics());
        if (!error) {
          resolve();
        }
      });
    });
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
    if (vscode.workspace.getConfiguration("cmake").get("showConsoleAutomatically", true)) {
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
    let result = await stat(this.buildDirectory).catch((e) => undefined);
    if (result) {
      if (result.isDirectory) {
        return true;
      } else {
        throw new Error("Build directory (" + this.buildDirectory + ") exists, but is not a directory.");
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
      if (!this.clientContext.projectContexts.hasOwnProperty(this.project.name)) {
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
    this.extensionContext.workspaceState.update(this.name + "-context", this.clientContext);
  }

  protected selectContext() {
    this._projectTargets.clear();
    this._targetProject.clear();

    this._projects.forEach((project) => {
      this._targets.splice(this._targets.length, 0, ...project.targets);
      this._projectTargets.set(project, project.targets);
      project.targets.forEach((target) => this._targetProject.set(target, project));
    });

    if (this._projects.length > 0) {
      this._project = this._projects.find((value) => value.name === this.clientContext.currentProjectName) || this._projects[0];
      this.clientContext.currentProjectName = this._project.name;

      let context = this.projectContext!;
      let targets = this.projectTargets;
      if (targets && targets.length > 0) {
        let target = targets.find((value) => context.currentTargetName === value.name) || targets[0];
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
    this.console.dispose();
    this.diagnostics.dispose();
    this.configFileWatcher.dispose();
  }
}

export { CMake };