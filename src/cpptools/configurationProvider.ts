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
import { Target } from "../cmake/model";
import { CMakeClient } from "../cmake/cmake";

interface TargetInfo {
  configurations: SourceFileConfiguration[];

  cConfiguration?: SourceFileConfiguration;
  cppConfiguration?: SourceFileConfiguration;
}

interface ClientInfo {
  client: CMakeClient;
  clientFiles: Set<string>;

  targetInfos: Map<Target, TargetInfo>;

  ready: boolean;
  disposables: Disposable[];
}

class ConfigurationProvider implements CustomConfigurationProvider {
  name: string = "CMake Integration";
  extensionId: string = "go2sh.cmake-integration";

  /* Storage of precompiled infos per client */
  private clientInfos: Map<CMakeClient, ClientInfo> = new Map();

  /* Fast look up map for Items */
  private sourceFiles: Map<string, SourceFileConfigurationItem> = new Map();
  /* Precompiled browseConfig */
  private browseConfig: WorkspaceBrowseConfiguration | undefined;

  private ignoreCase: boolean;
  private disposables: Disposable[] = [];

  static DefaultCPPStandard: SourceFileConfiguration["standard"] = "c++20";
  static DefaultCStandard: SourceFileConfiguration["standard"] = "c11";
  static DefaultIntelliSenseMode: SourceFileConfiguration["intelliSenseMode"] =
    "clang-x64";

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

  public get isReady(): boolean {
    return [...this.clientInfos.values()].reduce<boolean>(
      (old, value) => old && value.ready,
      true
    );
  }

  static gccMatch = /\/?[^/]*(?:gcc|g\+\+|cc|c\+\+)[^/]*$/;
  static clMatch = /cl\.exe$/;
  static clangMatch = /\/?[^/]*clang(?:\+\+)?[^/]$/;

  static getStandard(
    clientInfo: ClientInfo,
    fg: Target["compileGroups"][0]
  ): SourceFileConfiguration["standard"] {
    let gccStdMatch = /-std=((?:iso9899\:|(?:(?:gnu|c)(?:\+\+)?))\w+)/;
    let gccStdLookup: { [key: string]: SourceFileConfiguration["standard"] } = {
      "c89": "c89",
      "c90": "c99",
      "iso9899:1990": "c99",
      "iso9899:199409": "c99",
      "c99": "c99",
      "c9x": "c99",
      "iso9899:1999": "c99",
      "iso9899:199x": "c99",
      "c11": "c11",
      "c1x": "c11",
      "iso9899:2011": "c11",
      "c17": "c11", // Not supported by c/c++ extension
      "c18": "c11", // Not supported by c/c++ extension
      "iso9899:2017": "c11", // Not supported by c/c++ extension
      "iso9899:2018": "c11", // Not supported by c/c++ extension
      "gnu89": "c89",
      "gnu90": "c99",
      "gnu99": "c99",
      "gnu9x": "c99",
      "gnu11": "c11",
      "gnu1x": "c11",
      "gnu17": "c11", // Not supported by c/c++ extension
      "gnu18": "c11", // Not supported by c/c++ extension
      "c++98": "c++98",
      "c++03": "c++03",
      "gnu++98": "c++98",
      "gnu++03": "c++03",
      "c++11": "c++11",
      "c++0x": "c++11",
      "gnu++11": "c++11",
      "gnu++0x": "c++11",
      "c++14": "c++14",
      "c++1y": "c++14",
      "gnu++14": "c++14",
      "gnu++1y": "c++14",
      "c++17": "c++17",
      "c++1z": "c++17",
      "gnu++17": "c++17",
      "gnu++1z": "c++17",
      "c++20": "c++20",
      "c++2a": "c++20",
      "gnu++20": "c++20",
      "gnu++2a": "c++20"
    };

    let clStdMatch = /[\/\-]Std\:(c\+\+\w+)/i;
    let clStdLookup: { [key: string]: SourceFileConfiguration["standard"] } = {
      "c++14": "c++14",
      "c++17": "c++17",
      "c++20": "c++20",
      "c++latest": "c++20"
    };

    let argString: string = fg.compileFlags.join(" ");
    let compiler = clientInfo.client.toolchain.getCompiler(fg.language);

    if (
      compiler &&
      (ConfigurationProvider.gccMatch.exec(compiler) ||
        ConfigurationProvider.clangMatch.exec(compiler))
    ) {
      let stdResult = gccStdMatch.exec(argString);
      if (stdResult) {
        return gccStdLookup[stdResult[1]];
      } else {
        //TODO: query default standard from compiler
        if (fg.language === "C") {
          return "c11";
        } else {
          return "c++14";
        }
      }
    }

    if (compiler && ConfigurationProvider.clMatch.exec(compiler)) {
      let stdResult = clStdMatch.exec(argString);
      if (stdResult) {
        return clStdLookup[stdResult[1]];
      } else {
        if (fg.language === "C") {
          return "c89";
        } else {
          return "c++14";
        }
      }
    }

    return workspace
      .getConfiguration("cmake", clientInfo.client.sourceUri)
      .get<SourceFileConfiguration["standard"]>("cpptoolStandard", "c++17");
  }

