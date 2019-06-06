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

  - `cmake.generator`: The default generator (Default: Ninja)
  - `cmake.extraGenerator`: The default extra generator
  - `cmake.buildDirectory`: The default build folder 
  (Default: ${workspaceFolder}/build)
  - `cmake.cacheEntries`: The default cache entries

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
With the `cmake.workspaceTargets` setting option, the behaviour of
the `cmake.buildWorkspace` command can be changed. By default, all
targets of each project in a workspace will be build. Alternatively,
the setting allows to specify an array of targets as described above,
which will be build instead. This includes all dependencies specified
either by CMake or by this extension.
```
"cmake.workspaceTargets": [
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
"cmake.targetDependencies": [
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