import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';
import { Project, Target, CacheValue } from './model';
import { CMakeConfiguration, getDefaultConfigurations, buildToolchainFile, loadConfigurations } from './config';
import { removeDir, makeRecursivDirectory } from '../helpers/fs';

const stat = util.promisify(fs.stat);

class ProjectContext {
  currentTargetName: string = "";
}

interface ProjectContextMap {
  [key: string]: ProjectContext;
}

class ClientContext {
  currentProjectName: string = "";
  currentBuildDirectory : string = "";
  currentConfiguration: string = "Debug";
  projectContexts: ProjectContextMap = {};
}

abstract class CMake implements vscode.Disposable {

  protected console: vscode.OutputChannel;
  protected diagnostics: vscode.DiagnosticCollection;

  protected sourcePath: string;

  private configFileWatcher : vscode.FileSystemWatcher;

  constructor(
    public readonly sourceUri: vscode.Uri,
    public readonly workspaceFolder: vscode.WorkspaceFolder,
    protected readonly extensionContext: vscode.ExtensionContext
  ) {
    this.sourcePath = path.dirname(this.sourceUri.fsPath).replace(/\\/g, "/").replace(/^\w\:\//, (c) => c.toUpperCase());

    this.console = vscode.window.createOutputChannel(this.name);
    this.diagnostics = vscode.languages.createDiagnosticCollection("cmake-" + this.name);

    this.clientContext = this.extensionContext.workspaceState.get(this.name + "-context", new ClientContext());
    this.buildDirectory = this.clientContext.currentBuildDirectory || "";
    this._configs = getDefaultConfigurations();
    this._config = this._configs[0];
    this.configFileWatcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(workspaceFolder, ".vscode/CMakeConfig.json"));
    this.configFileWatcher.onDidChange((e) => this.initialize());
    this.configFileWatcher.onDidCreate((e) => this.initialize());
    this.configFileWatcher.onDidDelete((e) => this.initialize());
  }

  /*
   * Properties
   */
  protected _onModelChange: vscode.EventEmitter<CMake> = new vscode.EventEmitter();
  readonly onModelChange: vscode.Event<CMake> = this._onModelChange.event;

  protected _configs: CMakeConfiguration[];
  protected _config: CMakeConfiguration;
  public get configurations(): CMakeConfiguration[] {
    return this._configs;
  }

  public get configuration(): CMakeConfiguration {
    return this._config;
  }

  private _project: Project | undefined = undefined;
  private _projectTargets: Map<Project, Target[]> = new Map();
  protected _projects: Project[] = [];

  public get projects(): Project[] {
    return this._projects;
  }

  public get project(): Project | undefined {
    return this._project;
  }
  public set project(v: Project | undefined) {
    if (v && this._projectTargets.has(v)) {
      this._project = v;

      this._target = this.projectTargets.find(
        (value) =>
          value.name === this.currentProjectContext!.currentTargetName
      ) || this.projectTargets[0];
    } else {
      this._project = undefined;
      this._target = undefined;
    }
    this.updateContext();
  }

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

  public get targets(): Target[] {
    return this._targets;
  }

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

  public get name(): string {
    return path.basename(this.sourceUri.path);
  }

  protected generator: string = "";
  protected buildDirectory: string;
  protected buildType: string = "";
  protected toolchainFile: string | undefined;
  protected environment: { [key: string]: string | undefined } = {};
  protected variables: { [key: string]: string | undefined } = {};

  public get isConfigurationGenerator(): boolean {
    return this.generator.match(/^Visual Studio/) !== null;
  }

  protected cache: Map<string, CacheValue> = new Map();
  public getCacheValue(key: string): CacheValue | undefined {
    return this.cache.get(key);
  }

  public async updateConfiguration(config: CMakeConfiguration): Promise<void> {
    let vars = new Map<string, string>();
    let nextGenerator = config.generator ||
      vscode.workspace.getConfiguration("cmake", this.sourceUri).get("generator", "Ninja");
    let nextBuildDirectory = config.buildDirectory ||
      vscode.workspace.getConfiguration("cmake", this.sourceUri).get(
        "buildDirectory",
        "${workspaceFolder}/build/");
    let nextBuildType = config.buildType || vscode.workspace.getConfiguration("cmake", this.sourceUri).get("buildType", "Debug");
    let nextToolchainFile = await buildToolchainFile(this.workspaceFolder, config);

    vars.set("workspaceFolder", this.workspaceFolder.uri.fsPath);
    vars.set("sourceFolder", this.sourceUri.fsPath);
    vars.set("name", config.name);
    vars.set("generator", nextGenerator);

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
    nextBuildDirectory = nextBuildDirectory.replace(
      /\${((?:\w+\.)?\w+)}/g,
      (substring: string, ...args: any[]) => {
        return vars.get(args[0]) || "";
      }
    );
    if (!path.isAbsolute(nextBuildDirectory)) {
      nextBuildDirectory = path.join(this.sourceUri.fsPath, nextBuildDirectory);
    }

    let buildDirectoryDiff = this.buildDirectory !== nextBuildDirectory;
    let generatorDiff = this.generator !== nextGenerator;
    let toolchainDiff = this.toolchainFile !== nextToolchainFile;

    if ((toolchainDiff || generatorDiff) && !buildDirectoryDiff) {
      await this.removeBuildDirectory();
    }

    this._config = config;
    this.clientContext.currentConfiguration = config.name;
    this.updateContext();

    this.generator = nextGenerator;
    this.buildType = nextBuildType;
    this.buildDirectory = nextBuildDirectory;
    this.toolchainFile = nextToolchainFile;
    this.buildDirectory = nextBuildDirectory;

    await this.regenerateBuildDirectory();
  }

  public dispose() {
    this.console.dispose();
    this.diagnostics.dispose();
    this.configFileWatcher.dispose();
  }

  abstract regenerateBuildDirectory(): Promise<void>;
  abstract build(target?: string): Promise<void>;
  abstract configure(): Promise<void>;

  public async initialize() {
    this._configs = await loadConfigurations(
      path.join(
        this.sourceUri.fsPath, ".vscode", "CMakeConfig.json"
      ),
      path.join(
        this.extensionContext.extensionPath, "schema", "build_configuration.json"
      )
    );
    this._config = this._configs.find((value) => value.name === this.clientContext.currentConfiguration) || this._configs[0];
    await this.updateConfiguration(this.configuration);
  }

  public async hasBuildDirectory() {
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

  public async createBuildDirectory() {
    await makeRecursivDirectory(this.buildDirectory);
  }

  public async removeBuildDirectory() {
    await removeDir(this.buildDirectory);
  }

  protected mayShowConsole() {
    if (vscode.workspace.getConfiguration("cmake").get("showConsoleAutomatically", true)) {
      this.console.show();
    }
  }

  /*
   * Context handling
   *
   */
  protected clientContext: ClientContext;

  protected get currentProjectContext(): ProjectContext | undefined {
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
        this.currentProjectContext!.currentTargetName = this.target.name;
      } else {
        this.currentProjectContext!.currentTargetName = "";
      }
    } else {
      this.clientContext.currentProjectName = "";
    }
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

      let context = this.currentProjectContext!;
      let targets = this.projectTargets;
      if (targets && targets.length > 0) {
        let target = targets.find((value) => context.currentTargetName === value.name) || targets[0];
        this._target = target;
        context.currentTargetName = target.name;
      } else {
        this._target = undefined;
      }
    } else {
      this._project = undefined;
      this._target = undefined;
    }
  }
}

export { CMake };