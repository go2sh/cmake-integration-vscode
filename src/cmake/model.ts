interface Target {
  name: string;
  type: string;
  sourceDirectory: string;

  compileGroups: {
    language: string;
    compilerPath: string;
    compileFlags: string;
  sysroot: string;
  sources: string[];
  defines: string[];
  includePaths: {
    path: string;
  }[];
  }[];
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

export { Target, Project, CacheValue, Toolchain };
