import { Disposable, workspace } from "vscode";
import {
  SourceFileConfiguration,
  WorkspaceBrowseConfiguration
} from "vscode-cpptools";

import { Target, Project, Language } from "../cmake/model";
import { CMakeClient } from "../cmake/cmake";
import {
  convertToBrowseConfiguration,
  getSourceFileConfiguration,
  getIntelliSenseMode,
  getStandardFromCompiler
} from "./helpers";

class TargetConfigurations implements Iterable<SourceFileConfiguration> {
  CXX: SourceFileConfiguration[] = [];
  C: SourceFileConfiguration[] = [];
  CUDA: SourceFileConfiguration[] = [];
  FORTRAN: SourceFileConfiguration[] = [];

  *[Symbol.iterator]() {
    for (const config of this.CXX) {
      yield config;
    }
    for (const config of this.CUDA) {
      yield config;
    }
    for (const config of this.C) {
      yield config;
    }
  }
}

class LanguageConfiguration {
  C: SourceFileConfiguration | undefined;
  CXX: SourceFileConfiguration | undefined;
  CUDA: SourceFileConfiguration | undefined;
  FORTRAN: SourceFileConfiguration | undefined;

  constructor(targetConfigs: TargetConfigurations) {
    this.setTargetConfigurations(targetConfigs);
  }

  setTargetConfigurations(targetConfigs: TargetConfigurations) {
    this.C =
      targetConfigs["C"].length > 0
        ? getSourceFileConfiguration(targetConfigs["C"])
        : undefined;
    this.CXX =
      targetConfigs["CXX"].length > 0
        ? getSourceFileConfiguration(targetConfigs["CXX"])
        : undefined;
    this.CUDA =
      targetConfigs["CUDA"].length > 0
        ? getSourceFileConfiguration(targetConfigs["CUDA"])
        : undefined;
  }
}
interface TargetInfo {
  target: Target;
  targetConfiguration: SourceFileConfiguration;

  languageConfiguration: LanguageConfiguration;
}

interface ProjectInfo {
  project: Project;
  projectConfiguration: SourceFileConfiguration;
}

class ClientInfo {
  constructor(client: CMakeClient) {
    this.client = client;
    this.clientFiles = new Set();
    this.projectInfos = new Map();
    this.targetInfos = new Map();
    this.browseConfig = {
      browsePath: []
    };
    this.compilers = {
      CXX: { path: "", standard: "c++20", intelliSenseMode: "gcc-x64" },
      C: { path: "", standard: "c11", intelliSenseMode: "gcc-x64" },
      CUDA: { path: "", standard: "c++20", intelliSenseMode: "gcc-x64" },
      FORTRAN: { path: "", standard: "c++20", intelliSenseMode: "gcc-x64" }
    };
    this.disposables = [];
  }
  client: CMakeClient;
  clientFiles: Set<string>;

  compilers: {
    [key in Language]: {
      path: string;
      standard: SourceFileConfiguration["standard"];
      intelliSenseMode: SourceFileConfiguration["intelliSenseMode"];
    };
  };
  windowsSdkVersion: string | undefined;

  projectInfos: Map<Project, ProjectInfo>;
  targetInfos: Map<Target, TargetInfo>;

  browseConfig: WorkspaceBrowseConfiguration;

  disposables: Disposable[];

  async updateCompilerInformation() {
    for (const key of <Language[]>Object.keys(this.compilers)) {
      const clientConfig = workspace.getConfiguration(
        `cmake.cpptools.${key}`,
        this.client.sourceUri
      );
      const compilerPath: string =
        clientConfig.get("compilerPath") ||
        this.client.toolchain.getCompiler(key) ||
        "";
      this.compilers[key] = {
        path: compilerPath,
        standard:
          clientConfig.get<SourceFileConfiguration["standard"]>("standard") ||
          (await getStandardFromCompiler(compilerPath, key)),
        intelliSenseMode:
          clientConfig.get<SourceFileConfiguration["intelliSenseMode"]>(
            "intelliSenseMode"
          ) || getIntelliSenseMode(compilerPath)
      };
    }
    this.windowsSdkVersion =
      workspace
        .getConfiguration("cmake.cpptools", this.client.sourceUri)
        .get("windowsSdkVersion") || this.client.toolchain.windowsSdkVersion;
  }

  getBrowseConfiguration(browseSettings: {
    project: string;
    target?: string;
  }): SourceFileConfiguration | undefined {
    let project = this.client.projects.find(
      (project) => project.name === browseSettings!.project
    );
    if (project) {
      if (browseSettings.target) {
        let target = project.targets.find(
          (target) => target.name === browseSettings!.target
        );
        if (target && this.targetInfos.has(target)) {
          return this.targetInfos.get(target)!.targetConfiguration;
        }
      } else {
        if (this.projectInfos.has(project)) {
          return this.projectInfos.get(project)!.projectConfiguration;
        }
      }
    }
    return undefined;
  }

  getSourceFileConfigurations(
    browseSettings: { project: string; target?: string }[]
  ): SourceFileConfiguration[] {
    return browseSettings.reduce((configs, setting) => {
      let config = this.getBrowseConfiguration(setting);
      if (config) {
        configs.push(config);
      }
      return configs;
    }, [] as SourceFileConfiguration[]);
  }

  setBrowseConfiguration(
    browseSettings: { project: string; target?: string }[]
  ) {
    this.browseConfig = convertToBrowseConfiguration(
      this.getSourceFileConfigurations(browseSettings)
    );
  }

  makeReducedBrowseConfiguration() {
    let browseConfigs: SourceFileConfiguration[] = [];

    for (const targetInfo of this.targetInfos.values()) {
      browseConfigs.push(targetInfo.targetConfiguration);
    }

    this.browseConfig = convertToBrowseConfiguration(browseConfigs);
  }
}

export { ClientInfo, TargetInfo, TargetConfigurations, LanguageConfiguration };
