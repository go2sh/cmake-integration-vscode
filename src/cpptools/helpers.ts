import { spawn } from "child_process";
import {
  SourceFileConfiguration,
  WorkspaceBrowseConfiguration
} from "vscode-cpptools";

import { CompileGroup, Language } from "../cmake/model";
import { LineTransform } from "../helpers/stream";

const gccMatch = /(?:gcc|g\+\+|cc|c\+\+)[^/\\]*$/;
const clMatch = /cl\.exe$/;
const clangMatch = /clang(?:\+\+)?[^/\\]*$/;

const gccStdMatch = /-std=((?:iso9899\:|(?:(?:gnu|c)(?:\+\+)?))\w+)/;
const gccStdLookup: { [key: string]: SourceFileConfiguration["standard"] } = {
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

const clStdMatch = /[\/\-]Std\:(c\+\+\w+)/i;
const clStdLookup: { [key: string]: SourceFileConfiguration["standard"] } = {
  "c++14": "c++14",
  "c++17": "c++17",
  "c++20": "c++20",
  "c++latest": "c++20"
};

async function getCStandardFromGCC(
  compiler: string
): Promise<SourceFileConfiguration["standard"]> {
  const proc = spawn(compiler, ["-x", "c", "-E", "-dM", "-"]);
  let found = false;
  proc.stdin.end();

  return new Promise((resolve, reject) => {
    proc.stdout.pipe(new LineTransform()).on("data", (d: string) => {
      const match = d.match(/__cplusplus\s+(\d{4}\d{2})/);
      if (match) {
        found = true;
        if (match[1] <= "199901") {
          resolve("c99");
        }
        resolve("c11");
      }
    });
    proc.on("exit", () => {
      if (!found) {
        resolve("c89");
      }
    });
    proc.on("error", (e) => {
      reject(e);
    });
  });
}

async function getCPPStandardFromGCC(
  compiler: string
): Promise<SourceFileConfiguration["standard"]> {
  const proc = spawn(compiler, ["-x", "c++", "-E", "-dM", "-"]);
  proc.stdin.end();
  let found = false;

  return new Promise((resolve, reject) => {
    proc.stdout.pipe(new LineTransform()).on("data", (d: string) => {
      const match = d.match(/__cplusplus\s+(\d{4}\d{2})/);
      if (match) {
        found = true;
        if (match[1] <= "199711") {
          resolve("c++98");
        }
        if (match[1] <= "201103") {
          resolve("c++11");
        }
        if (match[1] <= "201402") {
          resolve("c++14");
        }
        if (match[1] <= "201703") {
          resolve("c++17");
        }
        resolve("c++20");
      }
    });
    proc.stderr.on("data", (chunk) => console.log(`${chunk}`));
    proc.on("exit", () => {
      if (!found) {
        resolve("c++98");
      }
    });
    proc.on("error", (e) => {
      reject(e);
    });
  });
}

async function getStandardFromCompiler(
  compilerPath: string,
  language: Language
): Promise<SourceFileConfiguration["standard"]> {
  const isGCC =
    (gccMatch.exec(compilerPath) || clangMatch.exec(compilerPath)) !== null;
  const isMSVC = clMatch.exec(compilerPath) !== null;
  if (language === "CXX") {
    if (isGCC) {
      return getCPPStandardFromGCC(compilerPath);
    } else if (isMSVC) {
      return "c++14";
    } else {
      return "c++20";
    }
  } else if (language === "C") {
    if (isGCC) {
      return getCStandardFromGCC(compilerPath);
    } else if (isMSVC) {
      return "c89";
    } else {
      return "c11";
    }
  } else if (language === "CUDA") {
    return "c++14";
  } else {
    return "c++20";
  }
}
function getStandardFromArgs(
  compilerArgs: string[],
  compilerStandard: SourceFileConfiguration["standard"],
  _language: Language
): SourceFileConfiguration["standard"] {
  let argString: string = compilerArgs.join(" ");

  let stdResult = gccStdMatch.exec(argString);
  if (stdResult) {
    return gccStdLookup[stdResult[1]];
  }

  stdResult = clStdMatch.exec(argString);
  if (stdResult) {
    return clStdLookup[stdResult[1]];
  }

  return compilerStandard;
}

function getIntelliSenseMode(
  compiler: string | undefined
): SourceFileConfiguration["intelliSenseMode"] {
  if (compiler) {
    if (compiler.match(gccMatch)) {
      return "gcc-x64";
    }

    if (compiler.match(clMatch)) {
      return "msvc-x64";
    }

    if (compiler.match(clangMatch)) {
      return "clang-x64";
    }
  }
  return "gcc-x64";
}

function getCompileFlags(fg: CompileGroup) {
  return fg.compileFlags.reduce((flags, flag) => {
    flags.push(...flag.split(/\s+/));
    return flags;
  }, [] as string[]);
}

function compareStandard(
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

function joinCompilerArgs(argsArray: Iterable<string[]>): string[] {
  let args = new Map<string, string[]>();
  let defaultArgs: string[] = [];

  for (let argC of argsArray) {
    let argArray = defaultArgs;
    for (const arg of argC) {
      if (arg.match(/^[^-]/)) {
        argArray.push(arg);
      } else {
        if (!args.has(arg)) {
          argArray = [];
          args.set(arg, argArray);
        } else {
          argArray = args.get(arg)!;
        }
      }
    }
  }

  let compilerArgs: string[] = [];
  for (const [key, value] of args) {
    compilerArgs.push(key);
    compilerArgs.push(...value);
  }
  compilerArgs.push(...defaultArgs);
  return compilerArgs;
}

function* compilerArgs(configs: Iterable<{ compilerArgs?: string[] }>) {
  for (const config of configs) {
    if (config.compilerArgs) {
      yield config.compilerArgs;
    }
  }
}

function getWorkspaceBrowseConfiguration(
  configs: Iterable<WorkspaceBrowseConfiguration>,
  joinArgs: boolean = true
): WorkspaceBrowseConfiguration {
  let browsePath = new Set<string>();
  let standard: SourceFileConfiguration["standard"] = "c89";
  let first: WorkspaceBrowseConfiguration | undefined = undefined;

  for (const config of configs) {
    if (!first) {
      first = config;
    }
    config.browsePath.map(Set.prototype.add, browsePath);
    if (config.standard) {
      standard = compareStandard(standard, config.standard);
    }
  }

  if (!first) {
    return {
      browsePath: []
    };
  } else {
    return {
      compilerPath: first.compilerPath,
      compilerArgs: joinArgs
        ? joinCompilerArgs(compilerArgs(configs))
        : first.compilerArgs,
      windowsSdkVersion: first.windowsSdkVersion,
      browsePath: Array.from(browsePath.values()),
      standard: standard
    };
  }
}

function getSourceFileConfiguration(
  configs: Iterable<SourceFileConfiguration>,
  joinArgs: boolean = true
): SourceFileConfiguration {
  let defines = new Set<string>();
  let includes = new Set<string>();
  let forceIncludes = new Set<string>();
  let standard: SourceFileConfiguration["standard"] = "c89";
  let first: SourceFileConfiguration | undefined = undefined;

  for (const config of configs) {
    if (!first) {
      first = config;
    }
    config.defines.map(Set.prototype.add, defines);
    config.includePath.map(Set.prototype.add, includes);
    standard = compareStandard(standard, config.standard);
  }

  if (!first) {
    return {
      includePath: [],
      defines: [],
      intelliSenseMode: "clang-x64",
      standard: "c++17"
    };
  } else {
    return {
      compilerPath: first.compilerPath,
      compilerArgs: joinArgs
        ? joinCompilerArgs(compilerArgs(configs))
        : first.compilerArgs,
      windowsSdkVersion: first.windowsSdkVersion,
      forcedInclude: Array.from(forceIncludes.values()),
      defines: Array.from(defines.values()),
      includePath: Array.from(includes.values()),
      intelliSenseMode: first.intelliSenseMode,
      standard: standard
    };
  }
}
function convertToBrowseConfiguration(
  sourceConfig: SourceFileConfiguration
): WorkspaceBrowseConfiguration;
function convertToBrowseConfiguration(
  sourceConfig: SourceFileConfiguration[]
): WorkspaceBrowseConfiguration;
function convertToBrowseConfiguration(
  sourceConfig: SourceFileConfiguration | SourceFileConfiguration[]
): WorkspaceBrowseConfiguration {
  let config: SourceFileConfiguration;
  if (Array.isArray(sourceConfig)) {
    config = getSourceFileConfiguration(sourceConfig);
  } else {
    config = sourceConfig;
  }
  return {
    browsePath: [
      ...new Set([...(config.forcedInclude || []), ...config.includePath])
    ],
    compilerPath: config.compilerPath,
    compilerArgs: config.compilerArgs,
    standard: config.standard,
    windowsSdkVersion: config.windowsSdkVersion
  };
}

function isMSVC(path : string) : boolean {
  return path.match(clMatch) !== null;
}

export {
  getStandardFromCompiler,
  getStandardFromArgs,
  getIntelliSenseMode,
  getCompileFlags,
  getSourceFileConfiguration,
  getWorkspaceBrowseConfiguration,
  convertToBrowseConfiguration,
  isMSVC
};
