---
title: Configurations
---

# Configurations for CMake

Configurations can be used to customize the behaviour of the CMake build and
can be used to control every aspect of the build process with CMake.
The extensions comes with a set of default configurations matching the
integrated build types of CMake
(`Debug`,`Release`, `RelWithDebInfo`, `MinSizeRel`). Furthermore, there are
default values in place for every configuration property. The default values
are speciefied by the VS Code settings and can be changed through the
settings editor.

To edit the configurations with in VS Code, use the `Edit Configurations`
command. This will open the `cmake_configurations.json` within the `.vscode/`
folder. The configurations are seperate for each workspace folder. There is a
json schema supplied by the extension to guide you through the editing process.
Changing the configuration file will trigger a validation of the schema and the
configurations are only changed, if the file is validated sucessfully.
Afterwards, the build directories are updated to reflect the new configurations.

The base structure of the `cmake_configurations.json` file looks like:

```
{
  configurations: [
    ...
  ]
}
```

The `configurations` property holds an array of `configuration` objects.

## Configuration Object
A configuration object has the following properties:

- [`name`](#configuration-name)
- [`buildDirectory`](#configuration-buildDirectory)
- [`generator`](#configuration-generator)
- [`buildType`](#configuration-buildType)
- [`toolchain`](#configuration-toolchain)
- [`env`](#configuration-env)
- [`cacheEntries`](#configuration-cacheentries)

### configuration.name
Specifies the name of the configuration. Must be a unique within the
configurations. The name is shown in the status bar and used to the select a new
configuration.

### configuration.buildDirectory
Sets the CMake build directory, where the build system is generated.

### configuration.generator

Select the build system generator to use. See the 
[`CMake Documentation`](https://cmake.org/cmake/help/latest/manual/cmake-generators.7.html)
for a complete list of generators.

### configuration.buildType

Sets the build type for the current build. Depending on the generator, the build type is added as configuration parameter 
(See [`CMAKE_BUILD_TYPE`](https://cmake.org/cmake/help/latest/variable/CMAKE_BUILD_TYPE.html))
or as build parameter for multi-configuration generators (e.g. Visual Studio).
(See [`CMAKE_CONFIGURATION_TYPES`](https://cmake.org/cmake/help/latest/variable/CMAKE_CONFIGURATION_TYPES.html))

### configuration.toolchain
Specifies either a path to a toolchain file as string or an object, which will
be used to generate a toolchain file. The object keys are used as variable
names and the string values are used as values for the `set` command.
The specified or generated toolchain file will be passed as argument to CMake
on configuration. 
(See [`CMAKE_TOOLCHAIN_FILE`](https://cmake.org/cmake/help/latest/variable/CMAKE_TOOLCHAIN_FILE.html))

```
  ...
  toolchain: {
    "CMAKE_SYSTEM_NAME": "Linux",
    "CMAKE_SYSTEM_PROCESSOR": "arm",
    "triple": "arm-linux-gnueabihf",
    "CMAKE_C_COMPILER": "clang",
    "CMAKE_C_COMPILER_TARGET": "${triple}",
    "CMAKE_CXX_COMPILER": "clang++",
    "CMAKE_CXX_COMPILER_TARGET": "${triple}"
  },
  ...
```
The example above generates the following toolchain file:
```
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR arm)
set(triple arm-linux-gnueabihf)
set(CMAKE_C_COMPILER clang)
set(CMAKE_C_COMPILER_TARGET ${triple})
set(CMAKE_CXX_COMPILER clang++)
set(CMAKE_CXX_COMPILER_TARGET ${triple})
```

### configuration.env
Allows to set additional environment variables for the configuration and build
processes. The `env` object keys speciefy the variable names and the object
values the variable values. 
```
  ...
  env: {
    "QT_DIR": "/opt/qt5-dev/"
  },
  ...
```
With variable substituations, existing variables can be extended.
```
    ...
    "PATH": "${env:PATH}:/opt/qt5-dev/bin",
    ...
```

### configuration.cacheEntries
Specifies additional CMake cache entries, which will be passed via command line
argument. It is an array of cache entries, where each entry must have a name
and a value and can have a type. See the 
[`CMake Documentation`](https://cmake.org/cmake/help/latest/command/set.html#set-cache-entry)
for additional information on cache entries.

```
  ...
  "cacheEntries": [
    {
      "name": "BOOST_ROOT",
      "value": "/opt/boost-1.44",
      "type": "PATH"
    }
  ],
  ...
```

## Variable substitutions
Values of the configuration fields `buildDirectory`, `toolchain`, `env` and
`cacheEntries` may use variable substitution to replace the variable
specification with the actual variable value. Variables are definied by the
following pattern: `${varName}`.

The following variables exists:
 - `sourceFolder`: CMAKE_SOURCE_DIR path
 - `workspaceFolder`: Workspace folder path
 - `name`: Configuration name
 - `buildType`: Configuration buildType
 - `generator`: Configuration generator
 - `env:EnvName`: ´Environment variable with the name `EnvName`.