---
title: Quickstart
---
# Quick Start
## Setup

Open your VS Code Settings to configure your default generator. 
It is recommanded to set this in the user settings to get a 
proper default for every project. Search for the `cmake.generator`
key and select the generator. The default generator is `Ninja`.

Add or open your CMake project folder(s). 

# Configuration
The extension automatically starts to configure your project 
and loads the CMake project information.

You can monitor the progress in an output tab with the name 
`CMake - FolderName`. After successful configuration, your first 
project should be connected to the extension. The CMake informations
are shown in three status bar elements (Project, Target, Configuration).
They can be clicked to select a different element through a quick pick.

## Build

Select the your project and target to build and press the `F7` key to start
the build process. Alternatively, you can press `Shift+F7` to build all targets
in the current project.

## Next Steps

 * [Troubleshooting](./troubleshooting.md)
 * [Edit Configurations](../reference/configurations.md)