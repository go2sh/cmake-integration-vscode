---
id: reference-settings
title: Extension Settings
sidebar_label: Settings
---

# Extension Settings
## CMake Options
 - `cmake.cmakePath`: Path to the CMake executable
 - `cmake.cmakeAPI`: Choose between CMake Server (depreacted) or File API

## Visual Settings
  - `cmake.configureOnStart`: Start the configuration process when opening
  a source folder (eg. starting VSCode, adding workspace folder)
  - `cmake.showConsoleAutomatically`: Automatically show the CMake or build output
  - `cmake.reconfigureOnChange`: Start the (re-)configuration process when
  changing CMake files.

## Configuration Defaults
The following settings describe the default values for configurations, which
will be used if no value is presend with in the configurations files. All
settings behave the same as they were specified in the configurations file (e.g
variable substitution). The defaults can be set on a user, workspace (window) or
folder level. The value in brackets afterwards, show the default value for the
settings.

  - `cmake.default.generator`: The default generator (Default: Ninja)
  - `cmake.default.extraGenerator`: The default extra generator
  - `cmake.default.buildDirectory`: The default build folder 
  (Default: ${workspaceFolder}/build)
  - `cmake.default.cacheEntries`: The default cache entries
  - `cmake.default.env`: The default environment variables

## Cpptools Integration
CMake Integration extension provides build information to the cpptools
Extension for C/C++ Source files to support language services. The
behaviour of the integration can be customize through the VS Code settings. For
more information about `BrowseConfiguration` and `SourceFileConfiguration` also
refer to the cpptools documentation. When no settings are used, the compiler
path and Windows SDK Version (for MSVC) are guessed from the coresponding 
CMake cache entries. This is not very reliable as those informations are not
always written to the cache.

  - `cmake.cpptools.globalBrowseTargets`: Select custom projects or targets to
  include in the global browse configuration.
  - `cmake.cpptools.browseTargets`: Select custom projects or targets to include
  in the workspace browse configuration.
  - `cmake.cpptools.guessSourceFileConfigurations`: Enable guessing a 
  SourceFileConfiguration for files unknown to CMake. Configurations are guessed
  based on paths of targets. (Default: True)
  - `cmake.cpptools.compilerPath`: Provides the compiler path reported to
  cpptools. If empty, the compiler path from CMake is used. CMake currently
  is unreliable and it is a good choice to set the path in the settings.
  - `cmake.cpptools.intelliSenseMode`: Provide the intelliSense Mode. When
  not set, the mode is determined by the compiler path.
  - `cmake.cpptools.windowsSdkVersion`: Provides the Windows SDK Version 
  reported to cpptools. If empty, the version from CMake is used. CMake currently is unreliable and it is a good choice to set the version in the
  settings.
  - `cmake.cpptools.languageConfiguration.CXX`,
    `cmake.cpptools.languageConfiguration.C`,
    `cmake.cpptools.languageConfiguration.CUDA`: Language dependend settings for
    the compilerPath and the intelliSense Mode. This settings have the highest
    predecence when resolving the path and mode.

## Build Settings
The extensions allows you to extended the dependencies management
beyond a single source folder by specifying special workspace
settings.
### Target Selection
Target for those special settings can be either a full project
building all targets of this project
```
{ "project": "cmake" }
```
or a single target from a project.
``` 
{ "project": "cmake", "target": "ctest" }
```
### Workspace Targets
With the `cmake.build.workspaceTargets` setting option, the behaviour of
the `cmake.build.buildWorkspace` command can be changed. By default, all
targets of each project in a workspace will be build. Alternatively,
the setting allows to specify an array of targets as described above,
which will be build instead. This includes all dependencies specified
either by CMake or by this extension.
```
"cmake.build.workspaceTargets": [
  { "project": "projectA" },
  { "project": "projectB", "target": "commandA" }
],
```

### Target Dependencies
In addition to the dependency management provided by CMake, the extension
provides a mechanism to specify dependencies between different CMake
source folder (or workspace folders). Prio to building a certain target or
project, all dependencies will be resolved and build. In case of building
a project (build all), all dependencies of the project and all dependencies
of the project targets will be used.
```
"cmake.build.targetDependencies": [
  { 
    "project": "projectB",
    "target": "exeB",
    "dependencies": [
      { "project": "projectA", "target": "libA" }
    ]
  }
]
```
The example shows, how a library in an extra CMake source folder can be build,
before the executable linking to it.