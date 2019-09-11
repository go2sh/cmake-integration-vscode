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
import * as path from 'path';
import * as os from 'os';

import { Uri, Disposable, workspace } from 'vscode';
import { CancellationToken } from 'vscode-jsonrpc';
import { CustomConfigurationProvider, SourceFileConfiguration, SourceFileConfigurationItem, WorkspaceBrowseConfiguration } from 'vscode-cpptools';
import { Target } from '../cmake/model';
import { CMakeClient } from '../cmake/cmake';

interface TargetInfo {
  cConfiguration?: SourceFileConfiguration;
  cppConfiguration?: SourceFileConfiguration;
}

interface ClientInfo {
  targetInfos: Map<Target, TargetInfo>;

  clientFiles: Set<string>;

  cConfiguration?: SourceFileConfiguration;
  cppConfiguration?: SourceFileConfiguration;

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

  constructor() {
    this.ignoreCase = workspace
      .getConfiguration("cmake")
      .get("ignoreCaseInProvider", false);

    this.disposables.push(
      workspace.onDidChangeConfiguration(e => {
        if (e.affectsConfiguration("cmake.ignoreCaseInProvider")) {
          this.ignoreCase = workspace
            .getConfiguration("cmake")
            .get("ignoreCaseInProvider", false);

          //
          let clients = [...this.clientInfos.keys()];
          clients.forEach(e => {
            this.deleteClient(e);
            this.addClient(e);
          });
        }
      })
    );
  }

  public get isReady(): boolean {
    return [...this.clientInfos.values()].reduce<boolean>(
      (old, value) =>
        old && (value.ready),
      true);
  }

  static gccMatch = /\/?[^/]*(?:gcc|g\+\+|cc|c\+\+)[^/]*$/;

  static getStandard(compiler: string, args: string, language?: "c" | "c++"): SourceFileConfiguration["standard"] {
    let clangMatch = /\/?[^/]*clang(?:\+\+)?[^/]$/;
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
      "gnu18": "c11",  // Not supported by c/c++ extension
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
      "c++2a": "c++17",
      "gnu++2a": "c++17" // Not supported by c/c++ extension
    };

    let clMatch = /cl\.exe$/;
    let clStdMatch = /\/Std\:(c\+\+\w+)/;
    let clStdLookup: { [key: string]: SourceFileConfiguration["standard"] } = {
      "c++14": "c++14",
      "c++17": "c++17",
      "c++latest": "c++17" // Not supported by c/c++ extension
    };

    if (ConfigurationProvider.gccMatch.exec(compiler) || clangMatch.exec(compiler)) {
      let stdResult = gccStdMatch.exec(args);
      if (stdResult) {
        return gccStdLookup[stdResult[1]];
      } else {
        if (language === "c") {
          return "c11";
        } else {
          return "c++14";
        }
      }
    }

    if (clMatch.exec(compiler)) {
      let stdResult = clStdMatch.exec(args);
      if (stdResult) {
        return clStdLookup[stdResult[1]];
      } else {
        if (language === "c") {
          return "c89";
        } else {
          return "c++14";
        }
      }
    }

