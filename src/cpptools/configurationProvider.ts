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
 * Configuration provider for cpptools api
 */
import * as path from "path";

import { Uri, Disposable, workspace, EventEmitter } from "vscode";
import { CancellationToken, Event } from "vscode-jsonrpc";
import {
  CustomConfigurationProvider,
  SourceFileConfiguration,
  SourceFileConfigurationItem,
  WorkspaceBrowseConfiguration
} from "vscode-cpptools";

import { Target, Language } from "../cmake/model";
import { CMakeClient } from "../cmake/cmake";
import {
  ClientInfo,
  TargetInfo,
  TargetConfigurations,
  LanguageConfiguration
} from "./infos";
import {
  getSourceFileConfiguration,
  getWorkspaceBrowseConfiguration,
  convertToBrowseConfiguration,
  getCompileFlags,
  getStandardFromArgs
} from "./helpers";

class CMakeConfigurationProvider implements CustomConfigurationProvider {
  name: string = "CMake Integration";
  extensionId: string = "go2sh.cmake-integration";

  /* Storage of precompiled infos per client */
  private clientInfos: Map<CMakeClient, ClientInfo> = new Map();

  /* Fast look up map for Items */
  private sourceFiles: Map<string, SourceFileConfigurationItem> = new Map();
  /* Precompiled browseConfig */
  private browseConfig: WorkspaceBrowseConfiguration = { browsePath: [] };

  private disposables: Disposable[] = [];

  private readyEmitter: EventEmitter<
    CMakeConfigurationProvider
  > = new EventEmitter();
  public onReady: Event<CMakeConfigurationProvider> = this.readyEmitter.event;
  private didChangeConfigurationEmitter: EventEmitter<
    CMakeConfigurationProvider
  > = new EventEmitter();
  public onDidChangeConfiguration: Event<CMakeConfigurationProvider> = this
    .didChangeConfigurationEmitter.event;

