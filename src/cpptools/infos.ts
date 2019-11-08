import { Disposable } from "vscode";
import {
  SourceFileConfiguration,
  WorkspaceBrowseConfiguration
} from "vscode-cpptools";

import { Target, Project } from "../cmake/model";
import { CMakeClient } from "../cmake/cmake";
import {
  convertToBrowseConfiguration,
  getSourceFileConfiguration
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
    this.disposables = [];
  }
  client: CMakeClient;
  clientFiles: Set<string>;

  projectInfos: Map<Project, ProjectInfo>;
  targetInfos: Map<Target, TargetInfo>;

  browseConfig: WorkspaceBrowseConfiguration;

  disposables: Disposable[];

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
    return browseSettings.reduce(
      (configs, setting) => {
        let config = this.getBrowseConfiguration(setting);
        if (config) {
          configs.push(config);
        }
        return configs;
      },
      [] as SourceFileConfiguration[]
    );
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
