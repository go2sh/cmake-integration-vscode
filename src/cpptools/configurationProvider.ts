import { Uri } from 'vscode';
import { CancellationToken } from 'vscode-jsonrpc';
import { CustomConfigurationProvider, SourceFileConfiguration, SourceFileConfigurationItem, WorkspaceBrowseConfiguration } from 'vscode-cpptools';
import { Target } from '../cmake/protocol';
import { CMakeClient } from '../cmake/client';
import * as path from 'path';


interface ClientInfo {
  targetInfos: Map<Target, SourceFileConfigurationItem[]>;
  compilerPath?: string;
  standard?: WorkspaceBrowseConfiguration["standard"];
  windowsSdkVersion?: string;
}

class ConfigurationProvider implements CustomConfigurationProvider {

  name: string = "CMake Integration";
  extensionId: string = "go2sh.cmake-integration";

  private clients: Set<CMakeClient> = new Set();
  private clientInfos: Map<CMakeClient, ClientInfo> = new Map();
  private clientFiles: Map<CMakeClient, string[]> = new Map();

  private sourceFiles: Map<string, SourceFileConfigurationItem> = new Map();
  private browseConfig: WorkspaceBrowseConfiguration | undefined;

  constructor() {
    this.browseConfig = {
      browsePath: []
    };
  }


  public get isReady(): boolean {
    return [...this.clientFiles.values()].reduce((old, value) => old && value.length !== 0, true);
  }


  static gccMatch = /\/?[^/]*(?:gcc|g\+\+|cc|c\+\+)[^/]*$/;

