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

To edit the configurations with in VS Code, use the 
`Edit Configurations` command. This will open the 
`cmake_configurations.json` within the `.vscode/` folder. The configurations are
seperate for each workspace folder. There is a json schema supplied by the
extension to guide you through the editing process. Changing the configuration
file will trigger a validation of the schema and the configurations are only
changed, if the file is validated sucessfully. Afterwards, the build directories
are updated to reflect the new configurations.

The base structure of the `cmake_configurations.json` file looks like:

```
{
  configurations: [
    ...
  ]
}
```

The `configurations` property holds an array of `configuration` objects.

# configuration
A configuration has the following properties:
 * [`name`](#configuration-name)
 * [`buildDirectory`](#configuration-buildDirectory)
 * generator
 * buildType
 * toolchain
 * env
 * cacheEntries

## configuration.name
Specifies the name of the configuration. Must be a unique within the configurations.
The name is shown in the status bar and used to the select a new configuration.

## configuration.buildDirectory
Sets the CMake build directory, where the build system is generated.

# Variable substitutions

