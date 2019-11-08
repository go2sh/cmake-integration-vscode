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
 * CMake Client based on running cmake process with file api
 */
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { promisify } from 'util';
import * as vscode from 'vscode';

import { CMakeClient } from "./cmake";
import { LineTransform } from '../helpers/stream';
import { makeRecursivDirectory } from '../helpers/fs';
import { IndexFile, CodeModelFile, ClientResponse, ReplyFileReference, TargetFile, CacheFile } from './fileApi';
import { Target, Project, CacheValue, CompileGroup } from './model';
import { buildArgs } from '../helpers/config';
import * as fileApi from './fileApi';

const stat = promisify(fs.stat);
const writeFile = promisify(fs.writeFile);
const readdir = promisify(fs.readdir);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);

class CMakeFileAPIClient extends CMakeClient {
  constructor(
    sourceFolder: vscode.Uri,
    workspaceFolder: vscode.WorkspaceFolder,
    extensionContext: vscode.ExtensionContext
  ) {
    super(sourceFolder, workspaceFolder, extensionContext);
  }

  /*
   * Interface
   */

  async regenerateBuildDirectory() {
    await makeRecursivDirectory(this.buildDirectory);
  }

  async configure(): Promise<void> {
    let cmakePath = vscode.workspace
      .getConfiguration("cmake", this.sourceUri)
      .get("cmakePath", "cmake");
    let args: string[] = [];

    args.push("-G");
    args.push(this.generator);
    if (!this.isConfigurationGenerator) {
      args.push("-D");
      args.push(`CMAKE_BUILD_TYPE:STRING=${this.buildType}`);
    }
    if (this.toolchainFile) {
      args.push("-D");
      args.push(`CMAKE_TOOLCHAIN_FILE:FILEPATH=${this.toolchainFile}`);
    }
    for (var cacheEntry of this.cacheEntries) {
      args.push("-D");
      if (cacheEntry.type) {
        args.push(`${cacheEntry.name}:${cacheEntry.type}=${cacheEntry.value}`);
      } else {
        args.push(`${cacheEntry.name}=${cacheEntry.value}`);
      }
    }
    args.push(...buildArgs(this.sourceUri, "configureArguments"));
    args.push("-S");
    args.push(this.sourceUri.fsPath);
    args.push("-B");
    args.push(this.buildDirectory);

    await this.makeFileApiRequest();

    let buildProc = child_process.spawn(cmakePath, args, {
      cwd: this.workspaceFolder.uri.fsPath,
      env: this.environment
    });
    buildProc.stdout.pipe(new LineTransform()).on("data", (chunk: string) => {
      this.console.appendLine(chunk);
      this._cmakeMatcher.match(chunk);
    });
    buildProc.stderr.pipe(new LineTransform()).on("data", (chunk: string) => {
      this.console.appendLine(chunk);
      this._cmakeMatcher.match(chunk);
    });

    this._cmakeMatcher.buildPath = this.sourcePath;
    this._cmakeMatcher
      .getDiagnostics()
      .forEach(uri => this.diagnostics.delete(uri[0]));
    this._cmakeMatcher.clear();

    this.mayShowConsole();

    return new Promise((resolve, reject) => {
      let error = false;
      buildProc.on("error", err => {
        error = true;
        reject(err);
      });
      buildProc.on("exit", (code, signal) => {
        if (signal !== null) {
          reject(new Error(`CMake process stopped unexpectedly with ${signal}`));
        }
        this.diagnostics.set(this._cmakeMatcher.getDiagnostics());
        this.readFileApiReply()
          .then(() => {
            if (!error) {
              resolve();
            }
          })
          .catch(e => reject(e));
      });
    });
  }

  public async loadModel() {
    await this.readFileApiReply();
  }

  /*
   * Private methods
   */
  private get requestFolder(): string {
    return path.join(
      this.buildDirectory,
      ".cmake",
      "api",
      "v1",
      "query",
      "client-integration-vscode"
    );
  }