  static getStandard(compiler: string, args: string, language?: "c" | "c++"): WorkspaceBrowseConfiguration["standard"] {
    let clangMatch = /\/?[^/]*clang(?:\+\+)?[^/]$/;
    let gccStdMatch = /-std=((?:iso9899\:|(?:(?:gnu|c)(?:\+\+)?))\w+)/;
    let gccStdLookup: { [key: string]: WorkspaceBrowseConfiguration["standard"] } = {
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
    let clStdLookup: { [key: string]: WorkspaceBrowseConfiguration["standard"] } = {
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

  updateClient(client: CMakeClient) {
    let windowsSdkVersion: string | undefined;
    let standard: WorkspaceBrowseConfiguration["standard"] = "c++17";
    let targetInfos = new Map<Target, SourceFileConfigurationItem[]>();


    let cCompiler = client.getCacheValue("CMAKE_C_COMPILER");
    let cppCompiler = client.getCacheValue("CMAKE_CXX_COMPILER");
    let sdk = client.getCacheValue("CMAKE_VS_WINDOWS_TARGET_PLATFORM_VERSION");

    // Remove all previos files from the list
    let fileList = this.clientFiles.get(client);
    if (fileList) {
      fileList.forEach((file) => this.sourceFiles.delete(file));
    } else {
      fileList = [];
      this.clientFiles.set(client, fileList);
    }

    // Determain sdk version
    if (sdk) {
      windowsSdkVersion = sdk.value;
    }

    // Search all targets for files and standards
    client.targets.forEach((target) => {
      if (!target.fileGroups) {
        return;
      }
      target.fileGroups.forEach((fg) => {
        let compiler: string = "";
        let language: "c" | "c++";
        let targetItems: SourceFileConfigurationItem[] = [];
        if (fg.language === "CXX") {
          if (cppCompiler) {
            compiler = cppCompiler!.value;
          }
          language = "c++";
        } else if (fg.language === "C") {
          if (cCompiler) {
            compiler = cCompiler!.value;
          }
          language = "c";
        } else {
          return;
        }
        let localStandard = ConfigurationProvider.getStandard(compiler, fg.compileFlags, language);
        let intelliSenseMode = ConfigurationProvider.getIntelliSenseMode(compiler);

        fg.sources.forEach((source) => {
          let filePath = path.normalize(path.join(target.sourceDirectory, source));
          fileList!.push(filePath);
          let item = {
            uri: filePath,
            configuration: {
              compilerPath: compiler,
              defines: fg.defines,
              includePath: fg.includePath.map((value) => path.normalize(value.path)),
              standard: localStandard || "c++17",
              intelliSenseMode: intelliSenseMode,
              windowsSdkVersion: windowsSdkVersion
            }
          };
          targetItems.push(item);
          this.sourceFiles.set(filePath, item);
        });
        targetInfos.set(target, targetItems);

        if (localStandard) {
          if (standard!.startsWith("c++")) {
            if (language === "c++" && localStandard > standard!) {
              standard = localStandard;
            }
          } else {
            if (language === "c++") {
              standard = localStandard;
            } else if (localStandard > standard!) {
              standard = localStandard;
            }
          }
        }
      });
    });

    let clientInfo: ClientInfo = {
      targetInfos: targetInfos,
      standard: standard,
      windowsSdkVersion: windowsSdkVersion,
    };

    if (standard.startsWith("c++")) {
      if (cppCompiler) {
        clientInfo.compilerPath = cppCompiler.value;
      }
    } else {
      if (cCompiler) {
        clientInfo.compilerPath = cCompiler.value;
      }
    }

    this.clientInfos.set(client, clientInfo);
    this._updateBrowsingConfiguration();
  }

  addClient(client: CMakeClient) {
    this.clients.add(client);
    this.clientInfos.set(client, {
      targetInfos: new Map()
    });
    this.clientFiles.set(client, []);
  }

  deleteClient(client: CMakeClient) {
    let files = this.clientFiles.get(client)!;
    // Remove from source files
    files.forEach((value) => this.sourceFiles.delete(value));
    // Remove from cache
    this.clientInfos.delete(client);
    this.clientFiles.delete(client);
    this.clients.delete(client);
    this._updateBrowsingConfiguration();
  }

  private _updateBrowsingConfiguration() {
    let includeSet = new Set<string>();
    let compilerPath: string | undefined;
    let standard: WorkspaceBrowseConfiguration["standard"];
    let windowsSdkVersion: string | undefined;

    for (const client of this.clients) {
      let clientInfo = this.clientInfos.get(client)!;

      if (!compilerPath) {
        compilerPath = clientInfo.compilerPath;
      }

      if (!windowsSdkVersion) {
        windowsSdkVersion = clientInfo.windowsSdkVersion;
      }

      if (clientInfo.standard) {
        if (clientInfo.standard.startsWith("c++")) {
          if (standard && standard.startsWith("c++")) {
            if (standard! < clientInfo.standard) {
              standard = clientInfo.standard;
            }
          } else {
            standard = clientInfo.standard;
          }
        } else {
          if (standard) {
            if (!standard.startsWith("c++") && standard < clientInfo.standard) {
              standard = clientInfo.standard;
            }
          } else {
            standard = clientInfo.standard;
          }
        }
      }

      for (const targetInfo of clientInfo.targetInfos.values()) {
        if (targetInfo.length > 0) {
          if (targetInfo[0].configuration.forcedInclude) {
            targetInfo[0].configuration.forcedInclude.forEach((value) => includeSet.add(value));
          }
          targetInfo[0].configuration.includePath.forEach((value) => includeSet.add(value));
        }
      }
    }


    this.browseConfig = {
      browsePath: Array.from(includeSet),
      compilerPath: compilerPath,
      standard: standard,
      windowsSdkVersion: windowsSdkVersion
    };
  }

  canProvideConfiguration(uri: Uri, token?: CancellationToken): Thenable<boolean> {
    let status = this.sourceFiles.has(uri.fsPath);
    return Promise.resolve(status);
  }

  provideConfigurations(uris: Uri[], token?: CancellationToken): Thenable<SourceFileConfigurationItem[]> {
    return Promise.resolve(uris.map((uri) => this.sourceFiles.get(uri.fsPath)!));
  }

  canProvideBrowseConfiguration(token?: CancellationToken): Thenable<boolean> {
    return Promise.resolve(this.browseConfig !== undefined);
  }

  provideBrowseConfiguration(token?: CancellationToken): Thenable<WorkspaceBrowseConfiguration> {
    return Promise.resolve(this.browseConfig!);
  }

  dispose() {

  }

}

export { ConfigurationProvider };