  constructor() {
    this.disposables.push(
      workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("cmake.cpptools")) {
          this.updateClients();
        }
      })
    );
    this.readyEmitter.fire(this);
  }

  private fileExtensions = {
    C: /(?:c|h|def|inc)$/i,
    CXX: /(?:cc|c\+\+|cpp|cxx|h|h\+\+|hpp|hxx)$/i,
    CUDA: /(?:cu|h|hu)$/i,
    FORTRAN: /^(?:f|for|f90|f95|f03)$/i
  };

  private addSourceFileConfiguration(
    clientInfo: ClientInfo,
    filePath: string,
    configuration: SourceFileConfiguration
  ) {
    let uri = Uri.file(filePath);
    clientInfo.clientFiles.add(uri.fsPath);
    this.sourceFiles.set(uri.fsPath, {
      uri: Uri.file(uri.fsPath),
      configuration: configuration
    });
  }

  private guessSourceFile(filePath: string): boolean {
    for (const [client, clientInfo] of this.clientInfos) {
      const isClientFile = filePath.startsWith(client.sourceUri.fsPath);
      if (!isClientFile) {
        continue;
      }

      const shouldGuess = workspace
        .getConfiguration("cmake.cpptools", client.sourceUri)
        .get("guessSourceFileConfigurations", true);
      if (!shouldGuess) {
        continue;
      }

      for (const [target, targetInfo] of clientInfo.targetInfos) {
        const targetUri = Uri.file(target.sourceDirectory);
        const isTargetFile = filePath.startsWith(targetUri.fsPath);
        if (!isTargetFile) {
          continue;
        }

        let languages = target.compileGroups.map((cg) => cg.language);
        const fileExt = path.extname(filePath);
        const languageOrder: Language[] = ["CXX", "CUDA", "C"];
        let configuration = languageOrder
          .filter((l) => {
            return (
              languages.find((ll) => l === ll) !== undefined &&
              fileExt.match(this.fileExtensions[l]) !== null
            );
          })
          .map((l) => targetInfo.languageConfiguration[l])[0];

        if (configuration) {
          this.addSourceFileConfiguration(clientInfo, filePath, configuration);
          return true;
        }
      }
    }
    return false;
  }

  private async processClient(client: CMakeClient): Promise<void> {
    let clientInfo: ClientInfo = this.clientInfos.get(client)!;

    // Remove all previos files from the list
    for (const clientFile of clientInfo.clientFiles.values()) {
      this.sourceFiles.delete(clientFile);
    }
    clientInfo.clientFiles.clear();

    await clientInfo.updateCompilerInformation();

    client.targets.forEach((target) => {
      this.addConfigurationsFromTarget(clientInfo, target)
    });

    let browseSettings = workspace
      .getConfiguration("cmake.cpptools", client.sourceUri)
      .get<{ project: string; target?: string }[]>("browseTargets", []);
    if (browseSettings.length > 0) {
      clientInfo.setBrowseConfiguration(browseSettings);
    } else {
      clientInfo.makeReducedBrowseConfiguration();
    }
  }

  async updateClients() {
    await Promise.all(
      Array.from(this.clientInfos.keys()).map((client) =>
        this.processClient(client)
      )
    );
    this.makeGlobalBrowseConfiguration();
    this.didChangeConfigurationEmitter.fire(this);
  }

  async updateClient(client: CMakeClient) {
    await this.processClient(client);
    this.makeGlobalBrowseConfiguration();
    this.didChangeConfigurationEmitter.fire(this);
  }

  private makeGlobalBrowseConfiguration() {
    let browseSettings = workspace
      .getConfiguration("cmake.cpptools")
      .get<{ project: string; target?: string }[]>("globalBrowseTargets", []);
    let configs: WorkspaceBrowseConfiguration[] = [];
    if (browseSettings.length > 0) {
      configs = Array.from(this.clientInfos.values()).reduce(
        (configs, info) => {
          configs.push(
            convertToBrowseConfiguration(
              info.getSourceFileConfigurations(browseSettings!)
            )
          );
          return configs;
        },
        [] as WorkspaceBrowseConfiguration[]
      );
    } else {
      configs = [];
      for (const clientInfo of this.clientInfos.values()) {
        configs.push(clientInfo.browseConfig);
      }
    }
    this.browseConfig = getWorkspaceBrowseConfiguration(configs);
  }

  private addConfigurationsFromTarget(clientInfo: ClientInfo, target: Target) {
    // Only use actual source targets
    if (
      !target.type.match(
        /(?:STATIC_LIBRARY|MODULE_LIBRARY|SHARED_LIBRARY|OBJECT_LIBRARY|INTERFACE_LIBRARY|EXECUTABLE)/
      ) ||
      !target.compileGroups
    ) {
      return;
    }

    const configs: TargetConfigurations = new TargetConfigurations();

    for (const fg of target.compileGroups) {
      const compilerArgs = getCompileFlags(fg);

      if (fg.sysroot) {
        compilerArgs.push(`--sysroot=${fg.sysroot}`);
      }

      let configuration: SourceFileConfiguration = {
        compilerPath: clientInfo.compilers[fg.language].path,
        compilerArgs: compilerArgs,
        includePath: fg.includePaths.map((value) => path.normalize(value.path)),
        defines: fg.defines,
        intelliSenseMode: clientInfo.compilers[fg.language].intelliSenseMode,
        standard: getStandardFromArgs(
          fg.compileFlags,
          clientInfo.compilers[fg.language].standard,
          fg.language
        ),
        windowsSdkVersion: clientInfo.windowsSdkVersion
      };
      configs[fg.language].push(configuration);

      // Set config for each source file
      fg.sources.forEach((source) => {
        this.addSourceFileConfiguration(clientInfo, source, configuration);
      });
    }

    let targetInfo: TargetInfo = {
      target: target,
      targetConfiguration: getSourceFileConfiguration(configs),
      languageConfiguration: new LanguageConfiguration(configs)
    };
    clientInfo.targetInfos.set(target, targetInfo);
  }

  addClient(client: CMakeClient) {
    let clientInfo = new ClientInfo(client);
    clientInfo.disposables.push(
      client.onModelChange((e) => this.updateClient(e))
    );
    this.clientInfos.set(client, clientInfo);
  }

  deleteClient(client: CMakeClient) {
    let info = this.clientInfos.get(client)!;
    // Remove from source files
    for (const file of info.clientFiles.values()) {
      this.sourceFiles.delete(file);
    }
    info.disposables.map((d) => d.dispose());
    // Remove from cache
    this.clientInfos.delete(client);
  }

  async canProvideConfiguration(uri: Uri, _token?: CancellationToken) {
    if (this.sourceFiles.has(uri.fsPath)) {
      return true;
    } else {
      return this.guessSourceFile(uri.fsPath);
    }
  }

  async provideConfigurations(uris: Uri[], _token?: CancellationToken) {
    return uris.reduce(
      (items, uri) => {
        let item = this.sourceFiles.get(uri.fsPath);
        if (item) {
          items.push(item);
        }
        return items;
      },
      [] as SourceFileConfigurationItem[]
    );
  }

  async canProvideBrowseConfiguration(_token?: CancellationToken) {
    return true;
  }

  async provideBrowseConfiguration(
    _token?: CancellationToken
  ): Promise<WorkspaceBrowseConfiguration> {
    return this.browseConfig;
  }

  async canProvideBrowseConfigurationsPerFolder(
    _token?: CancellationToken | undefined
  ): Promise<boolean> {
    return true;
  }

  async provideFolderBrowseConfiguration(
    uri: Uri,
    _token?: CancellationToken | undefined
  ): Promise<WorkspaceBrowseConfiguration> {
    for (const [client, info] of this.clientInfos) {
      if (client.workspaceFolder.uri.toString() === uri.toString()) {
        return info.browseConfig;
      }
    }

    //FIXME: Workaround because, we can get all workspace uris
    return {} as WorkspaceBrowseConfiguration;
  }

  dispose() {
    this.disposables.forEach((e) => {
      e.dispose();
    });
  }
}

export { CMakeConfigurationProvider };