  private static getIntelliSenseMode(
    clientInfo: ClientInfo,
    fg: Target["compileGroups"][0]
  ): SourceFileConfiguration["intelliSenseMode"] {
    let compiler = clientInfo.client.toolchain.getCompiler(fg.language);

    if (compiler) {
      if (compiler.match(ConfigurationProvider.gccMatch)) {
        return "gcc-x64";
      }

      if (compiler.match(ConfigurationProvider.clMatch)) {
        return "msvc-x64";
      }

      if (compiler.match(ConfigurationProvider.clangMatch)) {
        return "clang-x64";
      }
    }

    return workspace
      .getConfiguration("cmake", clientInfo.client.sourceUri)
      .get<SourceFileConfiguration["intelliSenseMode"]>(
        "cpptoolintelliSenseMode",
        "clang-x64"
      );
  }

  private static compareStandard(
    a: SourceFileConfiguration["standard"],
    b: SourceFileConfiguration["standard"]
  ) {
    const cppIndex = ["c++98", "c++03", "c++11", "c++14", "c++17", "c++20"];
    const cIndex = ["c89", "c99", "c11"];
    if (a.startsWith("c++")) {
      if (b.startsWith("c++")) {
        if (cppIndex.indexOf(a) > cppIndex.indexOf(b)) {
          return a;
        } else {
          return b;
        }
      } else {
        return a;
      }
    } else {
      if (b.startsWith("c++")) {
        return b;
      } else {
        if (cIndex.indexOf(a) > cIndex.indexOf(b)) {
          return a;
        } else {
          return b;
        }
      }
    }
  }

  updateClient(client: CMakeClient) {
    let clientInfo: ClientInfo = this.clientInfos.get(client)!;

    // Remove all previos files from the list
    for (const clientFile of clientInfo.clientFiles.values()) {
      this.sourceFiles.delete(clientFile);
    }
    clientInfo.clientFiles.clear();

    for (const target of client.targets) {
      this._addTarget(clientInfo, target);
    }
    this._calculateBrowseConfiguration(clientInfo);

    if (!clientInfo.ready) {
      clientInfo.ready = true;
    }
  }

  private _addTarget(clientInfo: ClientInfo, target: Target) {
    // Only use actual source targets
    if (
      !target.type.match(
        /(?:STATIC_LIBRARY|MODULE_LIBRARY|SHARED_LIBRARY|OBJECT_LIBRARY|INTERFACE_LIBRARY|EXECUTABLE)/
      ) ||
      !target.compileGroups
    ) {
      return;
    }

    let targetInfo :TargetInfo = {
      configurations: []
    };
    clientInfo.targetInfos.set(target, targetInfo);

    for (const fg of target.compileGroups) {
      let defines: string[] = [];
      let includePath: string[] = [];
      let standard: SourceFileConfiguration["standard"];
      let intelliSenseMode: SourceFileConfiguration["intelliSenseMode"];
      let compiler = clientInfo.client.toolchain.getCompiler(fg.language);

      // Extract information
      fg.includePaths.forEach((value) => {
        let incPath = path.normalize(value.path);
        includePath.push(incPath);
      });
      fg.defines.forEach((value) => {
        defines.push(value);
      });

      standard = ConfigurationProvider.getStandard(clientInfo, fg);
      intelliSenseMode = ConfigurationProvider.getIntelliSenseMode(
        clientInfo,
        fg
      );

      // create config
      let configuration: SourceFileConfiguration = {
        compilerPath: compiler || "${default}",
        compilerArgs: fg.compileFlags,
        includePath,
        defines,
        intelliSenseMode,
        standard,
        windowsSdkVersion:
          clientInfo.client.toolchain.windowsSdkVersion || "${default}"
      };

      // Set config for each source file
      fg.sources.forEach((source) => {
        let filePath: string;
        let uri: Uri;

        if (path.isAbsolute(source)) {
          filePath = source;
        } else {
          filePath = path.normalize(
            path.join(clientInfo.client.sourceUri.fsPath, source)
          );
        }
        filePath = filePath
          .replace(/\w\:\\/, (c) => c.toUpperCase())
          .replace(/\\/g, "/");
        if (this.ignoreCase) {
          filePath = filePath.toLowerCase();
        }
        uri = Uri.file(filePath);

        clientInfo.clientFiles.add(filePath);
        this.sourceFiles.set(filePath, { uri, configuration });
      });

      targetInfo.configurations.push(configuration);
    }
  }

