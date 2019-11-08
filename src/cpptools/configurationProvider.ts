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

import { Uri, Disposable, workspace } from "vscode";
import { CancellationToken } from "vscode-jsonrpc";
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
  getIntelliSenseMode,
  getStandard,
  getSourceFileConfiguration,
  getWorkspaceBrowseConfiguration,
  convertToBrowseConfiguration,
  getCompileFlags
} from "./helpers";

class ConfigurationProvider implements CustomConfigurationProvider {
  name: string = "CMake Integration";
  extensionId: string = "go2sh.cmake-integration";

  /* Storage of precompiled infos per client */
  private clientInfos: Map<CMakeClient, ClientInfo> = new Map();

  /* Fast look up map for Items */
  private sourceFiles: Map<string, SourceFileConfigurationItem> = new Map();
  /* Precompiled browseConfig */
  private browseConfig: WorkspaceBrowseConfiguration = { browsePath: [] };

  private ignoreCase: boolean;
  private disposables: Disposable[] = [];

  private readyPromise: Promise<void> = Promise.resolve();
  private readyResolve: () => void = () => {};
  private readyPending: Promise<void | void[]>[] = [];

  constructor() {
    this.ignoreCase = workspace
      .getConfiguration("cmake")
      .get("ignoreCaseInProvider", false);

    this.disposables.push(
      workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("cmake.ignoreCaseInProvider")) {
          this.ignoreCase = workspace
            .getConfiguration("cmake")
            .get("ignoreCaseInProvider", false);

          //
          let clients = [...this.clientInfos.keys()];
          clients.forEach((e) => {
            this.deleteClient(e);
            this.addClient(e);
          });
        }
      })
    );
  }

  private setNotReady(result: Promise<void | void[]>) {
    this.readyPending.push(result);
    if (this.readyPending.length === 1) {
      this.readyPromise = new Promise((resolve) => {
        this.readyResolve = resolve;
      });
    }
  }

  private setReady(result: Promise<void | void[]>) {
    if (this.readyPending.length === 1) {
      this.readyResolve();
    }
    this.readyPending = this.readyPending.filter((val) => val !== result);
  }

  private becomeReady(token?: CancellationToken): Promise<void> {
    return new Promise((resolve, reject) => {
      if (token) {
        token.onCancellationRequested(() => {
          reject();
        });
      }
      this.readyPromise.then(() => {
        if (!token || !token.isCancellationRequested) {
          resolve();
        }
      });
    });
  }

  private getFilePath(filePath: string): string;
  private getFilePath(uri: Uri): string;
  private getFilePath(arg: string | Uri): string {
    let filePath: string;

    if (typeof arg !== "string") {
      filePath = arg.fsPath;
    } else {
      filePath = arg;
    }

    filePath = filePath
      .replace(/\w\:\\/, (c) => c.toUpperCase())
      .replace(/\\/g, "/");
    if (this.ignoreCase) {
      filePath = filePath.toLowerCase();
    }

    return filePath;
  }

  private fileExtensions = {
    C: /(?:c|h|def|inc)$/i,
    CXX: /(?:cc|c\+\+|cpp|cxx|h|h\+\+|hpp|hxx)$/i,
    CUDA: /(?:cu|h|hu)$/i,
    FORTRAN: /^(?:f|for|f90|f95|f03)$/i
  };

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
        const isTargetFile = filePath.startsWith(target.sourceDirectory);
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
          clientInfo.clientFiles.add(filePath);
          this.sourceFiles.set(filePath, {
            uri: Uri.file(filePath),
            configuration: configuration
          });
          return true;
        }
      }
    }
    return false;
  }

  updateClient(client: CMakeClient) {
    let clientInfo: ClientInfo = this.clientInfos.get(client)!;

    // Remove all previos files from the list
    for (const clientFile of clientInfo.clientFiles.values()) {
      this.sourceFiles.delete(clientFile);
    }
    clientInfo.clientFiles.clear();

    let result: Promise<void | void[]> = Promise.all(
      client.targets.map((target) => {
        return this._addTarget(clientInfo, target);
      })
    ).then(() => {
      let browseSettings = workspace
        .getConfiguration("cmake.cpptools", client.sourceUri)
        .get<{ project: string; target?: string }[]>("browseTargets", []);
      if (browseSettings.length > 0) {
        clientInfo.setBrowseConfiguration(browseSettings);
      } else {
        clientInfo.makeReducedBrowseConfiguration();
      }
      this.makeGlobalBrowseConfiguration();
      this.setReady(result);
    });
    this.setNotReady(result);
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

  private async _addTarget(clientInfo: ClientInfo, target: Target) {
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
      // create config
      let configuration: SourceFileConfiguration = {
        compilerPath:
          clientInfo.client.toolchain.getCompiler(fg.language) || "${default}",
        compilerArgs: getCompileFlags(fg),
        includePath: fg.includePaths.map((value) => path.normalize(value.path)),
        defines: fg.defines,
        intelliSenseMode: getIntelliSenseMode(clientInfo, fg),
        standard: await getStandard(clientInfo, fg),
        windowsSdkVersion:
          clientInfo.client.toolchain.windowsSdkVersion || "${default}"
      };
      configs[fg.language].push(configuration);

      // Set config for each source file
      fg.sources.forEach((source) => {
        let filePath: string;
        // Resolve file path
        if (path.isAbsolute(source)) {
          filePath = source;
        } else {
          filePath = path.normalize(
            path.join(clientInfo.client.sourceUri.fsPath, source)
          );
        }

        let uri: Uri = Uri.file(this.getFilePath(filePath));
        clientInfo.clientFiles.add(uri.fsPath);
        this.sourceFiles.set(uri.fsPath, { uri, configuration });
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
    let filePath = this.getFilePath(uri);

    if (this.sourceFiles.has(filePath)) {
      return true;
    } else {
      return this.guessSourceFile(filePath);
    }
  }

  async provideConfigurations(uris: Uri[], token?: CancellationToken) {
    await this.becomeReady(token);

    return uris.reduce(
      (items, uri) => {
        let item = this.sourceFiles.get(this.getFilePath(uri));
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
    token?: CancellationToken
  ): Promise<WorkspaceBrowseConfiguration> {
    await this.becomeReady(token);

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
    await this.becomeReady();

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

export { ConfigurationProvider };
