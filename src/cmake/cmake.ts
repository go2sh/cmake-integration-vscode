import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';
import * as vscode from 'vscode';
import { Project, Target, CacheValue } from './model';
import { CMakeConfiguration, getDefaultConfigurations } from './config';

const readdir = util.promisify(fs.readdir);
const stat = util.promisify(fs.stat);
const lstat = util.promisify(fs.lstat);
const unlink = util.promisify(fs.unlink);
const mkdir = util.promisify(fs.mkdir);
const rmdir = util.promisify(fs.rmdir);

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

  protected console: vscode.OutputChannel;
  protected diagnostics: vscode.DiagnosticCollection;

  protected sourcePath: string;

  constructor(
    public readonly sourceUri: vscode.Uri,
    public readonly workspaceFolder: vscode.WorkspaceFolder,
    protected readonly extensionContext: vscode.ExtensionContext
  ) {
    this.sourcePath = path.dirname(this.sourceUri.fsPath).replace(/\\/g, "/").replace(/^\w\:\//, (c) => c.toUpperCase());

    this.console = vscode.window.createOutputChannel(this.name);
    this.diagnostics = vscode.languages.createDiagnosticCollection("cmake-" + this.name);

    this.clientContext = this.extensionContext.workspaceState.get(this.name + "-context", new ClientContext());
  }

  /*
   * Properties
   */
  protected _onModelChange: vscode.EventEmitter<CMake> = new vscode.EventEmitter();
  readonly onModelChange: vscode.Event<CMake> = this._onModelChange.event;

  protected _configs: CMakeConfiguration[] = getDefaultConfigurations();
  protected _config: CMakeConfiguration = { name: "Debug", buildType: "Debug" };
  public get configurations(): CMakeConfiguration[] {
    return this._configs;
  }

  public get configuration(): CMakeConfiguration {
    return this._config;
  }

  abstract updateConfiguration(config: CMakeConfiguration): Promise<void>;

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

  public get generator(): string {
    if (this.configuration.generator) {
      return this.configuration.generator;
    } else {
      return vscode.workspace.getConfiguration("cmake", this.sourceUri).get("generator", "Ninja");
    }
  }

  public get isConfigurationGenerator(): boolean {
    return this.generator.match(/^Visual Studio/) !== null;
  }

  public get buildDirectory(): string {
    let buildDirectory: string;
    if (this.configuration.buildDirectory) {
      buildDirectory = this.configuration.buildDirectory;
    } else {
      buildDirectory = vscode.workspace.getConfiguration("cmake", this.sourceUri).get("buildDirectory", "${sourceFolder}/build");
    }
    buildDirectory = this.replaceVariables(buildDirectory);

    if (!path.isAbsolute) {
      buildDirectory = path.join(this.sourceUri.fsPath, buildDirectory);
    }

    return buildDirectory;
  }

  public get environment(): { [key: string]: string | undefined } {
    let configEnv: { [key: string]: string };
    if (this.configuration.env) {
      configEnv = this.configuration.env;
    } else {
      configEnv = vscode.workspace.getConfiguration("cmake", this.sourceUri).get("env", {});
    }
    let processEnv = process.env;
    return { ...processEnv, ...configEnv };
  }

  public get variables(): { [key: string]: string | undefined } {
    if (this.configuration.variables) {
      return this.configuration.variables;
    } else {
      return vscode.workspace.getConfiguration("cmake", this.sourceUri).get<any>("cacheEntries", {});
    }
  }

  public dispose() {
    this.console.dispose();
    this.diagnostics.dispose();
  }

  abstract build(target?: string): Promise<void>;
  abstract configure(): Promise<void>;
  abstract getCacheValue(key : string) : CacheValue | undefined;

  protected replaceVariables(value: string): string {
    let vars = new Map<string, string>();

    // Add environment
    let env = this.environment;
    for (const key in this.environment) {
      if (env[key] !== undefined) {
        vars.set("env." + key, env[key]!);
      }
    }

    vars.set("workspaceFolder", this.workspaceFolder.uri.fsPath);
    vars.set("sourceFolder", this.sourceUri.fsPath);
    vars.set("name", this.configuration.name);
    vars.set("generator", this.generator);

    return value.replace(/\${((?:\w+\.)?\w+)}/g, (substring: string, ...args: any[]) => {
      return vars.get(args[0]) || "";
    });
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
    await mkdir(this.buildDirectory, {
      recursive: true
    });
  }

  public async removeBuildDirectory() {
    let removeDir = async (dir: string) => {
      try {
        await lstat(dir);
      } catch (e) {
        return;
      }
      let files = await readdir(dir);
      await Promise.all(files.map(async (file) => {
        let p = path.join(dir, file);
        const stat = await lstat(p);
        if (stat.isDirectory()) {
          await removeDir(p);
        } else {
          await unlink(p);
        }
      }));
      await rmdir(dir);
    };
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