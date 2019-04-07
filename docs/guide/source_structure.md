---
title: Source Structure
---

# Source Structure

As seen befor, each CMake Folder has a set of elements describing the
build process. General structure looks like this:
```
  -> Source Folder
    -> Project
      -> Target
      -> ...
    -> ...
    -> Configurations
      -> Configuration
      -> ...
  -> ...
```
## Source Folder
A source folder is a folder containing the root `CMakeLists.txt` file 
(currently only workspace root). This CMake file describes the build process
for the source folder and The project and target informations are
extracted from it. 

## Project
The first project is specified in the root
`CMakeLists.txt` file, additional projects can be added through the
`add_subdirectory` directive in this file. Each project can have a list
of targets associated with the it and spefied by the it's CMake files.

::: tip
The main purpose of projects is to group targets under a certain name.
(Usually by importing some 3rd party sources or grouping a big code base
by projects) They have no relevance for the build process itself as there
is only one build folder per source folder.
:::

## Target
A targets specifies a concrete build step like an executuable or a library.
Targets can be build either individually or all targets of a source folder.

## Configuration
Additionally, each source folder has a list of configurations controlling
the build process. The default configrations just mimic the 
CMake build types (Debug, Release, RelWithDebInfo, MinSizeRel). Take a look
at the [Configuration Reference](../reference/configurations.md) for more
informations about configurations.
