(window.webpackJsonp=window.webpackJsonp||[]).push([[11],{213:function(e,t,a){"use strict";a.r(t);var o=a(0),n=Object(o.a)({},(function(){var e=this,t=e.$createElement,a=e._self._c||t;return a("ContentSlotsDistributor",{attrs:{"slot-key":e.$parent.slotKey}},[a("h1",{attrs:{id:"extension-settings"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#extension-settings"}},[e._v("#")]),e._v(" Extension Settings")]),e._v(" "),a("h2",{attrs:{id:"cmake-options"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#cmake-options"}},[e._v("#")]),e._v(" CMake Options")]),e._v(" "),a("ul",[a("li",[a("code",[e._v("cmake.cmakePath")]),e._v(": Path to the CMake executable")]),e._v(" "),a("li",[a("code",[e._v("cmake.cmakeAPI")]),e._v(": Choose between CMake Server (depreacted) or File API")])]),e._v(" "),a("h2",{attrs:{id:"visual-settings"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#visual-settings"}},[e._v("#")]),e._v(" Visual Settings")]),e._v(" "),a("ul",[a("li",[a("code",[e._v("cmake.configureOnStart")]),e._v(": Start the configuration process when opening\na source folder (eg. starting VSCode, adding workspace folder)")]),e._v(" "),a("li",[a("code",[e._v("cmake.showConsoleAutomatically")]),e._v(": Automatically show the CMake or build output")]),e._v(" "),a("li",[a("code",[e._v("cmake.reconfigureOnChange")]),e._v(": Start the (re-)configuration process when\nchanging CMake files.")])]),e._v(" "),a("h2",{attrs:{id:"configuration-defaults"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#configuration-defaults"}},[e._v("#")]),e._v(" Configuration Defaults")]),e._v(" "),a("p",[e._v("The following settings describe the default values for configurations, which\nwill be used if no value is presend with in the configurations files. All\nsettings behave the same as they were specified in the configurations file (e.g\nvariable substitution). The defaults can be set on a user, workspace (window) or\nfolder level. The value in brackets afterwards, show the default value for the\nsettings.")]),e._v(" "),a("ul",[a("li",[a("code",[e._v("cmake.default.generator")]),e._v(": The default generator (Default: Ninja)")]),e._v(" "),a("li",[a("code",[e._v("cmake.default.extraGenerator")]),e._v(": The default extra generator")]),e._v(" "),a("li",[a("code",[e._v("cmake.default.buildDirectory")]),e._v(": The default build folder\n(Default: ${workspaceFolder}/build)")]),e._v(" "),a("li",[a("code",[e._v("cmake.default.cacheEntries")]),e._v(": The default cache entries")]),e._v(" "),a("li",[a("code",[e._v("cmake.default.env")]),e._v(": The default environment variables")])]),e._v(" "),a("h2",{attrs:{id:"cpptools-integration"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#cpptools-integration"}},[e._v("#")]),e._v(" Cpptools Integration")]),e._v(" "),a("p",[e._v("CMake Integration extension provides build information to the cpptools\nExtension for C/C++ Source files to support language services. The\nbehaviour of the integration can be customize through the VS Code settings. For\nmore information about "),a("code",[e._v("BrowseConfiguration")]),e._v(" and "),a("code",[e._v("SourceFileConfiguration")]),e._v(" also\nrefer to the cpptools documentation. When no settings are used, the compiler\npath and Windows SDK Version (for MSVC) are guessed from the coresponding\nCMake cache entries. This is not very reliable as those informations are not\nalways written to the cache.")]),e._v(" "),a("ul",[a("li",[a("code",[e._v("cmake.cpptools.globalBrowseTargets")]),e._v(": Select custom projects or targets to\ninclude in the global browse configuration.")]),e._v(" "),a("li",[a("code",[e._v("cmake.cpptools.browseTargets")]),e._v(": Select custom projects or targets to include\nin the workspace browse configuration.")]),e._v(" "),a("li",[a("code",[e._v("cmake.cpptools.guessSourceFileConfigurations")]),e._v(": Enable guessing a\nSourceFileConfiguration for files unknown to CMake. Configurations are guessed\nbased on paths of targets. (Default: True)")]),e._v(" "),a("li",[a("code",[e._v("cmake.cpptools.compilerPath")]),e._v(": Provides the compiler path reported to\ncpptools. If empty, the compiler path from CMake is used. CMake currently\nis unreliable and it is a good choice to set the path in the settings.")]),e._v(" "),a("li",[a("code",[e._v("cmake.cpptools.intelliSenseMode")]),e._v(": Provide the intelliSense Mode. When\nnot set, the mode is determined by the compiler path.")]),e._v(" "),a("li",[a("code",[e._v("cmake.cpptools.windowsSdkVersion")]),e._v(": Provides the Windows SDK Version\nreported to cpptools. If empty, the version from CMake is used. CMake currently is unreliable and it is a good choice to set the version in the\nsettings.")]),e._v(" "),a("li",[a("code",[e._v("cmake.cpptools.languageConfiguration.CXX")]),e._v(",\n"),a("code",[e._v("cmake.cpptools.languageConfiguration.C")]),e._v(",\n"),a("code",[e._v("cmake.cpptools.languageConfiguration.CUDA")]),e._v(": Language dependend settings for\nthe compilerPath and the intelliSense Mode. This settings have the highest\npredecence when resolving the path and mode.")])]),e._v(" "),a("h2",{attrs:{id:"build-settings"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#build-settings"}},[e._v("#")]),e._v(" Build Settings")]),e._v(" "),a("p",[e._v("The extensions allows you to extended the dependencies management\nbeyond a single source folder by specifying special workspace\nsettings.")]),e._v(" "),a("h3",{attrs:{id:"target-selection"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#target-selection"}},[e._v("#")]),e._v(" Target Selection")]),e._v(" "),a("p",[e._v("Target for those special settings can be either a full project\nbuilding all targets of this project")]),e._v(" "),a("div",{staticClass:"language- extra-class"},[a("pre",{pre:!0,attrs:{class:"language-text"}},[a("code",[e._v('{ "project": "cmake" }\n')])])]),a("p",[e._v("or a single target from a project.")]),e._v(" "),a("div",{staticClass:"language- extra-class"},[a("pre",{pre:!0,attrs:{class:"language-text"}},[a("code",[e._v('{ "project": "cmake", "target": "ctest" }\n')])])]),a("h3",{attrs:{id:"workspace-targets"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#workspace-targets"}},[e._v("#")]),e._v(" Workspace Targets")]),e._v(" "),a("p",[e._v("With the "),a("code",[e._v("cmake.build.workspaceTargets")]),e._v(" setting option, the behaviour of\nthe "),a("code",[e._v("cmake.build.buildWorkspace")]),e._v(" command can be changed. By default, all\ntargets of each project in a workspace will be build. Alternatively,\nthe setting allows to specify an array of targets as described above,\nwhich will be build instead. This includes all dependencies specified\neither by CMake or by this extension.")]),e._v(" "),a("div",{staticClass:"language- extra-class"},[a("pre",{pre:!0,attrs:{class:"language-text"}},[a("code",[e._v('"cmake.build.workspaceTargets": [\n  { "project": "projectA" },\n  { "project": "projectB", "target": "commandA" }\n],\n')])])]),a("h3",{attrs:{id:"target-dependencies"}},[a("a",{staticClass:"header-anchor",attrs:{href:"#target-dependencies"}},[e._v("#")]),e._v(" Target Dependencies")]),e._v(" "),a("p",[e._v("In addition to the dependency management provided by CMake, the extension\nprovides a mechanism to specify dependencies between different CMake\nsource folder (or workspace folders). Prio to building a certain target or\nproject, all dependencies will be resolved and build. In case of building\na project (build all), all dependencies of the project and all dependencies\nof the project targets will be used.")]),e._v(" "),a("div",{staticClass:"language- extra-class"},[a("pre",{pre:!0,attrs:{class:"language-text"}},[a("code",[e._v('"cmake.build.targetDependencies": [\n  { \n    "project": "projectB",\n    "target": "exeB",\n    "dependencies": [\n      { "project": "projectA", "target": "libA" }\n    ]\n  }\n]\n')])])]),a("p",[e._v("The example shows, how a library in an extra CMake source folder can be build,\nbefore the executable linking to it.")])])}),[],!1,null,null,null);t.default=n.exports}}]);