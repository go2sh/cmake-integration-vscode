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
 * CMake model
 */

type Language = "C" | "CXX" | "FORTRAN" | "CUDA";

interface CompileGroup {
  language: Language;
  compileFlags: string[];
  sysroot: string;
  sources: string[];
  defines: string[];
  includePaths: {
    path: string;
  }[];
}

interface Target {
  name: string;
  type: string;
  sourceDirectory: string;
  compileGroups: CompileGroup[];
}

interface Project {
  name: string;
  targets: Target[];
}

interface CacheValue {
  name: string;
  value: string;
  type?: "BOOL" | "FILEPATH" | "PATH" | "STRING" | "INTERNAL";
}

class Toolchain {
  readonly windowsSdkVersion?: string;
  readonly cCompiler?: string;
  readonly cppCompiler?: string;

  constructor(init?: Partial<Toolchain>) {
    if (init) {
      this.windowsSdkVersion = init.windowsSdkVersion;
      this.cCompiler = init.cCompiler;
      this.cppCompiler = init.cppCompiler;
    }
  }

  public getCompiler(lang: Language): string | undefined {
    if (lang == "C") {
      return this.cCompiler;
    }
    if (lang == "CXX") {
      return this.cppCompiler;
    }
    return undefined;
  }
}

export { Language, CompileGroup, Target, Project, CacheValue, Toolchain };