    return "c++17";
  }

  private static getIntelliSenseMode(compiler: string): SourceFileConfiguration["intelliSenseMode"] {
    let clMatch = /cl\.exe$/;
    let clangMatch = /\/?[^/]*clang(?:\+\+)?[^/]$/;

    if (compiler.match(ConfigurationProvider.gccMatch)) {
      return "gcc-x64";
    }

    if (compiler.match(clMatch)) {
      return "msvc-x64";
    }

    if (compiler.match(clangMatch)) {
      return "clang-x64";
    }

    return "clang-x64";
  }

  private static compareStandard(
    a: SourceFileConfiguration["standard"],
    b: SourceFileConfiguration["standard"]
  ) {
    const cppIndex = ["c++98", "c++03", "c++11", "c++14", "c++17"];
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
    let windowsSdkVersion: string | undefined;
    let cCompiler: string | undefined;
    let cppCompiler: string | undefined;

    // Remove all previos files from the list
    for (const clientFile of clientInfo.clientFiles.values()) {
      this.sourceFiles.delete(clientFile);
    }
    clientInfo.clientFiles.clear();
    clientInfo.targetInfos.clear();

    // Determain sdk version
    let sdk = client.getCacheValue("CMAKE_VS_WINDOWS_TARGET_PLATFORM_VERSION");
    if (sdk) {
      windowsSdkVersion = sdk.value;
    }

    let cacheC = client.getCacheValue("CMAKE_C_COMPILER");
    if (cacheC) {
      cCompiler = cacheC.value;
    }

    let cacheCPP = client.getCacheValue("CMAKE_CXX_COMPILER");
    if (cacheCPP) {
      cppCompiler = cacheCPP.value;
    }

    for (const target of client.targets) {
      this._createTargetConfiguration(clientInfo, target, windowsSdkVersion, cCompiler, cppCompiler);
    }
    this._createClientConfiguration(clientInfo, windowsSdkVersion, cCompiler, cppCompiler);
    this._updateBrowsingConfiguration();
    this.clientInfos.get(client)!.ready = true;
  }
  private _createTargetConfiguration(
    clientInfo: ClientInfo,
    target: Target,
    windowsSdkVersion: string | undefined,
    cCompiler: string | undefined,
    cppCompiler: string | undefined
  ) {
    let info: TargetInfo = {};

    if (!target.type.match(/(?:STATIC_LIBRARY|MODULE_LIBRARY|SHARED_LIBRARY|OBJECT_LIBRARY|INTERFACE_LIBRARY|EXECUTABLE)/) || !target.compileGroups) {
      return;
    }

    for (const fg of target.compileGroups) {
      let language: "c" | "c++" = "c";
      let compilerPath: string | undefined;
      let defines: string[] = [];
      let includePath: string[] = [];
      let standard: SourceFileConfiguration["standard"] = "c++17";
      let intelliSenseMode: SourceFileConfiguration["intelliSenseMode"] = "clang-x64";

      // Find target file group infos
      if (fg.language === "CXX") {
        compilerPath = cppCompiler;
        language = "c++";
        standard = "c++17";
      } else if (fg.language === "C") {
        compilerPath = cCompiler;
        language = "c";
        standard = "c11";
      }

      fg.includePaths.forEach((value) => {
        let incPath = path.normalize(value.path);
        includePath.push(incPath);
      });
      fg.defines.forEach((value) => {
        defines.push(value);
      });

      if (compilerPath) {
        standard = ConfigurationProvider.getStandard(compilerPath, fg.compileFlags, language);
        intelliSenseMode = ConfigurationProvider.getIntelliSenseMode(compilerPath);
      } else {
        if (os.platform() === "win32") {
          intelliSenseMode = "msvc-x64";
        } else {
          intelliSenseMode = "clang-x64";
        }
      }

      let cpptoolsCompilerPath = compilerPath;
      if (fg.compileFlags) {
        cpptoolsCompilerPath += fg.compileFlags;
      }
      if (fg.sysroot) {
        cpptoolsCompilerPath += ` "--sysroot=${fg.sysroot}"`;
      }

      // Set config
      let configuration: SourceFileConfiguration = {
        compilerPath: cpptoolsCompilerPath,
        includePath,
        defines,
        intelliSenseMode,
        standard,
        windowsSdkVersion
      };
      if (fg.language === "C") {
        info.cConfiguration = configuration;
      }
      if (fg.language === "CXX") {
        info.cppConfiguration = configuration;
      }

      fg.sources.forEach((source) => {
        let filePath: string;
        let uri: Uri;

        if (path.isAbsolute(source)) {
          filePath = source;
        } else {
          filePath = path.normalize(path.join(target.sourceDirectory, source));
        }
        filePath = filePath
          .replace(/\w\:\\/, c => c.toUpperCase())
          .replace(/\\/g, "/");
        if (this.ignoreCase) {
          filePath = filePath.toLowerCase();
        }
        uri = Uri.file(filePath);

        clientInfo.clientFiles.add(filePath);
        this.sourceFiles.set(filePath, { uri, configuration });
      });
    }
    clientInfo.targetInfos.set(target, info);
  }

  private _createClientConfiguration(
    clientInfo: ClientInfo,
    windowsSdkVersion: string | undefined,
    cCompiler: string | undefined,
    cppCompiler: string | undefined
  ) {
    let cStandard: SourceFileConfiguration["standard"] = "c89";
    let cIncludePath: Set<string> = new Set();
    let cDefines: Set<string> = new Set();
    let cppStandard: SourceFileConfiguration["standard"] = "c++98";
    let cppIncludePath: Set<string> = new Set();
    let cppDefines: Set<string> = new Set();
    let intelliSenseMode: SourceFileConfiguration["intelliSenseMode"] = "clang-x64";

    for (const targetInfo of clientInfo.targetInfos.values()) {
      if (targetInfo.cConfiguration) {
        intelliSenseMode = targetInfo.cConfiguration.intelliSenseMode;
        cStandard = ConfigurationProvider.compareStandard(
          targetInfo.cConfiguration.standard, cStandard
        );
        targetInfo.cConfiguration.defines.forEach((value) => cDefines.add(value));
        targetInfo.cConfiguration.includePath.forEach((value) => cIncludePath.add(value));
      }
      if (targetInfo.cppConfiguration) {
        intelliSenseMode = targetInfo.cppConfiguration.intelliSenseMode;
        cppStandard = ConfigurationProvider.compareStandard(
          targetInfo.cppConfiguration.standard, cppStandard
        );
        targetInfo.cppConfiguration.defines.forEach((value) => cppDefines.add(value));
        targetInfo.cppConfiguration.includePath.forEach((value) => cppIncludePath.add(value));
      }
    }

    clientInfo.cConfiguration = {
      standard: cStandard,
      compilerPath: cCompiler,
      includePath: Array.from(cIncludePath.values()),
      defines: Array.from(cDefines.values()),
      intelliSenseMode: intelliSenseMode,
      windowsSdkVersion: windowsSdkVersion
    };

    clientInfo.cppConfiguration = {
      standard: cppStandard,
      compilerPath: cppCompiler,
      includePath: Array.from(cppIncludePath.values()),
      defines: Array.from(cppDefines.values()),
      intelliSenseMode: intelliSenseMode,
      windowsSdkVersion: windowsSdkVersion
    };
  }

  private _updateBrowsingConfiguration() {
    let includeSet = new Set<string>();
    let cCompilerPath: string | undefined;
    let cppCompilerPath: string | undefined;
    let standard: WorkspaceBrowseConfiguration["standard"] = "c89";
    let windowsSdkVersion: string | undefined;

    for (const clientInfo of this.clientInfos.values()) {
      if (clientInfo.cppConfiguration) {
        clientInfo.cppConfiguration.includePath.forEach((value) => includeSet.add(value));
        if (!cppCompilerPath && clientInfo.cppConfiguration.compilerPath) {
          cppCompilerPath = clientInfo.cppConfiguration.compilerPath;
        }
        if (!windowsSdkVersion) {
          windowsSdkVersion = clientInfo.cppConfiguration.windowsSdkVersion;
        }
        standard = ConfigurationProvider.compareStandard(standard, clientInfo.cppConfiguration.standard);
      }

      if (clientInfo.cConfiguration) {
        clientInfo.cConfiguration.includePath.forEach((value) => includeSet.add(value));
        if (!cCompilerPath && clientInfo.cConfiguration.compilerPath) {
          cCompilerPath = clientInfo.cConfiguration.compilerPath;
        }
        if (!windowsSdkVersion) {
          windowsSdkVersion = clientInfo.cConfiguration.windowsSdkVersion;
        }
        standard = ConfigurationProvider.compareStandard(standard, clientInfo.cConfiguration.standard);
      }
    }

    this.browseConfig = {
      browsePath: Array.from(includeSet),
      compilerPath: cppCompilerPath || cCompilerPath,
      standard: standard,
      windowsSdkVersion: windowsSdkVersion
    };
  }

  addClient(client: CMakeClient) {
    this.clientInfos.set(client, {
      targetInfos: new Map(),
      clientFiles: new Set(),
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
    this._updateBrowsingConfiguration();
  }

  async canProvideConfiguration(uri: Uri, token?: CancellationToken) {
    let filePath = uri.fsPath;
    filePath = filePath
      .replace(/^\w\:\\/, c => c.toUpperCase())
      .replace(/\\/g, "/");
    if (this.ignoreCase) {
      filePath = filePath.toLowerCase();
    }

    let status = this.sourceFiles.has(filePath);
    // Look for other sources
    if (!status) {
      // Match only files with c and cpp based file endings
      if (!path.extname(filePath).toLowerCase().match(/(?:c|cc|cpp|h|hpp|def|inc)$/)) {
        return false;
      }
      for (const client of this.clientInfos.keys()) {
        let clientInfo = this.clientInfos.get(client)!;
        let configuration: SourceFileConfiguration | undefined;
        let clientPath = client.sourceUri.fsPath;
        if (this.ignoreCase) {
          clientPath = clientPath.toLowerCase();
        }

        if (filePath.startsWith(clientPath)) {
          if (filePath.match(/\.[cC]$/)) {
            configuration = clientInfo.cConfiguration;
          } else {
            configuration = clientInfo.cppConfiguration || clientInfo.cConfiguration;
          }
        }

        if (configuration) {
          this.sourceFiles.set(filePath, { uri, configuration });
          return true;
        }
      }
    }
    return status;
  }

  async provideConfigurations(uris: Uri[], token?: CancellationToken) {
    let items: SourceFileConfigurationItem[] = [];
    for (const uri of uris) {
      let path = uri.fsPath;
      path = path.replace(/^\w\:\\/, c => c.toUpperCase()).replace(/\\/g, "/");
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

  dispose() {
    this.disposables.forEach(e => {
      e.dispose();
    });
  }
}

export { ConfigurationProvider };
