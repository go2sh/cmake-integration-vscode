
interface ObjectVersion {
  major: string;
  minor: string;
}

interface StatefulQueryRequest {
  kind: string;
  version: ObjectVersion | number | number[];
  client?: any;
}
interface StatefuleQueryFile {
  requests: StatefulQueryRequest[];
  client?: any;
}

interface ReplyFileReference {
  kind: string;
  version: ObjectVersion;
  jsonFile: string;
}

interface StatefulQueryResponse {
  client: any;
  requests: StatefulQueryRequest[][];
  responses: ReplyFileReference[] | { error: string };
}

interface ClientResponse {
  [key: string]: ReplyFileReference | { error: string } | StatefulQueryResponse;
}

interface IndexFile {
  cmake: {
    version: {
      major: number;
      minor: number;
      patch: number;
      suffix: string;
      string: string;
      isDirty: boolean;
    };
    paths: {
      "cmake": string;
      "ctest": string;
      "cpack": string;
      "root": string;
    }
    generator: {
      name: string;
      platform?: string;
    }
  };
  objects: ReplyFileReference[];
  reply: {
    [key: string]: ReplyFileReference | { error: string } | ClientResponse;
  };
}

interface ObjectFile {
  kind: string;
  version: ObjectVersion;
}

/*
 * CodeModel file
 */
interface Project {
  name: string;
  directoryIndexes: number[];
  targetIndexes: number[];
}

interface Target {
  name: string;
  directoryIndex: number;
  projectIndex: number;
  jsonFile: string;
}

interface Configuration {
  name: string;
  directories: {
    source: string;
    build: string;
    childIndexes: number[];
    projectIndex: number;
    targetIndexes: number[];
    hasInstallRule: boolean;
    minimumCMakeVersion: {
      string: string;
    };
  }[];
  projects: Project[];
  targets: Target[];
}

interface CodeModelFile extends ObjectFile {
  paths: {
    source: string;
    build: string;
  };
  configurations: Configuration[];
}

interface TargetFile extends ObjectFile {
  name: string;
  id: string;
  type: "EXECUTABLE" | "STATIC_LIBRARY" | "SHARED_LIBRARY" | "MODULE_LIBRARY" | "OBJECT_LIBRARY" | "UTILITY";
  backtrace?: number;
  folder?: {
    name: string;
  };
  paths: {
    source: string;
    build: string;
  };
  nameOnDisk?: string;
  artifacts?: {
    path: string;
  }[];
  isGeneratorProvided?: boolean;
  install?: {
    prefix: {
      path: string;
    };
    destinations: {
      path: string;
      backtrace?: number;
    }[];
  };
  link?: {
    language: string;
    commandFragments: {
      fragment: string;
      role: "flags" | "libraries" | "libraryPath" | "frameworkPath";
    }[];
    lto?: boolean;
    sysroot?: {
      path: string;
    };
  };
  archive?: {
    commandFragments?: {
      fragment: string;
      role: "flags";
    }[];
    lto?: boolean;
  };
  dependencies?: {
    id: string;
    backtrace?: number;
  }[];
  sources: {
    path: string;
    compileGroupIndex?: number;
    sourceGroupIndex?: number;
    isGenerated?: boolean;
    backtrace?: number;
  }[];
  sourceGroups?: {
    name: string;
    sourceIndexes: number[];
  }[];
  compileGroups?: {
    sourceIndexes: number[];
    language: string;
    compileCommandFragments?: {
      fragment: string;
    }[];
    includes?: {
      path: string;
      isSystem?: boolean;
      backtrace?: number;
    }[];
    defines?: {
      define: string;
      backtrace?: number;
    }[];
    sysroot?: {
      path: string;
    };
  }[];
  backtraceGraph: {
    nodes: {
      file: number;
      line?: number;
      command?: number;
      parrent?: number;
    }[];
    commands: string[];
    files: string[];
  };
}

interface CacheFile extends ObjectFile {
  entries: {
    name: string;
    value: string;
    type: string;
    properties: {
      name: string;
      value: string;
    }[];
  }[];
}

export { 
  StatefuleQueryFile, ClientResponse, ReplyFileReference,
  IndexFile, CodeModelFile, TargetFile, CacheFile
};