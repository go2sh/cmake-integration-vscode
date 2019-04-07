---
id: troubleshooting
title: Troubleshooting
---

# Configuration fails on add or open

If your configuration process fails on adding a folder or opening a folder,
you can restart the configuration process by running the command
`Configure a project folder` and select the conrisponding folder.

# Geraterator mismatch
On seeing the followig error message:
```
Failed to activate protocol version: "CMAKE_GENERATOR" is set 
but incompatible with configured generator value.
```
You can restart CMake by running the `Restart CMake` command. This
will delete your build folder and start CMake with the new
generator. The other possibility is to set generator to the generator
of the build folder.
