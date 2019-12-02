# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0] 2019-12-02
### Added
 - VSCode settings to override missing CMake informations (e.g compiler path)
 - Compiler based detection for C++ standard
 - Gethering toolchain information from CMake

### Changed
 - cpptools API v3 is now used
 - Reworked Configuration Provider for cpptools
 - Reworked internal extension design
 - Using more strict TypeScript settings

### Fixed
 - Configuration with extra generator is now working
 - Version detection with no standard executable name
 - Reported path names for server API
 - MSVC C++ standard detection
 - Detection fatal error diagnostic for gcc

## [0.6.5] 2019-09-11
### Fixes
- Calculate reported C++ version corretly (for cpptools)
- Fix compiler path generation (for cpptools)

## [0.6.4] 2019-09-10
### Fixes
- Fix long running configure and build tasks

## [0.6.3] 2019-08-15
### Fixed
- Fix bug with async loading of project targets

## [0.6.2] 2019-08-15
### Fixed
- Add `launch.json` file
- Fix bug in fileApi types
- Clear diagnostics before rebuild

## [0.6.1] 2019-07-17
### Fixed
- Handling spaces in CMake path

## [0.6.0] 2019-07-16
### Changed
 - Added new setting for the API selection "Auto" and marked it default

### Added
 - Auto detection of API to use
 - `install` and `all` targets in status bar
 - Install commands
 - Variable replacement for toolchain config
 
## [0.4.1] 2019-06-09
### Fixed
 - Fixed ariable replacement for configurations (#15)

### Added
 - Added escape sequence for variables

## [0.4.0] 2019-06-06
### Fixed
 - Fixed default setting for configurations
 - Fixed compability for TS 3.5
 - Add correct cache arguments
 - Fix edit configurations command

### Changed
 - Renamed CMake cache entries setting to `cacheEntries` 
 - Aligned settings `cacheEntries` to configuration type
 - Let configure tasks pick a source folder

### Added
 - Version information on update
 - Documentation
 - Add edit current configurations

## [0.4.0-beta4] 2019-03-11
### Fixed
 - CMake Server Client respects cache entries from configurations (#13)
## Added
 - cpptools API now receives command line options @bjosa (#14)
 - Added setting to switch between file API and server
 - Added diagnostics for CMake errors

## [0.4.0-beta3] 2019-03-06
### Fixed
- Fixed schema for configs with no generator
- Fixed problem matchers for server and command client
- Fixed toolchain file for server client

## [0.4.0-beta2] 2019-03-06
### Fixed
 - Add schema file to vix package
## [0.4.0-beta1] 2019-03-05
### Added
- Added support for custom configurations (cmake_configurations.json)
- Added support for variables replacement for configuration elements (e.g. build directory)
- Added support for toolchain sepecification (via configuration)
- Added support for new CMake File API (CMake Version >= 3.14)

### Removed
- Removed `cmake.generatorToolset`, `cmake.generatorPlatform`, `cmake.buildTypes` (Use configuration file)
- Removed `cmake.configureEnviroment`, `cmake.buildEnvironment` (replaced with `cmake.env`)

### Changed
- Renamed `cmake.cacheEntries` to `cmake.variables` and updated type
- Changed build type selection to configuration selection
- Reworked internal model to support CMake Server and File API
- Use webpack to build extension

## [0.3.2] 2019-02-08
### Fixed
 - Windows path handling
 - Provide configuration on windows
 - Provide configuration for non-target files in project directory (merged project configuration)

## [0.3.1] 2019-02-06
### Fixed
- Added cpptools as dependency to resolve extension not starting
- Fix unlink for pipe on windows
- Fix empty include path error in cppprovider

## [0.3.0] 2019-02-06
### Added
- Add cpptools configuration provider

### Fixed
- Error reporting of cmake client
- Error handling of cmake server process and socket

## [0.2.1] 2019-01-22
### Fixed
- Fixed selecting subprojects

## [0.2.0] 2019-01-22
### Changed
- Use CMake codemodel internally
- Use full names for targets
- Show the type in target selection
- Hide imported and interface targets from target selection

### Added
- Option to bring CMake output to front automatically
- Option to reconfigure the project on changes to CMake files.

### Fixed
- Update internal model during configuration change
- Remove socket on exit

## [0.1.3] 2018-12-22
### Fixes
- Display correct project and target values on first run

## [0.1.2] 2018-12-21
### Fixed
- Fixed GCC diagnostic parsing and positioning
- Fixed Configurations for single config generators

### Added
- Added parsing for GCC include stack

## [0.1.1] 2018-12-20
- Add logo
- Update README.md

## [0.1.0] 2018-12-19
- Initial release