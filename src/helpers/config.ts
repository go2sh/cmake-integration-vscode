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
 * Configuration helpers
 */
import * as vscode from "vscode";
import { getCMakeVersion } from "./cmake";

const argsRegex = /(".*?"|\S+)/g;

export function buildArgs(uri: vscode.Uri, section: string): string[] {
  let args: string[] = [];
  let matches = vscode.workspace
    .getConfiguration("cmake", uri)
    .get<string>(section, "")
    .match(argsRegex);

  if (matches) {
    for (const match of matches) {
      args.push(match);
    }
  }

  return args;
}

export async function getCMakeApi(
  uri: vscode.Uri
): Promise<"Server" | "File API"> {
  let version = await getCMakeVersion();
  let [major, minor] = version.split(".", 2).map(e => parseInt(e));
  let config = vscode.workspace
    .getConfiguration("cmake", uri)
    .get<"Auto" | "Server" | "File API">("cmakeAPI");

  if (major >= 3 && minor >= 14) {
    if (config === "Server") {
      if (major > 3 || minor > 15) {
        throw Error(`CMake Server is unsupported in CMake version ${version}.`);
      } else {
        return "Server";
      }
    } else {
      return "File API";
    }
  } else if (major >= 3 && minor >= 7) {
    if (config === "File API") {
      throw Error(`CMake File API is unsupported in CMake version ${version}.`);
    }
    return "Server";
  } else {
    throw Error(`Unsupported CMake Version ${version}.`);
  }
}