  private async makeFileApiRequest() {
    let requests = ["codemodel-v2", "cache-v2", "cmakeFiles-v1"];
    let res = await makeRecursivDirectory(this.requestFolder);

    if (!res) {
      let entries = await readdir(this.requestFolder);
      for (const entry of entries) {
        if (requests.indexOf(entry) === -1) {
          await unlink(path.join(this.requestFolder, entry));
        }
      }
    }

    for (const request of requests) {
      let requestPath = path.join(this.requestFolder, request);
      let result = await stat(requestPath).catch(() => undefined);
      if (!result) {
        await writeFile(requestPath, "", { flag: "w" });
      }
    }
  }

  private get replyFolder(): string {
    return path.join(this.buildDirectory, ".cmake", "api", "v1", "reply");
  }

  private async readFileApiReply() {
    let res = await stat(this.replyFolder).catch(() => undefined);
    if (!res || !res.isDirectory) {
      return;
    }

    let files = await readdir(this.replyFolder);
    let indexFile = files
      .filter((value) => value.match(/^index.+\.json$/) !== null)
      .sort()
      .pop();
    if (!indexFile) {
      return;
    }
    let index: IndexFile = JSON.parse(
      await readFile(path.join(this.replyFolder, indexFile), {
        encoding: "utf-8"
      })
    );
    let clientResponse: ClientResponse = <ClientResponse>(
      index.reply["client-integration-vscode"]
    );
    let codeModelFile: ReplyFileReference = <ReplyFileReference>(
      clientResponse["codemodel-v2"]
    );
    let codeModel: CodeModelFile = JSON.parse(
      await readFile(path.join(this.replyFolder, codeModelFile.jsonFile), {
        encoding: "utf-8"
      })
    );

    let cacheFile: ReplyFileReference = <ReplyFileReference>(
      clientResponse["cache-v2"]
    );
    let cache: CacheFile = JSON.parse(
      await readFile(path.join(this.replyFolder, cacheFile.jsonFile), {
        encoding: "utf-8"
      })
    );

    this.cache.clear();
    for (const entry of cache.entries) {
      this.cache.set(entry.name, entry as CacheValue);
    }
    this.setToolchainFromCache();

    await this.buildModel(codeModel);
    this.selectContext();
    this.isModelValid = true;
    this._onModelChange.fire(this);
  }

  private async buildModel(codeModel: CodeModelFile) {
    this._projects = [];
    this._targets = [];

    for (const projectEntry of codeModel.configurations[0].projects) {
      let project: Project = {
        name: projectEntry.name,
        targets: []
      };

      await this.readProjectEntry(codeModel, projectEntry, project);

      for (const util of ["all", "install"]) {
        project.targets.push({
          name: util,
          type: "UTILITY",
          sourceDirectory: codeModel.paths.source,
          compileGroups: []
        });
      }
      this._projects.push(project);
    }
  }

  private async readProjectEntry(
    codeModel: CodeModelFile,
    projectEntry: fileApi.Project,
    project: Project
  ) {
    if (projectEntry.targetIndexes) {
      for (const index of projectEntry.targetIndexes) {
        let targetEntry = codeModel.configurations[0].targets[index];
        let targetFile = JSON.parse(
          await readFile(path.join(this.replyFolder, targetEntry.jsonFile), {
            encoding: "utf-8"
          })
        ) as TargetFile;
        let target: Target = {
          name: targetEntry.name,
          type: targetFile.type,
          sourceDirectory: path.join(
            codeModel.paths.source,
            targetFile.paths.source
          ),
          compileGroups: []
        };
        if (targetFile.compileGroups) {
          for (const cg of targetFile.compileGroups) {
            let fragment : string[] = [];

            if (cg.compileCommandFragments) {
              fragment = cg.compileCommandFragments.map((value) => value.fragment);
            }
            
            let modeCg: CompileGroup = {
              compileFlags: fragment,
              defines: [],
              includePaths: [],
              sysroot: cg.sysroot ? cg.sysroot.path || "" : "",
              language: cg.language,
              sources: cg.sourceIndexes.map(
                index => targetFile.sources[index].path
              )
            };
            if (cg.defines) {
              modeCg.defines = cg.defines.map(def => def.define);
            }
            if (cg.includes) {
              modeCg.includePaths = cg.includes.map(inc => {
                return { path: inc.path };
              });
            }
            target.compileGroups.push(modeCg);
          }
        }
        project.targets.push(target);
      }
    }
  }
}

export { CMakeFileAPIClient };