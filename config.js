System.config({
  defaultJSExtensions: true,
  transpiler: "babel",
  babelOptions: {
    "optional": [
      "runtime",
      "optimisation.modules.system"
    ],
    "blacklist": []
  },
  paths: {
    "github:*": "jspm_packages/github/*",
    "npm:*": "jspm_packages/npm/*"
  },

  map: {
    "JustGoscha/allmighty-autocomplete": "github:JustGoscha/allmighty-autocomplete@master",
    "angular": "github:angular/bower-angular@1.5.7",
    "angular-bootstrap-dropdownandtab": "npm:angular-bootstrap-dropdownandtab@1.0.6",
    "angular-cache": "npm:angular-cache@4.6.0",
    "angular-loading-bar": "npm:angular-loading-bar@0.9.0",
    "angular-local-storage": "npm:angular-local-storage@0.2.7",
    "angular-mocks": "github:angular/bower-angular-mocks@1.5.7",
    "angular-route": "github:angular/bower-angular-route@1.5.7",
    "angular-sanitize": "npm:angular-sanitize@1.5.7",
    "angular-ui/ui-tinymce": "github:angular-ui/ui-tinymce@0.0.16",
    "babel": "npm:babel-core@5.8.38",
    "babel-polyfill": "npm:babel-polyfill@6.9.1",
    "babel-runtime": "npm:babel-runtime@5.8.38",
    "bootstrap-css-only": "npm:bootstrap-css-only@3.3.6",
    "core-js": "npm:core-js@1.2.6",
    "css": "github:systemjs/plugin-css@0.1.23",
    "es6-module-loader": "npm:es6-module-loader@0.17.11",
    "font-awesome": "npm:font-awesome@4.6.3",
    "leon/angular-upload": "github:leon/angular-upload@1.0.12",
    "lodash": "npm:lodash@3.10.1",
    "text": "github:systemjs/plugin-text@0.0.3",
    "tinymce": "github:tinymce/tinymce-dist@4.3.13",
    "github:angular/bower-angular-mocks@1.5.7": {
      "angular": "github:angular/bower-angular@1.5.7"
    },
    "github:angular/bower-angular-route@1.5.7": {
      "angular": "github:angular/bower-angular@1.5.7"
    },
    "github:jspm/nodelibs-assert@0.1.0": {
      "assert": "npm:assert@1.4.1"
    },
    "github:jspm/nodelibs-buffer@0.1.0": {
      "buffer": "npm:buffer@3.6.0"
    },
    "github:jspm/nodelibs-path@0.1.0": {
      "path-browserify": "npm:path-browserify@0.0.0"
    },
    "github:jspm/nodelibs-process@0.1.2": {
      "process": "npm:process@0.11.5"
    },
    "github:jspm/nodelibs-util@0.1.0": {
      "util": "npm:util@0.10.3"
    },
    "github:jspm/nodelibs-vm@0.1.0": {
      "vm-browserify": "npm:vm-browserify@0.0.4"
    },
    "npm:angular-cache@4.6.0": {
      "angular": "npm:angular@1.5.7"
    },
    "npm:assert@1.4.1": {
      "assert": "github:jspm/nodelibs-assert@0.1.0",
      "buffer": "github:jspm/nodelibs-buffer@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.2",
      "util": "npm:util@0.10.3"
    },
    "npm:babel-polyfill@6.9.1": {
      "babel-runtime": "npm:babel-runtime@6.9.2",
      "core-js": "npm:core-js@2.4.0",
      "process": "github:jspm/nodelibs-process@0.1.2",
      "regenerator-runtime": "npm:regenerator-runtime@0.9.5"
    },
    "npm:babel-runtime@5.8.38": {
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:babel-runtime@6.9.2": {
      "core-js": "npm:core-js@2.4.0",
      "regenerator-runtime": "npm:regenerator-runtime@0.9.5"
    },
    "npm:buffer@3.6.0": {
      "base64-js": "npm:base64-js@0.0.8",
      "child_process": "github:jspm/nodelibs-child_process@0.1.0",
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "ieee754": "npm:ieee754@1.1.6",
      "isarray": "npm:isarray@1.0.0",
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:core-js@1.2.6": {
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "path": "github:jspm/nodelibs-path@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.2",
      "systemjs-json": "github:systemjs/plugin-json@0.1.2"
    },
    "npm:core-js@2.4.0": {
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "path": "github:jspm/nodelibs-path@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.2",
      "systemjs-json": "github:systemjs/plugin-json@0.1.2"
    },
    "npm:es6-module-loader@0.17.11": {
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "process": "github:jspm/nodelibs-process@0.1.2",
      "systemjs-json": "github:systemjs/plugin-json@0.1.2",
      "util": "github:jspm/nodelibs-util@0.1.0",
      "when": "npm:when@3.7.7"
    },
    "npm:font-awesome@4.6.3": {
      "css": "github:systemjs/plugin-css@0.1.23"
    },
    "npm:inherits@2.0.1": {
      "util": "github:jspm/nodelibs-util@0.1.0"
    },
    "npm:lodash@3.10.1": {
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:path-browserify@0.0.0": {
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:process@0.11.5": {
      "assert": "github:jspm/nodelibs-assert@0.1.0",
      "fs": "github:jspm/nodelibs-fs@0.1.2",
      "vm": "github:jspm/nodelibs-vm@0.1.0"
    },
    "npm:regenerator-runtime@0.9.5": {
      "path": "github:jspm/nodelibs-path@0.1.0",
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:util@0.10.3": {
      "inherits": "npm:inherits@2.0.1",
      "process": "github:jspm/nodelibs-process@0.1.2"
    },
    "npm:vm-browserify@0.0.4": {
      "indexof": "npm:indexof@0.0.1"
    },
    "npm:when@3.7.7": {
      "process": "github:jspm/nodelibs-process@0.1.2"
    }
  }
});