  private _calculateBrowseConfiguration(clientInfo: ClientInfo) {
    ConfigurationProvider.compareStandard("c++03", "c++03");
  }

  addClient(client: CMakeClient) {
    this.clientInfos.set(client, {
      client: client,
      clientFiles: new Set(),
      targetInfos: new Map(),
      ready: false,
      disposables: [client.onModelChange((e) => this.updateClient(e))]
    });
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

  async canProvideConfiguration(uri: Uri, token?: CancellationToken) {
    let filePath = uri.fsPath;
    filePath = filePath
      .replace(/^\w\:\\/, (c) => c.toUpperCase())
      .replace(/\\/g, "/");
    if (this.ignoreCase) {
      filePath = filePath.toLowerCase();
    }

    let status = this.sourceFiles.has(filePath);
    // Look for other sources
    if (!status) {
      const fileExt = path.extname(filePath);
      const isCSourceFile = fileExt.match(/(?:c|h|def|inc)/i);
      const isCPPSourceFile = fileExt.match(/(?:cc|cpp|hpp)/i);

      let sourceInfo:
        | { clientInfo: ClientInfo; target: Target; targetInfo: TargetInfo }
        | undefined;

      this.clientInfos.forEach((clientInfo, client) => {
        const isClientFile = filePath.startsWith(client.sourceUri.fsPath);
        if (isClientFile) {
          const shouldGuess = workspace
            .getConfiguration("cmake", client.sourceUri)
            .get("guessSourceFileConfiguration", true);
          if (shouldGuess) {
            clientInfo.targetInfos.forEach((targetInfo, target) => {
              if (filePath.startsWith(target.sourceDirectory)) {
                sourceInfo = { clientInfo, target, targetInfo };
              }
            });
          }
        }
      });

      if (!sourceInfo) {
        return false;
      }

      if (isCSourceFile && sourceInfo.targetInfo.cConfiguration) {
        this.sourceFiles.set(filePath, {
          uri,
          configuration: sourceInfo.targetInfo.cConfiguration
        });
        sourceInfo.clientInfo.clientFiles.add(filePath);
        return true;
      }
      if (isCPPSourceFile && sourceInfo.targetInfo.cppConfiguration) {
        this.sourceFiles.set(filePath, {
          uri,
          configuration: sourceInfo.targetInfo.cppConfiguration
        });
        sourceInfo.clientInfo.clientFiles.add(filePath);
        return true;
      }
    }
    return status;
  }

  async provideConfigurations(uris: Uri[], token?: CancellationToken) {
    let items: SourceFileConfigurationItem[] = [];
    for (const uri of uris) {
      let path = uri.fsPath;
      path = path
        .replace(/^\w\:\\/, (c) => c.toUpperCase())
        .replace(/\\/g, "/");
      if (this.ignoreCase) {
        path = path.toLowerCase();
      }

      let item = this.sourceFiles.get(path);
      if (item) {
        items.push(item);
      }
    }
    return items;
  }

  async canProvideBrowseConfiguration(token?: CancellationToken) {
    return this.browseConfig !== undefined;
  }

  async provideBrowseConfiguration(token?: CancellationToken) {
    return this.browseConfig!;
  }

  async canProvideBrowseConfigurationsPerFolder(
    token?: CancellationToken | undefined
  ): Promise<boolean> {
    return this.browseConfig !== undefined;
  }

  async provideFolderBrowseConfiguration(
    uri: Uri,
    token?: CancellationToken | undefined
  ): Promise<WorkspaceBrowseConfiguration> {
    throw Error(`Invalid uri requested: ${uri.fsPath}`);
  }

  dispose() {
    this.disposables.forEach((e) => {
      e.dispose();
    });
  }
}

export { ConfigurationProvider };
