"format global";
(function(global) {

  var defined = {};

  // indexOf polyfill for IE8
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  var getOwnPropertyDescriptor = true;
  try {
    Object.getOwnPropertyDescriptor({ a: 0 }, 'a');
  }
  catch(e) {
    getOwnPropertyDescriptor = false;
  }

  var defineProperty;
  (function () {
    try {
      if (!!Object.defineProperty({}, 'a', {}))
        defineProperty = Object.defineProperty;
    }
    catch (e) {
      defineProperty = function(obj, prop, opt) {
        try {
          obj[prop] = opt.value || opt.get.call(obj);
        }
        catch(e) {}
      }
    }
  })();

  function register(name, deps, declare) {
    if (arguments.length === 4)
      return registerDynamic.apply(this, arguments);
    doRegister(name, {
      declarative: true,
      deps: deps,
      declare: declare
    });
  }

  function registerDynamic(name, deps, executingRequire, execute) {
    doRegister(name, {
      declarative: false,
      deps: deps,
      executingRequire: executingRequire,
      execute: execute
    });
  }

  function doRegister(name, entry) {
    entry.name = name;

    // we never overwrite an existing define
    if (!(name in defined))
      defined[name] = entry;

    // we have to normalize dependencies
    // (assume dependencies are normalized for now)
    // entry.normalizedDeps = entry.deps.map(normalize);
    entry.normalizedDeps = entry.deps;
  }


  function buildGroups(entry, groups) {
    groups[entry.groupIndex] = groups[entry.groupIndex] || [];

    if (indexOf.call(groups[entry.groupIndex], entry) != -1)
      return;

    groups[entry.groupIndex].push(entry);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];

      // not in the registry means already linked / ES6
      if (!depEntry || depEntry.evaluated)
        continue;

      // now we know the entry is in our unlinked linkage group
      var depGroupIndex = entry.groupIndex + (depEntry.declarative != entry.declarative);

      // the group index of an entry is always the maximum
      if (depEntry.groupIndex === undefined || depEntry.groupIndex < depGroupIndex) {

        // if already in a group, remove from the old group
        if (depEntry.groupIndex !== undefined) {
          groups[depEntry.groupIndex].splice(indexOf.call(groups[depEntry.groupIndex], depEntry), 1);

          // if the old group is empty, then we have a mixed depndency cycle
          if (groups[depEntry.groupIndex].length == 0)
            throw new TypeError("Mixed dependency cycle detected");
        }

        depEntry.groupIndex = depGroupIndex;
      }

      buildGroups(depEntry, groups);
    }
  }

  function link(name) {
    var startEntry = defined[name];

    startEntry.groupIndex = 0;

    var groups = [];

    buildGroups(startEntry, groups);

    var curGroupDeclarative = !!startEntry.declarative == groups.length % 2;
    for (var i = groups.length - 1; i >= 0; i--) {
      var group = groups[i];
      for (var j = 0; j < group.length; j++) {
        var entry = group[j];

        // link each group
        if (curGroupDeclarative)
          linkDeclarativeModule(entry);
        else
          linkDynamicModule(entry);
      }
      curGroupDeclarative = !curGroupDeclarative; 
    }
  }

  // module binding records
  var moduleRecords = {};
  function getOrCreateModuleRecord(name) {
    return moduleRecords[name] || (moduleRecords[name] = {
      name: name,
      dependencies: [],
      exports: {}, // start from an empty module and extend
      importers: []
    })
  }

  function linkDeclarativeModule(entry) {
    // only link if already not already started linking (stops at circular)
    if (entry.module)
      return;

    var module = entry.module = getOrCreateModuleRecord(entry.name);
    var exports = entry.module.exports;

    var declaration = entry.declare.call(global, function(name, value) {
      module.locked = true;

      if (typeof name == 'object') {
        for (var p in name)
          exports[p] = name[p];
      }
      else {
        exports[name] = value;
      }

      for (var i = 0, l = module.importers.length; i < l; i++) {
        var importerModule = module.importers[i];
        if (!importerModule.locked) {
          for (var j = 0; j < importerModule.dependencies.length; ++j) {
            if (importerModule.dependencies[j] === module) {
              importerModule.setters[j](exports);
            }
          }
        }
      }

      module.locked = false;
      return value;
    });

    module.setters = declaration.setters;
    module.execute = declaration.execute;

    // now link all the module dependencies
    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      var depEntry = defined[depName];
      var depModule = moduleRecords[depName];

      // work out how to set depExports based on scenarios...
      var depExports;

      if (depModule) {
        depExports = depModule.exports;
      }
      else if (depEntry && !depEntry.declarative) {
        depExports = depEntry.esModule;
      }
      // in the module registry
      else if (!depEntry) {
        depExports = load(depName);
      }
      // we have an entry -> link
      else {
        linkDeclarativeModule(depEntry);
        depModule = depEntry.module;
        depExports = depModule.exports;
      }

      // only declarative modules have dynamic bindings
      if (depModule && depModule.importers) {
        depModule.importers.push(module);
        module.dependencies.push(depModule);
      }
      else
        module.dependencies.push(null);

      // run the setter for this dependency
      if (module.setters[i])
        module.setters[i](depExports);
    }
  }

  // An analog to loader.get covering execution of all three layers (real declarative, simulated declarative, simulated dynamic)
  function getModule(name) {
    var exports;
    var entry = defined[name];

    if (!entry) {
      exports = load(name);
      if (!exports)
        throw new Error("Unable to load dependency " + name + ".");
    }

    else {
      if (entry.declarative)
        ensureEvaluated(name, []);

      else if (!entry.evaluated)
        linkDynamicModule(entry);

      exports = entry.module.exports;
    }

    if ((!entry || entry.declarative) && exports && exports.__useDefault)
      return exports['default'];

    return exports;
  }

  function linkDynamicModule(entry) {
    if (entry.module)
      return;

    var exports = {};

    var module = entry.module = { exports: exports, id: entry.name };

    // AMD requires execute the tree first
    if (!entry.executingRequire) {
      for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
        var depName = entry.normalizedDeps[i];
        var depEntry = defined[depName];
        if (depEntry)
          linkDynamicModule(depEntry);
      }
    }

    // now execute
    entry.evaluated = true;
    var output = entry.execute.call(global, function(name) {
      for (var i = 0, l = entry.deps.length; i < l; i++) {
        if (entry.deps[i] != name)
          continue;
        return getModule(entry.normalizedDeps[i]);
      }
      throw new TypeError('Module ' + name + ' not declared as a dependency.');
    }, exports, module);

    if (output)
      module.exports = output;

    // create the esModule object, which allows ES6 named imports of dynamics
    exports = module.exports;
 
    if (exports && exports.__esModule) {
      entry.esModule = exports;
    }
    else {
      entry.esModule = {};
      
      // don't trigger getters/setters in environments that support them
      if ((typeof exports == 'object' || typeof exports == 'function') && exports !== global) {
        if (getOwnPropertyDescriptor) {
          var d;
          for (var p in exports)
            if (d = Object.getOwnPropertyDescriptor(exports, p))
              defineProperty(entry.esModule, p, d);
        }
        else {
          var hasOwnProperty = exports && exports.hasOwnProperty;
          for (var p in exports) {
            if (!hasOwnProperty || exports.hasOwnProperty(p))
              entry.esModule[p] = exports[p];
          }
         }
       }
      entry.esModule['default'] = exports;
      defineProperty(entry.esModule, '__useDefault', {
        value: true
      });
    }
  }

  /*
   * Given a module, and the list of modules for this current branch,
   *  ensure that each of the dependencies of this module is evaluated
   *  (unless one is a circular dependency already in the list of seen
   *  modules, in which case we execute it)
   *
   * Then we evaluate the module itself depth-first left to right 
   * execution to match ES6 modules
   */
  function ensureEvaluated(moduleName, seen) {
    var entry = defined[moduleName];

    // if already seen, that means it's an already-evaluated non circular dependency
    if (!entry || entry.evaluated || !entry.declarative)
      return;

    // this only applies to declarative modules which late-execute

    seen.push(moduleName);

    for (var i = 0, l = entry.normalizedDeps.length; i < l; i++) {
      var depName = entry.normalizedDeps[i];
      if (indexOf.call(seen, depName) == -1) {
        if (!defined[depName])
          load(depName);
        else
          ensureEvaluated(depName, seen);
      }
    }

    if (entry.evaluated)
      return;

    entry.evaluated = true;
    entry.module.execute.call(global);
  }

  // magical execution function
  var modules = {};
  function load(name) {
    if (modules[name])
      return modules[name];

    // node core modules
    if (name.substr(0, 6) == '@node/')
      return require(name.substr(6));

    var entry = defined[name];

    // first we check if this module has already been defined in the registry
    if (!entry)
      throw "Module " + name + " not present.";

    // recursively ensure that the module and all its 
    // dependencies are linked (with dependency group handling)
    link(name);

    // now handle dependency execution in correct order
    ensureEvaluated(name, []);

    // remove from the registry
    defined[name] = undefined;

    // exported modules get __esModule defined for interop
    if (entry.declarative)
      defineProperty(entry.module.exports, '__esModule', { value: true });

    // return the defined module object
    return modules[name] = entry.declarative ? entry.module.exports : entry.esModule;
  };

  return function(mains, depNames, declare) {
    return function(formatDetect) {
      formatDetect(function(deps) {
        var System = {
          _nodeRequire: typeof require != 'undefined' && require.resolve && typeof process != 'undefined' && require,
          register: register,
          registerDynamic: registerDynamic,
          get: load, 
          set: function(name, module) {
            modules[name] = module; 
          },
          newModule: function(module) {
            return module;
          }
        };
        System.set('@empty', {});

        // register external dependencies
        for (var i = 0; i < depNames.length; i++) (function(depName, dep) {
          if (dep && dep.__esModule)
            System.register(depName, [], function(_export) {
              return {
                setters: [],
                execute: function() {
                  for (var p in dep)
                    if (p != '__esModule' && !(typeof p == 'object' && p + '' == 'Module'))
                      _export(p, dep[p]);
                }
              };
            });
          else
            System.registerDynamic(depName, [], false, function() {
              return dep;
            });
        })(depNames[i], arguments[i]);

        // register modules in this bundle
        declare(System);

        // load mains
        var firstLoad = load(mains[0]);
        if (mains.length > 1)
          for (var i = 1; i < mains.length; i++)
            load(mains[i]);

        if (firstLoad.__useDefault)
          return firstLoad['default'];
        else
          return firstLoad;
      });
    };
  };

})(typeof self != 'undefined' ? self : global)
/* (['mainModule'], ['external-dep'], function($__System) {
  System.register(...);
})
(function(factory) {
  if (typeof define && define.amd)
    define(['external-dep'], factory);
  // etc UMD / module pattern
})*/

(['1'], [], function($__System) {

(function(__global) {
  var loader = $__System;
  var hasOwnProperty = Object.prototype.hasOwnProperty;
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  function readMemberExpression(p, value) {
    var pParts = p.split('.');
    while (pParts.length)
      value = value[pParts.shift()];
    return value;
  }

  // bare minimum ignores for IE8
  var ignoredGlobalProps = ['_g', 'sessionStorage', 'localStorage', 'clipboardData', 'frames', 'external', 'mozAnimationStartTime', 'webkitStorageInfo', 'webkitIndexedDB'];

  var globalSnapshot;

  function forEachGlobal(callback) {
    if (Object.keys)
      Object.keys(__global).forEach(callback);
    else
      for (var g in __global) {
        if (!hasOwnProperty.call(__global, g))
          continue;
        callback(g);
      }
  }

  function forEachGlobalValue(callback) {
    forEachGlobal(function(globalName) {
      if (indexOf.call(ignoredGlobalProps, globalName) != -1)
        return;
      try {
        var value = __global[globalName];
      }
      catch (e) {
        ignoredGlobalProps.push(globalName);
      }
      callback(globalName, value);
    });
  }

  loader.set('@@global-helpers', loader.newModule({
    prepareGlobal: function(moduleName, exportName, globals) {
      // disable module detection
      var curDefine = __global.define;
       
      __global.define = undefined;
      __global.exports = undefined;
      if (__global.module && __global.module.exports)
        __global.module = undefined;

      // set globals
      var oldGlobals;
      if (globals) {
        oldGlobals = {};
        for (var g in globals) {
          oldGlobals[g] = globals[g];
          __global[g] = globals[g];
        }
      }

      // store a complete copy of the global object in order to detect changes
      if (!exportName) {
        globalSnapshot = {};

        forEachGlobalValue(function(name, value) {
          globalSnapshot[name] = value;
        });
      }

      // return function to retrieve global
      return function() {
        var globalValue;

        if (exportName) {
          globalValue = readMemberExpression(exportName, __global);
        }
        else {
          var singleGlobal;
          var multipleExports;
          var exports = {};

          forEachGlobalValue(function(name, value) {
            if (globalSnapshot[name] === value)
              return;
            if (typeof value == 'undefined')
              return;
            exports[name] = value;

            if (typeof singleGlobal != 'undefined') {
              if (!multipleExports && singleGlobal !== value)
                multipleExports = true;
            }
            else {
              singleGlobal = value;
            }
          });
          globalValue = multipleExports ? exports : singleGlobal;
        }

        // revert globals
        if (oldGlobals) {
          for (var g in oldGlobals)
            __global[g] = oldGlobals[g];
        }
        __global.define = curDefine;

        return globalValue;
      };
    }
  }));

})(typeof self != 'undefined' ? self : global);

(function(__global) {
  var loader = $__System;
  var indexOf = Array.prototype.indexOf || function(item) {
    for (var i = 0, l = this.length; i < l; i++)
      if (this[i] === item)
        return i;
    return -1;
  }

  var commentRegEx = /(\/\*([\s\S]*?)\*\/|([^:]|^)\/\/(.*)$)/mg;
  var cjsRequirePre = "(?:^|[^$_a-zA-Z\\xA0-\\uFFFF.])";
  var cjsRequirePost = "\\s*\\(\\s*(\"([^\"]+)\"|'([^']+)')\\s*\\)";
  var fnBracketRegEx = /\(([^\)]*)\)/;
  var wsRegEx = /^\s+|\s+$/g;
  
  var requireRegExs = {};

  function getCJSDeps(source, requireIndex) {

    // remove comments
    source = source.replace(commentRegEx, '');

    // determine the require alias
    var params = source.match(fnBracketRegEx);
    var requireAlias = (params[1].split(',')[requireIndex] || 'require').replace(wsRegEx, '');

    // find or generate the regex for this requireAlias
    var requireRegEx = requireRegExs[requireAlias] || (requireRegExs[requireAlias] = new RegExp(cjsRequirePre + requireAlias + cjsRequirePost, 'g'));

    requireRegEx.lastIndex = 0;

    var deps = [];

    var match;
    while (match = requireRegEx.exec(source))
      deps.push(match[2] || match[3]);

    return deps;
  }

  /*
    AMD-compatible require
    To copy RequireJS, set window.require = window.requirejs = loader.amdRequire
  */
  function require(names, callback, errback, referer) {
    // in amd, first arg can be a config object... we just ignore
    if (typeof names == 'object' && !(names instanceof Array))
      return require.apply(null, Array.prototype.splice.call(arguments, 1, arguments.length - 1));

    // amd require
    if (typeof names == 'string' && typeof callback == 'function')
      names = [names];
    if (names instanceof Array) {
      var dynamicRequires = [];
      for (var i = 0; i < names.length; i++)
        dynamicRequires.push(loader['import'](names[i], referer));
      Promise.all(dynamicRequires).then(function(modules) {
        if (callback)
          callback.apply(null, modules);
      }, errback);
    }

    // commonjs require
    else if (typeof names == 'string') {
      var module = loader.get(names);
      return module.__useDefault ? module['default'] : module;
    }

    else
      throw new TypeError('Invalid require');
  }

  function define(name, deps, factory) {
    if (typeof name != 'string') {
      factory = deps;
      deps = name;
      name = null;
    }
    if (!(deps instanceof Array)) {
      factory = deps;
      deps = ['require', 'exports', 'module'].splice(0, factory.length);
    }

    if (typeof factory != 'function')
      factory = (function(factory) {
        return function() { return factory; }
      })(factory);

    // in IE8, a trailing comma becomes a trailing undefined entry
    if (deps[deps.length - 1] === undefined)
      deps.pop();

    // remove system dependencies
    var requireIndex, exportsIndex, moduleIndex;
    
    if ((requireIndex = indexOf.call(deps, 'require')) != -1) {
      
      deps.splice(requireIndex, 1);

      // only trace cjs requires for non-named
      // named defines assume the trace has already been done
      if (!name)
        deps = deps.concat(getCJSDeps(factory.toString(), requireIndex));
    }

    if ((exportsIndex = indexOf.call(deps, 'exports')) != -1)
      deps.splice(exportsIndex, 1);
    
    if ((moduleIndex = indexOf.call(deps, 'module')) != -1)
      deps.splice(moduleIndex, 1);

    var define = {
      name: name,
      deps: deps,
      execute: function(req, exports, module) {

        var depValues = [];
        for (var i = 0; i < deps.length; i++)
          depValues.push(req(deps[i]));

        module.uri = module.id;

        module.config = function() {};

        // add back in system dependencies
        if (moduleIndex != -1)
          depValues.splice(moduleIndex, 0, module);
        
        if (exportsIndex != -1)
          depValues.splice(exportsIndex, 0, exports);
        
        if (requireIndex != -1) 
          depValues.splice(requireIndex, 0, function(names, callback, errback) {
            if (typeof names == 'string' && typeof callback != 'function')
              return req(names);
            return require.call(loader, names, callback, errback, module.id);
          });

        var output = factory.apply(exportsIndex == -1 ? __global : exports, depValues);

        if (typeof output == 'undefined' && module)
          output = module.exports;

        if (typeof output != 'undefined')
          return output;
      }
    };

    // anonymous define
    if (!name) {
      // already defined anonymously -> throw
      if (lastModule.anonDefine)
        throw new TypeError('Multiple defines for anonymous module');
      lastModule.anonDefine = define;
    }
    // named define
    else {
      // if we don't have any other defines,
      // then let this be an anonymous define
      // this is just to support single modules of the form:
      // define('jquery')
      // still loading anonymously
      // because it is done widely enough to be useful
      if (!lastModule.anonDefine && !lastModule.isBundle) {
        lastModule.anonDefine = define;
      }
      // otherwise its a bundle only
      else {
        // if there is an anonDefine already (we thought it could have had a single named define)
        // then we define it now
        // this is to avoid defining named defines when they are actually anonymous
        if (lastModule.anonDefine && lastModule.anonDefine.name)
          loader.registerDynamic(lastModule.anonDefine.name, lastModule.anonDefine.deps, false, lastModule.anonDefine.execute);

        lastModule.anonDefine = null;
      }

      // note this is now a bundle
      lastModule.isBundle = true;

      // define the module through the register registry
      loader.registerDynamic(name, define.deps, false, define.execute);
    }
  }
  define.amd = {};

  // adds define as a global (potentially just temporarily)
  function createDefine(loader) {
    lastModule.anonDefine = null;
    lastModule.isBundle = false;

    // ensure no NodeJS environment detection
    var oldModule = __global.module;
    var oldExports = __global.exports;
    var oldDefine = __global.define;

    __global.module = undefined;
    __global.exports = undefined;
    __global.define = define;

    return function() {
      __global.define = oldDefine;
      __global.module = oldModule;
      __global.exports = oldExports;
    };
  }

  var lastModule = {
    isBundle: false,
    anonDefine: null
  };

  loader.set('@@amd-helpers', loader.newModule({
    createDefine: createDefine,
    require: require,
    define: define,
    lastModule: lastModule
  }));
  loader.amdDefine = define;
  loader.amdRequire = require;
})(typeof self != 'undefined' ? self : global);

"bundle";
(function() {
var _removeDefine = $__System.get("@@amd-helpers").createDefine();
define("2", [], function() {
  return "<div class=\"container\">\r\n    <uib-tabset>\r\n        <uib-tab ng-repeat=\"tab in categoryTabs\" \r\n                heading=\"{{tab.title}}\" id=\"{{tab.id}}\" categories=\"{{ctrl.categories}}\"\r\n                active=\"tab.active\" disable=\"tab.disabled\" \r\n                select=\"selectSubCategories(tab.id)\">\r\n            \r\n            <!--<div class=\"dropdown\">\r\n                <button class=\"btn btn-default dropdown-toggle\" type=\"button\" id=\"dropdownMenu1\" data-toggle=\"dropdown\" aria-haspopup=\"true\" aria-expanded=\"true\">\r\n                    Please select\r\n                    <span class=\"caret\"></span>\r\n                </button>\r\n                <ul class=\"dropdown-menu\" aria-labelledby=\"dropdownMenu1\">                 \r\n                    <li ng-repeat=\"category in tab.categories track by _id\" ng-click=\"selectedCategory(category._id)\" title=\"{{category.description}}\">\r\n                        {{category.vietDescription}}\r\n                    </li>\r\n                </ul>\r\n            </div>-->\r\n            <select ng-model=\"categoryId\">\r\n                            <option ng-repeat=\"option in tab.categories\" value=\"{{option._id}}\" title=\"{{option.description}}\">{{option.vietDescription}}</option>   \r\n                        </select>\r\n                        \r\n            \r\n        </uib-tab>\r\n    </uib-tabset>\r\n</div>";
});

_removeDefine();
})();
$__System.registerDynamic("3", ["4"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var ITERATOR = req('4')('iterator'),
      SAFE_CLOSING = false;
  try {
    var riter = [7][ITERATOR]();
    riter['return'] = function() {
      SAFE_CLOSING = true;
    };
    Array.from(riter, function() {
      throw 2;
    });
  } catch (e) {}
  module.exports = function(exec, skipClosing) {
    if (!skipClosing && !SAFE_CLOSING)
      return false;
    var safe = false;
    try {
      var arr = [7],
          iter = arr[ITERATOR]();
      iter.next = function() {
        safe = true;
      };
      arr[ITERATOR] = function() {
        return iter;
      };
      exec(arr);
    } catch (e) {}
    return safe;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("5", ["6", "7", "8", "4"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var core = req('6'),
      $ = req('7'),
      DESCRIPTORS = req('8'),
      SPECIES = req('4')('species');
  module.exports = function(KEY) {
    var C = core[KEY];
    if (DESCRIPTORS && C && !C[SPECIES])
      $.setDesc(C, SPECIES, {
        configurable: true,
        get: function() {
          return this;
        }
      });
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("9", ["a"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var redefine = req('a');
  module.exports = function(target, src) {
    for (var key in src)
      redefine(target, key, src[key]);
    return target;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("b", ["c", "d"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var isObject = req('c'),
      document = req('d').document,
      is = isObject(document) && isObject(document.createElement);
  module.exports = function(it) {
    return is ? document.createElement(it) : {};
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("e", ["d"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('d').document && document.documentElement;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("f", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(fn, args, that) {
    var un = that === undefined;
    switch (args.length) {
      case 0:
        return un ? fn() : fn.call(that);
      case 1:
        return un ? fn(args[0]) : fn.call(that, args[0]);
      case 2:
        return un ? fn(args[0], args[1]) : fn.call(that, args[0], args[1]);
      case 3:
        return un ? fn(args[0], args[1], args[2]) : fn.call(that, args[0], args[1], args[2]);
      case 4:
        return un ? fn(args[0], args[1], args[2], args[3]) : fn.call(that, args[0], args[1], args[2], args[3]);
    }
    return fn.apply(that, args);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("10", ["12", "f", "e", "b", "d", "13", "11"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    var ctx = req('12'),
        invoke = req('f'),
        html = req('e'),
        cel = req('b'),
        global = req('d'),
        process = global.process,
        setTask = global.setImmediate,
        clearTask = global.clearImmediate,
        MessageChannel = global.MessageChannel,
        counter = 0,
        queue = {},
        ONREADYSTATECHANGE = 'onreadystatechange',
        defer,
        channel,
        port;
    var run = function() {
      var id = +this;
      if (queue.hasOwnProperty(id)) {
        var fn = queue[id];
        delete queue[id];
        fn();
      }
    };
    var listner = function(event) {
      run.call(event.data);
    };
    if (!setTask || !clearTask) {
      setTask = function setImmediate(fn) {
        var args = [],
            i = 1;
        while (arguments.length > i)
          args.push(arguments[i++]);
        queue[++counter] = function() {
          invoke(typeof fn == 'function' ? fn : Function(fn), args);
        };
        defer(counter);
        return counter;
      };
      clearTask = function clearImmediate(id) {
        delete queue[id];
      };
      if (req('13')(process) == 'process') {
        defer = function(id) {
          process.nextTick(ctx(run, id, 1));
        };
      } else if (MessageChannel) {
        channel = new MessageChannel;
        port = channel.port2;
        channel.port1.onmessage = listner;
        defer = ctx(port.postMessage, port, 1);
      } else if (global.addEventListener && typeof postMessage == 'function' && !global.importScripts) {
        defer = function(id) {
          global.postMessage(id + '', '*');
        };
        global.addEventListener('message', listner, false);
      } else if (ONREADYSTATECHANGE in cel('script')) {
        defer = function(id) {
          html.appendChild(cel('script'))[ONREADYSTATECHANGE] = function() {
            html.removeChild(this);
            run.call(id);
          };
        };
      } else {
        defer = function(id) {
          setTimeout(ctx(run, id, 1), 0);
        };
      }
    }
    module.exports = {
      set: setTask,
      clear: clearTask
    };
  })(req('11'));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("14", ["d", "10", "13", "11"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    var global = req('d'),
        macrotask = req('10').set,
        Observer = global.MutationObserver || global.WebKitMutationObserver,
        process = global.process,
        Promise = global.Promise,
        isNode = req('13')(process) == 'process',
        head,
        last,
        notify;
    var flush = function() {
      var parent,
          domain,
          fn;
      if (isNode && (parent = process.domain)) {
        process.domain = null;
        parent.exit();
      }
      while (head) {
        domain = head.domain;
        fn = head.fn;
        if (domain)
          domain.enter();
        fn();
        if (domain)
          domain.exit();
        head = head.next;
      }
      last = undefined;
      if (parent)
        parent.enter();
    };
    if (isNode) {
      notify = function() {
        process.nextTick(flush);
      };
    } else if (Observer) {
      var toggle = 1,
          node = document.createTextNode('');
      new Observer(flush).observe(node, {characterData: true});
      notify = function() {
        node.data = toggle = -toggle;
      };
    } else if (Promise && Promise.resolve) {
      notify = function() {
        Promise.resolve().then(flush);
      };
    } else {
      notify = function() {
        macrotask.call(global, flush);
      };
    }
    module.exports = function asap(fn) {
      var task = {
        fn: fn,
        next: undefined,
        domain: isNode && process.domain
      };
      if (last)
        last.next = task;
      if (!head) {
        head = task;
        notify();
      }
      last = task;
    };
  })(req('11'));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("15", ["16", "17", "4"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var anObject = req('16'),
      aFunction = req('17'),
      SPECIES = req('4')('species');
  module.exports = function(O, D) {
    var C = anObject(O).constructor,
        S;
    return C === undefined || (S = anObject(C)[SPECIES]) == undefined ? D : aFunction(S);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("18", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = Object.is || function is(x, y) {
    return x === y ? x !== 0 || 1 / x === 1 / y : x != x && y != y;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("19", ["7", "c", "16", "12"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var getDesc = req('7').getDesc,
      isObject = req('c'),
      anObject = req('16');
  var check = function(O, proto) {
    anObject(O);
    if (!isObject(proto) && proto !== null)
      throw TypeError(proto + ": can't set as prototype!");
  };
  module.exports = {
    set: Object.setPrototypeOf || ('__proto__' in {} ? function(test, buggy, set) {
      try {
        set = req('12')(Function.call, getDesc(Object.prototype, '__proto__').set, 2);
        set(test, []);
        buggy = !(test instanceof Array);
      } catch (e) {
        buggy = true;
      }
      return function setPrototypeOf(O, proto) {
        check(O, proto);
        if (buggy)
          O.__proto__ = proto;
        else
          set(O, proto);
        return O;
      };
    }({}, false) : undefined),
    check: check
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1a", ["1b", "4", "1c", "6"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var classof = req('1b'),
      ITERATOR = req('4')('iterator'),
      Iterators = req('1c');
  module.exports = req('6').getIteratorMethod = function(it) {
    if (it != undefined)
      return it[ITERATOR] || it['@@iterator'] || Iterators[classof(it)];
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1d", ["1e"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toInteger = req('1e'),
      min = Math.min;
  module.exports = function(it) {
    return it > 0 ? min(toInteger(it), 0x1fffffffffffff) : 0;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1f", ["1c", "4"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var Iterators = req('1c'),
      ITERATOR = req('4')('iterator'),
      ArrayProto = Array.prototype;
  module.exports = function(it) {
    return it !== undefined && (Iterators.Array === it || ArrayProto[ITERATOR] === it);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("20", ["16"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var anObject = req('16');
  module.exports = function(iterator, fn, value, entries) {
    try {
      return entries ? fn(anObject(value)[0], value[1]) : fn(value);
    } catch (e) {
      var ret = iterator['return'];
      if (ret !== undefined)
        anObject(ret.call(iterator));
      throw e;
    }
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("21", ["12", "20", "1f", "16", "1d", "1a"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var ctx = req('12'),
      call = req('20'),
      isArrayIter = req('1f'),
      anObject = req('16'),
      toLength = req('1d'),
      getIterFn = req('1a');
  module.exports = function(iterable, entries, fn, that) {
    var iterFn = getIterFn(iterable),
        f = ctx(fn, that, entries ? 2 : 1),
        index = 0,
        length,
        step,
        iterator;
    if (typeof iterFn != 'function')
      throw TypeError(iterable + ' is not iterable!');
    if (isArrayIter(iterFn))
      for (length = toLength(iterable.length); length > index; index++) {
        entries ? f(anObject(step = iterable[index])[0], step[1]) : f(iterable[index]);
      }
    else
      for (iterator = iterFn.call(iterable); !(step = iterator.next()).done; ) {
        call(iterator, f, step.value, entries);
      }
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("22", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(it, Constructor, name) {
    if (!(it instanceof Constructor))
      throw TypeError(name + ": use the 'new' operator!");
    return it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("16", ["c"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var isObject = req('c');
  module.exports = function(it) {
    if (!isObject(it))
      throw TypeError(it + ' is not an object!');
    return it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("c", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(it) {
    return typeof it === 'object' ? it !== null : typeof it === 'function';
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1b", ["13", "4"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var cof = req('13'),
      TAG = req('4')('toStringTag'),
      ARG = cof(function() {
        return arguments;
      }()) == 'Arguments';
  module.exports = function(it) {
    var O,
        T,
        B;
    return it === undefined ? 'Undefined' : it === null ? 'Null' : typeof(T = (O = Object(it))[TAG]) == 'string' ? T : ARG ? cof(O) : (B = cof(O)) == 'Object' && typeof O.callee == 'function' ? 'Arguments' : B;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("23", ["7", "24", "d", "12", "1b", "25", "c", "16", "17", "22", "21", "19", "18", "4", "15", "14", "8", "9", "26", "5", "6", "3", "11"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  (function(process) {
    'use strict';
    var $ = req('7'),
        LIBRARY = req('24'),
        global = req('d'),
        ctx = req('12'),
        classof = req('1b'),
        $export = req('25'),
        isObject = req('c'),
        anObject = req('16'),
        aFunction = req('17'),
        strictNew = req('22'),
        forOf = req('21'),
        setProto = req('19').set,
        same = req('18'),
        SPECIES = req('4')('species'),
        speciesConstructor = req('15'),
        asap = req('14'),
        PROMISE = 'Promise',
        process = global.process,
        isNode = classof(process) == 'process',
        P = global[PROMISE],
        Wrapper;
    var testResolve = function(sub) {
      var test = new P(function() {});
      if (sub)
        test.constructor = Object;
      return P.resolve(test) === test;
    };
    var USE_NATIVE = function() {
      var works = false;
      function P2(x) {
        var self = new P(x);
        setProto(self, P2.prototype);
        return self;
      }
      try {
        works = P && P.resolve && testResolve();
        setProto(P2, P);
        P2.prototype = $.create(P.prototype, {constructor: {value: P2}});
        if (!(P2.resolve(5).then(function() {}) instanceof P2)) {
          works = false;
        }
        if (works && req('8')) {
          var thenableThenGotten = false;
          P.resolve($.setDesc({}, 'then', {get: function() {
              thenableThenGotten = true;
            }}));
          works = thenableThenGotten;
        }
      } catch (e) {
        works = false;
      }
      return works;
    }();
    var sameConstructor = function(a, b) {
      if (LIBRARY && a === P && b === Wrapper)
        return true;
      return same(a, b);
    };
    var getConstructor = function(C) {
      var S = anObject(C)[SPECIES];
      return S != undefined ? S : C;
    };
    var isThenable = function(it) {
      var then;
      return isObject(it) && typeof(then = it.then) == 'function' ? then : false;
    };
    var PromiseCapability = function(C) {
      var resolve,
          reject;
      this.promise = new C(function($$resolve, $$reject) {
        if (resolve !== undefined || reject !== undefined)
          throw TypeError('Bad Promise constructor');
        resolve = $$resolve;
        reject = $$reject;
      });
      this.resolve = aFunction(resolve), this.reject = aFunction(reject);
    };
    var perform = function(exec) {
      try {
        exec();
      } catch (e) {
        return {error: e};
      }
    };
    var notify = function(record, isReject) {
      if (record.n)
        return;
      record.n = true;
      var chain = record.c;
      asap(function() {
        var value = record.v,
            ok = record.s == 1,
            i = 0;
        var run = function(reaction) {
          var handler = ok ? reaction.ok : reaction.fail,
              resolve = reaction.resolve,
              reject = reaction.reject,
              result,
              then;
          try {
            if (handler) {
              if (!ok)
                record.h = true;
              result = handler === true ? value : handler(value);
              if (result === reaction.promise) {
                reject(TypeError('Promise-chain cycle'));
              } else if (then = isThenable(result)) {
                then.call(result, resolve, reject);
              } else
                resolve(result);
            } else
              reject(value);
          } catch (e) {
            reject(e);
          }
        };
        while (chain.length > i)
          run(chain[i++]);
        chain.length = 0;
        record.n = false;
        if (isReject)
          setTimeout(function() {
            var promise = record.p,
                handler,
                console;
            if (isUnhandled(promise)) {
              if (isNode) {
                process.emit('unhandledRejection', value, promise);
              } else if (handler = global.onunhandledrejection) {
                handler({
                  promise: promise,
                  reason: value
                });
              } else if ((console = global.console) && console.error) {
                console.error('Unhandled promise rejection', value);
              }
            }
            record.a = undefined;
          }, 1);
      });
    };
    var isUnhandled = function(promise) {
      var record = promise._d,
          chain = record.a || record.c,
          i = 0,
          reaction;
      if (record.h)
        return false;
      while (chain.length > i) {
        reaction = chain[i++];
        if (reaction.fail || !isUnhandled(reaction.promise))
          return false;
      }
      return true;
    };
    var $reject = function(value) {
      var record = this;
      if (record.d)
        return;
      record.d = true;
      record = record.r || record;
      record.v = value;
      record.s = 2;
      record.a = record.c.slice();
      notify(record, true);
    };
    var $resolve = function(value) {
      var record = this,
          then;
      if (record.d)
        return;
      record.d = true;
      record = record.r || record;
      try {
        if (record.p === value)
          throw TypeError("Promise can't be resolved itself");
        if (then = isThenable(value)) {
          asap(function() {
            var wrapper = {
              r: record,
              d: false
            };
            try {
              then.call(value, ctx($resolve, wrapper, 1), ctx($reject, wrapper, 1));
            } catch (e) {
              $reject.call(wrapper, e);
            }
          });
        } else {
          record.v = value;
          record.s = 1;
          notify(record, false);
        }
      } catch (e) {
        $reject.call({
          r: record,
          d: false
        }, e);
      }
    };
    if (!USE_NATIVE) {
      P = function Promise(executor) {
        aFunction(executor);
        var record = this._d = {
          p: strictNew(this, P, PROMISE),
          c: [],
          a: undefined,
          s: 0,
          d: false,
          v: undefined,
          h: false,
          n: false
        };
        try {
          executor(ctx($resolve, record, 1), ctx($reject, record, 1));
        } catch (err) {
          $reject.call(record, err);
        }
      };
      req('9')(P.prototype, {
        then: function then(onFulfilled, onRejected) {
          var reaction = new PromiseCapability(speciesConstructor(this, P)),
              promise = reaction.promise,
              record = this._d;
          reaction.ok = typeof onFulfilled == 'function' ? onFulfilled : true;
          reaction.fail = typeof onRejected == 'function' && onRejected;
          record.c.push(reaction);
          if (record.a)
            record.a.push(reaction);
          if (record.s)
            notify(record, false);
          return promise;
        },
        'catch': function(onRejected) {
          return this.then(undefined, onRejected);
        }
      });
    }
    $export($export.G + $export.W + $export.F * !USE_NATIVE, {Promise: P});
    req('26')(P, PROMISE);
    req('5')(PROMISE);
    Wrapper = req('6')[PROMISE];
    $export($export.S + $export.F * !USE_NATIVE, PROMISE, {reject: function reject(r) {
        var capability = new PromiseCapability(this),
            $$reject = capability.reject;
        $$reject(r);
        return capability.promise;
      }});
    $export($export.S + $export.F * (!USE_NATIVE || testResolve(true)), PROMISE, {resolve: function resolve(x) {
        if (x instanceof P && sameConstructor(x.constructor, this))
          return x;
        var capability = new PromiseCapability(this),
            $$resolve = capability.resolve;
        $$resolve(x);
        return capability.promise;
      }});
    $export($export.S + $export.F * !(USE_NATIVE && req('3')(function(iter) {
      P.all(iter)['catch'](function() {});
    })), PROMISE, {
      all: function all(iterable) {
        var C = getConstructor(this),
            capability = new PromiseCapability(C),
            resolve = capability.resolve,
            reject = capability.reject,
            values = [];
        var abrupt = perform(function() {
          forOf(iterable, false, values.push, values);
          var remaining = values.length,
              results = Array(remaining);
          if (remaining)
            $.each.call(values, function(promise, index) {
              var alreadyCalled = false;
              C.resolve(promise).then(function(value) {
                if (alreadyCalled)
                  return;
                alreadyCalled = true;
                results[index] = value;
                --remaining || resolve(results);
              }, reject);
            });
          else
            resolve(results);
        });
        if (abrupt)
          reject(abrupt.error);
        return capability.promise;
      },
      race: function race(iterable) {
        var C = getConstructor(this),
            capability = new PromiseCapability(C),
            reject = capability.reject;
        var abrupt = perform(function() {
          forOf(iterable, false, function(promise) {
            C.resolve(promise).then(capability.resolve, reject);
          });
        });
        if (abrupt)
          reject(abrupt.error);
        return capability.promise;
      }
    });
  })(req('11'));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("13", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toString = {}.toString;
  module.exports = function(it) {
    return toString.call(it).slice(8, -1);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("27", ["13"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var cof = req('13');
  module.exports = Object('z').propertyIsEnumerable(0) ? Object : function(it) {
    return cof(it) == 'String' ? it.split('') : Object(it);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("28", ["27", "29"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var IObject = req('27'),
      defined = req('29');
  module.exports = function(it) {
    return IObject(defined(it));
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("2a", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(done, value) {
    return {
      value: value,
      done: !!done
    };
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("2b", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function() {};
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("2c", ["2b", "2a", "1c", "28", "2d"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var addToUnscopables = req('2b'),
      step = req('2a'),
      Iterators = req('1c'),
      toIObject = req('28');
  module.exports = req('2d')(Array, 'Array', function(iterated, kind) {
    this._t = toIObject(iterated);
    this._i = 0;
    this._k = kind;
  }, function() {
    var O = this._t,
        kind = this._k,
        index = this._i++;
    if (!O || index >= O.length) {
      this._t = undefined;
      return step(1);
    }
    if (kind == 'keys')
      return step(0, index);
    if (kind == 'values')
      return step(0, O[index]);
    return step(0, [index, O[index]]);
  }, 'values');
  Iterators.Arguments = Iterators.Array;
  addToUnscopables('keys');
  addToUnscopables('values');
  addToUnscopables('entries');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("2e", ["2c", "1c"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  req('2c');
  var Iterators = req('1c');
  Iterators.NodeList = Iterators.HTMLCollection = Iterators.Array;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("2f", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var id = 0,
      px = Math.random();
  module.exports = function(key) {
    return 'Symbol('.concat(key === undefined ? '' : key, ')_', (++id + px).toString(36));
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("30", ["d"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var global = req('d'),
      SHARED = '__core-js_shared__',
      store = global[SHARED] || (global[SHARED] = {});
  module.exports = function(key) {
    return store[key] || (store[key] = {});
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4", ["30", "2f", "d"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var store = req('30')('wks'),
      uid = req('2f'),
      Symbol = req('d').Symbol;
  module.exports = function(name) {
    return store[name] || (store[name] = Symbol && Symbol[name] || (Symbol || uid)('Symbol.' + name));
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("26", ["7", "31", "4"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var def = req('7').setDesc,
      has = req('31'),
      TAG = req('4')('toStringTag');
  module.exports = function(it, tag, stat) {
    if (it && !has(it = stat ? it : it.prototype, TAG))
      def(it, TAG, {
        configurable: true,
        value: tag
      });
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("32", ["7", "33", "26", "34", "4"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $ = req('7'),
      descriptor = req('33'),
      setToStringTag = req('26'),
      IteratorPrototype = {};
  req('34')(IteratorPrototype, req('4')('iterator'), function() {
    return this;
  });
  module.exports = function(Constructor, NAME, next) {
    Constructor.prototype = $.create(IteratorPrototype, {next: descriptor(1, next)});
    setToStringTag(Constructor, NAME + ' Iterator');
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1c", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {};
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("31", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var hasOwnProperty = {}.hasOwnProperty;
  module.exports = function(it, key) {
    return hasOwnProperty.call(it, key);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("8", ["35"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = !req('35')(function() {
    return Object.defineProperty({}, 'a', {get: function() {
        return 7;
      }}).a != 7;
  });
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("33", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(bitmap, value) {
    return {
      enumerable: !(bitmap & 1),
      configurable: !(bitmap & 2),
      writable: !(bitmap & 4),
      value: value
    };
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("7", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $Object = Object;
  module.exports = {
    create: $Object.create,
    getProto: $Object.getPrototypeOf,
    isEnum: {}.propertyIsEnumerable,
    getDesc: $Object.getOwnPropertyDescriptor,
    setDesc: $Object.defineProperty,
    setDescs: $Object.defineProperties,
    getKeys: $Object.keys,
    getNames: $Object.getOwnPropertyNames,
    getSymbols: $Object.getOwnPropertySymbols,
    each: [].forEach
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("34", ["7", "33", "8"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $ = req('7'),
      createDesc = req('33');
  module.exports = req('8') ? function(object, key, value) {
    return $.setDesc(object, key, createDesc(1, value));
  } : function(object, key, value) {
    object[key] = value;
    return object;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("a", ["34"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('34');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("24", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = true;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("2d", ["24", "25", "a", "34", "31", "1c", "32", "26", "7", "4"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var LIBRARY = req('24'),
      $export = req('25'),
      redefine = req('a'),
      hide = req('34'),
      has = req('31'),
      Iterators = req('1c'),
      $iterCreate = req('32'),
      setToStringTag = req('26'),
      getProto = req('7').getProto,
      ITERATOR = req('4')('iterator'),
      BUGGY = !([].keys && 'next' in [].keys()),
      FF_ITERATOR = '@@iterator',
      KEYS = 'keys',
      VALUES = 'values';
  var returnThis = function() {
    return this;
  };
  module.exports = function(Base, NAME, Constructor, next, DEFAULT, IS_SET, FORCED) {
    $iterCreate(Constructor, NAME, next);
    var getMethod = function(kind) {
      if (!BUGGY && kind in proto)
        return proto[kind];
      switch (kind) {
        case KEYS:
          return function keys() {
            return new Constructor(this, kind);
          };
        case VALUES:
          return function values() {
            return new Constructor(this, kind);
          };
      }
      return function entries() {
        return new Constructor(this, kind);
      };
    };
    var TAG = NAME + ' Iterator',
        DEF_VALUES = DEFAULT == VALUES,
        VALUES_BUG = false,
        proto = Base.prototype,
        $native = proto[ITERATOR] || proto[FF_ITERATOR] || DEFAULT && proto[DEFAULT],
        $default = $native || getMethod(DEFAULT),
        methods,
        key;
    if ($native) {
      var IteratorPrototype = getProto($default.call(new Base));
      setToStringTag(IteratorPrototype, TAG, true);
      if (!LIBRARY && has(proto, FF_ITERATOR))
        hide(IteratorPrototype, ITERATOR, returnThis);
      if (DEF_VALUES && $native.name !== VALUES) {
        VALUES_BUG = true;
        $default = function values() {
          return $native.call(this);
        };
      }
    }
    if ((!LIBRARY || FORCED) && (BUGGY || VALUES_BUG || !proto[ITERATOR])) {
      hide(proto, ITERATOR, $default);
    }
    Iterators[NAME] = $default;
    Iterators[TAG] = returnThis;
    if (DEFAULT) {
      methods = {
        values: DEF_VALUES ? $default : getMethod(VALUES),
        keys: IS_SET ? $default : getMethod(KEYS),
        entries: !DEF_VALUES ? $default : getMethod('entries')
      };
      if (FORCED)
        for (key in methods) {
          if (!(key in proto))
            redefine(proto, key, methods[key]);
        }
      else
        $export($export.P + $export.F * (BUGGY || VALUES_BUG), NAME, methods);
    }
    return methods;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("1e", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var ceil = Math.ceil,
      floor = Math.floor;
  module.exports = function(it) {
    return isNaN(it = +it) ? 0 : (it > 0 ? floor : ceil)(it);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("36", ["1e", "29"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toInteger = req('1e'),
      defined = req('29');
  module.exports = function(TO_STRING) {
    return function(that, pos) {
      var s = String(defined(that)),
          i = toInteger(pos),
          l = s.length,
          a,
          b;
      if (i < 0 || i >= l)
        return TO_STRING ? '' : undefined;
      a = s.charCodeAt(i);
      return a < 0xd800 || a > 0xdbff || i + 1 === l || (b = s.charCodeAt(i + 1)) < 0xdc00 || b > 0xdfff ? TO_STRING ? s.charAt(i) : a : TO_STRING ? s.slice(i, i + 2) : (a - 0xd800 << 10) + (b - 0xdc00) + 0x10000;
    };
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("37", ["36", "2d"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  'use strict';
  var $at = req('36')(true);
  req('2d')(String, 'String', function(iterated) {
    this._t = String(iterated);
    this._i = 0;
  }, function() {
    var O = this._t,
        index = this._i,
        point;
    if (index >= O.length)
      return {
        value: undefined,
        done: true
      };
    point = $at(O, index);
    this._i += point.length;
    return {
      value: point,
      done: false
    };
  });
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("38", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("39", ["38", "37", "2e", "23", "6"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  req('38');
  req('37');
  req('2e');
  req('23');
  module.exports = req('6').Promise;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3a", ["39"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": req('39'),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

$__System.register('3b', ['3a', '3c'], function (_export) {
  var _Promise, angular;

  return {
    setters: [function (_a) {
      _Promise = _a['default'];
    }, function (_c) {
      angular = _c['default'];
    }],
    execute: function () {
      // import categoriesCacheModule from 'sysadmin/app/categoriesCache';

      'use strict';

      _export('default', angular.module('categoryQueryModule', []).factory('GetCategoriesFactory', function ($http) {

        //let categoriesCacheName = categoriesCacheFactory.info().id;

        var allCats = function allCats() {
          // if (categoriesCacheFactory.info().size === 0)
          // {
          var url = "/api/category/";
          return $http.get(url).then(function successCallback(response) {
            //categoriesCacheFactory.put(categoriesCacheName, response.data.categories);
            return response.data.categories;
          });
          // }
          // return categoriesCacheFactory.get(categoriesCacheName);
        };

        var byId = function byId(id) {
          var categories = null;
          //categoriesCacheFactory.get(categoriesCacheName);
          if (categories === null || categories === undefined) {
            var url = '/api/category/' + id;
            return $http.get(url);
          }
          var category = null;
          category = categories.filter(function (cat) {
            return cat._id === id;
          }).pop();
          return new _Promise(function (resolve, reject) {
            resolve({ "status": 200, data: { category: category } });
          });
        };

        return {
          allCats: allCats,
          byId: byId
        };
      }));
    }
  };
});
$__System.register('3d', ['3c', '3e', '3b'], function (_export) {
    'use strict';

    var angular, categoryQueryModule;
    return {
        setters: [function (_c) {
            angular = _c['default'];
        }, function (_e) {}, function (_b) {
            categoryQueryModule = _b['default'];
        }],
        execute: function () {
            _export('default', angular.module('HomeControllerModule', [categoryQueryModule.name]).controller('HomeController', function ($scope, allCategories, $location, $http) {
                var _this = this;

                $scope.categories = allCategories;
                $scope.topCategories = $scope.categories.filter(function (cat) {
                    return cat.level === 1;
                });

                this.selectedCategory = function (id) {
                    console.log('selected category was:', id);
                };

                this.loadSubCategories = function (id) {
                    var subCategories = $scope.categories.filter(function (cat) {
                        return cat.parentCategoryId === id;
                    });
                    $scope.categoryTabs = $scope.categoryTabs.map(function (tab) {
                        return tab.categories = subCategories;
                    });
                    console.log($scope.categoryTabs);
                };

                $scope.selectSubCategories = function (id) {
                    console.log('id was:', id);
                    _this.loadSubCategories(id);
                };

                $scope.categoryTabs = $scope.topCategories.map(function (cat) {
                    return { id: cat._id, title: cat.description, categories: $scope.categories };
                });
                //  [{
                //     title: "one",
                //     active: true,
                //     disabled: false,
                //     content: "test"  
                // }, {
                //     title: "two",
                //     active: true,
                //     disabled: false,
                //     content: "hello"  
                // }];
            }));
        }
    };
});
$__System.registerDynamic("35", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(exec) {
    try {
      return !!exec();
    } catch (e) {
      return true;
    }
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("17", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(it) {
    if (typeof it != 'function')
      throw TypeError(it + ' is not a function!');
    return it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("12", ["17"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var aFunction = req('17');
  module.exports = function(fn, that, length) {
    aFunction(fn);
    if (that === undefined)
      return fn;
    switch (length) {
      case 1:
        return function(a) {
          return fn.call(that, a);
        };
      case 2:
        return function(a, b) {
          return fn.call(that, a, b);
        };
      case 3:
        return function(a, b, c) {
          return fn.call(that, a, b, c);
        };
    }
    return function() {
      return fn.apply(that, arguments);
    };
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("6", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var core = module.exports = {version: '1.2.6'};
  if (typeof __e == 'number')
    __e = core;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("d", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var global = module.exports = typeof window != 'undefined' && window.Math == Math ? window : typeof self != 'undefined' && self.Math == Math ? self : Function('return this')();
  if (typeof __g == 'number')
    __g = global;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("25", ["d", "6", "12"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var global = req('d'),
      core = req('6'),
      ctx = req('12'),
      PROTOTYPE = 'prototype';
  var $export = function(type, name, source) {
    var IS_FORCED = type & $export.F,
        IS_GLOBAL = type & $export.G,
        IS_STATIC = type & $export.S,
        IS_PROTO = type & $export.P,
        IS_BIND = type & $export.B,
        IS_WRAP = type & $export.W,
        exports = IS_GLOBAL ? core : core[name] || (core[name] = {}),
        target = IS_GLOBAL ? global : IS_STATIC ? global[name] : (global[name] || {})[PROTOTYPE],
        key,
        own,
        out;
    if (IS_GLOBAL)
      source = name;
    for (key in source) {
      own = !IS_FORCED && target && key in target;
      if (own && key in exports)
        continue;
      out = own ? target[key] : source[key];
      exports[key] = IS_GLOBAL && typeof target[key] != 'function' ? source[key] : IS_BIND && own ? ctx(out, global) : IS_WRAP && target[key] == out ? (function(C) {
        var F = function(param) {
          return this instanceof C ? new C(param) : C(param);
        };
        F[PROTOTYPE] = C[PROTOTYPE];
        return F;
      })(out) : IS_PROTO && typeof out == 'function' ? ctx(Function.call, out) : out;
      if (IS_PROTO)
        (exports[PROTOTYPE] || (exports[PROTOTYPE] = {}))[key] = out;
    }
  };
  $export.F = 1;
  $export.G = 2;
  $export.S = 4;
  $export.P = 8;
  $export.B = 16;
  $export.W = 32;
  module.exports = $export;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("3f", ["25", "6", "35"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var $export = req('25'),
      core = req('6'),
      fails = req('35');
  module.exports = function(KEY, exec) {
    var fn = (core.Object || {})[KEY] || Object[KEY],
        exp = {};
    exp[KEY] = exec(fn);
    $export($export.S + $export.F * fails(function() {
      fn(1);
    }), 'Object', exp);
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("29", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = function(it) {
    if (it == undefined)
      throw TypeError("Can't call method on  " + it);
    return it;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("40", ["29"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var defined = req('29');
  module.exports = function(it) {
    return Object(defined(it));
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("41", ["40", "3f"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var toObject = req('40');
  req('3f')('keys', function($keys) {
    return function keys(it) {
      return $keys(toObject(it));
    };
  });
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("42", ["41", "6"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  req('41');
  module.exports = req('6').Object.keys;
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("43", ["42"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = {
    "default": req('42'),
    __esModule: true
  };
  global.define = __define;
  return module.exports;
});

$__System.register("44",["43","3c"],function(_export){var _Object$keys,angular;return {setters:[function(_){_Object$keys = _["default"];},function(_c){angular = _c["default"];}],execute:function(){ /*
 * angular-ui-bootstrap
 * http://angular-ui.github.io/bootstrap/

 * Version: 0.14.3 - 2015-10-23
 * License: MIT
 */"use strict";angular.module("ui.bootstrap",["ui.bootstrap.tpls","ui.bootstrap.collapse","ui.bootstrap.accordion","ui.bootstrap.alert","ui.bootstrap.buttons","ui.bootstrap.carousel","ui.bootstrap.dateparser","ui.bootstrap.position","ui.bootstrap.datepicker","ui.bootstrap.dropdown","ui.bootstrap.stackedMap","ui.bootstrap.modal","ui.bootstrap.pagination","ui.bootstrap.tooltip","ui.bootstrap.popover","ui.bootstrap.progressbar","ui.bootstrap.rating","ui.bootstrap.tabs","ui.bootstrap.timepicker","ui.bootstrap.typeahead"]);angular.module("ui.bootstrap.tpls",["template/accordion/accordion-group.html","template/accordion/accordion.html","template/alert/alert.html","template/carousel/carousel.html","template/carousel/slide.html","template/datepicker/datepicker.html","template/datepicker/day.html","template/datepicker/month.html","template/datepicker/popup.html","template/datepicker/year.html","template/modal/backdrop.html","template/modal/window.html","template/pagination/pager.html","template/pagination/pagination.html","template/tooltip/tooltip-html-popup.html","template/tooltip/tooltip-popup.html","template/tooltip/tooltip-template-popup.html","template/popover/popover-html.html","template/popover/popover-template.html","template/popover/popover.html","template/progressbar/bar.html","template/progressbar/progress.html","template/progressbar/progressbar.html","template/rating/rating.html","template/tabs/tab.html","template/tabs/tabset.html","template/timepicker/timepicker.html","template/typeahead/typeahead-match.html","template/typeahead/typeahead-popup.html"]);angular.module('ui.bootstrap.collapse',[]).directive('uibCollapse',['$animate','$injector',function($animate,$injector){var $animateCss=$injector.has('$animateCss')?$injector.get('$animateCss'):null;return {link:function link(scope,element,attrs){function expand(){element.removeClass('collapse').addClass('collapsing').attr('aria-expanded',true).attr('aria-hidden',false);if($animateCss){$animateCss(element,{addClass:'in',easing:'ease',to:{height:element[0].scrollHeight + 'px'}}).start()["finally"](expandDone);}else {$animate.addClass(element,'in',{to:{height:element[0].scrollHeight + 'px'}}).then(expandDone);}}function expandDone(){element.removeClass('collapsing').addClass('collapse').css({height:'auto'});}function collapse(){if(!element.hasClass('collapse') && !element.hasClass('in')){return collapseDone();}element // IMPORTANT: The height must be set before adding "collapsing" class.
// Otherwise, the browser attempts to animate from height 0 (in
// collapsing class) to the given height here.
.css({height:element[0].scrollHeight + 'px'}) // initially all panel collapse have the collapse class, this removal
// prevents the animation from jumping to collapsed state
.removeClass('collapse').addClass('collapsing').attr('aria-expanded',false).attr('aria-hidden',true);if($animateCss){$animateCss(element,{removeClass:'in',to:{height:'0'}}).start()["finally"](collapseDone);}else {$animate.removeClass(element,'in',{to:{height:'0'}}).then(collapseDone);}}function collapseDone(){element.css({height:'0'}); // Required so that collapse works when animation is disabled
element.removeClass('collapsing').addClass('collapse');}scope.$watch(attrs.uibCollapse,function(shouldCollapse){if(shouldCollapse){collapse();}else {expand();}});}};}]); /* Deprecated collapse below */angular.module('ui.bootstrap.collapse').value('$collapseSuppressWarning',false).directive('collapse',['$animate','$injector','$log','$collapseSuppressWarning',function($animate,$injector,$log,$collapseSuppressWarning){var $animateCss=$injector.has('$animateCss')?$injector.get('$animateCss'):null;return {link:function link(scope,element,attrs){if(!$collapseSuppressWarning){$log.warn('collapse is now deprecated. Use uib-collapse instead.');}function expand(){element.removeClass('collapse').addClass('collapsing').attr('aria-expanded',true).attr('aria-hidden',false);if($animateCss){$animateCss(element,{easing:'ease',to:{height:element[0].scrollHeight + 'px'}}).start().done(expandDone);}else {$animate.animate(element,{},{height:element[0].scrollHeight + 'px'}).then(expandDone);}}function expandDone(){element.removeClass('collapsing').addClass('collapse in').css({height:'auto'});}function collapse(){if(!element.hasClass('collapse') && !element.hasClass('in')){return collapseDone();}element // IMPORTANT: The height must be set before adding "collapsing" class.
// Otherwise, the browser attempts to animate from height 0 (in
// collapsing class) to the given height here.
.css({height:element[0].scrollHeight + 'px'}) // initially all panel collapse have the collapse class, this removal
// prevents the animation from jumping to collapsed state
.removeClass('collapse in').addClass('collapsing').attr('aria-expanded',false).attr('aria-hidden',true);if($animateCss){$animateCss(element,{to:{height:'0'}}).start().done(collapseDone);}else {$animate.animate(element,{},{height:'0'}).then(collapseDone);}}function collapseDone(){element.css({height:'0'}); // Required so that collapse works when animation is disabled
element.removeClass('collapsing').addClass('collapse');}scope.$watch(attrs.collapse,function(shouldCollapse){if(shouldCollapse){collapse();}else {expand();}});}};}]);angular.module('ui.bootstrap.accordion',['ui.bootstrap.collapse']).constant('uibAccordionConfig',{closeOthers:true}).controller('UibAccordionController',['$scope','$attrs','uibAccordionConfig',function($scope,$attrs,accordionConfig){ // This array keeps track of the accordion groups
this.groups = []; // Ensure that all the groups in this accordion are closed, unless close-others explicitly says not to
this.closeOthers = function(openGroup){var closeOthers=angular.isDefined($attrs.closeOthers)?$scope.$eval($attrs.closeOthers):accordionConfig.closeOthers;if(closeOthers){angular.forEach(this.groups,function(group){if(group !== openGroup){group.isOpen = false;}});}}; // This is called from the accordion-group directive to add itself to the accordion
this.addGroup = function(groupScope){var that=this;this.groups.push(groupScope);groupScope.$on('$destroy',function(event){that.removeGroup(groupScope);});}; // This is called from the accordion-group directive when to remove itself
this.removeGroup = function(group){var index=this.groups.indexOf(group);if(index !== -1){this.groups.splice(index,1);}};}]) // The accordion directive simply sets up the directive controller
// and adds an accordion CSS class to itself element.
.directive('uibAccordion',function(){return {controller:'UibAccordionController',controllerAs:'accordion',transclude:true,templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/accordion/accordion.html';}};}) // The accordion-group directive indicates a block of html that will expand and collapse in an accordion
.directive('uibAccordionGroup',function(){return {require:'^uibAccordion', // We need this directive to be inside an accordion
transclude:true, // It transcludes the contents of the directive into the template
replace:true, // The element containing the directive will be replaced with the template
templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/accordion/accordion-group.html';},scope:{heading:'@', // Interpolate the heading attribute onto this scope
isOpen:'=?',isDisabled:'=?'},controller:function controller(){this.setHeading = function(element){this.heading = element;};},link:function link(scope,element,attrs,accordionCtrl){accordionCtrl.addGroup(scope);scope.openClass = attrs.openClass || 'panel-open';scope.panelClass = attrs.panelClass;scope.$watch('isOpen',function(value){element.toggleClass(scope.openClass,!!value);if(value){accordionCtrl.closeOthers(scope);}});scope.toggleOpen = function($event){if(!scope.isDisabled){if(!$event || $event.which === 32){scope.isOpen = !scope.isOpen;}}};}};}) // Use accordion-heading below an accordion-group to provide a heading containing HTML
.directive('uibAccordionHeading',function(){return {transclude:true, // Grab the contents to be used as the heading
template:'', // In effect remove this element!
replace:true,require:'^uibAccordionGroup',link:function link(scope,element,attrs,accordionGroupCtrl,transclude){ // Pass the heading to the accordion-group controller
// so that it can be transcluded into the right place in the template
// [The second parameter to transclude causes the elements to be cloned so that they work in ng-repeat]
accordionGroupCtrl.setHeading(transclude(scope,angular.noop));}};}) // Use in the accordion-group template to indicate where you want the heading to be transcluded
// You must provide the property on the accordion-group controller that will hold the transcluded element
.directive('uibAccordionTransclude',function(){return {require:['?^uibAccordionGroup','?^accordionGroup'],link:function link(scope,element,attrs,controller){controller = controller[0]?controller[0]:controller[1]; // Delete after we remove deprecation
scope.$watch(function(){return controller[attrs.uibAccordionTransclude];},function(heading){if(heading){element.find('span').html('');element.find('span').append(heading);}});}};}); /* Deprecated accordion below */angular.module('ui.bootstrap.accordion').value('$accordionSuppressWarning',false).controller('AccordionController',['$scope','$attrs','$controller','$log','$accordionSuppressWarning',function($scope,$attrs,$controller,$log,$accordionSuppressWarning){if(!$accordionSuppressWarning){$log.warn('AccordionController is now deprecated. Use UibAccordionController instead.');}angular.extend(this,$controller('UibAccordionController',{$scope:$scope,$attrs:$attrs}));}]).directive('accordion',['$log','$accordionSuppressWarning',function($log,$accordionSuppressWarning){return {restrict:'EA',controller:'AccordionController',controllerAs:'accordion',transclude:true,replace:false,templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/accordion/accordion.html';},link:function link(){if(!$accordionSuppressWarning){$log.warn('accordion is now deprecated. Use uib-accordion instead.');}}};}]).directive('accordionGroup',['$log','$accordionSuppressWarning',function($log,$accordionSuppressWarning){return {require:'^accordion', // We need this directive to be inside an accordion
restrict:'EA',transclude:true, // It transcludes the contents of the directive into the template
replace:true, // The element containing the directive will be replaced with the template
templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/accordion/accordion-group.html';},scope:{heading:'@', // Interpolate the heading attribute onto this scope
isOpen:'=?',isDisabled:'=?'},controller:function controller(){this.setHeading = function(element){this.heading = element;};},link:function link(scope,element,attrs,accordionCtrl){if(!$accordionSuppressWarning){$log.warn('accordion-group is now deprecated. Use uib-accordion-group instead.');}accordionCtrl.addGroup(scope);scope.openClass = attrs.openClass || 'panel-open';scope.panelClass = attrs.panelClass;scope.$watch('isOpen',function(value){element.toggleClass(scope.openClass,!!value);if(value){accordionCtrl.closeOthers(scope);}});scope.toggleOpen = function($event){if(!scope.isDisabled){if(!$event || $event.which === 32){scope.isOpen = !scope.isOpen;}}};}};}]).directive('accordionHeading',['$log','$accordionSuppressWarning',function($log,$accordionSuppressWarning){return {restrict:'EA',transclude:true, // Grab the contents to be used as the heading
template:'', // In effect remove this element!
replace:true,require:'^accordionGroup',link:function link(scope,element,attr,accordionGroupCtrl,transclude){if(!$accordionSuppressWarning){$log.warn('accordion-heading is now deprecated. Use uib-accordion-heading instead.');} // Pass the heading to the accordion-group controller
// so that it can be transcluded into the right place in the template
// [The second parameter to transclude causes the elements to be cloned so that they work in ng-repeat]
accordionGroupCtrl.setHeading(transclude(scope,angular.noop));}};}]).directive('accordionTransclude',['$log','$accordionSuppressWarning',function($log,$accordionSuppressWarning){return {require:'^accordionGroup',link:function link(scope,element,attr,controller){if(!$accordionSuppressWarning){$log.warn('accordion-transclude is now deprecated. Use uib-accordion-transclude instead.');}scope.$watch(function(){return controller[attr.accordionTransclude];},function(heading){if(heading){element.find('span').html('');element.find('span').append(heading);}});}};}]);angular.module('ui.bootstrap.alert',[]).controller('UibAlertController',['$scope','$attrs','$interpolate','$timeout',function($scope,$attrs,$interpolate,$timeout){$scope.closeable = !!$attrs.close;var dismissOnTimeout=angular.isDefined($attrs.dismissOnTimeout)?$interpolate($attrs.dismissOnTimeout)($scope.$parent):null;if(dismissOnTimeout){$timeout(function(){$scope.close();},parseInt(dismissOnTimeout,10));}}]).directive('uibAlert',function(){return {controller:'UibAlertController',controllerAs:'alert',templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/alert/alert.html';},transclude:true,replace:true,scope:{type:'@',close:'&'}};}); /* Deprecated alert below */angular.module('ui.bootstrap.alert').value('$alertSuppressWarning',false).controller('AlertController',['$scope','$attrs','$controller','$log','$alertSuppressWarning',function($scope,$attrs,$controller,$log,$alertSuppressWarning){if(!$alertSuppressWarning){$log.warn('AlertController is now deprecated. Use UibAlertController instead.');}angular.extend(this,$controller('UibAlertController',{$scope:$scope,$attrs:$attrs}));}]).directive('alert',['$log','$alertSuppressWarning',function($log,$alertSuppressWarning){return {controller:'AlertController',controllerAs:'alert',templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/alert/alert.html';},transclude:true,replace:true,scope:{type:'@',close:'&'},link:function link(){if(!$alertSuppressWarning){$log.warn('alert is now deprecated. Use uib-alert instead.');}}};}]);angular.module('ui.bootstrap.buttons',[]).constant('uibButtonConfig',{activeClass:'active',toggleEvent:'click'}).controller('UibButtonsController',['uibButtonConfig',function(buttonConfig){this.activeClass = buttonConfig.activeClass || 'active';this.toggleEvent = buttonConfig.toggleEvent || 'click';}]).directive('uibBtnRadio',function(){return {require:['uibBtnRadio','ngModel'],controller:'UibButtonsController',controllerAs:'buttons',link:function link(scope,element,attrs,ctrls){var buttonsCtrl=ctrls[0],ngModelCtrl=ctrls[1];element.find('input').css({display:'none'}); //model -> UI
ngModelCtrl.$render = function(){element.toggleClass(buttonsCtrl.activeClass,angular.equals(ngModelCtrl.$modelValue,scope.$eval(attrs.uibBtnRadio)));}; //ui->model
element.on(buttonsCtrl.toggleEvent,function(){if(attrs.disabled){return;}var isActive=element.hasClass(buttonsCtrl.activeClass);if(!isActive || angular.isDefined(attrs.uncheckable)){scope.$apply(function(){ngModelCtrl.$setViewValue(isActive?null:scope.$eval(attrs.uibBtnRadio));ngModelCtrl.$render();});}});}};}).directive('uibBtnCheckbox',function(){return {require:['uibBtnCheckbox','ngModel'],controller:'UibButtonsController',controllerAs:'button',link:function link(scope,element,attrs,ctrls){var buttonsCtrl=ctrls[0],ngModelCtrl=ctrls[1];element.find('input').css({display:'none'});function getTrueValue(){return getCheckboxValue(attrs.btnCheckboxTrue,true);}function getFalseValue(){return getCheckboxValue(attrs.btnCheckboxFalse,false);}function getCheckboxValue(attribute,defaultValue){return angular.isDefined(attribute)?scope.$eval(attribute):defaultValue;} //model -> UI
ngModelCtrl.$render = function(){element.toggleClass(buttonsCtrl.activeClass,angular.equals(ngModelCtrl.$modelValue,getTrueValue()));}; //ui->model
element.on(buttonsCtrl.toggleEvent,function(){if(attrs.disabled){return;}scope.$apply(function(){ngModelCtrl.$setViewValue(element.hasClass(buttonsCtrl.activeClass)?getFalseValue():getTrueValue());ngModelCtrl.$render();});});}};}); /* Deprecated buttons below */angular.module('ui.bootstrap.buttons').value('$buttonsSuppressWarning',false).controller('ButtonsController',['$controller','$log','$buttonsSuppressWarning',function($controller,$log,$buttonsSuppressWarning){if(!$buttonsSuppressWarning){$log.warn('ButtonsController is now deprecated. Use UibButtonsController instead.');}angular.extend(this,$controller('UibButtonsController'));}]).directive('btnRadio',['$log','$buttonsSuppressWarning',function($log,$buttonsSuppressWarning){return {require:['btnRadio','ngModel'],controller:'ButtonsController',controllerAs:'buttons',link:function link(scope,element,attrs,ctrls){if(!$buttonsSuppressWarning){$log.warn('btn-radio is now deprecated. Use uib-btn-radio instead.');}var buttonsCtrl=ctrls[0],ngModelCtrl=ctrls[1];element.find('input').css({display:'none'}); //model -> UI
ngModelCtrl.$render = function(){element.toggleClass(buttonsCtrl.activeClass,angular.equals(ngModelCtrl.$modelValue,scope.$eval(attrs.btnRadio)));}; //ui->model
element.bind(buttonsCtrl.toggleEvent,function(){if(attrs.disabled){return;}var isActive=element.hasClass(buttonsCtrl.activeClass);if(!isActive || angular.isDefined(attrs.uncheckable)){scope.$apply(function(){ngModelCtrl.$setViewValue(isActive?null:scope.$eval(attrs.btnRadio));ngModelCtrl.$render();});}});}};}]).directive('btnCheckbox',['$document','$log','$buttonsSuppressWarning',function($document,$log,$buttonsSuppressWarning){return {require:['btnCheckbox','ngModel'],controller:'ButtonsController',controllerAs:'button',link:function link(scope,element,attrs,ctrls){if(!$buttonsSuppressWarning){$log.warn('btn-checkbox is now deprecated. Use uib-btn-checkbox instead.');}var buttonsCtrl=ctrls[0],ngModelCtrl=ctrls[1];element.find('input').css({display:'none'});function getTrueValue(){return getCheckboxValue(attrs.btnCheckboxTrue,true);}function getFalseValue(){return getCheckboxValue(attrs.btnCheckboxFalse,false);}function getCheckboxValue(attributeValue,defaultValue){var val=scope.$eval(attributeValue);return angular.isDefined(val)?val:defaultValue;} //model -> UI
ngModelCtrl.$render = function(){element.toggleClass(buttonsCtrl.activeClass,angular.equals(ngModelCtrl.$modelValue,getTrueValue()));}; //ui->model
element.bind(buttonsCtrl.toggleEvent,function(){if(attrs.disabled){return;}scope.$apply(function(){ngModelCtrl.$setViewValue(element.hasClass(buttonsCtrl.activeClass)?getFalseValue():getTrueValue());ngModelCtrl.$render();});}); //accessibility
element.on('keypress',function(e){if(attrs.disabled || e.which !== 32 || $document[0].activeElement !== element[0]){return;}scope.$apply(function(){ngModelCtrl.$setViewValue(element.hasClass(buttonsCtrl.activeClass)?getFalseValue():getTrueValue());ngModelCtrl.$render();});});}};}]); /**
 * @ngdoc overview
 * @name ui.bootstrap.carousel
 *
 * @description
 * AngularJS version of an image carousel.
 *
 */angular.module('ui.bootstrap.carousel',[]).controller('UibCarouselController',['$scope','$element','$interval','$animate',function($scope,$element,$interval,$animate){var self=this,slides=self.slides = $scope.slides = [],NEW_ANIMATE=angular.version.minor >= 4,NO_TRANSITION='uib-noTransition',SLIDE_DIRECTION='uib-slideDirection',currentIndex=-1,currentInterval,isPlaying;self.currentSlide = null;var destroyed=false; /* direction: "prev" or "next" */self.select = $scope.select = function(nextSlide,direction){var nextIndex=$scope.indexOfSlide(nextSlide); //Decide direction if it's not given
if(direction === undefined){direction = nextIndex > self.getCurrentIndex()?'next':'prev';} //Prevent this user-triggered transition from occurring if there is already one in progress
if(nextSlide && nextSlide !== self.currentSlide && !$scope.$currentTransition){goNext(nextSlide,nextIndex,direction);}};function goNext(slide,index,direction){ // Scope has been destroyed, stop here.
if(destroyed){return;}angular.extend(slide,{direction:direction,active:true});angular.extend(self.currentSlide || {},{direction:direction,active:false});if($animate.enabled() && !$scope.noTransition && !$scope.$currentTransition && slide.$element && self.slides.length > 1){slide.$element.data(SLIDE_DIRECTION,slide.direction);if(self.currentSlide && self.currentSlide.$element){self.currentSlide.$element.data(SLIDE_DIRECTION,slide.direction);}$scope.$currentTransition = true;if(NEW_ANIMATE){$animate.on('addClass',slide.$element,function(element,phase){if(phase === 'close'){$scope.$currentTransition = null;$animate.off('addClass',element);}});}else {slide.$element.one('$animate:close',function closeFn(){$scope.$currentTransition = null;});}}self.currentSlide = slide;currentIndex = index; //every time you change slides, reset the timer
restartTimer();}$scope.$on('$destroy',function(){destroyed = true;});function getSlideByIndex(index){if(angular.isUndefined(slides[index].index)){return slides[index];}var i,len=slides.length;for(i = 0;i < slides.length;++i) {if(slides[i].index == index){return slides[i];}}}self.getCurrentIndex = function(){if(self.currentSlide && angular.isDefined(self.currentSlide.index)){return +self.currentSlide.index;}return currentIndex;}; /* Allow outside people to call indexOf on slides array */$scope.indexOfSlide = function(slide){return angular.isDefined(slide.index)?+slide.index:slides.indexOf(slide);};$scope.next = function(){var newIndex=(self.getCurrentIndex() + 1) % slides.length;if(newIndex === 0 && $scope.noWrap()){$scope.pause();return;}return self.select(getSlideByIndex(newIndex),'next');};$scope.prev = function(){var newIndex=self.getCurrentIndex() - 1 < 0?slides.length - 1:self.getCurrentIndex() - 1;if($scope.noWrap() && newIndex === slides.length - 1){$scope.pause();return;}return self.select(getSlideByIndex(newIndex),'prev');};$scope.isActive = function(slide){return self.currentSlide === slide;};$scope.$watch('interval',restartTimer);$scope.$watchCollection('slides',resetTransition);$scope.$on('$destroy',resetTimer);function restartTimer(){resetTimer();var interval=+$scope.interval;if(!isNaN(interval) && interval > 0){currentInterval = $interval(timerFn,interval);}}function resetTimer(){if(currentInterval){$interval.cancel(currentInterval);currentInterval = null;}}function timerFn(){var interval=+$scope.interval;if(isPlaying && !isNaN(interval) && interval > 0 && slides.length){$scope.next();}else {$scope.pause();}}function resetTransition(slides){if(!slides.length){$scope.$currentTransition = null;}}$scope.play = function(){if(!isPlaying){isPlaying = true;restartTimer();}};$scope.pause = function(){if(!$scope.noPause){isPlaying = false;resetTimer();}};self.addSlide = function(slide,element){slide.$element = element;slides.push(slide); //if this is the first slide or the slide is set to active, select it
if(slides.length === 1 || slide.active){self.select(slides[slides.length - 1]);if(slides.length === 1){$scope.play();}}else {slide.active = false;}};self.removeSlide = function(slide){if(angular.isDefined(slide.index)){slides.sort(function(a,b){return +a.index > +b.index;});} //get the index of the slide inside the carousel
var index=slides.indexOf(slide);slides.splice(index,1);if(slides.length > 0 && slide.active){if(index >= slides.length){self.select(slides[index - 1]);}else {self.select(slides[index]);}}else if(currentIndex > index){currentIndex--;} //clean the currentSlide when no more slide
if(slides.length === 0){self.currentSlide = null;}};$scope.$watch('noTransition',function(noTransition){$element.data(NO_TRANSITION,noTransition);});}]) /**
 * @ngdoc directive
 * @name ui.bootstrap.carousel.directive:carousel
 * @restrict EA
 *
 * @description
 * Carousel is the outer container for a set of image 'slides' to showcase.
 *
 * @param {number=} interval The time, in milliseconds, that it will take the carousel to go to the next slide.
 * @param {boolean=} noTransition Whether to disable transitions on the carousel.
 * @param {boolean=} noPause Whether to disable pausing on the carousel (by default, the carousel interval pauses on hover).
 *
 * @example
<example module="ui.bootstrap">
  <file name="index.html">
    <uib-carousel>
      <uib-slide>
        <img src="http://placekitten.com/150/150" style="margin:auto;">
        <div class="carousel-caption">
          <p>Beautiful!</p>
        </div>
      </uib-slide>
      <uib-slide>
        <img src="http://placekitten.com/100/150" style="margin:auto;">
        <div class="carousel-caption">
          <p>D'aww!</p>
        </div>
      </uib-slide>
    </uib-carousel>
  </file>
  <file name="demo.css">
    .carousel-indicators {
      top: auto;
      bottom: 15px;
    }
  </file>
</example>
 */.directive('uibCarousel',[function(){return {transclude:true,replace:true,controller:'UibCarouselController',controllerAs:'carousel',require:'carousel',templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/carousel/carousel.html';},scope:{interval:'=',noTransition:'=',noPause:'=',noWrap:'&'}};}]) /**
 * @ngdoc directive
 * @name ui.bootstrap.carousel.directive:slide
 * @restrict EA
 *
 * @description
 * Creates a slide inside a {@link ui.bootstrap.carousel.directive:carousel carousel}.  Must be placed as a child of a carousel element.
 *
 * @param {boolean=} active Model binding, whether or not this slide is currently active.
 * @param {number=} index The index of the slide. The slides will be sorted by this parameter.
 *
 * @example
<example module="ui.bootstrap">
  <file name="index.html">
<div ng-controller="CarouselDemoCtrl">
  <uib-carousel>
    <uib-slide ng-repeat="slide in slides" active="slide.active" index="$index">
      <img ng-src="{{slide.image}}" style="margin:auto;">
      <div class="carousel-caption">
        <h4>Slide {{$index}}</h4>
        <p>{{slide.text}}</p>
      </div>
    </uib-slide>
  </uib-carousel>
  Interval, in milliseconds: <input type="number" ng-model="myInterval">
  <br />Enter a negative number to stop the interval.
</div>
  </file>
  <file name="script.js">
function CarouselDemoCtrl($scope) {
  $scope.myInterval = 5000;
}
  </file>
  <file name="demo.css">
    .carousel-indicators {
      top: auto;
      bottom: 15px;
    }
  </file>
</example>
*/.directive('uibSlide',function(){return {require:'^uibCarousel',restrict:'EA',transclude:true,replace:true,templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/carousel/slide.html';},scope:{active:'=?',actual:'=?',index:'=?'},link:function link(scope,element,attrs,carouselCtrl){carouselCtrl.addSlide(scope,element); //when the scope is destroyed then remove the slide from the current slides array
scope.$on('$destroy',function(){carouselCtrl.removeSlide(scope);});scope.$watch('active',function(active){if(active){carouselCtrl.select(scope);}});}};}).animation('.item',['$injector','$animate',function($injector,$animate){var NO_TRANSITION='uib-noTransition',SLIDE_DIRECTION='uib-slideDirection',$animateCss=null;if($injector.has('$animateCss')){$animateCss = $injector.get('$animateCss');}function removeClass(element,className,callback){element.removeClass(className);if(callback){callback();}}return {beforeAddClass:function beforeAddClass(element,className,done){ // Due to transclusion, noTransition property is on parent's scope
if(className == 'active' && element.parent() && element.parent().parent() && !element.parent().parent().data(NO_TRANSITION)){var stopped=false;var direction=element.data(SLIDE_DIRECTION);var directionClass=direction == 'next'?'left':'right';var removeClassFn=removeClass.bind(this,element,directionClass + ' ' + direction,done);element.addClass(direction);if($animateCss){$animateCss(element,{addClass:directionClass}).start().done(removeClassFn);}else {$animate.addClass(element,directionClass).then(function(){if(!stopped){removeClassFn();}done();});}return function(){stopped = true;};}done();},beforeRemoveClass:function beforeRemoveClass(element,className,done){ // Due to transclusion, noTransition property is on parent's scope
if(className === 'active' && element.parent() && element.parent().parent() && !element.parent().parent().data(NO_TRANSITION)){var stopped=false;var direction=element.data(SLIDE_DIRECTION);var directionClass=direction == 'next'?'left':'right';var removeClassFn=removeClass.bind(this,element,directionClass,done);if($animateCss){$animateCss(element,{addClass:directionClass}).start().done(removeClassFn);}else {$animate.addClass(element,directionClass).then(function(){if(!stopped){removeClassFn();}done();});}return function(){stopped = true;};}done();}};}]); /* deprecated carousel below */angular.module('ui.bootstrap.carousel').value('$carouselSuppressWarning',false).controller('CarouselController',['$scope','$element','$controller','$log','$carouselSuppressWarning',function($scope,$element,$controller,$log,$carouselSuppressWarning){if(!$carouselSuppressWarning){$log.warn('CarouselController is now deprecated. Use UibCarouselController instead.');}angular.extend(this,$controller('UibCarouselController',{$scope:$scope,$element:$element}));}]).directive('carousel',['$log','$carouselSuppressWarning',function($log,$carouselSuppressWarning){return {transclude:true,replace:true,controller:'CarouselController',controllerAs:'carousel',require:'carousel',templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/carousel/carousel.html';},scope:{interval:'=',noTransition:'=',noPause:'=',noWrap:'&'},link:function link(){if(!$carouselSuppressWarning){$log.warn('carousel is now deprecated. Use uib-carousel instead.');}}};}]).directive('slide',['$log','$carouselSuppressWarning',function($log,$carouselSuppressWarning){return {require:'^carousel',transclude:true,replace:true,templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/carousel/slide.html';},scope:{active:'=?',actual:'=?',index:'=?'},link:function link(scope,element,attrs,carouselCtrl){if(!$carouselSuppressWarning){$log.warn('slide is now deprecated. Use uib-slide instead.');}carouselCtrl.addSlide(scope,element); //when the scope is destroyed then remove the slide from the current slides array
scope.$on('$destroy',function(){carouselCtrl.removeSlide(scope);});scope.$watch('active',function(active){if(active){carouselCtrl.select(scope);}});}};}]);angular.module('ui.bootstrap.dateparser',[]).service('uibDateParser',['$log','$locale','orderByFilter',function($log,$locale,orderByFilter){ // Pulled from https://github.com/mbostock/d3/blob/master/src/format/requote.js
var SPECIAL_CHARACTERS_REGEXP=/[\\\^\$\*\+\?\|\[\]\(\)\.\{\}]/g;var localeId;var formatCodeToRegex;this.init = function(){localeId = $locale.id;this.parsers = {};formatCodeToRegex = {'yyyy':{regex:'\\d{4}',apply:function apply(value){this.year = +value;}},'yy':{regex:'\\d{2}',apply:function apply(value){this.year = +value + 2000;}},'y':{regex:'\\d{1,4}',apply:function apply(value){this.year = +value;}},'MMMM':{regex:$locale.DATETIME_FORMATS.MONTH.join('|'),apply:function apply(value){this.month = $locale.DATETIME_FORMATS.MONTH.indexOf(value);}},'MMM':{regex:$locale.DATETIME_FORMATS.SHORTMONTH.join('|'),apply:function apply(value){this.month = $locale.DATETIME_FORMATS.SHORTMONTH.indexOf(value);}},'MM':{regex:'0[1-9]|1[0-2]',apply:function apply(value){this.month = value - 1;}},'M':{regex:'[1-9]|1[0-2]',apply:function apply(value){this.month = value - 1;}},'dd':{regex:'[0-2][0-9]{1}|3[0-1]{1}',apply:function apply(value){this.date = +value;}},'d':{regex:'[1-2]?[0-9]{1}|3[0-1]{1}',apply:function apply(value){this.date = +value;}},'EEEE':{regex:$locale.DATETIME_FORMATS.DAY.join('|')},'EEE':{regex:$locale.DATETIME_FORMATS.SHORTDAY.join('|')},'HH':{regex:'(?:0|1)[0-9]|2[0-3]',apply:function apply(value){this.hours = +value;}},'hh':{regex:'0[0-9]|1[0-2]',apply:function apply(value){this.hours = +value;}},'H':{regex:'1?[0-9]|2[0-3]',apply:function apply(value){this.hours = +value;}},'h':{regex:'[0-9]|1[0-2]',apply:function apply(value){this.hours = +value;}},'mm':{regex:'[0-5][0-9]',apply:function apply(value){this.minutes = +value;}},'m':{regex:'[0-9]|[1-5][0-9]',apply:function apply(value){this.minutes = +value;}},'sss':{regex:'[0-9][0-9][0-9]',apply:function apply(value){this.milliseconds = +value;}},'ss':{regex:'[0-5][0-9]',apply:function apply(value){this.seconds = +value;}},'s':{regex:'[0-9]|[1-5][0-9]',apply:function apply(value){this.seconds = +value;}},'a':{regex:$locale.DATETIME_FORMATS.AMPMS.join('|'),apply:function apply(value){if(this.hours === 12){this.hours = 0;}if(value === 'PM'){this.hours += 12;}}}};};this.init();function createParser(format){var map=[],regex=format.split('');angular.forEach(formatCodeToRegex,function(data,code){var index=format.indexOf(code);if(index > -1){format = format.split('');regex[index] = '(' + data.regex + ')';format[index] = '$'; // Custom symbol to define consumed part of format
for(var i=index + 1,n=index + code.length;i < n;i++) {regex[i] = '';format[i] = '$';}format = format.join('');map.push({index:index,apply:data.apply});}});return {regex:new RegExp('^' + regex.join('') + '$'),map:orderByFilter(map,'index')};}this.parse = function(input,format,baseDate){if(!angular.isString(input) || !format){return input;}format = $locale.DATETIME_FORMATS[format] || format;format = format.replace(SPECIAL_CHARACTERS_REGEXP,'\\$&');if($locale.id !== localeId){this.init();}if(!this.parsers[format]){this.parsers[format] = createParser(format);}var parser=this.parsers[format],regex=parser.regex,map=parser.map,results=input.match(regex);if(results && results.length){var fields,dt;if(angular.isDate(baseDate) && !isNaN(baseDate.getTime())){fields = {year:baseDate.getFullYear(),month:baseDate.getMonth(),date:baseDate.getDate(),hours:baseDate.getHours(),minutes:baseDate.getMinutes(),seconds:baseDate.getSeconds(),milliseconds:baseDate.getMilliseconds()};}else {if(baseDate){$log.warn('dateparser:','baseDate is not a valid date');}fields = {year:1900,month:0,date:1,hours:0,minutes:0,seconds:0,milliseconds:0};}for(var i=1,n=results.length;i < n;i++) {var mapper=map[i - 1];if(mapper.apply){mapper.apply.call(fields,results[i]);}}if(isValid(fields.year,fields.month,fields.date)){if(angular.isDate(baseDate) && !isNaN(baseDate.getTime())){dt = new Date(baseDate);dt.setFullYear(fields.year,fields.month,fields.date,fields.hours,fields.minutes,fields.seconds,fields.milliseconds || 0);}else {dt = new Date(fields.year,fields.month,fields.date,fields.hours,fields.minutes,fields.seconds,fields.milliseconds || 0);}}return dt;}}; // Check if date is valid for specific month (and year for February).
// Month: 0 = Jan, 1 = Feb, etc
function isValid(year,month,date){if(date < 1){return false;}if(month === 1 && date > 28){return date === 29 && (year % 4 === 0 && year % 100 !== 0 || year % 400 === 0);}if(month === 3 || month === 5 || month === 8 || month === 10){return date < 31;}return true;}}]); /* Deprecated dateparser below */angular.module('ui.bootstrap.dateparser').value('$dateParserSuppressWarning',false).service('dateParser',['$log','$dateParserSuppressWarning','uibDateParser',function($log,$dateParserSuppressWarning,uibDateParser){if(!$dateParserSuppressWarning){$log.warn('dateParser is now deprecated. Use uibDateParser instead.');}angular.extend(this,uibDateParser);}]);angular.module('ui.bootstrap.position',[]) /**
 * A set of utility methods that can be use to retrieve position of DOM elements.
 * It is meant to be used where we need to absolute-position DOM elements in
 * relation to other, existing elements (this is the case for tooltips, popovers,
 * typeahead suggestions etc.).
 */.factory('$uibPosition',['$document','$window',function($document,$window){function getStyle(el,cssprop){if(el.currentStyle){ //IE
return el.currentStyle[cssprop];}else if($window.getComputedStyle){return $window.getComputedStyle(el)[cssprop];} // finally try and get inline style
return el.style[cssprop];} /**
     * Checks if a given element is statically positioned
     * @param element - raw DOM element
     */function isStaticPositioned(element){return (getStyle(element,'position') || 'static') === 'static';} /**
     * returns the closest, non-statically positioned parentOffset of a given element
     * @param element
     */var parentOffsetEl=function parentOffsetEl(element){var docDomEl=$document[0];var offsetParent=element.offsetParent || docDomEl;while(offsetParent && offsetParent !== docDomEl && isStaticPositioned(offsetParent)) {offsetParent = offsetParent.offsetParent;}return offsetParent || docDomEl;};return { /**
       * Provides read-only equivalent of jQuery's position function:
       * http://api.jquery.com/position/
       */position:function position(element){var elBCR=this.offset(element);var offsetParentBCR={top:0,left:0};var offsetParentEl=parentOffsetEl(element[0]);if(offsetParentEl != $document[0]){offsetParentBCR = this.offset(angular.element(offsetParentEl));offsetParentBCR.top += offsetParentEl.clientTop - offsetParentEl.scrollTop;offsetParentBCR.left += offsetParentEl.clientLeft - offsetParentEl.scrollLeft;}var boundingClientRect=element[0].getBoundingClientRect();return {width:boundingClientRect.width || element.prop('offsetWidth'),height:boundingClientRect.height || element.prop('offsetHeight'),top:elBCR.top - offsetParentBCR.top,left:elBCR.left - offsetParentBCR.left};}, /**
       * Provides read-only equivalent of jQuery's offset function:
       * http://api.jquery.com/offset/
       */offset:function offset(element){var boundingClientRect=element[0].getBoundingClientRect();return {width:boundingClientRect.width || element.prop('offsetWidth'),height:boundingClientRect.height || element.prop('offsetHeight'),top:boundingClientRect.top + ($window.pageYOffset || $document[0].documentElement.scrollTop),left:boundingClientRect.left + ($window.pageXOffset || $document[0].documentElement.scrollLeft)};}, /**
       * Provides coordinates for the targetEl in relation to hostEl
       */positionElements:function positionElements(hostEl,targetEl,positionStr,appendToBody){var positionStrParts=positionStr.split('-');var pos0=positionStrParts[0],pos1=positionStrParts[1] || 'center';var hostElPos,targetElWidth,targetElHeight,targetElPos;hostElPos = appendToBody?this.offset(hostEl):this.position(hostEl);targetElWidth = targetEl.prop('offsetWidth');targetElHeight = targetEl.prop('offsetHeight');var shiftWidth={center:function center(){return hostElPos.left + hostElPos.width / 2 - targetElWidth / 2;},left:function left(){return hostElPos.left;},right:function right(){return hostElPos.left + hostElPos.width;}};var shiftHeight={center:function center(){return hostElPos.top + hostElPos.height / 2 - targetElHeight / 2;},top:function top(){return hostElPos.top;},bottom:function bottom(){return hostElPos.top + hostElPos.height;}};switch(pos0){case 'right':targetElPos = {top:shiftHeight[pos1](),left:shiftWidth[pos0]()};break;case 'left':targetElPos = {top:shiftHeight[pos1](),left:hostElPos.left - targetElWidth};break;case 'bottom':targetElPos = {top:shiftHeight[pos0](),left:shiftWidth[pos1]()};break;default:targetElPos = {top:hostElPos.top - targetElHeight,left:shiftWidth[pos1]()};break;}return targetElPos;}};}]); /* Deprecated position below */angular.module('ui.bootstrap.position').value('$positionSuppressWarning',false).service('$position',['$log','$positionSuppressWarning','$uibPosition',function($log,$positionSuppressWarning,$uibPosition){if(!$positionSuppressWarning){$log.warn('$position is now deprecated. Use $uibPosition instead.');}angular.extend(this,$uibPosition);}]);angular.module('ui.bootstrap.datepicker',['ui.bootstrap.dateparser','ui.bootstrap.position']).value('$datepickerSuppressError',false).constant('uibDatepickerConfig',{formatDay:'dd',formatMonth:'MMMM',formatYear:'yyyy',formatDayHeader:'EEE',formatDayTitle:'MMMM yyyy',formatMonthTitle:'yyyy',datepickerMode:'day',minMode:'day',maxMode:'year',showWeeks:true,startingDay:0,yearRange:20,minDate:null,maxDate:null,shortcutPropagation:false}).controller('UibDatepickerController',['$scope','$attrs','$parse','$interpolate','$log','dateFilter','uibDatepickerConfig','$datepickerSuppressError',function($scope,$attrs,$parse,$interpolate,$log,dateFilter,datepickerConfig,$datepickerSuppressError){var self=this,ngModelCtrl={$setViewValue:angular.noop}; // nullModelCtrl;
// Modes chain
this.modes = ['day','month','year']; // Configuration attributes
angular.forEach(['formatDay','formatMonth','formatYear','formatDayHeader','formatDayTitle','formatMonthTitle','showWeeks','startingDay','yearRange','shortcutPropagation'],function(key,index){self[key] = angular.isDefined($attrs[key])?index < 6?$interpolate($attrs[key])($scope.$parent):$scope.$parent.$eval($attrs[key]):datepickerConfig[key];}); // Watchable date attributes
angular.forEach(['minDate','maxDate'],function(key){if($attrs[key]){$scope.$parent.$watch($parse($attrs[key]),function(value){self[key] = value?new Date(value):null;self.refreshView();});}else {self[key] = datepickerConfig[key]?new Date(datepickerConfig[key]):null;}});angular.forEach(['minMode','maxMode'],function(key){if($attrs[key]){$scope.$parent.$watch($parse($attrs[key]),function(value){self[key] = angular.isDefined(value)?value:$attrs[key];$scope[key] = self[key];if(key == 'minMode' && self.modes.indexOf($scope.datepickerMode) < self.modes.indexOf(self[key]) || key == 'maxMode' && self.modes.indexOf($scope.datepickerMode) > self.modes.indexOf(self[key])){$scope.datepickerMode = self[key];}});}else {self[key] = datepickerConfig[key] || null;$scope[key] = self[key];}});$scope.datepickerMode = $scope.datepickerMode || datepickerConfig.datepickerMode;$scope.uniqueId = 'datepicker-' + $scope.$id + '-' + Math.floor(Math.random() * 10000);if(angular.isDefined($attrs.initDate)){this.activeDate = $scope.$parent.$eval($attrs.initDate) || new Date();$scope.$parent.$watch($attrs.initDate,function(initDate){if(initDate && (ngModelCtrl.$isEmpty(ngModelCtrl.$modelValue) || ngModelCtrl.$invalid)){self.activeDate = initDate;self.refreshView();}});}else {this.activeDate = new Date();}$scope.isActive = function(dateObject){if(self.compare(dateObject.date,self.activeDate) === 0){$scope.activeDateId = dateObject.uid;return true;}return false;};this.init = function(ngModelCtrl_){ngModelCtrl = ngModelCtrl_;ngModelCtrl.$render = function(){self.render();};};this.render = function(){if(ngModelCtrl.$viewValue){var date=new Date(ngModelCtrl.$viewValue),isValid=!isNaN(date);if(isValid){this.activeDate = date;}else if(!$datepickerSuppressError){$log.error('Datepicker directive: "ng-model" value must be a Date object, a number of milliseconds since 01.01.1970 or a string representing an RFC2822 or ISO 8601 date.');}}this.refreshView();};this.refreshView = function(){if(this.element){this._refreshView();var date=ngModelCtrl.$viewValue?new Date(ngModelCtrl.$viewValue):null;ngModelCtrl.$setValidity('dateDisabled',!date || this.element && !this.isDisabled(date));}};this.createDateObject = function(date,format){var model=ngModelCtrl.$viewValue?new Date(ngModelCtrl.$viewValue):null;return {date:date,label:dateFilter(date,format),selected:model && this.compare(date,model) === 0,disabled:this.isDisabled(date),current:this.compare(date,new Date()) === 0,customClass:this.customClass(date)};};this.isDisabled = function(date){return this.minDate && this.compare(date,this.minDate) < 0 || this.maxDate && this.compare(date,this.maxDate) > 0 || $attrs.dateDisabled && $scope.dateDisabled({date:date,mode:$scope.datepickerMode});};this.customClass = function(date){return $scope.customClass({date:date,mode:$scope.datepickerMode});}; // Split array into smaller arrays
this.split = function(arr,size){var arrays=[];while(arr.length > 0) {arrays.push(arr.splice(0,size));}return arrays;};$scope.select = function(date){if($scope.datepickerMode === self.minMode){var dt=ngModelCtrl.$viewValue?new Date(ngModelCtrl.$viewValue):new Date(0,0,0,0,0,0,0);dt.setFullYear(date.getFullYear(),date.getMonth(),date.getDate());ngModelCtrl.$setViewValue(dt);ngModelCtrl.$render();}else {self.activeDate = date;$scope.datepickerMode = self.modes[self.modes.indexOf($scope.datepickerMode) - 1];}};$scope.move = function(direction){var year=self.activeDate.getFullYear() + direction * (self.step.years || 0),month=self.activeDate.getMonth() + direction * (self.step.months || 0);self.activeDate.setFullYear(year,month,1);self.refreshView();};$scope.toggleMode = function(direction){direction = direction || 1;if($scope.datepickerMode === self.maxMode && direction === 1 || $scope.datepickerMode === self.minMode && direction === -1){return;}$scope.datepickerMode = self.modes[self.modes.indexOf($scope.datepickerMode) + direction];}; // Key event mapper
$scope.keys = {13:'enter',32:'space',33:'pageup',34:'pagedown',35:'end',36:'home',37:'left',38:'up',39:'right',40:'down'};var focusElement=function focusElement(){self.element[0].focus();}; // Listen for focus requests from popup directive
$scope.$on('uib:datepicker.focus',focusElement);$scope.keydown = function(evt){var key=$scope.keys[evt.which];if(!key || evt.shiftKey || evt.altKey){return;}evt.preventDefault();if(!self.shortcutPropagation){evt.stopPropagation();}if(key === 'enter' || key === 'space'){if(self.isDisabled(self.activeDate)){return; // do nothing
}$scope.select(self.activeDate);}else if(evt.ctrlKey && (key === 'up' || key === 'down')){$scope.toggleMode(key === 'up'?1:-1);}else {self.handleKeyDown(key,evt);self.refreshView();}};}]).controller('UibDaypickerController',['$scope','$element','dateFilter',function(scope,$element,dateFilter){var DAYS_IN_MONTH=[31,28,31,30,31,30,31,31,30,31,30,31];this.step = {months:1};this.element = $element;function getDaysInMonth(year,month){return month === 1 && year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)?29:DAYS_IN_MONTH[month];}this.init = function(ctrl){angular.extend(ctrl,this);scope.showWeeks = ctrl.showWeeks;ctrl.refreshView();};this.getDates = function(startDate,n){var dates=new Array(n),current=new Date(startDate),i=0,date;while(i < n) {date = new Date(current);dates[i++] = date;current.setDate(current.getDate() + 1);}return dates;};this._refreshView = function(){var year=this.activeDate.getFullYear(),month=this.activeDate.getMonth(),firstDayOfMonth=new Date(this.activeDate);firstDayOfMonth.setFullYear(year,month,1);var difference=this.startingDay - firstDayOfMonth.getDay(),numDisplayedFromPreviousMonth=difference > 0?7 - difference:-difference,firstDate=new Date(firstDayOfMonth);if(numDisplayedFromPreviousMonth > 0){firstDate.setDate(-numDisplayedFromPreviousMonth + 1);} // 42 is the number of days on a six-month calendar
var days=this.getDates(firstDate,42);for(var i=0;i < 42;i++) {days[i] = angular.extend(this.createDateObject(days[i],this.formatDay),{secondary:days[i].getMonth() !== month,uid:scope.uniqueId + '-' + i});}scope.labels = new Array(7);for(var j=0;j < 7;j++) {scope.labels[j] = {abbr:dateFilter(days[j].date,this.formatDayHeader),full:dateFilter(days[j].date,'EEEE')};}scope.title = dateFilter(this.activeDate,this.formatDayTitle);scope.rows = this.split(days,7);if(scope.showWeeks){scope.weekNumbers = [];var thursdayIndex=(4 + 7 - this.startingDay) % 7,numWeeks=scope.rows.length;for(var curWeek=0;curWeek < numWeeks;curWeek++) {scope.weekNumbers.push(getISO8601WeekNumber(scope.rows[curWeek][thursdayIndex].date));}}};this.compare = function(date1,date2){return new Date(date1.getFullYear(),date1.getMonth(),date1.getDate()) - new Date(date2.getFullYear(),date2.getMonth(),date2.getDate());};function getISO8601WeekNumber(date){var checkDate=new Date(date);checkDate.setDate(checkDate.getDate() + 4 - (checkDate.getDay() || 7)); // Thursday
var time=checkDate.getTime();checkDate.setMonth(0); // Compare with Jan 1
checkDate.setDate(1);return Math.floor(Math.round((time - checkDate) / 86400000) / 7) + 1;}this.handleKeyDown = function(key,evt){var date=this.activeDate.getDate();if(key === 'left'){date = date - 1; // up
}else if(key === 'up'){date = date - 7; // down
}else if(key === 'right'){date = date + 1; // down
}else if(key === 'down'){date = date + 7;}else if(key === 'pageup' || key === 'pagedown'){var month=this.activeDate.getMonth() + (key === 'pageup'?-1:1);this.activeDate.setMonth(month,1);date = Math.min(getDaysInMonth(this.activeDate.getFullYear(),this.activeDate.getMonth()),date);}else if(key === 'home'){date = 1;}else if(key === 'end'){date = getDaysInMonth(this.activeDate.getFullYear(),this.activeDate.getMonth());}this.activeDate.setDate(date);};}]).controller('UibMonthpickerController',['$scope','$element','dateFilter',function(scope,$element,dateFilter){this.step = {years:1};this.element = $element;this.init = function(ctrl){angular.extend(ctrl,this);ctrl.refreshView();};this._refreshView = function(){var months=new Array(12),year=this.activeDate.getFullYear(),date;for(var i=0;i < 12;i++) {date = new Date(this.activeDate);date.setFullYear(year,i,1);months[i] = angular.extend(this.createDateObject(date,this.formatMonth),{uid:scope.uniqueId + '-' + i});}scope.title = dateFilter(this.activeDate,this.formatMonthTitle);scope.rows = this.split(months,3);};this.compare = function(date1,date2){return new Date(date1.getFullYear(),date1.getMonth()) - new Date(date2.getFullYear(),date2.getMonth());};this.handleKeyDown = function(key,evt){var date=this.activeDate.getMonth();if(key === 'left'){date = date - 1; // up
}else if(key === 'up'){date = date - 3; // down
}else if(key === 'right'){date = date + 1; // down
}else if(key === 'down'){date = date + 3;}else if(key === 'pageup' || key === 'pagedown'){var year=this.activeDate.getFullYear() + (key === 'pageup'?-1:1);this.activeDate.setFullYear(year);}else if(key === 'home'){date = 0;}else if(key === 'end'){date = 11;}this.activeDate.setMonth(date);};}]).controller('UibYearpickerController',['$scope','$element','dateFilter',function(scope,$element,dateFilter){var range;this.element = $element;function getStartingYear(year){return parseInt((year - 1) / range,10) * range + 1;}this.yearpickerInit = function(){range = this.yearRange;this.step = {years:range};};this._refreshView = function(){var years=new Array(range),date;for(var i=0,start=getStartingYear(this.activeDate.getFullYear());i < range;i++) {date = new Date(this.activeDate);date.setFullYear(start + i,0,1);years[i] = angular.extend(this.createDateObject(date,this.formatYear),{uid:scope.uniqueId + '-' + i});}scope.title = [years[0].label,years[range - 1].label].join(' - ');scope.rows = this.split(years,5);};this.compare = function(date1,date2){return date1.getFullYear() - date2.getFullYear();};this.handleKeyDown = function(key,evt){var date=this.activeDate.getFullYear();if(key === 'left'){date = date - 1; // up
}else if(key === 'up'){date = date - 5; // down
}else if(key === 'right'){date = date + 1; // down
}else if(key === 'down'){date = date + 5;}else if(key === 'pageup' || key === 'pagedown'){date += (key === 'pageup'?-1:1) * this.step.years;}else if(key === 'home'){date = getStartingYear(this.activeDate.getFullYear());}else if(key === 'end'){date = getStartingYear(this.activeDate.getFullYear()) + range - 1;}this.activeDate.setFullYear(date);};}]).directive('uibDatepicker',function(){return {replace:true,templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/datepicker/datepicker.html';},scope:{datepickerMode:'=?',dateDisabled:'&',customClass:'&',shortcutPropagation:'&?'},require:['uibDatepicker','^ngModel'],controller:'UibDatepickerController',controllerAs:'datepicker',link:function link(scope,element,attrs,ctrls){var datepickerCtrl=ctrls[0],ngModelCtrl=ctrls[1];datepickerCtrl.init(ngModelCtrl);}};}).directive('uibDaypicker',function(){return {replace:true,templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/datepicker/day.html';},require:['^?uibDatepicker','uibDaypicker','^?datepicker'],controller:'UibDaypickerController',link:function link(scope,element,attrs,ctrls){var datepickerCtrl=ctrls[0] || ctrls[2],daypickerCtrl=ctrls[1];daypickerCtrl.init(datepickerCtrl);}};}).directive('uibMonthpicker',function(){return {replace:true,templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/datepicker/month.html';},require:['^?uibDatepicker','uibMonthpicker','^?datepicker'],controller:'UibMonthpickerController',link:function link(scope,element,attrs,ctrls){var datepickerCtrl=ctrls[0] || ctrls[2],monthpickerCtrl=ctrls[1];monthpickerCtrl.init(datepickerCtrl);}};}).directive('uibYearpicker',function(){return {replace:true,templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/datepicker/year.html';},require:['^?uibDatepicker','uibYearpicker','^?datepicker'],controller:'UibYearpickerController',link:function link(scope,element,attrs,ctrls){var ctrl=ctrls[0] || ctrls[2];angular.extend(ctrl,ctrls[1]);ctrl.yearpickerInit();ctrl.refreshView();}};}).constant('uibDatepickerPopupConfig',{datepickerPopup:'yyyy-MM-dd',datepickerPopupTemplateUrl:'template/datepicker/popup.html',datepickerTemplateUrl:'template/datepicker/datepicker.html',html5Types:{date:'yyyy-MM-dd','datetime-local':'yyyy-MM-ddTHH:mm:ss.sss','month':'yyyy-MM'},currentText:'Today',clearText:'Clear',closeText:'Done',closeOnDateSelection:true,appendToBody:false,showButtonBar:true,onOpenFocus:true}).controller('UibDatepickerPopupController',['$scope','$element','$attrs','$compile','$parse','$document','$rootScope','$uibPosition','dateFilter','uibDateParser','uibDatepickerPopupConfig','$timeout',function(scope,element,attrs,$compile,$parse,$document,$rootScope,$position,dateFilter,dateParser,datepickerPopupConfig,$timeout){var self=this;var cache={},isHtml5DateInput=false;var dateFormat,closeOnDateSelection,appendToBody,onOpenFocus,datepickerPopupTemplateUrl,datepickerTemplateUrl,popupEl,datepickerEl,ngModel,$popup;scope.watchData = {};this.init = function(_ngModel_){ngModel = _ngModel_;closeOnDateSelection = angular.isDefined(attrs.closeOnDateSelection)?scope.$parent.$eval(attrs.closeOnDateSelection):datepickerPopupConfig.closeOnDateSelection;appendToBody = angular.isDefined(attrs.datepickerAppendToBody)?scope.$parent.$eval(attrs.datepickerAppendToBody):datepickerPopupConfig.appendToBody;onOpenFocus = angular.isDefined(attrs.onOpenFocus)?scope.$parent.$eval(attrs.onOpenFocus):datepickerPopupConfig.onOpenFocus;datepickerPopupTemplateUrl = angular.isDefined(attrs.datepickerPopupTemplateUrl)?attrs.datepickerPopupTemplateUrl:datepickerPopupConfig.datepickerPopupTemplateUrl;datepickerTemplateUrl = angular.isDefined(attrs.datepickerTemplateUrl)?attrs.datepickerTemplateUrl:datepickerPopupConfig.datepickerTemplateUrl;scope.showButtonBar = angular.isDefined(attrs.showButtonBar)?scope.$parent.$eval(attrs.showButtonBar):datepickerPopupConfig.showButtonBar;if(datepickerPopupConfig.html5Types[attrs.type]){dateFormat = datepickerPopupConfig.html5Types[attrs.type];isHtml5DateInput = true;}else {dateFormat = attrs.datepickerPopup || attrs.uibDatepickerPopup || datepickerPopupConfig.datepickerPopup;attrs.$observe('uibDatepickerPopup',function(value,oldValue){var newDateFormat=value || datepickerPopupConfig.datepickerPopup; // Invalidate the $modelValue to ensure that formatters re-run
// FIXME: Refactor when PR is merged: https://github.com/angular/angular.js/pull/10764
if(newDateFormat !== dateFormat){dateFormat = newDateFormat;ngModel.$modelValue = null;if(!dateFormat){throw new Error('uibDatepickerPopup must have a date format specified.');}}});}if(!dateFormat){throw new Error('uibDatepickerPopup must have a date format specified.');}if(isHtml5DateInput && attrs.datepickerPopup){throw new Error('HTML5 date input types do not support custom formats.');} // popup element used to display calendar
popupEl = angular.element('<div uib-datepicker-popup-wrap><div uib-datepicker></div></div>');popupEl.attr({'ng-model':'date','ng-change':'dateSelection(date)','template-url':datepickerPopupTemplateUrl}); // datepicker element
datepickerEl = angular.element(popupEl.children()[0]);datepickerEl.attr('template-url',datepickerTemplateUrl);if(isHtml5DateInput){if(attrs.type === 'month'){datepickerEl.attr('datepicker-mode','"month"');datepickerEl.attr('min-mode','month');}}if(attrs.datepickerOptions){var options=scope.$parent.$eval(attrs.datepickerOptions);if(options && options.initDate){scope.initDate = options.initDate;datepickerEl.attr('init-date','initDate');delete options.initDate;}angular.forEach(options,function(value,option){datepickerEl.attr(cameltoDash(option),value);});}angular.forEach(['minMode','maxMode','minDate','maxDate','datepickerMode','initDate','shortcutPropagation'],function(key){if(attrs[key]){var getAttribute=$parse(attrs[key]);scope.$parent.$watch(getAttribute,function(value){scope.watchData[key] = value;if(key === 'minDate' || key === 'maxDate'){cache[key] = new Date(value);}});datepickerEl.attr(cameltoDash(key),'watchData.' + key); // Propagate changes from datepicker to outside
if(key === 'datepickerMode'){var setAttribute=getAttribute.assign;scope.$watch('watchData.' + key,function(value,oldvalue){if(angular.isFunction(setAttribute) && value !== oldvalue){setAttribute(scope.$parent,value);}});}}});if(attrs.dateDisabled){datepickerEl.attr('date-disabled','dateDisabled({ date: date, mode: mode })');}if(attrs.showWeeks){datepickerEl.attr('show-weeks',attrs.showWeeks);}if(attrs.customClass){datepickerEl.attr('custom-class','customClass({ date: date, mode: mode })');}if(!isHtml5DateInput){ // Internal API to maintain the correct ng-invalid-[key] class
ngModel.$$parserName = 'date';ngModel.$validators.date = validator;ngModel.$parsers.unshift(parseDate);ngModel.$formatters.push(function(value){scope.date = value;return ngModel.$isEmpty(value)?value:dateFilter(value,dateFormat);});}else {ngModel.$formatters.push(function(value){scope.date = value;return value;});} // Detect changes in the view from the text box
ngModel.$viewChangeListeners.push(function(){scope.date = dateParser.parse(ngModel.$viewValue,dateFormat,scope.date);});element.bind('keydown',inputKeydownBind);$popup = $compile(popupEl)(scope); // Prevent jQuery cache memory leak (template is now redundant after linking)
popupEl.remove();if(appendToBody){$document.find('body').append($popup);}else {element.after($popup);}scope.$on('$destroy',function(){if(scope.isOpen === true){if(!$rootScope.$$phase){scope.$apply(function(){scope.isOpen = false;});}}$popup.remove();element.unbind('keydown',inputKeydownBind);$document.unbind('click',documentClickBind);});};scope.getText = function(key){return scope[key + 'Text'] || datepickerPopupConfig[key + 'Text'];};scope.isDisabled = function(date){if(date === 'today'){date = new Date();}return scope.watchData.minDate && scope.compare(date,cache.minDate) < 0 || scope.watchData.maxDate && scope.compare(date,cache.maxDate) > 0;};scope.compare = function(date1,date2){return new Date(date1.getFullYear(),date1.getMonth(),date1.getDate()) - new Date(date2.getFullYear(),date2.getMonth(),date2.getDate());}; // Inner change
scope.dateSelection = function(dt){if(angular.isDefined(dt)){scope.date = dt;}var date=scope.date?dateFilter(scope.date,dateFormat):null; // Setting to NULL is necessary for form validators to function
element.val(date);ngModel.$setViewValue(date);if(closeOnDateSelection){scope.isOpen = false;element[0].focus();}};scope.keydown = function(evt){if(evt.which === 27){scope.isOpen = false;element[0].focus();}};scope.select = function(date){if(date === 'today'){var today=new Date();if(angular.isDate(scope.date)){date = new Date(scope.date);date.setFullYear(today.getFullYear(),today.getMonth(),today.getDate());}else {date = new Date(today.setHours(0,0,0,0));}}scope.dateSelection(date);};scope.close = function(){scope.isOpen = false;element[0].focus();};scope.$watch('isOpen',function(value){if(value){scope.position = appendToBody?$position.offset(element):$position.position(element);scope.position.top = scope.position.top + element.prop('offsetHeight');$timeout(function(){if(onOpenFocus){scope.$broadcast('uib:datepicker.focus');}$document.bind('click',documentClickBind);},0,false);}else {$document.unbind('click',documentClickBind);}});function cameltoDash(string){return string.replace(/([A-Z])/g,function($1){return '-' + $1.toLowerCase();});}function parseDate(viewValue){if(angular.isNumber(viewValue)){ // presumably timestamp to date object
viewValue = new Date(viewValue);}if(!viewValue){return null;}else if(angular.isDate(viewValue) && !isNaN(viewValue)){return viewValue;}else if(angular.isString(viewValue)){var date=dateParser.parse(viewValue,dateFormat,scope.date);if(isNaN(date)){return undefined;}else {return date;}}else {return undefined;}}function validator(modelValue,viewValue){var value=modelValue || viewValue;if(!attrs.ngRequired && !value){return true;}if(angular.isNumber(value)){value = new Date(value);}if(!value){return true;}else if(angular.isDate(value) && !isNaN(value)){return true;}else if(angular.isString(value)){var date=dateParser.parse(value,dateFormat);return !isNaN(date);}else {return false;}}function documentClickBind(event){var popup=$popup[0];var dpContainsTarget=element[0].contains(event.target); // The popup node may not be an element node
// In some browsers (IE) only element nodes have the 'contains' function
var popupContainsTarget=popup.contains !== undefined && popup.contains(event.target);if(scope.isOpen && !(dpContainsTarget || popupContainsTarget)){scope.$apply(function(){scope.isOpen = false;});}}function inputKeydownBind(evt){if(evt.which === 27 && scope.isOpen){evt.preventDefault();evt.stopPropagation();scope.$apply(function(){scope.isOpen = false;});element[0].focus();}else if(evt.which === 40 && !scope.isOpen){evt.preventDefault();evt.stopPropagation();scope.$apply(function(){scope.isOpen = true;});}}}]).directive('uibDatepickerPopup',function(){return {require:['ngModel','uibDatepickerPopup'],controller:'UibDatepickerPopupController',scope:{isOpen:'=?',currentText:'@',clearText:'@',closeText:'@',dateDisabled:'&',customClass:'&'},link:function link(scope,element,attrs,ctrls){var ngModel=ctrls[0],ctrl=ctrls[1];ctrl.init(ngModel);}};}).directive('uibDatepickerPopupWrap',function(){return {replace:true,transclude:true,templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/datepicker/popup.html';}};}); /* Deprecated datepicker below */angular.module('ui.bootstrap.datepicker').value('$datepickerSuppressWarning',false).controller('DatepickerController',['$scope','$attrs','$parse','$interpolate','$log','dateFilter','uibDatepickerConfig','$datepickerSuppressError','$datepickerSuppressWarning',function($scope,$attrs,$parse,$interpolate,$log,dateFilter,datepickerConfig,$datepickerSuppressError,$datepickerSuppressWarning){if(!$datepickerSuppressWarning){$log.warn('DatepickerController is now deprecated. Use UibDatepickerController instead.');}var self=this,ngModelCtrl={$setViewValue:angular.noop}; // nullModelCtrl;
this.modes = ['day','month','year'];angular.forEach(['formatDay','formatMonth','formatYear','formatDayHeader','formatDayTitle','formatMonthTitle','showWeeks','startingDay','yearRange','shortcutPropagation'],function(key,index){self[key] = angular.isDefined($attrs[key])?index < 6?$interpolate($attrs[key])($scope.$parent):$scope.$parent.$eval($attrs[key]):datepickerConfig[key];});angular.forEach(['minDate','maxDate'],function(key){if($attrs[key]){$scope.$parent.$watch($parse($attrs[key]),function(value){self[key] = value?new Date(value):null;self.refreshView();});}else {self[key] = datepickerConfig[key]?new Date(datepickerConfig[key]):null;}});angular.forEach(['minMode','maxMode'],function(key){if($attrs[key]){$scope.$parent.$watch($parse($attrs[key]),function(value){self[key] = angular.isDefined(value)?value:$attrs[key];$scope[key] = self[key];if(key == 'minMode' && self.modes.indexOf($scope.datepickerMode) < self.modes.indexOf(self[key]) || key == 'maxMode' && self.modes.indexOf($scope.datepickerMode) > self.modes.indexOf(self[key])){$scope.datepickerMode = self[key];}});}else {self[key] = datepickerConfig[key] || null;$scope[key] = self[key];}});$scope.datepickerMode = $scope.datepickerMode || datepickerConfig.datepickerMode;$scope.uniqueId = 'datepicker-' + $scope.$id + '-' + Math.floor(Math.random() * 10000);if(angular.isDefined($attrs.initDate)){this.activeDate = $scope.$parent.$eval($attrs.initDate) || new Date();$scope.$parent.$watch($attrs.initDate,function(initDate){if(initDate && (ngModelCtrl.$isEmpty(ngModelCtrl.$modelValue) || ngModelCtrl.$invalid)){self.activeDate = initDate;self.refreshView();}});}else {this.activeDate = new Date();}$scope.isActive = function(dateObject){if(self.compare(dateObject.date,self.activeDate) === 0){$scope.activeDateId = dateObject.uid;return true;}return false;};this.init = function(ngModelCtrl_){ngModelCtrl = ngModelCtrl_;ngModelCtrl.$render = function(){self.render();};};this.render = function(){if(ngModelCtrl.$viewValue){var date=new Date(ngModelCtrl.$viewValue),isValid=!isNaN(date);if(isValid){this.activeDate = date;}else if(!$datepickerSuppressError){$log.error('Datepicker directive: "ng-model" value must be a Date object, a number of milliseconds since 01.01.1970 or a string representing an RFC2822 or ISO 8601 date.');}}this.refreshView();};this.refreshView = function(){if(this.element){this._refreshView();var date=ngModelCtrl.$viewValue?new Date(ngModelCtrl.$viewValue):null;ngModelCtrl.$setValidity('dateDisabled',!date || this.element && !this.isDisabled(date));}};this.createDateObject = function(date,format){var model=ngModelCtrl.$viewValue?new Date(ngModelCtrl.$viewValue):null;return {date:date,label:dateFilter(date,format),selected:model && this.compare(date,model) === 0,disabled:this.isDisabled(date),current:this.compare(date,new Date()) === 0,customClass:this.customClass(date)};};this.isDisabled = function(date){return this.minDate && this.compare(date,this.minDate) < 0 || this.maxDate && this.compare(date,this.maxDate) > 0 || $attrs.dateDisabled && $scope.dateDisabled({date:date,mode:$scope.datepickerMode});};this.customClass = function(date){return $scope.customClass({date:date,mode:$scope.datepickerMode});}; // Split array into smaller arrays
this.split = function(arr,size){var arrays=[];while(arr.length > 0) {arrays.push(arr.splice(0,size));}return arrays;};this.fixTimeZone = function(date){var hours=date.getHours();date.setHours(hours === 23?hours + 2:0);};$scope.select = function(date){if($scope.datepickerMode === self.minMode){var dt=ngModelCtrl.$viewValue?new Date(ngModelCtrl.$viewValue):new Date(0,0,0,0,0,0,0);dt.setFullYear(date.getFullYear(),date.getMonth(),date.getDate());ngModelCtrl.$setViewValue(dt);ngModelCtrl.$render();}else {self.activeDate = date;$scope.datepickerMode = self.modes[self.modes.indexOf($scope.datepickerMode) - 1];}};$scope.move = function(direction){var year=self.activeDate.getFullYear() + direction * (self.step.years || 0),month=self.activeDate.getMonth() + direction * (self.step.months || 0);self.activeDate.setFullYear(year,month,1);self.refreshView();};$scope.toggleMode = function(direction){direction = direction || 1;if($scope.datepickerMode === self.maxMode && direction === 1 || $scope.datepickerMode === self.minMode && direction === -1){return;}$scope.datepickerMode = self.modes[self.modes.indexOf($scope.datepickerMode) + direction];}; // Key event mapper
$scope.keys = {13:'enter',32:'space',33:'pageup',34:'pagedown',35:'end',36:'home',37:'left',38:'up',39:'right',40:'down'};var focusElement=function focusElement(){self.element[0].focus();};$scope.$on('uib:datepicker.focus',focusElement);$scope.keydown = function(evt){var key=$scope.keys[evt.which];if(!key || evt.shiftKey || evt.altKey){return;}evt.preventDefault();if(!self.shortcutPropagation){evt.stopPropagation();}if(key === 'enter' || key === 'space'){if(self.isDisabled(self.activeDate)){return; // do nothing
}$scope.select(self.activeDate);}else if(evt.ctrlKey && (key === 'up' || key === 'down')){$scope.toggleMode(key === 'up'?1:-1);}else {self.handleKeyDown(key,evt);self.refreshView();}};}]).directive('datepicker',['$log','$datepickerSuppressWarning',function($log,$datepickerSuppressWarning){return {replace:true,templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/datepicker/datepicker.html';},scope:{datepickerMode:'=?',dateDisabled:'&',customClass:'&',shortcutPropagation:'&?'},require:['datepicker','^ngModel'],controller:'DatepickerController',controllerAs:'datepicker',link:function link(scope,element,attrs,ctrls){if(!$datepickerSuppressWarning){$log.warn('datepicker is now deprecated. Use uib-datepicker instead.');}var datepickerCtrl=ctrls[0],ngModelCtrl=ctrls[1];datepickerCtrl.init(ngModelCtrl);}};}]).directive('daypicker',['$log','$datepickerSuppressWarning',function($log,$datepickerSuppressWarning){return {replace:true,templateUrl:'template/datepicker/day.html',require:['^datepicker','daypicker'],controller:'UibDaypickerController',link:function link(scope,element,attrs,ctrls){if(!$datepickerSuppressWarning){$log.warn('daypicker is now deprecated. Use uib-daypicker instead.');}var datepickerCtrl=ctrls[0],daypickerCtrl=ctrls[1];daypickerCtrl.init(datepickerCtrl);}};}]).directive('monthpicker',['$log','$datepickerSuppressWarning',function($log,$datepickerSuppressWarning){return {replace:true,templateUrl:'template/datepicker/month.html',require:['^datepicker','monthpicker'],controller:'UibMonthpickerController',link:function link(scope,element,attrs,ctrls){if(!$datepickerSuppressWarning){$log.warn('monthpicker is now deprecated. Use uib-monthpicker instead.');}var datepickerCtrl=ctrls[0],monthpickerCtrl=ctrls[1];monthpickerCtrl.init(datepickerCtrl);}};}]).directive('yearpicker',['$log','$datepickerSuppressWarning',function($log,$datepickerSuppressWarning){return {replace:true,templateUrl:'template/datepicker/year.html',require:['^datepicker','yearpicker'],controller:'UibYearpickerController',link:function link(scope,element,attrs,ctrls){if(!$datepickerSuppressWarning){$log.warn('yearpicker is now deprecated. Use uib-yearpicker instead.');}var ctrl=ctrls[0];angular.extend(ctrl,ctrls[1]);ctrl.yearpickerInit();ctrl.refreshView();}};}]).directive('datepickerPopup',['$log','$datepickerSuppressWarning',function($log,$datepickerSuppressWarning){return {require:['ngModel','datepickerPopup'],controller:'UibDatepickerPopupController',scope:{isOpen:'=?',currentText:'@',clearText:'@',closeText:'@',dateDisabled:'&',customClass:'&'},link:function link(scope,element,attrs,ctrls){if(!$datepickerSuppressWarning){$log.warn('datepicker-popup is now deprecated. Use uib-datepicker-popup instead.');}var ngModel=ctrls[0],ctrl=ctrls[1];ctrl.init(ngModel);}};}]).directive('datepickerPopupWrap',['$log','$datepickerSuppressWarning',function($log,$datepickerSuppressWarning){return {replace:true,transclude:true,templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/datepicker/popup.html';},link:function link(){if(!$datepickerSuppressWarning){$log.warn('datepicker-popup-wrap is now deprecated. Use uib-datepicker-popup-wrap instead.');}}};}]);angular.module('ui.bootstrap.dropdown',['ui.bootstrap.position']).constant('uibDropdownConfig',{openClass:'open'}).service('uibDropdownService',['$document','$rootScope',function($document,$rootScope){var openScope=null;this.open = function(dropdownScope){if(!openScope){$document.bind('click',closeDropdown);$document.bind('keydown',keybindFilter);}if(openScope && openScope !== dropdownScope){openScope.isOpen = false;}openScope = dropdownScope;};this.close = function(dropdownScope){if(openScope === dropdownScope){openScope = null;$document.unbind('click',closeDropdown);$document.unbind('keydown',keybindFilter);}};var closeDropdown=function closeDropdown(evt){ // This method may still be called during the same mouse event that
// unbound this event handler. So check openScope before proceeding.
if(!openScope){return;}if(evt && openScope.getAutoClose() === 'disabled'){return;}var toggleElement=openScope.getToggleElement();if(evt && toggleElement && toggleElement[0].contains(evt.target)){return;}var dropdownElement=openScope.getDropdownElement();if(evt && openScope.getAutoClose() === 'outsideClick' && dropdownElement && dropdownElement[0].contains(evt.target)){return;}openScope.isOpen = false;if(!$rootScope.$$phase){openScope.$apply();}};var keybindFilter=function keybindFilter(evt){if(evt.which === 27){openScope.focusToggleElement();closeDropdown();}else if(openScope.isKeynavEnabled() && /(38|40)/.test(evt.which) && openScope.isOpen){evt.preventDefault();evt.stopPropagation();openScope.focusDropdownEntry(evt.which);}};}]).controller('UibDropdownController',['$scope','$element','$attrs','$parse','uibDropdownConfig','uibDropdownService','$animate','$uibPosition','$document','$compile','$templateRequest',function($scope,$element,$attrs,$parse,dropdownConfig,uibDropdownService,$animate,$position,$document,$compile,$templateRequest){var self=this,scope=$scope.$new(), // create a child scope so we are not polluting original one
templateScope,openClass=dropdownConfig.openClass,getIsOpen,setIsOpen=angular.noop,toggleInvoker=$attrs.onToggle?$parse($attrs.onToggle):angular.noop,appendToBody=false,keynavEnabled=false,selectedOption=null;$element.addClass('dropdown');this.init = function(){if($attrs.isOpen){getIsOpen = $parse($attrs.isOpen);setIsOpen = getIsOpen.assign;$scope.$watch(getIsOpen,function(value){scope.isOpen = !!value;});}appendToBody = angular.isDefined($attrs.dropdownAppendToBody);keynavEnabled = angular.isDefined($attrs.uibKeyboardNav);if(appendToBody && self.dropdownMenu){$document.find('body').append(self.dropdownMenu);$element.on('$destroy',function handleDestroyEvent(){self.dropdownMenu.remove();});}};this.toggle = function(open){return scope.isOpen = arguments.length?!!open:!scope.isOpen;}; // Allow other directives to watch status
this.isOpen = function(){return scope.isOpen;};scope.getToggleElement = function(){return self.toggleElement;};scope.getAutoClose = function(){return $attrs.autoClose || 'always'; //or 'outsideClick' or 'disabled'
};scope.getElement = function(){return $element;};scope.isKeynavEnabled = function(){return keynavEnabled;};scope.focusDropdownEntry = function(keyCode){var elems=self.dropdownMenu? //If append to body is used.
angular.element(self.dropdownMenu).find('a'):angular.element($element).find('ul').eq(0).find('a');switch(keyCode){case 40:{if(!angular.isNumber(self.selectedOption)){self.selectedOption = 0;}else {self.selectedOption = self.selectedOption === elems.length - 1?self.selectedOption:self.selectedOption + 1;}break;}case 38:{if(!angular.isNumber(self.selectedOption)){self.selectedOption = elems.length - 1;}else {self.selectedOption = self.selectedOption === 0?0:self.selectedOption - 1;}break;}}elems[self.selectedOption].focus();};scope.getDropdownElement = function(){return self.dropdownMenu;};scope.focusToggleElement = function(){if(self.toggleElement){self.toggleElement[0].focus();}};scope.$watch('isOpen',function(isOpen,wasOpen){if(appendToBody && self.dropdownMenu){var pos=$position.positionElements($element,self.dropdownMenu,'bottom-left',true);var css={top:pos.top + 'px',display:isOpen?'block':'none'};var rightalign=self.dropdownMenu.hasClass('dropdown-menu-right');if(!rightalign){css.left = pos.left + 'px';css.right = 'auto';}else {css.left = 'auto';css.right = window.innerWidth - (pos.left + $element.prop('offsetWidth')) + 'px';}self.dropdownMenu.css(css);}$animate[isOpen?'addClass':'removeClass']($element,openClass).then(function(){if(angular.isDefined(isOpen) && isOpen !== wasOpen){toggleInvoker($scope,{open:!!isOpen});}});if(isOpen){if(self.dropdownMenuTemplateUrl){$templateRequest(self.dropdownMenuTemplateUrl).then(function(tplContent){templateScope = scope.$new();$compile(tplContent.trim())(templateScope,function(dropdownElement){var newEl=dropdownElement;self.dropdownMenu.replaceWith(newEl);self.dropdownMenu = newEl;});});}scope.focusToggleElement();uibDropdownService.open(scope);}else {if(self.dropdownMenuTemplateUrl){if(templateScope){templateScope.$destroy();}var newEl=angular.element('<ul class="dropdown-menu"></ul>');self.dropdownMenu.replaceWith(newEl);self.dropdownMenu = newEl;}uibDropdownService.close(scope);self.selectedOption = null;}if(angular.isFunction(setIsOpen)){setIsOpen($scope,isOpen);}});$scope.$on('$locationChangeSuccess',function(){if(scope.getAutoClose() !== 'disabled'){scope.isOpen = false;}});var offDestroy=$scope.$on('$destroy',function(){scope.$destroy();});scope.$on('$destroy',offDestroy);}]).directive('uibDropdown',function(){return {controller:'UibDropdownController',link:function link(scope,element,attrs,dropdownCtrl){dropdownCtrl.init();}};}).directive('uibDropdownMenu',function(){return {restrict:'AC',require:'?^uibDropdown',link:function link(scope,element,attrs,dropdownCtrl){if(!dropdownCtrl || angular.isDefined(attrs.dropdownNested)){return;}element.addClass('dropdown-menu');var tplUrl=attrs.templateUrl;if(tplUrl){dropdownCtrl.dropdownMenuTemplateUrl = tplUrl;}if(!dropdownCtrl.dropdownMenu){dropdownCtrl.dropdownMenu = element;}}};}).directive('uibKeyboardNav',function(){return {restrict:'A',require:'?^uibDropdown',link:function link(scope,element,attrs,dropdownCtrl){element.bind('keydown',function(e){if([38,40].indexOf(e.which) !== -1){e.preventDefault();e.stopPropagation();var elems=dropdownCtrl.dropdownMenu.find('a');switch(e.which){case 40:{ // Down
if(!angular.isNumber(dropdownCtrl.selectedOption)){dropdownCtrl.selectedOption = 0;}else {dropdownCtrl.selectedOption = dropdownCtrl.selectedOption === elems.length - 1?dropdownCtrl.selectedOption:dropdownCtrl.selectedOption + 1;}break;}case 38:{ // Up
if(!angular.isNumber(dropdownCtrl.selectedOption)){dropdownCtrl.selectedOption = elems.length - 1;}else {dropdownCtrl.selectedOption = dropdownCtrl.selectedOption === 0?0:dropdownCtrl.selectedOption - 1;}break;}}elems[dropdownCtrl.selectedOption].focus();}});}};}).directive('uibDropdownToggle',function(){return {require:'?^uibDropdown',link:function link(scope,element,attrs,dropdownCtrl){if(!dropdownCtrl){return;}element.addClass('dropdown-toggle');dropdownCtrl.toggleElement = element;var toggleDropdown=function toggleDropdown(event){event.preventDefault();if(!element.hasClass('disabled') && !attrs.disabled){scope.$apply(function(){dropdownCtrl.toggle();});}};element.bind('click',toggleDropdown); // WAI-ARIA
element.attr({'aria-haspopup':true,'aria-expanded':false});scope.$watch(dropdownCtrl.isOpen,function(isOpen){element.attr('aria-expanded',!!isOpen);});scope.$on('$destroy',function(){element.unbind('click',toggleDropdown);});}};}); /* Deprecated dropdown below */angular.module('ui.bootstrap.dropdown').value('$dropdownSuppressWarning',false).service('dropdownService',['$log','$dropdownSuppressWarning','uibDropdownService',function($log,$dropdownSuppressWarning,uibDropdownService){if(!$dropdownSuppressWarning){$log.warn('dropdownService is now deprecated. Use uibDropdownService instead.');}angular.extend(this,uibDropdownService);}]).controller('DropdownController',['$scope','$element','$attrs','$parse','uibDropdownConfig','uibDropdownService','$animate','$uibPosition','$document','$compile','$templateRequest','$log','$dropdownSuppressWarning',function($scope,$element,$attrs,$parse,dropdownConfig,uibDropdownService,$animate,$position,$document,$compile,$templateRequest,$log,$dropdownSuppressWarning){if(!$dropdownSuppressWarning){$log.warn('DropdownController is now deprecated. Use UibDropdownController instead.');}var self=this,scope=$scope.$new(), // create a child scope so we are not polluting original one
templateScope,openClass=dropdownConfig.openClass,getIsOpen,setIsOpen=angular.noop,toggleInvoker=$attrs.onToggle?$parse($attrs.onToggle):angular.noop,appendToBody=false,keynavEnabled=false,selectedOption=null;$element.addClass('dropdown');this.init = function(){if($attrs.isOpen){getIsOpen = $parse($attrs.isOpen);setIsOpen = getIsOpen.assign;$scope.$watch(getIsOpen,function(value){scope.isOpen = !!value;});}appendToBody = angular.isDefined($attrs.dropdownAppendToBody);keynavEnabled = angular.isDefined($attrs.uibKeyboardNav);if(appendToBody && self.dropdownMenu){$document.find('body').append(self.dropdownMenu);$element.on('$destroy',function handleDestroyEvent(){self.dropdownMenu.remove();});}};this.toggle = function(open){return scope.isOpen = arguments.length?!!open:!scope.isOpen;}; // Allow other directives to watch status
this.isOpen = function(){return scope.isOpen;};scope.getToggleElement = function(){return self.toggleElement;};scope.getAutoClose = function(){return $attrs.autoClose || 'always'; //or 'outsideClick' or 'disabled'
};scope.getElement = function(){return $element;};scope.isKeynavEnabled = function(){return keynavEnabled;};scope.focusDropdownEntry = function(keyCode){var elems=self.dropdownMenu? //If append to body is used.
angular.element(self.dropdownMenu).find('a'):angular.element($element).find('ul').eq(0).find('a');switch(keyCode){case 40:{if(!angular.isNumber(self.selectedOption)){self.selectedOption = 0;}else {self.selectedOption = self.selectedOption === elems.length - 1?self.selectedOption:self.selectedOption + 1;}break;}case 38:{if(!angular.isNumber(self.selectedOption)){self.selectedOption = elems.length - 1;}else {self.selectedOption = self.selectedOption === 0?0:self.selectedOption - 1;}break;}}elems[self.selectedOption].focus();};scope.getDropdownElement = function(){return self.dropdownMenu;};scope.focusToggleElement = function(){if(self.toggleElement){self.toggleElement[0].focus();}};scope.$watch('isOpen',function(isOpen,wasOpen){if(appendToBody && self.dropdownMenu){var pos=$position.positionElements($element,self.dropdownMenu,'bottom-left',true);var css={top:pos.top + 'px',display:isOpen?'block':'none'};var rightalign=self.dropdownMenu.hasClass('dropdown-menu-right');if(!rightalign){css.left = pos.left + 'px';css.right = 'auto';}else {css.left = 'auto';css.right = window.innerWidth - (pos.left + $element.prop('offsetWidth')) + 'px';}self.dropdownMenu.css(css);}$animate[isOpen?'addClass':'removeClass']($element,openClass).then(function(){if(angular.isDefined(isOpen) && isOpen !== wasOpen){toggleInvoker($scope,{open:!!isOpen});}});if(isOpen){if(self.dropdownMenuTemplateUrl){$templateRequest(self.dropdownMenuTemplateUrl).then(function(tplContent){templateScope = scope.$new();$compile(tplContent.trim())(templateScope,function(dropdownElement){var newEl=dropdownElement;self.dropdownMenu.replaceWith(newEl);self.dropdownMenu = newEl;});});}scope.focusToggleElement();uibDropdownService.open(scope);}else {if(self.dropdownMenuTemplateUrl){if(templateScope){templateScope.$destroy();}var newEl=angular.element('<ul class="dropdown-menu"></ul>');self.dropdownMenu.replaceWith(newEl);self.dropdownMenu = newEl;}uibDropdownService.close(scope);self.selectedOption = null;}if(angular.isFunction(setIsOpen)){setIsOpen($scope,isOpen);}});$scope.$on('$locationChangeSuccess',function(){if(scope.getAutoClose() !== 'disabled'){scope.isOpen = false;}});var offDestroy=$scope.$on('$destroy',function(){scope.$destroy();});scope.$on('$destroy',offDestroy);}]).directive('dropdown',['$log','$dropdownSuppressWarning',function($log,$dropdownSuppressWarning){return {controller:'DropdownController',link:function link(scope,element,attrs,dropdownCtrl){if(!$dropdownSuppressWarning){$log.warn('dropdown is now deprecated. Use uib-dropdown instead.');}dropdownCtrl.init();}};}]).directive('dropdownMenu',['$log','$dropdownSuppressWarning',function($log,$dropdownSuppressWarning){return {restrict:'AC',require:'?^dropdown',link:function link(scope,element,attrs,dropdownCtrl){if(!dropdownCtrl || angular.isDefined(attrs.dropdownNested)){return;}if(!$dropdownSuppressWarning){$log.warn('dropdown-menu is now deprecated. Use uib-dropdown-menu instead.');}element.addClass('dropdown-menu');var tplUrl=attrs.templateUrl;if(tplUrl){dropdownCtrl.dropdownMenuTemplateUrl = tplUrl;}if(!dropdownCtrl.dropdownMenu){dropdownCtrl.dropdownMenu = element;}}};}]).directive('keyboardNav',['$log','$dropdownSuppressWarning',function($log,$dropdownSuppressWarning){return {restrict:'A',require:'?^dropdown',link:function link(scope,element,attrs,dropdownCtrl){if(!$dropdownSuppressWarning){$log.warn('keyboard-nav is now deprecated. Use uib-keyboard-nav instead.');}element.bind('keydown',function(e){if([38,40].indexOf(e.which) !== -1){e.preventDefault();e.stopPropagation();var elems=dropdownCtrl.dropdownMenu.find('a');switch(e.which){case 40:{ // Down
if(!angular.isNumber(dropdownCtrl.selectedOption)){dropdownCtrl.selectedOption = 0;}else {dropdownCtrl.selectedOption = dropdownCtrl.selectedOption === elems.length - 1?dropdownCtrl.selectedOption:dropdownCtrl.selectedOption + 1;}break;}case 38:{ // Up
if(!angular.isNumber(dropdownCtrl.selectedOption)){dropdownCtrl.selectedOption = elems.length - 1;}else {dropdownCtrl.selectedOption = dropdownCtrl.selectedOption === 0?0:dropdownCtrl.selectedOption - 1;}break;}}elems[dropdownCtrl.selectedOption].focus();}});}};}]).directive('dropdownToggle',['$log','$dropdownSuppressWarning',function($log,$dropdownSuppressWarning){return {require:'?^dropdown',link:function link(scope,element,attrs,dropdownCtrl){if(!$dropdownSuppressWarning){$log.warn('dropdown-toggle is now deprecated. Use uib-dropdown-toggle instead.');}if(!dropdownCtrl){return;}element.addClass('dropdown-toggle');dropdownCtrl.toggleElement = element;var toggleDropdown=function toggleDropdown(event){event.preventDefault();if(!element.hasClass('disabled') && !attrs.disabled){scope.$apply(function(){dropdownCtrl.toggle();});}};element.bind('click',toggleDropdown); // WAI-ARIA
element.attr({'aria-haspopup':true,'aria-expanded':false});scope.$watch(dropdownCtrl.isOpen,function(isOpen){element.attr('aria-expanded',!!isOpen);});scope.$on('$destroy',function(){element.unbind('click',toggleDropdown);});}};}]);angular.module('ui.bootstrap.stackedMap',[]) /**
 * A helper, internal data structure that acts as a map but also allows getting / removing
 * elements in the LIFO order
 */.factory('$$stackedMap',function(){return {createNew:function createNew(){var stack=[];return {add:function add(key,value){stack.push({key:key,value:value});},get:function get(key){for(var i=0;i < stack.length;i++) {if(key == stack[i].key){return stack[i];}}},keys:function keys(){var keys=[];for(var i=0;i < stack.length;i++) {keys.push(stack[i].key);}return keys;},top:function top(){return stack[stack.length - 1];},remove:function remove(key){var idx=-1;for(var i=0;i < stack.length;i++) {if(key == stack[i].key){idx = i;break;}}return stack.splice(idx,1)[0];},removeTop:function removeTop(){return stack.splice(stack.length - 1,1)[0];},length:function length(){return stack.length;}};}};});angular.module('ui.bootstrap.modal',['ui.bootstrap.stackedMap']) /**
 * A helper, internal data structure that stores all references attached to key
 */.factory('$$multiMap',function(){return {createNew:function createNew(){var map={};return {entries:function entries(){return _Object$keys(map).map(function(key){return {key:key,value:map[key]};});},get:function get(key){return map[key];},hasKey:function hasKey(key){return !!map[key];},keys:function keys(){return _Object$keys(map);},put:function put(key,value){if(!map[key]){map[key] = [];}map[key].push(value);},remove:function remove(key,value){var values=map[key];if(!values){return;}var idx=values.indexOf(value);if(idx !== -1){values.splice(idx,1);}if(!values.length){delete map[key];}}};}};}) /**
 * A helper directive for the $modal service. It creates a backdrop element.
 */.directive('uibModalBackdrop',['$animate','$injector','$uibModalStack',function($animate,$injector,$modalStack){var $animateCss=null;if($injector.has('$animateCss')){$animateCss = $injector.get('$animateCss');}return {replace:true,templateUrl:'template/modal/backdrop.html',compile:function compile(tElement,tAttrs){tElement.addClass(tAttrs.backdropClass);return linkFn;}};function linkFn(scope,element,attrs){ // Temporary fix for prefixing
element.addClass('modal-backdrop');if(attrs.modalInClass){if($animateCss){$animateCss(element,{addClass:attrs.modalInClass}).start();}else {$animate.addClass(element,attrs.modalInClass);}scope.$on($modalStack.NOW_CLOSING_EVENT,function(e,setIsAsync){var done=setIsAsync();if($animateCss){$animateCss(element,{removeClass:attrs.modalInClass}).start().then(done);}else {$animate.removeClass(element,attrs.modalInClass).then(done);}});}}}]).directive('uibModalWindow',['$uibModalStack','$q','$animate','$injector',function($modalStack,$q,$animate,$injector){var $animateCss=null;if($injector.has('$animateCss')){$animateCss = $injector.get('$animateCss');}return {scope:{index:'@'},replace:true,transclude:true,templateUrl:function templateUrl(tElement,tAttrs){return tAttrs.templateUrl || 'template/modal/window.html';},link:function link(scope,element,attrs){element.addClass(attrs.windowClass || '');element.addClass(attrs.windowTopClass || '');scope.size = attrs.size;scope.close = function(evt){var modal=$modalStack.getTop();if(modal && modal.value.backdrop && modal.value.backdrop !== 'static' && evt.target === evt.currentTarget){evt.preventDefault();evt.stopPropagation();$modalStack.dismiss(modal.key,'backdrop click');}}; // moved from template to fix issue #2280
element.on('click',scope.close); // This property is only added to the scope for the purpose of detecting when this directive is rendered.
// We can detect that by using this property in the template associated with this directive and then use
// {@link Attribute#$observe} on it. For more details please see {@link TableColumnResize}.
scope.$isRendered = true; // Deferred object that will be resolved when this modal is render.
var modalRenderDeferObj=$q.defer(); // Observe function will be called on next digest cycle after compilation, ensuring that the DOM is ready.
// In order to use this way of finding whether DOM is ready, we need to observe a scope property used in modal's template.
attrs.$observe('modalRender',function(value){if(value == 'true'){modalRenderDeferObj.resolve();}});modalRenderDeferObj.promise.then(function(){var animationPromise=null;if(attrs.modalInClass){if($animateCss){animationPromise = $animateCss(element,{addClass:attrs.modalInClass}).start();}else {animationPromise = $animate.addClass(element,attrs.modalInClass);}scope.$on($modalStack.NOW_CLOSING_EVENT,function(e,setIsAsync){var done=setIsAsync();if($animateCss){$animateCss(element,{removeClass:attrs.modalInClass}).start().then(done);}else {$animate.removeClass(element,attrs.modalInClass).then(done);}});}$q.when(animationPromise).then(function(){var inputWithAutofocus=element[0].querySelector('[autofocus]'); /**
             * Auto-focusing of a freshly-opened modal element causes any child elements
             * with the autofocus attribute to lose focus. This is an issue on touch
             * based devices which will show and then hide the onscreen keyboard.
             * Attempts to refocus the autofocus element via JavaScript will not reopen
             * the onscreen keyboard. Fixed by updated the focusing logic to only autofocus
             * the modal element if the modal does not contain an autofocus element.
             */if(inputWithAutofocus){inputWithAutofocus.focus();}else {element[0].focus();}}); // Notify {@link $modalStack} that modal is rendered.
var modal=$modalStack.getTop();if(modal){$modalStack.modalRendered(modal.key);}});}};}]).directive('uibModalAnimationClass',function(){return {compile:function compile(tElement,tAttrs){if(tAttrs.modalAnimation){tElement.addClass(tAttrs.uibModalAnimationClass);}}};}).directive('uibModalTransclude',function(){return {link:function link($scope,$element,$attrs,controller,$transclude){$transclude($scope.$parent,function(clone){$element.empty();$element.append(clone);});}};}).factory('$uibModalStack',['$animate','$timeout','$document','$compile','$rootScope','$q','$injector','$$multiMap','$$stackedMap',function($animate,$timeout,$document,$compile,$rootScope,$q,$injector,$$multiMap,$$stackedMap){var $animateCss=null;if($injector.has('$animateCss')){$animateCss = $injector.get('$animateCss');}var OPENED_MODAL_CLASS='modal-open';var backdropDomEl,backdropScope;var openedWindows=$$stackedMap.createNew();var openedClasses=$$multiMap.createNew();var $modalStack={NOW_CLOSING_EVENT:'modal.stack.now-closing'}; //Modal focus behavior
var focusableElementList;var focusIndex=0;var tababbleSelector='a[href], area[href], input:not([disabled]), ' + 'button:not([disabled]),select:not([disabled]), textarea:not([disabled]), ' + 'iframe, object, embed, *[tabindex], *[contenteditable=true]';function backdropIndex(){var topBackdropIndex=-1;var opened=openedWindows.keys();for(var i=0;i < opened.length;i++) {if(openedWindows.get(opened[i]).value.backdrop){topBackdropIndex = i;}}return topBackdropIndex;}$rootScope.$watch(backdropIndex,function(newBackdropIndex){if(backdropScope){backdropScope.index = newBackdropIndex;}});function removeModalWindow(modalInstance,elementToReceiveFocus){var body=$document.find('body').eq(0);var modalWindow=openedWindows.get(modalInstance).value; //clean up the stack
openedWindows.remove(modalInstance);removeAfterAnimate(modalWindow.modalDomEl,modalWindow.modalScope,function(){var modalBodyClass=modalWindow.openedClass || OPENED_MODAL_CLASS;openedClasses.remove(modalBodyClass,modalInstance);body.toggleClass(modalBodyClass,openedClasses.hasKey(modalBodyClass));toggleTopWindowClass(true);});checkRemoveBackdrop(); //move focus to specified element if available, or else to body
if(elementToReceiveFocus && elementToReceiveFocus.focus){elementToReceiveFocus.focus();}else {body.focus();}} // Add or remove "windowTopClass" from the top window in the stack
function toggleTopWindowClass(toggleSwitch){var modalWindow;if(openedWindows.length() > 0){modalWindow = openedWindows.top().value;modalWindow.modalDomEl.toggleClass(modalWindow.windowTopClass || '',toggleSwitch);}}function checkRemoveBackdrop(){ //remove backdrop if no longer needed
if(backdropDomEl && backdropIndex() == -1){var backdropScopeRef=backdropScope;removeAfterAnimate(backdropDomEl,backdropScope,function(){backdropScopeRef = null;});backdropDomEl = undefined;backdropScope = undefined;}}function removeAfterAnimate(domEl,scope,done){var asyncDeferred;var asyncPromise=null;var setIsAsync=function setIsAsync(){if(!asyncDeferred){asyncDeferred = $q.defer();asyncPromise = asyncDeferred.promise;}return function asyncDone(){asyncDeferred.resolve();};};scope.$broadcast($modalStack.NOW_CLOSING_EVENT,setIsAsync); // Note that it's intentional that asyncPromise might be null.
// That's when setIsAsync has not been called during the
// NOW_CLOSING_EVENT broadcast.
return $q.when(asyncPromise).then(afterAnimating);function afterAnimating(){if(afterAnimating.done){return;}afterAnimating.done = true;if($animateCss){$animateCss(domEl,{event:'leave'}).start().then(function(){domEl.remove();});}else {$animate.leave(domEl);}scope.$destroy();if(done){done();}}}$document.bind('keydown',function(evt){if(evt.isDefaultPrevented()){return evt;}var modal=openedWindows.top();if(modal && modal.value.keyboard){switch(evt.which){case 27:{evt.preventDefault();$rootScope.$apply(function(){$modalStack.dismiss(modal.key,'escape key press');});break;}case 9:{$modalStack.loadFocusElementList(modal);var focusChanged=false;if(evt.shiftKey){if($modalStack.isFocusInFirstItem(evt)){focusChanged = $modalStack.focusLastFocusableElement();}}else {if($modalStack.isFocusInLastItem(evt)){focusChanged = $modalStack.focusFirstFocusableElement();}}if(focusChanged){evt.preventDefault();evt.stopPropagation();}break;}}}});$modalStack.open = function(modalInstance,modal){var modalOpener=$document[0].activeElement,modalBodyClass=modal.openedClass || OPENED_MODAL_CLASS;toggleTopWindowClass(false);openedWindows.add(modalInstance,{deferred:modal.deferred,renderDeferred:modal.renderDeferred,modalScope:modal.scope,backdrop:modal.backdrop,keyboard:modal.keyboard,openedClass:modal.openedClass,windowTopClass:modal.windowTopClass});openedClasses.put(modalBodyClass,modalInstance);var body=$document.find('body').eq(0),currBackdropIndex=backdropIndex();if(currBackdropIndex >= 0 && !backdropDomEl){backdropScope = $rootScope.$new(true);backdropScope.index = currBackdropIndex;var angularBackgroundDomEl=angular.element('<div uib-modal-backdrop="modal-backdrop"></div>');angularBackgroundDomEl.attr('backdrop-class',modal.backdropClass);if(modal.animation){angularBackgroundDomEl.attr('modal-animation','true');}backdropDomEl = $compile(angularBackgroundDomEl)(backdropScope);body.append(backdropDomEl);}var angularDomEl=angular.element('<div uib-modal-window="modal-window"></div>');angularDomEl.attr({'template-url':modal.windowTemplateUrl,'window-class':modal.windowClass,'window-top-class':modal.windowTopClass,'size':modal.size,'index':openedWindows.length() - 1,'animate':'animate'}).html(modal.content);if(modal.animation){angularDomEl.attr('modal-animation','true');}var modalDomEl=$compile(angularDomEl)(modal.scope);openedWindows.top().value.modalDomEl = modalDomEl;openedWindows.top().value.modalOpener = modalOpener;body.append(modalDomEl);body.addClass(modalBodyClass);$modalStack.clearFocusListCache();};function broadcastClosing(modalWindow,resultOrReason,closing){return !modalWindow.value.modalScope.$broadcast('modal.closing',resultOrReason,closing).defaultPrevented;}$modalStack.close = function(modalInstance,result){var modalWindow=openedWindows.get(modalInstance);if(modalWindow && broadcastClosing(modalWindow,result,true)){modalWindow.value.modalScope.$$uibDestructionScheduled = true;modalWindow.value.deferred.resolve(result);removeModalWindow(modalInstance,modalWindow.value.modalOpener);return true;}return !modalWindow;};$modalStack.dismiss = function(modalInstance,reason){var modalWindow=openedWindows.get(modalInstance);if(modalWindow && broadcastClosing(modalWindow,reason,false)){modalWindow.value.modalScope.$$uibDestructionScheduled = true;modalWindow.value.deferred.reject(reason);removeModalWindow(modalInstance,modalWindow.value.modalOpener);return true;}return !modalWindow;};$modalStack.dismissAll = function(reason){var topModal=this.getTop();while(topModal && this.dismiss(topModal.key,reason)) {topModal = this.getTop();}};$modalStack.getTop = function(){return openedWindows.top();};$modalStack.modalRendered = function(modalInstance){var modalWindow=openedWindows.get(modalInstance);if(modalWindow){modalWindow.value.renderDeferred.resolve();}};$modalStack.focusFirstFocusableElement = function(){if(focusableElementList.length > 0){focusableElementList[0].focus();return true;}return false;};$modalStack.focusLastFocusableElement = function(){if(focusableElementList.length > 0){focusableElementList[focusableElementList.length - 1].focus();return true;}return false;};$modalStack.isFocusInFirstItem = function(evt){if(focusableElementList.length > 0){return (evt.target || evt.srcElement) == focusableElementList[0];}return false;};$modalStack.isFocusInLastItem = function(evt){if(focusableElementList.length > 0){return (evt.target || evt.srcElement) == focusableElementList[focusableElementList.length - 1];}return false;};$modalStack.clearFocusListCache = function(){focusableElementList = [];focusIndex = 0;};$modalStack.loadFocusElementList = function(modalWindow){if(focusableElementList === undefined || !focusableElementList.length){if(modalWindow){var modalDomE1=modalWindow.value.modalDomEl;if(modalDomE1 && modalDomE1.length){focusableElementList = modalDomE1[0].querySelectorAll(tababbleSelector);}}}};return $modalStack;}]).provider('$uibModal',function(){var $modalProvider={options:{animation:true,backdrop:true, //can also be false or 'static'
keyboard:true},$get:['$injector','$rootScope','$q','$templateRequest','$controller','$uibModalStack','$modalSuppressWarning','$log',function($injector,$rootScope,$q,$templateRequest,$controller,$modalStack,$modalSuppressWarning,$log){var $modal={};function getTemplatePromise(options){return options.template?$q.when(options.template):$templateRequest(angular.isFunction(options.templateUrl)?options.templateUrl():options.templateUrl);}function getResolvePromises(resolves){var promisesArr=[];angular.forEach(resolves,function(value){if(angular.isFunction(value) || angular.isArray(value)){promisesArr.push($q.when($injector.invoke(value)));}else if(angular.isString(value)){promisesArr.push($q.when($injector.get(value)));}else {promisesArr.push($q.when(value));}});return promisesArr;}var promiseChain=null;$modal.getPromiseChain = function(){return promiseChain;};$modal.open = function(modalOptions){var modalResultDeferred=$q.defer();var modalOpenedDeferred=$q.defer();var modalRenderDeferred=$q.defer(); //prepare an instance of a modal to be injected into controllers and returned to a caller
var modalInstance={result:modalResultDeferred.promise,opened:modalOpenedDeferred.promise,rendered:modalRenderDeferred.promise,close:function close(result){return $modalStack.close(modalInstance,result);},dismiss:function dismiss(reason){return $modalStack.dismiss(modalInstance,reason);}}; //merge and clean up options
modalOptions = angular.extend({},$modalProvider.options,modalOptions);modalOptions.resolve = modalOptions.resolve || {}; //verify options
if(!modalOptions.template && !modalOptions.templateUrl){throw new Error('One of template or templateUrl options is required.');}var templateAndResolvePromise=$q.all([getTemplatePromise(modalOptions)].concat(getResolvePromises(modalOptions.resolve)));function resolveWithTemplate(){return templateAndResolvePromise;} // Wait for the resolution of the existing promise chain.
// Then switch to our own combined promise dependency (regardless of how the previous modal fared).
// Then add to $modalStack and resolve opened.
// Finally clean up the chain variable if no subsequent modal has overwritten it.
var samePromise;samePromise = promiseChain = $q.all([promiseChain]).then(resolveWithTemplate,resolveWithTemplate).then(function resolveSuccess(tplAndVars){var modalScope=(modalOptions.scope || $rootScope).$new();modalScope.$close = modalInstance.close;modalScope.$dismiss = modalInstance.dismiss;modalScope.$on('$destroy',function(){if(!modalScope.$$uibDestructionScheduled){modalScope.$dismiss('$uibUnscheduledDestruction');}});var ctrlInstance,ctrlLocals={};var resolveIter=1; //controllers
if(modalOptions.controller){ctrlLocals.$scope = modalScope;ctrlLocals.$uibModalInstance = modalInstance;Object.defineProperty(ctrlLocals,'$modalInstance',{get:function get(){if(!$modalSuppressWarning){$log.warn('$modalInstance is now deprecated. Use $uibModalInstance instead.');}return modalInstance;}});angular.forEach(modalOptions.resolve,function(value,key){ctrlLocals[key] = tplAndVars[resolveIter++];});ctrlInstance = $controller(modalOptions.controller,ctrlLocals);if(modalOptions.controllerAs){if(modalOptions.bindToController){angular.extend(ctrlInstance,modalScope);}modalScope[modalOptions.controllerAs] = ctrlInstance;}}$modalStack.open(modalInstance,{scope:modalScope,deferred:modalResultDeferred,renderDeferred:modalRenderDeferred,content:tplAndVars[0],animation:modalOptions.animation,backdrop:modalOptions.backdrop,keyboard:modalOptions.keyboard,backdropClass:modalOptions.backdropClass,windowTopClass:modalOptions.windowTopClass,windowClass:modalOptions.windowClass,windowTemplateUrl:modalOptions.windowTemplateUrl,size:modalOptions.size,openedClass:modalOptions.openedClass});modalOpenedDeferred.resolve(true);},function resolveError(reason){modalOpenedDeferred.reject(reason);modalResultDeferred.reject(reason);})["finally"](function(){if(promiseChain === samePromise){promiseChain = null;}});return modalInstance;};return $modal;}]};return $modalProvider;}); /* deprecated modal below */angular.module('ui.bootstrap.modal').value('$modalSuppressWarning',false) /**
   * A helper directive for the $modal service. It creates a backdrop element.
   */.directive('modalBackdrop',['$animate','$injector','$modalStack','$log','$modalSuppressWarning',function($animate,$injector,$modalStack,$log,$modalSuppressWarning){var $animateCss=null;if($injector.has('$animateCss')){$animateCss = $injector.get('$animateCss');}return {replace:true,templateUrl:'template/modal/backdrop.html',compile:function compile(tElement,tAttrs){tElement.addClass(tAttrs.backdropClass);return linkFn;}};function linkFn(scope,element,attrs){if(!$modalSuppressWarning){$log.warn('modal-backdrop is now deprecated. Use uib-modal-backdrop instead.');}element.addClass('modal-backdrop');if(attrs.modalInClass){if($animateCss){$animateCss(element,{addClass:attrs.modalInClass}).start();}else {$animate.addClass(element,attrs.modalInClass);}scope.$on($modalStack.NOW_CLOSING_EVENT,function(e,setIsAsync){var done=setIsAsync();if($animateCss){$animateCss(element,{removeClass:attrs.modalInClass}).start().then(done);}else {$animate.removeClass(element,attrs.modalInClass).then(done);}});}}}]).directive('modalWindow',['$modalStack','$q','$animate','$injector','$log','$modalSuppressWarning',function($modalStack,$q,$animate,$injector,$log,$modalSuppressWarning){var $animateCss=null;if($injector.has('$animateCss')){$animateCss = $injector.get('$animateCss');}return {scope:{index:'@'},replace:true,transclude:true,templateUrl:function templateUrl(tElement,tAttrs){return tAttrs.templateUrl || 'template/modal/window.html';},link:function link(scope,element,attrs){if(!$modalSuppressWarning){$log.warn('modal-window is now deprecated. Use uib-modal-window instead.');}element.addClass(attrs.windowClass || '');element.addClass(attrs.windowTopClass || '');scope.size = attrs.size;scope.close = function(evt){var modal=$modalStack.getTop();if(modal && modal.value.backdrop && modal.value.backdrop !== 'static' && evt.target === evt.currentTarget){evt.preventDefault();evt.stopPropagation();$modalStack.dismiss(modal.key,'backdrop click');}}; // moved from template to fix issue #2280
element.on('click',scope.close); // This property is only added to the scope for the purpose of detecting when this directive is rendered.
// We can detect that by using this property in the template associated with this directive and then use
// {@link Attribute#$observe} on it. For more details please see {@link TableColumnResize}.
scope.$isRendered = true; // Deferred object that will be resolved when this modal is render.
var modalRenderDeferObj=$q.defer(); // Observe function will be called on next digest cycle after compilation, ensuring that the DOM is ready.
// In order to use this way of finding whether DOM is ready, we need to observe a scope property used in modal's template.
attrs.$observe('modalRender',function(value){if(value == 'true'){modalRenderDeferObj.resolve();}});modalRenderDeferObj.promise.then(function(){var animationPromise=null;if(attrs.modalInClass){if($animateCss){animationPromise = $animateCss(element,{addClass:attrs.modalInClass}).start();}else {animationPromise = $animate.addClass(element,attrs.modalInClass);}scope.$on($modalStack.NOW_CLOSING_EVENT,function(e,setIsAsync){var done=setIsAsync();if($animateCss){$animateCss(element,{removeClass:attrs.modalInClass}).start().then(done);}else {$animate.removeClass(element,attrs.modalInClass).then(done);}});}$q.when(animationPromise).then(function(){var inputWithAutofocus=element[0].querySelector('[autofocus]'); /**
               * Auto-focusing of a freshly-opened modal element causes any child elements
               * with the autofocus attribute to lose focus. This is an issue on touch
               * based devices which will show and then hide the onscreen keyboard.
               * Attempts to refocus the autofocus element via JavaScript will not reopen
               * the onscreen keyboard. Fixed by updated the focusing logic to only autofocus
               * the modal element if the modal does not contain an autofocus element.
               */if(inputWithAutofocus){inputWithAutofocus.focus();}else {element[0].focus();}}); // Notify {@link $modalStack} that modal is rendered.
var modal=$modalStack.getTop();if(modal){$modalStack.modalRendered(modal.key);}});}};}]).directive('modalAnimationClass',['$log','$modalSuppressWarning',function($log,$modalSuppressWarning){return {compile:function compile(tElement,tAttrs){if(!$modalSuppressWarning){$log.warn('modal-animation-class is now deprecated. Use uib-modal-animation-class instead.');}if(tAttrs.modalAnimation){tElement.addClass(tAttrs.modalAnimationClass);}}};}]).directive('modalTransclude',['$log','$modalSuppressWarning',function($log,$modalSuppressWarning){return {link:function link($scope,$element,$attrs,controller,$transclude){if(!$modalSuppressWarning){$log.warn('modal-transclude is now deprecated. Use uib-modal-transclude instead.');}$transclude($scope.$parent,function(clone){$element.empty();$element.append(clone);});}};}]).service('$modalStack',['$animate','$timeout','$document','$compile','$rootScope','$q','$injector','$$multiMap','$$stackedMap','$uibModalStack','$log','$modalSuppressWarning',function($animate,$timeout,$document,$compile,$rootScope,$q,$injector,$$multiMap,$$stackedMap,$uibModalStack,$log,$modalSuppressWarning){if(!$modalSuppressWarning){$log.warn('$modalStack is now deprecated. Use $uibModalStack instead.');}angular.extend(this,$uibModalStack);}]).provider('$modal',['$uibModalProvider',function($uibModalProvider){angular.extend(this,$uibModalProvider);this.$get = ['$injector','$log','$modalSuppressWarning',function($injector,$log,$modalSuppressWarning){if(!$modalSuppressWarning){$log.warn('$modal is now deprecated. Use $uibModal instead.');}return $injector.invoke($uibModalProvider.$get);}];}]);angular.module('ui.bootstrap.pagination',[]).controller('UibPaginationController',['$scope','$attrs','$parse',function($scope,$attrs,$parse){var self=this,ngModelCtrl={$setViewValue:angular.noop}, // nullModelCtrl
setNumPages=$attrs.numPages?$parse($attrs.numPages).assign:angular.noop;this.init = function(ngModelCtrl_,config){ngModelCtrl = ngModelCtrl_;this.config = config;ngModelCtrl.$render = function(){self.render();};if($attrs.itemsPerPage){$scope.$parent.$watch($parse($attrs.itemsPerPage),function(value){self.itemsPerPage = parseInt(value,10);$scope.totalPages = self.calculateTotalPages();});}else {this.itemsPerPage = config.itemsPerPage;}$scope.$watch('totalItems',function(){$scope.totalPages = self.calculateTotalPages();});$scope.$watch('totalPages',function(value){setNumPages($scope.$parent,value); // Readonly variable
if($scope.page > value){$scope.selectPage(value);}else {ngModelCtrl.$render();}});};this.calculateTotalPages = function(){var totalPages=this.itemsPerPage < 1?1:Math.ceil($scope.totalItems / this.itemsPerPage);return Math.max(totalPages || 0,1);};this.render = function(){$scope.page = parseInt(ngModelCtrl.$viewValue,10) || 1;};$scope.selectPage = function(page,evt){if(evt){evt.preventDefault();}var clickAllowed=!$scope.ngDisabled || !evt;if(clickAllowed && $scope.page !== page && page > 0 && page <= $scope.totalPages){if(evt && evt.target){evt.target.blur();}ngModelCtrl.$setViewValue(page);ngModelCtrl.$render();}};$scope.getText = function(key){return $scope[key + 'Text'] || self.config[key + 'Text'];};$scope.noPrevious = function(){return $scope.page === 1;};$scope.noNext = function(){return $scope.page === $scope.totalPages;};}]).constant('uibPaginationConfig',{itemsPerPage:10,boundaryLinks:false,directionLinks:true,firstText:'First',previousText:'Previous',nextText:'Next',lastText:'Last',rotate:true}).directive('uibPagination',['$parse','uibPaginationConfig',function($parse,paginationConfig){return {restrict:'EA',scope:{totalItems:'=',firstText:'@',previousText:'@',nextText:'@',lastText:'@',ngDisabled:'='},require:['uibPagination','?ngModel'],controller:'UibPaginationController',controllerAs:'pagination',templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/pagination/pagination.html';},replace:true,link:function link(scope,element,attrs,ctrls){var paginationCtrl=ctrls[0],ngModelCtrl=ctrls[1];if(!ngModelCtrl){return; // do nothing if no ng-model
} // Setup configuration parameters
var maxSize=angular.isDefined(attrs.maxSize)?scope.$parent.$eval(attrs.maxSize):paginationConfig.maxSize,rotate=angular.isDefined(attrs.rotate)?scope.$parent.$eval(attrs.rotate):paginationConfig.rotate;scope.boundaryLinks = angular.isDefined(attrs.boundaryLinks)?scope.$parent.$eval(attrs.boundaryLinks):paginationConfig.boundaryLinks;scope.directionLinks = angular.isDefined(attrs.directionLinks)?scope.$parent.$eval(attrs.directionLinks):paginationConfig.directionLinks;paginationCtrl.init(ngModelCtrl,paginationConfig);if(attrs.maxSize){scope.$parent.$watch($parse(attrs.maxSize),function(value){maxSize = parseInt(value,10);paginationCtrl.render();});} // Create page object used in template
function makePage(number,text,isActive){return {number:number,text:text,active:isActive};}function getPages(currentPage,totalPages){var pages=[]; // Default page limits
var startPage=1,endPage=totalPages;var isMaxSized=angular.isDefined(maxSize) && maxSize < totalPages; // recompute if maxSize
if(isMaxSized){if(rotate){ // Current page is displayed in the middle of the visible ones
startPage = Math.max(currentPage - Math.floor(maxSize / 2),1);endPage = startPage + maxSize - 1; // Adjust if limit is exceeded
if(endPage > totalPages){endPage = totalPages;startPage = endPage - maxSize + 1;}}else { // Visible pages are paginated with maxSize
startPage = (Math.ceil(currentPage / maxSize) - 1) * maxSize + 1; // Adjust last page if limit is exceeded
endPage = Math.min(startPage + maxSize - 1,totalPages);}} // Add page number links
for(var number=startPage;number <= endPage;number++) {var page=makePage(number,number,number === currentPage);pages.push(page);} // Add links to move between page sets
if(isMaxSized && !rotate){if(startPage > 1){var previousPageSet=makePage(startPage - 1,'...',false);pages.unshift(previousPageSet);}if(endPage < totalPages){var nextPageSet=makePage(endPage + 1,'...',false);pages.push(nextPageSet);}}return pages;}var originalRender=paginationCtrl.render;paginationCtrl.render = function(){originalRender();if(scope.page > 0 && scope.page <= scope.totalPages){scope.pages = getPages(scope.page,scope.totalPages);}};}};}]).constant('uibPagerConfig',{itemsPerPage:10,previousText:'« Previous',nextText:'Next »',align:true}).directive('uibPager',['uibPagerConfig',function(pagerConfig){return {restrict:'EA',scope:{totalItems:'=',previousText:'@',nextText:'@',ngDisabled:'='},require:['uibPager','?ngModel'],controller:'UibPaginationController',controllerAs:'pagination',templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/pagination/pager.html';},replace:true,link:function link(scope,element,attrs,ctrls){var paginationCtrl=ctrls[0],ngModelCtrl=ctrls[1];if(!ngModelCtrl){return; // do nothing if no ng-model
}scope.align = angular.isDefined(attrs.align)?scope.$parent.$eval(attrs.align):pagerConfig.align;paginationCtrl.init(ngModelCtrl,pagerConfig);}};}]); /* Deprecated Pagination Below */angular.module('ui.bootstrap.pagination').value('$paginationSuppressWarning',false).controller('PaginationController',['$scope','$attrs','$parse','$log','$paginationSuppressWarning',function($scope,$attrs,$parse,$log,$paginationSuppressWarning){if(!$paginationSuppressWarning){$log.warn('PaginationController is now deprecated. Use UibPaginationController instead.');}var self=this,ngModelCtrl={$setViewValue:angular.noop}, // nullModelCtrl
setNumPages=$attrs.numPages?$parse($attrs.numPages).assign:angular.noop;this.init = function(ngModelCtrl_,config){ngModelCtrl = ngModelCtrl_;this.config = config;ngModelCtrl.$render = function(){self.render();};if($attrs.itemsPerPage){$scope.$parent.$watch($parse($attrs.itemsPerPage),function(value){self.itemsPerPage = parseInt(value,10);$scope.totalPages = self.calculateTotalPages();});}else {this.itemsPerPage = config.itemsPerPage;}$scope.$watch('totalItems',function(){$scope.totalPages = self.calculateTotalPages();});$scope.$watch('totalPages',function(value){setNumPages($scope.$parent,value); // Readonly variable
if($scope.page > value){$scope.selectPage(value);}else {ngModelCtrl.$render();}});};this.calculateTotalPages = function(){var totalPages=this.itemsPerPage < 1?1:Math.ceil($scope.totalItems / this.itemsPerPage);return Math.max(totalPages || 0,1);};this.render = function(){$scope.page = parseInt(ngModelCtrl.$viewValue,10) || 1;};$scope.selectPage = function(page,evt){if(evt){evt.preventDefault();}var clickAllowed=!$scope.ngDisabled || !evt;if(clickAllowed && $scope.page !== page && page > 0 && page <= $scope.totalPages){if(evt && evt.target){evt.target.blur();}ngModelCtrl.$setViewValue(page);ngModelCtrl.$render();}};$scope.getText = function(key){return $scope[key + 'Text'] || self.config[key + 'Text'];};$scope.noPrevious = function(){return $scope.page === 1;};$scope.noNext = function(){return $scope.page === $scope.totalPages;};}]).directive('pagination',['$parse','uibPaginationConfig','$log','$paginationSuppressWarning',function($parse,paginationConfig,$log,$paginationSuppressWarning){return {restrict:'EA',scope:{totalItems:'=',firstText:'@',previousText:'@',nextText:'@',lastText:'@',ngDisabled:'='},require:['pagination','?ngModel'],controller:'PaginationController',controllerAs:'pagination',templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/pagination/pagination.html';},replace:true,link:function link(scope,element,attrs,ctrls){if(!$paginationSuppressWarning){$log.warn('pagination is now deprecated. Use uib-pagination instead.');}var paginationCtrl=ctrls[0],ngModelCtrl=ctrls[1];if(!ngModelCtrl){return; // do nothing if no ng-model
} // Setup configuration parameters
var maxSize=angular.isDefined(attrs.maxSize)?scope.$parent.$eval(attrs.maxSize):paginationConfig.maxSize,rotate=angular.isDefined(attrs.rotate)?scope.$parent.$eval(attrs.rotate):paginationConfig.rotate;scope.boundaryLinks = angular.isDefined(attrs.boundaryLinks)?scope.$parent.$eval(attrs.boundaryLinks):paginationConfig.boundaryLinks;scope.directionLinks = angular.isDefined(attrs.directionLinks)?scope.$parent.$eval(attrs.directionLinks):paginationConfig.directionLinks;paginationCtrl.init(ngModelCtrl,paginationConfig);if(attrs.maxSize){scope.$parent.$watch($parse(attrs.maxSize),function(value){maxSize = parseInt(value,10);paginationCtrl.render();});} // Create page object used in template
function makePage(number,text,isActive){return {number:number,text:text,active:isActive};}function getPages(currentPage,totalPages){var pages=[]; // Default page limits
var startPage=1,endPage=totalPages;var isMaxSized=angular.isDefined(maxSize) && maxSize < totalPages; // recompute if maxSize
if(isMaxSized){if(rotate){ // Current page is displayed in the middle of the visible ones
startPage = Math.max(currentPage - Math.floor(maxSize / 2),1);endPage = startPage + maxSize - 1; // Adjust if limit is exceeded
if(endPage > totalPages){endPage = totalPages;startPage = endPage - maxSize + 1;}}else { // Visible pages are paginated with maxSize
startPage = (Math.ceil(currentPage / maxSize) - 1) * maxSize + 1; // Adjust last page if limit is exceeded
endPage = Math.min(startPage + maxSize - 1,totalPages);}} // Add page number links
for(var number=startPage;number <= endPage;number++) {var page=makePage(number,number,number === currentPage);pages.push(page);} // Add links to move between page sets
if(isMaxSized && !rotate){if(startPage > 1){var previousPageSet=makePage(startPage - 1,'...',false);pages.unshift(previousPageSet);}if(endPage < totalPages){var nextPageSet=makePage(endPage + 1,'...',false);pages.push(nextPageSet);}}return pages;}var originalRender=paginationCtrl.render;paginationCtrl.render = function(){originalRender();if(scope.page > 0 && scope.page <= scope.totalPages){scope.pages = getPages(scope.page,scope.totalPages);}};}};}]).directive('pager',['uibPagerConfig','$log','$paginationSuppressWarning',function(pagerConfig,$log,$paginationSuppressWarning){return {restrict:'EA',scope:{totalItems:'=',previousText:'@',nextText:'@',ngDisabled:'='},require:['pager','?ngModel'],controller:'PaginationController',controllerAs:'pagination',templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/pagination/pager.html';},replace:true,link:function link(scope,element,attrs,ctrls){if(!$paginationSuppressWarning){$log.warn('pager is now deprecated. Use uib-pager instead.');}var paginationCtrl=ctrls[0],ngModelCtrl=ctrls[1];if(!ngModelCtrl){return; // do nothing if no ng-model
}scope.align = angular.isDefined(attrs.align)?scope.$parent.$eval(attrs.align):pagerConfig.align;paginationCtrl.init(ngModelCtrl,pagerConfig);}};}]); /**
 * The following features are still outstanding: animation as a
 * function, placement as a function, inside, support for more triggers than
 * just mouse enter/leave, html tooltips, and selector delegation.
 */angular.module('ui.bootstrap.tooltip',['ui.bootstrap.position','ui.bootstrap.stackedMap']) /**
 * The $tooltip service creates tooltip- and popover-like directives as well as
 * houses global options for them.
 */.provider('$uibTooltip',function(){ // The default options tooltip and popover.
var defaultOptions={placement:'top',animation:true,popupDelay:0,popupCloseDelay:0,useContentExp:false}; // Default hide triggers for each show trigger
var triggerMap={'mouseenter':'mouseleave','click':'click','focus':'blur','none':''}; // The options specified to the provider globally.
var globalOptions={}; /**
   * `options({})` allows global configuration of all tooltips in the
   * application.
   *
   *   var app = angular.module( 'App', ['ui.bootstrap.tooltip'], function( $tooltipProvider ) {
   *     // place tooltips left instead of top by default
   *     $tooltipProvider.options( { placement: 'left' } );
   *   });
   */this.options = function(value){angular.extend(globalOptions,value);}; /**
   * This allows you to extend the set of trigger mappings available. E.g.:
   *
   *   $tooltipProvider.setTriggers( 'openTrigger': 'closeTrigger' );
   */this.setTriggers = function setTriggers(triggers){angular.extend(triggerMap,triggers);}; /**
   * This is a helper function for translating camel-case to snake-case.
   */function snake_case(name){var regexp=/[A-Z]/g;var separator='-';return name.replace(regexp,function(letter,pos){return (pos?separator:'') + letter.toLowerCase();});} /**
   * Returns the actual instance of the $tooltip service.
   * TODO support multiple triggers
   */this.$get = ['$window','$compile','$timeout','$document','$uibPosition','$interpolate','$rootScope','$parse','$$stackedMap',function($window,$compile,$timeout,$document,$position,$interpolate,$rootScope,$parse,$$stackedMap){var openedTooltips=$$stackedMap.createNew();$document.on('keypress',function(e){if(e.which === 27){var last=openedTooltips.top();if(last){last.value.close();openedTooltips.removeTop();last = null;}}});return function $tooltip(ttType,prefix,defaultTriggerShow,options){options = angular.extend({},defaultOptions,globalOptions,options); /**
       * Returns an object of show and hide triggers.
       *
       * If a trigger is supplied,
       * it is used to show the tooltip; otherwise, it will use the `trigger`
       * option passed to the `$tooltipProvider.options` method; else it will
       * default to the trigger supplied to this directive factory.
       *
       * The hide trigger is based on the show trigger. If the `trigger` option
       * was passed to the `$tooltipProvider.options` method, it will use the
       * mapped trigger from `triggerMap` or the passed trigger if the map is
       * undefined; otherwise, it uses the `triggerMap` value of the show
       * trigger; else it will just use the show trigger.
       */function getTriggers(trigger){var show=(trigger || options.trigger || defaultTriggerShow).split(' ');var hide=show.map(function(trigger){return triggerMap[trigger] || trigger;});return {show:show,hide:hide};}var directiveName=snake_case(ttType);var startSym=$interpolate.startSymbol();var endSym=$interpolate.endSymbol();var template='<div ' + directiveName + '-popup ' + 'title="' + startSym + 'title' + endSym + '" ' + (options.useContentExp?'content-exp="contentExp()" ':'content="' + startSym + 'content' + endSym + '" ') + 'placement="' + startSym + 'placement' + endSym + '" ' + 'popup-class="' + startSym + 'popupClass' + endSym + '" ' + 'animation="animation" ' + 'is-open="isOpen"' + 'origin-scope="origScope" ' + 'style="visibility: hidden; display: block; top: -9999px; left: -9999px;"' + '>' + '</div>';return {compile:function compile(tElem,tAttrs){var tooltipLinker=$compile(template);return function link(scope,element,attrs,tooltipCtrl){var tooltip;var tooltipLinkedScope;var transitionTimeout;var showTimeout;var hideTimeout;var positionTimeout;var appendToBody=angular.isDefined(options.appendToBody)?options.appendToBody:false;var triggers=getTriggers(undefined);var hasEnableExp=angular.isDefined(attrs[prefix + 'Enable']);var ttScope=scope.$new(true);var repositionScheduled=false;var isOpenParse=angular.isDefined(attrs[prefix + 'IsOpen'])?$parse(attrs[prefix + 'IsOpen']):false;var contentParse=options.useContentExp?$parse(attrs[ttType]):false;var observers=[];var positionTooltip=function positionTooltip(){ // check if tooltip exists and is not empty
if(!tooltip || !tooltip.html()){return;}if(!positionTimeout){positionTimeout = $timeout(function(){ // Reset the positioning.
tooltip.css({top:0,left:0}); // Now set the calculated positioning.
var ttCss=$position.positionElements(element,tooltip,ttScope.placement,appendToBody);ttCss.top += 'px';ttCss.left += 'px';ttCss.visibility = 'visible';tooltip.css(ttCss);positionTimeout = null;},0,false);}}; // Set up the correct scope to allow transclusion later
ttScope.origScope = scope; // By default, the tooltip is not open.
// TODO add ability to start tooltip opened
ttScope.isOpen = false;openedTooltips.add(ttScope,{close:hide});function toggleTooltipBind(){if(!ttScope.isOpen){showTooltipBind();}else {hideTooltipBind();}} // Show the tooltip with delay if specified, otherwise show it immediately
function showTooltipBind(){if(hasEnableExp && !scope.$eval(attrs[prefix + 'Enable'])){return;}cancelHide();prepareTooltip();if(ttScope.popupDelay){ // Do nothing if the tooltip was already scheduled to pop-up.
// This happens if show is triggered multiple times before any hide is triggered.
if(!showTimeout){showTimeout = $timeout(show,ttScope.popupDelay,false);}}else {show();}}function hideTooltipBind(){cancelShow();if(ttScope.popupCloseDelay){if(!hideTimeout){hideTimeout = $timeout(hide,ttScope.popupCloseDelay,false);}}else {hide();}} // Show the tooltip popup element.
function show(){cancelShow();cancelHide(); // Don't show empty tooltips.
if(!ttScope.content){return angular.noop;}createTooltip(); // And show the tooltip.
ttScope.$evalAsync(function(){ttScope.isOpen = true;assignIsOpen(true);positionTooltip();});}function cancelShow(){if(showTimeout){$timeout.cancel(showTimeout);showTimeout = null;}if(positionTimeout){$timeout.cancel(positionTimeout);positionTimeout = null;}} // Hide the tooltip popup element.
function hide(){cancelShow();cancelHide();if(!ttScope){return;} // First things first: we don't show it anymore.
ttScope.$evalAsync(function(){ttScope.isOpen = false;assignIsOpen(false); // And now we remove it from the DOM. However, if we have animation, we
// need to wait for it to expire beforehand.
// FIXME: this is a placeholder for a port of the transitions library.
// The fade transition in TWBS is 150ms.
if(ttScope.animation){if(!transitionTimeout){transitionTimeout = $timeout(removeTooltip,150,false);}}else {removeTooltip();}});}function cancelHide(){if(hideTimeout){$timeout.cancel(hideTimeout);hideTimeout = null;}if(transitionTimeout){$timeout.cancel(transitionTimeout);transitionTimeout = null;}}function createTooltip(){ // There can only be one tooltip element per directive shown at once.
if(tooltip){return;}tooltipLinkedScope = ttScope.$new();tooltip = tooltipLinker(tooltipLinkedScope,function(tooltip){if(appendToBody){$document.find('body').append(tooltip);}else {element.after(tooltip);}});prepObservers();}function removeTooltip(){unregisterObservers();transitionTimeout = null;if(tooltip){tooltip.remove();tooltip = null;}if(tooltipLinkedScope){tooltipLinkedScope.$destroy();tooltipLinkedScope = null;}} /**
             * Set the inital scope values. Once
             * the tooltip is created, the observers
             * will be added to keep things in synch.
             */function prepareTooltip(){ttScope.title = attrs[prefix + 'Title'];if(contentParse){ttScope.content = contentParse(scope);}else {ttScope.content = attrs[ttType];}ttScope.popupClass = attrs[prefix + 'Class'];ttScope.placement = angular.isDefined(attrs[prefix + 'Placement'])?attrs[prefix + 'Placement']:options.placement;var delay=parseInt(attrs[prefix + 'PopupDelay'],10);var closeDelay=parseInt(attrs[prefix + 'PopupCloseDelay'],10);ttScope.popupDelay = !isNaN(delay)?delay:options.popupDelay;ttScope.popupCloseDelay = !isNaN(closeDelay)?closeDelay:options.popupCloseDelay;}function assignIsOpen(isOpen){if(isOpenParse && angular.isFunction(isOpenParse.assign)){isOpenParse.assign(scope,isOpen);}}ttScope.contentExp = function(){return ttScope.content;}; /**
             * Observe the relevant attributes.
             */attrs.$observe('disabled',function(val){if(val){cancelShow();}if(val && ttScope.isOpen){hide();}});if(isOpenParse){scope.$watch(isOpenParse,function(val){ /*jshint -W018 */if(ttScope && !val === ttScope.isOpen){toggleTooltipBind();} /*jshint +W018 */});}function prepObservers(){observers.length = 0;if(contentParse){observers.push(scope.$watch(contentParse,function(val){ttScope.content = val;if(!val && ttScope.isOpen){hide();}}));observers.push(tooltipLinkedScope.$watch(function(){if(!repositionScheduled){repositionScheduled = true;tooltipLinkedScope.$$postDigest(function(){repositionScheduled = false;if(ttScope && ttScope.isOpen){positionTooltip();}});}}));}else {observers.push(attrs.$observe(ttType,function(val){ttScope.content = val;if(!val && ttScope.isOpen){hide();}else {positionTooltip();}}));}observers.push(attrs.$observe(prefix + 'Title',function(val){ttScope.title = val;if(ttScope.isOpen){positionTooltip();}}));observers.push(attrs.$observe(prefix + 'Placement',function(val){ttScope.placement = val?val:options.placement;if(ttScope.isOpen){positionTooltip();}}));}function unregisterObservers(){if(observers.length){angular.forEach(observers,function(observer){observer();});observers.length = 0;}}var unregisterTriggers=function unregisterTriggers(){triggers.show.forEach(function(trigger){element.unbind(trigger,showTooltipBind);});triggers.hide.forEach(function(trigger){trigger.split(' ').forEach(function(hideTrigger){element[0].removeEventListener(hideTrigger,hideTooltipBind);});});};function prepTriggers(){var val=attrs[prefix + 'Trigger'];unregisterTriggers();triggers = getTriggers(val);if(triggers.show !== 'none'){triggers.show.forEach(function(trigger,idx){ // Using raw addEventListener due to jqLite/jQuery bug - #4060
if(trigger === triggers.hide[idx]){element[0].addEventListener(trigger,toggleTooltipBind);}else if(trigger){element[0].addEventListener(trigger,showTooltipBind);triggers.hide[idx].split(' ').forEach(function(trigger){element[0].addEventListener(trigger,hideTooltipBind);});}element.on('keypress',function(e){if(e.which === 27){hideTooltipBind();}});});}}prepTriggers();var animation=scope.$eval(attrs[prefix + 'Animation']);ttScope.animation = angular.isDefined(animation)?!!animation:options.animation;var appendToBodyVal=scope.$eval(attrs[prefix + 'AppendToBody']);appendToBody = angular.isDefined(appendToBodyVal)?appendToBodyVal:appendToBody; // if a tooltip is attached to <body> we need to remove it on
// location change as its parent scope will probably not be destroyed
// by the change.
if(appendToBody){scope.$on('$locationChangeSuccess',function closeTooltipOnLocationChangeSuccess(){if(ttScope.isOpen){hide();}});} // Make sure tooltip is destroyed and removed.
scope.$on('$destroy',function onDestroyTooltip(){cancelShow();cancelHide();unregisterTriggers();removeTooltip();openedTooltips.remove(ttScope);ttScope = null;});};}};};}];}) // This is mostly ngInclude code but with a custom scope
.directive('uibTooltipTemplateTransclude',['$animate','$sce','$compile','$templateRequest',function($animate,$sce,$compile,$templateRequest){return {link:function link(scope,elem,attrs){var origScope=scope.$eval(attrs.tooltipTemplateTranscludeScope);var changeCounter=0,currentScope,previousElement,currentElement;var cleanupLastIncludeContent=function cleanupLastIncludeContent(){if(previousElement){previousElement.remove();previousElement = null;}if(currentScope){currentScope.$destroy();currentScope = null;}if(currentElement){$animate.leave(currentElement).then(function(){previousElement = null;});previousElement = currentElement;currentElement = null;}};scope.$watch($sce.parseAsResourceUrl(attrs.uibTooltipTemplateTransclude),function(src){var thisChangeId=++changeCounter;if(src){ //set the 2nd param to true to ignore the template request error so that the inner
//contents and scope can be cleaned up.
$templateRequest(src,true).then(function(response){if(thisChangeId !== changeCounter){return;}var newScope=origScope.$new();var template=response;var clone=$compile(template)(newScope,function(clone){cleanupLastIncludeContent();$animate.enter(clone,elem);});currentScope = newScope;currentElement = clone;currentScope.$emit('$includeContentLoaded',src);},function(){if(thisChangeId === changeCounter){cleanupLastIncludeContent();scope.$emit('$includeContentError',src);}});scope.$emit('$includeContentRequested',src);}else {cleanupLastIncludeContent();}});scope.$on('$destroy',cleanupLastIncludeContent);}};}]) /**
 * Note that it's intentional that these classes are *not* applied through $animate.
 * They must not be animated as they're expected to be present on the tooltip on
 * initialization.
 */.directive('uibTooltipClasses',function(){return {restrict:'A',link:function link(scope,element,attrs){if(scope.placement){element.addClass(scope.placement);}if(scope.popupClass){element.addClass(scope.popupClass);}if(scope.animation()){element.addClass(attrs.tooltipAnimationClass);}}};}).directive('uibTooltipPopup',function(){return {replace:true,scope:{content:'@',placement:'@',popupClass:'@',animation:'&',isOpen:'&'},templateUrl:'template/tooltip/tooltip-popup.html',link:function link(scope,element){element.addClass('tooltip');}};}).directive('uibTooltip',['$uibTooltip',function($uibTooltip){return $uibTooltip('uibTooltip','tooltip','mouseenter');}]).directive('uibTooltipTemplatePopup',function(){return {replace:true,scope:{contentExp:'&',placement:'@',popupClass:'@',animation:'&',isOpen:'&',originScope:'&'},templateUrl:'template/tooltip/tooltip-template-popup.html',link:function link(scope,element){element.addClass('tooltip');}};}).directive('uibTooltipTemplate',['$uibTooltip',function($uibTooltip){return $uibTooltip('uibTooltipTemplate','tooltip','mouseenter',{useContentExp:true});}]).directive('uibTooltipHtmlPopup',function(){return {replace:true,scope:{contentExp:'&',placement:'@',popupClass:'@',animation:'&',isOpen:'&'},templateUrl:'template/tooltip/tooltip-html-popup.html',link:function link(scope,element){element.addClass('tooltip');}};}).directive('uibTooltipHtml',['$uibTooltip',function($uibTooltip){return $uibTooltip('uibTooltipHtml','tooltip','mouseenter',{useContentExp:true});}]); /* Deprecated tooltip below */angular.module('ui.bootstrap.tooltip').value('$tooltipSuppressWarning',false).provider('$tooltip',['$uibTooltipProvider',function($uibTooltipProvider){angular.extend(this,$uibTooltipProvider);this.$get = ['$log','$tooltipSuppressWarning','$injector',function($log,$tooltipSuppressWarning,$injector){if(!$tooltipSuppressWarning){$log.warn('$tooltip is now deprecated. Use $uibTooltip instead.');}return $injector.invoke($uibTooltipProvider.$get);}];}]) // This is mostly ngInclude code but with a custom scope
.directive('tooltipTemplateTransclude',['$animate','$sce','$compile','$templateRequest','$log','$tooltipSuppressWarning',function($animate,$sce,$compile,$templateRequest,$log,$tooltipSuppressWarning){return {link:function link(scope,elem,attrs){if(!$tooltipSuppressWarning){$log.warn('tooltip-template-transclude is now deprecated. Use uib-tooltip-template-transclude instead.');}var origScope=scope.$eval(attrs.tooltipTemplateTranscludeScope);var changeCounter=0,currentScope,previousElement,currentElement;var cleanupLastIncludeContent=function cleanupLastIncludeContent(){if(previousElement){previousElement.remove();previousElement = null;}if(currentScope){currentScope.$destroy();currentScope = null;}if(currentElement){$animate.leave(currentElement).then(function(){previousElement = null;});previousElement = currentElement;currentElement = null;}};scope.$watch($sce.parseAsResourceUrl(attrs.tooltipTemplateTransclude),function(src){var thisChangeId=++changeCounter;if(src){ //set the 2nd param to true to ignore the template request error so that the inner
//contents and scope can be cleaned up.
$templateRequest(src,true).then(function(response){if(thisChangeId !== changeCounter){return;}var newScope=origScope.$new();var template=response;var clone=$compile(template)(newScope,function(clone){cleanupLastIncludeContent();$animate.enter(clone,elem);});currentScope = newScope;currentElement = clone;currentScope.$emit('$includeContentLoaded',src);},function(){if(thisChangeId === changeCounter){cleanupLastIncludeContent();scope.$emit('$includeContentError',src);}});scope.$emit('$includeContentRequested',src);}else {cleanupLastIncludeContent();}});scope.$on('$destroy',cleanupLastIncludeContent);}};}]).directive('tooltipClasses',['$log','$tooltipSuppressWarning',function($log,$tooltipSuppressWarning){return {restrict:'A',link:function link(scope,element,attrs){if(!$tooltipSuppressWarning){$log.warn('tooltip-classes is now deprecated. Use uib-tooltip-classes instead.');}if(scope.placement){element.addClass(scope.placement);}if(scope.popupClass){element.addClass(scope.popupClass);}if(scope.animation()){element.addClass(attrs.tooltipAnimationClass);}}};}]).directive('tooltipPopup',['$log','$tooltipSuppressWarning',function($log,$tooltipSuppressWarning){return {replace:true,scope:{content:'@',placement:'@',popupClass:'@',animation:'&',isOpen:'&'},templateUrl:'template/tooltip/tooltip-popup.html',link:function link(scope,element){if(!$tooltipSuppressWarning){$log.warn('tooltip-popup is now deprecated. Use uib-tooltip-popup instead.');}element.addClass('tooltip');}};}]).directive('tooltip',['$tooltip',function($tooltip){return $tooltip('tooltip','tooltip','mouseenter');}]).directive('tooltipTemplatePopup',['$log','$tooltipSuppressWarning',function($log,$tooltipSuppressWarning){return {replace:true,scope:{contentExp:'&',placement:'@',popupClass:'@',animation:'&',isOpen:'&',originScope:'&'},templateUrl:'template/tooltip/tooltip-template-popup.html',link:function link(scope,element){if(!$tooltipSuppressWarning){$log.warn('tooltip-template-popup is now deprecated. Use uib-tooltip-template-popup instead.');}element.addClass('tooltip');}};}]).directive('tooltipTemplate',['$tooltip',function($tooltip){return $tooltip('tooltipTemplate','tooltip','mouseenter',{useContentExp:true});}]).directive('tooltipHtmlPopup',['$log','$tooltipSuppressWarning',function($log,$tooltipSuppressWarning){return {replace:true,scope:{contentExp:'&',placement:'@',popupClass:'@',animation:'&',isOpen:'&'},templateUrl:'template/tooltip/tooltip-html-popup.html',link:function link(scope,element){if(!$tooltipSuppressWarning){$log.warn('tooltip-html-popup is now deprecated. Use uib-tooltip-html-popup instead.');}element.addClass('tooltip');}};}]).directive('tooltipHtml',['$tooltip',function($tooltip){return $tooltip('tooltipHtml','tooltip','mouseenter',{useContentExp:true});}]); /**
 * The following features are still outstanding: popup delay, animation as a
 * function, placement as a function, inside, support for more triggers than
 * just mouse enter/leave, and selector delegatation.
 */angular.module('ui.bootstrap.popover',['ui.bootstrap.tooltip']).directive('uibPopoverTemplatePopup',function(){return {replace:true,scope:{title:'@',contentExp:'&',placement:'@',popupClass:'@',animation:'&',isOpen:'&',originScope:'&'},templateUrl:'template/popover/popover-template.html',link:function link(scope,element){element.addClass('popover');}};}).directive('uibPopoverTemplate',['$uibTooltip',function($uibTooltip){return $uibTooltip('uibPopoverTemplate','popover','click',{useContentExp:true});}]).directive('uibPopoverHtmlPopup',function(){return {replace:true,scope:{contentExp:'&',title:'@',placement:'@',popupClass:'@',animation:'&',isOpen:'&'},templateUrl:'template/popover/popover-html.html',link:function link(scope,element){element.addClass('popover');}};}).directive('uibPopoverHtml',['$uibTooltip',function($uibTooltip){return $uibTooltip('uibPopoverHtml','popover','click',{useContentExp:true});}]).directive('uibPopoverPopup',function(){return {replace:true,scope:{title:'@',content:'@',placement:'@',popupClass:'@',animation:'&',isOpen:'&'},templateUrl:'template/popover/popover.html',link:function link(scope,element){element.addClass('popover');}};}).directive('uibPopover',['$uibTooltip',function($uibTooltip){return $uibTooltip('uibPopover','popover','click');}]); /* Deprecated popover below */angular.module('ui.bootstrap.popover').value('$popoverSuppressWarning',false).directive('popoverTemplatePopup',['$log','$popoverSuppressWarning',function($log,$popoverSuppressWarning){return {replace:true,scope:{title:'@',contentExp:'&',placement:'@',popupClass:'@',animation:'&',isOpen:'&',originScope:'&'},templateUrl:'template/popover/popover-template.html',link:function link(scope,element){if(!$popoverSuppressWarning){$log.warn('popover-template-popup is now deprecated. Use uib-popover-template-popup instead.');}element.addClass('popover');}};}]).directive('popoverTemplate',['$tooltip',function($tooltip){return $tooltip('popoverTemplate','popover','click',{useContentExp:true});}]).directive('popoverHtmlPopup',['$log','$popoverSuppressWarning',function($log,$popoverSuppressWarning){return {replace:true,scope:{contentExp:'&',title:'@',placement:'@',popupClass:'@',animation:'&',isOpen:'&'},templateUrl:'template/popover/popover-html.html',link:function link(scope,element){if(!$popoverSuppressWarning){$log.warn('popover-html-popup is now deprecated. Use uib-popover-html-popup instead.');}element.addClass('popover');}};}]).directive('popoverHtml',['$tooltip',function($tooltip){return $tooltip('popoverHtml','popover','click',{useContentExp:true});}]).directive('popoverPopup',['$log','$popoverSuppressWarning',function($log,$popoverSuppressWarning){return {replace:true,scope:{title:'@',content:'@',placement:'@',popupClass:'@',animation:'&',isOpen:'&'},templateUrl:'template/popover/popover.html',link:function link(scope,element){if(!$popoverSuppressWarning){$log.warn('popover-popup is now deprecated. Use uib-popover-popup instead.');}element.addClass('popover');}};}]).directive('popover',['$tooltip',function($tooltip){return $tooltip('popover','popover','click');}]);angular.module('ui.bootstrap.progressbar',[]).constant('uibProgressConfig',{animate:true,max:100}).controller('UibProgressController',['$scope','$attrs','uibProgressConfig',function($scope,$attrs,progressConfig){var self=this,animate=angular.isDefined($attrs.animate)?$scope.$parent.$eval($attrs.animate):progressConfig.animate;this.bars = [];$scope.max = angular.isDefined($scope.max)?$scope.max:progressConfig.max;this.addBar = function(bar,element,attrs){if(!animate){element.css({'transition':'none'});}this.bars.push(bar);bar.max = $scope.max;bar.title = attrs && angular.isDefined(attrs.title)?attrs.title:'progressbar';bar.$watch('value',function(value){bar.recalculatePercentage();});bar.recalculatePercentage = function(){var totalPercentage=self.bars.reduce(function(total,bar){bar.percent = +(100 * bar.value / bar.max).toFixed(2);return total + bar.percent;},0);if(totalPercentage > 100){bar.percent -= totalPercentage - 100;}};bar.$on('$destroy',function(){element = null;self.removeBar(bar);});};this.removeBar = function(bar){this.bars.splice(this.bars.indexOf(bar),1);this.bars.forEach(function(bar){bar.recalculatePercentage();});};$scope.$watch('max',function(max){self.bars.forEach(function(bar){bar.max = $scope.max;bar.recalculatePercentage();});});}]).directive('uibProgress',function(){return {replace:true,transclude:true,controller:'UibProgressController',require:'uibProgress',scope:{max:'=?'},templateUrl:'template/progressbar/progress.html'};}).directive('uibBar',function(){return {replace:true,transclude:true,require:'^uibProgress',scope:{value:'=',type:'@'},templateUrl:'template/progressbar/bar.html',link:function link(scope,element,attrs,progressCtrl){progressCtrl.addBar(scope,element,attrs);}};}).directive('uibProgressbar',function(){return {replace:true,transclude:true,controller:'UibProgressController',scope:{value:'=',max:'=?',type:'@'},templateUrl:'template/progressbar/progressbar.html',link:function link(scope,element,attrs,progressCtrl){progressCtrl.addBar(scope,angular.element(element.children()[0]),{title:attrs.title});}};}); /* Deprecated progressbar below */angular.module('ui.bootstrap.progressbar').value('$progressSuppressWarning',false).controller('ProgressController',['$scope','$attrs','uibProgressConfig','$log','$progressSuppressWarning',function($scope,$attrs,progressConfig,$log,$progressSuppressWarning){if(!$progressSuppressWarning){$log.warn('ProgressController is now deprecated. Use UibProgressController instead.');}var self=this,animate=angular.isDefined($attrs.animate)?$scope.$parent.$eval($attrs.animate):progressConfig.animate;this.bars = [];$scope.max = angular.isDefined($scope.max)?$scope.max:progressConfig.max;this.addBar = function(bar,element,attrs){if(!animate){element.css({'transition':'none'});}this.bars.push(bar);bar.max = $scope.max;bar.title = attrs && angular.isDefined(attrs.title)?attrs.title:'progressbar';bar.$watch('value',function(value){bar.recalculatePercentage();});bar.recalculatePercentage = function(){bar.percent = +(100 * bar.value / bar.max).toFixed(2);var totalPercentage=self.bars.reduce(function(total,bar){return total + bar.percent;},0);if(totalPercentage > 100){bar.percent -= totalPercentage - 100;}};bar.$on('$destroy',function(){element = null;self.removeBar(bar);});};this.removeBar = function(bar){this.bars.splice(this.bars.indexOf(bar),1);};$scope.$watch('max',function(max){self.bars.forEach(function(bar){bar.max = $scope.max;bar.recalculatePercentage();});});}]).directive('progress',['$log','$progressSuppressWarning',function($log,$progressSuppressWarning){return {replace:true,transclude:true,controller:'ProgressController',require:'progress',scope:{max:'=?',title:'@?'},templateUrl:'template/progressbar/progress.html',link:function link(){if(!$progressSuppressWarning){$log.warn('progress is now deprecated. Use uib-progress instead.');}}};}]).directive('bar',['$log','$progressSuppressWarning',function($log,$progressSuppressWarning){return {replace:true,transclude:true,require:'^progress',scope:{value:'=',type:'@'},templateUrl:'template/progressbar/bar.html',link:function link(scope,element,attrs,progressCtrl){if(!$progressSuppressWarning){$log.warn('bar is now deprecated. Use uib-bar instead.');}progressCtrl.addBar(scope,element);}};}]).directive('progressbar',['$log','$progressSuppressWarning',function($log,$progressSuppressWarning){return {replace:true,transclude:true,controller:'ProgressController',scope:{value:'=',max:'=?',type:'@'},templateUrl:'template/progressbar/progressbar.html',link:function link(scope,element,attrs,progressCtrl){if(!$progressSuppressWarning){$log.warn('progressbar is now deprecated. Use uib-progressbar instead.');}progressCtrl.addBar(scope,angular.element(element.children()[0]),{title:attrs.title});}};}]);angular.module('ui.bootstrap.rating',[]).constant('uibRatingConfig',{max:5,stateOn:null,stateOff:null,titles:['one','two','three','four','five']}).controller('UibRatingController',['$scope','$attrs','uibRatingConfig',function($scope,$attrs,ratingConfig){var ngModelCtrl={$setViewValue:angular.noop};this.init = function(ngModelCtrl_){ngModelCtrl = ngModelCtrl_;ngModelCtrl.$render = this.render;ngModelCtrl.$formatters.push(function(value){if(angular.isNumber(value) && value << 0 !== value){value = Math.round(value);}return value;});this.stateOn = angular.isDefined($attrs.stateOn)?$scope.$parent.$eval($attrs.stateOn):ratingConfig.stateOn;this.stateOff = angular.isDefined($attrs.stateOff)?$scope.$parent.$eval($attrs.stateOff):ratingConfig.stateOff;var tmpTitles=angular.isDefined($attrs.titles)?$scope.$parent.$eval($attrs.titles):ratingConfig.titles;this.titles = angular.isArray(tmpTitles) && tmpTitles.length > 0?tmpTitles:ratingConfig.titles;var ratingStates=angular.isDefined($attrs.ratingStates)?$scope.$parent.$eval($attrs.ratingStates):new Array(angular.isDefined($attrs.max)?$scope.$parent.$eval($attrs.max):ratingConfig.max);$scope.range = this.buildTemplateObjects(ratingStates);};this.buildTemplateObjects = function(states){for(var i=0,n=states.length;i < n;i++) {states[i] = angular.extend({index:i},{stateOn:this.stateOn,stateOff:this.stateOff,title:this.getTitle(i)},states[i]);}return states;};this.getTitle = function(index){if(index >= this.titles.length){return index + 1;}else {return this.titles[index];}};$scope.rate = function(value){if(!$scope.readonly && value >= 0 && value <= $scope.range.length){ngModelCtrl.$setViewValue(ngModelCtrl.$viewValue === value?0:value);ngModelCtrl.$render();}};$scope.enter = function(value){if(!$scope.readonly){$scope.value = value;}$scope.onHover({value:value});};$scope.reset = function(){$scope.value = ngModelCtrl.$viewValue;$scope.onLeave();};$scope.onKeydown = function(evt){if(/(37|38|39|40)/.test(evt.which)){evt.preventDefault();evt.stopPropagation();$scope.rate($scope.value + (evt.which === 38 || evt.which === 39?1:-1));}};this.render = function(){$scope.value = ngModelCtrl.$viewValue;};}]).directive('uibRating',function(){return {require:['uibRating','ngModel'],scope:{readonly:'=?',onHover:'&',onLeave:'&'},controller:'UibRatingController',templateUrl:'template/rating/rating.html',replace:true,link:function link(scope,element,attrs,ctrls){var ratingCtrl=ctrls[0],ngModelCtrl=ctrls[1];ratingCtrl.init(ngModelCtrl);}};}); /* Deprecated rating below */angular.module('ui.bootstrap.rating').value('$ratingSuppressWarning',false).controller('RatingController',['$scope','$attrs','$controller','$log','$ratingSuppressWarning',function($scope,$attrs,$controller,$log,$ratingSuppressWarning){if(!$ratingSuppressWarning){$log.warn('RatingController is now deprecated. Use UibRatingController instead.');}angular.extend(this,$controller('UibRatingController',{$scope:$scope,$attrs:$attrs}));}]).directive('rating',['$log','$ratingSuppressWarning',function($log,$ratingSuppressWarning){return {require:['rating','ngModel'],scope:{readonly:'=?',onHover:'&',onLeave:'&'},controller:'RatingController',templateUrl:'template/rating/rating.html',replace:true,link:function link(scope,element,attrs,ctrls){if(!$ratingSuppressWarning){$log.warn('rating is now deprecated. Use uib-rating instead.');}var ratingCtrl=ctrls[0],ngModelCtrl=ctrls[1];ratingCtrl.init(ngModelCtrl);}};}]); /**
 * @ngdoc overview
 * @name ui.bootstrap.tabs
 *
 * @description
 * AngularJS version of the tabs directive.
 */angular.module('ui.bootstrap.tabs',[]).controller('UibTabsetController',['$scope',function($scope){var ctrl=this,tabs=ctrl.tabs = $scope.tabs = [];ctrl.select = function(selectedTab){angular.forEach(tabs,function(tab){if(tab.active && tab !== selectedTab){tab.active = false;tab.onDeselect();selectedTab.selectCalled = false;}});selectedTab.active = true; // only call select if it has not already been called
if(!selectedTab.selectCalled){selectedTab.onSelect();selectedTab.selectCalled = true;}};ctrl.addTab = function addTab(tab){tabs.push(tab); // we can't run the select function on the first tab
// since that would select it twice
if(tabs.length === 1 && tab.active !== false){tab.active = true;}else if(tab.active){ctrl.select(tab);}else {tab.active = false;}};ctrl.removeTab = function removeTab(tab){var index=tabs.indexOf(tab); //Select a new tab if the tab to be removed is selected and not destroyed
if(tab.active && tabs.length > 1 && !destroyed){ //If this is the last tab, select the previous tab. else, the next tab.
var newActiveIndex=index == tabs.length - 1?index - 1:index + 1;ctrl.select(tabs[newActiveIndex]);}tabs.splice(index,1);};var destroyed;$scope.$on('$destroy',function(){destroyed = true;});}]) /**
 * @ngdoc directive
 * @name ui.bootstrap.tabs.directive:tabset
 * @restrict EA
 *
 * @description
 * Tabset is the outer container for the tabs directive
 *
 * @param {boolean=} vertical Whether or not to use vertical styling for the tabs.
 * @param {boolean=} justified Whether or not to use justified styling for the tabs.
 *
 * @example
<example module="ui.bootstrap">
  <file name="index.html">
    <uib-tabset>
      <uib-tab heading="Tab 1"><b>First</b> Content!</uib-tab>
      <uib-tab heading="Tab 2"><i>Second</i> Content!</uib-tab>
    </uib-tabset>
    <hr />
    <uib-tabset vertical="true">
      <uib-tab heading="Vertical Tab 1"><b>First</b> Vertical Content!</uib-tab>
      <uib-tab heading="Vertical Tab 2"><i>Second</i> Vertical Content!</uib-tab>
    </uib-tabset>
    <uib-tabset justified="true">
      <uib-tab heading="Justified Tab 1"><b>First</b> Justified Content!</uib-tab>
      <uib-tab heading="Justified Tab 2"><i>Second</i> Justified Content!</uib-tab>
    </uib-tabset>
  </file>
</example>
 */.directive('uibTabset',function(){return {restrict:'EA',transclude:true,replace:true,scope:{type:'@'},controller:'UibTabsetController',templateUrl:'template/tabs/tabset.html',link:function link(scope,element,attrs){scope.vertical = angular.isDefined(attrs.vertical)?scope.$parent.$eval(attrs.vertical):false;scope.justified = angular.isDefined(attrs.justified)?scope.$parent.$eval(attrs.justified):false;}};}) /**
 * @ngdoc directive
 * @name ui.bootstrap.tabs.directive:tab
 * @restrict EA
 *
 * @param {string=} heading The visible heading, or title, of the tab. Set HTML headings with {@link ui.bootstrap.tabs.directive:tabHeading tabHeading}.
 * @param {string=} select An expression to evaluate when the tab is selected.
 * @param {boolean=} active A binding, telling whether or not this tab is selected.
 * @param {boolean=} disabled A binding, telling whether or not this tab is disabled.
 *
 * @description
 * Creates a tab with a heading and content. Must be placed within a {@link ui.bootstrap.tabs.directive:tabset tabset}.
 *
 * @example
<example module="ui.bootstrap">
  <file name="index.html">
    <div ng-controller="TabsDemoCtrl">
      <button class="btn btn-small" ng-click="items[0].active = true">
        Select item 1, using active binding
      </button>
      <button class="btn btn-small" ng-click="items[1].disabled = !items[1].disabled">
        Enable/disable item 2, using disabled binding
      </button>
      <br />
      <uib-tabset>
        <uib-tab heading="Tab 1">First Tab</uib-tab>
        <uib-tab select="alertMe()">
          <uib-tab-heading><i class="icon-bell"></i> Alert me!</tab-heading>
          Second Tab, with alert callback and html heading!
        </uib-tab>
        <uib-tab ng-repeat="item in items"
          heading="{{item.title}}"
          disabled="item.disabled"
          active="item.active">
          {{item.content}}
        </uib-tab>
      </uib-tabset>
    </div>
  </file>
  <file name="script.js">
    function TabsDemoCtrl($scope) {
      $scope.items = [
        { title:"Dynamic Title 1", content:"Dynamic Item 0" },
        { title:"Dynamic Title 2", content:"Dynamic Item 1", disabled: true }
      ];

      $scope.alertMe = function() {
        setTimeout(function() {
          alert("You've selected the alert tab!");
        });
      };
    };
  </file>
</example>
 */ /**
 * @ngdoc directive
 * @name ui.bootstrap.tabs.directive:tabHeading
 * @restrict EA
 *
 * @description
 * Creates an HTML heading for a {@link ui.bootstrap.tabs.directive:tab tab}. Must be placed as a child of a tab element.
 *
 * @example
<example module="ui.bootstrap">
  <file name="index.html">
    <uib-tabset>
      <uib-tab>
        <uib-tab-heading><b>HTML</b> in my titles?!</tab-heading>
        And some content, too!
      </uib-tab>
      <uib-tab>
        <uib-tab-heading><i class="icon-heart"></i> Icon heading?!?</tab-heading>
        That's right.
      </uib-tab>
    </uib-tabset>
  </file>
</example>
 */.directive('uibTab',['$parse',function($parse){return {require:'^uibTabset',restrict:'EA',replace:true,templateUrl:'template/tabs/tab.html',transclude:true,scope:{active:'=?',heading:'@',onSelect:'&select', //This callback is called in contentHeadingTransclude
//once it inserts the tab's content into the dom
onDeselect:'&deselect'},controller:function controller(){ //Empty controller so other directives can require being 'under' a tab
},link:function link(scope,elm,attrs,tabsetCtrl,transclude){scope.$watch('active',function(active){if(active){tabsetCtrl.select(scope);}});scope.disabled = false;if(attrs.disable){scope.$parent.$watch($parse(attrs.disable),function(value){scope.disabled = !!value;});}scope.select = function(){if(!scope.disabled){scope.active = true;}};tabsetCtrl.addTab(scope);scope.$on('$destroy',function(){tabsetCtrl.removeTab(scope);}); //We need to transclude later, once the content container is ready.
//when this link happens, we're inside a tab heading.
scope.$transcludeFn = transclude;}};}]).directive('uibTabHeadingTransclude',function(){return {restrict:'A',require:['?^uibTab','?^tab'], // TODO: change to '^uibTab' after deprecation removal
link:function link(scope,elm){scope.$watch('headingElement',function updateHeadingElement(heading){if(heading){elm.html('');elm.append(heading);}});}};}).directive('uibTabContentTransclude',function(){return {restrict:'A',require:['?^uibTabset','?^tabset'], // TODO: change to '^uibTabset' after deprecation removal
link:function link(scope,elm,attrs){var tab=scope.$eval(attrs.uibTabContentTransclude); //Now our tab is ready to be transcluded: both the tab heading area
//and the tab content area are loaded.  Transclude 'em both.
tab.$transcludeFn(tab.$parent,function(contents){angular.forEach(contents,function(node){if(isTabHeading(node)){ //Let tabHeadingTransclude know.
tab.headingElement = node;}else {elm.append(node);}});});}};function isTabHeading(node){return node.tagName && (node.hasAttribute('tab-heading') ||  // TODO: remove after deprecation removal
node.hasAttribute('data-tab-heading') ||  // TODO: remove after deprecation removal
node.hasAttribute('x-tab-heading') ||  // TODO: remove after deprecation removal
node.hasAttribute('uib-tab-heading') || node.hasAttribute('data-uib-tab-heading') || node.hasAttribute('x-uib-tab-heading') || node.tagName.toLowerCase() === 'tab-heading' ||  // TODO: remove after deprecation removal
node.tagName.toLowerCase() === 'data-tab-heading' ||  // TODO: remove after deprecation removal
node.tagName.toLowerCase() === 'x-tab-heading' ||  // TODO: remove after deprecation removal
node.tagName.toLowerCase() === 'uib-tab-heading' || node.tagName.toLowerCase() === 'data-uib-tab-heading' || node.tagName.toLowerCase() === 'x-uib-tab-heading');}}); /* deprecated tabs below */angular.module('ui.bootstrap.tabs').value('$tabsSuppressWarning',false).controller('TabsetController',['$scope','$controller','$log','$tabsSuppressWarning',function($scope,$controller,$log,$tabsSuppressWarning){if(!$tabsSuppressWarning){$log.warn('TabsetController is now deprecated. Use UibTabsetController instead.');}angular.extend(this,$controller('UibTabsetController',{$scope:$scope}));}]).directive('tabset',['$log','$tabsSuppressWarning',function($log,$tabsSuppressWarning){return {restrict:'EA',transclude:true,replace:true,scope:{type:'@'},controller:'TabsetController',templateUrl:'template/tabs/tabset.html',link:function link(scope,element,attrs){if(!$tabsSuppressWarning){$log.warn('tabset is now deprecated. Use uib-tabset instead.');}scope.vertical = angular.isDefined(attrs.vertical)?scope.$parent.$eval(attrs.vertical):false;scope.justified = angular.isDefined(attrs.justified)?scope.$parent.$eval(attrs.justified):false;}};}]).directive('tab',['$parse','$log','$tabsSuppressWarning',function($parse,$log,$tabsSuppressWarning){return {require:'^tabset',restrict:'EA',replace:true,templateUrl:'template/tabs/tab.html',transclude:true,scope:{active:'=?',heading:'@',onSelect:'&select', //This callback is called in contentHeadingTransclude
//once it inserts the tab's content into the dom
onDeselect:'&deselect'},controller:function controller(){ //Empty controller so other directives can require being 'under' a tab
},link:function link(scope,elm,attrs,tabsetCtrl,transclude){if(!$tabsSuppressWarning){$log.warn('tab is now deprecated. Use uib-tab instead.');}scope.$watch('active',function(active){if(active){tabsetCtrl.select(scope);}});scope.disabled = false;if(attrs.disable){scope.$parent.$watch($parse(attrs.disable),function(value){scope.disabled = !!value;});}scope.select = function(){if(!scope.disabled){scope.active = true;}};tabsetCtrl.addTab(scope);scope.$on('$destroy',function(){tabsetCtrl.removeTab(scope);}); //We need to transclude later, once the content container is ready.
//when this link happens, we're inside a tab heading.
scope.$transcludeFn = transclude;}};}]).directive('tabHeadingTransclude',['$log','$tabsSuppressWarning',function($log,$tabsSuppressWarning){return {restrict:'A',require:'^tab',link:function link(scope,elm){if(!$tabsSuppressWarning){$log.warn('tab-heading-transclude is now deprecated. Use uib-tab-heading-transclude instead.');}scope.$watch('headingElement',function updateHeadingElement(heading){if(heading){elm.html('');elm.append(heading);}});}};}]).directive('tabContentTransclude',['$log','$tabsSuppressWarning',function($log,$tabsSuppressWarning){return {restrict:'A',require:'^tabset',link:function link(scope,elm,attrs){if(!$tabsSuppressWarning){$log.warn('tab-content-transclude is now deprecated. Use uib-tab-content-transclude instead.');}var tab=scope.$eval(attrs.tabContentTransclude); //Now our tab is ready to be transcluded: both the tab heading area
//and the tab content area are loaded.  Transclude 'em both.
tab.$transcludeFn(tab.$parent,function(contents){angular.forEach(contents,function(node){if(isTabHeading(node)){ //Let tabHeadingTransclude know.
tab.headingElement = node;}else {elm.append(node);}});});}};function isTabHeading(node){return node.tagName && (node.hasAttribute('tab-heading') || node.hasAttribute('data-tab-heading') || node.hasAttribute('x-tab-heading') || node.tagName.toLowerCase() === 'tab-heading' || node.tagName.toLowerCase() === 'data-tab-heading' || node.tagName.toLowerCase() === 'x-tab-heading');}}]);angular.module('ui.bootstrap.timepicker',[]).constant('uibTimepickerConfig',{hourStep:1,minuteStep:1,showMeridian:true,meridians:null,readonlyInput:false,mousewheel:true,arrowkeys:true,showSpinners:true}).controller('UibTimepickerController',['$scope','$element','$attrs','$parse','$log','$locale','uibTimepickerConfig',function($scope,$element,$attrs,$parse,$log,$locale,timepickerConfig){var selected=new Date(),ngModelCtrl={$setViewValue:angular.noop}, // nullModelCtrl
meridians=angular.isDefined($attrs.meridians)?$scope.$parent.$eval($attrs.meridians):timepickerConfig.meridians || $locale.DATETIME_FORMATS.AMPMS;$scope.tabindex = angular.isDefined($attrs.tabindex)?$attrs.tabindex:0;$element.removeAttr('tabindex');this.init = function(ngModelCtrl_,inputs){ngModelCtrl = ngModelCtrl_;ngModelCtrl.$render = this.render;ngModelCtrl.$formatters.unshift(function(modelValue){return modelValue?new Date(modelValue):null;});var hoursInputEl=inputs.eq(0),minutesInputEl=inputs.eq(1);var mousewheel=angular.isDefined($attrs.mousewheel)?$scope.$parent.$eval($attrs.mousewheel):timepickerConfig.mousewheel;if(mousewheel){this.setupMousewheelEvents(hoursInputEl,minutesInputEl);}var arrowkeys=angular.isDefined($attrs.arrowkeys)?$scope.$parent.$eval($attrs.arrowkeys):timepickerConfig.arrowkeys;if(arrowkeys){this.setupArrowkeyEvents(hoursInputEl,minutesInputEl);}$scope.readonlyInput = angular.isDefined($attrs.readonlyInput)?$scope.$parent.$eval($attrs.readonlyInput):timepickerConfig.readonlyInput;this.setupInputEvents(hoursInputEl,minutesInputEl);};var hourStep=timepickerConfig.hourStep;if($attrs.hourStep){$scope.$parent.$watch($parse($attrs.hourStep),function(value){hourStep = parseInt(value,10);});}var minuteStep=timepickerConfig.minuteStep;if($attrs.minuteStep){$scope.$parent.$watch($parse($attrs.minuteStep),function(value){minuteStep = parseInt(value,10);});}var min;$scope.$parent.$watch($parse($attrs.min),function(value){var dt=new Date(value);min = isNaN(dt)?undefined:dt;});var max;$scope.$parent.$watch($parse($attrs.max),function(value){var dt=new Date(value);max = isNaN(dt)?undefined:dt;});$scope.noIncrementHours = function(){var incrementedSelected=addMinutes(selected,hourStep * 60);return incrementedSelected > max || incrementedSelected < selected && incrementedSelected < min;};$scope.noDecrementHours = function(){var decrementedSelected=addMinutes(selected,-hourStep * 60);return decrementedSelected < min || decrementedSelected > selected && decrementedSelected > max;};$scope.noIncrementMinutes = function(){var incrementedSelected=addMinutes(selected,minuteStep);return incrementedSelected > max || incrementedSelected < selected && incrementedSelected < min;};$scope.noDecrementMinutes = function(){var decrementedSelected=addMinutes(selected,-minuteStep);return decrementedSelected < min || decrementedSelected > selected && decrementedSelected > max;};$scope.noToggleMeridian = function(){if(selected.getHours() < 13){return addMinutes(selected,12 * 60) > max;}else {return addMinutes(selected,-12 * 60) < min;}}; // 12H / 24H mode
$scope.showMeridian = timepickerConfig.showMeridian;if($attrs.showMeridian){$scope.$parent.$watch($parse($attrs.showMeridian),function(value){$scope.showMeridian = !!value;if(ngModelCtrl.$error.time){ // Evaluate from template
var hours=getHoursFromTemplate(),minutes=getMinutesFromTemplate();if(angular.isDefined(hours) && angular.isDefined(minutes)){selected.setHours(hours);refresh();}}else {updateTemplate();}});} // Get $scope.hours in 24H mode if valid
function getHoursFromTemplate(){var hours=parseInt($scope.hours,10);var valid=$scope.showMeridian?hours > 0 && hours < 13:hours >= 0 && hours < 24;if(!valid){return undefined;}if($scope.showMeridian){if(hours === 12){hours = 0;}if($scope.meridian === meridians[1]){hours = hours + 12;}}return hours;}function getMinutesFromTemplate(){var minutes=parseInt($scope.minutes,10);return minutes >= 0 && minutes < 60?minutes:undefined;}function pad(value){return angular.isDefined(value) && value.toString().length < 2?'0' + value:value.toString();} // Respond on mousewheel spin
this.setupMousewheelEvents = function(hoursInputEl,minutesInputEl){var isScrollingUp=function isScrollingUp(e){if(e.originalEvent){e = e.originalEvent;} //pick correct delta variable depending on event
var delta=e.wheelDelta?e.wheelDelta:-e.deltaY;return e.detail || delta > 0;};hoursInputEl.bind('mousewheel wheel',function(e){$scope.$apply(isScrollingUp(e)?$scope.incrementHours():$scope.decrementHours());e.preventDefault();});minutesInputEl.bind('mousewheel wheel',function(e){$scope.$apply(isScrollingUp(e)?$scope.incrementMinutes():$scope.decrementMinutes());e.preventDefault();});}; // Respond on up/down arrowkeys
this.setupArrowkeyEvents = function(hoursInputEl,minutesInputEl){hoursInputEl.bind('keydown',function(e){if(e.which === 38){ // up
e.preventDefault();$scope.incrementHours();$scope.$apply();}else if(e.which === 40){ // down
e.preventDefault();$scope.decrementHours();$scope.$apply();}});minutesInputEl.bind('keydown',function(e){if(e.which === 38){ // up
e.preventDefault();$scope.incrementMinutes();$scope.$apply();}else if(e.which === 40){ // down
e.preventDefault();$scope.decrementMinutes();$scope.$apply();}});};this.setupInputEvents = function(hoursInputEl,minutesInputEl){if($scope.readonlyInput){$scope.updateHours = angular.noop;$scope.updateMinutes = angular.noop;return;}var invalidate=function invalidate(invalidHours,invalidMinutes){ngModelCtrl.$setViewValue(null);ngModelCtrl.$setValidity('time',false);if(angular.isDefined(invalidHours)){$scope.invalidHours = invalidHours;}if(angular.isDefined(invalidMinutes)){$scope.invalidMinutes = invalidMinutes;}};$scope.updateHours = function(){var hours=getHoursFromTemplate(),minutes=getMinutesFromTemplate();if(angular.isDefined(hours) && angular.isDefined(minutes)){selected.setHours(hours);if(selected < min || selected > max){invalidate(true);}else {refresh('h');}}else {invalidate(true);}};hoursInputEl.bind('blur',function(e){if(!$scope.invalidHours && $scope.hours < 10){$scope.$apply(function(){$scope.hours = pad($scope.hours);});}});$scope.updateMinutes = function(){var minutes=getMinutesFromTemplate(),hours=getHoursFromTemplate();if(angular.isDefined(minutes) && angular.isDefined(hours)){selected.setMinutes(minutes);if(selected < min || selected > max){invalidate(undefined,true);}else {refresh('m');}}else {invalidate(undefined,true);}};minutesInputEl.bind('blur',function(e){if(!$scope.invalidMinutes && $scope.minutes < 10){$scope.$apply(function(){$scope.minutes = pad($scope.minutes);});}});};this.render = function(){var date=ngModelCtrl.$viewValue;if(isNaN(date)){ngModelCtrl.$setValidity('time',false);$log.error('Timepicker directive: "ng-model" value must be a Date object, a number of milliseconds since 01.01.1970 or a string representing an RFC2822 or ISO 8601 date.');}else {if(date){selected = date;}if(selected < min || selected > max){ngModelCtrl.$setValidity('time',false);$scope.invalidHours = true;$scope.invalidMinutes = true;}else {makeValid();}updateTemplate();}}; // Call internally when we know that model is valid.
function refresh(keyboardChange){makeValid();ngModelCtrl.$setViewValue(new Date(selected));updateTemplate(keyboardChange);}function makeValid(){ngModelCtrl.$setValidity('time',true);$scope.invalidHours = false;$scope.invalidMinutes = false;}function updateTemplate(keyboardChange){var hours=selected.getHours(),minutes=selected.getMinutes();if($scope.showMeridian){hours = hours === 0 || hours === 12?12:hours % 12; // Convert 24 to 12 hour system
}$scope.hours = keyboardChange === 'h'?hours:pad(hours);if(keyboardChange !== 'm'){$scope.minutes = pad(minutes);}$scope.meridian = selected.getHours() < 12?meridians[0]:meridians[1];}function addMinutes(date,minutes){var dt=new Date(date.getTime() + minutes * 60000);var newDate=new Date(date);newDate.setHours(dt.getHours(),dt.getMinutes());return newDate;}function addMinutesToSelected(minutes){selected = addMinutes(selected,minutes);refresh();}$scope.showSpinners = angular.isDefined($attrs.showSpinners)?$scope.$parent.$eval($attrs.showSpinners):timepickerConfig.showSpinners;$scope.incrementHours = function(){if(!$scope.noIncrementHours()){addMinutesToSelected(hourStep * 60);}};$scope.decrementHours = function(){if(!$scope.noDecrementHours()){addMinutesToSelected(-hourStep * 60);}};$scope.incrementMinutes = function(){if(!$scope.noIncrementMinutes()){addMinutesToSelected(minuteStep);}};$scope.decrementMinutes = function(){if(!$scope.noDecrementMinutes()){addMinutesToSelected(-minuteStep);}};$scope.toggleMeridian = function(){if(!$scope.noToggleMeridian()){addMinutesToSelected(12 * 60 * (selected.getHours() < 12?1:-1));}};}]).directive('uibTimepicker',function(){return {restrict:'EA',require:['uibTimepicker','?^ngModel'],controller:'UibTimepickerController',controllerAs:'timepicker',replace:true,scope:{},templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/timepicker/timepicker.html';},link:function link(scope,element,attrs,ctrls){var timepickerCtrl=ctrls[0],ngModelCtrl=ctrls[1];if(ngModelCtrl){timepickerCtrl.init(ngModelCtrl,element.find('input'));}}};}); /* Deprecated timepicker below */angular.module('ui.bootstrap.timepicker').value('$timepickerSuppressWarning',false).controller('TimepickerController',['$scope','$element','$attrs','$controller','$log','$timepickerSuppressWarning',function($scope,$element,$attrs,$controller,$log,$timepickerSuppressWarning){if(!$timepickerSuppressWarning){$log.warn('TimepickerController is now deprecated. Use UibTimepickerController instead.');}angular.extend(this,$controller('UibTimepickerController',{$scope:$scope,$element:$element,$attrs:$attrs}));}]).directive('timepicker',['$log','$timepickerSuppressWarning',function($log,$timepickerSuppressWarning){return {restrict:'EA',require:['timepicker','?^ngModel'],controller:'TimepickerController',controllerAs:'timepicker',replace:true,scope:{},templateUrl:function templateUrl(element,attrs){return attrs.templateUrl || 'template/timepicker/timepicker.html';},link:function link(scope,element,attrs,ctrls){if(!$timepickerSuppressWarning){$log.warn('timepicker is now deprecated. Use uib-timepicker instead.');}var timepickerCtrl=ctrls[0],ngModelCtrl=ctrls[1];if(ngModelCtrl){timepickerCtrl.init(ngModelCtrl,element.find('input'));}}};}]);angular.module('ui.bootstrap.typeahead',['ui.bootstrap.position']) /**
 * A helper service that can parse typeahead's syntax (string provided by users)
 * Extracted to a separate service for ease of unit testing
 */.factory('uibTypeaheadParser',['$parse',function($parse){ //                      00000111000000000000022200000000000000003333333333333330000000000044000
var TYPEAHEAD_REGEXP=/^\s*([\s\S]+?)(?:\s+as\s+([\s\S]+?))?\s+for\s+(?:([\$\w][\$\w\d]*))\s+in\s+([\s\S]+?)$/;return {parse:function parse(input){var match=input.match(TYPEAHEAD_REGEXP);if(!match){throw new Error('Expected typeahead specification in form of "_modelValue_ (as _label_)? for _item_ in _collection_"' + ' but got "' + input + '".');}return {itemName:match[3],source:$parse(match[4]),viewMapper:$parse(match[2] || match[1]),modelMapper:$parse(match[1])};}};}]).controller('UibTypeaheadController',['$scope','$element','$attrs','$compile','$parse','$q','$timeout','$document','$window','$rootScope','$uibPosition','uibTypeaheadParser',function(originalScope,element,attrs,$compile,$parse,$q,$timeout,$document,$window,$rootScope,$position,typeaheadParser){var HOT_KEYS=[9,13,27,38,40];var eventDebounceTime=200;var modelCtrl,ngModelOptions; //SUPPORTED ATTRIBUTES (OPTIONS)
//minimal no of characters that needs to be entered before typeahead kicks-in
var minLength=originalScope.$eval(attrs.typeaheadMinLength);if(!minLength && minLength !== 0){minLength = 1;} //minimal wait time after last character typed before typeahead kicks-in
var waitTime=originalScope.$eval(attrs.typeaheadWaitMs) || 0; //should it restrict model values to the ones selected from the popup only?
var isEditable=originalScope.$eval(attrs.typeaheadEditable) !== false; //binding to a variable that indicates if matches are being retrieved asynchronously
var isLoadingSetter=$parse(attrs.typeaheadLoading).assign || angular.noop; //a callback executed when a match is selected
var onSelectCallback=$parse(attrs.typeaheadOnSelect); //should it select highlighted popup value when losing focus?
var isSelectOnBlur=angular.isDefined(attrs.typeaheadSelectOnBlur)?originalScope.$eval(attrs.typeaheadSelectOnBlur):false; //binding to a variable that indicates if there were no results after the query is completed
var isNoResultsSetter=$parse(attrs.typeaheadNoResults).assign || angular.noop;var inputFormatter=attrs.typeaheadInputFormatter?$parse(attrs.typeaheadInputFormatter):undefined;var appendToBody=attrs.typeaheadAppendToBody?originalScope.$eval(attrs.typeaheadAppendToBody):false;var appendToElementId=attrs.typeaheadAppendToElementId || false;var focusFirst=originalScope.$eval(attrs.typeaheadFocusFirst) !== false; //If input matches an item of the list exactly, select it automatically
var selectOnExact=attrs.typeaheadSelectOnExact?originalScope.$eval(attrs.typeaheadSelectOnExact):false; //INTERNAL VARIABLES
//model setter executed upon match selection
var parsedModel=$parse(attrs.ngModel);var invokeModelSetter=$parse(attrs.ngModel + '($$$p)');var $setModelValue=function $setModelValue(scope,newValue){if(angular.isFunction(parsedModel(originalScope)) && ngModelOptions && ngModelOptions.$options && ngModelOptions.$options.getterSetter){return invokeModelSetter(scope,{$$$p:newValue});}else {return parsedModel.assign(scope,newValue);}}; //expressions used by typeahead
var parserResult=typeaheadParser.parse(attrs.uibTypeahead);var hasFocus; //Used to avoid bug in iOS webview where iOS keyboard does not fire
//mousedown & mouseup events
//Issue #3699
var selected; //create a child scope for the typeahead directive so we are not polluting original scope
//with typeahead-specific data (matches, query etc.)
var scope=originalScope.$new();var offDestroy=originalScope.$on('$destroy',function(){scope.$destroy();});scope.$on('$destroy',offDestroy); // WAI-ARIA
var popupId='typeahead-' + scope.$id + '-' + Math.floor(Math.random() * 10000);element.attr({'aria-autocomplete':'list','aria-expanded':false,'aria-owns':popupId}); //pop-up element used to display matches
var popUpEl=angular.element('<div uib-typeahead-popup></div>');popUpEl.attr({id:popupId,matches:'matches',active:'activeIdx',select:'select(activeIdx)','move-in-progress':'moveInProgress',query:'query',position:'position'}); //custom item template
if(angular.isDefined(attrs.typeaheadTemplateUrl)){popUpEl.attr('template-url',attrs.typeaheadTemplateUrl);}if(angular.isDefined(attrs.typeaheadPopupTemplateUrl)){popUpEl.attr('popup-template-url',attrs.typeaheadPopupTemplateUrl);}var resetMatches=function resetMatches(){scope.matches = [];scope.activeIdx = -1;element.attr('aria-expanded',false);};var getMatchId=function getMatchId(index){return popupId + '-option-' + index;}; // Indicate that the specified match is the active (pre-selected) item in the list owned by this typeahead.
// This attribute is added or removed automatically when the `activeIdx` changes.
scope.$watch('activeIdx',function(index){if(index < 0){element.removeAttr('aria-activedescendant');}else {element.attr('aria-activedescendant',getMatchId(index));}});var inputIsExactMatch=function inputIsExactMatch(inputValue,index){if(scope.matches.length > index && inputValue){return inputValue.toUpperCase() === scope.matches[index].label.toUpperCase();}return false;};var getMatchesAsync=function getMatchesAsync(inputValue){var locals={$viewValue:inputValue};isLoadingSetter(originalScope,true);isNoResultsSetter(originalScope,false);$q.when(parserResult.source(originalScope,locals)).then(function(matches){ //it might happen that several async queries were in progress if a user were typing fast
//but we are interested only in responses that correspond to the current view value
var onCurrentRequest=inputValue === modelCtrl.$viewValue;if(onCurrentRequest && hasFocus){if(matches && matches.length > 0){scope.activeIdx = focusFirst?0:-1;isNoResultsSetter(originalScope,false);scope.matches.length = 0; //transform labels
for(var i=0;i < matches.length;i++) {locals[parserResult.itemName] = matches[i];scope.matches.push({id:getMatchId(i),label:parserResult.viewMapper(scope,locals),model:matches[i]});}scope.query = inputValue; //position pop-up with matches - we need to re-calculate its position each time we are opening a window
//with matches as a pop-up might be absolute-positioned and position of an input might have changed on a page
//due to other elements being rendered
recalculatePosition();element.attr('aria-expanded',true); //Select the single remaining option if user input matches
if(selectOnExact && scope.matches.length === 1 && inputIsExactMatch(inputValue,0)){scope.select(0);}}else {resetMatches();isNoResultsSetter(originalScope,true);}}if(onCurrentRequest){isLoadingSetter(originalScope,false);}},function(){resetMatches();isLoadingSetter(originalScope,false);isNoResultsSetter(originalScope,true);});}; // bind events only if appendToBody params exist - performance feature
if(appendToBody){angular.element($window).bind('resize',fireRecalculating);$document.find('body').bind('scroll',fireRecalculating);} // Declare the timeout promise var outside the function scope so that stacked calls can be cancelled later
var timeoutEventPromise; // Default progress type
scope.moveInProgress = false;function fireRecalculating(){if(!scope.moveInProgress){scope.moveInProgress = true;scope.$digest();} // Cancel previous timeout
if(timeoutEventPromise){$timeout.cancel(timeoutEventPromise);} // Debounced executing recalculate after events fired
timeoutEventPromise = $timeout(function(){ // if popup is visible
if(scope.matches.length){recalculatePosition();}scope.moveInProgress = false;},eventDebounceTime);} // recalculate actual position and set new values to scope
// after digest loop is popup in right position
function recalculatePosition(){scope.position = appendToBody?$position.offset(element):$position.position(element);scope.position.top += element.prop('offsetHeight');} //we need to propagate user's query so we can higlight matches
scope.query = undefined; //Declare the timeout promise var outside the function scope so that stacked calls can be cancelled later
var timeoutPromise;var scheduleSearchWithTimeout=function scheduleSearchWithTimeout(inputValue){timeoutPromise = $timeout(function(){getMatchesAsync(inputValue);},waitTime);};var cancelPreviousTimeout=function cancelPreviousTimeout(){if(timeoutPromise){$timeout.cancel(timeoutPromise);}};resetMatches();scope.select = function(activeIdx){ //called from within the $digest() cycle
var locals={};var model,item;selected = true;locals[parserResult.itemName] = item = scope.matches[activeIdx].model;model = parserResult.modelMapper(originalScope,locals);$setModelValue(originalScope,model);modelCtrl.$setValidity('editable',true);modelCtrl.$setValidity('parse',true);onSelectCallback(originalScope,{$item:item,$model:model,$label:parserResult.viewMapper(originalScope,locals)});resetMatches(); //return focus to the input element if a match was selected via a mouse click event
// use timeout to avoid $rootScope:inprog error
if(scope.$eval(attrs.typeaheadFocusOnSelect) !== false){$timeout(function(){element[0].focus();},0,false);}}; //bind keyboard events: arrows up(38) / down(40), enter(13) and tab(9), esc(27)
element.bind('keydown',function(evt){ //typeahead is open and an "interesting" key was pressed
if(scope.matches.length === 0 || HOT_KEYS.indexOf(evt.which) === -1){return;} // if there's nothing selected (i.e. focusFirst) and enter or tab is hit, clear the results
if(scope.activeIdx === -1 && (evt.which === 9 || evt.which === 13)){resetMatches();scope.$digest();return;}evt.preventDefault();if(evt.which === 40){scope.activeIdx = (scope.activeIdx + 1) % scope.matches.length;scope.$digest();}else if(evt.which === 38){scope.activeIdx = (scope.activeIdx > 0?scope.activeIdx:scope.matches.length) - 1;scope.$digest();}else if(evt.which === 13 || evt.which === 9){scope.$apply(function(){scope.select(scope.activeIdx);});}else if(evt.which === 27){evt.stopPropagation();resetMatches();scope.$digest();}});element.bind('blur',function(){if(isSelectOnBlur && scope.matches.length && scope.activeIdx !== -1 && !selected){selected = true;scope.$apply(function(){scope.select(scope.activeIdx);});}hasFocus = false;selected = false;}); // Keep reference to click handler to unbind it.
var dismissClickHandler=function dismissClickHandler(evt){ // Issue #3973
// Firefox treats right click as a click on document
if(element[0] !== evt.target && evt.which !== 3 && scope.matches.length !== 0){resetMatches();if(!$rootScope.$$phase){scope.$digest();}}};$document.bind('click',dismissClickHandler);originalScope.$on('$destroy',function(){$document.unbind('click',dismissClickHandler);if(appendToBody || appendToElementId){$popup.remove();}if(appendToBody){angular.element($window).unbind('resize',fireRecalculating);$document.find('body').unbind('scroll',fireRecalculating);} // Prevent jQuery cache memory leak
popUpEl.remove();});var $popup=$compile(popUpEl)(scope);if(appendToBody){$document.find('body').append($popup);}else if(appendToElementId !== false){angular.element($document[0].getElementById(appendToElementId)).append($popup);}else {element.after($popup);}this.init = function(_modelCtrl,_ngModelOptions){modelCtrl = _modelCtrl;ngModelOptions = _ngModelOptions; //plug into $parsers pipeline to open a typeahead on view changes initiated from DOM
//$parsers kick-in on all the changes coming from the view as well as manually triggered by $setViewValue
modelCtrl.$parsers.unshift(function(inputValue){hasFocus = true;if(minLength === 0 || inputValue && inputValue.length >= minLength){if(waitTime > 0){cancelPreviousTimeout();scheduleSearchWithTimeout(inputValue);}else {getMatchesAsync(inputValue);}}else {isLoadingSetter(originalScope,false);cancelPreviousTimeout();resetMatches();}if(isEditable){return inputValue;}else {if(!inputValue){ // Reset in case user had typed something previously.
modelCtrl.$setValidity('editable',true);return null;}else {modelCtrl.$setValidity('editable',false);return undefined;}}});modelCtrl.$formatters.push(function(modelValue){var candidateViewValue,emptyViewValue;var locals={}; // The validity may be set to false via $parsers (see above) if
// the model is restricted to selected values. If the model
// is set manually it is considered to be valid.
if(!isEditable){modelCtrl.$setValidity('editable',true);}if(inputFormatter){locals.$model = modelValue;return inputFormatter(originalScope,locals);}else { //it might happen that we don't have enough info to properly render input value
//we need to check for this situation and simply return model value if we can't apply custom formatting
locals[parserResult.itemName] = modelValue;candidateViewValue = parserResult.viewMapper(originalScope,locals);locals[parserResult.itemName] = undefined;emptyViewValue = parserResult.viewMapper(originalScope,locals);return candidateViewValue !== emptyViewValue?candidateViewValue:modelValue;}});};}]).directive('uibTypeahead',function(){return {controller:'UibTypeaheadController',require:['ngModel','^?ngModelOptions','uibTypeahead'],link:function link(originalScope,element,attrs,ctrls){ctrls[2].init(ctrls[0],ctrls[1]);}};}).directive('uibTypeaheadPopup',function(){return {scope:{matches:'=',query:'=',active:'=',position:'&',moveInProgress:'=',select:'&'},replace:true,templateUrl:function templateUrl(element,attrs){return attrs.popupTemplateUrl || 'template/typeahead/typeahead-popup.html';},link:function link(scope,element,attrs){scope.templateUrl = attrs.templateUrl;scope.isOpen = function(){return scope.matches.length > 0;};scope.isActive = function(matchIdx){return scope.active == matchIdx;};scope.selectActive = function(matchIdx){scope.active = matchIdx;};scope.selectMatch = function(activeIdx){scope.select({activeIdx:activeIdx});};}};}).directive('uibTypeaheadMatch',['$templateRequest','$compile','$parse',function($templateRequest,$compile,$parse){return {scope:{index:'=',match:'=',query:'='},link:function link(scope,element,attrs){var tplUrl=$parse(attrs.templateUrl)(scope.$parent) || 'template/typeahead/typeahead-match.html';$templateRequest(tplUrl).then(function(tplContent){$compile(tplContent.trim())(scope,function(clonedElement){element.replaceWith(clonedElement);});});}};}]).filter('uibTypeaheadHighlight',['$sce','$injector','$log',function($sce,$injector,$log){var isSanitizePresent;isSanitizePresent = $injector.has('$sanitize');function escapeRegexp(queryToEscape){ // Regex: capture the whole query string and replace it with the string that will be used to match
// the results, for example if the capture is "a" the result will be \a
return queryToEscape.replace(/([.?*+^$[\]\\(){}|-])/g,'\\$1');}function containsHtml(matchItem){return (/<.*>/g.test(matchItem));}return function(matchItem,query){if(!isSanitizePresent && containsHtml(matchItem)){$log.warn('Unsafe use of typeahead please use ngSanitize'); // Warn the user about the danger
}matchItem = query?('' + matchItem).replace(new RegExp(escapeRegexp(query),'gi'),'<strong>$&</strong>'):matchItem; // Replaces the capture string with a the same string inside of a "strong" tag
if(!isSanitizePresent){matchItem = $sce.trustAsHtml(matchItem); // If $sanitize is not present we pack the string in a $sce object for the ng-bind-html directive
}return matchItem;};}]); /* Deprecated typeahead below */angular.module('ui.bootstrap.typeahead').value('$typeaheadSuppressWarning',false).service('typeaheadParser',['$parse','uibTypeaheadParser','$log','$typeaheadSuppressWarning',function($parse,uibTypeaheadParser,$log,$typeaheadSuppressWarning){if(!$typeaheadSuppressWarning){$log.warn('typeaheadParser is now deprecated. Use uibTypeaheadParser instead.');}return uibTypeaheadParser;}]).directive('typeahead',['$compile','$parse','$q','$timeout','$document','$window','$rootScope','$uibPosition','typeaheadParser','$log','$typeaheadSuppressWarning',function($compile,$parse,$q,$timeout,$document,$window,$rootScope,$position,typeaheadParser,$log,$typeaheadSuppressWarning){var HOT_KEYS=[9,13,27,38,40];var eventDebounceTime=200;return {require:['ngModel','^?ngModelOptions'],link:function link(originalScope,element,attrs,ctrls){if(!$typeaheadSuppressWarning){$log.warn('typeahead is now deprecated. Use uib-typeahead instead.');}var modelCtrl=ctrls[0];var ngModelOptions=ctrls[1]; //SUPPORTED ATTRIBUTES (OPTIONS)
//minimal no of characters that needs to be entered before typeahead kicks-in
var minLength=originalScope.$eval(attrs.typeaheadMinLength);if(!minLength && minLength !== 0){minLength = 1;} //minimal wait time after last character typed before typeahead kicks-in
var waitTime=originalScope.$eval(attrs.typeaheadWaitMs) || 0; //should it restrict model values to the ones selected from the popup only?
var isEditable=originalScope.$eval(attrs.typeaheadEditable) !== false; //binding to a variable that indicates if matches are being retrieved asynchronously
var isLoadingSetter=$parse(attrs.typeaheadLoading).assign || angular.noop; //a callback executed when a match is selected
var onSelectCallback=$parse(attrs.typeaheadOnSelect); //should it select highlighted popup value when losing focus?
var isSelectOnBlur=angular.isDefined(attrs.typeaheadSelectOnBlur)?originalScope.$eval(attrs.typeaheadSelectOnBlur):false; //binding to a variable that indicates if there were no results after the query is completed
var isNoResultsSetter=$parse(attrs.typeaheadNoResults).assign || angular.noop;var inputFormatter=attrs.typeaheadInputFormatter?$parse(attrs.typeaheadInputFormatter):undefined;var appendToBody=attrs.typeaheadAppendToBody?originalScope.$eval(attrs.typeaheadAppendToBody):false;var appendToElementId=attrs.typeaheadAppendToElementId || false;var focusFirst=originalScope.$eval(attrs.typeaheadFocusFirst) !== false; //If input matches an item of the list exactly, select it automatically
var selectOnExact=attrs.typeaheadSelectOnExact?originalScope.$eval(attrs.typeaheadSelectOnExact):false; //INTERNAL VARIABLES
//model setter executed upon match selection
var parsedModel=$parse(attrs.ngModel);var invokeModelSetter=$parse(attrs.ngModel + '($$$p)');var $setModelValue=function $setModelValue(scope,newValue){if(angular.isFunction(parsedModel(originalScope)) && ngModelOptions && ngModelOptions.$options && ngModelOptions.$options.getterSetter){return invokeModelSetter(scope,{$$$p:newValue});}else {return parsedModel.assign(scope,newValue);}}; //expressions used by typeahead
var parserResult=typeaheadParser.parse(attrs.typeahead);var hasFocus; //Used to avoid bug in iOS webview where iOS keyboard does not fire
//mousedown & mouseup events
//Issue #3699
var selected; //create a child scope for the typeahead directive so we are not polluting original scope
//with typeahead-specific data (matches, query etc.)
var scope=originalScope.$new();var offDestroy=originalScope.$on('$destroy',function(){scope.$destroy();});scope.$on('$destroy',offDestroy); // WAI-ARIA
var popupId='typeahead-' + scope.$id + '-' + Math.floor(Math.random() * 10000);element.attr({'aria-autocomplete':'list','aria-expanded':false,'aria-owns':popupId}); //pop-up element used to display matches
var popUpEl=angular.element('<div typeahead-popup></div>');popUpEl.attr({id:popupId,matches:'matches',active:'activeIdx',select:'select(activeIdx)','move-in-progress':'moveInProgress',query:'query',position:'position'}); //custom item template
if(angular.isDefined(attrs.typeaheadTemplateUrl)){popUpEl.attr('template-url',attrs.typeaheadTemplateUrl);}if(angular.isDefined(attrs.typeaheadPopupTemplateUrl)){popUpEl.attr('popup-template-url',attrs.typeaheadPopupTemplateUrl);}var resetMatches=function resetMatches(){scope.matches = [];scope.activeIdx = -1;element.attr('aria-expanded',false);};var getMatchId=function getMatchId(index){return popupId + '-option-' + index;}; // Indicate that the specified match is the active (pre-selected) item in the list owned by this typeahead.
// This attribute is added or removed automatically when the `activeIdx` changes.
scope.$watch('activeIdx',function(index){if(index < 0){element.removeAttr('aria-activedescendant');}else {element.attr('aria-activedescendant',getMatchId(index));}});var inputIsExactMatch=function inputIsExactMatch(inputValue,index){if(scope.matches.length > index && inputValue){return inputValue.toUpperCase() === scope.matches[index].label.toUpperCase();}return false;};var getMatchesAsync=function getMatchesAsync(inputValue){var locals={$viewValue:inputValue};isLoadingSetter(originalScope,true);isNoResultsSetter(originalScope,false);$q.when(parserResult.source(originalScope,locals)).then(function(matches){ //it might happen that several async queries were in progress if a user were typing fast
//but we are interested only in responses that correspond to the current view value
var onCurrentRequest=inputValue === modelCtrl.$viewValue;if(onCurrentRequest && hasFocus){if(matches && matches.length > 0){scope.activeIdx = focusFirst?0:-1;isNoResultsSetter(originalScope,false);scope.matches.length = 0; //transform labels
for(var i=0;i < matches.length;i++) {locals[parserResult.itemName] = matches[i];scope.matches.push({id:getMatchId(i),label:parserResult.viewMapper(scope,locals),model:matches[i]});}scope.query = inputValue; //position pop-up with matches - we need to re-calculate its position each time we are opening a window
//with matches as a pop-up might be absolute-positioned and position of an input might have changed on a page
//due to other elements being rendered
recalculatePosition();element.attr('aria-expanded',true); //Select the single remaining option if user input matches
if(selectOnExact && scope.matches.length === 1 && inputIsExactMatch(inputValue,0)){scope.select(0);}}else {resetMatches();isNoResultsSetter(originalScope,true);}}if(onCurrentRequest){isLoadingSetter(originalScope,false);}},function(){resetMatches();isLoadingSetter(originalScope,false);isNoResultsSetter(originalScope,true);});}; // bind events only if appendToBody params exist - performance feature
if(appendToBody){angular.element($window).bind('resize',fireRecalculating);$document.find('body').bind('scroll',fireRecalculating);} // Declare the timeout promise var outside the function scope so that stacked calls can be cancelled later
var timeoutEventPromise; // Default progress type
scope.moveInProgress = false;function fireRecalculating(){if(!scope.moveInProgress){scope.moveInProgress = true;scope.$digest();} // Cancel previous timeout
if(timeoutEventPromise){$timeout.cancel(timeoutEventPromise);} // Debounced executing recalculate after events fired
timeoutEventPromise = $timeout(function(){ // if popup is visible
if(scope.matches.length){recalculatePosition();}scope.moveInProgress = false;},eventDebounceTime);} // recalculate actual position and set new values to scope
// after digest loop is popup in right position
function recalculatePosition(){scope.position = appendToBody?$position.offset(element):$position.position(element);scope.position.top += element.prop('offsetHeight');}resetMatches(); //we need to propagate user's query so we can higlight matches
scope.query = undefined; //Declare the timeout promise var outside the function scope so that stacked calls can be cancelled later
var timeoutPromise;var scheduleSearchWithTimeout=function scheduleSearchWithTimeout(inputValue){timeoutPromise = $timeout(function(){getMatchesAsync(inputValue);},waitTime);};var cancelPreviousTimeout=function cancelPreviousTimeout(){if(timeoutPromise){$timeout.cancel(timeoutPromise);}}; //plug into $parsers pipeline to open a typeahead on view changes initiated from DOM
//$parsers kick-in on all the changes coming from the view as well as manually triggered by $setViewValue
modelCtrl.$parsers.unshift(function(inputValue){hasFocus = true;if(minLength === 0 || inputValue && inputValue.length >= minLength){if(waitTime > 0){cancelPreviousTimeout();scheduleSearchWithTimeout(inputValue);}else {getMatchesAsync(inputValue);}}else {isLoadingSetter(originalScope,false);cancelPreviousTimeout();resetMatches();}if(isEditable){return inputValue;}else {if(!inputValue){ // Reset in case user had typed something previously.
modelCtrl.$setValidity('editable',true);return null;}else {modelCtrl.$setValidity('editable',false);return undefined;}}});modelCtrl.$formatters.push(function(modelValue){var candidateViewValue,emptyViewValue;var locals={}; // The validity may be set to false via $parsers (see above) if
// the model is restricted to selected values. If the model
// is set manually it is considered to be valid.
if(!isEditable){modelCtrl.$setValidity('editable',true);}if(inputFormatter){locals.$model = modelValue;return inputFormatter(originalScope,locals);}else { //it might happen that we don't have enough info to properly render input value
//we need to check for this situation and simply return model value if we can't apply custom formatting
locals[parserResult.itemName] = modelValue;candidateViewValue = parserResult.viewMapper(originalScope,locals);locals[parserResult.itemName] = undefined;emptyViewValue = parserResult.viewMapper(originalScope,locals);return candidateViewValue !== emptyViewValue?candidateViewValue:modelValue;}});scope.select = function(activeIdx){ //called from within the $digest() cycle
var locals={};var model,item;selected = true;locals[parserResult.itemName] = item = scope.matches[activeIdx].model;model = parserResult.modelMapper(originalScope,locals);$setModelValue(originalScope,model);modelCtrl.$setValidity('editable',true);modelCtrl.$setValidity('parse',true);onSelectCallback(originalScope,{$item:item,$model:model,$label:parserResult.viewMapper(originalScope,locals)});resetMatches(); //return focus to the input element if a match was selected via a mouse click event
// use timeout to avoid $rootScope:inprog error
if(scope.$eval(attrs.typeaheadFocusOnSelect) !== false){$timeout(function(){element[0].focus();},0,false);}}; //bind keyboard events: arrows up(38) / down(40), enter(13) and tab(9), esc(27)
element.bind('keydown',function(evt){ //typeahead is open and an "interesting" key was pressed
if(scope.matches.length === 0 || HOT_KEYS.indexOf(evt.which) === -1){return;} // if there's nothing selected (i.e. focusFirst) and enter or tab is hit, clear the results
if(scope.activeIdx === -1 && (evt.which === 9 || evt.which === 13)){resetMatches();scope.$digest();return;}evt.preventDefault();if(evt.which === 40){scope.activeIdx = (scope.activeIdx + 1) % scope.matches.length;scope.$digest();}else if(evt.which === 38){scope.activeIdx = (scope.activeIdx > 0?scope.activeIdx:scope.matches.length) - 1;scope.$digest();}else if(evt.which === 13 || evt.which === 9){scope.$apply(function(){scope.select(scope.activeIdx);});}else if(evt.which === 27){evt.stopPropagation();resetMatches();scope.$digest();}});element.bind('blur',function(){if(isSelectOnBlur && scope.matches.length && scope.activeIdx !== -1 && !selected){selected = true;scope.$apply(function(){scope.select(scope.activeIdx);});}hasFocus = false;selected = false;}); // Keep reference to click handler to unbind it.
var dismissClickHandler=function dismissClickHandler(evt){ // Issue #3973
// Firefox treats right click as a click on document
if(element[0] !== evt.target && evt.which !== 3 && scope.matches.length !== 0){resetMatches();if(!$rootScope.$$phase){scope.$digest();}}};$document.bind('click',dismissClickHandler);originalScope.$on('$destroy',function(){$document.unbind('click',dismissClickHandler);if(appendToBody || appendToElementId){$popup.remove();}if(appendToBody){angular.element($window).unbind('resize',fireRecalculating);$document.find('body').unbind('scroll',fireRecalculating);} // Prevent jQuery cache memory leak
popUpEl.remove();});var $popup=$compile(popUpEl)(scope);if(appendToBody){$document.find('body').append($popup);}else if(appendToElementId !== false){angular.element($document[0].getElementById(appendToElementId)).append($popup);}else {element.after($popup);}}};}]).directive('typeaheadPopup',['$typeaheadSuppressWarning','$log',function($typeaheadSuppressWarning,$log){return {scope:{matches:'=',query:'=',active:'=',position:'&',moveInProgress:'=',select:'&'},replace:true,templateUrl:function templateUrl(element,attrs){return attrs.popupTemplateUrl || 'template/typeahead/typeahead-popup.html';},link:function link(scope,element,attrs){if(!$typeaheadSuppressWarning){$log.warn('typeahead-popup is now deprecated. Use uib-typeahead-popup instead.');}scope.templateUrl = attrs.templateUrl;scope.isOpen = function(){return scope.matches.length > 0;};scope.isActive = function(matchIdx){return scope.active == matchIdx;};scope.selectActive = function(matchIdx){scope.active = matchIdx;};scope.selectMatch = function(activeIdx){scope.select({activeIdx:activeIdx});};}};}]).directive('typeaheadMatch',['$templateRequest','$compile','$parse','$typeaheadSuppressWarning','$log',function($templateRequest,$compile,$parse,$typeaheadSuppressWarning,$log){return {restrict:'EA',scope:{index:'=',match:'=',query:'='},link:function link(scope,element,attrs){if(!$typeaheadSuppressWarning){$log.warn('typeahead-match is now deprecated. Use uib-typeahead-match instead.');}var tplUrl=$parse(attrs.templateUrl)(scope.$parent) || 'template/typeahead/typeahead-match.html';$templateRequest(tplUrl).then(function(tplContent){$compile(tplContent.trim())(scope,function(clonedElement){element.replaceWith(clonedElement);});});}};}]).filter('typeaheadHighlight',['$sce','$injector','$log','$typeaheadSuppressWarning',function($sce,$injector,$log,$typeaheadSuppressWarning){var isSanitizePresent;isSanitizePresent = $injector.has('$sanitize');function escapeRegexp(queryToEscape){ // Regex: capture the whole query string and replace it with the string that will be used to match
// the results, for example if the capture is "a" the result will be \a
return queryToEscape.replace(/([.?*+^$[\]\\(){}|-])/g,'\\$1');}function containsHtml(matchItem){return (/<.*>/g.test(matchItem));}return function(matchItem,query){if(!$typeaheadSuppressWarning){$log.warn('typeaheadHighlight is now deprecated. Use uibTypeaheadHighlight instead.');}if(!isSanitizePresent && containsHtml(matchItem)){$log.warn('Unsafe use of typeahead please use ngSanitize'); // Warn the user about the danger
}matchItem = query?('' + matchItem).replace(new RegExp(escapeRegexp(query),'gi'),'<strong>$&</strong>'):matchItem; // Replaces the capture string with a the same string inside of a "strong" tag
if(!isSanitizePresent){matchItem = $sce.trustAsHtml(matchItem); // If $sanitize is not present we pack the string in a $sce object for the ng-bind-html directive
}return matchItem;};}]);angular.module("template/accordion/accordion-group.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/accordion/accordion-group.html","<div class=\"panel {{panelClass || 'panel-default'}}\">\n" + "  <div class=\"panel-heading\" ng-keypress=\"toggleOpen($event)\">\n" + "    <h4 class=\"panel-title\">\n" + "      <a href tabindex=\"0\" class=\"accordion-toggle\" ng-click=\"toggleOpen()\" uib-accordion-transclude=\"heading\"><span ng-class=\"{'text-muted': isDisabled}\">{{heading}}</span></a>\n" + "    </h4>\n" + "  </div>\n" + "  <div class=\"panel-collapse collapse\" uib-collapse=\"!isOpen\">\n" + "	  <div class=\"panel-body\" ng-transclude></div>\n" + "  </div>\n" + "</div>\n" + "");}]);angular.module("template/accordion/accordion.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/accordion/accordion.html","<div class=\"panel-group\" ng-transclude></div>");}]);angular.module("template/alert/alert.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/alert/alert.html","<div class=\"alert\" ng-class=\"['alert-' + (type || 'warning'), closeable ? 'alert-dismissible' : null]\" role=\"alert\">\n" + "    <button ng-show=\"closeable\" type=\"button\" class=\"close\" ng-click=\"close({$event: $event})\">\n" + "        <span aria-hidden=\"true\">&times;</span>\n" + "        <span class=\"sr-only\">Close</span>\n" + "    </button>\n" + "    <div ng-transclude></div>\n" + "</div>\n" + "");}]);angular.module("template/carousel/carousel.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/carousel/carousel.html","<div ng-mouseenter=\"pause()\" ng-mouseleave=\"play()\" class=\"carousel\" ng-swipe-right=\"prev()\" ng-swipe-left=\"next()\">\n" + "  <div class=\"carousel-inner\" ng-transclude></div>\n" + "  <a role=\"button\" href class=\"left carousel-control\" ng-click=\"prev()\" ng-show=\"slides.length > 1\">\n" + "    <span aria-hidden=\"true\" class=\"glyphicon glyphicon-chevron-left\"></span>\n" + "    <span class=\"sr-only\">previous</span>\n" + "  </a>\n" + "  <a role=\"button\" href class=\"right carousel-control\" ng-click=\"next()\" ng-show=\"slides.length > 1\">\n" + "    <span aria-hidden=\"true\" class=\"glyphicon glyphicon-chevron-right\"></span>\n" + "    <span class=\"sr-only\">next</span>\n" + "  </a>\n" + "  <ol class=\"carousel-indicators\" ng-show=\"slides.length > 1\">\n" + "    <li ng-repeat=\"slide in slides | orderBy:indexOfSlide track by $index\" ng-class=\"{ active: isActive(slide) }\" ng-click=\"select(slide)\">\n" + "      <span class=\"sr-only\">slide {{ $index + 1 }} of {{ slides.length }}<span ng-if=\"isActive(slide)\">, currently active</span></span>\n" + "    </li>\n" + "  </ol>\n" + "</div>");}]);angular.module("template/carousel/slide.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/carousel/slide.html","<div ng-class=\"{\n" + "    'active': active\n" + "  }\" class=\"item text-center\" ng-transclude></div>\n" + "");}]);angular.module("template/datepicker/datepicker.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/datepicker/datepicker.html","<div ng-switch=\"datepickerMode\" role=\"application\" ng-keydown=\"keydown($event)\">\n" + "  <uib-daypicker ng-switch-when=\"day\" tabindex=\"0\"></uib-daypicker>\n" + "  <uib-monthpicker ng-switch-when=\"month\" tabindex=\"0\"></uib-monthpicker>\n" + "  <uib-yearpicker ng-switch-when=\"year\" tabindex=\"0\"></uib-yearpicker>\n" + "</div>");}]);angular.module("template/datepicker/day.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/datepicker/day.html","<table role=\"grid\" aria-labelledby=\"{{::uniqueId}}-title\" aria-activedescendant=\"{{activeDateId}}\">\n" + "  <thead>\n" + "    <tr>\n" + "      <th><button type=\"button\" class=\"btn btn-default btn-sm pull-left\" ng-click=\"move(-1)\" tabindex=\"-1\"><i class=\"glyphicon glyphicon-chevron-left\"></i></button></th>\n" + "      <th colspan=\"{{::5 + showWeeks}}\"><button id=\"{{::uniqueId}}-title\" role=\"heading\" aria-live=\"assertive\" aria-atomic=\"true\" type=\"button\" class=\"btn btn-default btn-sm\" ng-click=\"toggleMode()\" ng-disabled=\"datepickerMode === maxMode\" tabindex=\"-1\" style=\"width:100%;\"><strong>{{title}}</strong></button></th>\n" + "      <th><button type=\"button\" class=\"btn btn-default btn-sm pull-right\" ng-click=\"move(1)\" tabindex=\"-1\"><i class=\"glyphicon glyphicon-chevron-right\"></i></button></th>\n" + "    </tr>\n" + "    <tr>\n" + "      <th ng-if=\"showWeeks\" class=\"text-center\"></th>\n" + "      <th ng-repeat=\"label in ::labels track by $index\" class=\"text-center\"><small aria-label=\"{{::label.full}}\">{{::label.abbr}}</small></th>\n" + "    </tr>\n" + "  </thead>\n" + "  <tbody>\n" + "    <tr ng-repeat=\"row in rows track by $index\">\n" + "      <td ng-if=\"showWeeks\" class=\"text-center h6\"><em>{{ weekNumbers[$index] }}</em></td>\n" + "      <td ng-repeat=\"dt in row track by dt.date\" class=\"text-center\" role=\"gridcell\" id=\"{{::dt.uid}}\" ng-class=\"::dt.customClass\">\n" + "        <button type=\"button\" style=\"min-width:100%;\" class=\"btn btn-default btn-sm\" ng-class=\"{'btn-info': dt.selected, active: isActive(dt)}\" ng-click=\"select(dt.date)\" ng-disabled=\"dt.disabled\" tabindex=\"-1\"><span ng-class=\"::{'text-muted': dt.secondary, 'text-info': dt.current}\">{{::dt.label}}</span></button>\n" + "      </td>\n" + "    </tr>\n" + "  </tbody>\n" + "</table>\n" + "");}]);angular.module("template/datepicker/month.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/datepicker/month.html","<table role=\"grid\" aria-labelledby=\"{{::uniqueId}}-title\" aria-activedescendant=\"{{activeDateId}}\">\n" + "  <thead>\n" + "    <tr>\n" + "      <th><button type=\"button\" class=\"btn btn-default btn-sm pull-left\" ng-click=\"move(-1)\" tabindex=\"-1\"><i class=\"glyphicon glyphicon-chevron-left\"></i></button></th>\n" + "      <th><button id=\"{{::uniqueId}}-title\" role=\"heading\" aria-live=\"assertive\" aria-atomic=\"true\" type=\"button\" class=\"btn btn-default btn-sm\" ng-click=\"toggleMode()\" ng-disabled=\"datepickerMode === maxMode\" tabindex=\"-1\" style=\"width:100%;\"><strong>{{title}}</strong></button></th>\n" + "      <th><button type=\"button\" class=\"btn btn-default btn-sm pull-right\" ng-click=\"move(1)\" tabindex=\"-1\"><i class=\"glyphicon glyphicon-chevron-right\"></i></button></th>\n" + "    </tr>\n" + "  </thead>\n" + "  <tbody>\n" + "    <tr ng-repeat=\"row in rows track by $index\">\n" + "      <td ng-repeat=\"dt in row track by dt.date\" class=\"text-center\" role=\"gridcell\" id=\"{{::dt.uid}}\" ng-class=\"::dt.customClass\">\n" + "        <button type=\"button\" style=\"min-width:100%;\" class=\"btn btn-default\" ng-class=\"{'btn-info': dt.selected, active: isActive(dt)}\" ng-click=\"select(dt.date)\" ng-disabled=\"dt.disabled\" tabindex=\"-1\"><span ng-class=\"::{'text-info': dt.current}\">{{::dt.label}}</span></button>\n" + "      </td>\n" + "    </tr>\n" + "  </tbody>\n" + "</table>\n" + "");}]);angular.module("template/datepicker/popup.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/datepicker/popup.html","<ul class=\"dropdown-menu\" dropdown-nested ng-if=\"isOpen\" style=\"display: block\" ng-style=\"{top: position.top+'px', left: position.left+'px'}\" ng-keydown=\"keydown($event)\" ng-click=\"$event.stopPropagation()\">\n" + "	<li ng-transclude></li>\n" + "	<li ng-if=\"showButtonBar\" style=\"padding:10px 9px 2px\">\n" + "		<span class=\"btn-group pull-left\">\n" + "			<button type=\"button\" class=\"btn btn-sm btn-info\" ng-click=\"select('today')\" ng-disabled=\"isDisabled('today')\">{{ getText('current') }}</button>\n" + "			<button type=\"button\" class=\"btn btn-sm btn-danger\" ng-click=\"select(null)\">{{ getText('clear') }}</button>\n" + "		</span>\n" + "		<button type=\"button\" class=\"btn btn-sm btn-success pull-right\" ng-click=\"close()\">{{ getText('close') }}</button>\n" + "	</li>\n" + "</ul>\n" + "");}]);angular.module("template/datepicker/year.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/datepicker/year.html","<table role=\"grid\" aria-labelledby=\"{{::uniqueId}}-title\" aria-activedescendant=\"{{activeDateId}}\">\n" + "  <thead>\n" + "    <tr>\n" + "      <th><button type=\"button\" class=\"btn btn-default btn-sm pull-left\" ng-click=\"move(-1)\" tabindex=\"-1\"><i class=\"glyphicon glyphicon-chevron-left\"></i></button></th>\n" + "      <th colspan=\"3\"><button id=\"{{::uniqueId}}-title\" role=\"heading\" aria-live=\"assertive\" aria-atomic=\"true\" type=\"button\" class=\"btn btn-default btn-sm\" ng-click=\"toggleMode()\" ng-disabled=\"datepickerMode === maxMode\" tabindex=\"-1\" style=\"width:100%;\"><strong>{{title}}</strong></button></th>\n" + "      <th><button type=\"button\" class=\"btn btn-default btn-sm pull-right\" ng-click=\"move(1)\" tabindex=\"-1\"><i class=\"glyphicon glyphicon-chevron-right\"></i></button></th>\n" + "    </tr>\n" + "  </thead>\n" + "  <tbody>\n" + "    <tr ng-repeat=\"row in rows track by $index\">\n" + "      <td ng-repeat=\"dt in row track by dt.date\" class=\"text-center\" role=\"gridcell\" id=\"{{::dt.uid}}\" ng-class=\"::dt.customClass\">\n" + "        <button type=\"button\" style=\"min-width:100%;\" class=\"btn btn-default\" ng-class=\"{'btn-info': dt.selected, active: isActive(dt)}\" ng-click=\"select(dt.date)\" ng-disabled=\"dt.disabled\" tabindex=\"-1\"><span ng-class=\"::{'text-info': dt.current}\">{{::dt.label}}</span></button>\n" + "      </td>\n" + "    </tr>\n" + "  </tbody>\n" + "</table>\n" + "");}]);angular.module("template/modal/backdrop.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/modal/backdrop.html","<div uib-modal-animation-class=\"fade\"\n" + "     modal-in-class=\"in\"\n" + "     ng-style=\"{'z-index': 1040 + (index && 1 || 0) + index*10}\"\n" + "></div>\n" + "");}]);angular.module("template/modal/window.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/modal/window.html","<div modal-render=\"{{$isRendered}}\" tabindex=\"-1\" role=\"dialog\" class=\"modal\"\n" + "    uib-modal-animation-class=\"fade\"\n" + "    modal-in-class=\"in\"\n" + "    ng-style=\"{'z-index': 1050 + index*10, display: 'block'}\">\n" + "    <div class=\"modal-dialog\" ng-class=\"size ? 'modal-' + size : ''\"><div class=\"modal-content\" uib-modal-transclude></div></div>\n" + "</div>\n" + "");}]);angular.module("template/pagination/pager.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/pagination/pager.html","<ul class=\"pager\">\n" + "  <li ng-class=\"{disabled: noPrevious()||ngDisabled, previous: align}\"><a href ng-click=\"selectPage(page - 1, $event)\">{{::getText('previous')}}</a></li>\n" + "  <li ng-class=\"{disabled: noNext()||ngDisabled, next: align}\"><a href ng-click=\"selectPage(page + 1, $event)\">{{::getText('next')}}</a></li>\n" + "</ul>\n" + "");}]);angular.module("template/pagination/pagination.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/pagination/pagination.html","<ul class=\"pagination\">\n" + "  <li ng-if=\"::boundaryLinks\" ng-class=\"{disabled: noPrevious()||ngDisabled}\" class=\"pagination-first\"><a href ng-click=\"selectPage(1, $event)\">{{::getText('first')}}</a></li>\n" + "  <li ng-if=\"::directionLinks\" ng-class=\"{disabled: noPrevious()||ngDisabled}\" class=\"pagination-prev\"><a href ng-click=\"selectPage(page - 1, $event)\">{{::getText('previous')}}</a></li>\n" + "  <li ng-repeat=\"page in pages track by $index\" ng-class=\"{active: page.active,disabled: ngDisabled&&!page.active}\" class=\"pagination-page\"><a href ng-click=\"selectPage(page.number, $event)\">{{page.text}}</a></li>\n" + "  <li ng-if=\"::directionLinks\" ng-class=\"{disabled: noNext()||ngDisabled}\" class=\"pagination-next\"><a href ng-click=\"selectPage(page + 1, $event)\">{{::getText('next')}}</a></li>\n" + "  <li ng-if=\"::boundaryLinks\" ng-class=\"{disabled: noNext()||ngDisabled}\" class=\"pagination-last\"><a href ng-click=\"selectPage(totalPages, $event)\">{{::getText('last')}}</a></li>\n" + "</ul>\n" + "");}]);angular.module("template/tooltip/tooltip-html-popup.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/tooltip/tooltip-html-popup.html","<div\n" + "  tooltip-animation-class=\"fade\"\n" + "  uib-tooltip-classes\n" + "  ng-class=\"{ in: isOpen() }\">\n" + "  <div class=\"tooltip-arrow\"></div>\n" + "  <div class=\"tooltip-inner\" ng-bind-html=\"contentExp()\"></div>\n" + "</div>\n" + "");}]);angular.module("template/tooltip/tooltip-popup.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/tooltip/tooltip-popup.html","<div\n" + "  tooltip-animation-class=\"fade\"\n" + "  uib-tooltip-classes\n" + "  ng-class=\"{ in: isOpen() }\">\n" + "  <div class=\"tooltip-arrow\"></div>\n" + "  <div class=\"tooltip-inner\" ng-bind=\"content\"></div>\n" + "</div>\n" + "");}]);angular.module("template/tooltip/tooltip-template-popup.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/tooltip/tooltip-template-popup.html","<div\n" + "  tooltip-animation-class=\"fade\"\n" + "  uib-tooltip-classes\n" + "  ng-class=\"{ in: isOpen() }\">\n" + "  <div class=\"tooltip-arrow\"></div>\n" + "  <div class=\"tooltip-inner\"\n" + "    uib-tooltip-template-transclude=\"contentExp()\"\n" + "    tooltip-template-transclude-scope=\"originScope()\"></div>\n" + "</div>\n" + "");}]);angular.module("template/popover/popover-html.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/popover/popover-html.html","<div tooltip-animation-class=\"fade\"\n" + "  uib-tooltip-classes\n" + "  ng-class=\"{ in: isOpen() }\">\n" + "  <div class=\"arrow\"></div>\n" + "\n" + "  <div class=\"popover-inner\">\n" + "      <h3 class=\"popover-title\" ng-bind=\"title\" ng-if=\"title\"></h3>\n" + "      <div class=\"popover-content\" ng-bind-html=\"contentExp()\"></div>\n" + "  </div>\n" + "</div>\n" + "");}]);angular.module("template/popover/popover-template.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/popover/popover-template.html","<div tooltip-animation-class=\"fade\"\n" + "  uib-tooltip-classes\n" + "  ng-class=\"{ in: isOpen() }\">\n" + "  <div class=\"arrow\"></div>\n" + "\n" + "  <div class=\"popover-inner\">\n" + "      <h3 class=\"popover-title\" ng-bind=\"title\" ng-if=\"title\"></h3>\n" + "      <div class=\"popover-content\"\n" + "        uib-tooltip-template-transclude=\"contentExp()\"\n" + "        tooltip-template-transclude-scope=\"originScope()\"></div>\n" + "  </div>\n" + "</div>\n" + "");}]);angular.module("template/popover/popover.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/popover/popover.html","<div tooltip-animation-class=\"fade\"\n" + "  uib-tooltip-classes\n" + "  ng-class=\"{ in: isOpen() }\">\n" + "  <div class=\"arrow\"></div>\n" + "\n" + "  <div class=\"popover-inner\">\n" + "      <h3 class=\"popover-title\" ng-bind=\"title\" ng-if=\"title\"></h3>\n" + "      <div class=\"popover-content\" ng-bind=\"content\"></div>\n" + "  </div>\n" + "</div>\n" + "");}]);angular.module("template/progressbar/bar.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/progressbar/bar.html","<div class=\"progress-bar\" ng-class=\"type && 'progress-bar-' + type\" role=\"progressbar\" aria-valuenow=\"{{value}}\" aria-valuemin=\"0\" aria-valuemax=\"{{max}}\" ng-style=\"{width: (percent < 100 ? percent : 100) + '%'}\" aria-valuetext=\"{{percent | number:0}}%\" aria-labelledby=\"{{::title}}\" style=\"min-width: 0;\" ng-transclude></div>\n" + "");}]);angular.module("template/progressbar/progress.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/progressbar/progress.html","<div class=\"progress\" ng-transclude aria-labelledby=\"{{::title}}\"></div>");}]);angular.module("template/progressbar/progressbar.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/progressbar/progressbar.html","<div class=\"progress\">\n" + "  <div class=\"progress-bar\" ng-class=\"type && 'progress-bar-' + type\" role=\"progressbar\" aria-valuenow=\"{{value}}\" aria-valuemin=\"0\" aria-valuemax=\"{{max}}\" ng-style=\"{width: (percent < 100 ? percent : 100) + '%'}\" aria-valuetext=\"{{percent | number:0}}%\" aria-labelledby=\"{{::title}}\" style=\"min-width: 0;\" ng-transclude></div>\n" + "</div>\n" + "");}]);angular.module("template/rating/rating.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/rating/rating.html","<span ng-mouseleave=\"reset()\" ng-keydown=\"onKeydown($event)\" tabindex=\"0\" role=\"slider\" aria-valuemin=\"0\" aria-valuemax=\"{{range.length}}\" aria-valuenow=\"{{value}}\">\n" + "    <span ng-repeat-start=\"r in range track by $index\" class=\"sr-only\">({{ $index < value ? '*' : ' ' }})</span>\n" + "    <i ng-repeat-end ng-mouseenter=\"enter($index + 1)\" ng-click=\"rate($index + 1)\" class=\"glyphicon\" ng-class=\"$index < value && (r.stateOn || 'glyphicon-star') || (r.stateOff || 'glyphicon-star-empty')\" ng-attr-title=\"{{r.title}}\" aria-valuetext=\"{{r.title}}\"></i>\n" + "</span>\n" + "");}]);angular.module("template/tabs/tab.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/tabs/tab.html","<li ng-class=\"{active: active, disabled: disabled}\">\n" + "  <a href ng-click=\"select()\" uib-tab-heading-transclude>{{heading}}</a>\n" + "</li>\n" + "");}]);angular.module("template/tabs/tabset.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/tabs/tabset.html","<div>\n" + "  <ul class=\"nav nav-{{type || 'tabs'}}\" ng-class=\"{'nav-stacked': vertical, 'nav-justified': justified}\" ng-transclude></ul>\n" + "  <div class=\"tab-content\">\n" + "    <div class=\"tab-pane\" \n" + "         ng-repeat=\"tab in tabs\" \n" + "         ng-class=\"{active: tab.active}\"\n" + "         uib-tab-content-transclude=\"tab\">\n" + "    </div>\n" + "  </div>\n" + "</div>\n" + "");}]);angular.module("template/timepicker/timepicker.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/timepicker/timepicker.html","<table>\n" + "  <tbody>\n" + "    <tr class=\"text-center\" ng-show=\"::showSpinners\">\n" + "      <td><a ng-click=\"incrementHours()\" ng-class=\"{disabled: noIncrementHours()}\" class=\"btn btn-link\" ng-disabled=\"noIncrementHours()\" tabindex=\"{{::tabindex}}\"><span class=\"glyphicon glyphicon-chevron-up\"></span></a></td>\n" + "      <td>&nbsp;</td>\n" + "      <td><a ng-click=\"incrementMinutes()\" ng-class=\"{disabled: noIncrementMinutes()}\" class=\"btn btn-link\" ng-disabled=\"noIncrementMinutes()\" tabindex=\"{{::tabindex}}\"><span class=\"glyphicon glyphicon-chevron-up\"></span></a></td>\n" + "      <td ng-show=\"showMeridian\"></td>\n" + "    </tr>\n" + "    <tr>\n" + "      <td class=\"form-group\" ng-class=\"{'has-error': invalidHours}\">\n" + "        <input style=\"width:50px;\" type=\"text\" ng-model=\"hours\" ng-change=\"updateHours()\" class=\"form-control text-center\" ng-readonly=\"::readonlyInput\" maxlength=\"2\" tabindex=\"{{::tabindex}}\">\n" + "      </td>\n" + "      <td>:</td>\n" + "      <td class=\"form-group\" ng-class=\"{'has-error': invalidMinutes}\">\n" + "        <input style=\"width:50px;\" type=\"text\" ng-model=\"minutes\" ng-change=\"updateMinutes()\" class=\"form-control text-center\" ng-readonly=\"::readonlyInput\" maxlength=\"2\" tabindex=\"{{::tabindex}}\">\n" + "      </td>\n" + "      <td ng-show=\"showMeridian\"><button type=\"button\" ng-class=\"{disabled: noToggleMeridian()}\" class=\"btn btn-default text-center\" ng-click=\"toggleMeridian()\" ng-disabled=\"noToggleMeridian()\" tabindex=\"{{::tabindex}}\">{{meridian}}</button></td>\n" + "    </tr>\n" + "    <tr class=\"text-center\" ng-show=\"::showSpinners\">\n" + "      <td><a ng-click=\"decrementHours()\" ng-class=\"{disabled: noDecrementHours()}\" class=\"btn btn-link\" ng-disabled=\"noDecrementHours()\" tabindex=\"{{::tabindex}}\"><span class=\"glyphicon glyphicon-chevron-down\"></span></a></td>\n" + "      <td>&nbsp;</td>\n" + "      <td><a ng-click=\"decrementMinutes()\" ng-class=\"{disabled: noDecrementMinutes()}\" class=\"btn btn-link\" ng-disabled=\"noDecrementMinutes()\" tabindex=\"{{::tabindex}}\"><span class=\"glyphicon glyphicon-chevron-down\"></span></a></td>\n" + "      <td ng-show=\"showMeridian\"></td>\n" + "    </tr>\n" + "  </tbody>\n" + "</table>\n" + "");}]);angular.module("template/typeahead/typeahead-match.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/typeahead/typeahead-match.html","<a href tabindex=\"-1\" ng-bind-html=\"match.label | uibTypeaheadHighlight:query\"></a>\n" + "");}]);angular.module("template/typeahead/typeahead-popup.html",[]).run(["$templateCache",function($templateCache){$templateCache.put("template/typeahead/typeahead-popup.html","<ul class=\"dropdown-menu\" ng-show=\"isOpen() && !moveInProgress\" ng-style=\"{top: position().top+'px', left: position().left+'px'}\" style=\"display: block;\" role=\"listbox\" aria-hidden=\"{{!isOpen()}}\">\n" + "    <li ng-repeat=\"match in matches track by $index\" ng-class=\"{active: isActive($index) }\" ng-mouseenter=\"selectActive($index)\" ng-click=\"selectMatch($index)\" role=\"option\" id=\"{{::match.id}}\">\n" + "        <div uib-typeahead-match index=\"$index\" match=\"match\" query=\"query\" template-url=\"templateUrl\"></div>\n" + "    </li>\n" + "</ul>\n" + "");}]);!angular.$$csp() && angular.element(document).find('head').prepend('<style type="text/css">.ng-animate.item:not(.left):not(.right){-webkit-transition:0s ease-in-out left;transition:0s ease-in-out left}</style>');}};});
$__System.registerDynamic("45", ["44"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  req('44');
  module.exports = 'ui.bootstrap';
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("46", ["45"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('45');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("47", ["3c"], false, function(__require, __exports, __module) {
  var _retrieveGlobal = $__System.get("@@global-helpers").prepareGlobal(__module.id, null, null);
  (function() {
    "format global";
    "deps angular";
    (function(window, angular, undefined) {
      'use strict';
      var ngRouteModule = angular.module('ngRoute', ['ng']).provider('$route', $RouteProvider),
          $routeMinErr = angular.$$minErr('ngRoute');
      function $RouteProvider() {
        function inherit(parent, extra) {
          return angular.extend(Object.create(parent), extra);
        }
        var routes = {};
        this.when = function(path, route) {
          var routeCopy = angular.copy(route);
          if (angular.isUndefined(routeCopy.reloadOnSearch)) {
            routeCopy.reloadOnSearch = true;
          }
          if (angular.isUndefined(routeCopy.caseInsensitiveMatch)) {
            routeCopy.caseInsensitiveMatch = this.caseInsensitiveMatch;
          }
          routes[path] = angular.extend(routeCopy, path && pathRegExp(path, routeCopy));
          if (path) {
            var redirectPath = (path[path.length - 1] == '/') ? path.substr(0, path.length - 1) : path + '/';
            routes[redirectPath] = angular.extend({redirectTo: path}, pathRegExp(redirectPath, routeCopy));
          }
          return this;
        };
        this.caseInsensitiveMatch = false;
        function pathRegExp(path, opts) {
          var insensitive = opts.caseInsensitiveMatch,
              ret = {
                originalPath: path,
                regexp: path
              },
              keys = ret.keys = [];
          path = path.replace(/([().])/g, '\\$1').replace(/(\/)?:(\w+)([\?\*])?/g, function(_, slash, key, option) {
            var optional = option === '?' ? option : null;
            var star = option === '*' ? option : null;
            keys.push({
              name: key,
              optional: !!optional
            });
            slash = slash || '';
            return '' + (optional ? '' : slash) + '(?:' + (optional ? slash : '') + (star && '(.+?)' || '([^/]+)') + (optional || '') + ')' + (optional || '');
          }).replace(/([\/$\*])/g, '\\$1');
          ret.regexp = new RegExp('^' + path + '$', insensitive ? 'i' : '');
          return ret;
        }
        this.otherwise = function(params) {
          if (typeof params === 'string') {
            params = {redirectTo: params};
          }
          this.when(null, params);
          return this;
        };
        this.$get = ['$rootScope', '$location', '$routeParams', '$q', '$injector', '$templateRequest', '$sce', function($rootScope, $location, $routeParams, $q, $injector, $templateRequest, $sce) {
          var forceReload = false,
              preparedRoute,
              preparedRouteIsUpdateOnly,
              $route = {
                routes: routes,
                reload: function() {
                  forceReload = true;
                  $rootScope.$evalAsync(function() {
                    prepareRoute();
                    commitRoute();
                  });
                },
                updateParams: function(newParams) {
                  if (this.current && this.current.$$route) {
                    newParams = angular.extend({}, this.current.params, newParams);
                    $location.path(interpolate(this.current.$$route.originalPath, newParams));
                    $location.search(newParams);
                  } else {
                    throw $routeMinErr('norout', 'Tried updating route when with no current route');
                  }
                }
              };
          $rootScope.$on('$locationChangeStart', prepareRoute);
          $rootScope.$on('$locationChangeSuccess', commitRoute);
          return $route;
          function switchRouteMatcher(on, route) {
            var keys = route.keys,
                params = {};
            if (!route.regexp)
              return null;
            var m = route.regexp.exec(on);
            if (!m)
              return null;
            for (var i = 1,
                len = m.length; i < len; ++i) {
              var key = keys[i - 1];
              var val = m[i];
              if (key && val) {
                params[key.name] = val;
              }
            }
            return params;
          }
          function prepareRoute($locationEvent) {
            var lastRoute = $route.current;
            preparedRoute = parseRoute();
            preparedRouteIsUpdateOnly = preparedRoute && lastRoute && preparedRoute.$$route === lastRoute.$$route && angular.equals(preparedRoute.pathParams, lastRoute.pathParams) && !preparedRoute.reloadOnSearch && !forceReload;
            if (!preparedRouteIsUpdateOnly && (lastRoute || preparedRoute)) {
              if ($rootScope.$broadcast('$routeChangeStart', preparedRoute, lastRoute).defaultPrevented) {
                if ($locationEvent) {
                  $locationEvent.preventDefault();
                }
              }
            }
          }
          function commitRoute() {
            var lastRoute = $route.current;
            var nextRoute = preparedRoute;
            if (preparedRouteIsUpdateOnly) {
              lastRoute.params = nextRoute.params;
              angular.copy(lastRoute.params, $routeParams);
              $rootScope.$broadcast('$routeUpdate', lastRoute);
            } else if (nextRoute || lastRoute) {
              forceReload = false;
              $route.current = nextRoute;
              if (nextRoute) {
                if (nextRoute.redirectTo) {
                  if (angular.isString(nextRoute.redirectTo)) {
                    $location.path(interpolate(nextRoute.redirectTo, nextRoute.params)).search(nextRoute.params).replace();
                  } else {
                    $location.url(nextRoute.redirectTo(nextRoute.pathParams, $location.path(), $location.search())).replace();
                  }
                }
              }
              $q.when(nextRoute).then(function() {
                if (nextRoute) {
                  var locals = angular.extend({}, nextRoute.resolve),
                      template,
                      templateUrl;
                  angular.forEach(locals, function(value, key) {
                    locals[key] = angular.isString(value) ? $injector.get(value) : $injector.invoke(value, null, null, key);
                  });
                  if (angular.isDefined(template = nextRoute.template)) {
                    if (angular.isFunction(template)) {
                      template = template(nextRoute.params);
                    }
                  } else if (angular.isDefined(templateUrl = nextRoute.templateUrl)) {
                    if (angular.isFunction(templateUrl)) {
                      templateUrl = templateUrl(nextRoute.params);
                    }
                    if (angular.isDefined(templateUrl)) {
                      nextRoute.loadedTemplateUrl = $sce.valueOf(templateUrl);
                      template = $templateRequest(templateUrl);
                    }
                  }
                  if (angular.isDefined(template)) {
                    locals['$template'] = template;
                  }
                  return $q.all(locals);
                }
              }).then(function(locals) {
                if (nextRoute == $route.current) {
                  if (nextRoute) {
                    nextRoute.locals = locals;
                    angular.copy(nextRoute.params, $routeParams);
                  }
                  $rootScope.$broadcast('$routeChangeSuccess', nextRoute, lastRoute);
                }
              }, function(error) {
                if (nextRoute == $route.current) {
                  $rootScope.$broadcast('$routeChangeError', nextRoute, lastRoute, error);
                }
              });
            }
          }
          function parseRoute() {
            var params,
                match;
            angular.forEach(routes, function(route, path) {
              if (!match && (params = switchRouteMatcher($location.path(), route))) {
                match = inherit(route, {
                  params: angular.extend({}, $location.search(), params),
                  pathParams: params
                });
                match.$$route = route;
              }
            });
            return match || routes[null] && inherit(routes[null], {
              params: {},
              pathParams: {}
            });
          }
          function interpolate(string, params) {
            var result = [];
            angular.forEach((string || '').split(':'), function(segment, i) {
              if (i === 0) {
                result.push(segment);
              } else {
                var segmentMatch = segment.match(/(\w+)(?:[?*])?(.*)/);
                var key = segmentMatch[1];
                result.push(params[key]);
                result.push(segmentMatch[2] || '');
                delete params[key];
              }
            });
            return result.join('');
          }
        }];
      }
      ngRouteModule.provider('$routeParams', $RouteParamsProvider);
      function $RouteParamsProvider() {
        this.$get = function() {
          return {};
        };
      }
      ngRouteModule.directive('ngView', ngViewFactory);
      ngRouteModule.directive('ngView', ngViewFillContentFactory);
      ngViewFactory.$inject = ['$route', '$anchorScroll', '$animate'];
      function ngViewFactory($route, $anchorScroll, $animate) {
        return {
          restrict: 'ECA',
          terminal: true,
          priority: 400,
          transclude: 'element',
          link: function(scope, $element, attr, ctrl, $transclude) {
            var currentScope,
                currentElement,
                previousLeaveAnimation,
                autoScrollExp = attr.autoscroll,
                onloadExp = attr.onload || '';
            scope.$on('$routeChangeSuccess', update);
            update();
            function cleanupLastView() {
              if (previousLeaveAnimation) {
                $animate.cancel(previousLeaveAnimation);
                previousLeaveAnimation = null;
              }
              if (currentScope) {
                currentScope.$destroy();
                currentScope = null;
              }
              if (currentElement) {
                previousLeaveAnimation = $animate.leave(currentElement);
                previousLeaveAnimation.then(function() {
                  previousLeaveAnimation = null;
                });
                currentElement = null;
              }
            }
            function update() {
              var locals = $route.current && $route.current.locals,
                  template = locals && locals.$template;
              if (angular.isDefined(template)) {
                var newScope = scope.$new();
                var current = $route.current;
                var clone = $transclude(newScope, function(clone) {
                  $animate.enter(clone, null, currentElement || $element).then(function onNgViewEnter() {
                    if (angular.isDefined(autoScrollExp) && (!autoScrollExp || scope.$eval(autoScrollExp))) {
                      $anchorScroll();
                    }
                  });
                  cleanupLastView();
                });
                currentElement = clone;
                currentScope = current.scope = newScope;
                currentScope.$emit('$viewContentLoaded');
                currentScope.$eval(onloadExp);
              } else {
                cleanupLastView();
              }
            }
          }
        };
      }
      ngViewFillContentFactory.$inject = ['$compile', '$controller', '$route'];
      function ngViewFillContentFactory($compile, $controller, $route) {
        return {
          restrict: 'ECA',
          priority: -400,
          link: function(scope, $element) {
            var current = $route.current,
                locals = current.locals;
            $element.html(locals.$template);
            var link = $compile($element.contents());
            if (current.controller) {
              locals.$scope = scope;
              var controller = $controller(current.controller, locals);
              if (current.controllerAs) {
                scope[current.controllerAs] = controller;
              }
              $element.data('$ngControllerController', controller);
              $element.children().data('$ngControllerController', controller);
            }
            link(scope);
          }
        };
      }
    })(window, window.angular);
  })();
  return _retrieveGlobal();
});

$__System.registerDynamic("3e", ["47"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('47');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("48", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  (function() {
    'use strict';
    angular.module('angular-loading-bar', ['cfp.loadingBarInterceptor']);
    angular.module('chieffancypants.loadingBar', ['cfp.loadingBarInterceptor']);
    angular.module('cfp.loadingBarInterceptor', ['cfp.loadingBar']).config(['$httpProvider', function($httpProvider) {
      var interceptor = ['$q', '$cacheFactory', '$timeout', '$rootScope', '$log', 'cfpLoadingBar', function($q, $cacheFactory, $timeout, $rootScope, $log, cfpLoadingBar) {
        var reqsTotal = 0;
        var reqsCompleted = 0;
        var latencyThreshold = cfpLoadingBar.latencyThreshold;
        var startTimeout;
        function setComplete() {
          $timeout.cancel(startTimeout);
          cfpLoadingBar.complete();
          reqsCompleted = 0;
          reqsTotal = 0;
        }
        function isCached(config) {
          var cache;
          var defaultCache = $cacheFactory.get('$http');
          var defaults = $httpProvider.defaults;
          if ((config.cache || defaults.cache) && config.cache !== false && (config.method === 'GET' || config.method === 'JSONP')) {
            cache = angular.isObject(config.cache) ? config.cache : angular.isObject(defaults.cache) ? defaults.cache : defaultCache;
          }
          var cached = cache !== undefined ? cache.get(config.url) !== undefined : false;
          if (config.cached !== undefined && cached !== config.cached) {
            return config.cached;
          }
          config.cached = cached;
          return cached;
        }
        return {
          'request': function(config) {
            if (!config.ignoreLoadingBar && !isCached(config)) {
              $rootScope.$broadcast('cfpLoadingBar:loading', {url: config.url});
              if (reqsTotal === 0) {
                startTimeout = $timeout(function() {
                  cfpLoadingBar.start();
                }, latencyThreshold);
              }
              reqsTotal++;
              cfpLoadingBar.set(reqsCompleted / reqsTotal);
            }
            return config;
          },
          'response': function(response) {
            if (!response || !response.config) {
              $log.error('Broken interceptor detected: Config object not supplied in response:\n https://github.com/chieffancypants/angular-loading-bar/pull/50');
              return response;
            }
            if (!response.config.ignoreLoadingBar && !isCached(response.config)) {
              reqsCompleted++;
              $rootScope.$broadcast('cfpLoadingBar:loaded', {
                url: response.config.url,
                result: response
              });
              if (reqsCompleted >= reqsTotal) {
                setComplete();
              } else {
                cfpLoadingBar.set(reqsCompleted / reqsTotal);
              }
            }
            return response;
          },
          'responseError': function(rejection) {
            if (!rejection || !rejection.config) {
              $log.error('Broken interceptor detected: Config object not supplied in rejection:\n https://github.com/chieffancypants/angular-loading-bar/pull/50');
              return $q.reject(rejection);
            }
            if (!rejection.config.ignoreLoadingBar && !isCached(rejection.config)) {
              reqsCompleted++;
              $rootScope.$broadcast('cfpLoadingBar:loaded', {
                url: rejection.config.url,
                result: rejection
              });
              if (reqsCompleted >= reqsTotal) {
                setComplete();
              } else {
                cfpLoadingBar.set(reqsCompleted / reqsTotal);
              }
            }
            return $q.reject(rejection);
          }
        };
      }];
      $httpProvider.interceptors.push(interceptor);
    }]);
    angular.module('cfp.loadingBar', []).provider('cfpLoadingBar', function() {
      this.autoIncrement = true;
      this.includeSpinner = true;
      this.includeBar = true;
      this.latencyThreshold = 100;
      this.startSize = 0.02;
      this.parentSelector = 'body';
      this.spinnerTemplate = '<div id="loading-bar-spinner"><div class="spinner-icon"></div></div>';
      this.loadingBarTemplate = '<div id="loading-bar"><div class="bar"><div class="peg"></div></div></div>';
      this.$get = ['$injector', '$document', '$timeout', '$rootScope', function($injector, $document, $timeout, $rootScope) {
        var $animate;
        var $parentSelector = this.parentSelector,
            loadingBarContainer = angular.element(this.loadingBarTemplate),
            loadingBar = loadingBarContainer.find('div').eq(0),
            spinner = angular.element(this.spinnerTemplate);
        var incTimeout,
            completeTimeout,
            started = false,
            status = 0;
        var autoIncrement = this.autoIncrement;
        var includeSpinner = this.includeSpinner;
        var includeBar = this.includeBar;
        var startSize = this.startSize;
        function _start() {
          if (!$animate) {
            $animate = $injector.get('$animate');
          }
          var $parent = $document.find($parentSelector).eq(0);
          $timeout.cancel(completeTimeout);
          if (started) {
            return;
          }
          $rootScope.$broadcast('cfpLoadingBar:started');
          started = true;
          if (includeBar) {
            $animate.enter(loadingBarContainer, $parent, angular.element($parent[0].lastChild));
          }
          if (includeSpinner) {
            $animate.enter(spinner, $parent, angular.element($parent[0].lastChild));
          }
          _set(startSize);
        }
        function _set(n) {
          if (!started) {
            return;
          }
          var pct = (n * 100) + '%';
          loadingBar.css('width', pct);
          status = n;
          if (autoIncrement) {
            $timeout.cancel(incTimeout);
            incTimeout = $timeout(function() {
              _inc();
            }, 250);
          }
        }
        function _inc() {
          if (_status() >= 1) {
            return;
          }
          var rnd = 0;
          var stat = _status();
          if (stat >= 0 && stat < 0.25) {
            rnd = (Math.random() * (5 - 3 + 1) + 3) / 100;
          } else if (stat >= 0.25 && stat < 0.65) {
            rnd = (Math.random() * 3) / 100;
          } else if (stat >= 0.65 && stat < 0.9) {
            rnd = (Math.random() * 2) / 100;
          } else if (stat >= 0.9 && stat < 0.99) {
            rnd = 0.005;
          } else {
            rnd = 0;
          }
          var pct = _status() + rnd;
          _set(pct);
        }
        function _status() {
          return status;
        }
        function _completeAnimation() {
          status = 0;
          started = false;
        }
        function _complete() {
          if (!$animate) {
            $animate = $injector.get('$animate');
          }
          $rootScope.$broadcast('cfpLoadingBar:completed');
          _set(1);
          $timeout.cancel(completeTimeout);
          completeTimeout = $timeout(function() {
            var promise = $animate.leave(loadingBarContainer, _completeAnimation);
            if (promise && promise.then) {
              promise.then(_completeAnimation);
            }
            $animate.leave(spinner);
          }, 500);
        }
        return {
          start: _start,
          set: _set,
          status: _status,
          inc: _inc,
          complete: _complete,
          autoIncrement: this.autoIncrement,
          includeSpinner: this.includeSpinner,
          latencyThreshold: this.latencyThreshold,
          parentSelector: this.parentSelector,
          startSize: this.startSize
        };
      }];
    });
  })();
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("49", ["48"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  req('48');
  module.exports = 'angular-loading-bar';
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4a", ["49"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('49');
  global.define = __define;
  return module.exports;
});

$__System.register('4b', ['2', '46', '3c', '4a', '3e', '3d'], function (_export) {
  // import categoriesTemplate from 'sysadmin/app/routes/categories/categories.html!text';
  // import createEditCategoryTemplate from 'sysadmin/app/routes/categories/createEdit.html!text';

  'use strict';

  // import categoriesControllerModule from 'sysadmin/app/routes/categories/categoriesController';
  // import createEditCategoryControllerModule from 'sysadmin/app/routes/categories/createEditCategoryController';
  var homeTemplate, angular, loadingBar, homeControllerModule;
  return {
    setters: [function (_2) {
      homeTemplate = _2['default'];
    }, function (_) {}, function (_c) {
      angular = _c['default'];
    }, function (_a) {
      loadingBar = _a['default'];
    }, function (_e) {}, function (_d) {
      homeControllerModule = _d['default'];
    }],
    execute: function () {
      _export('default', angular.module('appRoutesModule', ['ngRoute', 'angular-loading-bar', 'ui.bootstrap.dropdown', 'ui.bootstrap.tabs', homeControllerModule.name]).config(function ($routeProvider) {

        $routeProvider.when('/', {
          template: homeTemplate,
          controller: 'HomeController',
          controllerAs: 'ctrl',
          resolve: {
            allCategories: function allCategories(GetCategoriesFactory) {
              return GetCategoriesFactory.allCats();
            }
          }
        }).otherwise({
          redirectTo: '/'
        });
      }));
    }
  };
});
$__System.registerDynamic("4c", [], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  var process = module.exports = {};
  var queue = [];
  var draining = false;
  var currentQueue;
  var queueIndex = -1;
  function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
      queue = currentQueue.concat(queue);
    } else {
      queueIndex = -1;
    }
    if (queue.length) {
      drainQueue();
    }
  }
  function drainQueue() {
    if (draining) {
      return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;
    var len = queue.length;
    while (len) {
      currentQueue = queue;
      queue = [];
      while (++queueIndex < len) {
        if (currentQueue) {
          currentQueue[queueIndex].run();
        }
      }
      queueIndex = -1;
      len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
  }
  process.nextTick = function(fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
      for (var i = 1; i < arguments.length; i++) {
        args[i - 1] = arguments[i];
      }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
      setTimeout(drainQueue, 0);
    }
  };
  function Item(fun, array) {
    this.fun = fun;
    this.array = array;
  }
  Item.prototype.run = function() {
    this.fun.apply(null, this.array);
  };
  process.title = 'browser';
  process.browser = true;
  process.env = {};
  process.argv = [];
  process.version = '';
  process.versions = {};
  function noop() {}
  process.on = noop;
  process.addListener = noop;
  process.once = noop;
  process.off = noop;
  process.removeListener = noop;
  process.removeAllListeners = noop;
  process.emit = noop;
  process.binding = function(name) {
    throw new Error('process.binding is not supported');
  };
  process.cwd = function() {
    return '/';
  };
  process.chdir = function(dir) {
    throw new Error('process.chdir is not supported');
  };
  process.umask = function() {
    return 0;
  };
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4d", ["4c"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('4c');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4e", ["4d"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = $__System._nodeRequire ? process : req('4d');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("11", ["4e"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('4e');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("4f", ["11"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  "format cjs";
  (function(process) {
    ;
    (function() {
      var undefined;
      var VERSION = '3.10.1';
      var BIND_FLAG = 1,
          BIND_KEY_FLAG = 2,
          CURRY_BOUND_FLAG = 4,
          CURRY_FLAG = 8,
          CURRY_RIGHT_FLAG = 16,
          PARTIAL_FLAG = 32,
          PARTIAL_RIGHT_FLAG = 64,
          ARY_FLAG = 128,
          REARG_FLAG = 256;
      var DEFAULT_TRUNC_LENGTH = 30,
          DEFAULT_TRUNC_OMISSION = '...';
      var HOT_COUNT = 150,
          HOT_SPAN = 16;
      var LARGE_ARRAY_SIZE = 200;
      var LAZY_FILTER_FLAG = 1,
          LAZY_MAP_FLAG = 2;
      var FUNC_ERROR_TEXT = 'Expected a function';
      var PLACEHOLDER = '__lodash_placeholder__';
      var argsTag = '[object Arguments]',
          arrayTag = '[object Array]',
          boolTag = '[object Boolean]',
          dateTag = '[object Date]',
          errorTag = '[object Error]',
          funcTag = '[object Function]',
          mapTag = '[object Map]',
          numberTag = '[object Number]',
          objectTag = '[object Object]',
          regexpTag = '[object RegExp]',
          setTag = '[object Set]',
          stringTag = '[object String]',
          weakMapTag = '[object WeakMap]';
      var arrayBufferTag = '[object ArrayBuffer]',
          float32Tag = '[object Float32Array]',
          float64Tag = '[object Float64Array]',
          int8Tag = '[object Int8Array]',
          int16Tag = '[object Int16Array]',
          int32Tag = '[object Int32Array]',
          uint8Tag = '[object Uint8Array]',
          uint8ClampedTag = '[object Uint8ClampedArray]',
          uint16Tag = '[object Uint16Array]',
          uint32Tag = '[object Uint32Array]';
      var reEmptyStringLeading = /\b__p \+= '';/g,
          reEmptyStringMiddle = /\b(__p \+=) '' \+/g,
          reEmptyStringTrailing = /(__e\(.*?\)|\b__t\)) \+\n'';/g;
      var reEscapedHtml = /&(?:amp|lt|gt|quot|#39|#96);/g,
          reUnescapedHtml = /[&<>"'`]/g,
          reHasEscapedHtml = RegExp(reEscapedHtml.source),
          reHasUnescapedHtml = RegExp(reUnescapedHtml.source);
      var reEscape = /<%-([\s\S]+?)%>/g,
          reEvaluate = /<%([\s\S]+?)%>/g,
          reInterpolate = /<%=([\s\S]+?)%>/g;
      var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\n\\]|\\.)*?\1)\]/,
          reIsPlainProp = /^\w*$/,
          rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\n\\]|\\.)*?)\2)\]/g;
      var reRegExpChars = /^[:!,]|[\\^$.*+?()[\]{}|\/]|(^[0-9a-fA-Fnrtuvx])|([\n\r\u2028\u2029])/g,
          reHasRegExpChars = RegExp(reRegExpChars.source);
      var reComboMark = /[\u0300-\u036f\ufe20-\ufe23]/g;
      var reEscapeChar = /\\(\\)?/g;
      var reEsTemplate = /\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g;
      var reFlags = /\w*$/;
      var reHasHexPrefix = /^0[xX]/;
      var reIsHostCtor = /^\[object .+?Constructor\]$/;
      var reIsUint = /^\d+$/;
      var reLatin1 = /[\xc0-\xd6\xd8-\xde\xdf-\xf6\xf8-\xff]/g;
      var reNoMatch = /($^)/;
      var reUnescapedString = /['\n\r\u2028\u2029\\]/g;
      var reWords = (function() {
        var upper = '[A-Z\\xc0-\\xd6\\xd8-\\xde]',
            lower = '[a-z\\xdf-\\xf6\\xf8-\\xff]+';
        return RegExp(upper + '+(?=' + upper + lower + ')|' + upper + '?' + lower + '|' + upper + '+|[0-9]+', 'g');
      }());
      var contextProps = ['Array', 'ArrayBuffer', 'Date', 'Error', 'Float32Array', 'Float64Array', 'Function', 'Int8Array', 'Int16Array', 'Int32Array', 'Math', 'Number', 'Object', 'RegExp', 'Set', 'String', '_', 'clearTimeout', 'isFinite', 'parseFloat', 'parseInt', 'setTimeout', 'TypeError', 'Uint8Array', 'Uint8ClampedArray', 'Uint16Array', 'Uint32Array', 'WeakMap'];
      var templateCounter = -1;
      var typedArrayTags = {};
      typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
      typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
      var cloneableTags = {};
      cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[stringTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
      cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[mapTag] = cloneableTags[setTag] = cloneableTags[weakMapTag] = false;
      var deburredLetters = {
        '\xc0': 'A',
        '\xc1': 'A',
        '\xc2': 'A',
        '\xc3': 'A',
        '\xc4': 'A',
        '\xc5': 'A',
        '\xe0': 'a',
        '\xe1': 'a',
        '\xe2': 'a',
        '\xe3': 'a',
        '\xe4': 'a',
        '\xe5': 'a',
        '\xc7': 'C',
        '\xe7': 'c',
        '\xd0': 'D',
        '\xf0': 'd',
        '\xc8': 'E',
        '\xc9': 'E',
        '\xca': 'E',
        '\xcb': 'E',
        '\xe8': 'e',
        '\xe9': 'e',
        '\xea': 'e',
        '\xeb': 'e',
        '\xcC': 'I',
        '\xcd': 'I',
        '\xce': 'I',
        '\xcf': 'I',
        '\xeC': 'i',
        '\xed': 'i',
        '\xee': 'i',
        '\xef': 'i',
        '\xd1': 'N',
        '\xf1': 'n',
        '\xd2': 'O',
        '\xd3': 'O',
        '\xd4': 'O',
        '\xd5': 'O',
        '\xd6': 'O',
        '\xd8': 'O',
        '\xf2': 'o',
        '\xf3': 'o',
        '\xf4': 'o',
        '\xf5': 'o',
        '\xf6': 'o',
        '\xf8': 'o',
        '\xd9': 'U',
        '\xda': 'U',
        '\xdb': 'U',
        '\xdc': 'U',
        '\xf9': 'u',
        '\xfa': 'u',
        '\xfb': 'u',
        '\xfc': 'u',
        '\xdd': 'Y',
        '\xfd': 'y',
        '\xff': 'y',
        '\xc6': 'Ae',
        '\xe6': 'ae',
        '\xde': 'Th',
        '\xfe': 'th',
        '\xdf': 'ss'
      };
      var htmlEscapes = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
        '`': '&#96;'
      };
      var htmlUnescapes = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#39;': "'",
        '&#96;': '`'
      };
      var objectTypes = {
        'function': true,
        'object': true
      };
      var regexpEscapes = {
        '0': 'x30',
        '1': 'x31',
        '2': 'x32',
        '3': 'x33',
        '4': 'x34',
        '5': 'x35',
        '6': 'x36',
        '7': 'x37',
        '8': 'x38',
        '9': 'x39',
        'A': 'x41',
        'B': 'x42',
        'C': 'x43',
        'D': 'x44',
        'E': 'x45',
        'F': 'x46',
        'a': 'x61',
        'b': 'x62',
        'c': 'x63',
        'd': 'x64',
        'e': 'x65',
        'f': 'x66',
        'n': 'x6e',
        'r': 'x72',
        't': 'x74',
        'u': 'x75',
        'v': 'x76',
        'x': 'x78'
      };
      var stringEscapes = {
        '\\': '\\',
        "'": "'",
        '\n': 'n',
        '\r': 'r',
        '\u2028': 'u2028',
        '\u2029': 'u2029'
      };
      var freeExports = objectTypes[typeof exports] && exports && !exports.nodeType && exports;
      var freeModule = objectTypes[typeof module] && module && !module.nodeType && module;
      var freeGlobal = freeExports && freeModule && typeof global == 'object' && global && global.Object && global;
      var freeSelf = objectTypes[typeof self] && self && self.Object && self;
      var freeWindow = objectTypes[typeof window] && window && window.Object && window;
      var moduleExports = freeModule && freeModule.exports === freeExports && freeExports;
      var root = freeGlobal || ((freeWindow !== (this && this.window)) && freeWindow) || freeSelf || this;
      function baseCompareAscending(value, other) {
        if (value !== other) {
          var valIsNull = value === null,
              valIsUndef = value === undefined,
              valIsReflexive = value === value;
          var othIsNull = other === null,
              othIsUndef = other === undefined,
              othIsReflexive = other === other;
          if ((value > other && !othIsNull) || !valIsReflexive || (valIsNull && !othIsUndef && othIsReflexive) || (valIsUndef && othIsReflexive)) {
            return 1;
          }
          if ((value < other && !valIsNull) || !othIsReflexive || (othIsNull && !valIsUndef && valIsReflexive) || (othIsUndef && valIsReflexive)) {
            return -1;
          }
        }
        return 0;
      }
      function baseFindIndex(array, predicate, fromRight) {
        var length = array.length,
            index = fromRight ? length : -1;
        while ((fromRight ? index-- : ++index < length)) {
          if (predicate(array[index], index, array)) {
            return index;
          }
        }
        return -1;
      }
      function baseIndexOf(array, value, fromIndex) {
        if (value !== value) {
          return indexOfNaN(array, fromIndex);
        }
        var index = fromIndex - 1,
            length = array.length;
        while (++index < length) {
          if (array[index] === value) {
            return index;
          }
        }
        return -1;
      }
      function baseIsFunction(value) {
        return typeof value == 'function' || false;
      }
      function baseToString(value) {
        return value == null ? '' : (value + '');
      }
      function charsLeftIndex(string, chars) {
        var index = -1,
            length = string.length;
        while (++index < length && chars.indexOf(string.charAt(index)) > -1) {}
        return index;
      }
      function charsRightIndex(string, chars) {
        var index = string.length;
        while (index-- && chars.indexOf(string.charAt(index)) > -1) {}
        return index;
      }
      function compareAscending(object, other) {
        return baseCompareAscending(object.criteria, other.criteria) || (object.index - other.index);
      }
      function compareMultiple(object, other, orders) {
        var index = -1,
            objCriteria = object.criteria,
            othCriteria = other.criteria,
            length = objCriteria.length,
            ordersLength = orders.length;
        while (++index < length) {
          var result = baseCompareAscending(objCriteria[index], othCriteria[index]);
          if (result) {
            if (index >= ordersLength) {
              return result;
            }
            var order = orders[index];
            return result * ((order === 'asc' || order === true) ? 1 : -1);
          }
        }
        return object.index - other.index;
      }
      function deburrLetter(letter) {
        return deburredLetters[letter];
      }
      function escapeHtmlChar(chr) {
        return htmlEscapes[chr];
      }
      function escapeRegExpChar(chr, leadingChar, whitespaceChar) {
        if (leadingChar) {
          chr = regexpEscapes[chr];
        } else if (whitespaceChar) {
          chr = stringEscapes[chr];
        }
        return '\\' + chr;
      }
      function escapeStringChar(chr) {
        return '\\' + stringEscapes[chr];
      }
      function indexOfNaN(array, fromIndex, fromRight) {
        var length = array.length,
            index = fromIndex + (fromRight ? 0 : -1);
        while ((fromRight ? index-- : ++index < length)) {
          var other = array[index];
          if (other !== other) {
            return index;
          }
        }
        return -1;
      }
      function isObjectLike(value) {
        return !!value && typeof value == 'object';
      }
      function isSpace(charCode) {
        return ((charCode <= 160 && (charCode >= 9 && charCode <= 13) || charCode == 32 || charCode == 160) || charCode == 5760 || charCode == 6158 || (charCode >= 8192 && (charCode <= 8202 || charCode == 8232 || charCode == 8233 || charCode == 8239 || charCode == 8287 || charCode == 12288 || charCode == 65279)));
      }
      function replaceHolders(array, placeholder) {
        var index = -1,
            length = array.length,
            resIndex = -1,
            result = [];
        while (++index < length) {
          if (array[index] === placeholder) {
            array[index] = PLACEHOLDER;
            result[++resIndex] = index;
          }
        }
        return result;
      }
      function sortedUniq(array, iteratee) {
        var seen,
            index = -1,
            length = array.length,
            resIndex = -1,
            result = [];
        while (++index < length) {
          var value = array[index],
              computed = iteratee ? iteratee(value, index, array) : value;
          if (!index || seen !== computed) {
            seen = computed;
            result[++resIndex] = value;
          }
        }
        return result;
      }
      function trimmedLeftIndex(string) {
        var index = -1,
            length = string.length;
        while (++index < length && isSpace(string.charCodeAt(index))) {}
        return index;
      }
      function trimmedRightIndex(string) {
        var index = string.length;
        while (index-- && isSpace(string.charCodeAt(index))) {}
        return index;
      }
      function unescapeHtmlChar(chr) {
        return htmlUnescapes[chr];
      }
      function runInContext(context) {
        context = context ? _.defaults(root.Object(), context, _.pick(root, contextProps)) : root;
        var Array = context.Array,
            Date = context.Date,
            Error = context.Error,
            Function = context.Function,
            Math = context.Math,
            Number = context.Number,
            Object = context.Object,
            RegExp = context.RegExp,
            String = context.String,
            TypeError = context.TypeError;
        var arrayProto = Array.prototype,
            objectProto = Object.prototype,
            stringProto = String.prototype;
        var fnToString = Function.prototype.toString;
        var hasOwnProperty = objectProto.hasOwnProperty;
        var idCounter = 0;
        var objToString = objectProto.toString;
        var oldDash = root._;
        var reIsNative = RegExp('^' + fnToString.call(hasOwnProperty).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&').replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$');
        var ArrayBuffer = context.ArrayBuffer,
            clearTimeout = context.clearTimeout,
            parseFloat = context.parseFloat,
            pow = Math.pow,
            propertyIsEnumerable = objectProto.propertyIsEnumerable,
            Set = getNative(context, 'Set'),
            setTimeout = context.setTimeout,
            splice = arrayProto.splice,
            Uint8Array = context.Uint8Array,
            WeakMap = getNative(context, 'WeakMap');
        var nativeCeil = Math.ceil,
            nativeCreate = getNative(Object, 'create'),
            nativeFloor = Math.floor,
            nativeIsArray = getNative(Array, 'isArray'),
            nativeIsFinite = context.isFinite,
            nativeKeys = getNative(Object, 'keys'),
            nativeMax = Math.max,
            nativeMin = Math.min,
            nativeNow = getNative(Date, 'now'),
            nativeParseInt = context.parseInt,
            nativeRandom = Math.random;
        var NEGATIVE_INFINITY = Number.NEGATIVE_INFINITY,
            POSITIVE_INFINITY = Number.POSITIVE_INFINITY;
        var MAX_ARRAY_LENGTH = 4294967295,
            MAX_ARRAY_INDEX = MAX_ARRAY_LENGTH - 1,
            HALF_MAX_ARRAY_LENGTH = MAX_ARRAY_LENGTH >>> 1;
        var MAX_SAFE_INTEGER = 9007199254740991;
        var metaMap = WeakMap && new WeakMap;
        var realNames = {};
        function lodash(value) {
          if (isObjectLike(value) && !isArray(value) && !(value instanceof LazyWrapper)) {
            if (value instanceof LodashWrapper) {
              return value;
            }
            if (hasOwnProperty.call(value, '__chain__') && hasOwnProperty.call(value, '__wrapped__')) {
              return wrapperClone(value);
            }
          }
          return new LodashWrapper(value);
        }
        function baseLodash() {}
        function LodashWrapper(value, chainAll, actions) {
          this.__wrapped__ = value;
          this.__actions__ = actions || [];
          this.__chain__ = !!chainAll;
        }
        var support = lodash.support = {};
        lodash.templateSettings = {
          'escape': reEscape,
          'evaluate': reEvaluate,
          'interpolate': reInterpolate,
          'variable': '',
          'imports': {'_': lodash}
        };
        function LazyWrapper(value) {
          this.__wrapped__ = value;
          this.__actions__ = [];
          this.__dir__ = 1;
          this.__filtered__ = false;
          this.__iteratees__ = [];
          this.__takeCount__ = POSITIVE_INFINITY;
          this.__views__ = [];
        }
        function lazyClone() {
          var result = new LazyWrapper(this.__wrapped__);
          result.__actions__ = arrayCopy(this.__actions__);
          result.__dir__ = this.__dir__;
          result.__filtered__ = this.__filtered__;
          result.__iteratees__ = arrayCopy(this.__iteratees__);
          result.__takeCount__ = this.__takeCount__;
          result.__views__ = arrayCopy(this.__views__);
          return result;
        }
        function lazyReverse() {
          if (this.__filtered__) {
            var result = new LazyWrapper(this);
            result.__dir__ = -1;
            result.__filtered__ = true;
          } else {
            result = this.clone();
            result.__dir__ *= -1;
          }
          return result;
        }
        function lazyValue() {
          var array = this.__wrapped__.value(),
              dir = this.__dir__,
              isArr = isArray(array),
              isRight = dir < 0,
              arrLength = isArr ? array.length : 0,
              view = getView(0, arrLength, this.__views__),
              start = view.start,
              end = view.end,
              length = end - start,
              index = isRight ? end : (start - 1),
              iteratees = this.__iteratees__,
              iterLength = iteratees.length,
              resIndex = 0,
              takeCount = nativeMin(length, this.__takeCount__);
          if (!isArr || arrLength < LARGE_ARRAY_SIZE || (arrLength == length && takeCount == length)) {
            return baseWrapperValue((isRight && isArr) ? array.reverse() : array, this.__actions__);
          }
          var result = [];
          outer: while (length-- && resIndex < takeCount) {
            index += dir;
            var iterIndex = -1,
                value = array[index];
            while (++iterIndex < iterLength) {
              var data = iteratees[iterIndex],
                  iteratee = data.iteratee,
                  type = data.type,
                  computed = iteratee(value);
              if (type == LAZY_MAP_FLAG) {
                value = computed;
              } else if (!computed) {
                if (type == LAZY_FILTER_FLAG) {
                  continue outer;
                } else {
                  break outer;
                }
              }
            }
            result[resIndex++] = value;
          }
          return result;
        }
        function MapCache() {
          this.__data__ = {};
        }
        function mapDelete(key) {
          return this.has(key) && delete this.__data__[key];
        }
        function mapGet(key) {
          return key == '__proto__' ? undefined : this.__data__[key];
        }
        function mapHas(key) {
          return key != '__proto__' && hasOwnProperty.call(this.__data__, key);
        }
        function mapSet(key, value) {
          if (key != '__proto__') {
            this.__data__[key] = value;
          }
          return this;
        }
        function SetCache(values) {
          var length = values ? values.length : 0;
          this.data = {
            'hash': nativeCreate(null),
            'set': new Set
          };
          while (length--) {
            this.push(values[length]);
          }
        }
        function cacheIndexOf(cache, value) {
          var data = cache.data,
              result = (typeof value == 'string' || isObject(value)) ? data.set.has(value) : data.hash[value];
          return result ? 0 : -1;
        }
        function cachePush(value) {
          var data = this.data;
          if (typeof value == 'string' || isObject(value)) {
            data.set.add(value);
          } else {
            data.hash[value] = true;
          }
        }
        function arrayConcat(array, other) {
          var index = -1,
              length = array.length,
              othIndex = -1,
              othLength = other.length,
              result = Array(length + othLength);
          while (++index < length) {
            result[index] = array[index];
          }
          while (++othIndex < othLength) {
            result[index++] = other[othIndex];
          }
          return result;
        }
        function arrayCopy(source, array) {
          var index = -1,
              length = source.length;
          array || (array = Array(length));
          while (++index < length) {
            array[index] = source[index];
          }
          return array;
        }
        function arrayEach(array, iteratee) {
          var index = -1,
              length = array.length;
          while (++index < length) {
            if (iteratee(array[index], index, array) === false) {
              break;
            }
          }
          return array;
        }
        function arrayEachRight(array, iteratee) {
          var length = array.length;
          while (length--) {
            if (iteratee(array[length], length, array) === false) {
              break;
            }
          }
          return array;
        }
        function arrayEvery(array, predicate) {
          var index = -1,
              length = array.length;
          while (++index < length) {
            if (!predicate(array[index], index, array)) {
              return false;
            }
          }
          return true;
        }
        function arrayExtremum(array, iteratee, comparator, exValue) {
          var index = -1,
              length = array.length,
              computed = exValue,
              result = computed;
          while (++index < length) {
            var value = array[index],
                current = +iteratee(value);
            if (comparator(current, computed)) {
              computed = current;
              result = value;
            }
          }
          return result;
        }
        function arrayFilter(array, predicate) {
          var index = -1,
              length = array.length,
              resIndex = -1,
              result = [];
          while (++index < length) {
            var value = array[index];
            if (predicate(value, index, array)) {
              result[++resIndex] = value;
            }
          }
          return result;
        }
        function arrayMap(array, iteratee) {
          var index = -1,
              length = array.length,
              result = Array(length);
          while (++index < length) {
            result[index] = iteratee(array[index], index, array);
          }
          return result;
        }
        function arrayPush(array, values) {
          var index = -1,
              length = values.length,
              offset = array.length;
          while (++index < length) {
            array[offset + index] = values[index];
          }
          return array;
        }
        function arrayReduce(array, iteratee, accumulator, initFromArray) {
          var index = -1,
              length = array.length;
          if (initFromArray && length) {
            accumulator = array[++index];
          }
          while (++index < length) {
            accumulator = iteratee(accumulator, array[index], index, array);
          }
          return accumulator;
        }
        function arrayReduceRight(array, iteratee, accumulator, initFromArray) {
          var length = array.length;
          if (initFromArray && length) {
            accumulator = array[--length];
          }
          while (length--) {
            accumulator = iteratee(accumulator, array[length], length, array);
          }
          return accumulator;
        }
        function arraySome(array, predicate) {
          var index = -1,
              length = array.length;
          while (++index < length) {
            if (predicate(array[index], index, array)) {
              return true;
            }
          }
          return false;
        }
        function arraySum(array, iteratee) {
          var length = array.length,
              result = 0;
          while (length--) {
            result += +iteratee(array[length]) || 0;
          }
          return result;
        }
        function assignDefaults(objectValue, sourceValue) {
          return objectValue === undefined ? sourceValue : objectValue;
        }
        function assignOwnDefaults(objectValue, sourceValue, key, object) {
          return (objectValue === undefined || !hasOwnProperty.call(object, key)) ? sourceValue : objectValue;
        }
        function assignWith(object, source, customizer) {
          var index = -1,
              props = keys(source),
              length = props.length;
          while (++index < length) {
            var key = props[index],
                value = object[key],
                result = customizer(value, source[key], key, object, source);
            if ((result === result ? (result !== value) : (value === value)) || (value === undefined && !(key in object))) {
              object[key] = result;
            }
          }
          return object;
        }
        function baseAssign(object, source) {
          return source == null ? object : baseCopy(source, keys(source), object);
        }
        function baseAt(collection, props) {
          var index = -1,
              isNil = collection == null,
              isArr = !isNil && isArrayLike(collection),
              length = isArr ? collection.length : 0,
              propsLength = props.length,
              result = Array(propsLength);
          while (++index < propsLength) {
            var key = props[index];
            if (isArr) {
              result[index] = isIndex(key, length) ? collection[key] : undefined;
            } else {
              result[index] = isNil ? undefined : collection[key];
            }
          }
          return result;
        }
        function baseCopy(source, props, object) {
          object || (object = {});
          var index = -1,
              length = props.length;
          while (++index < length) {
            var key = props[index];
            object[key] = source[key];
          }
          return object;
        }
        function baseCallback(func, thisArg, argCount) {
          var type = typeof func;
          if (type == 'function') {
            return thisArg === undefined ? func : bindCallback(func, thisArg, argCount);
          }
          if (func == null) {
            return identity;
          }
          if (type == 'object') {
            return baseMatches(func);
          }
          return thisArg === undefined ? property(func) : baseMatchesProperty(func, thisArg);
        }
        function baseClone(value, isDeep, customizer, key, object, stackA, stackB) {
          var result;
          if (customizer) {
            result = object ? customizer(value, key, object) : customizer(value);
          }
          if (result !== undefined) {
            return result;
          }
          if (!isObject(value)) {
            return value;
          }
          var isArr = isArray(value);
          if (isArr) {
            result = initCloneArray(value);
            if (!isDeep) {
              return arrayCopy(value, result);
            }
          } else {
            var tag = objToString.call(value),
                isFunc = tag == funcTag;
            if (tag == objectTag || tag == argsTag || (isFunc && !object)) {
              result = initCloneObject(isFunc ? {} : value);
              if (!isDeep) {
                return baseAssign(result, value);
              }
            } else {
              return cloneableTags[tag] ? initCloneByTag(value, tag, isDeep) : (object ? value : {});
            }
          }
          stackA || (stackA = []);
          stackB || (stackB = []);
          var length = stackA.length;
          while (length--) {
            if (stackA[length] == value) {
              return stackB[length];
            }
          }
          stackA.push(value);
          stackB.push(result);
          (isArr ? arrayEach : baseForOwn)(value, function(subValue, key) {
            result[key] = baseClone(subValue, isDeep, customizer, key, value, stackA, stackB);
          });
          return result;
        }
        var baseCreate = (function() {
          function object() {}
          return function(prototype) {
            if (isObject(prototype)) {
              object.prototype = prototype;
              var result = new object;
              object.prototype = undefined;
            }
            return result || {};
          };
        }());
        function baseDelay(func, wait, args) {
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          return setTimeout(function() {
            func.apply(undefined, args);
          }, wait);
        }
        function baseDifference(array, values) {
          var length = array ? array.length : 0,
              result = [];
          if (!length) {
            return result;
          }
          var index = -1,
              indexOf = getIndexOf(),
              isCommon = indexOf == baseIndexOf,
              cache = (isCommon && values.length >= LARGE_ARRAY_SIZE) ? createCache(values) : null,
              valuesLength = values.length;
          if (cache) {
            indexOf = cacheIndexOf;
            isCommon = false;
            values = cache;
          }
          outer: while (++index < length) {
            var value = array[index];
            if (isCommon && value === value) {
              var valuesIndex = valuesLength;
              while (valuesIndex--) {
                if (values[valuesIndex] === value) {
                  continue outer;
                }
              }
              result.push(value);
            } else if (indexOf(values, value, 0) < 0) {
              result.push(value);
            }
          }
          return result;
        }
        var baseEach = createBaseEach(baseForOwn);
        var baseEachRight = createBaseEach(baseForOwnRight, true);
        function baseEvery(collection, predicate) {
          var result = true;
          baseEach(collection, function(value, index, collection) {
            result = !!predicate(value, index, collection);
            return result;
          });
          return result;
        }
        function baseExtremum(collection, iteratee, comparator, exValue) {
          var computed = exValue,
              result = computed;
          baseEach(collection, function(value, index, collection) {
            var current = +iteratee(value, index, collection);
            if (comparator(current, computed) || (current === exValue && current === result)) {
              computed = current;
              result = value;
            }
          });
          return result;
        }
        function baseFill(array, value, start, end) {
          var length = array.length;
          start = start == null ? 0 : (+start || 0);
          if (start < 0) {
            start = -start > length ? 0 : (length + start);
          }
          end = (end === undefined || end > length) ? length : (+end || 0);
          if (end < 0) {
            end += length;
          }
          length = start > end ? 0 : (end >>> 0);
          start >>>= 0;
          while (start < length) {
            array[start++] = value;
          }
          return array;
        }
        function baseFilter(collection, predicate) {
          var result = [];
          baseEach(collection, function(value, index, collection) {
            if (predicate(value, index, collection)) {
              result.push(value);
            }
          });
          return result;
        }
        function baseFind(collection, predicate, eachFunc, retKey) {
          var result;
          eachFunc(collection, function(value, key, collection) {
            if (predicate(value, key, collection)) {
              result = retKey ? key : value;
              return false;
            }
          });
          return result;
        }
        function baseFlatten(array, isDeep, isStrict, result) {
          result || (result = []);
          var index = -1,
              length = array.length;
          while (++index < length) {
            var value = array[index];
            if (isObjectLike(value) && isArrayLike(value) && (isStrict || isArray(value) || isArguments(value))) {
              if (isDeep) {
                baseFlatten(value, isDeep, isStrict, result);
              } else {
                arrayPush(result, value);
              }
            } else if (!isStrict) {
              result[result.length] = value;
            }
          }
          return result;
        }
        var baseFor = createBaseFor();
        var baseForRight = createBaseFor(true);
        function baseForIn(object, iteratee) {
          return baseFor(object, iteratee, keysIn);
        }
        function baseForOwn(object, iteratee) {
          return baseFor(object, iteratee, keys);
        }
        function baseForOwnRight(object, iteratee) {
          return baseForRight(object, iteratee, keys);
        }
        function baseFunctions(object, props) {
          var index = -1,
              length = props.length,
              resIndex = -1,
              result = [];
          while (++index < length) {
            var key = props[index];
            if (isFunction(object[key])) {
              result[++resIndex] = key;
            }
          }
          return result;
        }
        function baseGet(object, path, pathKey) {
          if (object == null) {
            return;
          }
          if (pathKey !== undefined && pathKey in toObject(object)) {
            path = [pathKey];
          }
          var index = 0,
              length = path.length;
          while (object != null && index < length) {
            object = object[path[index++]];
          }
          return (index && index == length) ? object : undefined;
        }
        function baseIsEqual(value, other, customizer, isLoose, stackA, stackB) {
          if (value === other) {
            return true;
          }
          if (value == null || other == null || (!isObject(value) && !isObjectLike(other))) {
            return value !== value && other !== other;
          }
          return baseIsEqualDeep(value, other, baseIsEqual, customizer, isLoose, stackA, stackB);
        }
        function baseIsEqualDeep(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
          var objIsArr = isArray(object),
              othIsArr = isArray(other),
              objTag = arrayTag,
              othTag = arrayTag;
          if (!objIsArr) {
            objTag = objToString.call(object);
            if (objTag == argsTag) {
              objTag = objectTag;
            } else if (objTag != objectTag) {
              objIsArr = isTypedArray(object);
            }
          }
          if (!othIsArr) {
            othTag = objToString.call(other);
            if (othTag == argsTag) {
              othTag = objectTag;
            } else if (othTag != objectTag) {
              othIsArr = isTypedArray(other);
            }
          }
          var objIsObj = objTag == objectTag,
              othIsObj = othTag == objectTag,
              isSameTag = objTag == othTag;
          if (isSameTag && !(objIsArr || objIsObj)) {
            return equalByTag(object, other, objTag);
          }
          if (!isLoose) {
            var objIsWrapped = objIsObj && hasOwnProperty.call(object, '__wrapped__'),
                othIsWrapped = othIsObj && hasOwnProperty.call(other, '__wrapped__');
            if (objIsWrapped || othIsWrapped) {
              return equalFunc(objIsWrapped ? object.value() : object, othIsWrapped ? other.value() : other, customizer, isLoose, stackA, stackB);
            }
          }
          if (!isSameTag) {
            return false;
          }
          stackA || (stackA = []);
          stackB || (stackB = []);
          var length = stackA.length;
          while (length--) {
            if (stackA[length] == object) {
              return stackB[length] == other;
            }
          }
          stackA.push(object);
          stackB.push(other);
          var result = (objIsArr ? equalArrays : equalObjects)(object, other, equalFunc, customizer, isLoose, stackA, stackB);
          stackA.pop();
          stackB.pop();
          return result;
        }
        function baseIsMatch(object, matchData, customizer) {
          var index = matchData.length,
              length = index,
              noCustomizer = !customizer;
          if (object == null) {
            return !length;
          }
          object = toObject(object);
          while (index--) {
            var data = matchData[index];
            if ((noCustomizer && data[2]) ? data[1] !== object[data[0]] : !(data[0] in object)) {
              return false;
            }
          }
          while (++index < length) {
            data = matchData[index];
            var key = data[0],
                objValue = object[key],
                srcValue = data[1];
            if (noCustomizer && data[2]) {
              if (objValue === undefined && !(key in object)) {
                return false;
              }
            } else {
              var result = customizer ? customizer(objValue, srcValue, key) : undefined;
              if (!(result === undefined ? baseIsEqual(srcValue, objValue, customizer, true) : result)) {
                return false;
              }
            }
          }
          return true;
        }
        function baseMap(collection, iteratee) {
          var index = -1,
              result = isArrayLike(collection) ? Array(collection.length) : [];
          baseEach(collection, function(value, key, collection) {
            result[++index] = iteratee(value, key, collection);
          });
          return result;
        }
        function baseMatches(source) {
          var matchData = getMatchData(source);
          if (matchData.length == 1 && matchData[0][2]) {
            var key = matchData[0][0],
                value = matchData[0][1];
            return function(object) {
              if (object == null) {
                return false;
              }
              return object[key] === value && (value !== undefined || (key in toObject(object)));
            };
          }
          return function(object) {
            return baseIsMatch(object, matchData);
          };
        }
        function baseMatchesProperty(path, srcValue) {
          var isArr = isArray(path),
              isCommon = isKey(path) && isStrictComparable(srcValue),
              pathKey = (path + '');
          path = toPath(path);
          return function(object) {
            if (object == null) {
              return false;
            }
            var key = pathKey;
            object = toObject(object);
            if ((isArr || !isCommon) && !(key in object)) {
              object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
              if (object == null) {
                return false;
              }
              key = last(path);
              object = toObject(object);
            }
            return object[key] === srcValue ? (srcValue !== undefined || (key in object)) : baseIsEqual(srcValue, object[key], undefined, true);
          };
        }
        function baseMerge(object, source, customizer, stackA, stackB) {
          if (!isObject(object)) {
            return object;
          }
          var isSrcArr = isArrayLike(source) && (isArray(source) || isTypedArray(source)),
              props = isSrcArr ? undefined : keys(source);
          arrayEach(props || source, function(srcValue, key) {
            if (props) {
              key = srcValue;
              srcValue = source[key];
            }
            if (isObjectLike(srcValue)) {
              stackA || (stackA = []);
              stackB || (stackB = []);
              baseMergeDeep(object, source, key, baseMerge, customizer, stackA, stackB);
            } else {
              var value = object[key],
                  result = customizer ? customizer(value, srcValue, key, object, source) : undefined,
                  isCommon = result === undefined;
              if (isCommon) {
                result = srcValue;
              }
              if ((result !== undefined || (isSrcArr && !(key in object))) && (isCommon || (result === result ? (result !== value) : (value === value)))) {
                object[key] = result;
              }
            }
          });
          return object;
        }
        function baseMergeDeep(object, source, key, mergeFunc, customizer, stackA, stackB) {
          var length = stackA.length,
              srcValue = source[key];
          while (length--) {
            if (stackA[length] == srcValue) {
              object[key] = stackB[length];
              return;
            }
          }
          var value = object[key],
              result = customizer ? customizer(value, srcValue, key, object, source) : undefined,
              isCommon = result === undefined;
          if (isCommon) {
            result = srcValue;
            if (isArrayLike(srcValue) && (isArray(srcValue) || isTypedArray(srcValue))) {
              result = isArray(value) ? value : (isArrayLike(value) ? arrayCopy(value) : []);
            } else if (isPlainObject(srcValue) || isArguments(srcValue)) {
              result = isArguments(value) ? toPlainObject(value) : (isPlainObject(value) ? value : {});
            } else {
              isCommon = false;
            }
          }
          stackA.push(srcValue);
          stackB.push(result);
          if (isCommon) {
            object[key] = mergeFunc(result, srcValue, customizer, stackA, stackB);
          } else if (result === result ? (result !== value) : (value === value)) {
            object[key] = result;
          }
        }
        function baseProperty(key) {
          return function(object) {
            return object == null ? undefined : object[key];
          };
        }
        function basePropertyDeep(path) {
          var pathKey = (path + '');
          path = toPath(path);
          return function(object) {
            return baseGet(object, path, pathKey);
          };
        }
        function basePullAt(array, indexes) {
          var length = array ? indexes.length : 0;
          while (length--) {
            var index = indexes[length];
            if (index != previous && isIndex(index)) {
              var previous = index;
              splice.call(array, index, 1);
            }
          }
          return array;
        }
        function baseRandom(min, max) {
          return min + nativeFloor(nativeRandom() * (max - min + 1));
        }
        function baseReduce(collection, iteratee, accumulator, initFromCollection, eachFunc) {
          eachFunc(collection, function(value, index, collection) {
            accumulator = initFromCollection ? (initFromCollection = false, value) : iteratee(accumulator, value, index, collection);
          });
          return accumulator;
        }
        var baseSetData = !metaMap ? identity : function(func, data) {
          metaMap.set(func, data);
          return func;
        };
        function baseSlice(array, start, end) {
          var index = -1,
              length = array.length;
          start = start == null ? 0 : (+start || 0);
          if (start < 0) {
            start = -start > length ? 0 : (length + start);
          }
          end = (end === undefined || end > length) ? length : (+end || 0);
          if (end < 0) {
            end += length;
          }
          length = start > end ? 0 : ((end - start) >>> 0);
          start >>>= 0;
          var result = Array(length);
          while (++index < length) {
            result[index] = array[index + start];
          }
          return result;
        }
        function baseSome(collection, predicate) {
          var result;
          baseEach(collection, function(value, index, collection) {
            result = predicate(value, index, collection);
            return !result;
          });
          return !!result;
        }
        function baseSortBy(array, comparer) {
          var length = array.length;
          array.sort(comparer);
          while (length--) {
            array[length] = array[length].value;
          }
          return array;
        }
        function baseSortByOrder(collection, iteratees, orders) {
          var callback = getCallback(),
              index = -1;
          iteratees = arrayMap(iteratees, function(iteratee) {
            return callback(iteratee);
          });
          var result = baseMap(collection, function(value) {
            var criteria = arrayMap(iteratees, function(iteratee) {
              return iteratee(value);
            });
            return {
              'criteria': criteria,
              'index': ++index,
              'value': value
            };
          });
          return baseSortBy(result, function(object, other) {
            return compareMultiple(object, other, orders);
          });
        }
        function baseSum(collection, iteratee) {
          var result = 0;
          baseEach(collection, function(value, index, collection) {
            result += +iteratee(value, index, collection) || 0;
          });
          return result;
        }
        function baseUniq(array, iteratee) {
          var index = -1,
              indexOf = getIndexOf(),
              length = array.length,
              isCommon = indexOf == baseIndexOf,
              isLarge = isCommon && length >= LARGE_ARRAY_SIZE,
              seen = isLarge ? createCache() : null,
              result = [];
          if (seen) {
            indexOf = cacheIndexOf;
            isCommon = false;
          } else {
            isLarge = false;
            seen = iteratee ? [] : result;
          }
          outer: while (++index < length) {
            var value = array[index],
                computed = iteratee ? iteratee(value, index, array) : value;
            if (isCommon && value === value) {
              var seenIndex = seen.length;
              while (seenIndex--) {
                if (seen[seenIndex] === computed) {
                  continue outer;
                }
              }
              if (iteratee) {
                seen.push(computed);
              }
              result.push(value);
            } else if (indexOf(seen, computed, 0) < 0) {
              if (iteratee || isLarge) {
                seen.push(computed);
              }
              result.push(value);
            }
          }
          return result;
        }
        function baseValues(object, props) {
          var index = -1,
              length = props.length,
              result = Array(length);
          while (++index < length) {
            result[index] = object[props[index]];
          }
          return result;
        }
        function baseWhile(array, predicate, isDrop, fromRight) {
          var length = array.length,
              index = fromRight ? length : -1;
          while ((fromRight ? index-- : ++index < length) && predicate(array[index], index, array)) {}
          return isDrop ? baseSlice(array, (fromRight ? 0 : index), (fromRight ? index + 1 : length)) : baseSlice(array, (fromRight ? index + 1 : 0), (fromRight ? length : index));
        }
        function baseWrapperValue(value, actions) {
          var result = value;
          if (result instanceof LazyWrapper) {
            result = result.value();
          }
          var index = -1,
              length = actions.length;
          while (++index < length) {
            var action = actions[index];
            result = action.func.apply(action.thisArg, arrayPush([result], action.args));
          }
          return result;
        }
        function binaryIndex(array, value, retHighest) {
          var low = 0,
              high = array ? array.length : low;
          if (typeof value == 'number' && value === value && high <= HALF_MAX_ARRAY_LENGTH) {
            while (low < high) {
              var mid = (low + high) >>> 1,
                  computed = array[mid];
              if ((retHighest ? (computed <= value) : (computed < value)) && computed !== null) {
                low = mid + 1;
              } else {
                high = mid;
              }
            }
            return high;
          }
          return binaryIndexBy(array, value, identity, retHighest);
        }
        function binaryIndexBy(array, value, iteratee, retHighest) {
          value = iteratee(value);
          var low = 0,
              high = array ? array.length : 0,
              valIsNaN = value !== value,
              valIsNull = value === null,
              valIsUndef = value === undefined;
          while (low < high) {
            var mid = nativeFloor((low + high) / 2),
                computed = iteratee(array[mid]),
                isDef = computed !== undefined,
                isReflexive = computed === computed;
            if (valIsNaN) {
              var setLow = isReflexive || retHighest;
            } else if (valIsNull) {
              setLow = isReflexive && isDef && (retHighest || computed != null);
            } else if (valIsUndef) {
              setLow = isReflexive && (retHighest || isDef);
            } else if (computed == null) {
              setLow = false;
            } else {
              setLow = retHighest ? (computed <= value) : (computed < value);
            }
            if (setLow) {
              low = mid + 1;
            } else {
              high = mid;
            }
          }
          return nativeMin(high, MAX_ARRAY_INDEX);
        }
        function bindCallback(func, thisArg, argCount) {
          if (typeof func != 'function') {
            return identity;
          }
          if (thisArg === undefined) {
            return func;
          }
          switch (argCount) {
            case 1:
              return function(value) {
                return func.call(thisArg, value);
              };
            case 3:
              return function(value, index, collection) {
                return func.call(thisArg, value, index, collection);
              };
            case 4:
              return function(accumulator, value, index, collection) {
                return func.call(thisArg, accumulator, value, index, collection);
              };
            case 5:
              return function(value, other, key, object, source) {
                return func.call(thisArg, value, other, key, object, source);
              };
          }
          return function() {
            return func.apply(thisArg, arguments);
          };
        }
        function bufferClone(buffer) {
          var result = new ArrayBuffer(buffer.byteLength),
              view = new Uint8Array(result);
          view.set(new Uint8Array(buffer));
          return result;
        }
        function composeArgs(args, partials, holders) {
          var holdersLength = holders.length,
              argsIndex = -1,
              argsLength = nativeMax(args.length - holdersLength, 0),
              leftIndex = -1,
              leftLength = partials.length,
              result = Array(leftLength + argsLength);
          while (++leftIndex < leftLength) {
            result[leftIndex] = partials[leftIndex];
          }
          while (++argsIndex < holdersLength) {
            result[holders[argsIndex]] = args[argsIndex];
          }
          while (argsLength--) {
            result[leftIndex++] = args[argsIndex++];
          }
          return result;
        }
        function composeArgsRight(args, partials, holders) {
          var holdersIndex = -1,
              holdersLength = holders.length,
              argsIndex = -1,
              argsLength = nativeMax(args.length - holdersLength, 0),
              rightIndex = -1,
              rightLength = partials.length,
              result = Array(argsLength + rightLength);
          while (++argsIndex < argsLength) {
            result[argsIndex] = args[argsIndex];
          }
          var offset = argsIndex;
          while (++rightIndex < rightLength) {
            result[offset + rightIndex] = partials[rightIndex];
          }
          while (++holdersIndex < holdersLength) {
            result[offset + holders[holdersIndex]] = args[argsIndex++];
          }
          return result;
        }
        function createAggregator(setter, initializer) {
          return function(collection, iteratee, thisArg) {
            var result = initializer ? initializer() : {};
            iteratee = getCallback(iteratee, thisArg, 3);
            if (isArray(collection)) {
              var index = -1,
                  length = collection.length;
              while (++index < length) {
                var value = collection[index];
                setter(result, value, iteratee(value, index, collection), collection);
              }
            } else {
              baseEach(collection, function(value, key, collection) {
                setter(result, value, iteratee(value, key, collection), collection);
              });
            }
            return result;
          };
        }
        function createAssigner(assigner) {
          return restParam(function(object, sources) {
            var index = -1,
                length = object == null ? 0 : sources.length,
                customizer = length > 2 ? sources[length - 2] : undefined,
                guard = length > 2 ? sources[2] : undefined,
                thisArg = length > 1 ? sources[length - 1] : undefined;
            if (typeof customizer == 'function') {
              customizer = bindCallback(customizer, thisArg, 5);
              length -= 2;
            } else {
              customizer = typeof thisArg == 'function' ? thisArg : undefined;
              length -= (customizer ? 1 : 0);
            }
            if (guard && isIterateeCall(sources[0], sources[1], guard)) {
              customizer = length < 3 ? undefined : customizer;
              length = 1;
            }
            while (++index < length) {
              var source = sources[index];
              if (source) {
                assigner(object, source, customizer);
              }
            }
            return object;
          });
        }
        function createBaseEach(eachFunc, fromRight) {
          return function(collection, iteratee) {
            var length = collection ? getLength(collection) : 0;
            if (!isLength(length)) {
              return eachFunc(collection, iteratee);
            }
            var index = fromRight ? length : -1,
                iterable = toObject(collection);
            while ((fromRight ? index-- : ++index < length)) {
              if (iteratee(iterable[index], index, iterable) === false) {
                break;
              }
            }
            return collection;
          };
        }
        function createBaseFor(fromRight) {
          return function(object, iteratee, keysFunc) {
            var iterable = toObject(object),
                props = keysFunc(object),
                length = props.length,
                index = fromRight ? length : -1;
            while ((fromRight ? index-- : ++index < length)) {
              var key = props[index];
              if (iteratee(iterable[key], key, iterable) === false) {
                break;
              }
            }
            return object;
          };
        }
        function createBindWrapper(func, thisArg) {
          var Ctor = createCtorWrapper(func);
          function wrapper() {
            var fn = (this && this !== root && this instanceof wrapper) ? Ctor : func;
            return fn.apply(thisArg, arguments);
          }
          return wrapper;
        }
        function createCache(values) {
          return (nativeCreate && Set) ? new SetCache(values) : null;
        }
        function createCompounder(callback) {
          return function(string) {
            var index = -1,
                array = words(deburr(string)),
                length = array.length,
                result = '';
            while (++index < length) {
              result = callback(result, array[index], index);
            }
            return result;
          };
        }
        function createCtorWrapper(Ctor) {
          return function() {
            var args = arguments;
            switch (args.length) {
              case 0:
                return new Ctor;
              case 1:
                return new Ctor(args[0]);
              case 2:
                return new Ctor(args[0], args[1]);
              case 3:
                return new Ctor(args[0], args[1], args[2]);
              case 4:
                return new Ctor(args[0], args[1], args[2], args[3]);
              case 5:
                return new Ctor(args[0], args[1], args[2], args[3], args[4]);
              case 6:
                return new Ctor(args[0], args[1], args[2], args[3], args[4], args[5]);
              case 7:
                return new Ctor(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
            }
            var thisBinding = baseCreate(Ctor.prototype),
                result = Ctor.apply(thisBinding, args);
            return isObject(result) ? result : thisBinding;
          };
        }
        function createCurry(flag) {
          function curryFunc(func, arity, guard) {
            if (guard && isIterateeCall(func, arity, guard)) {
              arity = undefined;
            }
            var result = createWrapper(func, flag, undefined, undefined, undefined, undefined, undefined, arity);
            result.placeholder = curryFunc.placeholder;
            return result;
          }
          return curryFunc;
        }
        function createDefaults(assigner, customizer) {
          return restParam(function(args) {
            var object = args[0];
            if (object == null) {
              return object;
            }
            args.push(customizer);
            return assigner.apply(undefined, args);
          });
        }
        function createExtremum(comparator, exValue) {
          return function(collection, iteratee, thisArg) {
            if (thisArg && isIterateeCall(collection, iteratee, thisArg)) {
              iteratee = undefined;
            }
            iteratee = getCallback(iteratee, thisArg, 3);
            if (iteratee.length == 1) {
              collection = isArray(collection) ? collection : toIterable(collection);
              var result = arrayExtremum(collection, iteratee, comparator, exValue);
              if (!(collection.length && result === exValue)) {
                return result;
              }
            }
            return baseExtremum(collection, iteratee, comparator, exValue);
          };
        }
        function createFind(eachFunc, fromRight) {
          return function(collection, predicate, thisArg) {
            predicate = getCallback(predicate, thisArg, 3);
            if (isArray(collection)) {
              var index = baseFindIndex(collection, predicate, fromRight);
              return index > -1 ? collection[index] : undefined;
            }
            return baseFind(collection, predicate, eachFunc);
          };
        }
        function createFindIndex(fromRight) {
          return function(array, predicate, thisArg) {
            if (!(array && array.length)) {
              return -1;
            }
            predicate = getCallback(predicate, thisArg, 3);
            return baseFindIndex(array, predicate, fromRight);
          };
        }
        function createFindKey(objectFunc) {
          return function(object, predicate, thisArg) {
            predicate = getCallback(predicate, thisArg, 3);
            return baseFind(object, predicate, objectFunc, true);
          };
        }
        function createFlow(fromRight) {
          return function() {
            var wrapper,
                length = arguments.length,
                index = fromRight ? length : -1,
                leftIndex = 0,
                funcs = Array(length);
            while ((fromRight ? index-- : ++index < length)) {
              var func = funcs[leftIndex++] = arguments[index];
              if (typeof func != 'function') {
                throw new TypeError(FUNC_ERROR_TEXT);
              }
              if (!wrapper && LodashWrapper.prototype.thru && getFuncName(func) == 'wrapper') {
                wrapper = new LodashWrapper([], true);
              }
            }
            index = wrapper ? -1 : length;
            while (++index < length) {
              func = funcs[index];
              var funcName = getFuncName(func),
                  data = funcName == 'wrapper' ? getData(func) : undefined;
              if (data && isLaziable(data[0]) && data[1] == (ARY_FLAG | CURRY_FLAG | PARTIAL_FLAG | REARG_FLAG) && !data[4].length && data[9] == 1) {
                wrapper = wrapper[getFuncName(data[0])].apply(wrapper, data[3]);
              } else {
                wrapper = (func.length == 1 && isLaziable(func)) ? wrapper[funcName]() : wrapper.thru(func);
              }
            }
            return function() {
              var args = arguments,
                  value = args[0];
              if (wrapper && args.length == 1 && isArray(value) && value.length >= LARGE_ARRAY_SIZE) {
                return wrapper.plant(value).value();
              }
              var index = 0,
                  result = length ? funcs[index].apply(this, args) : value;
              while (++index < length) {
                result = funcs[index].call(this, result);
              }
              return result;
            };
          };
        }
        function createForEach(arrayFunc, eachFunc) {
          return function(collection, iteratee, thisArg) {
            return (typeof iteratee == 'function' && thisArg === undefined && isArray(collection)) ? arrayFunc(collection, iteratee) : eachFunc(collection, bindCallback(iteratee, thisArg, 3));
          };
        }
        function createForIn(objectFunc) {
          return function(object, iteratee, thisArg) {
            if (typeof iteratee != 'function' || thisArg !== undefined) {
              iteratee = bindCallback(iteratee, thisArg, 3);
            }
            return objectFunc(object, iteratee, keysIn);
          };
        }
        function createForOwn(objectFunc) {
          return function(object, iteratee, thisArg) {
            if (typeof iteratee != 'function' || thisArg !== undefined) {
              iteratee = bindCallback(iteratee, thisArg, 3);
            }
            return objectFunc(object, iteratee);
          };
        }
        function createObjectMapper(isMapKeys) {
          return function(object, iteratee, thisArg) {
            var result = {};
            iteratee = getCallback(iteratee, thisArg, 3);
            baseForOwn(object, function(value, key, object) {
              var mapped = iteratee(value, key, object);
              key = isMapKeys ? mapped : key;
              value = isMapKeys ? value : mapped;
              result[key] = value;
            });
            return result;
          };
        }
        function createPadDir(fromRight) {
          return function(string, length, chars) {
            string = baseToString(string);
            return (fromRight ? string : '') + createPadding(string, length, chars) + (fromRight ? '' : string);
          };
        }
        function createPartial(flag) {
          var partialFunc = restParam(function(func, partials) {
            var holders = replaceHolders(partials, partialFunc.placeholder);
            return createWrapper(func, flag, undefined, partials, holders);
          });
          return partialFunc;
        }
        function createReduce(arrayFunc, eachFunc) {
          return function(collection, iteratee, accumulator, thisArg) {
            var initFromArray = arguments.length < 3;
            return (typeof iteratee == 'function' && thisArg === undefined && isArray(collection)) ? arrayFunc(collection, iteratee, accumulator, initFromArray) : baseReduce(collection, getCallback(iteratee, thisArg, 4), accumulator, initFromArray, eachFunc);
          };
        }
        function createHybridWrapper(func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity) {
          var isAry = bitmask & ARY_FLAG,
              isBind = bitmask & BIND_FLAG,
              isBindKey = bitmask & BIND_KEY_FLAG,
              isCurry = bitmask & CURRY_FLAG,
              isCurryBound = bitmask & CURRY_BOUND_FLAG,
              isCurryRight = bitmask & CURRY_RIGHT_FLAG,
              Ctor = isBindKey ? undefined : createCtorWrapper(func);
          function wrapper() {
            var length = arguments.length,
                index = length,
                args = Array(length);
            while (index--) {
              args[index] = arguments[index];
            }
            if (partials) {
              args = composeArgs(args, partials, holders);
            }
            if (partialsRight) {
              args = composeArgsRight(args, partialsRight, holdersRight);
            }
            if (isCurry || isCurryRight) {
              var placeholder = wrapper.placeholder,
                  argsHolders = replaceHolders(args, placeholder);
              length -= argsHolders.length;
              if (length < arity) {
                var newArgPos = argPos ? arrayCopy(argPos) : undefined,
                    newArity = nativeMax(arity - length, 0),
                    newsHolders = isCurry ? argsHolders : undefined,
                    newHoldersRight = isCurry ? undefined : argsHolders,
                    newPartials = isCurry ? args : undefined,
                    newPartialsRight = isCurry ? undefined : args;
                bitmask |= (isCurry ? PARTIAL_FLAG : PARTIAL_RIGHT_FLAG);
                bitmask &= ~(isCurry ? PARTIAL_RIGHT_FLAG : PARTIAL_FLAG);
                if (!isCurryBound) {
                  bitmask &= ~(BIND_FLAG | BIND_KEY_FLAG);
                }
                var newData = [func, bitmask, thisArg, newPartials, newsHolders, newPartialsRight, newHoldersRight, newArgPos, ary, newArity],
                    result = createHybridWrapper.apply(undefined, newData);
                if (isLaziable(func)) {
                  setData(result, newData);
                }
                result.placeholder = placeholder;
                return result;
              }
            }
            var thisBinding = isBind ? thisArg : this,
                fn = isBindKey ? thisBinding[func] : func;
            if (argPos) {
              args = reorder(args, argPos);
            }
            if (isAry && ary < args.length) {
              args.length = ary;
            }
            if (this && this !== root && this instanceof wrapper) {
              fn = Ctor || createCtorWrapper(func);
            }
            return fn.apply(thisBinding, args);
          }
          return wrapper;
        }
        function createPadding(string, length, chars) {
          var strLength = string.length;
          length = +length;
          if (strLength >= length || !nativeIsFinite(length)) {
            return '';
          }
          var padLength = length - strLength;
          chars = chars == null ? ' ' : (chars + '');
          return repeat(chars, nativeCeil(padLength / chars.length)).slice(0, padLength);
        }
        function createPartialWrapper(func, bitmask, thisArg, partials) {
          var isBind = bitmask & BIND_FLAG,
              Ctor = createCtorWrapper(func);
          function wrapper() {
            var argsIndex = -1,
                argsLength = arguments.length,
                leftIndex = -1,
                leftLength = partials.length,
                args = Array(leftLength + argsLength);
            while (++leftIndex < leftLength) {
              args[leftIndex] = partials[leftIndex];
            }
            while (argsLength--) {
              args[leftIndex++] = arguments[++argsIndex];
            }
            var fn = (this && this !== root && this instanceof wrapper) ? Ctor : func;
            return fn.apply(isBind ? thisArg : this, args);
          }
          return wrapper;
        }
        function createRound(methodName) {
          var func = Math[methodName];
          return function(number, precision) {
            precision = precision === undefined ? 0 : (+precision || 0);
            if (precision) {
              precision = pow(10, precision);
              return func(number * precision) / precision;
            }
            return func(number);
          };
        }
        function createSortedIndex(retHighest) {
          return function(array, value, iteratee, thisArg) {
            var callback = getCallback(iteratee);
            return (iteratee == null && callback === baseCallback) ? binaryIndex(array, value, retHighest) : binaryIndexBy(array, value, callback(iteratee, thisArg, 1), retHighest);
          };
        }
        function createWrapper(func, bitmask, thisArg, partials, holders, argPos, ary, arity) {
          var isBindKey = bitmask & BIND_KEY_FLAG;
          if (!isBindKey && typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          var length = partials ? partials.length : 0;
          if (!length) {
            bitmask &= ~(PARTIAL_FLAG | PARTIAL_RIGHT_FLAG);
            partials = holders = undefined;
          }
          length -= (holders ? holders.length : 0);
          if (bitmask & PARTIAL_RIGHT_FLAG) {
            var partialsRight = partials,
                holdersRight = holders;
            partials = holders = undefined;
          }
          var data = isBindKey ? undefined : getData(func),
              newData = [func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary, arity];
          if (data) {
            mergeData(newData, data);
            bitmask = newData[1];
            arity = newData[9];
          }
          newData[9] = arity == null ? (isBindKey ? 0 : func.length) : (nativeMax(arity - length, 0) || 0);
          if (bitmask == BIND_FLAG) {
            var result = createBindWrapper(newData[0], newData[2]);
          } else if ((bitmask == PARTIAL_FLAG || bitmask == (BIND_FLAG | PARTIAL_FLAG)) && !newData[4].length) {
            result = createPartialWrapper.apply(undefined, newData);
          } else {
            result = createHybridWrapper.apply(undefined, newData);
          }
          var setter = data ? baseSetData : setData;
          return setter(result, newData);
        }
        function equalArrays(array, other, equalFunc, customizer, isLoose, stackA, stackB) {
          var index = -1,
              arrLength = array.length,
              othLength = other.length;
          if (arrLength != othLength && !(isLoose && othLength > arrLength)) {
            return false;
          }
          while (++index < arrLength) {
            var arrValue = array[index],
                othValue = other[index],
                result = customizer ? customizer(isLoose ? othValue : arrValue, isLoose ? arrValue : othValue, index) : undefined;
            if (result !== undefined) {
              if (result) {
                continue;
              }
              return false;
            }
            if (isLoose) {
              if (!arraySome(other, function(othValue) {
                return arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB);
              })) {
                return false;
              }
            } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, customizer, isLoose, stackA, stackB))) {
              return false;
            }
          }
          return true;
        }
        function equalByTag(object, other, tag) {
          switch (tag) {
            case boolTag:
            case dateTag:
              return +object == +other;
            case errorTag:
              return object.name == other.name && object.message == other.message;
            case numberTag:
              return (object != +object) ? other != +other : object == +other;
            case regexpTag:
            case stringTag:
              return object == (other + '');
          }
          return false;
        }
        function equalObjects(object, other, equalFunc, customizer, isLoose, stackA, stackB) {
          var objProps = keys(object),
              objLength = objProps.length,
              othProps = keys(other),
              othLength = othProps.length;
          if (objLength != othLength && !isLoose) {
            return false;
          }
          var index = objLength;
          while (index--) {
            var key = objProps[index];
            if (!(isLoose ? key in other : hasOwnProperty.call(other, key))) {
              return false;
            }
          }
          var skipCtor = isLoose;
          while (++index < objLength) {
            key = objProps[index];
            var objValue = object[key],
                othValue = other[key],
                result = customizer ? customizer(isLoose ? othValue : objValue, isLoose ? objValue : othValue, key) : undefined;
            if (!(result === undefined ? equalFunc(objValue, othValue, customizer, isLoose, stackA, stackB) : result)) {
              return false;
            }
            skipCtor || (skipCtor = key == 'constructor');
          }
          if (!skipCtor) {
            var objCtor = object.constructor,
                othCtor = other.constructor;
            if (objCtor != othCtor && ('constructor' in object && 'constructor' in other) && !(typeof objCtor == 'function' && objCtor instanceof objCtor && typeof othCtor == 'function' && othCtor instanceof othCtor)) {
              return false;
            }
          }
          return true;
        }
        function getCallback(func, thisArg, argCount) {
          var result = lodash.callback || callback;
          result = result === callback ? baseCallback : result;
          return argCount ? result(func, thisArg, argCount) : result;
        }
        var getData = !metaMap ? noop : function(func) {
          return metaMap.get(func);
        };
        function getFuncName(func) {
          var result = func.name,
              array = realNames[result],
              length = array ? array.length : 0;
          while (length--) {
            var data = array[length],
                otherFunc = data.func;
            if (otherFunc == null || otherFunc == func) {
              return data.name;
            }
          }
          return result;
        }
        function getIndexOf(collection, target, fromIndex) {
          var result = lodash.indexOf || indexOf;
          result = result === indexOf ? baseIndexOf : result;
          return collection ? result(collection, target, fromIndex) : result;
        }
        var getLength = baseProperty('length');
        function getMatchData(object) {
          var result = pairs(object),
              length = result.length;
          while (length--) {
            result[length][2] = isStrictComparable(result[length][1]);
          }
          return result;
        }
        function getNative(object, key) {
          var value = object == null ? undefined : object[key];
          return isNative(value) ? value : undefined;
        }
        function getView(start, end, transforms) {
          var index = -1,
              length = transforms.length;
          while (++index < length) {
            var data = transforms[index],
                size = data.size;
            switch (data.type) {
              case 'drop':
                start += size;
                break;
              case 'dropRight':
                end -= size;
                break;
              case 'take':
                end = nativeMin(end, start + size);
                break;
              case 'takeRight':
                start = nativeMax(start, end - size);
                break;
            }
          }
          return {
            'start': start,
            'end': end
          };
        }
        function initCloneArray(array) {
          var length = array.length,
              result = new array.constructor(length);
          if (length && typeof array[0] == 'string' && hasOwnProperty.call(array, 'index')) {
            result.index = array.index;
            result.input = array.input;
          }
          return result;
        }
        function initCloneObject(object) {
          var Ctor = object.constructor;
          if (!(typeof Ctor == 'function' && Ctor instanceof Ctor)) {
            Ctor = Object;
          }
          return new Ctor;
        }
        function initCloneByTag(object, tag, isDeep) {
          var Ctor = object.constructor;
          switch (tag) {
            case arrayBufferTag:
              return bufferClone(object);
            case boolTag:
            case dateTag:
              return new Ctor(+object);
            case float32Tag:
            case float64Tag:
            case int8Tag:
            case int16Tag:
            case int32Tag:
            case uint8Tag:
            case uint8ClampedTag:
            case uint16Tag:
            case uint32Tag:
              var buffer = object.buffer;
              return new Ctor(isDeep ? bufferClone(buffer) : buffer, object.byteOffset, object.length);
            case numberTag:
            case stringTag:
              return new Ctor(object);
            case regexpTag:
              var result = new Ctor(object.source, reFlags.exec(object));
              result.lastIndex = object.lastIndex;
          }
          return result;
        }
        function invokePath(object, path, args) {
          if (object != null && !isKey(path, object)) {
            path = toPath(path);
            object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
            path = last(path);
          }
          var func = object == null ? object : object[path];
          return func == null ? undefined : func.apply(object, args);
        }
        function isArrayLike(value) {
          return value != null && isLength(getLength(value));
        }
        function isIndex(value, length) {
          value = (typeof value == 'number' || reIsUint.test(value)) ? +value : -1;
          length = length == null ? MAX_SAFE_INTEGER : length;
          return value > -1 && value % 1 == 0 && value < length;
        }
        function isIterateeCall(value, index, object) {
          if (!isObject(object)) {
            return false;
          }
          var type = typeof index;
          if (type == 'number' ? (isArrayLike(object) && isIndex(index, object.length)) : (type == 'string' && index in object)) {
            var other = object[index];
            return value === value ? (value === other) : (other !== other);
          }
          return false;
        }
        function isKey(value, object) {
          var type = typeof value;
          if ((type == 'string' && reIsPlainProp.test(value)) || type == 'number') {
            return true;
          }
          if (isArray(value)) {
            return false;
          }
          var result = !reIsDeepProp.test(value);
          return result || (object != null && value in toObject(object));
        }
        function isLaziable(func) {
          var funcName = getFuncName(func);
          if (!(funcName in LazyWrapper.prototype)) {
            return false;
          }
          var other = lodash[funcName];
          if (func === other) {
            return true;
          }
          var data = getData(other);
          return !!data && func === data[0];
        }
        function isLength(value) {
          return typeof value == 'number' && value > -1 && value % 1 == 0 && value <= MAX_SAFE_INTEGER;
        }
        function isStrictComparable(value) {
          return value === value && !isObject(value);
        }
        function mergeData(data, source) {
          var bitmask = data[1],
              srcBitmask = source[1],
              newBitmask = bitmask | srcBitmask,
              isCommon = newBitmask < ARY_FLAG;
          var isCombo = (srcBitmask == ARY_FLAG && bitmask == CURRY_FLAG) || (srcBitmask == ARY_FLAG && bitmask == REARG_FLAG && data[7].length <= source[8]) || (srcBitmask == (ARY_FLAG | REARG_FLAG) && bitmask == CURRY_FLAG);
          if (!(isCommon || isCombo)) {
            return data;
          }
          if (srcBitmask & BIND_FLAG) {
            data[2] = source[2];
            newBitmask |= (bitmask & BIND_FLAG) ? 0 : CURRY_BOUND_FLAG;
          }
          var value = source[3];
          if (value) {
            var partials = data[3];
            data[3] = partials ? composeArgs(partials, value, source[4]) : arrayCopy(value);
            data[4] = partials ? replaceHolders(data[3], PLACEHOLDER) : arrayCopy(source[4]);
          }
          value = source[5];
          if (value) {
            partials = data[5];
            data[5] = partials ? composeArgsRight(partials, value, source[6]) : arrayCopy(value);
            data[6] = partials ? replaceHolders(data[5], PLACEHOLDER) : arrayCopy(source[6]);
          }
          value = source[7];
          if (value) {
            data[7] = arrayCopy(value);
          }
          if (srcBitmask & ARY_FLAG) {
            data[8] = data[8] == null ? source[8] : nativeMin(data[8], source[8]);
          }
          if (data[9] == null) {
            data[9] = source[9];
          }
          data[0] = source[0];
          data[1] = newBitmask;
          return data;
        }
        function mergeDefaults(objectValue, sourceValue) {
          return objectValue === undefined ? sourceValue : merge(objectValue, sourceValue, mergeDefaults);
        }
        function pickByArray(object, props) {
          object = toObject(object);
          var index = -1,
              length = props.length,
              result = {};
          while (++index < length) {
            var key = props[index];
            if (key in object) {
              result[key] = object[key];
            }
          }
          return result;
        }
        function pickByCallback(object, predicate) {
          var result = {};
          baseForIn(object, function(value, key, object) {
            if (predicate(value, key, object)) {
              result[key] = value;
            }
          });
          return result;
        }
        function reorder(array, indexes) {
          var arrLength = array.length,
              length = nativeMin(indexes.length, arrLength),
              oldArray = arrayCopy(array);
          while (length--) {
            var index = indexes[length];
            array[length] = isIndex(index, arrLength) ? oldArray[index] : undefined;
          }
          return array;
        }
        var setData = (function() {
          var count = 0,
              lastCalled = 0;
          return function(key, value) {
            var stamp = now(),
                remaining = HOT_SPAN - (stamp - lastCalled);
            lastCalled = stamp;
            if (remaining > 0) {
              if (++count >= HOT_COUNT) {
                return key;
              }
            } else {
              count = 0;
            }
            return baseSetData(key, value);
          };
        }());
        function shimKeys(object) {
          var props = keysIn(object),
              propsLength = props.length,
              length = propsLength && object.length;
          var allowIndexes = !!length && isLength(length) && (isArray(object) || isArguments(object));
          var index = -1,
              result = [];
          while (++index < propsLength) {
            var key = props[index];
            if ((allowIndexes && isIndex(key, length)) || hasOwnProperty.call(object, key)) {
              result.push(key);
            }
          }
          return result;
        }
        function toIterable(value) {
          if (value == null) {
            return [];
          }
          if (!isArrayLike(value)) {
            return values(value);
          }
          return isObject(value) ? value : Object(value);
        }
        function toObject(value) {
          return isObject(value) ? value : Object(value);
        }
        function toPath(value) {
          if (isArray(value)) {
            return value;
          }
          var result = [];
          baseToString(value).replace(rePropName, function(match, number, quote, string) {
            result.push(quote ? string.replace(reEscapeChar, '$1') : (number || match));
          });
          return result;
        }
        function wrapperClone(wrapper) {
          return wrapper instanceof LazyWrapper ? wrapper.clone() : new LodashWrapper(wrapper.__wrapped__, wrapper.__chain__, arrayCopy(wrapper.__actions__));
        }
        function chunk(array, size, guard) {
          if (guard ? isIterateeCall(array, size, guard) : size == null) {
            size = 1;
          } else {
            size = nativeMax(nativeFloor(size) || 1, 1);
          }
          var index = 0,
              length = array ? array.length : 0,
              resIndex = -1,
              result = Array(nativeCeil(length / size));
          while (index < length) {
            result[++resIndex] = baseSlice(array, index, (index += size));
          }
          return result;
        }
        function compact(array) {
          var index = -1,
              length = array ? array.length : 0,
              resIndex = -1,
              result = [];
          while (++index < length) {
            var value = array[index];
            if (value) {
              result[++resIndex] = value;
            }
          }
          return result;
        }
        var difference = restParam(function(array, values) {
          return (isObjectLike(array) && isArrayLike(array)) ? baseDifference(array, baseFlatten(values, false, true)) : [];
        });
        function drop(array, n, guard) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (guard ? isIterateeCall(array, n, guard) : n == null) {
            n = 1;
          }
          return baseSlice(array, n < 0 ? 0 : n);
        }
        function dropRight(array, n, guard) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (guard ? isIterateeCall(array, n, guard) : n == null) {
            n = 1;
          }
          n = length - (+n || 0);
          return baseSlice(array, 0, n < 0 ? 0 : n);
        }
        function dropRightWhile(array, predicate, thisArg) {
          return (array && array.length) ? baseWhile(array, getCallback(predicate, thisArg, 3), true, true) : [];
        }
        function dropWhile(array, predicate, thisArg) {
          return (array && array.length) ? baseWhile(array, getCallback(predicate, thisArg, 3), true) : [];
        }
        function fill(array, value, start, end) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (start && typeof start != 'number' && isIterateeCall(array, value, start)) {
            start = 0;
            end = length;
          }
          return baseFill(array, value, start, end);
        }
        var findIndex = createFindIndex();
        var findLastIndex = createFindIndex(true);
        function first(array) {
          return array ? array[0] : undefined;
        }
        function flatten(array, isDeep, guard) {
          var length = array ? array.length : 0;
          if (guard && isIterateeCall(array, isDeep, guard)) {
            isDeep = false;
          }
          return length ? baseFlatten(array, isDeep) : [];
        }
        function flattenDeep(array) {
          var length = array ? array.length : 0;
          return length ? baseFlatten(array, true) : [];
        }
        function indexOf(array, value, fromIndex) {
          var length = array ? array.length : 0;
          if (!length) {
            return -1;
          }
          if (typeof fromIndex == 'number') {
            fromIndex = fromIndex < 0 ? nativeMax(length + fromIndex, 0) : fromIndex;
          } else if (fromIndex) {
            var index = binaryIndex(array, value);
            if (index < length && (value === value ? (value === array[index]) : (array[index] !== array[index]))) {
              return index;
            }
            return -1;
          }
          return baseIndexOf(array, value, fromIndex || 0);
        }
        function initial(array) {
          return dropRight(array, 1);
        }
        var intersection = restParam(function(arrays) {
          var othLength = arrays.length,
              othIndex = othLength,
              caches = Array(length),
              indexOf = getIndexOf(),
              isCommon = indexOf == baseIndexOf,
              result = [];
          while (othIndex--) {
            var value = arrays[othIndex] = isArrayLike(value = arrays[othIndex]) ? value : [];
            caches[othIndex] = (isCommon && value.length >= 120) ? createCache(othIndex && value) : null;
          }
          var array = arrays[0],
              index = -1,
              length = array ? array.length : 0,
              seen = caches[0];
          outer: while (++index < length) {
            value = array[index];
            if ((seen ? cacheIndexOf(seen, value) : indexOf(result, value, 0)) < 0) {
              var othIndex = othLength;
              while (--othIndex) {
                var cache = caches[othIndex];
                if ((cache ? cacheIndexOf(cache, value) : indexOf(arrays[othIndex], value, 0)) < 0) {
                  continue outer;
                }
              }
              if (seen) {
                seen.push(value);
              }
              result.push(value);
            }
          }
          return result;
        });
        function last(array) {
          var length = array ? array.length : 0;
          return length ? array[length - 1] : undefined;
        }
        function lastIndexOf(array, value, fromIndex) {
          var length = array ? array.length : 0;
          if (!length) {
            return -1;
          }
          var index = length;
          if (typeof fromIndex == 'number') {
            index = (fromIndex < 0 ? nativeMax(length + fromIndex, 0) : nativeMin(fromIndex || 0, length - 1)) + 1;
          } else if (fromIndex) {
            index = binaryIndex(array, value, true) - 1;
            var other = array[index];
            if (value === value ? (value === other) : (other !== other)) {
              return index;
            }
            return -1;
          }
          if (value !== value) {
            return indexOfNaN(array, index, true);
          }
          while (index--) {
            if (array[index] === value) {
              return index;
            }
          }
          return -1;
        }
        function pull() {
          var args = arguments,
              array = args[0];
          if (!(array && array.length)) {
            return array;
          }
          var index = 0,
              indexOf = getIndexOf(),
              length = args.length;
          while (++index < length) {
            var fromIndex = 0,
                value = args[index];
            while ((fromIndex = indexOf(array, value, fromIndex)) > -1) {
              splice.call(array, fromIndex, 1);
            }
          }
          return array;
        }
        var pullAt = restParam(function(array, indexes) {
          indexes = baseFlatten(indexes);
          var result = baseAt(array, indexes);
          basePullAt(array, indexes.sort(baseCompareAscending));
          return result;
        });
        function remove(array, predicate, thisArg) {
          var result = [];
          if (!(array && array.length)) {
            return result;
          }
          var index = -1,
              indexes = [],
              length = array.length;
          predicate = getCallback(predicate, thisArg, 3);
          while (++index < length) {
            var value = array[index];
            if (predicate(value, index, array)) {
              result.push(value);
              indexes.push(index);
            }
          }
          basePullAt(array, indexes);
          return result;
        }
        function rest(array) {
          return drop(array, 1);
        }
        function slice(array, start, end) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (end && typeof end != 'number' && isIterateeCall(array, start, end)) {
            start = 0;
            end = length;
          }
          return baseSlice(array, start, end);
        }
        var sortedIndex = createSortedIndex();
        var sortedLastIndex = createSortedIndex(true);
        function take(array, n, guard) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (guard ? isIterateeCall(array, n, guard) : n == null) {
            n = 1;
          }
          return baseSlice(array, 0, n < 0 ? 0 : n);
        }
        function takeRight(array, n, guard) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (guard ? isIterateeCall(array, n, guard) : n == null) {
            n = 1;
          }
          n = length - (+n || 0);
          return baseSlice(array, n < 0 ? 0 : n);
        }
        function takeRightWhile(array, predicate, thisArg) {
          return (array && array.length) ? baseWhile(array, getCallback(predicate, thisArg, 3), false, true) : [];
        }
        function takeWhile(array, predicate, thisArg) {
          return (array && array.length) ? baseWhile(array, getCallback(predicate, thisArg, 3)) : [];
        }
        var union = restParam(function(arrays) {
          return baseUniq(baseFlatten(arrays, false, true));
        });
        function uniq(array, isSorted, iteratee, thisArg) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          if (isSorted != null && typeof isSorted != 'boolean') {
            thisArg = iteratee;
            iteratee = isIterateeCall(array, isSorted, thisArg) ? undefined : isSorted;
            isSorted = false;
          }
          var callback = getCallback();
          if (!(iteratee == null && callback === baseCallback)) {
            iteratee = callback(iteratee, thisArg, 3);
          }
          return (isSorted && getIndexOf() == baseIndexOf) ? sortedUniq(array, iteratee) : baseUniq(array, iteratee);
        }
        function unzip(array) {
          if (!(array && array.length)) {
            return [];
          }
          var index = -1,
              length = 0;
          array = arrayFilter(array, function(group) {
            if (isArrayLike(group)) {
              length = nativeMax(group.length, length);
              return true;
            }
          });
          var result = Array(length);
          while (++index < length) {
            result[index] = arrayMap(array, baseProperty(index));
          }
          return result;
        }
        function unzipWith(array, iteratee, thisArg) {
          var length = array ? array.length : 0;
          if (!length) {
            return [];
          }
          var result = unzip(array);
          if (iteratee == null) {
            return result;
          }
          iteratee = bindCallback(iteratee, thisArg, 4);
          return arrayMap(result, function(group) {
            return arrayReduce(group, iteratee, undefined, true);
          });
        }
        var without = restParam(function(array, values) {
          return isArrayLike(array) ? baseDifference(array, values) : [];
        });
        function xor() {
          var index = -1,
              length = arguments.length;
          while (++index < length) {
            var array = arguments[index];
            if (isArrayLike(array)) {
              var result = result ? arrayPush(baseDifference(result, array), baseDifference(array, result)) : array;
            }
          }
          return result ? baseUniq(result) : [];
        }
        var zip = restParam(unzip);
        function zipObject(props, values) {
          var index = -1,
              length = props ? props.length : 0,
              result = {};
          if (length && !values && !isArray(props[0])) {
            values = [];
          }
          while (++index < length) {
            var key = props[index];
            if (values) {
              result[key] = values[index];
            } else if (key) {
              result[key[0]] = key[1];
            }
          }
          return result;
        }
        var zipWith = restParam(function(arrays) {
          var length = arrays.length,
              iteratee = length > 2 ? arrays[length - 2] : undefined,
              thisArg = length > 1 ? arrays[length - 1] : undefined;
          if (length > 2 && typeof iteratee == 'function') {
            length -= 2;
          } else {
            iteratee = (length > 1 && typeof thisArg == 'function') ? (--length, thisArg) : undefined;
            thisArg = undefined;
          }
          arrays.length = length;
          return unzipWith(arrays, iteratee, thisArg);
        });
        function chain(value) {
          var result = lodash(value);
          result.__chain__ = true;
          return result;
        }
        function tap(value, interceptor, thisArg) {
          interceptor.call(thisArg, value);
          return value;
        }
        function thru(value, interceptor, thisArg) {
          return interceptor.call(thisArg, value);
        }
        function wrapperChain() {
          return chain(this);
        }
        function wrapperCommit() {
          return new LodashWrapper(this.value(), this.__chain__);
        }
        var wrapperConcat = restParam(function(values) {
          values = baseFlatten(values);
          return this.thru(function(array) {
            return arrayConcat(isArray(array) ? array : [toObject(array)], values);
          });
        });
        function wrapperPlant(value) {
          var result,
              parent = this;
          while (parent instanceof baseLodash) {
            var clone = wrapperClone(parent);
            if (result) {
              previous.__wrapped__ = clone;
            } else {
              result = clone;
            }
            var previous = clone;
            parent = parent.__wrapped__;
          }
          previous.__wrapped__ = value;
          return result;
        }
        function wrapperReverse() {
          var value = this.__wrapped__;
          var interceptor = function(value) {
            return (wrapped && wrapped.__dir__ < 0) ? value : value.reverse();
          };
          if (value instanceof LazyWrapper) {
            var wrapped = value;
            if (this.__actions__.length) {
              wrapped = new LazyWrapper(this);
            }
            wrapped = wrapped.reverse();
            wrapped.__actions__.push({
              'func': thru,
              'args': [interceptor],
              'thisArg': undefined
            });
            return new LodashWrapper(wrapped, this.__chain__);
          }
          return this.thru(interceptor);
        }
        function wrapperToString() {
          return (this.value() + '');
        }
        function wrapperValue() {
          return baseWrapperValue(this.__wrapped__, this.__actions__);
        }
        var at = restParam(function(collection, props) {
          return baseAt(collection, baseFlatten(props));
        });
        var countBy = createAggregator(function(result, value, key) {
          hasOwnProperty.call(result, key) ? ++result[key] : (result[key] = 1);
        });
        function every(collection, predicate, thisArg) {
          var func = isArray(collection) ? arrayEvery : baseEvery;
          if (thisArg && isIterateeCall(collection, predicate, thisArg)) {
            predicate = undefined;
          }
          if (typeof predicate != 'function' || thisArg !== undefined) {
            predicate = getCallback(predicate, thisArg, 3);
          }
          return func(collection, predicate);
        }
        function filter(collection, predicate, thisArg) {
          var func = isArray(collection) ? arrayFilter : baseFilter;
          predicate = getCallback(predicate, thisArg, 3);
          return func(collection, predicate);
        }
        var find = createFind(baseEach);
        var findLast = createFind(baseEachRight, true);
        function findWhere(collection, source) {
          return find(collection, baseMatches(source));
        }
        var forEach = createForEach(arrayEach, baseEach);
        var forEachRight = createForEach(arrayEachRight, baseEachRight);
        var groupBy = createAggregator(function(result, value, key) {
          if (hasOwnProperty.call(result, key)) {
            result[key].push(value);
          } else {
            result[key] = [value];
          }
        });
        function includes(collection, target, fromIndex, guard) {
          var length = collection ? getLength(collection) : 0;
          if (!isLength(length)) {
            collection = values(collection);
            length = collection.length;
          }
          if (typeof fromIndex != 'number' || (guard && isIterateeCall(target, fromIndex, guard))) {
            fromIndex = 0;
          } else {
            fromIndex = fromIndex < 0 ? nativeMax(length + fromIndex, 0) : (fromIndex || 0);
          }
          return (typeof collection == 'string' || !isArray(collection) && isString(collection)) ? (fromIndex <= length && collection.indexOf(target, fromIndex) > -1) : (!!length && getIndexOf(collection, target, fromIndex) > -1);
        }
        var indexBy = createAggregator(function(result, value, key) {
          result[key] = value;
        });
        var invoke = restParam(function(collection, path, args) {
          var index = -1,
              isFunc = typeof path == 'function',
              isProp = isKey(path),
              result = isArrayLike(collection) ? Array(collection.length) : [];
          baseEach(collection, function(value) {
            var func = isFunc ? path : ((isProp && value != null) ? value[path] : undefined);
            result[++index] = func ? func.apply(value, args) : invokePath(value, path, args);
          });
          return result;
        });
        function map(collection, iteratee, thisArg) {
          var func = isArray(collection) ? arrayMap : baseMap;
          iteratee = getCallback(iteratee, thisArg, 3);
          return func(collection, iteratee);
        }
        var partition = createAggregator(function(result, value, key) {
          result[key ? 0 : 1].push(value);
        }, function() {
          return [[], []];
        });
        function pluck(collection, path) {
          return map(collection, property(path));
        }
        var reduce = createReduce(arrayReduce, baseEach);
        var reduceRight = createReduce(arrayReduceRight, baseEachRight);
        function reject(collection, predicate, thisArg) {
          var func = isArray(collection) ? arrayFilter : baseFilter;
          predicate = getCallback(predicate, thisArg, 3);
          return func(collection, function(value, index, collection) {
            return !predicate(value, index, collection);
          });
        }
        function sample(collection, n, guard) {
          if (guard ? isIterateeCall(collection, n, guard) : n == null) {
            collection = toIterable(collection);
            var length = collection.length;
            return length > 0 ? collection[baseRandom(0, length - 1)] : undefined;
          }
          var index = -1,
              result = toArray(collection),
              length = result.length,
              lastIndex = length - 1;
          n = nativeMin(n < 0 ? 0 : (+n || 0), length);
          while (++index < n) {
            var rand = baseRandom(index, lastIndex),
                value = result[rand];
            result[rand] = result[index];
            result[index] = value;
          }
          result.length = n;
          return result;
        }
        function shuffle(collection) {
          return sample(collection, POSITIVE_INFINITY);
        }
        function size(collection) {
          var length = collection ? getLength(collection) : 0;
          return isLength(length) ? length : keys(collection).length;
        }
        function some(collection, predicate, thisArg) {
          var func = isArray(collection) ? arraySome : baseSome;
          if (thisArg && isIterateeCall(collection, predicate, thisArg)) {
            predicate = undefined;
          }
          if (typeof predicate != 'function' || thisArg !== undefined) {
            predicate = getCallback(predicate, thisArg, 3);
          }
          return func(collection, predicate);
        }
        function sortBy(collection, iteratee, thisArg) {
          if (collection == null) {
            return [];
          }
          if (thisArg && isIterateeCall(collection, iteratee, thisArg)) {
            iteratee = undefined;
          }
          var index = -1;
          iteratee = getCallback(iteratee, thisArg, 3);
          var result = baseMap(collection, function(value, key, collection) {
            return {
              'criteria': iteratee(value, key, collection),
              'index': ++index,
              'value': value
            };
          });
          return baseSortBy(result, compareAscending);
        }
        var sortByAll = restParam(function(collection, iteratees) {
          if (collection == null) {
            return [];
          }
          var guard = iteratees[2];
          if (guard && isIterateeCall(iteratees[0], iteratees[1], guard)) {
            iteratees.length = 1;
          }
          return baseSortByOrder(collection, baseFlatten(iteratees), []);
        });
        function sortByOrder(collection, iteratees, orders, guard) {
          if (collection == null) {
            return [];
          }
          if (guard && isIterateeCall(iteratees, orders, guard)) {
            orders = undefined;
          }
          if (!isArray(iteratees)) {
            iteratees = iteratees == null ? [] : [iteratees];
          }
          if (!isArray(orders)) {
            orders = orders == null ? [] : [orders];
          }
          return baseSortByOrder(collection, iteratees, orders);
        }
        function where(collection, source) {
          return filter(collection, baseMatches(source));
        }
        var now = nativeNow || function() {
          return new Date().getTime();
        };
        function after(n, func) {
          if (typeof func != 'function') {
            if (typeof n == 'function') {
              var temp = n;
              n = func;
              func = temp;
            } else {
              throw new TypeError(FUNC_ERROR_TEXT);
            }
          }
          n = nativeIsFinite(n = +n) ? n : 0;
          return function() {
            if (--n < 1) {
              return func.apply(this, arguments);
            }
          };
        }
        function ary(func, n, guard) {
          if (guard && isIterateeCall(func, n, guard)) {
            n = undefined;
          }
          n = (func && n == null) ? func.length : nativeMax(+n || 0, 0);
          return createWrapper(func, ARY_FLAG, undefined, undefined, undefined, undefined, n);
        }
        function before(n, func) {
          var result;
          if (typeof func != 'function') {
            if (typeof n == 'function') {
              var temp = n;
              n = func;
              func = temp;
            } else {
              throw new TypeError(FUNC_ERROR_TEXT);
            }
          }
          return function() {
            if (--n > 0) {
              result = func.apply(this, arguments);
            }
            if (n <= 1) {
              func = undefined;
            }
            return result;
          };
        }
        var bind = restParam(function(func, thisArg, partials) {
          var bitmask = BIND_FLAG;
          if (partials.length) {
            var holders = replaceHolders(partials, bind.placeholder);
            bitmask |= PARTIAL_FLAG;
          }
          return createWrapper(func, bitmask, thisArg, partials, holders);
        });
        var bindAll = restParam(function(object, methodNames) {
          methodNames = methodNames.length ? baseFlatten(methodNames) : functions(object);
          var index = -1,
              length = methodNames.length;
          while (++index < length) {
            var key = methodNames[index];
            object[key] = createWrapper(object[key], BIND_FLAG, object);
          }
          return object;
        });
        var bindKey = restParam(function(object, key, partials) {
          var bitmask = BIND_FLAG | BIND_KEY_FLAG;
          if (partials.length) {
            var holders = replaceHolders(partials, bindKey.placeholder);
            bitmask |= PARTIAL_FLAG;
          }
          return createWrapper(key, bitmask, object, partials, holders);
        });
        var curry = createCurry(CURRY_FLAG);
        var curryRight = createCurry(CURRY_RIGHT_FLAG);
        function debounce(func, wait, options) {
          var args,
              maxTimeoutId,
              result,
              stamp,
              thisArg,
              timeoutId,
              trailingCall,
              lastCalled = 0,
              maxWait = false,
              trailing = true;
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          wait = wait < 0 ? 0 : (+wait || 0);
          if (options === true) {
            var leading = true;
            trailing = false;
          } else if (isObject(options)) {
            leading = !!options.leading;
            maxWait = 'maxWait' in options && nativeMax(+options.maxWait || 0, wait);
            trailing = 'trailing' in options ? !!options.trailing : trailing;
          }
          function cancel() {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            if (maxTimeoutId) {
              clearTimeout(maxTimeoutId);
            }
            lastCalled = 0;
            maxTimeoutId = timeoutId = trailingCall = undefined;
          }
          function complete(isCalled, id) {
            if (id) {
              clearTimeout(id);
            }
            maxTimeoutId = timeoutId = trailingCall = undefined;
            if (isCalled) {
              lastCalled = now();
              result = func.apply(thisArg, args);
              if (!timeoutId && !maxTimeoutId) {
                args = thisArg = undefined;
              }
            }
          }
          function delayed() {
            var remaining = wait - (now() - stamp);
            if (remaining <= 0 || remaining > wait) {
              complete(trailingCall, maxTimeoutId);
            } else {
              timeoutId = setTimeout(delayed, remaining);
            }
          }
          function maxDelayed() {
            complete(trailing, timeoutId);
          }
          function debounced() {
            args = arguments;
            stamp = now();
            thisArg = this;
            trailingCall = trailing && (timeoutId || !leading);
            if (maxWait === false) {
              var leadingCall = leading && !timeoutId;
            } else {
              if (!maxTimeoutId && !leading) {
                lastCalled = stamp;
              }
              var remaining = maxWait - (stamp - lastCalled),
                  isCalled = remaining <= 0 || remaining > maxWait;
              if (isCalled) {
                if (maxTimeoutId) {
                  maxTimeoutId = clearTimeout(maxTimeoutId);
                }
                lastCalled = stamp;
                result = func.apply(thisArg, args);
              } else if (!maxTimeoutId) {
                maxTimeoutId = setTimeout(maxDelayed, remaining);
              }
            }
            if (isCalled && timeoutId) {
              timeoutId = clearTimeout(timeoutId);
            } else if (!timeoutId && wait !== maxWait) {
              timeoutId = setTimeout(delayed, wait);
            }
            if (leadingCall) {
              isCalled = true;
              result = func.apply(thisArg, args);
            }
            if (isCalled && !timeoutId && !maxTimeoutId) {
              args = thisArg = undefined;
            }
            return result;
          }
          debounced.cancel = cancel;
          return debounced;
        }
        var defer = restParam(function(func, args) {
          return baseDelay(func, 1, args);
        });
        var delay = restParam(function(func, wait, args) {
          return baseDelay(func, wait, args);
        });
        var flow = createFlow();
        var flowRight = createFlow(true);
        function memoize(func, resolver) {
          if (typeof func != 'function' || (resolver && typeof resolver != 'function')) {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          var memoized = function() {
            var args = arguments,
                key = resolver ? resolver.apply(this, args) : args[0],
                cache = memoized.cache;
            if (cache.has(key)) {
              return cache.get(key);
            }
            var result = func.apply(this, args);
            memoized.cache = cache.set(key, result);
            return result;
          };
          memoized.cache = new memoize.Cache;
          return memoized;
        }
        var modArgs = restParam(function(func, transforms) {
          transforms = baseFlatten(transforms);
          if (typeof func != 'function' || !arrayEvery(transforms, baseIsFunction)) {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          var length = transforms.length;
          return restParam(function(args) {
            var index = nativeMin(args.length, length);
            while (index--) {
              args[index] = transforms[index](args[index]);
            }
            return func.apply(this, args);
          });
        });
        function negate(predicate) {
          if (typeof predicate != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          return function() {
            return !predicate.apply(this, arguments);
          };
        }
        function once(func) {
          return before(2, func);
        }
        var partial = createPartial(PARTIAL_FLAG);
        var partialRight = createPartial(PARTIAL_RIGHT_FLAG);
        var rearg = restParam(function(func, indexes) {
          return createWrapper(func, REARG_FLAG, undefined, undefined, undefined, baseFlatten(indexes));
        });
        function restParam(func, start) {
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          start = nativeMax(start === undefined ? (func.length - 1) : (+start || 0), 0);
          return function() {
            var args = arguments,
                index = -1,
                length = nativeMax(args.length - start, 0),
                rest = Array(length);
            while (++index < length) {
              rest[index] = args[start + index];
            }
            switch (start) {
              case 0:
                return func.call(this, rest);
              case 1:
                return func.call(this, args[0], rest);
              case 2:
                return func.call(this, args[0], args[1], rest);
            }
            var otherArgs = Array(start + 1);
            index = -1;
            while (++index < start) {
              otherArgs[index] = args[index];
            }
            otherArgs[start] = rest;
            return func.apply(this, otherArgs);
          };
        }
        function spread(func) {
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          return function(array) {
            return func.apply(this, array);
          };
        }
        function throttle(func, wait, options) {
          var leading = true,
              trailing = true;
          if (typeof func != 'function') {
            throw new TypeError(FUNC_ERROR_TEXT);
          }
          if (options === false) {
            leading = false;
          } else if (isObject(options)) {
            leading = 'leading' in options ? !!options.leading : leading;
            trailing = 'trailing' in options ? !!options.trailing : trailing;
          }
          return debounce(func, wait, {
            'leading': leading,
            'maxWait': +wait,
            'trailing': trailing
          });
        }
        function wrap(value, wrapper) {
          wrapper = wrapper == null ? identity : wrapper;
          return createWrapper(wrapper, PARTIAL_FLAG, undefined, [value], []);
        }
        function clone(value, isDeep, customizer, thisArg) {
          if (isDeep && typeof isDeep != 'boolean' && isIterateeCall(value, isDeep, customizer)) {
            isDeep = false;
          } else if (typeof isDeep == 'function') {
            thisArg = customizer;
            customizer = isDeep;
            isDeep = false;
          }
          return typeof customizer == 'function' ? baseClone(value, isDeep, bindCallback(customizer, thisArg, 1)) : baseClone(value, isDeep);
        }
        function cloneDeep(value, customizer, thisArg) {
          return typeof customizer == 'function' ? baseClone(value, true, bindCallback(customizer, thisArg, 1)) : baseClone(value, true);
        }
        function gt(value, other) {
          return value > other;
        }
        function gte(value, other) {
          return value >= other;
        }
        function isArguments(value) {
          return isObjectLike(value) && isArrayLike(value) && hasOwnProperty.call(value, 'callee') && !propertyIsEnumerable.call(value, 'callee');
        }
        var isArray = nativeIsArray || function(value) {
          return isObjectLike(value) && isLength(value.length) && objToString.call(value) == arrayTag;
        };
        function isBoolean(value) {
          return value === true || value === false || (isObjectLike(value) && objToString.call(value) == boolTag);
        }
        function isDate(value) {
          return isObjectLike(value) && objToString.call(value) == dateTag;
        }
        function isElement(value) {
          return !!value && value.nodeType === 1 && isObjectLike(value) && !isPlainObject(value);
        }
        function isEmpty(value) {
          if (value == null) {
            return true;
          }
          if (isArrayLike(value) && (isArray(value) || isString(value) || isArguments(value) || (isObjectLike(value) && isFunction(value.splice)))) {
            return !value.length;
          }
          return !keys(value).length;
        }
        function isEqual(value, other, customizer, thisArg) {
          customizer = typeof customizer == 'function' ? bindCallback(customizer, thisArg, 3) : undefined;
          var result = customizer ? customizer(value, other) : undefined;
          return result === undefined ? baseIsEqual(value, other, customizer) : !!result;
        }
        function isError(value) {
          return isObjectLike(value) && typeof value.message == 'string' && objToString.call(value) == errorTag;
        }
        function isFinite(value) {
          return typeof value == 'number' && nativeIsFinite(value);
        }
        function isFunction(value) {
          return isObject(value) && objToString.call(value) == funcTag;
        }
        function isObject(value) {
          var type = typeof value;
          return !!value && (type == 'object' || type == 'function');
        }
        function isMatch(object, source, customizer, thisArg) {
          customizer = typeof customizer == 'function' ? bindCallback(customizer, thisArg, 3) : undefined;
          return baseIsMatch(object, getMatchData(source), customizer);
        }
        function isNaN(value) {
          return isNumber(value) && value != +value;
        }
        function isNative(value) {
          if (value == null) {
            return false;
          }
          if (isFunction(value)) {
            return reIsNative.test(fnToString.call(value));
          }
          return isObjectLike(value) && reIsHostCtor.test(value);
        }
        function isNull(value) {
          return value === null;
        }
        function isNumber(value) {
          return typeof value == 'number' || (isObjectLike(value) && objToString.call(value) == numberTag);
        }
        function isPlainObject(value) {
          var Ctor;
          if (!(isObjectLike(value) && objToString.call(value) == objectTag && !isArguments(value)) || (!hasOwnProperty.call(value, 'constructor') && (Ctor = value.constructor, typeof Ctor == 'function' && !(Ctor instanceof Ctor)))) {
            return false;
          }
          var result;
          baseForIn(value, function(subValue, key) {
            result = key;
          });
          return result === undefined || hasOwnProperty.call(value, result);
        }
        function isRegExp(value) {
          return isObject(value) && objToString.call(value) == regexpTag;
        }
        function isString(value) {
          return typeof value == 'string' || (isObjectLike(value) && objToString.call(value) == stringTag);
        }
        function isTypedArray(value) {
          return isObjectLike(value) && isLength(value.length) && !!typedArrayTags[objToString.call(value)];
        }
        function isUndefined(value) {
          return value === undefined;
        }
        function lt(value, other) {
          return value < other;
        }
        function lte(value, other) {
          return value <= other;
        }
        function toArray(value) {
          var length = value ? getLength(value) : 0;
          if (!isLength(length)) {
            return values(value);
          }
          if (!length) {
            return [];
          }
          return arrayCopy(value);
        }
        function toPlainObject(value) {
          return baseCopy(value, keysIn(value));
        }
        var merge = createAssigner(baseMerge);
        var assign = createAssigner(function(object, source, customizer) {
          return customizer ? assignWith(object, source, customizer) : baseAssign(object, source);
        });
        function create(prototype, properties, guard) {
          var result = baseCreate(prototype);
          if (guard && isIterateeCall(prototype, properties, guard)) {
            properties = undefined;
          }
          return properties ? baseAssign(result, properties) : result;
        }
        var defaults = createDefaults(assign, assignDefaults);
        var defaultsDeep = createDefaults(merge, mergeDefaults);
        var findKey = createFindKey(baseForOwn);
        var findLastKey = createFindKey(baseForOwnRight);
        var forIn = createForIn(baseFor);
        var forInRight = createForIn(baseForRight);
        var forOwn = createForOwn(baseForOwn);
        var forOwnRight = createForOwn(baseForOwnRight);
        function functions(object) {
          return baseFunctions(object, keysIn(object));
        }
        function get(object, path, defaultValue) {
          var result = object == null ? undefined : baseGet(object, toPath(path), path + '');
          return result === undefined ? defaultValue : result;
        }
        function has(object, path) {
          if (object == null) {
            return false;
          }
          var result = hasOwnProperty.call(object, path);
          if (!result && !isKey(path)) {
            path = toPath(path);
            object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
            if (object == null) {
              return false;
            }
            path = last(path);
            result = hasOwnProperty.call(object, path);
          }
          return result || (isLength(object.length) && isIndex(path, object.length) && (isArray(object) || isArguments(object)));
        }
        function invert(object, multiValue, guard) {
          if (guard && isIterateeCall(object, multiValue, guard)) {
            multiValue = undefined;
          }
          var index = -1,
              props = keys(object),
              length = props.length,
              result = {};
          while (++index < length) {
            var key = props[index],
                value = object[key];
            if (multiValue) {
              if (hasOwnProperty.call(result, value)) {
                result[value].push(key);
              } else {
                result[value] = [key];
              }
            } else {
              result[value] = key;
            }
          }
          return result;
        }
        var keys = !nativeKeys ? shimKeys : function(object) {
          var Ctor = object == null ? undefined : object.constructor;
          if ((typeof Ctor == 'function' && Ctor.prototype === object) || (typeof object != 'function' && isArrayLike(object))) {
            return shimKeys(object);
          }
          return isObject(object) ? nativeKeys(object) : [];
        };
        function keysIn(object) {
          if (object == null) {
            return [];
          }
          if (!isObject(object)) {
            object = Object(object);
          }
          var length = object.length;
          length = (length && isLength(length) && (isArray(object) || isArguments(object)) && length) || 0;
          var Ctor = object.constructor,
              index = -1,
              isProto = typeof Ctor == 'function' && Ctor.prototype === object,
              result = Array(length),
              skipIndexes = length > 0;
          while (++index < length) {
            result[index] = (index + '');
          }
          for (var key in object) {
            if (!(skipIndexes && isIndex(key, length)) && !(key == 'constructor' && (isProto || !hasOwnProperty.call(object, key)))) {
              result.push(key);
            }
          }
          return result;
        }
        var mapKeys = createObjectMapper(true);
        var mapValues = createObjectMapper();
        var omit = restParam(function(object, props) {
          if (object == null) {
            return {};
          }
          if (typeof props[0] != 'function') {
            var props = arrayMap(baseFlatten(props), String);
            return pickByArray(object, baseDifference(keysIn(object), props));
          }
          var predicate = bindCallback(props[0], props[1], 3);
          return pickByCallback(object, function(value, key, object) {
            return !predicate(value, key, object);
          });
        });
        function pairs(object) {
          object = toObject(object);
          var index = -1,
              props = keys(object),
              length = props.length,
              result = Array(length);
          while (++index < length) {
            var key = props[index];
            result[index] = [key, object[key]];
          }
          return result;
        }
        var pick = restParam(function(object, props) {
          if (object == null) {
            return {};
          }
          return typeof props[0] == 'function' ? pickByCallback(object, bindCallback(props[0], props[1], 3)) : pickByArray(object, baseFlatten(props));
        });
        function result(object, path, defaultValue) {
          var result = object == null ? undefined : object[path];
          if (result === undefined) {
            if (object != null && !isKey(path, object)) {
              path = toPath(path);
              object = path.length == 1 ? object : baseGet(object, baseSlice(path, 0, -1));
              result = object == null ? undefined : object[last(path)];
            }
            result = result === undefined ? defaultValue : result;
          }
          return isFunction(result) ? result.call(object) : result;
        }
        function set(object, path, value) {
          if (object == null) {
            return object;
          }
          var pathKey = (path + '');
          path = (object[pathKey] != null || isKey(path, object)) ? [pathKey] : toPath(path);
          var index = -1,
              length = path.length,
              lastIndex = length - 1,
              nested = object;
          while (nested != null && ++index < length) {
            var key = path[index];
            if (isObject(nested)) {
              if (index == lastIndex) {
                nested[key] = value;
              } else if (nested[key] == null) {
                nested[key] = isIndex(path[index + 1]) ? [] : {};
              }
            }
            nested = nested[key];
          }
          return object;
        }
        function transform(object, iteratee, accumulator, thisArg) {
          var isArr = isArray(object) || isTypedArray(object);
          iteratee = getCallback(iteratee, thisArg, 4);
          if (accumulator == null) {
            if (isArr || isObject(object)) {
              var Ctor = object.constructor;
              if (isArr) {
                accumulator = isArray(object) ? new Ctor : [];
              } else {
                accumulator = baseCreate(isFunction(Ctor) ? Ctor.prototype : undefined);
              }
            } else {
              accumulator = {};
            }
          }
          (isArr ? arrayEach : baseForOwn)(object, function(value, index, object) {
            return iteratee(accumulator, value, index, object);
          });
          return accumulator;
        }
        function values(object) {
          return baseValues(object, keys(object));
        }
        function valuesIn(object) {
          return baseValues(object, keysIn(object));
        }
        function inRange(value, start, end) {
          start = +start || 0;
          if (end === undefined) {
            end = start;
            start = 0;
          } else {
            end = +end || 0;
          }
          return value >= nativeMin(start, end) && value < nativeMax(start, end);
        }
        function random(min, max, floating) {
          if (floating && isIterateeCall(min, max, floating)) {
            max = floating = undefined;
          }
          var noMin = min == null,
              noMax = max == null;
          if (floating == null) {
            if (noMax && typeof min == 'boolean') {
              floating = min;
              min = 1;
            } else if (typeof max == 'boolean') {
              floating = max;
              noMax = true;
            }
          }
          if (noMin && noMax) {
            max = 1;
            noMax = false;
          }
          min = +min || 0;
          if (noMax) {
            max = min;
            min = 0;
          } else {
            max = +max || 0;
          }
          if (floating || min % 1 || max % 1) {
            var rand = nativeRandom();
            return nativeMin(min + (rand * (max - min + parseFloat('1e-' + ((rand + '').length - 1)))), max);
          }
          return baseRandom(min, max);
        }
        var camelCase = createCompounder(function(result, word, index) {
          word = word.toLowerCase();
          return result + (index ? (word.charAt(0).toUpperCase() + word.slice(1)) : word);
        });
        function capitalize(string) {
          string = baseToString(string);
          return string && (string.charAt(0).toUpperCase() + string.slice(1));
        }
        function deburr(string) {
          string = baseToString(string);
          return string && string.replace(reLatin1, deburrLetter).replace(reComboMark, '');
        }
        function endsWith(string, target, position) {
          string = baseToString(string);
          target = (target + '');
          var length = string.length;
          position = position === undefined ? length : nativeMin(position < 0 ? 0 : (+position || 0), length);
          position -= target.length;
          return position >= 0 && string.indexOf(target, position) == position;
        }
        function escape(string) {
          string = baseToString(string);
          return (string && reHasUnescapedHtml.test(string)) ? string.replace(reUnescapedHtml, escapeHtmlChar) : string;
        }
        function escapeRegExp(string) {
          string = baseToString(string);
          return (string && reHasRegExpChars.test(string)) ? string.replace(reRegExpChars, escapeRegExpChar) : (string || '(?:)');
        }
        var kebabCase = createCompounder(function(result, word, index) {
          return result + (index ? '-' : '') + word.toLowerCase();
        });
        function pad(string, length, chars) {
          string = baseToString(string);
          length = +length;
          var strLength = string.length;
          if (strLength >= length || !nativeIsFinite(length)) {
            return string;
          }
          var mid = (length - strLength) / 2,
              leftLength = nativeFloor(mid),
              rightLength = nativeCeil(mid);
          chars = createPadding('', rightLength, chars);
          return chars.slice(0, leftLength) + string + chars;
        }
        var padLeft = createPadDir();
        var padRight = createPadDir(true);
        function parseInt(string, radix, guard) {
          if (guard ? isIterateeCall(string, radix, guard) : radix == null) {
            radix = 0;
          } else if (radix) {
            radix = +radix;
          }
          string = trim(string);
          return nativeParseInt(string, radix || (reHasHexPrefix.test(string) ? 16 : 10));
        }
        function repeat(string, n) {
          var result = '';
          string = baseToString(string);
          n = +n;
          if (n < 1 || !string || !nativeIsFinite(n)) {
            return result;
          }
          do {
            if (n % 2) {
              result += string;
            }
            n = nativeFloor(n / 2);
            string += string;
          } while (n);
          return result;
        }
        var snakeCase = createCompounder(function(result, word, index) {
          return result + (index ? '_' : '') + word.toLowerCase();
        });
        var startCase = createCompounder(function(result, word, index) {
          return result + (index ? ' ' : '') + (word.charAt(0).toUpperCase() + word.slice(1));
        });
        function startsWith(string, target, position) {
          string = baseToString(string);
          position = position == null ? 0 : nativeMin(position < 0 ? 0 : (+position || 0), string.length);
          return string.lastIndexOf(target, position) == position;
        }
        function template(string, options, otherOptions) {
          var settings = lodash.templateSettings;
          if (otherOptions && isIterateeCall(string, options, otherOptions)) {
            options = otherOptions = undefined;
          }
          string = baseToString(string);
          options = assignWith(baseAssign({}, otherOptions || options), settings, assignOwnDefaults);
          var imports = assignWith(baseAssign({}, options.imports), settings.imports, assignOwnDefaults),
              importsKeys = keys(imports),
              importsValues = baseValues(imports, importsKeys);
          var isEscaping,
              isEvaluating,
              index = 0,
              interpolate = options.interpolate || reNoMatch,
              source = "__p += '";
          var reDelimiters = RegExp((options.escape || reNoMatch).source + '|' + interpolate.source + '|' + (interpolate === reInterpolate ? reEsTemplate : reNoMatch).source + '|' + (options.evaluate || reNoMatch).source + '|$', 'g');
          var sourceURL = '//# sourceURL=' + ('sourceURL' in options ? options.sourceURL : ('lodash.templateSources[' + (++templateCounter) + ']')) + '\n';
          string.replace(reDelimiters, function(match, escapeValue, interpolateValue, esTemplateValue, evaluateValue, offset) {
            interpolateValue || (interpolateValue = esTemplateValue);
            source += string.slice(index, offset).replace(reUnescapedString, escapeStringChar);
            if (escapeValue) {
              isEscaping = true;
              source += "' +\n__e(" + escapeValue + ") +\n'";
            }
            if (evaluateValue) {
              isEvaluating = true;
              source += "';\n" + evaluateValue + ";\n__p += '";
            }
            if (interpolateValue) {
              source += "' +\n((__t = (" + interpolateValue + ")) == null ? '' : __t) +\n'";
            }
            index = offset + match.length;
            return match;
          });
          source += "';\n";
          var variable = options.variable;
          if (!variable) {
            source = 'with (obj) {\n' + source + '\n}\n';
          }
          source = (isEvaluating ? source.replace(reEmptyStringLeading, '') : source).replace(reEmptyStringMiddle, '$1').replace(reEmptyStringTrailing, '$1;');
          source = 'function(' + (variable || 'obj') + ') {\n' + (variable ? '' : 'obj || (obj = {});\n') + "var __t, __p = ''" + (isEscaping ? ', __e = _.escape' : '') + (isEvaluating ? ', __j = Array.prototype.join;\n' + "function print() { __p += __j.call(arguments, '') }\n" : ';\n') + source + 'return __p\n}';
          var result = attempt(function() {
            return Function(importsKeys, sourceURL + 'return ' + source).apply(undefined, importsValues);
          });
          result.source = source;
          if (isError(result)) {
            throw result;
          }
          return result;
        }
        function trim(string, chars, guard) {
          var value = string;
          string = baseToString(string);
          if (!string) {
            return string;
          }
          if (guard ? isIterateeCall(value, chars, guard) : chars == null) {
            return string.slice(trimmedLeftIndex(string), trimmedRightIndex(string) + 1);
          }
          chars = (chars + '');
          return string.slice(charsLeftIndex(string, chars), charsRightIndex(string, chars) + 1);
        }
        function trimLeft(string, chars, guard) {
          var value = string;
          string = baseToString(string);
          if (!string) {
            return string;
          }
          if (guard ? isIterateeCall(value, chars, guard) : chars == null) {
            return string.slice(trimmedLeftIndex(string));
          }
          return string.slice(charsLeftIndex(string, (chars + '')));
        }
        function trimRight(string, chars, guard) {
          var value = string;
          string = baseToString(string);
          if (!string) {
            return string;
          }
          if (guard ? isIterateeCall(value, chars, guard) : chars == null) {
            return string.slice(0, trimmedRightIndex(string) + 1);
          }
          return string.slice(0, charsRightIndex(string, (chars + '')) + 1);
        }
        function trunc(string, options, guard) {
          if (guard && isIterateeCall(string, options, guard)) {
            options = undefined;
          }
          var length = DEFAULT_TRUNC_LENGTH,
              omission = DEFAULT_TRUNC_OMISSION;
          if (options != null) {
            if (isObject(options)) {
              var separator = 'separator' in options ? options.separator : separator;
              length = 'length' in options ? (+options.length || 0) : length;
              omission = 'omission' in options ? baseToString(options.omission) : omission;
            } else {
              length = +options || 0;
            }
          }
          string = baseToString(string);
          if (length >= string.length) {
            return string;
          }
          var end = length - omission.length;
          if (end < 1) {
            return omission;
          }
          var result = string.slice(0, end);
          if (separator == null) {
            return result + omission;
          }
          if (isRegExp(separator)) {
            if (string.slice(end).search(separator)) {
              var match,
                  newEnd,
                  substring = string.slice(0, end);
              if (!separator.global) {
                separator = RegExp(separator.source, (reFlags.exec(separator) || '') + 'g');
              }
              separator.lastIndex = 0;
              while ((match = separator.exec(substring))) {
                newEnd = match.index;
              }
              result = result.slice(0, newEnd == null ? end : newEnd);
            }
          } else if (string.indexOf(separator, end) != end) {
            var index = result.lastIndexOf(separator);
            if (index > -1) {
              result = result.slice(0, index);
            }
          }
          return result + omission;
        }
        function unescape(string) {
          string = baseToString(string);
          return (string && reHasEscapedHtml.test(string)) ? string.replace(reEscapedHtml, unescapeHtmlChar) : string;
        }
        function words(string, pattern, guard) {
          if (guard && isIterateeCall(string, pattern, guard)) {
            pattern = undefined;
          }
          string = baseToString(string);
          return string.match(pattern || reWords) || [];
        }
        var attempt = restParam(function(func, args) {
          try {
            return func.apply(undefined, args);
          } catch (e) {
            return isError(e) ? e : new Error(e);
          }
        });
        function callback(func, thisArg, guard) {
          if (guard && isIterateeCall(func, thisArg, guard)) {
            thisArg = undefined;
          }
          return isObjectLike(func) ? matches(func) : baseCallback(func, thisArg);
        }
        function constant(value) {
          return function() {
            return value;
          };
        }
        function identity(value) {
          return value;
        }
        function matches(source) {
          return baseMatches(baseClone(source, true));
        }
        function matchesProperty(path, srcValue) {
          return baseMatchesProperty(path, baseClone(srcValue, true));
        }
        var method = restParam(function(path, args) {
          return function(object) {
            return invokePath(object, path, args);
          };
        });
        var methodOf = restParam(function(object, args) {
          return function(path) {
            return invokePath(object, path, args);
          };
        });
        function mixin(object, source, options) {
          if (options == null) {
            var isObj = isObject(source),
                props = isObj ? keys(source) : undefined,
                methodNames = (props && props.length) ? baseFunctions(source, props) : undefined;
            if (!(methodNames ? methodNames.length : isObj)) {
              methodNames = false;
              options = source;
              source = object;
              object = this;
            }
          }
          if (!methodNames) {
            methodNames = baseFunctions(source, keys(source));
          }
          var chain = true,
              index = -1,
              isFunc = isFunction(object),
              length = methodNames.length;
          if (options === false) {
            chain = false;
          } else if (isObject(options) && 'chain' in options) {
            chain = options.chain;
          }
          while (++index < length) {
            var methodName = methodNames[index],
                func = source[methodName];
            object[methodName] = func;
            if (isFunc) {
              object.prototype[methodName] = (function(func) {
                return function() {
                  var chainAll = this.__chain__;
                  if (chain || chainAll) {
                    var result = object(this.__wrapped__),
                        actions = result.__actions__ = arrayCopy(this.__actions__);
                    actions.push({
                      'func': func,
                      'args': arguments,
                      'thisArg': object
                    });
                    result.__chain__ = chainAll;
                    return result;
                  }
                  return func.apply(object, arrayPush([this.value()], arguments));
                };
              }(func));
            }
          }
          return object;
        }
        function noConflict() {
          root._ = oldDash;
          return this;
        }
        function noop() {}
        function property(path) {
          return isKey(path) ? baseProperty(path) : basePropertyDeep(path);
        }
        function propertyOf(object) {
          return function(path) {
            return baseGet(object, toPath(path), path + '');
          };
        }
        function range(start, end, step) {
          if (step && isIterateeCall(start, end, step)) {
            end = step = undefined;
          }
          start = +start || 0;
          step = step == null ? 1 : (+step || 0);
          if (end == null) {
            end = start;
            start = 0;
          } else {
            end = +end || 0;
          }
          var index = -1,
              length = nativeMax(nativeCeil((end - start) / (step || 1)), 0),
              result = Array(length);
          while (++index < length) {
            result[index] = start;
            start += step;
          }
          return result;
        }
        function times(n, iteratee, thisArg) {
          n = nativeFloor(n);
          if (n < 1 || !nativeIsFinite(n)) {
            return [];
          }
          var index = -1,
              result = Array(nativeMin(n, MAX_ARRAY_LENGTH));
          iteratee = bindCallback(iteratee, thisArg, 1);
          while (++index < n) {
            if (index < MAX_ARRAY_LENGTH) {
              result[index] = iteratee(index);
            } else {
              iteratee(index);
            }
          }
          return result;
        }
        function uniqueId(prefix) {
          var id = ++idCounter;
          return baseToString(prefix) + id;
        }
        function add(augend, addend) {
          return (+augend || 0) + (+addend || 0);
        }
        var ceil = createRound('ceil');
        var floor = createRound('floor');
        var max = createExtremum(gt, NEGATIVE_INFINITY);
        var min = createExtremum(lt, POSITIVE_INFINITY);
        var round = createRound('round');
        function sum(collection, iteratee, thisArg) {
          if (thisArg && isIterateeCall(collection, iteratee, thisArg)) {
            iteratee = undefined;
          }
          iteratee = getCallback(iteratee, thisArg, 3);
          return iteratee.length == 1 ? arraySum(isArray(collection) ? collection : toIterable(collection), iteratee) : baseSum(collection, iteratee);
        }
        lodash.prototype = baseLodash.prototype;
        LodashWrapper.prototype = baseCreate(baseLodash.prototype);
        LodashWrapper.prototype.constructor = LodashWrapper;
        LazyWrapper.prototype = baseCreate(baseLodash.prototype);
        LazyWrapper.prototype.constructor = LazyWrapper;
        MapCache.prototype['delete'] = mapDelete;
        MapCache.prototype.get = mapGet;
        MapCache.prototype.has = mapHas;
        MapCache.prototype.set = mapSet;
        SetCache.prototype.push = cachePush;
        memoize.Cache = MapCache;
        lodash.after = after;
        lodash.ary = ary;
        lodash.assign = assign;
        lodash.at = at;
        lodash.before = before;
        lodash.bind = bind;
        lodash.bindAll = bindAll;
        lodash.bindKey = bindKey;
        lodash.callback = callback;
        lodash.chain = chain;
        lodash.chunk = chunk;
        lodash.compact = compact;
        lodash.constant = constant;
        lodash.countBy = countBy;
        lodash.create = create;
        lodash.curry = curry;
        lodash.curryRight = curryRight;
        lodash.debounce = debounce;
        lodash.defaults = defaults;
        lodash.defaultsDeep = defaultsDeep;
        lodash.defer = defer;
        lodash.delay = delay;
        lodash.difference = difference;
        lodash.drop = drop;
        lodash.dropRight = dropRight;
        lodash.dropRightWhile = dropRightWhile;
        lodash.dropWhile = dropWhile;
        lodash.fill = fill;
        lodash.filter = filter;
        lodash.flatten = flatten;
        lodash.flattenDeep = flattenDeep;
        lodash.flow = flow;
        lodash.flowRight = flowRight;
        lodash.forEach = forEach;
        lodash.forEachRight = forEachRight;
        lodash.forIn = forIn;
        lodash.forInRight = forInRight;
        lodash.forOwn = forOwn;
        lodash.forOwnRight = forOwnRight;
        lodash.functions = functions;
        lodash.groupBy = groupBy;
        lodash.indexBy = indexBy;
        lodash.initial = initial;
        lodash.intersection = intersection;
        lodash.invert = invert;
        lodash.invoke = invoke;
        lodash.keys = keys;
        lodash.keysIn = keysIn;
        lodash.map = map;
        lodash.mapKeys = mapKeys;
        lodash.mapValues = mapValues;
        lodash.matches = matches;
        lodash.matchesProperty = matchesProperty;
        lodash.memoize = memoize;
        lodash.merge = merge;
        lodash.method = method;
        lodash.methodOf = methodOf;
        lodash.mixin = mixin;
        lodash.modArgs = modArgs;
        lodash.negate = negate;
        lodash.omit = omit;
        lodash.once = once;
        lodash.pairs = pairs;
        lodash.partial = partial;
        lodash.partialRight = partialRight;
        lodash.partition = partition;
        lodash.pick = pick;
        lodash.pluck = pluck;
        lodash.property = property;
        lodash.propertyOf = propertyOf;
        lodash.pull = pull;
        lodash.pullAt = pullAt;
        lodash.range = range;
        lodash.rearg = rearg;
        lodash.reject = reject;
        lodash.remove = remove;
        lodash.rest = rest;
        lodash.restParam = restParam;
        lodash.set = set;
        lodash.shuffle = shuffle;
        lodash.slice = slice;
        lodash.sortBy = sortBy;
        lodash.sortByAll = sortByAll;
        lodash.sortByOrder = sortByOrder;
        lodash.spread = spread;
        lodash.take = take;
        lodash.takeRight = takeRight;
        lodash.takeRightWhile = takeRightWhile;
        lodash.takeWhile = takeWhile;
        lodash.tap = tap;
        lodash.throttle = throttle;
        lodash.thru = thru;
        lodash.times = times;
        lodash.toArray = toArray;
        lodash.toPlainObject = toPlainObject;
        lodash.transform = transform;
        lodash.union = union;
        lodash.uniq = uniq;
        lodash.unzip = unzip;
        lodash.unzipWith = unzipWith;
        lodash.values = values;
        lodash.valuesIn = valuesIn;
        lodash.where = where;
        lodash.without = without;
        lodash.wrap = wrap;
        lodash.xor = xor;
        lodash.zip = zip;
        lodash.zipObject = zipObject;
        lodash.zipWith = zipWith;
        lodash.backflow = flowRight;
        lodash.collect = map;
        lodash.compose = flowRight;
        lodash.each = forEach;
        lodash.eachRight = forEachRight;
        lodash.extend = assign;
        lodash.iteratee = callback;
        lodash.methods = functions;
        lodash.object = zipObject;
        lodash.select = filter;
        lodash.tail = rest;
        lodash.unique = uniq;
        mixin(lodash, lodash);
        lodash.add = add;
        lodash.attempt = attempt;
        lodash.camelCase = camelCase;
        lodash.capitalize = capitalize;
        lodash.ceil = ceil;
        lodash.clone = clone;
        lodash.cloneDeep = cloneDeep;
        lodash.deburr = deburr;
        lodash.endsWith = endsWith;
        lodash.escape = escape;
        lodash.escapeRegExp = escapeRegExp;
        lodash.every = every;
        lodash.find = find;
        lodash.findIndex = findIndex;
        lodash.findKey = findKey;
        lodash.findLast = findLast;
        lodash.findLastIndex = findLastIndex;
        lodash.findLastKey = findLastKey;
        lodash.findWhere = findWhere;
        lodash.first = first;
        lodash.floor = floor;
        lodash.get = get;
        lodash.gt = gt;
        lodash.gte = gte;
        lodash.has = has;
        lodash.identity = identity;
        lodash.includes = includes;
        lodash.indexOf = indexOf;
        lodash.inRange = inRange;
        lodash.isArguments = isArguments;
        lodash.isArray = isArray;
        lodash.isBoolean = isBoolean;
        lodash.isDate = isDate;
        lodash.isElement = isElement;
        lodash.isEmpty = isEmpty;
        lodash.isEqual = isEqual;
        lodash.isError = isError;
        lodash.isFinite = isFinite;
        lodash.isFunction = isFunction;
        lodash.isMatch = isMatch;
        lodash.isNaN = isNaN;
        lodash.isNative = isNative;
        lodash.isNull = isNull;
        lodash.isNumber = isNumber;
        lodash.isObject = isObject;
        lodash.isPlainObject = isPlainObject;
        lodash.isRegExp = isRegExp;
        lodash.isString = isString;
        lodash.isTypedArray = isTypedArray;
        lodash.isUndefined = isUndefined;
        lodash.kebabCase = kebabCase;
        lodash.last = last;
        lodash.lastIndexOf = lastIndexOf;
        lodash.lt = lt;
        lodash.lte = lte;
        lodash.max = max;
        lodash.min = min;
        lodash.noConflict = noConflict;
        lodash.noop = noop;
        lodash.now = now;
        lodash.pad = pad;
        lodash.padLeft = padLeft;
        lodash.padRight = padRight;
        lodash.parseInt = parseInt;
        lodash.random = random;
        lodash.reduce = reduce;
        lodash.reduceRight = reduceRight;
        lodash.repeat = repeat;
        lodash.result = result;
        lodash.round = round;
        lodash.runInContext = runInContext;
        lodash.size = size;
        lodash.snakeCase = snakeCase;
        lodash.some = some;
        lodash.sortedIndex = sortedIndex;
        lodash.sortedLastIndex = sortedLastIndex;
        lodash.startCase = startCase;
        lodash.startsWith = startsWith;
        lodash.sum = sum;
        lodash.template = template;
        lodash.trim = trim;
        lodash.trimLeft = trimLeft;
        lodash.trimRight = trimRight;
        lodash.trunc = trunc;
        lodash.unescape = unescape;
        lodash.uniqueId = uniqueId;
        lodash.words = words;
        lodash.all = every;
        lodash.any = some;
        lodash.contains = includes;
        lodash.eq = isEqual;
        lodash.detect = find;
        lodash.foldl = reduce;
        lodash.foldr = reduceRight;
        lodash.head = first;
        lodash.include = includes;
        lodash.inject = reduce;
        mixin(lodash, (function() {
          var source = {};
          baseForOwn(lodash, function(func, methodName) {
            if (!lodash.prototype[methodName]) {
              source[methodName] = func;
            }
          });
          return source;
        }()), false);
        lodash.sample = sample;
        lodash.prototype.sample = function(n) {
          if (!this.__chain__ && n == null) {
            return sample(this.value());
          }
          return this.thru(function(value) {
            return sample(value, n);
          });
        };
        lodash.VERSION = VERSION;
        arrayEach(['bind', 'bindKey', 'curry', 'curryRight', 'partial', 'partialRight'], function(methodName) {
          lodash[methodName].placeholder = lodash;
        });
        arrayEach(['drop', 'take'], function(methodName, index) {
          LazyWrapper.prototype[methodName] = function(n) {
            var filtered = this.__filtered__;
            if (filtered && !index) {
              return new LazyWrapper(this);
            }
            n = n == null ? 1 : nativeMax(nativeFloor(n) || 0, 0);
            var result = this.clone();
            if (filtered) {
              result.__takeCount__ = nativeMin(result.__takeCount__, n);
            } else {
              result.__views__.push({
                'size': n,
                'type': methodName + (result.__dir__ < 0 ? 'Right' : '')
              });
            }
            return result;
          };
          LazyWrapper.prototype[methodName + 'Right'] = function(n) {
            return this.reverse()[methodName](n).reverse();
          };
        });
        arrayEach(['filter', 'map', 'takeWhile'], function(methodName, index) {
          var type = index + 1,
              isFilter = type != LAZY_MAP_FLAG;
          LazyWrapper.prototype[methodName] = function(iteratee, thisArg) {
            var result = this.clone();
            result.__iteratees__.push({
              'iteratee': getCallback(iteratee, thisArg, 1),
              'type': type
            });
            result.__filtered__ = result.__filtered__ || isFilter;
            return result;
          };
        });
        arrayEach(['first', 'last'], function(methodName, index) {
          var takeName = 'take' + (index ? 'Right' : '');
          LazyWrapper.prototype[methodName] = function() {
            return this[takeName](1).value()[0];
          };
        });
        arrayEach(['initial', 'rest'], function(methodName, index) {
          var dropName = 'drop' + (index ? '' : 'Right');
          LazyWrapper.prototype[methodName] = function() {
            return this.__filtered__ ? new LazyWrapper(this) : this[dropName](1);
          };
        });
        arrayEach(['pluck', 'where'], function(methodName, index) {
          var operationName = index ? 'filter' : 'map',
              createCallback = index ? baseMatches : property;
          LazyWrapper.prototype[methodName] = function(value) {
            return this[operationName](createCallback(value));
          };
        });
        LazyWrapper.prototype.compact = function() {
          return this.filter(identity);
        };
        LazyWrapper.prototype.reject = function(predicate, thisArg) {
          predicate = getCallback(predicate, thisArg, 1);
          return this.filter(function(value) {
            return !predicate(value);
          });
        };
        LazyWrapper.prototype.slice = function(start, end) {
          start = start == null ? 0 : (+start || 0);
          var result = this;
          if (result.__filtered__ && (start > 0 || end < 0)) {
            return new LazyWrapper(result);
          }
          if (start < 0) {
            result = result.takeRight(-start);
          } else if (start) {
            result = result.drop(start);
          }
          if (end !== undefined) {
            end = (+end || 0);
            result = end < 0 ? result.dropRight(-end) : result.take(end - start);
          }
          return result;
        };
        LazyWrapper.prototype.takeRightWhile = function(predicate, thisArg) {
          return this.reverse().takeWhile(predicate, thisArg).reverse();
        };
        LazyWrapper.prototype.toArray = function() {
          return this.take(POSITIVE_INFINITY);
        };
        baseForOwn(LazyWrapper.prototype, function(func, methodName) {
          var checkIteratee = /^(?:filter|map|reject)|While$/.test(methodName),
              retUnwrapped = /^(?:first|last)$/.test(methodName),
              lodashFunc = lodash[retUnwrapped ? ('take' + (methodName == 'last' ? 'Right' : '')) : methodName];
          if (!lodashFunc) {
            return;
          }
          lodash.prototype[methodName] = function() {
            var args = retUnwrapped ? [1] : arguments,
                chainAll = this.__chain__,
                value = this.__wrapped__,
                isHybrid = !!this.__actions__.length,
                isLazy = value instanceof LazyWrapper,
                iteratee = args[0],
                useLazy = isLazy || isArray(value);
            if (useLazy && checkIteratee && typeof iteratee == 'function' && iteratee.length != 1) {
              isLazy = useLazy = false;
            }
            var interceptor = function(value) {
              return (retUnwrapped && chainAll) ? lodashFunc(value, 1)[0] : lodashFunc.apply(undefined, arrayPush([value], args));
            };
            var action = {
              'func': thru,
              'args': [interceptor],
              'thisArg': undefined
            },
                onlyLazy = isLazy && !isHybrid;
            if (retUnwrapped && !chainAll) {
              if (onlyLazy) {
                value = value.clone();
                value.__actions__.push(action);
                return func.call(value);
              }
              return lodashFunc.call(undefined, this.value())[0];
            }
            if (!retUnwrapped && useLazy) {
              value = onlyLazy ? value : new LazyWrapper(this);
              var result = func.apply(value, args);
              result.__actions__.push(action);
              return new LodashWrapper(result, chainAll);
            }
            return this.thru(interceptor);
          };
        });
        arrayEach(['join', 'pop', 'push', 'replace', 'shift', 'sort', 'splice', 'split', 'unshift'], function(methodName) {
          var func = (/^(?:replace|split)$/.test(methodName) ? stringProto : arrayProto)[methodName],
              chainName = /^(?:push|sort|unshift)$/.test(methodName) ? 'tap' : 'thru',
              retUnwrapped = /^(?:join|pop|replace|shift)$/.test(methodName);
          lodash.prototype[methodName] = function() {
            var args = arguments;
            if (retUnwrapped && !this.__chain__) {
              return func.apply(this.value(), args);
            }
            return this[chainName](function(value) {
              return func.apply(value, args);
            });
          };
        });
        baseForOwn(LazyWrapper.prototype, function(func, methodName) {
          var lodashFunc = lodash[methodName];
          if (lodashFunc) {
            var key = lodashFunc.name,
                names = realNames[key] || (realNames[key] = []);
            names.push({
              'name': methodName,
              'func': lodashFunc
            });
          }
        });
        realNames[createHybridWrapper(undefined, BIND_KEY_FLAG).name] = [{
          'name': 'wrapper',
          'func': undefined
        }];
        LazyWrapper.prototype.clone = lazyClone;
        LazyWrapper.prototype.reverse = lazyReverse;
        LazyWrapper.prototype.value = lazyValue;
        lodash.prototype.chain = wrapperChain;
        lodash.prototype.commit = wrapperCommit;
        lodash.prototype.concat = wrapperConcat;
        lodash.prototype.plant = wrapperPlant;
        lodash.prototype.reverse = wrapperReverse;
        lodash.prototype.toString = wrapperToString;
        lodash.prototype.run = lodash.prototype.toJSON = lodash.prototype.valueOf = lodash.prototype.value = wrapperValue;
        lodash.prototype.collect = lodash.prototype.map;
        lodash.prototype.head = lodash.prototype.first;
        lodash.prototype.select = lodash.prototype.filter;
        lodash.prototype.tail = lodash.prototype.rest;
        return lodash;
      }
      var _ = runInContext();
      if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
        root._ = _;
        define(function() {
          return _;
        });
      } else if (freeExports && freeModule) {
        if (moduleExports) {
          (freeModule.exports = _)._ = _;
        } else {
          freeExports._ = _;
        }
      } else {
        root._ = _;
      }
    }.call(this));
  })(req('11'));
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("50", ["4f"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('4f');
  global.define = __define;
  return module.exports;
});

$__System.registerDynamic("51", [], false, function(__require, __exports, __module) {
  var _retrieveGlobal = $__System.get("@@global-helpers").prepareGlobal(__module.id, "angular", null);
  (function() {
    "format global";
    "exports angular";
    (function(window, document, undefined) {
      'use strict';
      function minErr(module, ErrorConstructor) {
        ErrorConstructor = ErrorConstructor || Error;
        return function() {
          var SKIP_INDEXES = 2;
          var templateArgs = arguments,
              code = templateArgs[0],
              message = '[' + (module ? module + ':' : '') + code + '] ',
              template = templateArgs[1],
              paramPrefix,
              i;
          message += template.replace(/\{\d+\}/g, function(match) {
            var index = +match.slice(1, -1),
                shiftedIndex = index + SKIP_INDEXES;
            if (shiftedIndex < templateArgs.length) {
              return toDebugString(templateArgs[shiftedIndex]);
            }
            return match;
          });
          message += '\nhttp://errors.angularjs.org/1.4.8/' + (module ? module + '/' : '') + code;
          for (i = SKIP_INDEXES, paramPrefix = '?'; i < templateArgs.length; i++, paramPrefix = '&') {
            message += paramPrefix + 'p' + (i - SKIP_INDEXES) + '=' + encodeURIComponent(toDebugString(templateArgs[i]));
          }
          return new ErrorConstructor(message);
        };
      }
      var REGEX_STRING_REGEXP = /^\/(.+)\/([a-z]*)$/;
      var VALIDITY_STATE_PROPERTY = 'validity';
      var lowercase = function(string) {
        return isString(string) ? string.toLowerCase() : string;
      };
      var hasOwnProperty = Object.prototype.hasOwnProperty;
      var uppercase = function(string) {
        return isString(string) ? string.toUpperCase() : string;
      };
      var manualLowercase = function(s) {
        return isString(s) ? s.replace(/[A-Z]/g, function(ch) {
          return String.fromCharCode(ch.charCodeAt(0) | 32);
        }) : s;
      };
      var manualUppercase = function(s) {
        return isString(s) ? s.replace(/[a-z]/g, function(ch) {
          return String.fromCharCode(ch.charCodeAt(0) & ~32);
        }) : s;
      };
      if ('i' !== 'I'.toLowerCase()) {
        lowercase = manualLowercase;
        uppercase = manualUppercase;
      }
      var msie,
          jqLite,
          jQuery,
          slice = [].slice,
          splice = [].splice,
          push = [].push,
          toString = Object.prototype.toString,
          getPrototypeOf = Object.getPrototypeOf,
          ngMinErr = minErr('ng'),
          angular = window.angular || (window.angular = {}),
          angularModule,
          uid = 0;
      msie = document.documentMode;
      function isArrayLike(obj) {
        if (obj == null || isWindow(obj))
          return false;
        if (isArray(obj) || isString(obj) || (jqLite && obj instanceof jqLite))
          return true;
        var length = "length" in Object(obj) && obj.length;
        return isNumber(length) && (length >= 0 && (length - 1) in obj || typeof obj.item == 'function');
      }
      function forEach(obj, iterator, context) {
        var key,
            length;
        if (obj) {
          if (isFunction(obj)) {
            for (key in obj) {
              if (key != 'prototype' && key != 'length' && key != 'name' && (!obj.hasOwnProperty || obj.hasOwnProperty(key))) {
                iterator.call(context, obj[key], key, obj);
              }
            }
          } else if (isArray(obj) || isArrayLike(obj)) {
            var isPrimitive = typeof obj !== 'object';
            for (key = 0, length = obj.length; key < length; key++) {
              if (isPrimitive || key in obj) {
                iterator.call(context, obj[key], key, obj);
              }
            }
          } else if (obj.forEach && obj.forEach !== forEach) {
            obj.forEach(iterator, context, obj);
          } else if (isBlankObject(obj)) {
            for (key in obj) {
              iterator.call(context, obj[key], key, obj);
            }
          } else if (typeof obj.hasOwnProperty === 'function') {
            for (key in obj) {
              if (obj.hasOwnProperty(key)) {
                iterator.call(context, obj[key], key, obj);
              }
            }
          } else {
            for (key in obj) {
              if (hasOwnProperty.call(obj, key)) {
                iterator.call(context, obj[key], key, obj);
              }
            }
          }
        }
        return obj;
      }
      function forEachSorted(obj, iterator, context) {
        var keys = Object.keys(obj).sort();
        for (var i = 0; i < keys.length; i++) {
          iterator.call(context, obj[keys[i]], keys[i]);
        }
        return keys;
      }
      function reverseParams(iteratorFn) {
        return function(value, key) {
          iteratorFn(key, value);
        };
      }
      function nextUid() {
        return ++uid;
      }
      function setHashKey(obj, h) {
        if (h) {
          obj.$$hashKey = h;
        } else {
          delete obj.$$hashKey;
        }
      }
      function baseExtend(dst, objs, deep) {
        var h = dst.$$hashKey;
        for (var i = 0,
            ii = objs.length; i < ii; ++i) {
          var obj = objs[i];
          if (!isObject(obj) && !isFunction(obj))
            continue;
          var keys = Object.keys(obj);
          for (var j = 0,
              jj = keys.length; j < jj; j++) {
            var key = keys[j];
            var src = obj[key];
            if (deep && isObject(src)) {
              if (isDate(src)) {
                dst[key] = new Date(src.valueOf());
              } else if (isRegExp(src)) {
                dst[key] = new RegExp(src);
              } else if (src.nodeName) {
                dst[key] = src.cloneNode(true);
              } else if (isElement(src)) {
                dst[key] = src.clone();
              } else {
                if (!isObject(dst[key]))
                  dst[key] = isArray(src) ? [] : {};
                baseExtend(dst[key], [src], true);
              }
            } else {
              dst[key] = src;
            }
          }
        }
        setHashKey(dst, h);
        return dst;
      }
      function extend(dst) {
        return baseExtend(dst, slice.call(arguments, 1), false);
      }
      function merge(dst) {
        return baseExtend(dst, slice.call(arguments, 1), true);
      }
      function toInt(str) {
        return parseInt(str, 10);
      }
      function inherit(parent, extra) {
        return extend(Object.create(parent), extra);
      }
      function noop() {}
      noop.$inject = [];
      function identity($) {
        return $;
      }
      identity.$inject = [];
      function valueFn(value) {
        return function() {
          return value;
        };
      }
      function hasCustomToString(obj) {
        return isFunction(obj.toString) && obj.toString !== toString;
      }
      function isUndefined(value) {
        return typeof value === 'undefined';
      }
      function isDefined(value) {
        return typeof value !== 'undefined';
      }
      function isObject(value) {
        return value !== null && typeof value === 'object';
      }
      function isBlankObject(value) {
        return value !== null && typeof value === 'object' && !getPrototypeOf(value);
      }
      function isString(value) {
        return typeof value === 'string';
      }
      function isNumber(value) {
        return typeof value === 'number';
      }
      function isDate(value) {
        return toString.call(value) === '[object Date]';
      }
      var isArray = Array.isArray;
      function isFunction(value) {
        return typeof value === 'function';
      }
      function isRegExp(value) {
        return toString.call(value) === '[object RegExp]';
      }
      function isWindow(obj) {
        return obj && obj.window === obj;
      }
      function isScope(obj) {
        return obj && obj.$evalAsync && obj.$watch;
      }
      function isFile(obj) {
        return toString.call(obj) === '[object File]';
      }
      function isFormData(obj) {
        return toString.call(obj) === '[object FormData]';
      }
      function isBlob(obj) {
        return toString.call(obj) === '[object Blob]';
      }
      function isBoolean(value) {
        return typeof value === 'boolean';
      }
      function isPromiseLike(obj) {
        return obj && isFunction(obj.then);
      }
      var TYPED_ARRAY_REGEXP = /^\[object (?:Uint8|Uint8Clamped|Uint16|Uint32|Int8|Int16|Int32|Float32|Float64)Array\]$/;
      function isTypedArray(value) {
        return value && isNumber(value.length) && TYPED_ARRAY_REGEXP.test(toString.call(value));
      }
      var trim = function(value) {
        return isString(value) ? value.trim() : value;
      };
      var escapeForRegexp = function(s) {
        return s.replace(/([-()\[\]{}+?*.$\^|,:#<!\\])/g, '\\$1').replace(/\x08/g, '\\x08');
      };
      function isElement(node) {
        return !!(node && (node.nodeName || (node.prop && node.attr && node.find)));
      }
      function makeMap(str) {
        var obj = {},
            items = str.split(","),
            i;
        for (i = 0; i < items.length; i++) {
          obj[items[i]] = true;
        }
        return obj;
      }
      function nodeName_(element) {
        return lowercase(element.nodeName || (element[0] && element[0].nodeName));
      }
      function includes(array, obj) {
        return Array.prototype.indexOf.call(array, obj) != -1;
      }
      function arrayRemove(array, value) {
        var index = array.indexOf(value);
        if (index >= 0) {
          array.splice(index, 1);
        }
        return index;
      }
      function copy(source, destination) {
        var stackSource = [];
        var stackDest = [];
        if (destination) {
          if (isTypedArray(destination)) {
            throw ngMinErr('cpta', "Can't copy! TypedArray destination cannot be mutated.");
          }
          if (source === destination) {
            throw ngMinErr('cpi', "Can't copy! Source and destination are identical.");
          }
          if (isArray(destination)) {
            destination.length = 0;
          } else {
            forEach(destination, function(value, key) {
              if (key !== '$$hashKey') {
                delete destination[key];
              }
            });
          }
          stackSource.push(source);
          stackDest.push(destination);
          return copyRecurse(source, destination);
        }
        return copyElement(source);
        function copyRecurse(source, destination) {
          var h = destination.$$hashKey;
          var result,
              key;
          if (isArray(source)) {
            for (var i = 0,
                ii = source.length; i < ii; i++) {
              destination.push(copyElement(source[i]));
            }
          } else if (isBlankObject(source)) {
            for (key in source) {
              destination[key] = copyElement(source[key]);
            }
          } else if (source && typeof source.hasOwnProperty === 'function') {
            for (key in source) {
              if (source.hasOwnProperty(key)) {
                destination[key] = copyElement(source[key]);
              }
            }
          } else {
            for (key in source) {
              if (hasOwnProperty.call(source, key)) {
                destination[key] = copyElement(source[key]);
              }
            }
          }
          setHashKey(destination, h);
          return destination;
        }
        function copyElement(source) {
          if (!isObject(source)) {
            return source;
          }
          var index = stackSource.indexOf(source);
          if (index !== -1) {
            return stackDest[index];
          }
          if (isWindow(source) || isScope(source)) {
            throw ngMinErr('cpws', "Can't copy! Making copies of Window or Scope instances is not supported.");
          }
          var needsRecurse = false;
          var destination;
          if (isArray(source)) {
            destination = [];
            needsRecurse = true;
          } else if (isTypedArray(source)) {
            destination = new source.constructor(source);
          } else if (isDate(source)) {
            destination = new Date(source.getTime());
          } else if (isRegExp(source)) {
            destination = new RegExp(source.source, source.toString().match(/[^\/]*$/)[0]);
            destination.lastIndex = source.lastIndex;
          } else if (isFunction(source.cloneNode)) {
            destination = source.cloneNode(true);
          } else {
            destination = Object.create(getPrototypeOf(source));
            needsRecurse = true;
          }
          stackSource.push(source);
          stackDest.push(destination);
          return needsRecurse ? copyRecurse(source, destination) : destination;
        }
      }
      function shallowCopy(src, dst) {
        if (isArray(src)) {
          dst = dst || [];
          for (var i = 0,
              ii = src.length; i < ii; i++) {
            dst[i] = src[i];
          }
        } else if (isObject(src)) {
          dst = dst || {};
          for (var key in src) {
            if (!(key.charAt(0) === '$' && key.charAt(1) === '$')) {
              dst[key] = src[key];
            }
          }
        }
        return dst || src;
      }
      function equals(o1, o2) {
        if (o1 === o2)
          return true;
        if (o1 === null || o2 === null)
          return false;
        if (o1 !== o1 && o2 !== o2)
          return true;
        var t1 = typeof o1,
            t2 = typeof o2,
            length,
            key,
            keySet;
        if (t1 == t2) {
          if (t1 == 'object') {
            if (isArray(o1)) {
              if (!isArray(o2))
                return false;
              if ((length = o1.length) == o2.length) {
                for (key = 0; key < length; key++) {
                  if (!equals(o1[key], o2[key]))
                    return false;
                }
                return true;
              }
            } else if (isDate(o1)) {
              if (!isDate(o2))
                return false;
              return equals(o1.getTime(), o2.getTime());
            } else if (isRegExp(o1)) {
              return isRegExp(o2) ? o1.toString() == o2.toString() : false;
            } else {
              if (isScope(o1) || isScope(o2) || isWindow(o1) || isWindow(o2) || isArray(o2) || isDate(o2) || isRegExp(o2))
                return false;
              keySet = createMap();
              for (key in o1) {
                if (key.charAt(0) === '$' || isFunction(o1[key]))
                  continue;
                if (!equals(o1[key], o2[key]))
                  return false;
                keySet[key] = true;
              }
              for (key in o2) {
                if (!(key in keySet) && key.charAt(0) !== '$' && isDefined(o2[key]) && !isFunction(o2[key]))
                  return false;
              }
              return true;
            }
          }
        }
        return false;
      }
      var csp = function() {
        if (!isDefined(csp.rules)) {
          var ngCspElement = (document.querySelector('[ng-csp]') || document.querySelector('[data-ng-csp]'));
          if (ngCspElement) {
            var ngCspAttribute = ngCspElement.getAttribute('ng-csp') || ngCspElement.getAttribute('data-ng-csp');
            csp.rules = {
              noUnsafeEval: !ngCspAttribute || (ngCspAttribute.indexOf('no-unsafe-eval') !== -1),
              noInlineStyle: !ngCspAttribute || (ngCspAttribute.indexOf('no-inline-style') !== -1)
            };
          } else {
            csp.rules = {
              noUnsafeEval: noUnsafeEval(),
              noInlineStyle: false
            };
          }
        }
        return csp.rules;
        function noUnsafeEval() {
          try {
            new Function('');
            return false;
          } catch (e) {
            return true;
          }
        }
      };
      var jq = function() {
        if (isDefined(jq.name_))
          return jq.name_;
        var el;
        var i,
            ii = ngAttrPrefixes.length,
            prefix,
            name;
        for (i = 0; i < ii; ++i) {
          prefix = ngAttrPrefixes[i];
          if (el = document.querySelector('[' + prefix.replace(':', '\\:') + 'jq]')) {
            name = el.getAttribute(prefix + 'jq');
            break;
          }
        }
        return (jq.name_ = name);
      };
      function concat(array1, array2, index) {
        return array1.concat(slice.call(array2, index));
      }
      function sliceArgs(args, startIndex) {
        return slice.call(args, startIndex || 0);
      }
      function bind(self, fn) {
        var curryArgs = arguments.length > 2 ? sliceArgs(arguments, 2) : [];
        if (isFunction(fn) && !(fn instanceof RegExp)) {
          return curryArgs.length ? function() {
            return arguments.length ? fn.apply(self, concat(curryArgs, arguments, 0)) : fn.apply(self, curryArgs);
          } : function() {
            return arguments.length ? fn.apply(self, arguments) : fn.call(self);
          };
        } else {
          return fn;
        }
      }
      function toJsonReplacer(key, value) {
        var val = value;
        if (typeof key === 'string' && key.charAt(0) === '$' && key.charAt(1) === '$') {
          val = undefined;
        } else if (isWindow(value)) {
          val = '$WINDOW';
        } else if (value && document === value) {
          val = '$DOCUMENT';
        } else if (isScope(value)) {
          val = '$SCOPE';
        }
        return val;
      }
      function toJson(obj, pretty) {
        if (typeof obj === 'undefined')
          return undefined;
        if (!isNumber(pretty)) {
          pretty = pretty ? 2 : null;
        }
        return JSON.stringify(obj, toJsonReplacer, pretty);
      }
      function fromJson(json) {
        return isString(json) ? JSON.parse(json) : json;
      }
      function timezoneToOffset(timezone, fallback) {
        var requestedTimezoneOffset = Date.parse('Jan 01, 1970 00:00:00 ' + timezone) / 60000;
        return isNaN(requestedTimezoneOffset) ? fallback : requestedTimezoneOffset;
      }
      function addDateMinutes(date, minutes) {
        date = new Date(date.getTime());
        date.setMinutes(date.getMinutes() + minutes);
        return date;
      }
      function convertTimezoneToLocal(date, timezone, reverse) {
        reverse = reverse ? -1 : 1;
        var timezoneOffset = timezoneToOffset(timezone, date.getTimezoneOffset());
        return addDateMinutes(date, reverse * (timezoneOffset - date.getTimezoneOffset()));
      }
      function startingTag(element) {
        element = jqLite(element).clone();
        try {
          element.empty();
        } catch (e) {}
        var elemHtml = jqLite('<div>').append(element).html();
        try {
          return element[0].nodeType === NODE_TYPE_TEXT ? lowercase(elemHtml) : elemHtml.match(/^(<[^>]+>)/)[1].replace(/^<([\w\-]+)/, function(match, nodeName) {
            return '<' + lowercase(nodeName);
          });
        } catch (e) {
          return lowercase(elemHtml);
        }
      }
      function tryDecodeURIComponent(value) {
        try {
          return decodeURIComponent(value);
        } catch (e) {}
      }
      function parseKeyValue(keyValue) {
        var obj = {};
        forEach((keyValue || "").split('&'), function(keyValue) {
          var splitPoint,
              key,
              val;
          if (keyValue) {
            key = keyValue = keyValue.replace(/\+/g, '%20');
            splitPoint = keyValue.indexOf('=');
            if (splitPoint !== -1) {
              key = keyValue.substring(0, splitPoint);
              val = keyValue.substring(splitPoint + 1);
            }
            key = tryDecodeURIComponent(key);
            if (isDefined(key)) {
              val = isDefined(val) ? tryDecodeURIComponent(val) : true;
              if (!hasOwnProperty.call(obj, key)) {
                obj[key] = val;
              } else if (isArray(obj[key])) {
                obj[key].push(val);
              } else {
                obj[key] = [obj[key], val];
              }
            }
          }
        });
        return obj;
      }
      function toKeyValue(obj) {
        var parts = [];
        forEach(obj, function(value, key) {
          if (isArray(value)) {
            forEach(value, function(arrayValue) {
              parts.push(encodeUriQuery(key, true) + (arrayValue === true ? '' : '=' + encodeUriQuery(arrayValue, true)));
            });
          } else {
            parts.push(encodeUriQuery(key, true) + (value === true ? '' : '=' + encodeUriQuery(value, true)));
          }
        });
        return parts.length ? parts.join('&') : '';
      }
      function encodeUriSegment(val) {
        return encodeUriQuery(val, true).replace(/%26/gi, '&').replace(/%3D/gi, '=').replace(/%2B/gi, '+');
      }
      function encodeUriQuery(val, pctEncodeSpaces) {
        return encodeURIComponent(val).replace(/%40/gi, '@').replace(/%3A/gi, ':').replace(/%24/g, '$').replace(/%2C/gi, ',').replace(/%3B/gi, ';').replace(/%20/g, (pctEncodeSpaces ? '%20' : '+'));
      }
      var ngAttrPrefixes = ['ng-', 'data-ng-', 'ng:', 'x-ng-'];
      function getNgAttribute(element, ngAttr) {
        var attr,
            i,
            ii = ngAttrPrefixes.length;
        for (i = 0; i < ii; ++i) {
          attr = ngAttrPrefixes[i] + ngAttr;
          if (isString(attr = element.getAttribute(attr))) {
            return attr;
          }
        }
        return null;
      }
      function angularInit(element, bootstrap) {
        var appElement,
            module,
            config = {};
        forEach(ngAttrPrefixes, function(prefix) {
          var name = prefix + 'app';
          if (!appElement && element.hasAttribute && element.hasAttribute(name)) {
            appElement = element;
            module = element.getAttribute(name);
          }
        });
        forEach(ngAttrPrefixes, function(prefix) {
          var name = prefix + 'app';
          var candidate;
          if (!appElement && (candidate = element.querySelector('[' + name.replace(':', '\\:') + ']'))) {
            appElement = candidate;
            module = candidate.getAttribute(name);
          }
        });
        if (appElement) {
          config.strictDi = getNgAttribute(appElement, "strict-di") !== null;
          bootstrap(appElement, module ? [module] : [], config);
        }
      }
      function bootstrap(element, modules, config) {
        if (!isObject(config))
          config = {};
        var defaultConfig = {strictDi: false};
        config = extend(defaultConfig, config);
        var doBootstrap = function() {
          element = jqLite(element);
          if (element.injector()) {
            var tag = (element[0] === document) ? 'document' : startingTag(element);
            throw ngMinErr('btstrpd', "App Already Bootstrapped with this Element '{0}'", tag.replace(/</, '&lt;').replace(/>/, '&gt;'));
          }
          modules = modules || [];
          modules.unshift(['$provide', function($provide) {
            $provide.value('$rootElement', element);
          }]);
          if (config.debugInfoEnabled) {
            modules.push(['$compileProvider', function($compileProvider) {
              $compileProvider.debugInfoEnabled(true);
            }]);
          }
          modules.unshift('ng');
          var injector = createInjector(modules, config.strictDi);
          injector.invoke(['$rootScope', '$rootElement', '$compile', '$injector', function bootstrapApply(scope, element, compile, injector) {
            scope.$apply(function() {
              element.data('$injector', injector);
              compile(element)(scope);
            });
          }]);
          return injector;
        };
        var NG_ENABLE_DEBUG_INFO = /^NG_ENABLE_DEBUG_INFO!/;
        var NG_DEFER_BOOTSTRAP = /^NG_DEFER_BOOTSTRAP!/;
        if (window && NG_ENABLE_DEBUG_INFO.test(window.name)) {
          config.debugInfoEnabled = true;
          window.name = window.name.replace(NG_ENABLE_DEBUG_INFO, '');
        }
        if (window && !NG_DEFER_BOOTSTRAP.test(window.name)) {
          return doBootstrap();
        }
        window.name = window.name.replace(NG_DEFER_BOOTSTRAP, '');
        angular.resumeBootstrap = function(extraModules) {
          forEach(extraModules, function(module) {
            modules.push(module);
          });
          return doBootstrap();
        };
        if (isFunction(angular.resumeDeferredBootstrap)) {
          angular.resumeDeferredBootstrap();
        }
      }
      function reloadWithDebugInfo() {
        window.name = 'NG_ENABLE_DEBUG_INFO!' + window.name;
        window.location.reload();
      }
      function getTestability(rootElement) {
        var injector = angular.element(rootElement).injector();
        if (!injector) {
          throw ngMinErr('test', 'no injector found for element argument to getTestability');
        }
        return injector.get('$$testability');
      }
      var SNAKE_CASE_REGEXP = /[A-Z]/g;
      function snake_case(name, separator) {
        separator = separator || '_';
        return name.replace(SNAKE_CASE_REGEXP, function(letter, pos) {
          return (pos ? separator : '') + letter.toLowerCase();
        });
      }
      var bindJQueryFired = false;
      var skipDestroyOnNextJQueryCleanData;
      function bindJQuery() {
        var originalCleanData;
        if (bindJQueryFired) {
          return;
        }
        var jqName = jq();
        jQuery = isUndefined(jqName) ? window.jQuery : !jqName ? undefined : window[jqName];
        if (jQuery && jQuery.fn.on) {
          jqLite = jQuery;
          extend(jQuery.fn, {
            scope: JQLitePrototype.scope,
            isolateScope: JQLitePrototype.isolateScope,
            controller: JQLitePrototype.controller,
            injector: JQLitePrototype.injector,
            inheritedData: JQLitePrototype.inheritedData
          });
          originalCleanData = jQuery.cleanData;
          jQuery.cleanData = function(elems) {
            var events;
            if (!skipDestroyOnNextJQueryCleanData) {
              for (var i = 0,
                  elem; (elem = elems[i]) != null; i++) {
                events = jQuery._data(elem, "events");
                if (events && events.$destroy) {
                  jQuery(elem).triggerHandler('$destroy');
                }
              }
            } else {
              skipDestroyOnNextJQueryCleanData = false;
            }
            originalCleanData(elems);
          };
        } else {
          jqLite = JQLite;
        }
        angular.element = jqLite;
        bindJQueryFired = true;
      }
      function assertArg(arg, name, reason) {
        if (!arg) {
          throw ngMinErr('areq', "Argument '{0}' is {1}", (name || '?'), (reason || "required"));
        }
        return arg;
      }
      function assertArgFn(arg, name, acceptArrayAnnotation) {
        if (acceptArrayAnnotation && isArray(arg)) {
          arg = arg[arg.length - 1];
        }
        assertArg(isFunction(arg), name, 'not a function, got ' + (arg && typeof arg === 'object' ? arg.constructor.name || 'Object' : typeof arg));
        return arg;
      }
      function assertNotHasOwnProperty(name, context) {
        if (name === 'hasOwnProperty') {
          throw ngMinErr('badname', "hasOwnProperty is not a valid {0} name", context);
        }
      }
      function getter(obj, path, bindFnToScope) {
        if (!path)
          return obj;
        var keys = path.split('.');
        var key;
        var lastInstance = obj;
        var len = keys.length;
        for (var i = 0; i < len; i++) {
          key = keys[i];
          if (obj) {
            obj = (lastInstance = obj)[key];
          }
        }
        if (!bindFnToScope && isFunction(obj)) {
          return bind(lastInstance, obj);
        }
        return obj;
      }
      function getBlockNodes(nodes) {
        var node = nodes[0];
        var endNode = nodes[nodes.length - 1];
        var blockNodes;
        for (var i = 1; node !== endNode && (node = node.nextSibling); i++) {
          if (blockNodes || nodes[i] !== node) {
            if (!blockNodes) {
              blockNodes = jqLite(slice.call(nodes, 0, i));
            }
            blockNodes.push(node);
          }
        }
        return blockNodes || nodes;
      }
      function createMap() {
        return Object.create(null);
      }
      var NODE_TYPE_ELEMENT = 1;
      var NODE_TYPE_ATTRIBUTE = 2;
      var NODE_TYPE_TEXT = 3;
      var NODE_TYPE_COMMENT = 8;
      var NODE_TYPE_DOCUMENT = 9;
      var NODE_TYPE_DOCUMENT_FRAGMENT = 11;
      function setupModuleLoader(window) {
        var $injectorMinErr = minErr('$injector');
        var ngMinErr = minErr('ng');
        function ensure(obj, name, factory) {
          return obj[name] || (obj[name] = factory());
        }
        var angular = ensure(window, 'angular', Object);
        angular.$$minErr = angular.$$minErr || minErr;
        return ensure(angular, 'module', function() {
          var modules = {};
          return function module(name, requires, configFn) {
            var assertNotHasOwnProperty = function(name, context) {
              if (name === 'hasOwnProperty') {
                throw ngMinErr('badname', 'hasOwnProperty is not a valid {0} name', context);
              }
            };
            assertNotHasOwnProperty(name, 'module');
            if (requires && modules.hasOwnProperty(name)) {
              modules[name] = null;
            }
            return ensure(modules, name, function() {
              if (!requires) {
                throw $injectorMinErr('nomod', "Module '{0}' is not available! You either misspelled " + "the module name or forgot to load it. If registering a module ensure that you " + "specify the dependencies as the second argument.", name);
              }
              var invokeQueue = [];
              var configBlocks = [];
              var runBlocks = [];
              var config = invokeLater('$injector', 'invoke', 'push', configBlocks);
              var moduleInstance = {
                _invokeQueue: invokeQueue,
                _configBlocks: configBlocks,
                _runBlocks: runBlocks,
                requires: requires,
                name: name,
                provider: invokeLaterAndSetModuleName('$provide', 'provider'),
                factory: invokeLaterAndSetModuleName('$provide', 'factory'),
                service: invokeLaterAndSetModuleName('$provide', 'service'),
                value: invokeLater('$provide', 'value'),
                constant: invokeLater('$provide', 'constant', 'unshift'),
                decorator: invokeLaterAndSetModuleName('$provide', 'decorator'),
                animation: invokeLaterAndSetModuleName('$animateProvider', 'register'),
                filter: invokeLaterAndSetModuleName('$filterProvider', 'register'),
                controller: invokeLaterAndSetModuleName('$controllerProvider', 'register'),
                directive: invokeLaterAndSetModuleName('$compileProvider', 'directive'),
                config: config,
                run: function(block) {
                  runBlocks.push(block);
                  return this;
                }
              };
              if (configFn) {
                config(configFn);
              }
              return moduleInstance;
              function invokeLater(provider, method, insertMethod, queue) {
                if (!queue)
                  queue = invokeQueue;
                return function() {
                  queue[insertMethod || 'push']([provider, method, arguments]);
                  return moduleInstance;
                };
              }
              function invokeLaterAndSetModuleName(provider, method) {
                return function(recipeName, factoryFunction) {
                  if (factoryFunction && isFunction(factoryFunction))
                    factoryFunction.$$moduleName = name;
                  invokeQueue.push([provider, method, arguments]);
                  return moduleInstance;
                };
              }
            });
          };
        });
      }
      function serializeObject(obj) {
        var seen = [];
        return JSON.stringify(obj, function(key, val) {
          val = toJsonReplacer(key, val);
          if (isObject(val)) {
            if (seen.indexOf(val) >= 0)
              return '...';
            seen.push(val);
          }
          return val;
        });
      }
      function toDebugString(obj) {
        if (typeof obj === 'function') {
          return obj.toString().replace(/ \{[\s\S]*$/, '');
        } else if (isUndefined(obj)) {
          return 'undefined';
        } else if (typeof obj !== 'string') {
          return serializeObject(obj);
        }
        return obj;
      }
      var version = {
        full: '1.4.8',
        major: 1,
        minor: 4,
        dot: 8,
        codeName: 'ice-manipulation'
      };
      function publishExternalAPI(angular) {
        extend(angular, {
          'bootstrap': bootstrap,
          'copy': copy,
          'extend': extend,
          'merge': merge,
          'equals': equals,
          'element': jqLite,
          'forEach': forEach,
          'injector': createInjector,
          'noop': noop,
          'bind': bind,
          'toJson': toJson,
          'fromJson': fromJson,
          'identity': identity,
          'isUndefined': isUndefined,
          'isDefined': isDefined,
          'isString': isString,
          'isFunction': isFunction,
          'isObject': isObject,
          'isNumber': isNumber,
          'isElement': isElement,
          'isArray': isArray,
          'version': version,
          'isDate': isDate,
          'lowercase': lowercase,
          'uppercase': uppercase,
          'callbacks': {counter: 0},
          'getTestability': getTestability,
          '$$minErr': minErr,
          '$$csp': csp,
          'reloadWithDebugInfo': reloadWithDebugInfo
        });
        angularModule = setupModuleLoader(window);
        angularModule('ng', ['ngLocale'], ['$provide', function ngModule($provide) {
          $provide.provider({$$sanitizeUri: $$SanitizeUriProvider});
          $provide.provider('$compile', $CompileProvider).directive({
            a: htmlAnchorDirective,
            input: inputDirective,
            textarea: inputDirective,
            form: formDirective,
            script: scriptDirective,
            select: selectDirective,
            style: styleDirective,
            option: optionDirective,
            ngBind: ngBindDirective,
            ngBindHtml: ngBindHtmlDirective,
            ngBindTemplate: ngBindTemplateDirective,
            ngClass: ngClassDirective,
            ngClassEven: ngClassEvenDirective,
            ngClassOdd: ngClassOddDirective,
            ngCloak: ngCloakDirective,
            ngController: ngControllerDirective,
            ngForm: ngFormDirective,
            ngHide: ngHideDirective,
            ngIf: ngIfDirective,
            ngInclude: ngIncludeDirective,
            ngInit: ngInitDirective,
            ngNonBindable: ngNonBindableDirective,
            ngPluralize: ngPluralizeDirective,
            ngRepeat: ngRepeatDirective,
            ngShow: ngShowDirective,
            ngStyle: ngStyleDirective,
            ngSwitch: ngSwitchDirective,
            ngSwitchWhen: ngSwitchWhenDirective,
            ngSwitchDefault: ngSwitchDefaultDirective,
            ngOptions: ngOptionsDirective,
            ngTransclude: ngTranscludeDirective,
            ngModel: ngModelDirective,
            ngList: ngListDirective,
            ngChange: ngChangeDirective,
            pattern: patternDirective,
            ngPattern: patternDirective,
            required: requiredDirective,
            ngRequired: requiredDirective,
            minlength: minlengthDirective,
            ngMinlength: minlengthDirective,
            maxlength: maxlengthDirective,
            ngMaxlength: maxlengthDirective,
            ngValue: ngValueDirective,
            ngModelOptions: ngModelOptionsDirective
          }).directive({ngInclude: ngIncludeFillContentDirective}).directive(ngAttributeAliasDirectives).directive(ngEventDirectives);
          $provide.provider({
            $anchorScroll: $AnchorScrollProvider,
            $animate: $AnimateProvider,
            $animateCss: $CoreAnimateCssProvider,
            $$animateQueue: $$CoreAnimateQueueProvider,
            $$AnimateRunner: $$CoreAnimateRunnerProvider,
            $browser: $BrowserProvider,
            $cacheFactory: $CacheFactoryProvider,
            $controller: $ControllerProvider,
            $document: $DocumentProvider,
            $exceptionHandler: $ExceptionHandlerProvider,
            $filter: $FilterProvider,
            $$forceReflow: $$ForceReflowProvider,
            $interpolate: $InterpolateProvider,
            $interval: $IntervalProvider,
            $http: $HttpProvider,
            $httpParamSerializer: $HttpParamSerializerProvider,
            $httpParamSerializerJQLike: $HttpParamSerializerJQLikeProvider,
            $httpBackend: $HttpBackendProvider,
            $xhrFactory: $xhrFactoryProvider,
            $location: $LocationProvider,
            $log: $LogProvider,
            $parse: $ParseProvider,
            $rootScope: $RootScopeProvider,
            $q: $QProvider,
            $$q: $$QProvider,
            $sce: $SceProvider,
            $sceDelegate: $SceDelegateProvider,
            $sniffer: $SnifferProvider,
            $templateCache: $TemplateCacheProvider,
            $templateRequest: $TemplateRequestProvider,
            $$testability: $$TestabilityProvider,
            $timeout: $TimeoutProvider,
            $window: $WindowProvider,
            $$rAF: $$RAFProvider,
            $$jqLite: $$jqLiteProvider,
            $$HashMap: $$HashMapProvider,
            $$cookieReader: $$CookieReaderProvider
          });
        }]);
      }
      JQLite.expando = 'ng339';
      var jqCache = JQLite.cache = {},
          jqId = 1,
          addEventListenerFn = function(element, type, fn) {
            element.addEventListener(type, fn, false);
          },
          removeEventListenerFn = function(element, type, fn) {
            element.removeEventListener(type, fn, false);
          };
      JQLite._data = function(node) {
        return this.cache[node[this.expando]] || {};
      };
      function jqNextId() {
        return ++jqId;
      }
      var SPECIAL_CHARS_REGEXP = /([\:\-\_]+(.))/g;
      var MOZ_HACK_REGEXP = /^moz([A-Z])/;
      var MOUSE_EVENT_MAP = {
        mouseleave: "mouseout",
        mouseenter: "mouseover"
      };
      var jqLiteMinErr = minErr('jqLite');
      function camelCase(name) {
        return name.replace(SPECIAL_CHARS_REGEXP, function(_, separator, letter, offset) {
          return offset ? letter.toUpperCase() : letter;
        }).replace(MOZ_HACK_REGEXP, 'Moz$1');
      }
      var SINGLE_TAG_REGEXP = /^<([\w-]+)\s*\/?>(?:<\/\1>|)$/;
      var HTML_REGEXP = /<|&#?\w+;/;
      var TAG_NAME_REGEXP = /<([\w:-]+)/;
      var XHTML_TAG_REGEXP = /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([\w:-]+)[^>]*)\/>/gi;
      var wrapMap = {
        'option': [1, '<select multiple="multiple">', '</select>'],
        'thead': [1, '<table>', '</table>'],
        'col': [2, '<table><colgroup>', '</colgroup></table>'],
        'tr': [2, '<table><tbody>', '</tbody></table>'],
        'td': [3, '<table><tbody><tr>', '</tr></tbody></table>'],
        '_default': [0, "", ""]
      };
      wrapMap.optgroup = wrapMap.option;
      wrapMap.tbody = wrapMap.tfoot = wrapMap.colgroup = wrapMap.caption = wrapMap.thead;
      wrapMap.th = wrapMap.td;
      function jqLiteIsTextNode(html) {
        return !HTML_REGEXP.test(html);
      }
      function jqLiteAcceptsData(node) {
        var nodeType = node.nodeType;
        return nodeType === NODE_TYPE_ELEMENT || !nodeType || nodeType === NODE_TYPE_DOCUMENT;
      }
      function jqLiteHasData(node) {
        for (var key in jqCache[node.ng339]) {
          return true;
        }
        return false;
      }
      function jqLiteBuildFragment(html, context) {
        var tmp,
            tag,
            wrap,
            fragment = context.createDocumentFragment(),
            nodes = [],
            i;
        if (jqLiteIsTextNode(html)) {
          nodes.push(context.createTextNode(html));
        } else {
          tmp = tmp || fragment.appendChild(context.createElement("div"));
          tag = (TAG_NAME_REGEXP.exec(html) || ["", ""])[1].toLowerCase();
          wrap = wrapMap[tag] || wrapMap._default;
          tmp.innerHTML = wrap[1] + html.replace(XHTML_TAG_REGEXP, "<$1></$2>") + wrap[2];
          i = wrap[0];
          while (i--) {
            tmp = tmp.lastChild;
          }
          nodes = concat(nodes, tmp.childNodes);
          tmp = fragment.firstChild;
          tmp.textContent = "";
        }
        fragment.textContent = "";
        fragment.innerHTML = "";
        forEach(nodes, function(node) {
          fragment.appendChild(node);
        });
        return fragment;
      }
      function jqLiteParseHTML(html, context) {
        context = context || document;
        var parsed;
        if ((parsed = SINGLE_TAG_REGEXP.exec(html))) {
          return [context.createElement(parsed[1])];
        }
        if ((parsed = jqLiteBuildFragment(html, context))) {
          return parsed.childNodes;
        }
        return [];
      }
      var jqLiteContains = Node.prototype.contains || function(arg) {
        return !!(this.compareDocumentPosition(arg) & 16);
      };
      function JQLite(element) {
        if (element instanceof JQLite) {
          return element;
        }
        var argIsString;
        if (isString(element)) {
          element = trim(element);
          argIsString = true;
        }
        if (!(this instanceof JQLite)) {
          if (argIsString && element.charAt(0) != '<') {
            throw jqLiteMinErr('nosel', 'Looking up elements via selectors is not supported by jqLite! See: http://docs.angularjs.org/api/angular.element');
          }
          return new JQLite(element);
        }
        if (argIsString) {
          jqLiteAddNodes(this, jqLiteParseHTML(element));
        } else {
          jqLiteAddNodes(this, element);
        }
      }
      function jqLiteClone(element) {
        return element.cloneNode(true);
      }
      function jqLiteDealoc(element, onlyDescendants) {
        if (!onlyDescendants)
          jqLiteRemoveData(element);
        if (element.querySelectorAll) {
          var descendants = element.querySelectorAll('*');
          for (var i = 0,
              l = descendants.length; i < l; i++) {
            jqLiteRemoveData(descendants[i]);
          }
        }
      }
      function jqLiteOff(element, type, fn, unsupported) {
        if (isDefined(unsupported))
          throw jqLiteMinErr('offargs', 'jqLite#off() does not support the `selector` argument');
        var expandoStore = jqLiteExpandoStore(element);
        var events = expandoStore && expandoStore.events;
        var handle = expandoStore && expandoStore.handle;
        if (!handle)
          return;
        if (!type) {
          for (type in events) {
            if (type !== '$destroy') {
              removeEventListenerFn(element, type, handle);
            }
            delete events[type];
          }
        } else {
          var removeHandler = function(type) {
            var listenerFns = events[type];
            if (isDefined(fn)) {
              arrayRemove(listenerFns || [], fn);
            }
            if (!(isDefined(fn) && listenerFns && listenerFns.length > 0)) {
              removeEventListenerFn(element, type, handle);
              delete events[type];
            }
          };
          forEach(type.split(' '), function(type) {
            removeHandler(type);
            if (MOUSE_EVENT_MAP[type]) {
              removeHandler(MOUSE_EVENT_MAP[type]);
            }
          });
        }
      }
      function jqLiteRemoveData(element, name) {
        var expandoId = element.ng339;
        var expandoStore = expandoId && jqCache[expandoId];
        if (expandoStore) {
          if (name) {
            delete expandoStore.data[name];
            return;
          }
          if (expandoStore.handle) {
            if (expandoStore.events.$destroy) {
              expandoStore.handle({}, '$destroy');
            }
            jqLiteOff(element);
          }
          delete jqCache[expandoId];
          element.ng339 = undefined;
        }
      }
      function jqLiteExpandoStore(element, createIfNecessary) {
        var expandoId = element.ng339,
            expandoStore = expandoId && jqCache[expandoId];
        if (createIfNecessary && !expandoStore) {
          element.ng339 = expandoId = jqNextId();
          expandoStore = jqCache[expandoId] = {
            events: {},
            data: {},
            handle: undefined
          };
        }
        return expandoStore;
      }
      function jqLiteData(element, key, value) {
        if (jqLiteAcceptsData(element)) {
          var isSimpleSetter = isDefined(value);
          var isSimpleGetter = !isSimpleSetter && key && !isObject(key);
          var massGetter = !key;
          var expandoStore = jqLiteExpandoStore(element, !isSimpleGetter);
          var data = expandoStore && expandoStore.data;
          if (isSimpleSetter) {
            data[key] = value;
          } else {
            if (massGetter) {
              return data;
            } else {
              if (isSimpleGetter) {
                return data && data[key];
              } else {
                extend(data, key);
              }
            }
          }
        }
      }
      function jqLiteHasClass(element, selector) {
        if (!element.getAttribute)
          return false;
        return ((" " + (element.getAttribute('class') || '') + " ").replace(/[\n\t]/g, " ").indexOf(" " + selector + " ") > -1);
      }
      function jqLiteRemoveClass(element, cssClasses) {
        if (cssClasses && element.setAttribute) {
          forEach(cssClasses.split(' '), function(cssClass) {
            element.setAttribute('class', trim((" " + (element.getAttribute('class') || '') + " ").replace(/[\n\t]/g, " ").replace(" " + trim(cssClass) + " ", " ")));
          });
        }
      }
      function jqLiteAddClass(element, cssClasses) {
        if (cssClasses && element.setAttribute) {
          var existingClasses = (' ' + (element.getAttribute('class') || '') + ' ').replace(/[\n\t]/g, " ");
          forEach(cssClasses.split(' '), function(cssClass) {
            cssClass = trim(cssClass);
            if (existingClasses.indexOf(' ' + cssClass + ' ') === -1) {
              existingClasses += cssClass + ' ';
            }
          });
          element.setAttribute('class', trim(existingClasses));
        }
      }
      function jqLiteAddNodes(root, elements) {
        if (elements) {
          if (elements.nodeType) {
            root[root.length++] = elements;
          } else {
            var length = elements.length;
            if (typeof length === 'number' && elements.window !== elements) {
              if (length) {
                for (var i = 0; i < length; i++) {
                  root[root.length++] = elements[i];
                }
              }
            } else {
              root[root.length++] = elements;
            }
          }
        }
      }
      function jqLiteController(element, name) {
        return jqLiteInheritedData(element, '$' + (name || 'ngController') + 'Controller');
      }
      function jqLiteInheritedData(element, name, value) {
        if (element.nodeType == NODE_TYPE_DOCUMENT) {
          element = element.documentElement;
        }
        var names = isArray(name) ? name : [name];
        while (element) {
          for (var i = 0,
              ii = names.length; i < ii; i++) {
            if (isDefined(value = jqLite.data(element, names[i])))
              return value;
          }
          element = element.parentNode || (element.nodeType === NODE_TYPE_DOCUMENT_FRAGMENT && element.host);
        }
      }
      function jqLiteEmpty(element) {
        jqLiteDealoc(element, true);
        while (element.firstChild) {
          element.removeChild(element.firstChild);
        }
      }
      function jqLiteRemove(element, keepData) {
        if (!keepData)
          jqLiteDealoc(element);
        var parent = element.parentNode;
        if (parent)
          parent.removeChild(element);
      }
      function jqLiteDocumentLoaded(action, win) {
        win = win || window;
        if (win.document.readyState === 'complete') {
          win.setTimeout(action);
        } else {
          jqLite(win).on('load', action);
        }
      }
      var JQLitePrototype = JQLite.prototype = {
        ready: function(fn) {
          var fired = false;
          function trigger() {
            if (fired)
              return;
            fired = true;
            fn();
          }
          if (document.readyState === 'complete') {
            setTimeout(trigger);
          } else {
            this.on('DOMContentLoaded', trigger);
            JQLite(window).on('load', trigger);
          }
        },
        toString: function() {
          var value = [];
          forEach(this, function(e) {
            value.push('' + e);
          });
          return '[' + value.join(', ') + ']';
        },
        eq: function(index) {
          return (index >= 0) ? jqLite(this[index]) : jqLite(this[this.length + index]);
        },
        length: 0,
        push: push,
        sort: [].sort,
        splice: [].splice
      };
      var BOOLEAN_ATTR = {};
      forEach('multiple,selected,checked,disabled,readOnly,required,open'.split(','), function(value) {
        BOOLEAN_ATTR[lowercase(value)] = value;
      });
      var BOOLEAN_ELEMENTS = {};
      forEach('input,select,option,textarea,button,form,details'.split(','), function(value) {
        BOOLEAN_ELEMENTS[value] = true;
      });
      var ALIASED_ATTR = {
        'ngMinlength': 'minlength',
        'ngMaxlength': 'maxlength',
        'ngMin': 'min',
        'ngMax': 'max',
        'ngPattern': 'pattern'
      };
      function getBooleanAttrName(element, name) {
        var booleanAttr = BOOLEAN_ATTR[name.toLowerCase()];
        return booleanAttr && BOOLEAN_ELEMENTS[nodeName_(element)] && booleanAttr;
      }
      function getAliasedAttrName(name) {
        return ALIASED_ATTR[name];
      }
      forEach({
        data: jqLiteData,
        removeData: jqLiteRemoveData,
        hasData: jqLiteHasData
      }, function(fn, name) {
        JQLite[name] = fn;
      });
      forEach({
        data: jqLiteData,
        inheritedData: jqLiteInheritedData,
        scope: function(element) {
          return jqLite.data(element, '$scope') || jqLiteInheritedData(element.parentNode || element, ['$isolateScope', '$scope']);
        },
        isolateScope: function(element) {
          return jqLite.data(element, '$isolateScope') || jqLite.data(element, '$isolateScopeNoTemplate');
        },
        controller: jqLiteController,
        injector: function(element) {
          return jqLiteInheritedData(element, '$injector');
        },
        removeAttr: function(element, name) {
          element.removeAttribute(name);
        },
        hasClass: jqLiteHasClass,
        css: function(element, name, value) {
          name = camelCase(name);
          if (isDefined(value)) {
            element.style[name] = value;
          } else {
            return element.style[name];
          }
        },
        attr: function(element, name, value) {
          var nodeType = element.nodeType;
          if (nodeType === NODE_TYPE_TEXT || nodeType === NODE_TYPE_ATTRIBUTE || nodeType === NODE_TYPE_COMMENT) {
            return;
          }
          var lowercasedName = lowercase(name);
          if (BOOLEAN_ATTR[lowercasedName]) {
            if (isDefined(value)) {
              if (!!value) {
                element[name] = true;
                element.setAttribute(name, lowercasedName);
              } else {
                element[name] = false;
                element.removeAttribute(lowercasedName);
              }
            } else {
              return (element[name] || (element.attributes.getNamedItem(name) || noop).specified) ? lowercasedName : undefined;
            }
          } else if (isDefined(value)) {
            element.setAttribute(name, value);
          } else if (element.getAttribute) {
            var ret = element.getAttribute(name, 2);
            return ret === null ? undefined : ret;
          }
        },
        prop: function(element, name, value) {
          if (isDefined(value)) {
            element[name] = value;
          } else {
            return element[name];
          }
        },
        text: (function() {
          getText.$dv = '';
          return getText;
          function getText(element, value) {
            if (isUndefined(value)) {
              var nodeType = element.nodeType;
              return (nodeType === NODE_TYPE_ELEMENT || nodeType === NODE_TYPE_TEXT) ? element.textContent : '';
            }
            element.textContent = value;
          }
        })(),
        val: function(element, value) {
          if (isUndefined(value)) {
            if (element.multiple && nodeName_(element) === 'select') {
              var result = [];
              forEach(element.options, function(option) {
                if (option.selected) {
                  result.push(option.value || option.text);
                }
              });
              return result.length === 0 ? null : result;
            }
            return element.value;
          }
          element.value = value;
        },
        html: function(element, value) {
          if (isUndefined(value)) {
            return element.innerHTML;
          }
          jqLiteDealoc(element, true);
          element.innerHTML = value;
        },
        empty: jqLiteEmpty
      }, function(fn, name) {
        JQLite.prototype[name] = function(arg1, arg2) {
          var i,
              key;
          var nodeCount = this.length;
          if (fn !== jqLiteEmpty && (isUndefined((fn.length == 2 && (fn !== jqLiteHasClass && fn !== jqLiteController)) ? arg1 : arg2))) {
            if (isObject(arg1)) {
              for (i = 0; i < nodeCount; i++) {
                if (fn === jqLiteData) {
                  fn(this[i], arg1);
                } else {
                  for (key in arg1) {
                    fn(this[i], key, arg1[key]);
                  }
                }
              }
              return this;
            } else {
              var value = fn.$dv;
              var jj = (isUndefined(value)) ? Math.min(nodeCount, 1) : nodeCount;
              for (var j = 0; j < jj; j++) {
                var nodeValue = fn(this[j], arg1, arg2);
                value = value ? value + nodeValue : nodeValue;
              }
              return value;
            }
          } else {
            for (i = 0; i < nodeCount; i++) {
              fn(this[i], arg1, arg2);
            }
            return this;
          }
        };
      });
      function createEventHandler(element, events) {
        var eventHandler = function(event, type) {
          event.isDefaultPrevented = function() {
            return event.defaultPrevented;
          };
          var eventFns = events[type || event.type];
          var eventFnsLength = eventFns ? eventFns.length : 0;
          if (!eventFnsLength)
            return;
          if (isUndefined(event.immediatePropagationStopped)) {
            var originalStopImmediatePropagation = event.stopImmediatePropagation;
            event.stopImmediatePropagation = function() {
              event.immediatePropagationStopped = true;
              if (event.stopPropagation) {
                event.stopPropagation();
              }
              if (originalStopImmediatePropagation) {
                originalStopImmediatePropagation.call(event);
              }
            };
          }
          event.isImmediatePropagationStopped = function() {
            return event.immediatePropagationStopped === true;
          };
          var handlerWrapper = eventFns.specialHandlerWrapper || defaultHandlerWrapper;
          if ((eventFnsLength > 1)) {
            eventFns = shallowCopy(eventFns);
          }
          for (var i = 0; i < eventFnsLength; i++) {
            if (!event.isImmediatePropagationStopped()) {
              handlerWrapper(element, event, eventFns[i]);
            }
          }
        };
        eventHandler.elem = element;
        return eventHandler;
      }
      function defaultHandlerWrapper(element, event, handler) {
        handler.call(element, event);
      }
      function specialMouseHandlerWrapper(target, event, handler) {
        var related = event.relatedTarget;
        if (!related || (related !== target && !jqLiteContains.call(target, related))) {
          handler.call(target, event);
        }
      }
      forEach({
        removeData: jqLiteRemoveData,
        on: function jqLiteOn(element, type, fn, unsupported) {
          if (isDefined(unsupported))
            throw jqLiteMinErr('onargs', 'jqLite#on() does not support the `selector` or `eventData` parameters');
          if (!jqLiteAcceptsData(element)) {
            return;
          }
          var expandoStore = jqLiteExpandoStore(element, true);
          var events = expandoStore.events;
          var handle = expandoStore.handle;
          if (!handle) {
            handle = expandoStore.handle = createEventHandler(element, events);
          }
          var types = type.indexOf(' ') >= 0 ? type.split(' ') : [type];
          var i = types.length;
          var addHandler = function(type, specialHandlerWrapper, noEventListener) {
            var eventFns = events[type];
            if (!eventFns) {
              eventFns = events[type] = [];
              eventFns.specialHandlerWrapper = specialHandlerWrapper;
              if (type !== '$destroy' && !noEventListener) {
                addEventListenerFn(element, type, handle);
              }
            }
            eventFns.push(fn);
          };
          while (i--) {
            type = types[i];
            if (MOUSE_EVENT_MAP[type]) {
              addHandler(MOUSE_EVENT_MAP[type], specialMouseHandlerWrapper);
              addHandler(type, undefined, true);
            } else {
              addHandler(type);
            }
          }
        },
        off: jqLiteOff,
        one: function(element, type, fn) {
          element = jqLite(element);
          element.on(type, function onFn() {
            element.off(type, fn);
            element.off(type, onFn);
          });
          element.on(type, fn);
        },
        replaceWith: function(element, replaceNode) {
          var index,
              parent = element.parentNode;
          jqLiteDealoc(element);
          forEach(new JQLite(replaceNode), function(node) {
            if (index) {
              parent.insertBefore(node, index.nextSibling);
            } else {
              parent.replaceChild(node, element);
            }
            index = node;
          });
        },
        children: function(element) {
          var children = [];
          forEach(element.childNodes, function(element) {
            if (element.nodeType === NODE_TYPE_ELEMENT) {
              children.push(element);
            }
          });
          return children;
        },
        contents: function(element) {
          return element.contentDocument || element.childNodes || [];
        },
        append: function(element, node) {
          var nodeType = element.nodeType;
          if (nodeType !== NODE_TYPE_ELEMENT && nodeType !== NODE_TYPE_DOCUMENT_FRAGMENT)
            return;
          node = new JQLite(node);
          for (var i = 0,
              ii = node.length; i < ii; i++) {
            var child = node[i];
            element.appendChild(child);
          }
        },
        prepend: function(element, node) {
          if (element.nodeType === NODE_TYPE_ELEMENT) {
            var index = element.firstChild;
            forEach(new JQLite(node), function(child) {
              element.insertBefore(child, index);
            });
          }
        },
        wrap: function(element, wrapNode) {
          wrapNode = jqLite(wrapNode).eq(0).clone()[0];
          var parent = element.parentNode;
          if (parent) {
            parent.replaceChild(wrapNode, element);
          }
          wrapNode.appendChild(element);
        },
        remove: jqLiteRemove,
        detach: function(element) {
          jqLiteRemove(element, true);
        },
        after: function(element, newElement) {
          var index = element,
              parent = element.parentNode;
          newElement = new JQLite(newElement);
          for (var i = 0,
              ii = newElement.length; i < ii; i++) {
            var node = newElement[i];
            parent.insertBefore(node, index.nextSibling);
            index = node;
          }
        },
        addClass: jqLiteAddClass,
        removeClass: jqLiteRemoveClass,
        toggleClass: function(element, selector, condition) {
          if (selector) {
            forEach(selector.split(' '), function(className) {
              var classCondition = condition;
              if (isUndefined(classCondition)) {
                classCondition = !jqLiteHasClass(element, className);
              }
              (classCondition ? jqLiteAddClass : jqLiteRemoveClass)(element, className);
            });
          }
        },
        parent: function(element) {
          var parent = element.parentNode;
          return parent && parent.nodeType !== NODE_TYPE_DOCUMENT_FRAGMENT ? parent : null;
        },
        next: function(element) {
          return element.nextElementSibling;
        },
        find: function(element, selector) {
          if (element.getElementsByTagName) {
            return element.getElementsByTagName(selector);
          } else {
            return [];
          }
        },
        clone: jqLiteClone,
        triggerHandler: function(element, event, extraParameters) {
          var dummyEvent,
              eventFnsCopy,
              handlerArgs;
          var eventName = event.type || event;
          var expandoStore = jqLiteExpandoStore(element);
          var events = expandoStore && expandoStore.events;
          var eventFns = events && events[eventName];
          if (eventFns) {
            dummyEvent = {
              preventDefault: function() {
                this.defaultPrevented = true;
              },
              isDefaultPrevented: function() {
                return this.defaultPrevented === true;
              },
              stopImmediatePropagation: function() {
                this.immediatePropagationStopped = true;
              },
              isImmediatePropagationStopped: function() {
                return this.immediatePropagationStopped === true;
              },
              stopPropagation: noop,
              type: eventName,
              target: element
            };
            if (event.type) {
              dummyEvent = extend(dummyEvent, event);
            }
            eventFnsCopy = shallowCopy(eventFns);
            handlerArgs = extraParameters ? [dummyEvent].concat(extraParameters) : [dummyEvent];
            forEach(eventFnsCopy, function(fn) {
              if (!dummyEvent.isImmediatePropagationStopped()) {
                fn.apply(element, handlerArgs);
              }
            });
          }
        }
      }, function(fn, name) {
        JQLite.prototype[name] = function(arg1, arg2, arg3) {
          var value;
          for (var i = 0,
              ii = this.length; i < ii; i++) {
            if (isUndefined(value)) {
              value = fn(this[i], arg1, arg2, arg3);
              if (isDefined(value)) {
                value = jqLite(value);
              }
            } else {
              jqLiteAddNodes(value, fn(this[i], arg1, arg2, arg3));
            }
          }
          return isDefined(value) ? value : this;
        };
        JQLite.prototype.bind = JQLite.prototype.on;
        JQLite.prototype.unbind = JQLite.prototype.off;
      });
      function $$jqLiteProvider() {
        this.$get = function $$jqLite() {
          return extend(JQLite, {
            hasClass: function(node, classes) {
              if (node.attr)
                node = node[0];
              return jqLiteHasClass(node, classes);
            },
            addClass: function(node, classes) {
              if (node.attr)
                node = node[0];
              return jqLiteAddClass(node, classes);
            },
            removeClass: function(node, classes) {
              if (node.attr)
                node = node[0];
              return jqLiteRemoveClass(node, classes);
            }
          });
        };
      }
      function hashKey(obj, nextUidFn) {
        var key = obj && obj.$$hashKey;
        if (key) {
          if (typeof key === 'function') {
            key = obj.$$hashKey();
          }
          return key;
        }
        var objType = typeof obj;
        if (objType == 'function' || (objType == 'object' && obj !== null)) {
          key = obj.$$hashKey = objType + ':' + (nextUidFn || nextUid)();
        } else {
          key = objType + ':' + obj;
        }
        return key;
      }
      function HashMap(array, isolatedUid) {
        if (isolatedUid) {
          var uid = 0;
          this.nextUid = function() {
            return ++uid;
          };
        }
        forEach(array, this.put, this);
      }
      HashMap.prototype = {
        put: function(key, value) {
          this[hashKey(key, this.nextUid)] = value;
        },
        get: function(key) {
          return this[hashKey(key, this.nextUid)];
        },
        remove: function(key) {
          var value = this[key = hashKey(key, this.nextUid)];
          delete this[key];
          return value;
        }
      };
      var $$HashMapProvider = [function() {
        this.$get = [function() {
          return HashMap;
        }];
      }];
      var FN_ARGS = /^[^\(]*\(\s*([^\)]*)\)/m;
      var FN_ARG_SPLIT = /,/;
      var FN_ARG = /^\s*(_?)(\S+?)\1\s*$/;
      var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
      var $injectorMinErr = minErr('$injector');
      function anonFn(fn) {
        var fnText = fn.toString().replace(STRIP_COMMENTS, ''),
            args = fnText.match(FN_ARGS);
        if (args) {
          return 'function(' + (args[1] || '').replace(/[\s\r\n]+/, ' ') + ')';
        }
        return 'fn';
      }
      function annotate(fn, strictDi, name) {
        var $inject,
            fnText,
            argDecl,
            last;
        if (typeof fn === 'function') {
          if (!($inject = fn.$inject)) {
            $inject = [];
            if (fn.length) {
              if (strictDi) {
                if (!isString(name) || !name) {
                  name = fn.name || anonFn(fn);
                }
                throw $injectorMinErr('strictdi', '{0} is not using explicit annotation and cannot be invoked in strict mode', name);
              }
              fnText = fn.toString().replace(STRIP_COMMENTS, '');
              argDecl = fnText.match(FN_ARGS);
              forEach(argDecl[1].split(FN_ARG_SPLIT), function(arg) {
                arg.replace(FN_ARG, function(all, underscore, name) {
                  $inject.push(name);
                });
              });
            }
            fn.$inject = $inject;
          }
        } else if (isArray(fn)) {
          last = fn.length - 1;
          assertArgFn(fn[last], 'fn');
          $inject = fn.slice(0, last);
        } else {
          assertArgFn(fn, 'fn', true);
        }
        return $inject;
      }
      function createInjector(modulesToLoad, strictDi) {
        strictDi = (strictDi === true);
        var INSTANTIATING = {},
            providerSuffix = 'Provider',
            path = [],
            loadedModules = new HashMap([], true),
            providerCache = {$provide: {
                provider: supportObject(provider),
                factory: supportObject(factory),
                service: supportObject(service),
                value: supportObject(value),
                constant: supportObject(constant),
                decorator: decorator
              }},
            providerInjector = (providerCache.$injector = createInternalInjector(providerCache, function(serviceName, caller) {
              if (angular.isString(caller)) {
                path.push(caller);
              }
              throw $injectorMinErr('unpr', "Unknown provider: {0}", path.join(' <- '));
            })),
            instanceCache = {},
            instanceInjector = (instanceCache.$injector = createInternalInjector(instanceCache, function(serviceName, caller) {
              var provider = providerInjector.get(serviceName + providerSuffix, caller);
              return instanceInjector.invoke(provider.$get, provider, undefined, serviceName);
            }));
        forEach(loadModules(modulesToLoad), function(fn) {
          if (fn)
            instanceInjector.invoke(fn);
        });
        return instanceInjector;
        function supportObject(delegate) {
          return function(key, value) {
            if (isObject(key)) {
              forEach(key, reverseParams(delegate));
            } else {
              return delegate(key, value);
            }
          };
        }
        function provider(name, provider_) {
          assertNotHasOwnProperty(name, 'service');
          if (isFunction(provider_) || isArray(provider_)) {
            provider_ = providerInjector.instantiate(provider_);
          }
          if (!provider_.$get) {
            throw $injectorMinErr('pget', "Provider '{0}' must define $get factory method.", name);
          }
          return providerCache[name + providerSuffix] = provider_;
        }
        function enforceReturnValue(name, factory) {
          return function enforcedReturnValue() {
            var result = instanceInjector.invoke(factory, this);
            if (isUndefined(result)) {
              throw $injectorMinErr('undef', "Provider '{0}' must return a value from $get factory method.", name);
            }
            return result;
          };
        }
        function factory(name, factoryFn, enforce) {
          return provider(name, {$get: enforce !== false ? enforceReturnValue(name, factoryFn) : factoryFn});
        }
        function service(name, constructor) {
          return factory(name, ['$injector', function($injector) {
            return $injector.instantiate(constructor);
          }]);
        }
        function value(name, val) {
          return factory(name, valueFn(val), false);
        }
        function constant(name, value) {
          assertNotHasOwnProperty(name, 'constant');
          providerCache[name] = value;
          instanceCache[name] = value;
        }
        function decorator(serviceName, decorFn) {
          var origProvider = providerInjector.get(serviceName + providerSuffix),
              orig$get = origProvider.$get;
          origProvider.$get = function() {
            var origInstance = instanceInjector.invoke(orig$get, origProvider);
            return instanceInjector.invoke(decorFn, null, {$delegate: origInstance});
          };
        }
        function loadModules(modulesToLoad) {
          assertArg(isUndefined(modulesToLoad) || isArray(modulesToLoad), 'modulesToLoad', 'not an array');
          var runBlocks = [],
              moduleFn;
          forEach(modulesToLoad, function(module) {
            if (loadedModules.get(module))
              return;
            loadedModules.put(module, true);
            function runInvokeQueue(queue) {
              var i,
                  ii;
              for (i = 0, ii = queue.length; i < ii; i++) {
                var invokeArgs = queue[i],
                    provider = providerInjector.get(invokeArgs[0]);
                provider[invokeArgs[1]].apply(provider, invokeArgs[2]);
              }
            }
            try {
              if (isString(module)) {
                moduleFn = angularModule(module);
                runBlocks = runBlocks.concat(loadModules(moduleFn.requires)).concat(moduleFn._runBlocks);
                runInvokeQueue(moduleFn._invokeQueue);
                runInvokeQueue(moduleFn._configBlocks);
              } else if (isFunction(module)) {
                runBlocks.push(providerInjector.invoke(module));
              } else if (isArray(module)) {
                runBlocks.push(providerInjector.invoke(module));
              } else {
                assertArgFn(module, 'module');
              }
            } catch (e) {
              if (isArray(module)) {
                module = module[module.length - 1];
              }
              if (e.message && e.stack && e.stack.indexOf(e.message) == -1) {
                e = e.message + '\n' + e.stack;
              }
              throw $injectorMinErr('modulerr', "Failed to instantiate module {0} due to:\n{1}", module, e.stack || e.message || e);
            }
          });
          return runBlocks;
        }
        function createInternalInjector(cache, factory) {
          function getService(serviceName, caller) {
            if (cache.hasOwnProperty(serviceName)) {
              if (cache[serviceName] === INSTANTIATING) {
                throw $injectorMinErr('cdep', 'Circular dependency found: {0}', serviceName + ' <- ' + path.join(' <- '));
              }
              return cache[serviceName];
            } else {
              try {
                path.unshift(serviceName);
                cache[serviceName] = INSTANTIATING;
                return cache[serviceName] = factory(serviceName, caller);
              } catch (err) {
                if (cache[serviceName] === INSTANTIATING) {
                  delete cache[serviceName];
                }
                throw err;
              } finally {
                path.shift();
              }
            }
          }
          function invoke(fn, self, locals, serviceName) {
            if (typeof locals === 'string') {
              serviceName = locals;
              locals = null;
            }
            var args = [],
                $inject = createInjector.$$annotate(fn, strictDi, serviceName),
                length,
                i,
                key;
            for (i = 0, length = $inject.length; i < length; i++) {
              key = $inject[i];
              if (typeof key !== 'string') {
                throw $injectorMinErr('itkn', 'Incorrect injection token! Expected service name as string, got {0}', key);
              }
              args.push(locals && locals.hasOwnProperty(key) ? locals[key] : getService(key, serviceName));
            }
            if (isArray(fn)) {
              fn = fn[length];
            }
            return fn.apply(self, args);
          }
          function instantiate(Type, locals, serviceName) {
            var instance = Object.create((isArray(Type) ? Type[Type.length - 1] : Type).prototype || null);
            var returnedValue = invoke(Type, instance, locals, serviceName);
            return isObject(returnedValue) || isFunction(returnedValue) ? returnedValue : instance;
          }
          return {
            invoke: invoke,
            instantiate: instantiate,
            get: getService,
            annotate: createInjector.$$annotate,
            has: function(name) {
              return providerCache.hasOwnProperty(name + providerSuffix) || cache.hasOwnProperty(name);
            }
          };
        }
      }
      createInjector.$$annotate = annotate;
      function $AnchorScrollProvider() {
        var autoScrollingEnabled = true;
        this.disableAutoScrolling = function() {
          autoScrollingEnabled = false;
        };
        this.$get = ['$window', '$location', '$rootScope', function($window, $location, $rootScope) {
          var document = $window.document;
          function getFirstAnchor(list) {
            var result = null;
            Array.prototype.some.call(list, function(element) {
              if (nodeName_(element) === 'a') {
                result = element;
                return true;
              }
            });
            return result;
          }
          function getYOffset() {
            var offset = scroll.yOffset;
            if (isFunction(offset)) {
              offset = offset();
            } else if (isElement(offset)) {
              var elem = offset[0];
              var style = $window.getComputedStyle(elem);
              if (style.position !== 'fixed') {
                offset = 0;
              } else {
                offset = elem.getBoundingClientRect().bottom;
              }
            } else if (!isNumber(offset)) {
              offset = 0;
            }
            return offset;
          }
          function scrollTo(elem) {
            if (elem) {
              elem.scrollIntoView();
              var offset = getYOffset();
              if (offset) {
                var elemTop = elem.getBoundingClientRect().top;
                $window.scrollBy(0, elemTop - offset);
              }
            } else {
              $window.scrollTo(0, 0);
            }
          }
          function scroll(hash) {
            hash = isString(hash) ? hash : $location.hash();
            var elm;
            if (!hash)
              scrollTo(null);
            else if ((elm = document.getElementById(hash)))
              scrollTo(elm);
            else if ((elm = getFirstAnchor(document.getElementsByName(hash))))
              scrollTo(elm);
            else if (hash === 'top')
              scrollTo(null);
          }
          if (autoScrollingEnabled) {
            $rootScope.$watch(function autoScrollWatch() {
              return $location.hash();
            }, function autoScrollWatchAction(newVal, oldVal) {
              if (newVal === oldVal && newVal === '')
                return;
              jqLiteDocumentLoaded(function() {
                $rootScope.$evalAsync(scroll);
              });
            });
          }
          return scroll;
        }];
      }
      var $animateMinErr = minErr('$animate');
      var ELEMENT_NODE = 1;
      var NG_ANIMATE_CLASSNAME = 'ng-animate';
      function mergeClasses(a, b) {
        if (!a && !b)
          return '';
        if (!a)
          return b;
        if (!b)
          return a;
        if (isArray(a))
          a = a.join(' ');
        if (isArray(b))
          b = b.join(' ');
        return a + ' ' + b;
      }
      function extractElementNode(element) {
        for (var i = 0; i < element.length; i++) {
          var elm = element[i];
          if (elm.nodeType === ELEMENT_NODE) {
            return elm;
          }
        }
      }
      function splitClasses(classes) {
        if (isString(classes)) {
          classes = classes.split(' ');
        }
        var obj = createMap();
        forEach(classes, function(klass) {
          if (klass.length) {
            obj[klass] = true;
          }
        });
        return obj;
      }
      function prepareAnimateOptions(options) {
        return isObject(options) ? options : {};
      }
      var $$CoreAnimateRunnerProvider = function() {
        this.$get = ['$q', '$$rAF', function($q, $$rAF) {
          function AnimateRunner() {}
          AnimateRunner.all = noop;
          AnimateRunner.chain = noop;
          AnimateRunner.prototype = {
            end: noop,
            cancel: noop,
            resume: noop,
            pause: noop,
            complete: noop,
            then: function(pass, fail) {
              return $q(function(resolve) {
                $$rAF(function() {
                  resolve();
                });
              }).then(pass, fail);
            }
          };
          return AnimateRunner;
        }];
      };
      var $$CoreAnimateQueueProvider = function() {
        var postDigestQueue = new HashMap();
        var postDigestElements = [];
        this.$get = ['$$AnimateRunner', '$rootScope', function($$AnimateRunner, $rootScope) {
          return {
            enabled: noop,
            on: noop,
            off: noop,
            pin: noop,
            push: function(element, event, options, domOperation) {
              domOperation && domOperation();
              options = options || {};
              options.from && element.css(options.from);
              options.to && element.css(options.to);
              if (options.addClass || options.removeClass) {
                addRemoveClassesPostDigest(element, options.addClass, options.removeClass);
              }
              return new $$AnimateRunner();
            }
          };
          function updateData(data, classes, value) {
            var changed = false;
            if (classes) {
              classes = isString(classes) ? classes.split(' ') : isArray(classes) ? classes : [];
              forEach(classes, function(className) {
                if (className) {
                  changed = true;
                  data[className] = value;
                }
              });
            }
            return changed;
          }
          function handleCSSClassChanges() {
            forEach(postDigestElements, function(element) {
              var data = postDigestQueue.get(element);
              if (data) {
                var existing = splitClasses(element.attr('class'));
                var toAdd = '';
                var toRemove = '';
                forEach(data, function(status, className) {
                  var hasClass = !!existing[className];
                  if (status !== hasClass) {
                    if (status) {
                      toAdd += (toAdd.length ? ' ' : '') + className;
                    } else {
                      toRemove += (toRemove.length ? ' ' : '') + className;
                    }
                  }
                });
                forEach(element, function(elm) {
                  toAdd && jqLiteAddClass(elm, toAdd);
                  toRemove && jqLiteRemoveClass(elm, toRemove);
                });
                postDigestQueue.remove(element);
              }
            });
            postDigestElements.length = 0;
          }
          function addRemoveClassesPostDigest(element, add, remove) {
            var data = postDigestQueue.get(element) || {};
            var classesAdded = updateData(data, add, true);
            var classesRemoved = updateData(data, remove, false);
            if (classesAdded || classesRemoved) {
              postDigestQueue.put(element, data);
              postDigestElements.push(element);
              if (postDigestElements.length === 1) {
                $rootScope.$$postDigest(handleCSSClassChanges);
              }
            }
          }
        }];
      };
      var $AnimateProvider = ['$provide', function($provide) {
        var provider = this;
        this.$$registeredAnimations = Object.create(null);
        this.register = function(name, factory) {
          if (name && name.charAt(0) !== '.') {
            throw $animateMinErr('notcsel', "Expecting class selector starting with '.' got '{0}'.", name);
          }
          var key = name + '-animation';
          provider.$$registeredAnimations[name.substr(1)] = key;
          $provide.factory(key, factory);
        };
        this.classNameFilter = function(expression) {
          if (arguments.length === 1) {
            this.$$classNameFilter = (expression instanceof RegExp) ? expression : null;
            if (this.$$classNameFilter) {
              var reservedRegex = new RegExp("(\\s+|\\/)" + NG_ANIMATE_CLASSNAME + "(\\s+|\\/)");
              if (reservedRegex.test(this.$$classNameFilter.toString())) {
                throw $animateMinErr('nongcls', '$animateProvider.classNameFilter(regex) prohibits accepting a regex value which matches/contains the "{0}" CSS class.', NG_ANIMATE_CLASSNAME);
              }
            }
          }
          return this.$$classNameFilter;
        };
        this.$get = ['$$animateQueue', function($$animateQueue) {
          function domInsert(element, parentElement, afterElement) {
            if (afterElement) {
              var afterNode = extractElementNode(afterElement);
              if (afterNode && !afterNode.parentNode && !afterNode.previousElementSibling) {
                afterElement = null;
              }
            }
            afterElement ? afterElement.after(element) : parentElement.prepend(element);
          }
          return {
            on: $$animateQueue.on,
            off: $$animateQueue.off,
            pin: $$animateQueue.pin,
            enabled: $$animateQueue.enabled,
            cancel: function(runner) {
              runner.end && runner.end();
            },
            enter: function(element, parent, after, options) {
              parent = parent && jqLite(parent);
              after = after && jqLite(after);
              parent = parent || after.parent();
              domInsert(element, parent, after);
              return $$animateQueue.push(element, 'enter', prepareAnimateOptions(options));
            },
            move: function(element, parent, after, options) {
              parent = parent && jqLite(parent);
              after = after && jqLite(after);
              parent = parent || after.parent();
              domInsert(element, parent, after);
              return $$animateQueue.push(element, 'move', prepareAnimateOptions(options));
            },
            leave: function(element, options) {
              return $$animateQueue.push(element, 'leave', prepareAnimateOptions(options), function() {
                element.remove();
              });
            },
            addClass: function(element, className, options) {
              options = prepareAnimateOptions(options);
              options.addClass = mergeClasses(options.addclass, className);
              return $$animateQueue.push(element, 'addClass', options);
            },
            removeClass: function(element, className, options) {
              options = prepareAnimateOptions(options);
              options.removeClass = mergeClasses(options.removeClass, className);
              return $$animateQueue.push(element, 'removeClass', options);
            },
            setClass: function(element, add, remove, options) {
              options = prepareAnimateOptions(options);
              options.addClass = mergeClasses(options.addClass, add);
              options.removeClass = mergeClasses(options.removeClass, remove);
              return $$animateQueue.push(element, 'setClass', options);
            },
            animate: function(element, from, to, className, options) {
              options = prepareAnimateOptions(options);
              options.from = options.from ? extend(options.from, from) : from;
              options.to = options.to ? extend(options.to, to) : to;
              className = className || 'ng-inline-animate';
              options.tempClasses = mergeClasses(options.tempClasses, className);
              return $$animateQueue.push(element, 'animate', options);
            }
          };
        }];
      }];
      var $CoreAnimateCssProvider = function() {
        this.$get = ['$$rAF', '$q', function($$rAF, $q) {
          var RAFPromise = function() {};
          RAFPromise.prototype = {
            done: function(cancel) {
              this.defer && this.defer[cancel === true ? 'reject' : 'resolve']();
            },
            end: function() {
              this.done();
            },
            cancel: function() {
              this.done(true);
            },
            getPromise: function() {
              if (!this.defer) {
                this.defer = $q.defer();
              }
              return this.defer.promise;
            },
            then: function(f1, f2) {
              return this.getPromise().then(f1, f2);
            },
            'catch': function(f1) {
              return this.getPromise()['catch'](f1);
            },
            'finally': function(f1) {
              return this.getPromise()['finally'](f1);
            }
          };
          return function(element, options) {
            if (options.cleanupStyles) {
              options.from = options.to = null;
            }
            if (options.from) {
              element.css(options.from);
              options.from = null;
            }
            var closed,
                runner = new RAFPromise();
            return {
              start: run,
              end: run
            };
            function run() {
              $$rAF(function() {
                close();
                if (!closed) {
                  runner.done();
                }
                closed = true;
              });
              return runner;
            }
            function close() {
              if (options.addClass) {
                element.addClass(options.addClass);
                options.addClass = null;
              }
              if (options.removeClass) {
                element.removeClass(options.removeClass);
                options.removeClass = null;
              }
              if (options.to) {
                element.css(options.to);
                options.to = null;
              }
            }
          };
        }];
      };
      function Browser(window, document, $log, $sniffer) {
        var self = this,
            rawDocument = document[0],
            location = window.location,
            history = window.history,
            setTimeout = window.setTimeout,
            clearTimeout = window.clearTimeout,
            pendingDeferIds = {};
        self.isMock = false;
        var outstandingRequestCount = 0;
        var outstandingRequestCallbacks = [];
        self.$$completeOutstandingRequest = completeOutstandingRequest;
        self.$$incOutstandingRequestCount = function() {
          outstandingRequestCount++;
        };
        function completeOutstandingRequest(fn) {
          try {
            fn.apply(null, sliceArgs(arguments, 1));
          } finally {
            outstandingRequestCount--;
            if (outstandingRequestCount === 0) {
              while (outstandingRequestCallbacks.length) {
                try {
                  outstandingRequestCallbacks.pop()();
                } catch (e) {
                  $log.error(e);
                }
              }
            }
          }
        }
        function getHash(url) {
          var index = url.indexOf('#');
          return index === -1 ? '' : url.substr(index);
        }
        self.notifyWhenNoOutstandingRequests = function(callback) {
          if (outstandingRequestCount === 0) {
            callback();
          } else {
            outstandingRequestCallbacks.push(callback);
          }
        };
        var cachedState,
            lastHistoryState,
            lastBrowserUrl = location.href,
            baseElement = document.find('base'),
            pendingLocation = null;
        cacheState();
        lastHistoryState = cachedState;
        self.url = function(url, replace, state) {
          if (isUndefined(state)) {
            state = null;
          }
          if (location !== window.location)
            location = window.location;
          if (history !== window.history)
            history = window.history;
          if (url) {
            var sameState = lastHistoryState === state;
            if (lastBrowserUrl === url && (!$sniffer.history || sameState)) {
              return self;
            }
            var sameBase = lastBrowserUrl && stripHash(lastBrowserUrl) === stripHash(url);
            lastBrowserUrl = url;
            lastHistoryState = state;
            if ($sniffer.history && (!sameBase || !sameState)) {
              history[replace ? 'replaceState' : 'pushState'](state, '', url);
              cacheState();
              lastHistoryState = cachedState;
            } else {
              if (!sameBase || pendingLocation) {
                pendingLocation = url;
              }
              if (replace) {
                location.replace(url);
              } else if (!sameBase) {
                location.href = url;
              } else {
                location.hash = getHash(url);
              }
              if (location.href !== url) {
                pendingLocation = url;
              }
            }
            return self;
          } else {
            return pendingLocation || location.href.replace(/%27/g, "'");
          }
        };
        self.state = function() {
          return cachedState;
        };
        var urlChangeListeners = [],
            urlChangeInit = false;
        function cacheStateAndFireUrlChange() {
          pendingLocation = null;
          cacheState();
          fireUrlChange();
        }
        function getCurrentState() {
          try {
            return history.state;
          } catch (e) {}
        }
        var lastCachedState = null;
        function cacheState() {
          cachedState = getCurrentState();
          cachedState = isUndefined(cachedState) ? null : cachedState;
          if (equals(cachedState, lastCachedState)) {
            cachedState = lastCachedState;
          }
          lastCachedState = cachedState;
        }
        function fireUrlChange() {
          if (lastBrowserUrl === self.url() && lastHistoryState === cachedState) {
            return;
          }
          lastBrowserUrl = self.url();
          lastHistoryState = cachedState;
          forEach(urlChangeListeners, function(listener) {
            listener(self.url(), cachedState);
          });
        }
        self.onUrlChange = function(callback) {
          if (!urlChangeInit) {
            if ($sniffer.history)
              jqLite(window).on('popstate', cacheStateAndFireUrlChange);
            jqLite(window).on('hashchange', cacheStateAndFireUrlChange);
            urlChangeInit = true;
          }
          urlChangeListeners.push(callback);
          return callback;
        };
        self.$$applicationDestroyed = function() {
          jqLite(window).off('hashchange popstate', cacheStateAndFireUrlChange);
        };
        self.$$checkUrlChange = fireUrlChange;
        self.baseHref = function() {
          var href = baseElement.attr('href');
          return href ? href.replace(/^(https?\:)?\/\/[^\/]*/, '') : '';
        };
        self.defer = function(fn, delay) {
          var timeoutId;
          outstandingRequestCount++;
          timeoutId = setTimeout(function() {
            delete pendingDeferIds[timeoutId];
            completeOutstandingRequest(fn);
          }, delay || 0);
          pendingDeferIds[timeoutId] = true;
          return timeoutId;
        };
        self.defer.cancel = function(deferId) {
          if (pendingDeferIds[deferId]) {
            delete pendingDeferIds[deferId];
            clearTimeout(deferId);
            completeOutstandingRequest(noop);
            return true;
          }
          return false;
        };
      }
      function $BrowserProvider() {
        this.$get = ['$window', '$log', '$sniffer', '$document', function($window, $log, $sniffer, $document) {
          return new Browser($window, $document, $log, $sniffer);
        }];
      }
      function $CacheFactoryProvider() {
        this.$get = function() {
          var caches = {};
          function cacheFactory(cacheId, options) {
            if (cacheId in caches) {
              throw minErr('$cacheFactory')('iid', "CacheId '{0}' is already taken!", cacheId);
            }
            var size = 0,
                stats = extend({}, options, {id: cacheId}),
                data = createMap(),
                capacity = (options && options.capacity) || Number.MAX_VALUE,
                lruHash = createMap(),
                freshEnd = null,
                staleEnd = null;
            return caches[cacheId] = {
              put: function(key, value) {
                if (isUndefined(value))
                  return;
                if (capacity < Number.MAX_VALUE) {
                  var lruEntry = lruHash[key] || (lruHash[key] = {key: key});
                  refresh(lruEntry);
                }
                if (!(key in data))
                  size++;
                data[key] = value;
                if (size > capacity) {
                  this.remove(staleEnd.key);
                }
                return value;
              },
              get: function(key) {
                if (capacity < Number.MAX_VALUE) {
                  var lruEntry = lruHash[key];
                  if (!lruEntry)
                    return;
                  refresh(lruEntry);
                }
                return data[key];
              },
              remove: function(key) {
                if (capacity < Number.MAX_VALUE) {
                  var lruEntry = lruHash[key];
                  if (!lruEntry)
                    return;
                  if (lruEntry == freshEnd)
                    freshEnd = lruEntry.p;
                  if (lruEntry == staleEnd)
                    staleEnd = lruEntry.n;
                  link(lruEntry.n, lruEntry.p);
                  delete lruHash[key];
                }
                if (!(key in data))
                  return;
                delete data[key];
                size--;
              },
              removeAll: function() {
                data = createMap();
                size = 0;
                lruHash = createMap();
                freshEnd = staleEnd = null;
              },
              destroy: function() {
                data = null;
                stats = null;
                lruHash = null;
                delete caches[cacheId];
              },
              info: function() {
                return extend({}, stats, {size: size});
              }
            };
            function refresh(entry) {
              if (entry != freshEnd) {
                if (!staleEnd) {
                  staleEnd = entry;
                } else if (staleEnd == entry) {
                  staleEnd = entry.n;
                }
                link(entry.n, entry.p);
                link(entry, freshEnd);
                freshEnd = entry;
                freshEnd.n = null;
              }
            }
            function link(nextEntry, prevEntry) {
              if (nextEntry != prevEntry) {
                if (nextEntry)
                  nextEntry.p = prevEntry;
                if (prevEntry)
                  prevEntry.n = nextEntry;
              }
            }
          }
          cacheFactory.info = function() {
            var info = {};
            forEach(caches, function(cache, cacheId) {
              info[cacheId] = cache.info();
            });
            return info;
          };
          cacheFactory.get = function(cacheId) {
            return caches[cacheId];
          };
          return cacheFactory;
        };
      }
      function $TemplateCacheProvider() {
        this.$get = ['$cacheFactory', function($cacheFactory) {
          return $cacheFactory('templates');
        }];
      }
      var $compileMinErr = minErr('$compile');
      $CompileProvider.$inject = ['$provide', '$$sanitizeUriProvider'];
      function $CompileProvider($provide, $$sanitizeUriProvider) {
        var hasDirectives = {},
            Suffix = 'Directive',
            COMMENT_DIRECTIVE_REGEXP = /^\s*directive\:\s*([\w\-]+)\s+(.*)$/,
            CLASS_DIRECTIVE_REGEXP = /(([\w\-]+)(?:\:([^;]+))?;?)/,
            ALL_OR_NOTHING_ATTRS = makeMap('ngSrc,ngSrcset,src,srcset'),
            REQUIRE_PREFIX_REGEXP = /^(?:(\^\^?)?(\?)?(\^\^?)?)?/;
        var EVENT_HANDLER_ATTR_REGEXP = /^(on[a-z]+|formaction)$/;
        function parseIsolateBindings(scope, directiveName, isController) {
          var LOCAL_REGEXP = /^\s*([@&]|=(\*?))(\??)\s*(\w*)\s*$/;
          var bindings = {};
          forEach(scope, function(definition, scopeName) {
            var match = definition.match(LOCAL_REGEXP);
            if (!match) {
              throw $compileMinErr('iscp', "Invalid {3} for directive '{0}'." + " Definition: {... {1}: '{2}' ...}", directiveName, scopeName, definition, (isController ? "controller bindings definition" : "isolate scope definition"));
            }
            bindings[scopeName] = {
              mode: match[1][0],
              collection: match[2] === '*',
              optional: match[3] === '?',
              attrName: match[4] || scopeName
            };
          });
          return bindings;
        }
        function parseDirectiveBindings(directive, directiveName) {
          var bindings = {
            isolateScope: null,
            bindToController: null
          };
          if (isObject(directive.scope)) {
            if (directive.bindToController === true) {
              bindings.bindToController = parseIsolateBindings(directive.scope, directiveName, true);
              bindings.isolateScope = {};
            } else {
              bindings.isolateScope = parseIsolateBindings(directive.scope, directiveName, false);
            }
          }
          if (isObject(directive.bindToController)) {
            bindings.bindToController = parseIsolateBindings(directive.bindToController, directiveName, true);
          }
          if (isObject(bindings.bindToController)) {
            var controller = directive.controller;
            var controllerAs = directive.controllerAs;
            if (!controller) {
              throw $compileMinErr('noctrl', "Cannot bind to controller without directive '{0}'s controller.", directiveName);
            } else if (!identifierForController(controller, controllerAs)) {
              throw $compileMinErr('noident', "Cannot bind to controller without identifier for directive '{0}'.", directiveName);
            }
          }
          return bindings;
        }
        function assertValidDirectiveName(name) {
          var letter = name.charAt(0);
          if (!letter || letter !== lowercase(letter)) {
            throw $compileMinErr('baddir', "Directive name '{0}' is invalid. The first character must be a lowercase letter", name);
          }
          if (name !== name.trim()) {
            throw $compileMinErr('baddir', "Directive name '{0}' is invalid. The name should not contain leading or trailing whitespaces", name);
          }
        }
        this.directive = function registerDirective(name, directiveFactory) {
          assertNotHasOwnProperty(name, 'directive');
          if (isString(name)) {
            assertValidDirectiveName(name);
            assertArg(directiveFactory, 'directiveFactory');
            if (!hasDirectives.hasOwnProperty(name)) {
              hasDirectives[name] = [];
              $provide.factory(name + Suffix, ['$injector', '$exceptionHandler', function($injector, $exceptionHandler) {
                var directives = [];
                forEach(hasDirectives[name], function(directiveFactory, index) {
                  try {
                    var directive = $injector.invoke(directiveFactory);
                    if (isFunction(directive)) {
                      directive = {compile: valueFn(directive)};
                    } else if (!directive.compile && directive.link) {
                      directive.compile = valueFn(directive.link);
                    }
                    directive.priority = directive.priority || 0;
                    directive.index = index;
                    directive.name = directive.name || name;
                    directive.require = directive.require || (directive.controller && directive.name);
                    directive.restrict = directive.restrict || 'EA';
                    var bindings = directive.$$bindings = parseDirectiveBindings(directive, directive.name);
                    if (isObject(bindings.isolateScope)) {
                      directive.$$isolateBindings = bindings.isolateScope;
                    }
                    directive.$$moduleName = directiveFactory.$$moduleName;
                    directives.push(directive);
                  } catch (e) {
                    $exceptionHandler(e);
                  }
                });
                return directives;
              }]);
            }
            hasDirectives[name].push(directiveFactory);
          } else {
            forEach(name, reverseParams(registerDirective));
          }
          return this;
        };
        this.aHrefSanitizationWhitelist = function(regexp) {
          if (isDefined(regexp)) {
            $$sanitizeUriProvider.aHrefSanitizationWhitelist(regexp);
            return this;
          } else {
            return $$sanitizeUriProvider.aHrefSanitizationWhitelist();
          }
        };
        this.imgSrcSanitizationWhitelist = function(regexp) {
          if (isDefined(regexp)) {
            $$sanitizeUriProvider.imgSrcSanitizationWhitelist(regexp);
            return this;
          } else {
            return $$sanitizeUriProvider.imgSrcSanitizationWhitelist();
          }
        };
        var debugInfoEnabled = true;
        this.debugInfoEnabled = function(enabled) {
          if (isDefined(enabled)) {
            debugInfoEnabled = enabled;
            return this;
          }
          return debugInfoEnabled;
        };
        this.$get = ['$injector', '$interpolate', '$exceptionHandler', '$templateRequest', '$parse', '$controller', '$rootScope', '$document', '$sce', '$animate', '$$sanitizeUri', function($injector, $interpolate, $exceptionHandler, $templateRequest, $parse, $controller, $rootScope, $document, $sce, $animate, $$sanitizeUri) {
          var Attributes = function(element, attributesToCopy) {
            if (attributesToCopy) {
              var keys = Object.keys(attributesToCopy);
              var i,
                  l,
                  key;
              for (i = 0, l = keys.length; i < l; i++) {
                key = keys[i];
                this[key] = attributesToCopy[key];
              }
            } else {
              this.$attr = {};
            }
            this.$$element = element;
          };
          Attributes.prototype = {
            $normalize: directiveNormalize,
            $addClass: function(classVal) {
              if (classVal && classVal.length > 0) {
                $animate.addClass(this.$$element, classVal);
              }
            },
            $removeClass: function(classVal) {
              if (classVal && classVal.length > 0) {
                $animate.removeClass(this.$$element, classVal);
              }
            },
            $updateClass: function(newClasses, oldClasses) {
              var toAdd = tokenDifference(newClasses, oldClasses);
              if (toAdd && toAdd.length) {
                $animate.addClass(this.$$element, toAdd);
              }
              var toRemove = tokenDifference(oldClasses, newClasses);
              if (toRemove && toRemove.length) {
                $animate.removeClass(this.$$element, toRemove);
              }
            },
            $set: function(key, value, writeAttr, attrName) {
              var node = this.$$element[0],
                  booleanKey = getBooleanAttrName(node, key),
                  aliasedKey = getAliasedAttrName(key),
                  observer = key,
                  nodeName;
              if (booleanKey) {
                this.$$element.prop(key, value);
                attrName = booleanKey;
              } else if (aliasedKey) {
                this[aliasedKey] = value;
                observer = aliasedKey;
              }
              this[key] = value;
              if (attrName) {
                this.$attr[key] = attrName;
              } else {
                attrName = this.$attr[key];
                if (!attrName) {
                  this.$attr[key] = attrName = snake_case(key, '-');
                }
              }
              nodeName = nodeName_(this.$$element);
              if ((nodeName === 'a' && key === 'href') || (nodeName === 'img' && key === 'src')) {
                this[key] = value = $$sanitizeUri(value, key === 'src');
              } else if (nodeName === 'img' && key === 'srcset') {
                var result = "";
                var trimmedSrcset = trim(value);
                var srcPattern = /(\s+\d+x\s*,|\s+\d+w\s*,|\s+,|,\s+)/;
                var pattern = /\s/.test(trimmedSrcset) ? srcPattern : /(,)/;
                var rawUris = trimmedSrcset.split(pattern);
                var nbrUrisWith2parts = Math.floor(rawUris.length / 2);
                for (var i = 0; i < nbrUrisWith2parts; i++) {
                  var innerIdx = i * 2;
                  result += $$sanitizeUri(trim(rawUris[innerIdx]), true);
                  result += (" " + trim(rawUris[innerIdx + 1]));
                }
                var lastTuple = trim(rawUris[i * 2]).split(/\s/);
                result += $$sanitizeUri(trim(lastTuple[0]), true);
                if (lastTuple.length === 2) {
                  result += (" " + trim(lastTuple[1]));
                }
                this[key] = value = result;
              }
              if (writeAttr !== false) {
                if (value === null || isUndefined(value)) {
                  this.$$element.removeAttr(attrName);
                } else {
                  this.$$element.attr(attrName, value);
                }
              }
              var $$observers = this.$$observers;
              $$observers && forEach($$observers[observer], function(fn) {
                try {
                  fn(value);
                } catch (e) {
                  $exceptionHandler(e);
                }
              });
            },
            $observe: function(key, fn) {
              var attrs = this,
                  $$observers = (attrs.$$observers || (attrs.$$observers = createMap())),
                  listeners = ($$observers[key] || ($$observers[key] = []));
              listeners.push(fn);
              $rootScope.$evalAsync(function() {
                if (!listeners.$$inter && attrs.hasOwnProperty(key) && !isUndefined(attrs[key])) {
                  fn(attrs[key]);
                }
              });
              return function() {
                arrayRemove(listeners, fn);
              };
            }
          };
          function safeAddClass($element, className) {
            try {
              $element.addClass(className);
            } catch (e) {}
          }
          var startSymbol = $interpolate.startSymbol(),
              endSymbol = $interpolate.endSymbol(),
              denormalizeTemplate = (startSymbol == '{{' || endSymbol == '}}') ? identity : function denormalizeTemplate(template) {
                return template.replace(/\{\{/g, startSymbol).replace(/}}/g, endSymbol);
              },
              NG_ATTR_BINDING = /^ngAttr[A-Z]/;
          var MULTI_ELEMENT_DIR_RE = /^(.+)Start$/;
          compile.$$addBindingInfo = debugInfoEnabled ? function $$addBindingInfo($element, binding) {
            var bindings = $element.data('$binding') || [];
            if (isArray(binding)) {
              bindings = bindings.concat(binding);
            } else {
              bindings.push(binding);
            }
            $element.data('$binding', bindings);
          } : noop;
          compile.$$addBindingClass = debugInfoEnabled ? function $$addBindingClass($element) {
            safeAddClass($element, 'ng-binding');
          } : noop;
          compile.$$addScopeInfo = debugInfoEnabled ? function $$addScopeInfo($element, scope, isolated, noTemplate) {
            var dataName = isolated ? (noTemplate ? '$isolateScopeNoTemplate' : '$isolateScope') : '$scope';
            $element.data(dataName, scope);
          } : noop;
          compile.$$addScopeClass = debugInfoEnabled ? function $$addScopeClass($element, isolated) {
            safeAddClass($element, isolated ? 'ng-isolate-scope' : 'ng-scope');
          } : noop;
          return compile;
          function compile($compileNodes, transcludeFn, maxPriority, ignoreDirective, previousCompileContext) {
            if (!($compileNodes instanceof jqLite)) {
              $compileNodes = jqLite($compileNodes);
            }
            forEach($compileNodes, function(node, index) {
              if (node.nodeType == NODE_TYPE_TEXT && node.nodeValue.match(/\S+/)) {
                $compileNodes[index] = jqLite(node).wrap('<span></span>').parent()[0];
              }
            });
            var compositeLinkFn = compileNodes($compileNodes, transcludeFn, $compileNodes, maxPriority, ignoreDirective, previousCompileContext);
            compile.$$addScopeClass($compileNodes);
            var namespace = null;
            return function publicLinkFn(scope, cloneConnectFn, options) {
              assertArg(scope, 'scope');
              if (previousCompileContext && previousCompileContext.needsNewScope) {
                scope = scope.$parent.$new();
              }
              options = options || {};
              var parentBoundTranscludeFn = options.parentBoundTranscludeFn,
                  transcludeControllers = options.transcludeControllers,
                  futureParentElement = options.futureParentElement;
              if (parentBoundTranscludeFn && parentBoundTranscludeFn.$$boundTransclude) {
                parentBoundTranscludeFn = parentBoundTranscludeFn.$$boundTransclude;
              }
              if (!namespace) {
                namespace = detectNamespaceForChildElements(futureParentElement);
              }
              var $linkNode;
              if (namespace !== 'html') {
                $linkNode = jqLite(wrapTemplate(namespace, jqLite('<div>').append($compileNodes).html()));
              } else if (cloneConnectFn) {
                $linkNode = JQLitePrototype.clone.call($compileNodes);
              } else {
                $linkNode = $compileNodes;
              }
              if (transcludeControllers) {
                for (var controllerName in transcludeControllers) {
                  $linkNode.data('$' + controllerName + 'Controller', transcludeControllers[controllerName].instance);
                }
              }
              compile.$$addScopeInfo($linkNode, scope);
              if (cloneConnectFn)
                cloneConnectFn($linkNode, scope);
              if (compositeLinkFn)
                compositeLinkFn(scope, $linkNode, $linkNode, parentBoundTranscludeFn);
              return $linkNode;
            };
          }
          function detectNamespaceForChildElements(parentElement) {
            var node = parentElement && parentElement[0];
            if (!node) {
              return 'html';
            } else {
              return nodeName_(node) !== 'foreignobject' && node.toString().match(/SVG/) ? 'svg' : 'html';
            }
          }
          function compileNodes(nodeList, transcludeFn, $rootElement, maxPriority, ignoreDirective, previousCompileContext) {
            var linkFns = [],
                attrs,
                directives,
                nodeLinkFn,
                childNodes,
                childLinkFn,
                linkFnFound,
                nodeLinkFnFound;
            for (var i = 0; i < nodeList.length; i++) {
              attrs = new Attributes();
              directives = collectDirectives(nodeList[i], [], attrs, i === 0 ? maxPriority : undefined, ignoreDirective);
              nodeLinkFn = (directives.length) ? applyDirectivesToNode(directives, nodeList[i], attrs, transcludeFn, $rootElement, null, [], [], previousCompileContext) : null;
              if (nodeLinkFn && nodeLinkFn.scope) {
                compile.$$addScopeClass(attrs.$$element);
              }
              childLinkFn = (nodeLinkFn && nodeLinkFn.terminal || !(childNodes = nodeList[i].childNodes) || !childNodes.length) ? null : compileNodes(childNodes, nodeLinkFn ? ((nodeLinkFn.transcludeOnThisElement || !nodeLinkFn.templateOnThisElement) && nodeLinkFn.transclude) : transcludeFn);
              if (nodeLinkFn || childLinkFn) {
                linkFns.push(i, nodeLinkFn, childLinkFn);
                linkFnFound = true;
                nodeLinkFnFound = nodeLinkFnFound || nodeLinkFn;
              }
              previousCompileContext = null;
            }
            return linkFnFound ? compositeLinkFn : null;
            function compositeLinkFn(scope, nodeList, $rootElement, parentBoundTranscludeFn) {
              var nodeLinkFn,
                  childLinkFn,
                  node,
                  childScope,
                  i,
                  ii,
                  idx,
                  childBoundTranscludeFn;
              var stableNodeList;
              if (nodeLinkFnFound) {
                var nodeListLength = nodeList.length;
                stableNodeList = new Array(nodeListLength);
                for (i = 0; i < linkFns.length; i += 3) {
                  idx = linkFns[i];
                  stableNodeList[idx] = nodeList[idx];
                }
              } else {
                stableNodeList = nodeList;
              }
              for (i = 0, ii = linkFns.length; i < ii; ) {
                node = stableNodeList[linkFns[i++]];
                nodeLinkFn = linkFns[i++];
                childLinkFn = linkFns[i++];
                if (nodeLinkFn) {
                  if (nodeLinkFn.scope) {
                    childScope = scope.$new();
                    compile.$$addScopeInfo(jqLite(node), childScope);
                  } else {
                    childScope = scope;
                  }
                  if (nodeLinkFn.transcludeOnThisElement) {
                    childBoundTranscludeFn = createBoundTranscludeFn(scope, nodeLinkFn.transclude, parentBoundTranscludeFn);
                  } else if (!nodeLinkFn.templateOnThisElement && parentBoundTranscludeFn) {
                    childBoundTranscludeFn = parentBoundTranscludeFn;
                  } else if (!parentBoundTranscludeFn && transcludeFn) {
                    childBoundTranscludeFn = createBoundTranscludeFn(scope, transcludeFn);
                  } else {
                    childBoundTranscludeFn = null;
                  }
                  nodeLinkFn(childLinkFn, childScope, node, $rootElement, childBoundTranscludeFn);
                } else if (childLinkFn) {
                  childLinkFn(scope, node.childNodes, undefined, parentBoundTranscludeFn);
                }
              }
            }
          }
          function createBoundTranscludeFn(scope, transcludeFn, previousBoundTranscludeFn) {
            var boundTranscludeFn = function(transcludedScope, cloneFn, controllers, futureParentElement, containingScope) {
              if (!transcludedScope) {
                transcludedScope = scope.$new(false, containingScope);
                transcludedScope.$$transcluded = true;
              }
              return transcludeFn(transcludedScope, cloneFn, {
                parentBoundTranscludeFn: previousBoundTranscludeFn,
                transcludeControllers: controllers,
                futureParentElement: futureParentElement
              });
            };
            return boundTranscludeFn;
          }
          function collectDirectives(node, directives, attrs, maxPriority, ignoreDirective) {
            var nodeType = node.nodeType,
                attrsMap = attrs.$attr,
                match,
                className;
            switch (nodeType) {
              case NODE_TYPE_ELEMENT:
                addDirective(directives, directiveNormalize(nodeName_(node)), 'E', maxPriority, ignoreDirective);
                for (var attr,
                    name,
                    nName,
                    ngAttrName,
                    value,
                    isNgAttr,
                    nAttrs = node.attributes,
                    j = 0,
                    jj = nAttrs && nAttrs.length; j < jj; j++) {
                  var attrStartName = false;
                  var attrEndName = false;
                  attr = nAttrs[j];
                  name = attr.name;
                  value = trim(attr.value);
                  ngAttrName = directiveNormalize(name);
                  if (isNgAttr = NG_ATTR_BINDING.test(ngAttrName)) {
                    name = name.replace(PREFIX_REGEXP, '').substr(8).replace(/_(.)/g, function(match, letter) {
                      return letter.toUpperCase();
                    });
                  }
                  var multiElementMatch = ngAttrName.match(MULTI_ELEMENT_DIR_RE);
                  if (multiElementMatch && directiveIsMultiElement(multiElementMatch[1])) {
                    attrStartName = name;
                    attrEndName = name.substr(0, name.length - 5) + 'end';
                    name = name.substr(0, name.length - 6);
                  }
                  nName = directiveNormalize(name.toLowerCase());
                  attrsMap[nName] = name;
                  if (isNgAttr || !attrs.hasOwnProperty(nName)) {
                    attrs[nName] = value;
                    if (getBooleanAttrName(node, nName)) {
                      attrs[nName] = true;
                    }
                  }
                  addAttrInterpolateDirective(node, directives, value, nName, isNgAttr);
                  addDirective(directives, nName, 'A', maxPriority, ignoreDirective, attrStartName, attrEndName);
                }
                className = node.className;
                if (isObject(className)) {
                  className = className.animVal;
                }
                if (isString(className) && className !== '') {
                  while (match = CLASS_DIRECTIVE_REGEXP.exec(className)) {
                    nName = directiveNormalize(match[2]);
                    if (addDirective(directives, nName, 'C', maxPriority, ignoreDirective)) {
                      attrs[nName] = trim(match[3]);
                    }
                    className = className.substr(match.index + match[0].length);
                  }
                }
                break;
              case NODE_TYPE_TEXT:
                if (msie === 11) {
                  while (node.parentNode && node.nextSibling && node.nextSibling.nodeType === NODE_TYPE_TEXT) {
                    node.nodeValue = node.nodeValue + node.nextSibling.nodeValue;
                    node.parentNode.removeChild(node.nextSibling);
                  }
                }
                addTextInterpolateDirective(directives, node.nodeValue);
                break;
              case NODE_TYPE_COMMENT:
                try {
                  match = COMMENT_DIRECTIVE_REGEXP.exec(node.nodeValue);
                  if (match) {
                    nName = directiveNormalize(match[1]);
                    if (addDirective(directives, nName, 'M', maxPriority, ignoreDirective)) {
                      attrs[nName] = trim(match[2]);
                    }
                  }
                } catch (e) {}
                break;
            }
            directives.sort(byPriority);
            return directives;
          }
          function groupScan(node, attrStart, attrEnd) {
            var nodes = [];
            var depth = 0;
            if (attrStart && node.hasAttribute && node.hasAttribute(attrStart)) {
              do {
                if (!node) {
                  throw $compileMinErr('uterdir', "Unterminated attribute, found '{0}' but no matching '{1}' found.", attrStart, attrEnd);
                }
                if (node.nodeType == NODE_TYPE_ELEMENT) {
                  if (node.hasAttribute(attrStart))
                    depth++;
                  if (node.hasAttribute(attrEnd))
                    depth--;
                }
                nodes.push(node);
                node = node.nextSibling;
              } while (depth > 0);
            } else {
              nodes.push(node);
            }
            return jqLite(nodes);
          }
          function groupElementsLinkFnWrapper(linkFn, attrStart, attrEnd) {
            return function(scope, element, attrs, controllers, transcludeFn) {
              element = groupScan(element[0], attrStart, attrEnd);
              return linkFn(scope, element, attrs, controllers, transcludeFn);
            };
          }
          function applyDirectivesToNode(directives, compileNode, templateAttrs, transcludeFn, jqCollection, originalReplaceDirective, preLinkFns, postLinkFns, previousCompileContext) {
            previousCompileContext = previousCompileContext || {};
            var terminalPriority = -Number.MAX_VALUE,
                newScopeDirective = previousCompileContext.newScopeDirective,
                controllerDirectives = previousCompileContext.controllerDirectives,
                newIsolateScopeDirective = previousCompileContext.newIsolateScopeDirective,
                templateDirective = previousCompileContext.templateDirective,
                nonTlbTranscludeDirective = previousCompileContext.nonTlbTranscludeDirective,
                hasTranscludeDirective = false,
                hasTemplate = false,
                hasElementTranscludeDirective = previousCompileContext.hasElementTranscludeDirective,
                $compileNode = templateAttrs.$$element = jqLite(compileNode),
                directive,
                directiveName,
                $template,
                replaceDirective = originalReplaceDirective,
                childTranscludeFn = transcludeFn,
                linkFn,
                directiveValue;
            for (var i = 0,
                ii = directives.length; i < ii; i++) {
              directive = directives[i];
              var attrStart = directive.$$start;
              var attrEnd = directive.$$end;
              if (attrStart) {
                $compileNode = groupScan(compileNode, attrStart, attrEnd);
              }
              $template = undefined;
              if (terminalPriority > directive.priority) {
                break;
              }
              if (directiveValue = directive.scope) {
                if (!directive.templateUrl) {
                  if (isObject(directiveValue)) {
                    assertNoDuplicate('new/isolated scope', newIsolateScopeDirective || newScopeDirective, directive, $compileNode);
                    newIsolateScopeDirective = directive;
                  } else {
                    assertNoDuplicate('new/isolated scope', newIsolateScopeDirective, directive, $compileNode);
                  }
                }
                newScopeDirective = newScopeDirective || directive;
              }
              directiveName = directive.name;
              if (!directive.templateUrl && directive.controller) {
                directiveValue = directive.controller;
                controllerDirectives = controllerDirectives || createMap();
                assertNoDuplicate("'" + directiveName + "' controller", controllerDirectives[directiveName], directive, $compileNode);
                controllerDirectives[directiveName] = directive;
              }
              if (directiveValue = directive.transclude) {
                hasTranscludeDirective = true;
                if (!directive.$$tlb) {
                  assertNoDuplicate('transclusion', nonTlbTranscludeDirective, directive, $compileNode);
                  nonTlbTranscludeDirective = directive;
                }
                if (directiveValue == 'element') {
                  hasElementTranscludeDirective = true;
                  terminalPriority = directive.priority;
                  $template = $compileNode;
                  $compileNode = templateAttrs.$$element = jqLite(document.createComment(' ' + directiveName + ': ' + templateAttrs[directiveName] + ' '));
                  compileNode = $compileNode[0];
                  replaceWith(jqCollection, sliceArgs($template), compileNode);
                  childTranscludeFn = compile($template, transcludeFn, terminalPriority, replaceDirective && replaceDirective.name, {nonTlbTranscludeDirective: nonTlbTranscludeDirective});
                } else {
                  $template = jqLite(jqLiteClone(compileNode)).contents();
                  $compileNode.empty();
                  childTranscludeFn = compile($template, transcludeFn, undefined, undefined, {needsNewScope: directive.$$isolateScope || directive.$$newScope});
                }
              }
              if (directive.template) {
                hasTemplate = true;
                assertNoDuplicate('template', templateDirective, directive, $compileNode);
                templateDirective = directive;
                directiveValue = (isFunction(directive.template)) ? directive.template($compileNode, templateAttrs) : directive.template;
                directiveValue = denormalizeTemplate(directiveValue);
                if (directive.replace) {
                  replaceDirective = directive;
                  if (jqLiteIsTextNode(directiveValue)) {
                    $template = [];
                  } else {
                    $template = removeComments(wrapTemplate(directive.templateNamespace, trim(directiveValue)));
                  }
                  compileNode = $template[0];
                  if ($template.length != 1 || compileNode.nodeType !== NODE_TYPE_ELEMENT) {
                    throw $compileMinErr('tplrt', "Template for directive '{0}' must have exactly one root element. {1}", directiveName, '');
                  }
                  replaceWith(jqCollection, $compileNode, compileNode);
                  var newTemplateAttrs = {$attr: {}};
                  var templateDirectives = collectDirectives(compileNode, [], newTemplateAttrs);
                  var unprocessedDirectives = directives.splice(i + 1, directives.length - (i + 1));
                  if (newIsolateScopeDirective || newScopeDirective) {
                    markDirectiveScope(templateDirectives, newIsolateScopeDirective, newScopeDirective);
                  }
                  directives = directives.concat(templateDirectives).concat(unprocessedDirectives);
                  mergeTemplateAttributes(templateAttrs, newTemplateAttrs);
                  ii = directives.length;
                } else {
                  $compileNode.html(directiveValue);
                }
              }
              if (directive.templateUrl) {
                hasTemplate = true;
                assertNoDuplicate('template', templateDirective, directive, $compileNode);
                templateDirective = directive;
                if (directive.replace) {
                  replaceDirective = directive;
                }
                nodeLinkFn = compileTemplateUrl(directives.splice(i, directives.length - i), $compileNode, templateAttrs, jqCollection, hasTranscludeDirective && childTranscludeFn, preLinkFns, postLinkFns, {
                  controllerDirectives: controllerDirectives,
                  newScopeDirective: (newScopeDirective !== directive) && newScopeDirective,
                  newIsolateScopeDirective: newIsolateScopeDirective,
                  templateDirective: templateDirective,
                  nonTlbTranscludeDirective: nonTlbTranscludeDirective
                });
                ii = directives.length;
              } else if (directive.compile) {
                try {
                  linkFn = directive.compile($compileNode, templateAttrs, childTranscludeFn);
                  if (isFunction(linkFn)) {
                    addLinkFns(null, linkFn, attrStart, attrEnd);
                  } else if (linkFn) {
                    addLinkFns(linkFn.pre, linkFn.post, attrStart, attrEnd);
                  }
                } catch (e) {
                  $exceptionHandler(e, startingTag($compileNode));
                }
              }
              if (directive.terminal) {
                nodeLinkFn.terminal = true;
                terminalPriority = Math.max(terminalPriority, directive.priority);
              }
            }
            nodeLinkFn.scope = newScopeDirective && newScopeDirective.scope === true;
            nodeLinkFn.transcludeOnThisElement = hasTranscludeDirective;
            nodeLinkFn.templateOnThisElement = hasTemplate;
            nodeLinkFn.transclude = childTranscludeFn;
            previousCompileContext.hasElementTranscludeDirective = hasElementTranscludeDirective;
            return nodeLinkFn;
            function addLinkFns(pre, post, attrStart, attrEnd) {
              if (pre) {
                if (attrStart)
                  pre = groupElementsLinkFnWrapper(pre, attrStart, attrEnd);
                pre.require = directive.require;
                pre.directiveName = directiveName;
                if (newIsolateScopeDirective === directive || directive.$$isolateScope) {
                  pre = cloneAndAnnotateFn(pre, {isolateScope: true});
                }
                preLinkFns.push(pre);
              }
              if (post) {
                if (attrStart)
                  post = groupElementsLinkFnWrapper(post, attrStart, attrEnd);
                post.require = directive.require;
                post.directiveName = directiveName;
                if (newIsolateScopeDirective === directive || directive.$$isolateScope) {
                  post = cloneAndAnnotateFn(post, {isolateScope: true});
                }
                postLinkFns.push(post);
              }
            }
            function getControllers(directiveName, require, $element, elementControllers) {
              var value;
              if (isString(require)) {
                var match = require.match(REQUIRE_PREFIX_REGEXP);
                var name = require.substring(match[0].length);
                var inheritType = match[1] || match[3];
                var optional = match[2] === '?';
                if (inheritType === '^^') {
                  $element = $element.parent();
                } else {
                  value = elementControllers && elementControllers[name];
                  value = value && value.instance;
                }
                if (!value) {
                  var dataName = '$' + name + 'Controller';
                  value = inheritType ? $element.inheritedData(dataName) : $element.data(dataName);
                }
                if (!value && !optional) {
                  throw $compileMinErr('ctreq', "Controller '{0}', required by directive '{1}', can't be found!", name, directiveName);
                }
              } else if (isArray(require)) {
                value = [];
                for (var i = 0,
                    ii = require.length; i < ii; i++) {
                  value[i] = getControllers(directiveName, require[i], $element, elementControllers);
                }
              }
              return value || null;
            }
            function setupControllers($element, attrs, transcludeFn, controllerDirectives, isolateScope, scope) {
              var elementControllers = createMap();
              for (var controllerKey in controllerDirectives) {
                var directive = controllerDirectives[controllerKey];
                var locals = {
                  $scope: directive === newIsolateScopeDirective || directive.$$isolateScope ? isolateScope : scope,
                  $element: $element,
                  $attrs: attrs,
                  $transclude: transcludeFn
                };
                var controller = directive.controller;
                if (controller == '@') {
                  controller = attrs[directive.name];
                }
                var controllerInstance = $controller(controller, locals, true, directive.controllerAs);
                elementControllers[directive.name] = controllerInstance;
                if (!hasElementTranscludeDirective) {
                  $element.data('$' + directive.name + 'Controller', controllerInstance.instance);
                }
              }
              return elementControllers;
            }
            function nodeLinkFn(childLinkFn, scope, linkNode, $rootElement, boundTranscludeFn) {
              var linkFn,
                  isolateScope,
                  controllerScope,
                  elementControllers,
                  transcludeFn,
                  $element,
                  attrs,
                  removeScopeBindingWatches,
                  removeControllerBindingWatches;
              if (compileNode === linkNode) {
                attrs = templateAttrs;
                $element = templateAttrs.$$element;
              } else {
                $element = jqLite(linkNode);
                attrs = new Attributes($element, templateAttrs);
              }
              controllerScope = scope;
              if (newIsolateScopeDirective) {
                isolateScope = scope.$new(true);
              } else if (newScopeDirective) {
                controllerScope = scope.$parent;
              }
              if (boundTranscludeFn) {
                transcludeFn = controllersBoundTransclude;
                transcludeFn.$$boundTransclude = boundTranscludeFn;
              }
              if (controllerDirectives) {
                elementControllers = setupControllers($element, attrs, transcludeFn, controllerDirectives, isolateScope, scope);
              }
              if (newIsolateScopeDirective) {
                compile.$$addScopeInfo($element, isolateScope, true, !(templateDirective && (templateDirective === newIsolateScopeDirective || templateDirective === newIsolateScopeDirective.$$originalDirective)));
                compile.$$addScopeClass($element, true);
                isolateScope.$$isolateBindings = newIsolateScopeDirective.$$isolateBindings;
                removeScopeBindingWatches = initializeDirectiveBindings(scope, attrs, isolateScope, isolateScope.$$isolateBindings, newIsolateScopeDirective);
                if (removeScopeBindingWatches) {
                  isolateScope.$on('$destroy', removeScopeBindingWatches);
                }
              }
              for (var name in elementControllers) {
                var controllerDirective = controllerDirectives[name];
                var controller = elementControllers[name];
                var bindings = controllerDirective.$$bindings.bindToController;
                if (controller.identifier && bindings) {
                  removeControllerBindingWatches = initializeDirectiveBindings(controllerScope, attrs, controller.instance, bindings, controllerDirective);
                }
                var controllerResult = controller();
                if (controllerResult !== controller.instance) {
                  controller.instance = controllerResult;
                  $element.data('$' + controllerDirective.name + 'Controller', controllerResult);
                  removeControllerBindingWatches && removeControllerBindingWatches();
                  removeControllerBindingWatches = initializeDirectiveBindings(controllerScope, attrs, controller.instance, bindings, controllerDirective);
                }
              }
              for (i = 0, ii = preLinkFns.length; i < ii; i++) {
                linkFn = preLinkFns[i];
                invokeLinkFn(linkFn, linkFn.isolateScope ? isolateScope : scope, $element, attrs, linkFn.require && getControllers(linkFn.directiveName, linkFn.require, $element, elementControllers), transcludeFn);
              }
              var scopeToChild = scope;
              if (newIsolateScopeDirective && (newIsolateScopeDirective.template || newIsolateScopeDirective.templateUrl === null)) {
                scopeToChild = isolateScope;
              }
              childLinkFn && childLinkFn(scopeToChild, linkNode.childNodes, undefined, boundTranscludeFn);
              for (i = postLinkFns.length - 1; i >= 0; i--) {
                linkFn = postLinkFns[i];
                invokeLinkFn(linkFn, linkFn.isolateScope ? isolateScope : scope, $element, attrs, linkFn.require && getControllers(linkFn.directiveName, linkFn.require, $element, elementControllers), transcludeFn);
              }
              function controllersBoundTransclude(scope, cloneAttachFn, futureParentElement) {
                var transcludeControllers;
                if (!isScope(scope)) {
                  futureParentElement = cloneAttachFn;
                  cloneAttachFn = scope;
                  scope = undefined;
                }
                if (hasElementTranscludeDirective) {
                  transcludeControllers = elementControllers;
                }
                if (!futureParentElement) {
                  futureParentElement = hasElementTranscludeDirective ? $element.parent() : $element;
                }
                return boundTranscludeFn(scope, cloneAttachFn, transcludeControllers, futureParentElement, scopeToChild);
              }
            }
          }
          function markDirectiveScope(directives, isolateScope, newScope) {
            for (var j = 0,
                jj = directives.length; j < jj; j++) {
              directives[j] = inherit(directives[j], {
                $$isolateScope: isolateScope,
                $$newScope: newScope
              });
            }
          }
          function addDirective(tDirectives, name, location, maxPriority, ignoreDirective, startAttrName, endAttrName) {
            if (name === ignoreDirective)
              return null;
            var match = null;
            if (hasDirectives.hasOwnProperty(name)) {
              for (var directive,
                  directives = $injector.get(name + Suffix),
                  i = 0,
                  ii = directives.length; i < ii; i++) {
                try {
                  directive = directives[i];
                  if ((isUndefined(maxPriority) || maxPriority > directive.priority) && directive.restrict.indexOf(location) != -1) {
                    if (startAttrName) {
                      directive = inherit(directive, {
                        $$start: startAttrName,
                        $$end: endAttrName
                      });
                    }
                    tDirectives.push(directive);
                    match = directive;
                  }
                } catch (e) {
                  $exceptionHandler(e);
                }
              }
            }
            return match;
          }
          function directiveIsMultiElement(name) {
            if (hasDirectives.hasOwnProperty(name)) {
              for (var directive,
                  directives = $injector.get(name + Suffix),
                  i = 0,
                  ii = directives.length; i < ii; i++) {
                directive = directives[i];
                if (directive.multiElement) {
                  return true;
                }
              }
            }
            return false;
          }
          function mergeTemplateAttributes(dst, src) {
            var srcAttr = src.$attr,
                dstAttr = dst.$attr,
                $element = dst.$$element;
            forEach(dst, function(value, key) {
              if (key.charAt(0) != '$') {
                if (src[key] && src[key] !== value) {
                  value += (key === 'style' ? ';' : ' ') + src[key];
                }
                dst.$set(key, value, true, srcAttr[key]);
              }
            });
            forEach(src, function(value, key) {
              if (key == 'class') {
                safeAddClass($element, value);
                dst['class'] = (dst['class'] ? dst['class'] + ' ' : '') + value;
              } else if (key == 'style') {
                $element.attr('style', $element.attr('style') + ';' + value);
                dst['style'] = (dst['style'] ? dst['style'] + ';' : '') + value;
              } else if (key.charAt(0) != '$' && !dst.hasOwnProperty(key)) {
                dst[key] = value;
                dstAttr[key] = srcAttr[key];
              }
            });
          }
          function compileTemplateUrl(directives, $compileNode, tAttrs, $rootElement, childTranscludeFn, preLinkFns, postLinkFns, previousCompileContext) {
            var linkQueue = [],
                afterTemplateNodeLinkFn,
                afterTemplateChildLinkFn,
                beforeTemplateCompileNode = $compileNode[0],
                origAsyncDirective = directives.shift(),
                derivedSyncDirective = inherit(origAsyncDirective, {
                  templateUrl: null,
                  transclude: null,
                  replace: null,
                  $$originalDirective: origAsyncDirective
                }),
                templateUrl = (isFunction(origAsyncDirective.templateUrl)) ? origAsyncDirective.templateUrl($compileNode, tAttrs) : origAsyncDirective.templateUrl,
                templateNamespace = origAsyncDirective.templateNamespace;
            $compileNode.empty();
            $templateRequest(templateUrl).then(function(content) {
              var compileNode,
                  tempTemplateAttrs,
                  $template,
                  childBoundTranscludeFn;
              content = denormalizeTemplate(content);
              if (origAsyncDirective.replace) {
                if (jqLiteIsTextNode(content)) {
                  $template = [];
                } else {
                  $template = removeComments(wrapTemplate(templateNamespace, trim(content)));
                }
                compileNode = $template[0];
                if ($template.length != 1 || compileNode.nodeType !== NODE_TYPE_ELEMENT) {
                  throw $compileMinErr('tplrt', "Template for directive '{0}' must have exactly one root element. {1}", origAsyncDirective.name, templateUrl);
                }
                tempTemplateAttrs = {$attr: {}};
                replaceWith($rootElement, $compileNode, compileNode);
                var templateDirectives = collectDirectives(compileNode, [], tempTemplateAttrs);
                if (isObject(origAsyncDirective.scope)) {
                  markDirectiveScope(templateDirectives, true);
                }
                directives = templateDirectives.concat(directives);
                mergeTemplateAttributes(tAttrs, tempTemplateAttrs);
              } else {
                compileNode = beforeTemplateCompileNode;
                $compileNode.html(content);
              }
              directives.unshift(derivedSyncDirective);
              afterTemplateNodeLinkFn = applyDirectivesToNode(directives, compileNode, tAttrs, childTranscludeFn, $compileNode, origAsyncDirective, preLinkFns, postLinkFns, previousCompileContext);
              forEach($rootElement, function(node, i) {
                if (node == compileNode) {
                  $rootElement[i] = $compileNode[0];
                }
              });
              afterTemplateChildLinkFn = compileNodes($compileNode[0].childNodes, childTranscludeFn);
              while (linkQueue.length) {
                var scope = linkQueue.shift(),
                    beforeTemplateLinkNode = linkQueue.shift(),
                    linkRootElement = linkQueue.shift(),
                    boundTranscludeFn = linkQueue.shift(),
                    linkNode = $compileNode[0];
                if (scope.$$destroyed)
                  continue;
                if (beforeTemplateLinkNode !== beforeTemplateCompileNode) {
                  var oldClasses = beforeTemplateLinkNode.className;
                  if (!(previousCompileContext.hasElementTranscludeDirective && origAsyncDirective.replace)) {
                    linkNode = jqLiteClone(compileNode);
                  }
                  replaceWith(linkRootElement, jqLite(beforeTemplateLinkNode), linkNode);
                  safeAddClass(jqLite(linkNode), oldClasses);
                }
                if (afterTemplateNodeLinkFn.transcludeOnThisElement) {
                  childBoundTranscludeFn = createBoundTranscludeFn(scope, afterTemplateNodeLinkFn.transclude, boundTranscludeFn);
                } else {
                  childBoundTranscludeFn = boundTranscludeFn;
                }
                afterTemplateNodeLinkFn(afterTemplateChildLinkFn, scope, linkNode, $rootElement, childBoundTranscludeFn);
              }
              linkQueue = null;
            });
            return function delayedNodeLinkFn(ignoreChildLinkFn, scope, node, rootElement, boundTranscludeFn) {
              var childBoundTranscludeFn = boundTranscludeFn;
              if (scope.$$destroyed)
                return;
              if (linkQueue) {
                linkQueue.push(scope, node, rootElement, childBoundTranscludeFn);
              } else {
                if (afterTemplateNodeLinkFn.transcludeOnThisElement) {
                  childBoundTranscludeFn = createBoundTranscludeFn(scope, afterTemplateNodeLinkFn.transclude, boundTranscludeFn);
                }
                afterTemplateNodeLinkFn(afterTemplateChildLinkFn, scope, node, rootElement, childBoundTranscludeFn);
              }
            };
          }
          function byPriority(a, b) {
            var diff = b.priority - a.priority;
            if (diff !== 0)
              return diff;
            if (a.name !== b.name)
              return (a.name < b.name) ? -1 : 1;
            return a.index - b.index;
          }
          function assertNoDuplicate(what, previousDirective, directive, element) {
            function wrapModuleNameIfDefined(moduleName) {
              return moduleName ? (' (module: ' + moduleName + ')') : '';
            }
            if (previousDirective) {
              throw $compileMinErr('multidir', 'Multiple directives [{0}{1}, {2}{3}] asking for {4} on: {5}', previousDirective.name, wrapModuleNameIfDefined(previousDirective.$$moduleName), directive.name, wrapModuleNameIfDefined(directive.$$moduleName), what, startingTag(element));
            }
          }
          function addTextInterpolateDirective(directives, text) {
            var interpolateFn = $interpolate(text, true);
            if (interpolateFn) {
              directives.push({
                priority: 0,
                compile: function textInterpolateCompileFn(templateNode) {
                  var templateNodeParent = templateNode.parent(),
                      hasCompileParent = !!templateNodeParent.length;
                  if (hasCompileParent)
                    compile.$$addBindingClass(templateNodeParent);
                  return function textInterpolateLinkFn(scope, node) {
                    var parent = node.parent();
                    if (!hasCompileParent)
                      compile.$$addBindingClass(parent);
                    compile.$$addBindingInfo(parent, interpolateFn.expressions);
                    scope.$watch(interpolateFn, function interpolateFnWatchAction(value) {
                      node[0].nodeValue = value;
                    });
                  };
                }
              });
            }
          }
          function wrapTemplate(type, template) {
            type = lowercase(type || 'html');
            switch (type) {
              case 'svg':
              case 'math':
                var wrapper = document.createElement('div');
                wrapper.innerHTML = '<' + type + '>' + template + '</' + type + '>';
                return wrapper.childNodes[0].childNodes;
              default:
                return template;
            }
          }
          function getTrustedContext(node, attrNormalizedName) {
            if (attrNormalizedName == "srcdoc") {
              return $sce.HTML;
            }
            var tag = nodeName_(node);
            if (attrNormalizedName == "xlinkHref" || (tag == "form" && attrNormalizedName == "action") || (tag != "img" && (attrNormalizedName == "src" || attrNormalizedName == "ngSrc"))) {
              return $sce.RESOURCE_URL;
            }
          }
          function addAttrInterpolateDirective(node, directives, value, name, allOrNothing) {
            var trustedContext = getTrustedContext(node, name);
            allOrNothing = ALL_OR_NOTHING_ATTRS[name] || allOrNothing;
            var interpolateFn = $interpolate(value, true, trustedContext, allOrNothing);
            if (!interpolateFn)
              return;
            if (name === "multiple" && nodeName_(node) === "select") {
              throw $compileMinErr("selmulti", "Binding to the 'multiple' attribute is not supported. Element: {0}", startingTag(node));
            }
            directives.push({
              priority: 100,
              compile: function() {
                return {pre: function attrInterpolatePreLinkFn(scope, element, attr) {
                    var $$observers = (attr.$$observers || (attr.$$observers = createMap()));
                    if (EVENT_HANDLER_ATTR_REGEXP.test(name)) {
                      throw $compileMinErr('nodomevents', "Interpolations for HTML DOM event attributes are disallowed.  Please use the " + "ng- versions (such as ng-click instead of onclick) instead.");
                    }
                    var newValue = attr[name];
                    if (newValue !== value) {
                      interpolateFn = newValue && $interpolate(newValue, true, trustedContext, allOrNothing);
                      value = newValue;
                    }
                    if (!interpolateFn)
                      return;
                    attr[name] = interpolateFn(scope);
                    ($$observers[name] || ($$observers[name] = [])).$$inter = true;
                    (attr.$$observers && attr.$$observers[name].$$scope || scope).$watch(interpolateFn, function interpolateFnWatchAction(newValue, oldValue) {
                      if (name === 'class' && newValue != oldValue) {
                        attr.$updateClass(newValue, oldValue);
                      } else {
                        attr.$set(name, newValue);
                      }
                    });
                  }};
              }
            });
          }
          function replaceWith($rootElement, elementsToRemove, newNode) {
            var firstElementToRemove = elementsToRemove[0],
                removeCount = elementsToRemove.length,
                parent = firstElementToRemove.parentNode,
                i,
                ii;
            if ($rootElement) {
              for (i = 0, ii = $rootElement.length; i < ii; i++) {
                if ($rootElement[i] == firstElementToRemove) {
                  $rootElement[i++] = newNode;
                  for (var j = i,
                      j2 = j + removeCount - 1,
                      jj = $rootElement.length; j < jj; j++, j2++) {
                    if (j2 < jj) {
                      $rootElement[j] = $rootElement[j2];
                    } else {
                      delete $rootElement[j];
                    }
                  }
                  $rootElement.length -= removeCount - 1;
                  if ($rootElement.context === firstElementToRemove) {
                    $rootElement.context = newNode;
                  }
                  break;
                }
              }
            }
            if (parent) {
              parent.replaceChild(newNode, firstElementToRemove);
            }
            var fragment = document.createDocumentFragment();
            fragment.appendChild(firstElementToRemove);
            if (jqLite.hasData(firstElementToRemove)) {
              jqLite.data(newNode, jqLite.data(firstElementToRemove));
              if (!jQuery) {
                delete jqLite.cache[firstElementToRemove[jqLite.expando]];
              } else {
                skipDestroyOnNextJQueryCleanData = true;
                jQuery.cleanData([firstElementToRemove]);
              }
            }
            for (var k = 1,
                kk = elementsToRemove.length; k < kk; k++) {
              var element = elementsToRemove[k];
              jqLite(element).remove();
              fragment.appendChild(element);
              delete elementsToRemove[k];
            }
            elementsToRemove[0] = newNode;
            elementsToRemove.length = 1;
          }
          function cloneAndAnnotateFn(fn, annotation) {
            return extend(function() {
              return fn.apply(null, arguments);
            }, fn, annotation);
          }
          function invokeLinkFn(linkFn, scope, $element, attrs, controllers, transcludeFn) {
            try {
              linkFn(scope, $element, attrs, controllers, transcludeFn);
            } catch (e) {
              $exceptionHandler(e, startingTag($element));
            }
          }
          function initializeDirectiveBindings(scope, attrs, destination, bindings, directive) {
            var removeWatchCollection = [];
            forEach(bindings, function(definition, scopeName) {
              var attrName = definition.attrName,
                  optional = definition.optional,
                  mode = definition.mode,
                  lastValue,
                  parentGet,
                  parentSet,
                  compare;
              switch (mode) {
                case '@':
                  if (!optional && !hasOwnProperty.call(attrs, attrName)) {
                    destination[scopeName] = attrs[attrName] = void 0;
                  }
                  attrs.$observe(attrName, function(value) {
                    if (isString(value)) {
                      destination[scopeName] = value;
                    }
                  });
                  attrs.$$observers[attrName].$$scope = scope;
                  if (isString(attrs[attrName])) {
                    destination[scopeName] = $interpolate(attrs[attrName])(scope);
                  }
                  break;
                case '=':
                  if (!hasOwnProperty.call(attrs, attrName)) {
                    if (optional)
                      break;
                    attrs[attrName] = void 0;
                  }
                  if (optional && !attrs[attrName])
                    break;
                  parentGet = $parse(attrs[attrName]);
                  if (parentGet.literal) {
                    compare = equals;
                  } else {
                    compare = function(a, b) {
                      return a === b || (a !== a && b !== b);
                    };
                  }
                  parentSet = parentGet.assign || function() {
                    lastValue = destination[scopeName] = parentGet(scope);
                    throw $compileMinErr('nonassign', "Expression '{0}' used with directive '{1}' is non-assignable!", attrs[attrName], directive.name);
                  };
                  lastValue = destination[scopeName] = parentGet(scope);
                  var parentValueWatch = function parentValueWatch(parentValue) {
                    if (!compare(parentValue, destination[scopeName])) {
                      if (!compare(parentValue, lastValue)) {
                        destination[scopeName] = parentValue;
                      } else {
                        parentSet(scope, parentValue = destination[scopeName]);
                      }
                    }
                    return lastValue = parentValue;
                  };
                  parentValueWatch.$stateful = true;
                  var removeWatch;
                  if (definition.collection) {
                    removeWatch = scope.$watchCollection(attrs[attrName], parentValueWatch);
                  } else {
                    removeWatch = scope.$watch($parse(attrs[attrName], parentValueWatch), null, parentGet.literal);
                  }
                  removeWatchCollection.push(removeWatch);
                  break;
                case '&':
                  parentGet = attrs.hasOwnProperty(attrName) ? $parse(attrs[attrName]) : noop;
                  if (parentGet === noop && optional)
                    break;
                  destination[scopeName] = function(locals) {
                    return parentGet(scope, locals);
                  };
                  break;
              }
            });
            return removeWatchCollection.length && function removeWatches() {
              for (var i = 0,
                  ii = removeWatchCollection.length; i < ii; ++i) {
                removeWatchCollection[i]();
              }
            };
          }
        }];
      }
      var PREFIX_REGEXP = /^((?:x|data)[\:\-_])/i;
      function directiveNormalize(name) {
        return camelCase(name.replace(PREFIX_REGEXP, ''));
      }
      function nodesetLinkingFn(scope, nodeList, rootElement, boundTranscludeFn) {}
      function directiveLinkingFn(nodesetLinkingFn, scope, node, rootElement, boundTranscludeFn) {}
      function tokenDifference(str1, str2) {
        var values = '',
            tokens1 = str1.split(/\s+/),
            tokens2 = str2.split(/\s+/);
        outer: for (var i = 0; i < tokens1.length; i++) {
          var token = tokens1[i];
          for (var j = 0; j < tokens2.length; j++) {
            if (token == tokens2[j])
              continue outer;
          }
          values += (values.length > 0 ? ' ' : '') + token;
        }
        return values;
      }
      function removeComments(jqNodes) {
        jqNodes = jqLite(jqNodes);
        var i = jqNodes.length;
        if (i <= 1) {
          return jqNodes;
        }
        while (i--) {
          var node = jqNodes[i];
          if (node.nodeType === NODE_TYPE_COMMENT) {
            splice.call(jqNodes, i, 1);
          }
        }
        return jqNodes;
      }
      var $controllerMinErr = minErr('$controller');
      var CNTRL_REG = /^(\S+)(\s+as\s+(\w+))?$/;
      function identifierForController(controller, ident) {
        if (ident && isString(ident))
          return ident;
        if (isString(controller)) {
          var match = CNTRL_REG.exec(controller);
          if (match)
            return match[3];
        }
      }
      function $ControllerProvider() {
        var controllers = {},
            globals = false;
        this.register = function(name, constructor) {
          assertNotHasOwnProperty(name, 'controller');
          if (isObject(name)) {
            extend(controllers, name);
          } else {
            controllers[name] = constructor;
          }
        };
        this.allowGlobals = function() {
          globals = true;
        };
        this.$get = ['$injector', '$window', function($injector, $window) {
          return function(expression, locals, later, ident) {
            var instance,
                match,
                constructor,
                identifier;
            later = later === true;
            if (ident && isString(ident)) {
              identifier = ident;
            }
            if (isString(expression)) {
              match = expression.match(CNTRL_REG);
              if (!match) {
                throw $controllerMinErr('ctrlfmt', "Badly formed controller string '{0}'. " + "Must match `__name__ as __id__` or `__name__`.", expression);
              }
              constructor = match[1], identifier = identifier || match[3];
              expression = controllers.hasOwnProperty(constructor) ? controllers[constructor] : getter(locals.$scope, constructor, true) || (globals ? getter($window, constructor, true) : undefined);
              assertArgFn(expression, constructor, true);
            }
            if (later) {
              var controllerPrototype = (isArray(expression) ? expression[expression.length - 1] : expression).prototype;
              instance = Object.create(controllerPrototype || null);
              if (identifier) {
                addIdentifier(locals, identifier, instance, constructor || expression.name);
              }
              var instantiate;
              return instantiate = extend(function() {
                var result = $injector.invoke(expression, instance, locals, constructor);
                if (result !== instance && (isObject(result) || isFunction(result))) {
                  instance = result;
                  if (identifier) {
                    addIdentifier(locals, identifier, instance, constructor || expression.name);
                  }
                }
                return instance;
              }, {
                instance: instance,
                identifier: identifier
              });
            }
            instance = $injector.instantiate(expression, locals, constructor);
            if (identifier) {
              addIdentifier(locals, identifier, instance, constructor || expression.name);
            }
            return instance;
          };
          function addIdentifier(locals, identifier, instance, name) {
            if (!(locals && isObject(locals.$scope))) {
              throw minErr('$controller')('noscp', "Cannot export controller '{0}' as '{1}'! No $scope object provided via `locals`.", name, identifier);
            }
            locals.$scope[identifier] = instance;
          }
        }];
      }
      function $DocumentProvider() {
        this.$get = ['$window', function(window) {
          return jqLite(window.document);
        }];
      }
      function $ExceptionHandlerProvider() {
        this.$get = ['$log', function($log) {
          return function(exception, cause) {
            $log.error.apply($log, arguments);
          };
        }];
      }
      var $$ForceReflowProvider = function() {
        this.$get = ['$document', function($document) {
          return function(domNode) {
            if (domNode) {
              if (!domNode.nodeType && domNode instanceof jqLite) {
                domNode = domNode[0];
              }
            } else {
              domNode = $document[0].body;
            }
            return domNode.offsetWidth + 1;
          };
        }];
      };
      var APPLICATION_JSON = 'application/json';
      var CONTENT_TYPE_APPLICATION_JSON = {'Content-Type': APPLICATION_JSON + ';charset=utf-8'};
      var JSON_START = /^\[|^\{(?!\{)/;
      var JSON_ENDS = {
        '[': /]$/,
        '{': /}$/
      };
      var JSON_PROTECTION_PREFIX = /^\)\]\}',?\n/;
      var $httpMinErr = minErr('$http');
      var $httpMinErrLegacyFn = function(method) {
        return function() {
          throw $httpMinErr('legacy', 'The method `{0}` on the promise returned from `$http` has been disabled.', method);
        };
      };
      function serializeValue(v) {
        if (isObject(v)) {
          return isDate(v) ? v.toISOString() : toJson(v);
        }
        return v;
      }
      function $HttpParamSerializerProvider() {
        this.$get = function() {
          return function ngParamSerializer(params) {
            if (!params)
              return '';
            var parts = [];
            forEachSorted(params, function(value, key) {
              if (value === null || isUndefined(value))
                return;
              if (isArray(value)) {
                forEach(value, function(v, k) {
                  parts.push(encodeUriQuery(key) + '=' + encodeUriQuery(serializeValue(v)));
                });
              } else {
                parts.push(encodeUriQuery(key) + '=' + encodeUriQuery(serializeValue(value)));
              }
            });
            return parts.join('&');
          };
        };
      }
      function $HttpParamSerializerJQLikeProvider() {
        this.$get = function() {
          return function jQueryLikeParamSerializer(params) {
            if (!params)
              return '';
            var parts = [];
            serialize(params, '', true);
            return parts.join('&');
            function serialize(toSerialize, prefix, topLevel) {
              if (toSerialize === null || isUndefined(toSerialize))
                return;
              if (isArray(toSerialize)) {
                forEach(toSerialize, function(value, index) {
                  serialize(value, prefix + '[' + (isObject(value) ? index : '') + ']');
                });
              } else if (isObject(toSerialize) && !isDate(toSerialize)) {
                forEachSorted(toSerialize, function(value, key) {
                  serialize(value, prefix + (topLevel ? '' : '[') + key + (topLevel ? '' : ']'));
                });
              } else {
                parts.push(encodeUriQuery(prefix) + '=' + encodeUriQuery(serializeValue(toSerialize)));
              }
            }
          };
        };
      }
      function defaultHttpResponseTransform(data, headers) {
        if (isString(data)) {
          var tempData = data.replace(JSON_PROTECTION_PREFIX, '').trim();
          if (tempData) {
            var contentType = headers('Content-Type');
            if ((contentType && (contentType.indexOf(APPLICATION_JSON) === 0)) || isJsonLike(tempData)) {
              data = fromJson(tempData);
            }
          }
        }
        return data;
      }
      function isJsonLike(str) {
        var jsonStart = str.match(JSON_START);
        return jsonStart && JSON_ENDS[jsonStart[0]].test(str);
      }
      function parseHeaders(headers) {
        var parsed = createMap(),
            i;
        function fillInParsed(key, val) {
          if (key) {
            parsed[key] = parsed[key] ? parsed[key] + ', ' + val : val;
          }
        }
        if (isString(headers)) {
          forEach(headers.split('\n'), function(line) {
            i = line.indexOf(':');
            fillInParsed(lowercase(trim(line.substr(0, i))), trim(line.substr(i + 1)));
          });
        } else if (isObject(headers)) {
          forEach(headers, function(headerVal, headerKey) {
            fillInParsed(lowercase(headerKey), trim(headerVal));
          });
        }
        return parsed;
      }
      function headersGetter(headers) {
        var headersObj;
        return function(name) {
          if (!headersObj)
            headersObj = parseHeaders(headers);
          if (name) {
            var value = headersObj[lowercase(name)];
            if (value === void 0) {
              value = null;
            }
            return value;
          }
          return headersObj;
        };
      }
      function transformData(data, headers, status, fns) {
        if (isFunction(fns)) {
          return fns(data, headers, status);
        }
        forEach(fns, function(fn) {
          data = fn(data, headers, status);
        });
        return data;
      }
      function isSuccess(status) {
        return 200 <= status && status < 300;
      }
      function $HttpProvider() {
        var defaults = this.defaults = {
          transformResponse: [defaultHttpResponseTransform],
          transformRequest: [function(d) {
            return isObject(d) && !isFile(d) && !isBlob(d) && !isFormData(d) ? toJson(d) : d;
          }],
          headers: {
            common: {'Accept': 'application/json, text/plain, */*'},
            post: shallowCopy(CONTENT_TYPE_APPLICATION_JSON),
            put: shallowCopy(CONTENT_TYPE_APPLICATION_JSON),
            patch: shallowCopy(CONTENT_TYPE_APPLICATION_JSON)
          },
          xsrfCookieName: 'XSRF-TOKEN',
          xsrfHeaderName: 'X-XSRF-TOKEN',
          paramSerializer: '$httpParamSerializer'
        };
        var useApplyAsync = false;
        this.useApplyAsync = function(value) {
          if (isDefined(value)) {
            useApplyAsync = !!value;
            return this;
          }
          return useApplyAsync;
        };
        var useLegacyPromise = true;
        this.useLegacyPromiseExtensions = function(value) {
          if (isDefined(value)) {
            useLegacyPromise = !!value;
            return this;
          }
          return useLegacyPromise;
        };
        var interceptorFactories = this.interceptors = [];
        this.$get = ['$httpBackend', '$$cookieReader', '$cacheFactory', '$rootScope', '$q', '$injector', function($httpBackend, $$cookieReader, $cacheFactory, $rootScope, $q, $injector) {
          var defaultCache = $cacheFactory('$http');
          defaults.paramSerializer = isString(defaults.paramSerializer) ? $injector.get(defaults.paramSerializer) : defaults.paramSerializer;
          var reversedInterceptors = [];
          forEach(interceptorFactories, function(interceptorFactory) {
            reversedInterceptors.unshift(isString(interceptorFactory) ? $injector.get(interceptorFactory) : $injector.invoke(interceptorFactory));
          });
          function $http(requestConfig) {
            if (!angular.isObject(requestConfig)) {
              throw minErr('$http')('badreq', 'Http request configuration must be an object.  Received: {0}', requestConfig);
            }
            var config = extend({
              method: 'get',
              transformRequest: defaults.transformRequest,
              transformResponse: defaults.transformResponse,
              paramSerializer: defaults.paramSerializer
            }, requestConfig);
            config.headers = mergeHeaders(requestConfig);
            config.method = uppercase(config.method);
            config.paramSerializer = isString(config.paramSerializer) ? $injector.get(config.paramSerializer) : config.paramSerializer;
            var serverRequest = function(config) {
              var headers = config.headers;
              var reqData = transformData(config.data, headersGetter(headers), undefined, config.transformRequest);
              if (isUndefined(reqData)) {
                forEach(headers, function(value, header) {
                  if (lowercase(header) === 'content-type') {
                    delete headers[header];
                  }
                });
              }
              if (isUndefined(config.withCredentials) && !isUndefined(defaults.withCredentials)) {
                config.withCredentials = defaults.withCredentials;
              }
              return sendReq(config, reqData).then(transformResponse, transformResponse);
            };
            var chain = [serverRequest, undefined];
            var promise = $q.when(config);
            forEach(reversedInterceptors, function(interceptor) {
              if (interceptor.request || interceptor.requestError) {
                chain.unshift(interceptor.request, interceptor.requestError);
              }
              if (interceptor.response || interceptor.responseError) {
                chain.push(interceptor.response, interceptor.responseError);
              }
            });
            while (chain.length) {
              var thenFn = chain.shift();
              var rejectFn = chain.shift();
              promise = promise.then(thenFn, rejectFn);
            }
            if (useLegacyPromise) {
              promise.success = function(fn) {
                assertArgFn(fn, 'fn');
                promise.then(function(response) {
                  fn(response.data, response.status, response.headers, config);
                });
                return promise;
              };
              promise.error = function(fn) {
                assertArgFn(fn, 'fn');
                promise.then(null, function(response) {
                  fn(response.data, response.status, response.headers, config);
                });
                return promise;
              };
            } else {
              promise.success = $httpMinErrLegacyFn('success');
              promise.error = $httpMinErrLegacyFn('error');
            }
            return promise;
            function transformResponse(response) {
              var resp = extend({}, response);
              resp.data = transformData(response.data, response.headers, response.status, config.transformResponse);
              return (isSuccess(response.status)) ? resp : $q.reject(resp);
            }
            function executeHeaderFns(headers, config) {
              var headerContent,
                  processedHeaders = {};
              forEach(headers, function(headerFn, header) {
                if (isFunction(headerFn)) {
                  headerContent = headerFn(config);
                  if (headerContent != null) {
                    processedHeaders[header] = headerContent;
                  }
                } else {
                  processedHeaders[header] = headerFn;
                }
              });
              return processedHeaders;
            }
            function mergeHeaders(config) {
              var defHeaders = defaults.headers,
                  reqHeaders = extend({}, config.headers),
                  defHeaderName,
                  lowercaseDefHeaderName,
                  reqHeaderName;
              defHeaders = extend({}, defHeaders.common, defHeaders[lowercase(config.method)]);
              defaultHeadersIteration: for (defHeaderName in defHeaders) {
                lowercaseDefHeaderName = lowercase(defHeaderName);
                for (reqHeaderName in reqHeaders) {
                  if (lowercase(reqHeaderName) === lowercaseDefHeaderName) {
                    continue defaultHeadersIteration;
                  }
                }
                reqHeaders[defHeaderName] = defHeaders[defHeaderName];
              }
              return executeHeaderFns(reqHeaders, shallowCopy(config));
            }
          }
          $http.pendingRequests = [];
          createShortMethods('get', 'delete', 'head', 'jsonp');
          createShortMethodsWithData('post', 'put', 'patch');
          $http.defaults = defaults;
          return $http;
          function createShortMethods(names) {
            forEach(arguments, function(name) {
              $http[name] = function(url, config) {
                return $http(extend({}, config || {}, {
                  method: name,
                  url: url
                }));
              };
            });
          }
          function createShortMethodsWithData(name) {
            forEach(arguments, function(name) {
              $http[name] = function(url, data, config) {
                return $http(extend({}, config || {}, {
                  method: name,
                  url: url,
                  data: data
                }));
              };
            });
          }
          function sendReq(config, reqData) {
            var deferred = $q.defer(),
                promise = deferred.promise,
                cache,
                cachedResp,
                reqHeaders = config.headers,
                url = buildUrl(config.url, config.paramSerializer(config.params));
            $http.pendingRequests.push(config);
            promise.then(removePendingReq, removePendingReq);
            if ((config.cache || defaults.cache) && config.cache !== false && (config.method === 'GET' || config.method === 'JSONP')) {
              cache = isObject(config.cache) ? config.cache : isObject(defaults.cache) ? defaults.cache : defaultCache;
            }
            if (cache) {
              cachedResp = cache.get(url);
              if (isDefined(cachedResp)) {
                if (isPromiseLike(cachedResp)) {
                  cachedResp.then(resolvePromiseWithResult, resolvePromiseWithResult);
                } else {
                  if (isArray(cachedResp)) {
                    resolvePromise(cachedResp[1], cachedResp[0], shallowCopy(cachedResp[2]), cachedResp[3]);
                  } else {
                    resolvePromise(cachedResp, 200, {}, 'OK');
                  }
                }
              } else {
                cache.put(url, promise);
              }
            }
            if (isUndefined(cachedResp)) {
              var xsrfValue = urlIsSameOrigin(config.url) ? $$cookieReader()[config.xsrfCookieName || defaults.xsrfCookieName] : undefined;
              if (xsrfValue) {
                reqHeaders[(config.xsrfHeaderName || defaults.xsrfHeaderName)] = xsrfValue;
              }
              $httpBackend(config.method, url, reqData, done, reqHeaders, config.timeout, config.withCredentials, config.responseType);
            }
            return promise;
            function done(status, response, headersString, statusText) {
              if (cache) {
                if (isSuccess(status)) {
                  cache.put(url, [status, response, parseHeaders(headersString), statusText]);
                } else {
                  cache.remove(url);
                }
              }
              function resolveHttpPromise() {
                resolvePromise(response, status, headersString, statusText);
              }
              if (useApplyAsync) {
                $rootScope.$applyAsync(resolveHttpPromise);
              } else {
                resolveHttpPromise();
                if (!$rootScope.$$phase)
                  $rootScope.$apply();
              }
            }
            function resolvePromise(response, status, headers, statusText) {
              status = status >= -1 ? status : 0;
              (isSuccess(status) ? deferred.resolve : deferred.reject)({
                data: response,
                status: status,
                headers: headersGetter(headers),
                config: config,
                statusText: statusText
              });
            }
            function resolvePromiseWithResult(result) {
              resolvePromise(result.data, result.status, shallowCopy(result.headers()), result.statusText);
            }
            function removePendingReq() {
              var idx = $http.pendingRequests.indexOf(config);
              if (idx !== -1)
                $http.pendingRequests.splice(idx, 1);
            }
          }
          function buildUrl(url, serializedParams) {
            if (serializedParams.length > 0) {
              url += ((url.indexOf('?') == -1) ? '?' : '&') + serializedParams;
            }
            return url;
          }
        }];
      }
      function $xhrFactoryProvider() {
        this.$get = function() {
          return function createXhr() {
            return new window.XMLHttpRequest();
          };
        };
      }
      function $HttpBackendProvider() {
        this.$get = ['$browser', '$window', '$document', '$xhrFactory', function($browser, $window, $document, $xhrFactory) {
          return createHttpBackend($browser, $xhrFactory, $browser.defer, $window.angular.callbacks, $document[0]);
        }];
      }
      function createHttpBackend($browser, createXhr, $browserDefer, callbacks, rawDocument) {
        return function(method, url, post, callback, headers, timeout, withCredentials, responseType) {
          $browser.$$incOutstandingRequestCount();
          url = url || $browser.url();
          if (lowercase(method) == 'jsonp') {
            var callbackId = '_' + (callbacks.counter++).toString(36);
            callbacks[callbackId] = function(data) {
              callbacks[callbackId].data = data;
              callbacks[callbackId].called = true;
            };
            var jsonpDone = jsonpReq(url.replace('JSON_CALLBACK', 'angular.callbacks.' + callbackId), callbackId, function(status, text) {
              completeRequest(callback, status, callbacks[callbackId].data, "", text);
              callbacks[callbackId] = noop;
            });
          } else {
            var xhr = createXhr(method, url);
            xhr.open(method, url, true);
            forEach(headers, function(value, key) {
              if (isDefined(value)) {
                xhr.setRequestHeader(key, value);
              }
            });
            xhr.onload = function requestLoaded() {
              var statusText = xhr.statusText || '';
              var response = ('response' in xhr) ? xhr.response : xhr.responseText;
              var status = xhr.status === 1223 ? 204 : xhr.status;
              if (status === 0) {
                status = response ? 200 : urlResolve(url).protocol == 'file' ? 404 : 0;
              }
              completeRequest(callback, status, response, xhr.getAllResponseHeaders(), statusText);
            };
            var requestError = function() {
              completeRequest(callback, -1, null, null, '');
            };
            xhr.onerror = requestError;
            xhr.onabort = requestError;
            if (withCredentials) {
              xhr.withCredentials = true;
            }
            if (responseType) {
              try {
                xhr.responseType = responseType;
              } catch (e) {
                if (responseType !== 'json') {
                  throw e;
                }
              }
            }
            xhr.send(isUndefined(post) ? null : post);
          }
          if (timeout > 0) {
            var timeoutId = $browserDefer(timeoutRequest, timeout);
          } else if (isPromiseLike(timeout)) {
            timeout.then(timeoutRequest);
          }
          function timeoutRequest() {
            jsonpDone && jsonpDone();
            xhr && xhr.abort();
          }
          function completeRequest(callback, status, response, headersString, statusText) {
            if (isDefined(timeoutId)) {
              $browserDefer.cancel(timeoutId);
            }
            jsonpDone = xhr = null;
            callback(status, response, headersString, statusText);
            $browser.$$completeOutstandingRequest(noop);
          }
        };
        function jsonpReq(url, callbackId, done) {
          var script = rawDocument.createElement('script'),
              callback = null;
          script.type = "text/javascript";
          script.src = url;
          script.async = true;
          callback = function(event) {
            removeEventListenerFn(script, "load", callback);
            removeEventListenerFn(script, "error", callback);
            rawDocument.body.removeChild(script);
            script = null;
            var status = -1;
            var text = "unknown";
            if (event) {
              if (event.type === "load" && !callbacks[callbackId].called) {
                event = {type: "error"};
              }
              text = event.type;
              status = event.type === "error" ? 404 : 200;
            }
            if (done) {
              done(status, text);
            }
          };
          addEventListenerFn(script, "load", callback);
          addEventListenerFn(script, "error", callback);
          rawDocument.body.appendChild(script);
          return callback;
        }
      }
      var $interpolateMinErr = angular.$interpolateMinErr = minErr('$interpolate');
      $interpolateMinErr.throwNoconcat = function(text) {
        throw $interpolateMinErr('noconcat', "Error while interpolating: {0}\nStrict Contextual Escaping disallows " + "interpolations that concatenate multiple expressions when a trusted value is " + "required.  See http://docs.angularjs.org/api/ng.$sce", text);
      };
      $interpolateMinErr.interr = function(text, err) {
        return $interpolateMinErr('interr', "Can't interpolate: {0}\n{1}", text, err.toString());
      };
      function $InterpolateProvider() {
        var startSymbol = '{{';
        var endSymbol = '}}';
        this.startSymbol = function(value) {
          if (value) {
            startSymbol = value;
            return this;
          } else {
            return startSymbol;
          }
        };
        this.endSymbol = function(value) {
          if (value) {
            endSymbol = value;
            return this;
          } else {
            return endSymbol;
          }
        };
        this.$get = ['$parse', '$exceptionHandler', '$sce', function($parse, $exceptionHandler, $sce) {
          var startSymbolLength = startSymbol.length,
              endSymbolLength = endSymbol.length,
              escapedStartRegexp = new RegExp(startSymbol.replace(/./g, escape), 'g'),
              escapedEndRegexp = new RegExp(endSymbol.replace(/./g, escape), 'g');
          function escape(ch) {
            return '\\\\\\' + ch;
          }
          function unescapeText(text) {
            return text.replace(escapedStartRegexp, startSymbol).replace(escapedEndRegexp, endSymbol);
          }
          function stringify(value) {
            if (value == null) {
              return '';
            }
            switch (typeof value) {
              case 'string':
                break;
              case 'number':
                value = '' + value;
                break;
              default:
                value = toJson(value);
            }
            return value;
          }
          function $interpolate(text, mustHaveExpression, trustedContext, allOrNothing) {
            allOrNothing = !!allOrNothing;
            var startIndex,
                endIndex,
                index = 0,
                expressions = [],
                parseFns = [],
                textLength = text.length,
                exp,
                concat = [],
                expressionPositions = [];
            while (index < textLength) {
              if (((startIndex = text.indexOf(startSymbol, index)) != -1) && ((endIndex = text.indexOf(endSymbol, startIndex + startSymbolLength)) != -1)) {
                if (index !== startIndex) {
                  concat.push(unescapeText(text.substring(index, startIndex)));
                }
                exp = text.substring(startIndex + startSymbolLength, endIndex);
                expressions.push(exp);
                parseFns.push($parse(exp, parseStringifyInterceptor));
                index = endIndex + endSymbolLength;
                expressionPositions.push(concat.length);
                concat.push('');
              } else {
                if (index !== textLength) {
                  concat.push(unescapeText(text.substring(index)));
                }
                break;
              }
            }
            if (trustedContext && concat.length > 1) {
              $interpolateMinErr.throwNoconcat(text);
            }
            if (!mustHaveExpression || expressions.length) {
              var compute = function(values) {
                for (var i = 0,
                    ii = expressions.length; i < ii; i++) {
                  if (allOrNothing && isUndefined(values[i]))
                    return;
                  concat[expressionPositions[i]] = values[i];
                }
                return concat.join('');
              };
              var getValue = function(value) {
                return trustedContext ? $sce.getTrusted(trustedContext, value) : $sce.valueOf(value);
              };
              return extend(function interpolationFn(context) {
                var i = 0;
                var ii = expressions.length;
                var values = new Array(ii);
                try {
                  for (; i < ii; i++) {
                    values[i] = parseFns[i](context);
                  }
                  return compute(values);
                } catch (err) {
                  $exceptionHandler($interpolateMinErr.interr(text, err));
                }
              }, {
                exp: text,
                expressions: expressions,
                $$watchDelegate: function(scope, listener) {
                  var lastValue;
                  return scope.$watchGroup(parseFns, function interpolateFnWatcher(values, oldValues) {
                    var currValue = compute(values);
                    if (isFunction(listener)) {
                      listener.call(this, currValue, values !== oldValues ? lastValue : currValue, scope);
                    }
                    lastValue = currValue;
                  });
                }
              });
            }
            function parseStringifyInterceptor(value) {
              try {
                value = getValue(value);
                return allOrNothing && !isDefined(value) ? value : stringify(value);
              } catch (err) {
                $exceptionHandler($interpolateMinErr.interr(text, err));
              }
            }
          }
          $interpolate.startSymbol = function() {
            return startSymbol;
          };
          $interpolate.endSymbol = function() {
            return endSymbol;
          };
          return $interpolate;
        }];
      }
      function $IntervalProvider() {
        this.$get = ['$rootScope', '$window', '$q', '$$q', function($rootScope, $window, $q, $$q) {
          var intervals = {};
          function interval(fn, delay, count, invokeApply) {
            var hasParams = arguments.length > 4,
                args = hasParams ? sliceArgs(arguments, 4) : [],
                setInterval = $window.setInterval,
                clearInterval = $window.clearInterval,
                iteration = 0,
                skipApply = (isDefined(invokeApply) && !invokeApply),
                deferred = (skipApply ? $$q : $q).defer(),
                promise = deferred.promise;
            count = isDefined(count) ? count : 0;
            promise.then(null, null, (!hasParams) ? fn : function() {
              fn.apply(null, args);
            });
            promise.$$intervalId = setInterval(function tick() {
              deferred.notify(iteration++);
              if (count > 0 && iteration >= count) {
                deferred.resolve(iteration);
                clearInterval(promise.$$intervalId);
                delete intervals[promise.$$intervalId];
              }
              if (!skipApply)
                $rootScope.$apply();
            }, delay);
            intervals[promise.$$intervalId] = deferred;
            return promise;
          }
          interval.cancel = function(promise) {
            if (promise && promise.$$intervalId in intervals) {
              intervals[promise.$$intervalId].reject('canceled');
              $window.clearInterval(promise.$$intervalId);
              delete intervals[promise.$$intervalId];
              return true;
            }
            return false;
          };
          return interval;
        }];
      }
      var PATH_MATCH = /^([^\?#]*)(\?([^#]*))?(#(.*))?$/,
          DEFAULT_PORTS = {
            'http': 80,
            'https': 443,
            'ftp': 21
          };
      var $locationMinErr = minErr('$location');
      function encodePath(path) {
        var segments = path.split('/'),
            i = segments.length;
        while (i--) {
          segments[i] = encodeUriSegment(segments[i]);
        }
        return segments.join('/');
      }
      function parseAbsoluteUrl(absoluteUrl, locationObj) {
        var parsedUrl = urlResolve(absoluteUrl);
        locationObj.$$protocol = parsedUrl.protocol;
        locationObj.$$host = parsedUrl.hostname;
        locationObj.$$port = toInt(parsedUrl.port) || DEFAULT_PORTS[parsedUrl.protocol] || null;
      }
      function parseAppUrl(relativeUrl, locationObj) {
        var prefixed = (relativeUrl.charAt(0) !== '/');
        if (prefixed) {
          relativeUrl = '/' + relativeUrl;
        }
        var match = urlResolve(relativeUrl);
        locationObj.$$path = decodeURIComponent(prefixed && match.pathname.charAt(0) === '/' ? match.pathname.substring(1) : match.pathname);
        locationObj.$$search = parseKeyValue(match.search);
        locationObj.$$hash = decodeURIComponent(match.hash);
        if (locationObj.$$path && locationObj.$$path.charAt(0) != '/') {
          locationObj.$$path = '/' + locationObj.$$path;
        }
      }
      function beginsWith(begin, whole) {
        if (whole.indexOf(begin) === 0) {
          return whole.substr(begin.length);
        }
      }
      function stripHash(url) {
        var index = url.indexOf('#');
        return index == -1 ? url : url.substr(0, index);
      }
      function trimEmptyHash(url) {
        return url.replace(/(#.+)|#$/, '$1');
      }
      function stripFile(url) {
        return url.substr(0, stripHash(url).lastIndexOf('/') + 1);
      }
      function serverBase(url) {
        return url.substring(0, url.indexOf('/', url.indexOf('//') + 2));
      }
      function LocationHtml5Url(appBase, appBaseNoFile, basePrefix) {
        this.$$html5 = true;
        basePrefix = basePrefix || '';
        parseAbsoluteUrl(appBase, this);
        this.$$parse = function(url) {
          var pathUrl = beginsWith(appBaseNoFile, url);
          if (!isString(pathUrl)) {
            throw $locationMinErr('ipthprfx', 'Invalid url "{0}", missing path prefix "{1}".', url, appBaseNoFile);
          }
          parseAppUrl(pathUrl, this);
          if (!this.$$path) {
            this.$$path = '/';
          }
          this.$$compose();
        };
        this.$$compose = function() {
          var search = toKeyValue(this.$$search),
              hash = this.$$hash ? '#' + encodeUriSegment(this.$$hash) : '';
          this.$$url = encodePath(this.$$path) + (search ? '?' + search : '') + hash;
          this.$$absUrl = appBaseNoFile + this.$$url.substr(1);
        };
        this.$$parseLinkUrl = function(url, relHref) {
          if (relHref && relHref[0] === '#') {
            this.hash(relHref.slice(1));
            return true;
          }
          var appUrl,
              prevAppUrl;
          var rewrittenUrl;
          if (isDefined(appUrl = beginsWith(appBase, url))) {
            prevAppUrl = appUrl;
            if (isDefined(appUrl = beginsWith(basePrefix, appUrl))) {
              rewrittenUrl = appBaseNoFile + (beginsWith('/', appUrl) || appUrl);
            } else {
              rewrittenUrl = appBase + prevAppUrl;
            }
          } else if (isDefined(appUrl = beginsWith(appBaseNoFile, url))) {
            rewrittenUrl = appBaseNoFile + appUrl;
          } else if (appBaseNoFile == url + '/') {
            rewrittenUrl = appBaseNoFile;
          }
          if (rewrittenUrl) {
            this.$$parse(rewrittenUrl);
          }
          return !!rewrittenUrl;
        };
      }
      function LocationHashbangUrl(appBase, appBaseNoFile, hashPrefix) {
        parseAbsoluteUrl(appBase, this);
        this.$$parse = function(url) {
          var withoutBaseUrl = beginsWith(appBase, url) || beginsWith(appBaseNoFile, url);
          var withoutHashUrl;
          if (!isUndefined(withoutBaseUrl) && withoutBaseUrl.charAt(0) === '#') {
            withoutHashUrl = beginsWith(hashPrefix, withoutBaseUrl);
            if (isUndefined(withoutHashUrl)) {
              withoutHashUrl = withoutBaseUrl;
            }
          } else {
            if (this.$$html5) {
              withoutHashUrl = withoutBaseUrl;
            } else {
              withoutHashUrl = '';
              if (isUndefined(withoutBaseUrl)) {
                appBase = url;
                this.replace();
              }
            }
          }
          parseAppUrl(withoutHashUrl, this);
          this.$$path = removeWindowsDriveName(this.$$path, withoutHashUrl, appBase);
          this.$$compose();
          function removeWindowsDriveName(path, url, base) {
            var windowsFilePathExp = /^\/[A-Z]:(\/.*)/;
            var firstPathSegmentMatch;
            if (url.indexOf(base) === 0) {
              url = url.replace(base, '');
            }
            if (windowsFilePathExp.exec(url)) {
              return path;
            }
            firstPathSegmentMatch = windowsFilePathExp.exec(path);
            return firstPathSegmentMatch ? firstPathSegmentMatch[1] : path;
          }
        };
        this.$$compose = function() {
          var search = toKeyValue(this.$$search),
              hash = this.$$hash ? '#' + encodeUriSegment(this.$$hash) : '';
          this.$$url = encodePath(this.$$path) + (search ? '?' + search : '') + hash;
          this.$$absUrl = appBase + (this.$$url ? hashPrefix + this.$$url : '');
        };
        this.$$parseLinkUrl = function(url, relHref) {
          if (stripHash(appBase) == stripHash(url)) {
            this.$$parse(url);
            return true;
          }
          return false;
        };
      }
      function LocationHashbangInHtml5Url(appBase, appBaseNoFile, hashPrefix) {
        this.$$html5 = true;
        LocationHashbangUrl.apply(this, arguments);
        this.$$parseLinkUrl = function(url, relHref) {
          if (relHref && relHref[0] === '#') {
            this.hash(relHref.slice(1));
            return true;
          }
          var rewrittenUrl;
          var appUrl;
          if (appBase == stripHash(url)) {
            rewrittenUrl = url;
          } else if ((appUrl = beginsWith(appBaseNoFile, url))) {
            rewrittenUrl = appBase + hashPrefix + appUrl;
          } else if (appBaseNoFile === url + '/') {
            rewrittenUrl = appBaseNoFile;
          }
          if (rewrittenUrl) {
            this.$$parse(rewrittenUrl);
          }
          return !!rewrittenUrl;
        };
        this.$$compose = function() {
          var search = toKeyValue(this.$$search),
              hash = this.$$hash ? '#' + encodeUriSegment(this.$$hash) : '';
          this.$$url = encodePath(this.$$path) + (search ? '?' + search : '') + hash;
          this.$$absUrl = appBase + hashPrefix + this.$$url;
        };
      }
      var locationPrototype = {
        $$html5: false,
        $$replace: false,
        absUrl: locationGetter('$$absUrl'),
        url: function(url) {
          if (isUndefined(url)) {
            return this.$$url;
          }
          var match = PATH_MATCH.exec(url);
          if (match[1] || url === '')
            this.path(decodeURIComponent(match[1]));
          if (match[2] || match[1] || url === '')
            this.search(match[3] || '');
          this.hash(match[5] || '');
          return this;
        },
        protocol: locationGetter('$$protocol'),
        host: locationGetter('$$host'),
        port: locationGetter('$$port'),
        path: locationGetterSetter('$$path', function(path) {
          path = path !== null ? path.toString() : '';
          return path.charAt(0) == '/' ? path : '/' + path;
        }),
        search: function(search, paramValue) {
          switch (arguments.length) {
            case 0:
              return this.$$search;
            case 1:
              if (isString(search) || isNumber(search)) {
                search = search.toString();
                this.$$search = parseKeyValue(search);
              } else if (isObject(search)) {
                search = copy(search, {});
                forEach(search, function(value, key) {
                  if (value == null)
                    delete search[key];
                });
                this.$$search = search;
              } else {
                throw $locationMinErr('isrcharg', 'The first argument of the `$location#search()` call must be a string or an object.');
              }
              break;
            default:
              if (isUndefined(paramValue) || paramValue === null) {
                delete this.$$search[search];
              } else {
                this.$$search[search] = paramValue;
              }
          }
          this.$$compose();
          return this;
        },
        hash: locationGetterSetter('$$hash', function(hash) {
          return hash !== null ? hash.toString() : '';
        }),
        replace: function() {
          this.$$replace = true;
          return this;
        }
      };
      forEach([LocationHashbangInHtml5Url, LocationHashbangUrl, LocationHtml5Url], function(Location) {
        Location.prototype = Object.create(locationPrototype);
        Location.prototype.state = function(state) {
          if (!arguments.length) {
            return this.$$state;
          }
          if (Location !== LocationHtml5Url || !this.$$html5) {
            throw $locationMinErr('nostate', 'History API state support is available only ' + 'in HTML5 mode and only in browsers supporting HTML5 History API');
          }
          this.$$state = isUndefined(state) ? null : state;
          return this;
        };
      });
      function locationGetter(property) {
        return function() {
          return this[property];
        };
      }
      function locationGetterSetter(property, preprocess) {
        return function(value) {
          if (isUndefined(value)) {
            return this[property];
          }
          this[property] = preprocess(value);
          this.$$compose();
          return this;
        };
      }
      function $LocationProvider() {
        var hashPrefix = '',
            html5Mode = {
              enabled: false,
              requireBase: true,
              rewriteLinks: true
            };
        this.hashPrefix = function(prefix) {
          if (isDefined(prefix)) {
            hashPrefix = prefix;
            return this;
          } else {
            return hashPrefix;
          }
        };
        this.html5Mode = function(mode) {
          if (isBoolean(mode)) {
            html5Mode.enabled = mode;
            return this;
          } else if (isObject(mode)) {
            if (isBoolean(mode.enabled)) {
              html5Mode.enabled = mode.enabled;
            }
            if (isBoolean(mode.requireBase)) {
              html5Mode.requireBase = mode.requireBase;
            }
            if (isBoolean(mode.rewriteLinks)) {
              html5Mode.rewriteLinks = mode.rewriteLinks;
            }
            return this;
          } else {
            return html5Mode;
          }
        };
        this.$get = ['$rootScope', '$browser', '$sniffer', '$rootElement', '$window', function($rootScope, $browser, $sniffer, $rootElement, $window) {
          var $location,
              LocationMode,
              baseHref = $browser.baseHref(),
              initialUrl = $browser.url(),
              appBase;
          if (html5Mode.enabled) {
            if (!baseHref && html5Mode.requireBase) {
              throw $locationMinErr('nobase', "$location in HTML5 mode requires a <base> tag to be present!");
            }
            appBase = serverBase(initialUrl) + (baseHref || '/');
            LocationMode = $sniffer.history ? LocationHtml5Url : LocationHashbangInHtml5Url;
          } else {
            appBase = stripHash(initialUrl);
            LocationMode = LocationHashbangUrl;
          }
          var appBaseNoFile = stripFile(appBase);
          $location = new LocationMode(appBase, appBaseNoFile, '#' + hashPrefix);
          $location.$$parseLinkUrl(initialUrl, initialUrl);
          $location.$$state = $browser.state();
          var IGNORE_URI_REGEXP = /^\s*(javascript|mailto):/i;
          function setBrowserUrlWithFallback(url, replace, state) {
            var oldUrl = $location.url();
            var oldState = $location.$$state;
            try {
              $browser.url(url, replace, state);
              $location.$$state = $browser.state();
            } catch (e) {
              $location.url(oldUrl);
              $location.$$state = oldState;
              throw e;
            }
          }
          $rootElement.on('click', function(event) {
            if (!html5Mode.rewriteLinks || event.ctrlKey || event.metaKey || event.shiftKey || event.which == 2 || event.button == 2)
              return;
            var elm = jqLite(event.target);
            while (nodeName_(elm[0]) !== 'a') {
              if (elm[0] === $rootElement[0] || !(elm = elm.parent())[0])
                return;
            }
            var absHref = elm.prop('href');
            var relHref = elm.attr('href') || elm.attr('xlink:href');
            if (isObject(absHref) && absHref.toString() === '[object SVGAnimatedString]') {
              absHref = urlResolve(absHref.animVal).href;
            }
            if (IGNORE_URI_REGEXP.test(absHref))
              return;
            if (absHref && !elm.attr('target') && !event.isDefaultPrevented()) {
              if ($location.$$parseLinkUrl(absHref, relHref)) {
                event.preventDefault();
                if ($location.absUrl() != $browser.url()) {
                  $rootScope.$apply();
                  $window.angular['ff-684208-preventDefault'] = true;
                }
              }
            }
          });
          if (trimEmptyHash($location.absUrl()) != trimEmptyHash(initialUrl)) {
            $browser.url($location.absUrl(), true);
          }
          var initializing = true;
          $browser.onUrlChange(function(newUrl, newState) {
            if (isUndefined(beginsWith(appBaseNoFile, newUrl))) {
              $window.location.href = newUrl;
              return;
            }
            $rootScope.$evalAsync(function() {
              var oldUrl = $location.absUrl();
              var oldState = $location.$$state;
              var defaultPrevented;
              newUrl = trimEmptyHash(newUrl);
              $location.$$parse(newUrl);
              $location.$$state = newState;
              defaultPrevented = $rootScope.$broadcast('$locationChangeStart', newUrl, oldUrl, newState, oldState).defaultPrevented;
              if ($location.absUrl() !== newUrl)
                return;
              if (defaultPrevented) {
                $location.$$parse(oldUrl);
                $location.$$state = oldState;
                setBrowserUrlWithFallback(oldUrl, false, oldState);
              } else {
                initializing = false;
                afterLocationChange(oldUrl, oldState);
              }
            });
            if (!$rootScope.$$phase)
              $rootScope.$digest();
          });
          $rootScope.$watch(function $locationWatch() {
            var oldUrl = trimEmptyHash($browser.url());
            var newUrl = trimEmptyHash($location.absUrl());
            var oldState = $browser.state();
            var currentReplace = $location.$$replace;
            var urlOrStateChanged = oldUrl !== newUrl || ($location.$$html5 && $sniffer.history && oldState !== $location.$$state);
            if (initializing || urlOrStateChanged) {
              initializing = false;
              $rootScope.$evalAsync(function() {
                var newUrl = $location.absUrl();
                var defaultPrevented = $rootScope.$broadcast('$locationChangeStart', newUrl, oldUrl, $location.$$state, oldState).defaultPrevented;
                if ($location.absUrl() !== newUrl)
                  return;
                if (defaultPrevented) {
                  $location.$$parse(oldUrl);
                  $location.$$state = oldState;
                } else {
                  if (urlOrStateChanged) {
                    setBrowserUrlWithFallback(newUrl, currentReplace, oldState === $location.$$state ? null : $location.$$state);
                  }
                  afterLocationChange(oldUrl, oldState);
                }
              });
            }
            $location.$$replace = false;
          });
          return $location;
          function afterLocationChange(oldUrl, oldState) {
            $rootScope.$broadcast('$locationChangeSuccess', $location.absUrl(), oldUrl, $location.$$state, oldState);
          }
        }];
      }
      function $LogProvider() {
        var debug = true,
            self = this;
        this.debugEnabled = function(flag) {
          if (isDefined(flag)) {
            debug = flag;
            return this;
          } else {
            return debug;
          }
        };
        this.$get = ['$window', function($window) {
          return {
            log: consoleLog('log'),
            info: consoleLog('info'),
            warn: consoleLog('warn'),
            error: consoleLog('error'),
            debug: (function() {
              var fn = consoleLog('debug');
              return function() {
                if (debug) {
                  fn.apply(self, arguments);
                }
              };
            }())
          };
          function formatError(arg) {
            if (arg instanceof Error) {
              if (arg.stack) {
                arg = (arg.message && arg.stack.indexOf(arg.message) === -1) ? 'Error: ' + arg.message + '\n' + arg.stack : arg.stack;
              } else if (arg.sourceURL) {
                arg = arg.message + '\n' + arg.sourceURL + ':' + arg.line;
              }
            }
            return arg;
          }
          function consoleLog(type) {
            var console = $window.console || {},
                logFn = console[type] || console.log || noop,
                hasApply = false;
            try {
              hasApply = !!logFn.apply;
            } catch (e) {}
            if (hasApply) {
              return function() {
                var args = [];
                forEach(arguments, function(arg) {
                  args.push(formatError(arg));
                });
                return logFn.apply(console, args);
              };
            }
            return function(arg1, arg2) {
              logFn(arg1, arg2 == null ? '' : arg2);
            };
          }
        }];
      }
      var $parseMinErr = minErr('$parse');
      function ensureSafeMemberName(name, fullExpression) {
        if (name === "__defineGetter__" || name === "__defineSetter__" || name === "__lookupGetter__" || name === "__lookupSetter__" || name === "__proto__") {
          throw $parseMinErr('isecfld', 'Attempting to access a disallowed field in Angular expressions! ' + 'Expression: {0}', fullExpression);
        }
        return name;
      }
      function getStringValue(name, fullExpression) {
        name = name + '';
        if (!isString(name)) {
          throw $parseMinErr('iseccst', 'Cannot convert object to primitive value! ' + 'Expression: {0}', fullExpression);
        }
        return name;
      }
      function ensureSafeObject(obj, fullExpression) {
        if (obj) {
          if (obj.constructor === obj) {
            throw $parseMinErr('isecfn', 'Referencing Function in Angular expressions is disallowed! Expression: {0}', fullExpression);
          } else if (obj.window === obj) {
            throw $parseMinErr('isecwindow', 'Referencing the Window in Angular expressions is disallowed! Expression: {0}', fullExpression);
          } else if (obj.children && (obj.nodeName || (obj.prop && obj.attr && obj.find))) {
            throw $parseMinErr('isecdom', 'Referencing DOM nodes in Angular expressions is disallowed! Expression: {0}', fullExpression);
          } else if (obj === Object) {
            throw $parseMinErr('isecobj', 'Referencing Object in Angular expressions is disallowed! Expression: {0}', fullExpression);
          }
        }
        return obj;
      }
      var CALL = Function.prototype.call;
      var APPLY = Function.prototype.apply;
      var BIND = Function.prototype.bind;
      function ensureSafeFunction(obj, fullExpression) {
        if (obj) {
          if (obj.constructor === obj) {
            throw $parseMinErr('isecfn', 'Referencing Function in Angular expressions is disallowed! Expression: {0}', fullExpression);
          } else if (obj === CALL || obj === APPLY || obj === BIND) {
            throw $parseMinErr('isecff', 'Referencing call, apply or bind in Angular expressions is disallowed! Expression: {0}', fullExpression);
          }
        }
      }
      function ensureSafeAssignContext(obj, fullExpression) {
        if (obj) {
          if (obj === (0).constructor || obj === (false).constructor || obj === ''.constructor || obj === {}.constructor || obj === [].constructor || obj === Function.constructor) {
            throw $parseMinErr('isecaf', 'Assigning to a constructor is disallowed! Expression: {0}', fullExpression);
          }
        }
      }
      var OPERATORS = createMap();
      forEach('+ - * / % === !== == != < > <= >= && || ! = |'.split(' '), function(operator) {
        OPERATORS[operator] = true;
      });
      var ESCAPE = {
        "n": "\n",
        "f": "\f",
        "r": "\r",
        "t": "\t",
        "v": "\v",
        "'": "'",
        '"': '"'
      };
      var Lexer = function(options) {
        this.options = options;
      };
      Lexer.prototype = {
        constructor: Lexer,
        lex: function(text) {
          this.text = text;
          this.index = 0;
          this.tokens = [];
          while (this.index < this.text.length) {
            var ch = this.text.charAt(this.index);
            if (ch === '"' || ch === "'") {
              this.readString(ch);
            } else if (this.isNumber(ch) || ch === '.' && this.isNumber(this.peek())) {
              this.readNumber();
            } else if (this.isIdent(ch)) {
              this.readIdent();
            } else if (this.is(ch, '(){}[].,;:?')) {
              this.tokens.push({
                index: this.index,
                text: ch
              });
              this.index++;
            } else if (this.isWhitespace(ch)) {
              this.index++;
            } else {
              var ch2 = ch + this.peek();
              var ch3 = ch2 + this.peek(2);
              var op1 = OPERATORS[ch];
              var op2 = OPERATORS[ch2];
              var op3 = OPERATORS[ch3];
              if (op1 || op2 || op3) {
                var token = op3 ? ch3 : (op2 ? ch2 : ch);
                this.tokens.push({
                  index: this.index,
                  text: token,
                  operator: true
                });
                this.index += token.length;
              } else {
                this.throwError('Unexpected next character ', this.index, this.index + 1);
              }
            }
          }
          return this.tokens;
        },
        is: function(ch, chars) {
          return chars.indexOf(ch) !== -1;
        },
        peek: function(i) {
          var num = i || 1;
          return (this.index + num < this.text.length) ? this.text.charAt(this.index + num) : false;
        },
        isNumber: function(ch) {
          return ('0' <= ch && ch <= '9') && typeof ch === "string";
        },
        isWhitespace: function(ch) {
          return (ch === ' ' || ch === '\r' || ch === '\t' || ch === '\n' || ch === '\v' || ch === '\u00A0');
        },
        isIdent: function(ch) {
          return ('a' <= ch && ch <= 'z' || 'A' <= ch && ch <= 'Z' || '_' === ch || ch === '$');
        },
        isExpOperator: function(ch) {
          return (ch === '-' || ch === '+' || this.isNumber(ch));
        },
        throwError: function(error, start, end) {
          end = end || this.index;
          var colStr = (isDefined(start) ? 's ' + start + '-' + this.index + ' [' + this.text.substring(start, end) + ']' : ' ' + end);
          throw $parseMinErr('lexerr', 'Lexer Error: {0} at column{1} in expression [{2}].', error, colStr, this.text);
        },
        readNumber: function() {
          var number = '';
          var start = this.index;
          while (this.index < this.text.length) {
            var ch = lowercase(this.text.charAt(this.index));
            if (ch == '.' || this.isNumber(ch)) {
              number += ch;
            } else {
              var peekCh = this.peek();
              if (ch == 'e' && this.isExpOperator(peekCh)) {
                number += ch;
              } else if (this.isExpOperator(ch) && peekCh && this.isNumber(peekCh) && number.charAt(number.length - 1) == 'e') {
                number += ch;
              } else if (this.isExpOperator(ch) && (!peekCh || !this.isNumber(peekCh)) && number.charAt(number.length - 1) == 'e') {
                this.throwError('Invalid exponent');
              } else {
                break;
              }
            }
            this.index++;
          }
          this.tokens.push({
            index: start,
            text: number,
            constant: true,
            value: Number(number)
          });
        },
        readIdent: function() {
          var start = this.index;
          while (this.index < this.text.length) {
            var ch = this.text.charAt(this.index);
            if (!(this.isIdent(ch) || this.isNumber(ch))) {
              break;
            }
            this.index++;
          }
          this.tokens.push({
            index: start,
            text: this.text.slice(start, this.index),
            identifier: true
          });
        },
        readString: function(quote) {
          var start = this.index;
          this.index++;
          var string = '';
          var rawString = quote;
          var escape = false;
          while (this.index < this.text.length) {
            var ch = this.text.charAt(this.index);
            rawString += ch;
            if (escape) {
              if (ch === 'u') {
                var hex = this.text.substring(this.index + 1, this.index + 5);
                if (!hex.match(/[\da-f]{4}/i)) {
                  this.throwError('Invalid unicode escape [\\u' + hex + ']');
                }
                this.index += 4;
                string += String.fromCharCode(parseInt(hex, 16));
              } else {
                var rep = ESCAPE[ch];
                string = string + (rep || ch);
              }
              escape = false;
            } else if (ch === '\\') {
              escape = true;
            } else if (ch === quote) {
              this.index++;
              this.tokens.push({
                index: start,
                text: rawString,
                constant: true,
                value: string
              });
              return;
            } else {
              string += ch;
            }
            this.index++;
          }
          this.throwError('Unterminated quote', start);
        }
      };
      var AST = function(lexer, options) {
        this.lexer = lexer;
        this.options = options;
      };
      AST.Program = 'Program';
      AST.ExpressionStatement = 'ExpressionStatement';
      AST.AssignmentExpression = 'AssignmentExpression';
      AST.ConditionalExpression = 'ConditionalExpression';
      AST.LogicalExpression = 'LogicalExpression';
      AST.BinaryExpression = 'BinaryExpression';
      AST.UnaryExpression = 'UnaryExpression';
      AST.CallExpression = 'CallExpression';
      AST.MemberExpression = 'MemberExpression';
      AST.Identifier = 'Identifier';
      AST.Literal = 'Literal';
      AST.ArrayExpression = 'ArrayExpression';
      AST.Property = 'Property';
      AST.ObjectExpression = 'ObjectExpression';
      AST.ThisExpression = 'ThisExpression';
      AST.NGValueParameter = 'NGValueParameter';
      AST.prototype = {
        ast: function(text) {
          this.text = text;
          this.tokens = this.lexer.lex(text);
          var value = this.program();
          if (this.tokens.length !== 0) {
            this.throwError('is an unexpected token', this.tokens[0]);
          }
          return value;
        },
        program: function() {
          var body = [];
          while (true) {
            if (this.tokens.length > 0 && !this.peek('}', ')', ';', ']'))
              body.push(this.expressionStatement());
            if (!this.expect(';')) {
              return {
                type: AST.Program,
                body: body
              };
            }
          }
        },
        expressionStatement: function() {
          return {
            type: AST.ExpressionStatement,
            expression: this.filterChain()
          };
        },
        filterChain: function() {
          var left = this.expression();
          var token;
          while ((token = this.expect('|'))) {
            left = this.filter(left);
          }
          return left;
        },
        expression: function() {
          return this.assignment();
        },
        assignment: function() {
          var result = this.ternary();
          if (this.expect('=')) {
            result = {
              type: AST.AssignmentExpression,
              left: result,
              right: this.assignment(),
              operator: '='
            };
          }
          return result;
        },
        ternary: function() {
          var test = this.logicalOR();
          var alternate;
          var consequent;
          if (this.expect('?')) {
            alternate = this.expression();
            if (this.consume(':')) {
              consequent = this.expression();
              return {
                type: AST.ConditionalExpression,
                test: test,
                alternate: alternate,
                consequent: consequent
              };
            }
          }
          return test;
        },
        logicalOR: function() {
          var left = this.logicalAND();
          while (this.expect('||')) {
            left = {
              type: AST.LogicalExpression,
              operator: '||',
              left: left,
              right: this.logicalAND()
            };
          }
          return left;
        },
        logicalAND: function() {
          var left = this.equality();
          while (this.expect('&&')) {
            left = {
              type: AST.LogicalExpression,
              operator: '&&',
              left: left,
              right: this.equality()
            };
          }
          return left;
        },
        equality: function() {
          var left = this.relational();
          var token;
          while ((token = this.expect('==', '!=', '===', '!=='))) {
            left = {
              type: AST.BinaryExpression,
              operator: token.text,
              left: left,
              right: this.relational()
            };
          }
          return left;
        },
        relational: function() {
          var left = this.additive();
          var token;
          while ((token = this.expect('<', '>', '<=', '>='))) {
            left = {
              type: AST.BinaryExpression,
              operator: token.text,
              left: left,
              right: this.additive()
            };
          }
          return left;
        },
        additive: function() {
          var left = this.multiplicative();
          var token;
          while ((token = this.expect('+', '-'))) {
            left = {
              type: AST.BinaryExpression,
              operator: token.text,
              left: left,
              right: this.multiplicative()
            };
          }
          return left;
        },
        multiplicative: function() {
          var left = this.unary();
          var token;
          while ((token = this.expect('*', '/', '%'))) {
            left = {
              type: AST.BinaryExpression,
              operator: token.text,
              left: left,
              right: this.unary()
            };
          }
          return left;
        },
        unary: function() {
          var token;
          if ((token = this.expect('+', '-', '!'))) {
            return {
              type: AST.UnaryExpression,
              operator: token.text,
              prefix: true,
              argument: this.unary()
            };
          } else {
            return this.primary();
          }
        },
        primary: function() {
          var primary;
          if (this.expect('(')) {
            primary = this.filterChain();
            this.consume(')');
          } else if (this.expect('[')) {
            primary = this.arrayDeclaration();
          } else if (this.expect('{')) {
            primary = this.object();
          } else if (this.constants.hasOwnProperty(this.peek().text)) {
            primary = copy(this.constants[this.consume().text]);
          } else if (this.peek().identifier) {
            primary = this.identifier();
          } else if (this.peek().constant) {
            primary = this.constant();
          } else {
            this.throwError('not a primary expression', this.peek());
          }
          var next;
          while ((next = this.expect('(', '[', '.'))) {
            if (next.text === '(') {
              primary = {
                type: AST.CallExpression,
                callee: primary,
                arguments: this.parseArguments()
              };
              this.consume(')');
            } else if (next.text === '[') {
              primary = {
                type: AST.MemberExpression,
                object: primary,
                property: this.expression(),
                computed: true
              };
              this.consume(']');
            } else if (next.text === '.') {
              primary = {
                type: AST.MemberExpression,
                object: primary,
                property: this.identifier(),
                computed: false
              };
            } else {
              this.throwError('IMPOSSIBLE');
            }
          }
          return primary;
        },
        filter: function(baseExpression) {
          var args = [baseExpression];
          var result = {
            type: AST.CallExpression,
            callee: this.identifier(),
            arguments: args,
            filter: true
          };
          while (this.expect(':')) {
            args.push(this.expression());
          }
          return result;
        },
        parseArguments: function() {
          var args = [];
          if (this.peekToken().text !== ')') {
            do {
              args.push(this.expression());
            } while (this.expect(','));
          }
          return args;
        },
        identifier: function() {
          var token = this.consume();
          if (!token.identifier) {
            this.throwError('is not a valid identifier', token);
          }
          return {
            type: AST.Identifier,
            name: token.text
          };
        },
        constant: function() {
          return {
            type: AST.Literal,
            value: this.consume().value
          };
        },
        arrayDeclaration: function() {
          var elements = [];
          if (this.peekToken().text !== ']') {
            do {
              if (this.peek(']')) {
                break;
              }
              elements.push(this.expression());
            } while (this.expect(','));
          }
          this.consume(']');
          return {
            type: AST.ArrayExpression,
            elements: elements
          };
        },
        object: function() {
          var properties = [],
              property;
          if (this.peekToken().text !== '}') {
            do {
              if (this.peek('}')) {
                break;
              }
              property = {
                type: AST.Property,
                kind: 'init'
              };
              if (this.peek().constant) {
                property.key = this.constant();
              } else if (this.peek().identifier) {
                property.key = this.identifier();
              } else {
                this.throwError("invalid key", this.peek());
              }
              this.consume(':');
              property.value = this.expression();
              properties.push(property);
            } while (this.expect(','));
          }
          this.consume('}');
          return {
            type: AST.ObjectExpression,
            properties: properties
          };
        },
        throwError: function(msg, token) {
          throw $parseMinErr('syntax', 'Syntax Error: Token \'{0}\' {1} at column {2} of the expression [{3}] starting at [{4}].', token.text, msg, (token.index + 1), this.text, this.text.substring(token.index));
        },
        consume: function(e1) {
          if (this.tokens.length === 0) {
            throw $parseMinErr('ueoe', 'Unexpected end of expression: {0}', this.text);
          }
          var token = this.expect(e1);
          if (!token) {
            this.throwError('is unexpected, expecting [' + e1 + ']', this.peek());
          }
          return token;
        },
        peekToken: function() {
          if (this.tokens.length === 0) {
            throw $parseMinErr('ueoe', 'Unexpected end of expression: {0}', this.text);
          }
          return this.tokens[0];
        },
        peek: function(e1, e2, e3, e4) {
          return this.peekAhead(0, e1, e2, e3, e4);
        },
        peekAhead: function(i, e1, e2, e3, e4) {
          if (this.tokens.length > i) {
            var token = this.tokens[i];
            var t = token.text;
            if (t === e1 || t === e2 || t === e3 || t === e4 || (!e1 && !e2 && !e3 && !e4)) {
              return token;
            }
          }
          return false;
        },
        expect: function(e1, e2, e3, e4) {
          var token = this.peek(e1, e2, e3, e4);
          if (token) {
            this.tokens.shift();
            return token;
          }
          return false;
        },
        constants: {
          'true': {
            type: AST.Literal,
            value: true
          },
          'false': {
            type: AST.Literal,
            value: false
          },
          'null': {
            type: AST.Literal,
            value: null
          },
          'undefined': {
            type: AST.Literal,
            value: undefined
          },
          'this': {type: AST.ThisExpression}
        }
      };
      function ifDefined(v, d) {
        return typeof v !== 'undefined' ? v : d;
      }
      function plusFn(l, r) {
        if (typeof l === 'undefined')
          return r;
        if (typeof r === 'undefined')
          return l;
        return l + r;
      }
      function isStateless($filter, filterName) {
        var fn = $filter(filterName);
        return !fn.$stateful;
      }
      function findConstantAndWatchExpressions(ast, $filter) {
        var allConstants;
        var argsToWatch;
        switch (ast.type) {
          case AST.Program:
            allConstants = true;
            forEach(ast.body, function(expr) {
              findConstantAndWatchExpressions(expr.expression, $filter);
              allConstants = allConstants && expr.expression.constant;
            });
            ast.constant = allConstants;
            break;
          case AST.Literal:
            ast.constant = true;
            ast.toWatch = [];
            break;
          case AST.UnaryExpression:
            findConstantAndWatchExpressions(ast.argument, $filter);
            ast.constant = ast.argument.constant;
            ast.toWatch = ast.argument.toWatch;
            break;
          case AST.BinaryExpression:
            findConstantAndWatchExpressions(ast.left, $filter);
            findConstantAndWatchExpressions(ast.right, $filter);
            ast.constant = ast.left.constant && ast.right.constant;
            ast.toWatch = ast.left.toWatch.concat(ast.right.toWatch);
            break;
          case AST.LogicalExpression:
            findConstantAndWatchExpressions(ast.left, $filter);
            findConstantAndWatchExpressions(ast.right, $filter);
            ast.constant = ast.left.constant && ast.right.constant;
            ast.toWatch = ast.constant ? [] : [ast];
            break;
          case AST.ConditionalExpression:
            findConstantAndWatchExpressions(ast.test, $filter);
            findConstantAndWatchExpressions(ast.alternate, $filter);
            findConstantAndWatchExpressions(ast.consequent, $filter);
            ast.constant = ast.test.constant && ast.alternate.constant && ast.consequent.constant;
            ast.toWatch = ast.constant ? [] : [ast];
            break;
          case AST.Identifier:
            ast.constant = false;
            ast.toWatch = [ast];
            break;
          case AST.MemberExpression:
            findConstantAndWatchExpressions(ast.object, $filter);
            if (ast.computed) {
              findConstantAndWatchExpressions(ast.property, $filter);
            }
            ast.constant = ast.object.constant && (!ast.computed || ast.property.constant);
            ast.toWatch = [ast];
            break;
          case AST.CallExpression:
            allConstants = ast.filter ? isStateless($filter, ast.callee.name) : false;
            argsToWatch = [];
            forEach(ast.arguments, function(expr) {
              findConstantAndWatchExpressions(expr, $filter);
              allConstants = allConstants && expr.constant;
              if (!expr.constant) {
                argsToWatch.push.apply(argsToWatch, expr.toWatch);
              }
            });
            ast.constant = allConstants;
            ast.toWatch = ast.filter && isStateless($filter, ast.callee.name) ? argsToWatch : [ast];
            break;
          case AST.AssignmentExpression:
            findConstantAndWatchExpressions(ast.left, $filter);
            findConstantAndWatchExpressions(ast.right, $filter);
            ast.constant = ast.left.constant && ast.right.constant;
            ast.toWatch = [ast];
            break;
          case AST.ArrayExpression:
            allConstants = true;
            argsToWatch = [];
            forEach(ast.elements, function(expr) {
              findConstantAndWatchExpressions(expr, $filter);
              allConstants = allConstants && expr.constant;
              if (!expr.constant) {
                argsToWatch.push.apply(argsToWatch, expr.toWatch);
              }
            });
            ast.constant = allConstants;
            ast.toWatch = argsToWatch;
            break;
          case AST.ObjectExpression:
            allConstants = true;
            argsToWatch = [];
            forEach(ast.properties, function(property) {
              findConstantAndWatchExpressions(property.value, $filter);
              allConstants = allConstants && property.value.constant;
              if (!property.value.constant) {
                argsToWatch.push.apply(argsToWatch, property.value.toWatch);
              }
            });
            ast.constant = allConstants;
            ast.toWatch = argsToWatch;
            break;
          case AST.ThisExpression:
            ast.constant = false;
            ast.toWatch = [];
            break;
        }
      }
      function getInputs(body) {
        if (body.length != 1)
          return;
        var lastExpression = body[0].expression;
        var candidate = lastExpression.toWatch;
        if (candidate.length !== 1)
          return candidate;
        return candidate[0] !== lastExpression ? candidate : undefined;
      }
      function isAssignable(ast) {
        return ast.type === AST.Identifier || ast.type === AST.MemberExpression;
      }
      function assignableAST(ast) {
        if (ast.body.length === 1 && isAssignable(ast.body[0].expression)) {
          return {
            type: AST.AssignmentExpression,
            left: ast.body[0].expression,
            right: {type: AST.NGValueParameter},
            operator: '='
          };
        }
      }
      function isLiteral(ast) {
        return ast.body.length === 0 || ast.body.length === 1 && (ast.body[0].expression.type === AST.Literal || ast.body[0].expression.type === AST.ArrayExpression || ast.body[0].expression.type === AST.ObjectExpression);
      }
      function isConstant(ast) {
        return ast.constant;
      }
      function ASTCompiler(astBuilder, $filter) {
        this.astBuilder = astBuilder;
        this.$filter = $filter;
      }
      ASTCompiler.prototype = {
        compile: function(expression, expensiveChecks) {
          var self = this;
          var ast = this.astBuilder.ast(expression);
          this.state = {
            nextId: 0,
            filters: {},
            expensiveChecks: expensiveChecks,
            fn: {
              vars: [],
              body: [],
              own: {}
            },
            assign: {
              vars: [],
              body: [],
              own: {}
            },
            inputs: []
          };
          findConstantAndWatchExpressions(ast, self.$filter);
          var extra = '';
          var assignable;
          this.stage = 'assign';
          if ((assignable = assignableAST(ast))) {
            this.state.computing = 'assign';
            var result = this.nextId();
            this.recurse(assignable, result);
            this.return_(result);
            extra = 'fn.assign=' + this.generateFunction('assign', 's,v,l');
          }
          var toWatch = getInputs(ast.body);
          self.stage = 'inputs';
          forEach(toWatch, function(watch, key) {
            var fnKey = 'fn' + key;
            self.state[fnKey] = {
              vars: [],
              body: [],
              own: {}
            };
            self.state.computing = fnKey;
            var intoId = self.nextId();
            self.recurse(watch, intoId);
            self.return_(intoId);
            self.state.inputs.push(fnKey);
            watch.watchId = key;
          });
          this.state.computing = 'fn';
          this.stage = 'main';
          this.recurse(ast);
          var fnString = '"' + this.USE + ' ' + this.STRICT + '";\n' + this.filterPrefix() + 'var fn=' + this.generateFunction('fn', 's,l,a,i') + extra + this.watchFns() + 'return fn;';
          var fn = (new Function('$filter', 'ensureSafeMemberName', 'ensureSafeObject', 'ensureSafeFunction', 'getStringValue', 'ensureSafeAssignContext', 'ifDefined', 'plus', 'text', fnString))(this.$filter, ensureSafeMemberName, ensureSafeObject, ensureSafeFunction, getStringValue, ensureSafeAssignContext, ifDefined, plusFn, expression);
          this.state = this.stage = undefined;
          fn.literal = isLiteral(ast);
          fn.constant = isConstant(ast);
          return fn;
        },
        USE: 'use',
        STRICT: 'strict',
        watchFns: function() {
          var result = [];
          var fns = this.state.inputs;
          var self = this;
          forEach(fns, function(name) {
            result.push('var ' + name + '=' + self.generateFunction(name, 's'));
          });
          if (fns.length) {
            result.push('fn.inputs=[' + fns.join(',') + '];');
          }
          return result.join('');
        },
        generateFunction: function(name, params) {
          return 'function(' + params + '){' + this.varsPrefix(name) + this.body(name) + '};';
        },
        filterPrefix: function() {
          var parts = [];
          var self = this;
          forEach(this.state.filters, function(id, filter) {
            parts.push(id + '=$filter(' + self.escape(filter) + ')');
          });
          if (parts.length)
            return 'var ' + parts.join(',') + ';';
          return '';
        },
        varsPrefix: function(section) {
          return this.state[section].vars.length ? 'var ' + this.state[section].vars.join(',') + ';' : '';
        },
        body: function(section) {
          return this.state[section].body.join('');
        },
        recurse: function(ast, intoId, nameId, recursionFn, create, skipWatchIdCheck) {
          var left,
              right,
              self = this,
              args,
              expression;
          recursionFn = recursionFn || noop;
          if (!skipWatchIdCheck && isDefined(ast.watchId)) {
            intoId = intoId || this.nextId();
            this.if_('i', this.lazyAssign(intoId, this.computedMember('i', ast.watchId)), this.lazyRecurse(ast, intoId, nameId, recursionFn, create, true));
            return;
          }
          switch (ast.type) {
            case AST.Program:
              forEach(ast.body, function(expression, pos) {
                self.recurse(expression.expression, undefined, undefined, function(expr) {
                  right = expr;
                });
                if (pos !== ast.body.length - 1) {
                  self.current().body.push(right, ';');
                } else {
                  self.return_(right);
                }
              });
              break;
            case AST.Literal:
              expression = this.escape(ast.value);
              this.assign(intoId, expression);
              recursionFn(expression);
              break;
            case AST.UnaryExpression:
              this.recurse(ast.argument, undefined, undefined, function(expr) {
                right = expr;
              });
              expression = ast.operator + '(' + this.ifDefined(right, 0) + ')';
              this.assign(intoId, expression);
              recursionFn(expression);
              break;
            case AST.BinaryExpression:
              this.recurse(ast.left, undefined, undefined, function(expr) {
                left = expr;
              });
              this.recurse(ast.right, undefined, undefined, function(expr) {
                right = expr;
              });
              if (ast.operator === '+') {
                expression = this.plus(left, right);
              } else if (ast.operator === '-') {
                expression = this.ifDefined(left, 0) + ast.operator + this.ifDefined(right, 0);
              } else {
                expression = '(' + left + ')' + ast.operator + '(' + right + ')';
              }
              this.assign(intoId, expression);
              recursionFn(expression);
              break;
            case AST.LogicalExpression:
              intoId = intoId || this.nextId();
              self.recurse(ast.left, intoId);
              self.if_(ast.operator === '&&' ? intoId : self.not(intoId), self.lazyRecurse(ast.right, intoId));
              recursionFn(intoId);
              break;
            case AST.ConditionalExpression:
              intoId = intoId || this.nextId();
              self.recurse(ast.test, intoId);
              self.if_(intoId, self.lazyRecurse(ast.alternate, intoId), self.lazyRecurse(ast.consequent, intoId));
              recursionFn(intoId);
              break;
            case AST.Identifier:
              intoId = intoId || this.nextId();
              if (nameId) {
                nameId.context = self.stage === 'inputs' ? 's' : this.assign(this.nextId(), this.getHasOwnProperty('l', ast.name) + '?l:s');
                nameId.computed = false;
                nameId.name = ast.name;
              }
              ensureSafeMemberName(ast.name);
              self.if_(self.stage === 'inputs' || self.not(self.getHasOwnProperty('l', ast.name)), function() {
                self.if_(self.stage === 'inputs' || 's', function() {
                  if (create && create !== 1) {
                    self.if_(self.not(self.nonComputedMember('s', ast.name)), self.lazyAssign(self.nonComputedMember('s', ast.name), '{}'));
                  }
                  self.assign(intoId, self.nonComputedMember('s', ast.name));
                });
              }, intoId && self.lazyAssign(intoId, self.nonComputedMember('l', ast.name)));
              if (self.state.expensiveChecks || isPossiblyDangerousMemberName(ast.name)) {
                self.addEnsureSafeObject(intoId);
              }
              recursionFn(intoId);
              break;
            case AST.MemberExpression:
              left = nameId && (nameId.context = this.nextId()) || this.nextId();
              intoId = intoId || this.nextId();
              self.recurse(ast.object, left, undefined, function() {
                self.if_(self.notNull(left), function() {
                  if (ast.computed) {
                    right = self.nextId();
                    self.recurse(ast.property, right);
                    self.getStringValue(right);
                    self.addEnsureSafeMemberName(right);
                    if (create && create !== 1) {
                      self.if_(self.not(self.computedMember(left, right)), self.lazyAssign(self.computedMember(left, right), '{}'));
                    }
                    expression = self.ensureSafeObject(self.computedMember(left, right));
                    self.assign(intoId, expression);
                    if (nameId) {
                      nameId.computed = true;
                      nameId.name = right;
                    }
                  } else {
                    ensureSafeMemberName(ast.property.name);
                    if (create && create !== 1) {
                      self.if_(self.not(self.nonComputedMember(left, ast.property.name)), self.lazyAssign(self.nonComputedMember(left, ast.property.name), '{}'));
                    }
                    expression = self.nonComputedMember(left, ast.property.name);
                    if (self.state.expensiveChecks || isPossiblyDangerousMemberName(ast.property.name)) {
                      expression = self.ensureSafeObject(expression);
                    }
                    self.assign(intoId, expression);
                    if (nameId) {
                      nameId.computed = false;
                      nameId.name = ast.property.name;
                    }
                  }
                }, function() {
                  self.assign(intoId, 'undefined');
                });
                recursionFn(intoId);
              }, !!create);
              break;
            case AST.CallExpression:
              intoId = intoId || this.nextId();
              if (ast.filter) {
                right = self.filter(ast.callee.name);
                args = [];
                forEach(ast.arguments, function(expr) {
                  var argument = self.nextId();
                  self.recurse(expr, argument);
                  args.push(argument);
                });
                expression = right + '(' + args.join(',') + ')';
                self.assign(intoId, expression);
                recursionFn(intoId);
              } else {
                right = self.nextId();
                left = {};
                args = [];
                self.recurse(ast.callee, right, left, function() {
                  self.if_(self.notNull(right), function() {
                    self.addEnsureSafeFunction(right);
                    forEach(ast.arguments, function(expr) {
                      self.recurse(expr, self.nextId(), undefined, function(argument) {
                        args.push(self.ensureSafeObject(argument));
                      });
                    });
                    if (left.name) {
                      if (!self.state.expensiveChecks) {
                        self.addEnsureSafeObject(left.context);
                      }
                      expression = self.member(left.context, left.name, left.computed) + '(' + args.join(',') + ')';
                    } else {
                      expression = right + '(' + args.join(',') + ')';
                    }
                    expression = self.ensureSafeObject(expression);
                    self.assign(intoId, expression);
                  }, function() {
                    self.assign(intoId, 'undefined');
                  });
                  recursionFn(intoId);
                });
              }
              break;
            case AST.AssignmentExpression:
              right = this.nextId();
              left = {};
              if (!isAssignable(ast.left)) {
                throw $parseMinErr('lval', 'Trying to assing a value to a non l-value');
              }
              this.recurse(ast.left, undefined, left, function() {
                self.if_(self.notNull(left.context), function() {
                  self.recurse(ast.right, right);
                  self.addEnsureSafeObject(self.member(left.context, left.name, left.computed));
                  self.addEnsureSafeAssignContext(left.context);
                  expression = self.member(left.context, left.name, left.computed) + ast.operator + right;
                  self.assign(intoId, expression);
                  recursionFn(intoId || expression);
                });
              }, 1);
              break;
            case AST.ArrayExpression:
              args = [];
              forEach(ast.elements, function(expr) {
                self.recurse(expr, self.nextId(), undefined, function(argument) {
                  args.push(argument);
                });
              });
              expression = '[' + args.join(',') + ']';
              this.assign(intoId, expression);
              recursionFn(expression);
              break;
            case AST.ObjectExpression:
              args = [];
              forEach(ast.properties, function(property) {
                self.recurse(property.value, self.nextId(), undefined, function(expr) {
                  args.push(self.escape(property.key.type === AST.Identifier ? property.key.name : ('' + property.key.value)) + ':' + expr);
                });
              });
              expression = '{' + args.join(',') + '}';
              this.assign(intoId, expression);
              recursionFn(expression);
              break;
            case AST.ThisExpression:
              this.assign(intoId, 's');
              recursionFn('s');
              break;
            case AST.NGValueParameter:
              this.assign(intoId, 'v');
              recursionFn('v');
              break;
          }
        },
        getHasOwnProperty: function(element, property) {
          var key = element + '.' + property;
          var own = this.current().own;
          if (!own.hasOwnProperty(key)) {
            own[key] = this.nextId(false, element + '&&(' + this.escape(property) + ' in ' + element + ')');
          }
          return own[key];
        },
        assign: function(id, value) {
          if (!id)
            return;
          this.current().body.push(id, '=', value, ';');
          return id;
        },
        filter: function(filterName) {
          if (!this.state.filters.hasOwnProperty(filterName)) {
            this.state.filters[filterName] = this.nextId(true);
          }
          return this.state.filters[filterName];
        },
        ifDefined: function(id, defaultValue) {
          return 'ifDefined(' + id + ',' + this.escape(defaultValue) + ')';
        },
        plus: function(left, right) {
          return 'plus(' + left + ',' + right + ')';
        },
        return_: function(id) {
          this.current().body.push('return ', id, ';');
        },
        if_: function(test, alternate, consequent) {
          if (test === true) {
            alternate();
          } else {
            var body = this.current().body;
            body.push('if(', test, '){');
            alternate();
            body.push('}');
            if (consequent) {
              body.push('else{');
              consequent();
              body.push('}');
            }
          }
        },
        not: function(expression) {
          return '!(' + expression + ')';
        },
        notNull: function(expression) {
          return expression + '!=null';
        },
        nonComputedMember: function(left, right) {
          return left + '.' + right;
        },
        computedMember: function(left, right) {
          return left + '[' + right + ']';
        },
        member: function(left, right, computed) {
          if (computed)
            return this.computedMember(left, right);
          return this.nonComputedMember(left, right);
        },
        addEnsureSafeObject: function(item) {
          this.current().body.push(this.ensureSafeObject(item), ';');
        },
        addEnsureSafeMemberName: function(item) {
          this.current().body.push(this.ensureSafeMemberName(item), ';');
        },
        addEnsureSafeFunction: function(item) {
          this.current().body.push(this.ensureSafeFunction(item), ';');
        },
        addEnsureSafeAssignContext: function(item) {
          this.current().body.push(this.ensureSafeAssignContext(item), ';');
        },
        ensureSafeObject: function(item) {
          return 'ensureSafeObject(' + item + ',text)';
        },
        ensureSafeMemberName: function(item) {
          return 'ensureSafeMemberName(' + item + ',text)';
        },
        ensureSafeFunction: function(item) {
          return 'ensureSafeFunction(' + item + ',text)';
        },
        getStringValue: function(item) {
          this.assign(item, 'getStringValue(' + item + ',text)');
        },
        ensureSafeAssignContext: function(item) {
          return 'ensureSafeAssignContext(' + item + ',text)';
        },
        lazyRecurse: function(ast, intoId, nameId, recursionFn, create, skipWatchIdCheck) {
          var self = this;
          return function() {
            self.recurse(ast, intoId, nameId, recursionFn, create, skipWatchIdCheck);
          };
        },
        lazyAssign: function(id, value) {
          var self = this;
          return function() {
            self.assign(id, value);
          };
        },
        stringEscapeRegex: /[^ a-zA-Z0-9]/g,
        stringEscapeFn: function(c) {
          return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4);
        },
        escape: function(value) {
          if (isString(value))
            return "'" + value.replace(this.stringEscapeRegex, this.stringEscapeFn) + "'";
          if (isNumber(value))
            return value.toString();
          if (value === true)
            return 'true';
          if (value === false)
            return 'false';
          if (value === null)
            return 'null';
          if (typeof value === 'undefined')
            return 'undefined';
          throw $parseMinErr('esc', 'IMPOSSIBLE');
        },
        nextId: function(skip, init) {
          var id = 'v' + (this.state.nextId++);
          if (!skip) {
            this.current().vars.push(id + (init ? '=' + init : ''));
          }
          return id;
        },
        current: function() {
          return this.state[this.state.computing];
        }
      };
      function ASTInterpreter(astBuilder, $filter) {
        this.astBuilder = astBuilder;
        this.$filter = $filter;
      }
      ASTInterpreter.prototype = {
        compile: function(expression, expensiveChecks) {
          var self = this;
          var ast = this.astBuilder.ast(expression);
          this.expression = expression;
          this.expensiveChecks = expensiveChecks;
          findConstantAndWatchExpressions(ast, self.$filter);
          var assignable;
          var assign;
          if ((assignable = assignableAST(ast))) {
            assign = this.recurse(assignable);
          }
          var toWatch = getInputs(ast.body);
          var inputs;
          if (toWatch) {
            inputs = [];
            forEach(toWatch, function(watch, key) {
              var input = self.recurse(watch);
              watch.input = input;
              inputs.push(input);
              watch.watchId = key;
            });
          }
          var expressions = [];
          forEach(ast.body, function(expression) {
            expressions.push(self.recurse(expression.expression));
          });
          var fn = ast.body.length === 0 ? function() {} : ast.body.length === 1 ? expressions[0] : function(scope, locals) {
            var lastValue;
            forEach(expressions, function(exp) {
              lastValue = exp(scope, locals);
            });
            return lastValue;
          };
          if (assign) {
            fn.assign = function(scope, value, locals) {
              return assign(scope, locals, value);
            };
          }
          if (inputs) {
            fn.inputs = inputs;
          }
          fn.literal = isLiteral(ast);
          fn.constant = isConstant(ast);
          return fn;
        },
        recurse: function(ast, context, create) {
          var left,
              right,
              self = this,
              args,
              expression;
          if (ast.input) {
            return this.inputs(ast.input, ast.watchId);
          }
          switch (ast.type) {
            case AST.Literal:
              return this.value(ast.value, context);
            case AST.UnaryExpression:
              right = this.recurse(ast.argument);
              return this['unary' + ast.operator](right, context);
            case AST.BinaryExpression:
              left = this.recurse(ast.left);
              right = this.recurse(ast.right);
              return this['binary' + ast.operator](left, right, context);
            case AST.LogicalExpression:
              left = this.recurse(ast.left);
              right = this.recurse(ast.right);
              return this['binary' + ast.operator](left, right, context);
            case AST.ConditionalExpression:
              return this['ternary?:'](this.recurse(ast.test), this.recurse(ast.alternate), this.recurse(ast.consequent), context);
            case AST.Identifier:
              ensureSafeMemberName(ast.name, self.expression);
              return self.identifier(ast.name, self.expensiveChecks || isPossiblyDangerousMemberName(ast.name), context, create, self.expression);
            case AST.MemberExpression:
              left = this.recurse(ast.object, false, !!create);
              if (!ast.computed) {
                ensureSafeMemberName(ast.property.name, self.expression);
                right = ast.property.name;
              }
              if (ast.computed)
                right = this.recurse(ast.property);
              return ast.computed ? this.computedMember(left, right, context, create, self.expression) : this.nonComputedMember(left, right, self.expensiveChecks, context, create, self.expression);
            case AST.CallExpression:
              args = [];
              forEach(ast.arguments, function(expr) {
                args.push(self.recurse(expr));
              });
              if (ast.filter)
                right = this.$filter(ast.callee.name);
              if (!ast.filter)
                right = this.recurse(ast.callee, true);
              return ast.filter ? function(scope, locals, assign, inputs) {
                var values = [];
                for (var i = 0; i < args.length; ++i) {
                  values.push(args[i](scope, locals, assign, inputs));
                }
                var value = right.apply(undefined, values, inputs);
                return context ? {
                  context: undefined,
                  name: undefined,
                  value: value
                } : value;
              } : function(scope, locals, assign, inputs) {
                var rhs = right(scope, locals, assign, inputs);
                var value;
                if (rhs.value != null) {
                  ensureSafeObject(rhs.context, self.expression);
                  ensureSafeFunction(rhs.value, self.expression);
                  var values = [];
                  for (var i = 0; i < args.length; ++i) {
                    values.push(ensureSafeObject(args[i](scope, locals, assign, inputs), self.expression));
                  }
                  value = ensureSafeObject(rhs.value.apply(rhs.context, values), self.expression);
                }
                return context ? {value: value} : value;
              };
            case AST.AssignmentExpression:
              left = this.recurse(ast.left, true, 1);
              right = this.recurse(ast.right);
              return function(scope, locals, assign, inputs) {
                var lhs = left(scope, locals, assign, inputs);
                var rhs = right(scope, locals, assign, inputs);
                ensureSafeObject(lhs.value, self.expression);
                ensureSafeAssignContext(lhs.context);
                lhs.context[lhs.name] = rhs;
                return context ? {value: rhs} : rhs;
              };
            case AST.ArrayExpression:
              args = [];
              forEach(ast.elements, function(expr) {
                args.push(self.recurse(expr));
              });
              return function(scope, locals, assign, inputs) {
                var value = [];
                for (var i = 0; i < args.length; ++i) {
                  value.push(args[i](scope, locals, assign, inputs));
                }
                return context ? {value: value} : value;
              };
            case AST.ObjectExpression:
              args = [];
              forEach(ast.properties, function(property) {
                args.push({
                  key: property.key.type === AST.Identifier ? property.key.name : ('' + property.key.value),
                  value: self.recurse(property.value)
                });
              });
              return function(scope, locals, assign, inputs) {
                var value = {};
                for (var i = 0; i < args.length; ++i) {
                  value[args[i].key] = args[i].value(scope, locals, assign, inputs);
                }
                return context ? {value: value} : value;
              };
            case AST.ThisExpression:
              return function(scope) {
                return context ? {value: scope} : scope;
              };
            case AST.NGValueParameter:
              return function(scope, locals, assign, inputs) {
                return context ? {value: assign} : assign;
              };
          }
        },
        'unary+': function(argument, context) {
          return function(scope, locals, assign, inputs) {
            var arg = argument(scope, locals, assign, inputs);
            if (isDefined(arg)) {
              arg = +arg;
            } else {
              arg = 0;
            }
            return context ? {value: arg} : arg;
          };
        },
        'unary-': function(argument, context) {
          return function(scope, locals, assign, inputs) {
            var arg = argument(scope, locals, assign, inputs);
            if (isDefined(arg)) {
              arg = -arg;
            } else {
              arg = 0;
            }
            return context ? {value: arg} : arg;
          };
        },
        'unary!': function(argument, context) {
          return function(scope, locals, assign, inputs) {
            var arg = !argument(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'binary+': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var lhs = left(scope, locals, assign, inputs);
            var rhs = right(scope, locals, assign, inputs);
            var arg = plusFn(lhs, rhs);
            return context ? {value: arg} : arg;
          };
        },
        'binary-': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var lhs = left(scope, locals, assign, inputs);
            var rhs = right(scope, locals, assign, inputs);
            var arg = (isDefined(lhs) ? lhs : 0) - (isDefined(rhs) ? rhs : 0);
            return context ? {value: arg} : arg;
          };
        },
        'binary*': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var arg = left(scope, locals, assign, inputs) * right(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'binary/': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var arg = left(scope, locals, assign, inputs) / right(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'binary%': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var arg = left(scope, locals, assign, inputs) % right(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'binary===': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var arg = left(scope, locals, assign, inputs) === right(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'binary!==': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var arg = left(scope, locals, assign, inputs) !== right(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'binary==': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var arg = left(scope, locals, assign, inputs) == right(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'binary!=': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var arg = left(scope, locals, assign, inputs) != right(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'binary<': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var arg = left(scope, locals, assign, inputs) < right(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'binary>': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var arg = left(scope, locals, assign, inputs) > right(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'binary<=': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var arg = left(scope, locals, assign, inputs) <= right(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'binary>=': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var arg = left(scope, locals, assign, inputs) >= right(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'binary&&': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var arg = left(scope, locals, assign, inputs) && right(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'binary||': function(left, right, context) {
          return function(scope, locals, assign, inputs) {
            var arg = left(scope, locals, assign, inputs) || right(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        'ternary?:': function(test, alternate, consequent, context) {
          return function(scope, locals, assign, inputs) {
            var arg = test(scope, locals, assign, inputs) ? alternate(scope, locals, assign, inputs) : consequent(scope, locals, assign, inputs);
            return context ? {value: arg} : arg;
          };
        },
        value: function(value, context) {
          return function() {
            return context ? {
              context: undefined,
              name: undefined,
              value: value
            } : value;
          };
        },
        identifier: function(name, expensiveChecks, context, create, expression) {
          return function(scope, locals, assign, inputs) {
            var base = locals && (name in locals) ? locals : scope;
            if (create && create !== 1 && base && !(base[name])) {
              base[name] = {};
            }
            var value = base ? base[name] : undefined;
            if (expensiveChecks) {
              ensureSafeObject(value, expression);
            }
            if (context) {
              return {
                context: base,
                name: name,
                value: value
              };
            } else {
              return value;
            }
          };
        },
        computedMember: function(left, right, context, create, expression) {
          return function(scope, locals, assign, inputs) {
            var lhs = left(scope, locals, assign, inputs);
            var rhs;
            var value;
            if (lhs != null) {
              rhs = right(scope, locals, assign, inputs);
              rhs = getStringValue(rhs);
              ensureSafeMemberName(rhs, expression);
              if (create && create !== 1 && lhs && !(lhs[rhs])) {
                lhs[rhs] = {};
              }
              value = lhs[rhs];
              ensureSafeObject(value, expression);
            }
            if (context) {
              return {
                context: lhs,
                name: rhs,
                value: value
              };
            } else {
              return value;
            }
          };
        },
        nonComputedMember: function(left, right, expensiveChecks, context, create, expression) {
          return function(scope, locals, assign, inputs) {
            var lhs = left(scope, locals, assign, inputs);
            if (create && create !== 1 && lhs && !(lhs[right])) {
              lhs[right] = {};
            }
            var value = lhs != null ? lhs[right] : undefined;
            if (expensiveChecks || isPossiblyDangerousMemberName(right)) {
              ensureSafeObject(value, expression);
            }
            if (context) {
              return {
                context: lhs,
                name: right,
                value: value
              };
            } else {
              return value;
            }
          };
        },
        inputs: function(input, watchId) {
          return function(scope, value, locals, inputs) {
            if (inputs)
              return inputs[watchId];
            return input(scope, value, locals);
          };
        }
      };
      var Parser = function(lexer, $filter, options) {
        this.lexer = lexer;
        this.$filter = $filter;
        this.options = options;
        this.ast = new AST(this.lexer);
        this.astCompiler = options.csp ? new ASTInterpreter(this.ast, $filter) : new ASTCompiler(this.ast, $filter);
      };
      Parser.prototype = {
        constructor: Parser,
        parse: function(text) {
          return this.astCompiler.compile(text, this.options.expensiveChecks);
        }
      };
      var getterFnCacheDefault = createMap();
      var getterFnCacheExpensive = createMap();
      function isPossiblyDangerousMemberName(name) {
        return name == 'constructor';
      }
      var objectValueOf = Object.prototype.valueOf;
      function getValueOf(value) {
        return isFunction(value.valueOf) ? value.valueOf() : objectValueOf.call(value);
      }
      function $ParseProvider() {
        var cacheDefault = createMap();
        var cacheExpensive = createMap();
        this.$get = ['$filter', function($filter) {
          var noUnsafeEval = csp().noUnsafeEval;
          var $parseOptions = {
            csp: noUnsafeEval,
            expensiveChecks: false
          },
              $parseOptionsExpensive = {
                csp: noUnsafeEval,
                expensiveChecks: true
              };
          return function $parse(exp, interceptorFn, expensiveChecks) {
            var parsedExpression,
                oneTime,
                cacheKey;
            switch (typeof exp) {
              case 'string':
                exp = exp.trim();
                cacheKey = exp;
                var cache = (expensiveChecks ? cacheExpensive : cacheDefault);
                parsedExpression = cache[cacheKey];
                if (!parsedExpression) {
                  if (exp.charAt(0) === ':' && exp.charAt(1) === ':') {
                    oneTime = true;
                    exp = exp.substring(2);
                  }
                  var parseOptions = expensiveChecks ? $parseOptionsExpensive : $parseOptions;
                  var lexer = new Lexer(parseOptions);
                  var parser = new Parser(lexer, $filter, parseOptions);
                  parsedExpression = parser.parse(exp);
                  if (parsedExpression.constant) {
                    parsedExpression.$$watchDelegate = constantWatchDelegate;
                  } else if (oneTime) {
                    parsedExpression.$$watchDelegate = parsedExpression.literal ? oneTimeLiteralWatchDelegate : oneTimeWatchDelegate;
                  } else if (parsedExpression.inputs) {
                    parsedExpression.$$watchDelegate = inputsWatchDelegate;
                  }
                  cache[cacheKey] = parsedExpression;
                }
                return addInterceptor(parsedExpression, interceptorFn);
              case 'function':
                return addInterceptor(exp, interceptorFn);
              default:
                return noop;
            }
          };
          function expressionInputDirtyCheck(newValue, oldValueOfValue) {
            if (newValue == null || oldValueOfValue == null) {
              return newValue === oldValueOfValue;
            }
            if (typeof newValue === 'object') {
              newValue = getValueOf(newValue);
              if (typeof newValue === 'object') {
                return false;
              }
            }
            return newValue === oldValueOfValue || (newValue !== newValue && oldValueOfValue !== oldValueOfValue);
          }
          function inputsWatchDelegate(scope, listener, objectEquality, parsedExpression, prettyPrintExpression) {
            var inputExpressions = parsedExpression.inputs;
            var lastResult;
            if (inputExpressions.length === 1) {
              var oldInputValueOf = expressionInputDirtyCheck;
              inputExpressions = inputExpressions[0];
              return scope.$watch(function expressionInputWatch(scope) {
                var newInputValue = inputExpressions(scope);
                if (!expressionInputDirtyCheck(newInputValue, oldInputValueOf)) {
                  lastResult = parsedExpression(scope, undefined, undefined, [newInputValue]);
                  oldInputValueOf = newInputValue && getValueOf(newInputValue);
                }
                return lastResult;
              }, listener, objectEquality, prettyPrintExpression);
            }
            var oldInputValueOfValues = [];
            var oldInputValues = [];
            for (var i = 0,
                ii = inputExpressions.length; i < ii; i++) {
              oldInputValueOfValues[i] = expressionInputDirtyCheck;
              oldInputValues[i] = null;
            }
            return scope.$watch(function expressionInputsWatch(scope) {
              var changed = false;
              for (var i = 0,
                  ii = inputExpressions.length; i < ii; i++) {
                var newInputValue = inputExpressions[i](scope);
                if (changed || (changed = !expressionInputDirtyCheck(newInputValue, oldInputValueOfValues[i]))) {
                  oldInputValues[i] = newInputValue;
                  oldInputValueOfValues[i] = newInputValue && getValueOf(newInputValue);
                }
              }
              if (changed) {
                lastResult = parsedExpression(scope, undefined, undefined, oldInputValues);
              }
              return lastResult;
            }, listener, objectEquality, prettyPrintExpression);
          }
          function oneTimeWatchDelegate(scope, listener, objectEquality, parsedExpression) {
            var unwatch,
                lastValue;
            return unwatch = scope.$watch(function oneTimeWatch(scope) {
              return parsedExpression(scope);
            }, function oneTimeListener(value, old, scope) {
              lastValue = value;
              if (isFunction(listener)) {
                listener.apply(this, arguments);
              }
              if (isDefined(value)) {
                scope.$$postDigest(function() {
                  if (isDefined(lastValue)) {
                    unwatch();
                  }
                });
              }
            }, objectEquality);
          }
          function oneTimeLiteralWatchDelegate(scope, listener, objectEquality, parsedExpression) {
            var unwatch,
                lastValue;
            return unwatch = scope.$watch(function oneTimeWatch(scope) {
              return parsedExpression(scope);
            }, function oneTimeListener(value, old, scope) {
              lastValue = value;
              if (isFunction(listener)) {
                listener.call(this, value, old, scope);
              }
              if (isAllDefined(value)) {
                scope.$$postDigest(function() {
                  if (isAllDefined(lastValue))
                    unwatch();
                });
              }
            }, objectEquality);
            function isAllDefined(value) {
              var allDefined = true;
              forEach(value, function(val) {
                if (!isDefined(val))
                  allDefined = false;
              });
              return allDefined;
            }
          }
          function constantWatchDelegate(scope, listener, objectEquality, parsedExpression) {
            var unwatch;
            return unwatch = scope.$watch(function constantWatch(scope) {
              return parsedExpression(scope);
            }, function constantListener(value, old, scope) {
              if (isFunction(listener)) {
                listener.apply(this, arguments);
              }
              unwatch();
            }, objectEquality);
          }
          function addInterceptor(parsedExpression, interceptorFn) {
            if (!interceptorFn)
              return parsedExpression;
            var watchDelegate = parsedExpression.$$watchDelegate;
            var useInputs = false;
            var regularWatch = watchDelegate !== oneTimeLiteralWatchDelegate && watchDelegate !== oneTimeWatchDelegate;
            var fn = regularWatch ? function regularInterceptedExpression(scope, locals, assign, inputs) {
              var value = useInputs && inputs ? inputs[0] : parsedExpression(scope, locals, assign, inputs);
              return interceptorFn(value, scope, locals);
            } : function oneTimeInterceptedExpression(scope, locals, assign, inputs) {
              var value = parsedExpression(scope, locals, assign, inputs);
              var result = interceptorFn(value, scope, locals);
              return isDefined(value) ? result : value;
            };
            if (parsedExpression.$$watchDelegate && parsedExpression.$$watchDelegate !== inputsWatchDelegate) {
              fn.$$watchDelegate = parsedExpression.$$watchDelegate;
            } else if (!interceptorFn.$stateful) {
              fn.$$watchDelegate = inputsWatchDelegate;
              useInputs = !parsedExpression.inputs;
              fn.inputs = parsedExpression.inputs ? parsedExpression.inputs : [parsedExpression];
            }
            return fn;
          }
        }];
      }
      function $QProvider() {
        this.$get = ['$rootScope', '$exceptionHandler', function($rootScope, $exceptionHandler) {
          return qFactory(function(callback) {
            $rootScope.$evalAsync(callback);
          }, $exceptionHandler);
        }];
      }
      function $$QProvider() {
        this.$get = ['$browser', '$exceptionHandler', function($browser, $exceptionHandler) {
          return qFactory(function(callback) {
            $browser.defer(callback);
          }, $exceptionHandler);
        }];
      }
      function qFactory(nextTick, exceptionHandler) {
        var $qMinErr = minErr('$q', TypeError);
        function callOnce(self, resolveFn, rejectFn) {
          var called = false;
          function wrap(fn) {
            return function(value) {
              if (called)
                return;
              called = true;
              fn.call(self, value);
            };
          }
          return [wrap(resolveFn), wrap(rejectFn)];
        }
        var defer = function() {
          return new Deferred();
        };
        function Promise() {
          this.$$state = {status: 0};
        }
        extend(Promise.prototype, {
          then: function(onFulfilled, onRejected, progressBack) {
            if (isUndefined(onFulfilled) && isUndefined(onRejected) && isUndefined(progressBack)) {
              return this;
            }
            var result = new Deferred();
            this.$$state.pending = this.$$state.pending || [];
            this.$$state.pending.push([result, onFulfilled, onRejected, progressBack]);
            if (this.$$state.status > 0)
              scheduleProcessQueue(this.$$state);
            return result.promise;
          },
          "catch": function(callback) {
            return this.then(null, callback);
          },
          "finally": function(callback, progressBack) {
            return this.then(function(value) {
              return handleCallback(value, true, callback);
            }, function(error) {
              return handleCallback(error, false, callback);
            }, progressBack);
          }
        });
        function simpleBind(context, fn) {
          return function(value) {
            fn.call(context, value);
          };
        }
        function processQueue(state) {
          var fn,
              deferred,
              pending;
          pending = state.pending;
          state.processScheduled = false;
          state.pending = undefined;
          for (var i = 0,
              ii = pending.length; i < ii; ++i) {
            deferred = pending[i][0];
            fn = pending[i][state.status];
            try {
              if (isFunction(fn)) {
                deferred.resolve(fn(state.value));
              } else if (state.status === 1) {
                deferred.resolve(state.value);
              } else {
                deferred.reject(state.value);
              }
            } catch (e) {
              deferred.reject(e);
              exceptionHandler(e);
            }
          }
        }
        function scheduleProcessQueue(state) {
          if (state.processScheduled || !state.pending)
            return;
          state.processScheduled = true;
          nextTick(function() {
            processQueue(state);
          });
        }
        function Deferred() {
          this.promise = new Promise();
          this.resolve = simpleBind(this, this.resolve);
          this.reject = simpleBind(this, this.reject);
          this.notify = simpleBind(this, this.notify);
        }
        extend(Deferred.prototype, {
          resolve: function(val) {
            if (this.promise.$$state.status)
              return;
            if (val === this.promise) {
              this.$$reject($qMinErr('qcycle', "Expected promise to be resolved with value other than itself '{0}'", val));
            } else {
              this.$$resolve(val);
            }
          },
          $$resolve: function(val) {
            var then,
                fns;
            fns = callOnce(this, this.$$resolve, this.$$reject);
            try {
              if ((isObject(val) || isFunction(val)))
                then = val && val.then;
              if (isFunction(then)) {
                this.promise.$$state.status = -1;
                then.call(val, fns[0], fns[1], this.notify);
              } else {
                this.promise.$$state.value = val;
                this.promise.$$state.status = 1;
                scheduleProcessQueue(this.promise.$$state);
              }
            } catch (e) {
              fns[1](e);
              exceptionHandler(e);
            }
          },
          reject: function(reason) {
            if (this.promise.$$state.status)
              return;
            this.$$reject(reason);
          },
          $$reject: function(reason) {
            this.promise.$$state.value = reason;
            this.promise.$$state.status = 2;
            scheduleProcessQueue(this.promise.$$state);
          },
          notify: function(progress) {
            var callbacks = this.promise.$$state.pending;
            if ((this.promise.$$state.status <= 0) && callbacks && callbacks.length) {
              nextTick(function() {
                var callback,
                    result;
                for (var i = 0,
                    ii = callbacks.length; i < ii; i++) {
                  result = callbacks[i][0];
                  callback = callbacks[i][3];
                  try {
                    result.notify(isFunction(callback) ? callback(progress) : progress);
                  } catch (e) {
                    exceptionHandler(e);
                  }
                }
              });
            }
          }
        });
        var reject = function(reason) {
          var result = new Deferred();
          result.reject(reason);
          return result.promise;
        };
        var makePromise = function makePromise(value, resolved) {
          var result = new Deferred();
          if (resolved) {
            result.resolve(value);
          } else {
            result.reject(value);
          }
          return result.promise;
        };
        var handleCallback = function handleCallback(value, isResolved, callback) {
          var callbackOutput = null;
          try {
            if (isFunction(callback))
              callbackOutput = callback();
          } catch (e) {
            return makePromise(e, false);
          }
          if (isPromiseLike(callbackOutput)) {
            return callbackOutput.then(function() {
              return makePromise(value, isResolved);
            }, function(error) {
              return makePromise(error, false);
            });
          } else {
            return makePromise(value, isResolved);
          }
        };
        var when = function(value, callback, errback, progressBack) {
          var result = new Deferred();
          result.resolve(value);
          return result.promise.then(callback, errback, progressBack);
        };
        var resolve = when;
        function all(promises) {
          var deferred = new Deferred(),
              counter = 0,
              results = isArray(promises) ? [] : {};
          forEach(promises, function(promise, key) {
            counter++;
            when(promise).then(function(value) {
              if (results.hasOwnProperty(key))
                return;
              results[key] = value;
              if (!(--counter))
                deferred.resolve(results);
            }, function(reason) {
              if (results.hasOwnProperty(key))
                return;
              deferred.reject(reason);
            });
          });
          if (counter === 0) {
            deferred.resolve(results);
          }
          return deferred.promise;
        }
        var $Q = function Q(resolver) {
          if (!isFunction(resolver)) {
            throw $qMinErr('norslvr', "Expected resolverFn, got '{0}'", resolver);
          }
          if (!(this instanceof Q)) {
            return new Q(resolver);
          }
          var deferred = new Deferred();
          function resolveFn(value) {
            deferred.resolve(value);
          }
          function rejectFn(reason) {
            deferred.reject(reason);
          }
          resolver(resolveFn, rejectFn);
          return deferred.promise;
        };
        $Q.defer = defer;
        $Q.reject = reject;
        $Q.when = when;
        $Q.resolve = resolve;
        $Q.all = all;
        return $Q;
      }
      function $$RAFProvider() {
        this.$get = ['$window', '$timeout', function($window, $timeout) {
          var requestAnimationFrame = $window.requestAnimationFrame || $window.webkitRequestAnimationFrame;
          var cancelAnimationFrame = $window.cancelAnimationFrame || $window.webkitCancelAnimationFrame || $window.webkitCancelRequestAnimationFrame;
          var rafSupported = !!requestAnimationFrame;
          var raf = rafSupported ? function(fn) {
            var id = requestAnimationFrame(fn);
            return function() {
              cancelAnimationFrame(id);
            };
          } : function(fn) {
            var timer = $timeout(fn, 16.66, false);
            return function() {
              $timeout.cancel(timer);
            };
          };
          raf.supported = rafSupported;
          return raf;
        }];
      }
      function $RootScopeProvider() {
        var TTL = 10;
        var $rootScopeMinErr = minErr('$rootScope');
        var lastDirtyWatch = null;
        var applyAsyncId = null;
        this.digestTtl = function(value) {
          if (arguments.length) {
            TTL = value;
          }
          return TTL;
        };
        function createChildScopeClass(parent) {
          function ChildScope() {
            this.$$watchers = this.$$nextSibling = this.$$childHead = this.$$childTail = null;
            this.$$listeners = {};
            this.$$listenerCount = {};
            this.$$watchersCount = 0;
            this.$id = nextUid();
            this.$$ChildScope = null;
          }
          ChildScope.prototype = parent;
          return ChildScope;
        }
        this.$get = ['$injector', '$exceptionHandler', '$parse', '$browser', function($injector, $exceptionHandler, $parse, $browser) {
          function destroyChildScope($event) {
            $event.currentScope.$$destroyed = true;
          }
          function cleanUpScope($scope) {
            if (msie === 9) {
              $scope.$$childHead && cleanUpScope($scope.$$childHead);
              $scope.$$nextSibling && cleanUpScope($scope.$$nextSibling);
            }
            $scope.$parent = $scope.$$nextSibling = $scope.$$prevSibling = $scope.$$childHead = $scope.$$childTail = $scope.$root = $scope.$$watchers = null;
          }
          function Scope() {
            this.$id = nextUid();
            this.$$phase = this.$parent = this.$$watchers = this.$$nextSibling = this.$$prevSibling = this.$$childHead = this.$$childTail = null;
            this.$root = this;
            this.$$destroyed = false;
            this.$$listeners = {};
            this.$$listenerCount = {};
            this.$$watchersCount = 0;
            this.$$isolateBindings = null;
          }
          Scope.prototype = {
            constructor: Scope,
            $new: function(isolate, parent) {
              var child;
              parent = parent || this;
              if (isolate) {
                child = new Scope();
                child.$root = this.$root;
              } else {
                if (!this.$$ChildScope) {
                  this.$$ChildScope = createChildScopeClass(this);
                }
                child = new this.$$ChildScope();
              }
              child.$parent = parent;
              child.$$prevSibling = parent.$$childTail;
              if (parent.$$childHead) {
                parent.$$childTail.$$nextSibling = child;
                parent.$$childTail = child;
              } else {
                parent.$$childHead = parent.$$childTail = child;
              }
              if (isolate || parent != this)
                child.$on('$destroy', destroyChildScope);
              return child;
            },
            $watch: function(watchExp, listener, objectEquality, prettyPrintExpression) {
              var get = $parse(watchExp);
              if (get.$$watchDelegate) {
                return get.$$watchDelegate(this, listener, objectEquality, get, watchExp);
              }
              var scope = this,
                  array = scope.$$watchers,
                  watcher = {
                    fn: listener,
                    last: initWatchVal,
                    get: get,
                    exp: prettyPrintExpression || watchExp,
                    eq: !!objectEquality
                  };
              lastDirtyWatch = null;
              if (!isFunction(listener)) {
                watcher.fn = noop;
              }
              if (!array) {
                array = scope.$$watchers = [];
              }
              array.unshift(watcher);
              incrementWatchersCount(this, 1);
              return function deregisterWatch() {
                if (arrayRemove(array, watcher) >= 0) {
                  incrementWatchersCount(scope, -1);
                }
                lastDirtyWatch = null;
              };
            },
            $watchGroup: function(watchExpressions, listener) {
              var oldValues = new Array(watchExpressions.length);
              var newValues = new Array(watchExpressions.length);
              var deregisterFns = [];
              var self = this;
              var changeReactionScheduled = false;
              var firstRun = true;
              if (!watchExpressions.length) {
                var shouldCall = true;
                self.$evalAsync(function() {
                  if (shouldCall)
                    listener(newValues, newValues, self);
                });
                return function deregisterWatchGroup() {
                  shouldCall = false;
                };
              }
              if (watchExpressions.length === 1) {
                return this.$watch(watchExpressions[0], function watchGroupAction(value, oldValue, scope) {
                  newValues[0] = value;
                  oldValues[0] = oldValue;
                  listener(newValues, (value === oldValue) ? newValues : oldValues, scope);
                });
              }
              forEach(watchExpressions, function(expr, i) {
                var unwatchFn = self.$watch(expr, function watchGroupSubAction(value, oldValue) {
                  newValues[i] = value;
                  oldValues[i] = oldValue;
                  if (!changeReactionScheduled) {
                    changeReactionScheduled = true;
                    self.$evalAsync(watchGroupAction);
                  }
                });
                deregisterFns.push(unwatchFn);
              });
              function watchGroupAction() {
                changeReactionScheduled = false;
                if (firstRun) {
                  firstRun = false;
                  listener(newValues, newValues, self);
                } else {
                  listener(newValues, oldValues, self);
                }
              }
              return function deregisterWatchGroup() {
                while (deregisterFns.length) {
                  deregisterFns.shift()();
                }
              };
            },
            $watchCollection: function(obj, listener) {
              $watchCollectionInterceptor.$stateful = true;
              var self = this;
              var newValue;
              var oldValue;
              var veryOldValue;
              var trackVeryOldValue = (listener.length > 1);
              var changeDetected = 0;
              var changeDetector = $parse(obj, $watchCollectionInterceptor);
              var internalArray = [];
              var internalObject = {};
              var initRun = true;
              var oldLength = 0;
              function $watchCollectionInterceptor(_value) {
                newValue = _value;
                var newLength,
                    key,
                    bothNaN,
                    newItem,
                    oldItem;
                if (isUndefined(newValue))
                  return;
                if (!isObject(newValue)) {
                  if (oldValue !== newValue) {
                    oldValue = newValue;
                    changeDetected++;
                  }
                } else if (isArrayLike(newValue)) {
                  if (oldValue !== internalArray) {
                    oldValue = internalArray;
                    oldLength = oldValue.length = 0;
                    changeDetected++;
                  }
                  newLength = newValue.length;
                  if (oldLength !== newLength) {
                    changeDetected++;
                    oldValue.length = oldLength = newLength;
                  }
                  for (var i = 0; i < newLength; i++) {
                    oldItem = oldValue[i];
                    newItem = newValue[i];
                    bothNaN = (oldItem !== oldItem) && (newItem !== newItem);
                    if (!bothNaN && (oldItem !== newItem)) {
                      changeDetected++;
                      oldValue[i] = newItem;
                    }
                  }
                } else {
                  if (oldValue !== internalObject) {
                    oldValue = internalObject = {};
                    oldLength = 0;
                    changeDetected++;
                  }
                  newLength = 0;
                  for (key in newValue) {
                    if (hasOwnProperty.call(newValue, key)) {
                      newLength++;
                      newItem = newValue[key];
                      oldItem = oldValue[key];
                      if (key in oldValue) {
                        bothNaN = (oldItem !== oldItem) && (newItem !== newItem);
                        if (!bothNaN && (oldItem !== newItem)) {
                          changeDetected++;
                          oldValue[key] = newItem;
                        }
                      } else {
                        oldLength++;
                        oldValue[key] = newItem;
                        changeDetected++;
                      }
                    }
                  }
                  if (oldLength > newLength) {
                    changeDetected++;
                    for (key in oldValue) {
                      if (!hasOwnProperty.call(newValue, key)) {
                        oldLength--;
                        delete oldValue[key];
                      }
                    }
                  }
                }
                return changeDetected;
              }
              function $watchCollectionAction() {
                if (initRun) {
                  initRun = false;
                  listener(newValue, newValue, self);
                } else {
                  listener(newValue, veryOldValue, self);
                }
                if (trackVeryOldValue) {
                  if (!isObject(newValue)) {
                    veryOldValue = newValue;
                  } else if (isArrayLike(newValue)) {
                    veryOldValue = new Array(newValue.length);
                    for (var i = 0; i < newValue.length; i++) {
                      veryOldValue[i] = newValue[i];
                    }
                  } else {
                    veryOldValue = {};
                    for (var key in newValue) {
                      if (hasOwnProperty.call(newValue, key)) {
                        veryOldValue[key] = newValue[key];
                      }
                    }
                  }
                }
              }
              return this.$watch(changeDetector, $watchCollectionAction);
            },
            $digest: function() {
              var watch,
                  value,
                  last,
                  watchers,
                  length,
                  dirty,
                  ttl = TTL,
                  next,
                  current,
                  target = this,
                  watchLog = [],
                  logIdx,
                  logMsg,
                  asyncTask;
              beginPhase('$digest');
              $browser.$$checkUrlChange();
              if (this === $rootScope && applyAsyncId !== null) {
                $browser.defer.cancel(applyAsyncId);
                flushApplyAsync();
              }
              lastDirtyWatch = null;
              do {
                dirty = false;
                current = target;
                while (asyncQueue.length) {
                  try {
                    asyncTask = asyncQueue.shift();
                    asyncTask.scope.$eval(asyncTask.expression, asyncTask.locals);
                  } catch (e) {
                    $exceptionHandler(e);
                  }
                  lastDirtyWatch = null;
                }
                traverseScopesLoop: do {
                  if ((watchers = current.$$watchers)) {
                    length = watchers.length;
                    while (length--) {
                      try {
                        watch = watchers[length];
                        if (watch) {
                          if ((value = watch.get(current)) !== (last = watch.last) && !(watch.eq ? equals(value, last) : (typeof value === 'number' && typeof last === 'number' && isNaN(value) && isNaN(last)))) {
                            dirty = true;
                            lastDirtyWatch = watch;
                            watch.last = watch.eq ? copy(value, null) : value;
                            watch.fn(value, ((last === initWatchVal) ? value : last), current);
                            if (ttl < 5) {
                              logIdx = 4 - ttl;
                              if (!watchLog[logIdx])
                                watchLog[logIdx] = [];
                              watchLog[logIdx].push({
                                msg: isFunction(watch.exp) ? 'fn: ' + (watch.exp.name || watch.exp.toString()) : watch.exp,
                                newVal: value,
                                oldVal: last
                              });
                            }
                          } else if (watch === lastDirtyWatch) {
                            dirty = false;
                            break traverseScopesLoop;
                          }
                        }
                      } catch (e) {
                        $exceptionHandler(e);
                      }
                    }
                  }
                  if (!(next = ((current.$$watchersCount && current.$$childHead) || (current !== target && current.$$nextSibling)))) {
                    while (current !== target && !(next = current.$$nextSibling)) {
                      current = current.$parent;
                    }
                  }
                } while ((current = next));
                if ((dirty || asyncQueue.length) && !(ttl--)) {
                  clearPhase();
                  throw $rootScopeMinErr('infdig', '{0} $digest() iterations reached. Aborting!\n' + 'Watchers fired in the last 5 iterations: {1}', TTL, watchLog);
                }
              } while (dirty || asyncQueue.length);
              clearPhase();
              while (postDigestQueue.length) {
                try {
                  postDigestQueue.shift()();
                } catch (e) {
                  $exceptionHandler(e);
                }
              }
            },
            $destroy: function() {
              if (this.$$destroyed)
                return;
              var parent = this.$parent;
              this.$broadcast('$destroy');
              this.$$destroyed = true;
              if (this === $rootScope) {
                $browser.$$applicationDestroyed();
              }
              incrementWatchersCount(this, -this.$$watchersCount);
              for (var eventName in this.$$listenerCount) {
                decrementListenerCount(this, this.$$listenerCount[eventName], eventName);
              }
              if (parent && parent.$$childHead == this)
                parent.$$childHead = this.$$nextSibling;
              if (parent && parent.$$childTail == this)
                parent.$$childTail = this.$$prevSibling;
              if (this.$$prevSibling)
                this.$$prevSibling.$$nextSibling = this.$$nextSibling;
              if (this.$$nextSibling)
                this.$$nextSibling.$$prevSibling = this.$$prevSibling;
              this.$destroy = this.$digest = this.$apply = this.$evalAsync = this.$applyAsync = noop;
              this.$on = this.$watch = this.$watchGroup = function() {
                return noop;
              };
              this.$$listeners = {};
              this.$$nextSibling = null;
              cleanUpScope(this);
            },
            $eval: function(expr, locals) {
              return $parse(expr)(this, locals);
            },
            $evalAsync: function(expr, locals) {
              if (!$rootScope.$$phase && !asyncQueue.length) {
                $browser.defer(function() {
                  if (asyncQueue.length) {
                    $rootScope.$digest();
                  }
                });
              }
              asyncQueue.push({
                scope: this,
                expression: expr,
                locals: locals
              });
            },
            $$postDigest: function(fn) {
              postDigestQueue.push(fn);
            },
            $apply: function(expr) {
              try {
                beginPhase('$apply');
                try {
                  return this.$eval(expr);
                } finally {
                  clearPhase();
                }
              } catch (e) {
                $exceptionHandler(e);
              } finally {
                try {
                  $rootScope.$digest();
                } catch (e) {
                  $exceptionHandler(e);
                  throw e;
                }
              }
            },
            $applyAsync: function(expr) {
              var scope = this;
              expr && applyAsyncQueue.push($applyAsyncExpression);
              scheduleApplyAsync();
              function $applyAsyncExpression() {
                scope.$eval(expr);
              }
            },
            $on: function(name, listener) {
              var namedListeners = this.$$listeners[name];
              if (!namedListeners) {
                this.$$listeners[name] = namedListeners = [];
              }
              namedListeners.push(listener);
              var current = this;
              do {
                if (!current.$$listenerCount[name]) {
                  current.$$listenerCount[name] = 0;
                }
                current.$$listenerCount[name]++;
              } while ((current = current.$parent));
              var self = this;
              return function() {
                var indexOfListener = namedListeners.indexOf(listener);
                if (indexOfListener !== -1) {
                  namedListeners[indexOfListener] = null;
                  decrementListenerCount(self, 1, name);
                }
              };
            },
            $emit: function(name, args) {
              var empty = [],
                  namedListeners,
                  scope = this,
                  stopPropagation = false,
                  event = {
                    name: name,
                    targetScope: scope,
                    stopPropagation: function() {
                      stopPropagation = true;
                    },
                    preventDefault: function() {
                      event.defaultPrevented = true;
                    },
                    defaultPrevented: false
                  },
                  listenerArgs = concat([event], arguments, 1),
                  i,
                  length;
              do {
                namedListeners = scope.$$listeners[name] || empty;
                event.currentScope = scope;
                for (i = 0, length = namedListeners.length; i < length; i++) {
                  if (!namedListeners[i]) {
                    namedListeners.splice(i, 1);
                    i--;
                    length--;
                    continue;
                  }
                  try {
                    namedListeners[i].apply(null, listenerArgs);
                  } catch (e) {
                    $exceptionHandler(e);
                  }
                }
                if (stopPropagation) {
                  event.currentScope = null;
                  return event;
                }
                scope = scope.$parent;
              } while (scope);
              event.currentScope = null;
              return event;
            },
            $broadcast: function(name, args) {
              var target = this,
                  current = target,
                  next = target,
                  event = {
                    name: name,
                    targetScope: target,
                    preventDefault: function() {
                      event.defaultPrevented = true;
                    },
                    defaultPrevented: false
                  };
              if (!target.$$listenerCount[name])
                return event;
              var listenerArgs = concat([event], arguments, 1),
                  listeners,
                  i,
                  length;
              while ((current = next)) {
                event.currentScope = current;
                listeners = current.$$listeners[name] || [];
                for (i = 0, length = listeners.length; i < length; i++) {
                  if (!listeners[i]) {
                    listeners.splice(i, 1);
                    i--;
                    length--;
                    continue;
                  }
                  try {
                    listeners[i].apply(null, listenerArgs);
                  } catch (e) {
                    $exceptionHandler(e);
                  }
                }
                if (!(next = ((current.$$listenerCount[name] && current.$$childHead) || (current !== target && current.$$nextSibling)))) {
                  while (current !== target && !(next = current.$$nextSibling)) {
                    current = current.$parent;
                  }
                }
              }
              event.currentScope = null;
              return event;
            }
          };
          var $rootScope = new Scope();
          var asyncQueue = $rootScope.$$asyncQueue = [];
          var postDigestQueue = $rootScope.$$postDigestQueue = [];
          var applyAsyncQueue = $rootScope.$$applyAsyncQueue = [];
          return $rootScope;
          function beginPhase(phase) {
            if ($rootScope.$$phase) {
              throw $rootScopeMinErr('inprog', '{0} already in progress', $rootScope.$$phase);
            }
            $rootScope.$$phase = phase;
          }
          function clearPhase() {
            $rootScope.$$phase = null;
          }
          function incrementWatchersCount(current, count) {
            do {
              current.$$watchersCount += count;
            } while ((current = current.$parent));
          }
          function decrementListenerCount(current, count, name) {
            do {
              current.$$listenerCount[name] -= count;
              if (current.$$listenerCount[name] === 0) {
                delete current.$$listenerCount[name];
              }
            } while ((current = current.$parent));
          }
          function initWatchVal() {}
          function flushApplyAsync() {
            while (applyAsyncQueue.length) {
              try {
                applyAsyncQueue.shift()();
              } catch (e) {
                $exceptionHandler(e);
              }
            }
            applyAsyncId = null;
          }
          function scheduleApplyAsync() {
            if (applyAsyncId === null) {
              applyAsyncId = $browser.defer(function() {
                $rootScope.$apply(flushApplyAsync);
              });
            }
          }
        }];
      }
      function $$SanitizeUriProvider() {
        var aHrefSanitizationWhitelist = /^\s*(https?|ftp|mailto|tel|file):/,
            imgSrcSanitizationWhitelist = /^\s*((https?|ftp|file|blob):|data:image\/)/;
        this.aHrefSanitizationWhitelist = function(regexp) {
          if (isDefined(regexp)) {
            aHrefSanitizationWhitelist = regexp;
            return this;
          }
          return aHrefSanitizationWhitelist;
        };
        this.imgSrcSanitizationWhitelist = function(regexp) {
          if (isDefined(regexp)) {
            imgSrcSanitizationWhitelist = regexp;
            return this;
          }
          return imgSrcSanitizationWhitelist;
        };
        this.$get = function() {
          return function sanitizeUri(uri, isImage) {
            var regex = isImage ? imgSrcSanitizationWhitelist : aHrefSanitizationWhitelist;
            var normalizedVal;
            normalizedVal = urlResolve(uri).href;
            if (normalizedVal !== '' && !normalizedVal.match(regex)) {
              return 'unsafe:' + normalizedVal;
            }
            return uri;
          };
        };
      }
      var $sceMinErr = minErr('$sce');
      var SCE_CONTEXTS = {
        HTML: 'html',
        CSS: 'css',
        URL: 'url',
        RESOURCE_URL: 'resourceUrl',
        JS: 'js'
      };
      function adjustMatcher(matcher) {
        if (matcher === 'self') {
          return matcher;
        } else if (isString(matcher)) {
          if (matcher.indexOf('***') > -1) {
            throw $sceMinErr('iwcard', 'Illegal sequence *** in string matcher.  String: {0}', matcher);
          }
          matcher = escapeForRegexp(matcher).replace('\\*\\*', '.*').replace('\\*', '[^:/.?&;]*');
          return new RegExp('^' + matcher + '$');
        } else if (isRegExp(matcher)) {
          return new RegExp('^' + matcher.source + '$');
        } else {
          throw $sceMinErr('imatcher', 'Matchers may only be "self", string patterns or RegExp objects');
        }
      }
      function adjustMatchers(matchers) {
        var adjustedMatchers = [];
        if (isDefined(matchers)) {
          forEach(matchers, function(matcher) {
            adjustedMatchers.push(adjustMatcher(matcher));
          });
        }
        return adjustedMatchers;
      }
      function $SceDelegateProvider() {
        this.SCE_CONTEXTS = SCE_CONTEXTS;
        var resourceUrlWhitelist = ['self'],
            resourceUrlBlacklist = [];
        this.resourceUrlWhitelist = function(value) {
          if (arguments.length) {
            resourceUrlWhitelist = adjustMatchers(value);
          }
          return resourceUrlWhitelist;
        };
        this.resourceUrlBlacklist = function(value) {
          if (arguments.length) {
            resourceUrlBlacklist = adjustMatchers(value);
          }
          return resourceUrlBlacklist;
        };
        this.$get = ['$injector', function($injector) {
          var htmlSanitizer = function htmlSanitizer(html) {
            throw $sceMinErr('unsafe', 'Attempting to use an unsafe value in a safe context.');
          };
          if ($injector.has('$sanitize')) {
            htmlSanitizer = $injector.get('$sanitize');
          }
          function matchUrl(matcher, parsedUrl) {
            if (matcher === 'self') {
              return urlIsSameOrigin(parsedUrl);
            } else {
              return !!matcher.exec(parsedUrl.href);
            }
          }
          function isResourceUrlAllowedByPolicy(url) {
            var parsedUrl = urlResolve(url.toString());
            var i,
                n,
                allowed = false;
            for (i = 0, n = resourceUrlWhitelist.length; i < n; i++) {
              if (matchUrl(resourceUrlWhitelist[i], parsedUrl)) {
                allowed = true;
                break;
              }
            }
            if (allowed) {
              for (i = 0, n = resourceUrlBlacklist.length; i < n; i++) {
                if (matchUrl(resourceUrlBlacklist[i], parsedUrl)) {
                  allowed = false;
                  break;
                }
              }
            }
            return allowed;
          }
          function generateHolderType(Base) {
            var holderType = function TrustedValueHolderType(trustedValue) {
              this.$$unwrapTrustedValue = function() {
                return trustedValue;
              };
            };
            if (Base) {
              holderType.prototype = new Base();
            }
            holderType.prototype.valueOf = function sceValueOf() {
              return this.$$unwrapTrustedValue();
            };
            holderType.prototype.toString = function sceToString() {
              return this.$$unwrapTrustedValue().toString();
            };
            return holderType;
          }
          var trustedValueHolderBase = generateHolderType(),
              byType = {};
          byType[SCE_CONTEXTS.HTML] = generateHolderType(trustedValueHolderBase);
          byType[SCE_CONTEXTS.CSS] = generateHolderType(trustedValueHolderBase);
          byType[SCE_CONTEXTS.URL] = generateHolderType(trustedValueHolderBase);
          byType[SCE_CONTEXTS.JS] = generateHolderType(trustedValueHolderBase);
          byType[SCE_CONTEXTS.RESOURCE_URL] = generateHolderType(byType[SCE_CONTEXTS.URL]);
          function trustAs(type, trustedValue) {
            var Constructor = (byType.hasOwnProperty(type) ? byType[type] : null);
            if (!Constructor) {
              throw $sceMinErr('icontext', 'Attempted to trust a value in invalid context. Context: {0}; Value: {1}', type, trustedValue);
            }
            if (trustedValue === null || isUndefined(trustedValue) || trustedValue === '') {
              return trustedValue;
            }
            if (typeof trustedValue !== 'string') {
              throw $sceMinErr('itype', 'Attempted to trust a non-string value in a content requiring a string: Context: {0}', type);
            }
            return new Constructor(trustedValue);
          }
          function valueOf(maybeTrusted) {
            if (maybeTrusted instanceof trustedValueHolderBase) {
              return maybeTrusted.$$unwrapTrustedValue();
            } else {
              return maybeTrusted;
            }
          }
          function getTrusted(type, maybeTrusted) {
            if (maybeTrusted === null || isUndefined(maybeTrusted) || maybeTrusted === '') {
              return maybeTrusted;
            }
            var constructor = (byType.hasOwnProperty(type) ? byType[type] : null);
            if (constructor && maybeTrusted instanceof constructor) {
              return maybeTrusted.$$unwrapTrustedValue();
            }
            if (type === SCE_CONTEXTS.RESOURCE_URL) {
              if (isResourceUrlAllowedByPolicy(maybeTrusted)) {
                return maybeTrusted;
              } else {
                throw $sceMinErr('insecurl', 'Blocked loading resource from url not allowed by $sceDelegate policy.  URL: {0}', maybeTrusted.toString());
              }
            } else if (type === SCE_CONTEXTS.HTML) {
              return htmlSanitizer(maybeTrusted);
            }
            throw $sceMinErr('unsafe', 'Attempting to use an unsafe value in a safe context.');
          }
          return {
            trustAs: trustAs,
            getTrusted: getTrusted,
            valueOf: valueOf
          };
        }];
      }
      function $SceProvider() {
        var enabled = true;
        this.enabled = function(value) {
          if (arguments.length) {
            enabled = !!value;
          }
          return enabled;
        };
        this.$get = ['$parse', '$sceDelegate', function($parse, $sceDelegate) {
          if (enabled && msie < 8) {
            throw $sceMinErr('iequirks', 'Strict Contextual Escaping does not support Internet Explorer version < 11 in quirks ' + 'mode.  You can fix this by adding the text <!doctype html> to the top of your HTML ' + 'document.  See http://docs.angularjs.org/api/ng.$sce for more information.');
          }
          var sce = shallowCopy(SCE_CONTEXTS);
          sce.isEnabled = function() {
            return enabled;
          };
          sce.trustAs = $sceDelegate.trustAs;
          sce.getTrusted = $sceDelegate.getTrusted;
          sce.valueOf = $sceDelegate.valueOf;
          if (!enabled) {
            sce.trustAs = sce.getTrusted = function(type, value) {
              return value;
            };
            sce.valueOf = identity;
          }
          sce.parseAs = function sceParseAs(type, expr) {
            var parsed = $parse(expr);
            if (parsed.literal && parsed.constant) {
              return parsed;
            } else {
              return $parse(expr, function(value) {
                return sce.getTrusted(type, value);
              });
            }
          };
          var parse = sce.parseAs,
              getTrusted = sce.getTrusted,
              trustAs = sce.trustAs;
          forEach(SCE_CONTEXTS, function(enumValue, name) {
            var lName = lowercase(name);
            sce[camelCase("parse_as_" + lName)] = function(expr) {
              return parse(enumValue, expr);
            };
            sce[camelCase("get_trusted_" + lName)] = function(value) {
              return getTrusted(enumValue, value);
            };
            sce[camelCase("trust_as_" + lName)] = function(value) {
              return trustAs(enumValue, value);
            };
          });
          return sce;
        }];
      }
      function $SnifferProvider() {
        this.$get = ['$window', '$document', function($window, $document) {
          var eventSupport = {},
              android = toInt((/android (\d+)/.exec(lowercase(($window.navigator || {}).userAgent)) || [])[1]),
              boxee = /Boxee/i.test(($window.navigator || {}).userAgent),
              document = $document[0] || {},
              vendorPrefix,
              vendorRegex = /^(Moz|webkit|ms)(?=[A-Z])/,
              bodyStyle = document.body && document.body.style,
              transitions = false,
              animations = false,
              match;
          if (bodyStyle) {
            for (var prop in bodyStyle) {
              if (match = vendorRegex.exec(prop)) {
                vendorPrefix = match[0];
                vendorPrefix = vendorPrefix.substr(0, 1).toUpperCase() + vendorPrefix.substr(1);
                break;
              }
            }
            if (!vendorPrefix) {
              vendorPrefix = ('WebkitOpacity' in bodyStyle) && 'webkit';
            }
            transitions = !!(('transition' in bodyStyle) || (vendorPrefix + 'Transition' in bodyStyle));
            animations = !!(('animation' in bodyStyle) || (vendorPrefix + 'Animation' in bodyStyle));
            if (android && (!transitions || !animations)) {
              transitions = isString(bodyStyle.webkitTransition);
              animations = isString(bodyStyle.webkitAnimation);
            }
          }
          return {
            history: !!($window.history && $window.history.pushState && !(android < 4) && !boxee),
            hasEvent: function(event) {
              if (event === 'input' && msie <= 11)
                return false;
              if (isUndefined(eventSupport[event])) {
                var divElm = document.createElement('div');
                eventSupport[event] = 'on' + event in divElm;
              }
              return eventSupport[event];
            },
            csp: csp(),
            vendorPrefix: vendorPrefix,
            transitions: transitions,
            animations: animations,
            android: android
          };
        }];
      }
      var $compileMinErr = minErr('$compile');
      function $TemplateRequestProvider() {
        this.$get = ['$templateCache', '$http', '$q', '$sce', function($templateCache, $http, $q, $sce) {
          function handleRequestFn(tpl, ignoreRequestError) {
            handleRequestFn.totalPendingRequests++;
            if (!isString(tpl) || !$templateCache.get(tpl)) {
              tpl = $sce.getTrustedResourceUrl(tpl);
            }
            var transformResponse = $http.defaults && $http.defaults.transformResponse;
            if (isArray(transformResponse)) {
              transformResponse = transformResponse.filter(function(transformer) {
                return transformer !== defaultHttpResponseTransform;
              });
            } else if (transformResponse === defaultHttpResponseTransform) {
              transformResponse = null;
            }
            var httpOptions = {
              cache: $templateCache,
              transformResponse: transformResponse
            };
            return $http.get(tpl, httpOptions)['finally'](function() {
              handleRequestFn.totalPendingRequests--;
            }).then(function(response) {
              $templateCache.put(tpl, response.data);
              return response.data;
            }, handleError);
            function handleError(resp) {
              if (!ignoreRequestError) {
                throw $compileMinErr('tpload', 'Failed to load template: {0} (HTTP status: {1} {2})', tpl, resp.status, resp.statusText);
              }
              return $q.reject(resp);
            }
          }
          handleRequestFn.totalPendingRequests = 0;
          return handleRequestFn;
        }];
      }
      function $$TestabilityProvider() {
        this.$get = ['$rootScope', '$browser', '$location', function($rootScope, $browser, $location) {
          var testability = {};
          testability.findBindings = function(element, expression, opt_exactMatch) {
            var bindings = element.getElementsByClassName('ng-binding');
            var matches = [];
            forEach(bindings, function(binding) {
              var dataBinding = angular.element(binding).data('$binding');
              if (dataBinding) {
                forEach(dataBinding, function(bindingName) {
                  if (opt_exactMatch) {
                    var matcher = new RegExp('(^|\\s)' + escapeForRegexp(expression) + '(\\s|\\||$)');
                    if (matcher.test(bindingName)) {
                      matches.push(binding);
                    }
                  } else {
                    if (bindingName.indexOf(expression) != -1) {
                      matches.push(binding);
                    }
                  }
                });
              }
            });
            return matches;
          };
          testability.findModels = function(element, expression, opt_exactMatch) {
            var prefixes = ['ng-', 'data-ng-', 'ng\\:'];
            for (var p = 0; p < prefixes.length; ++p) {
              var attributeEquals = opt_exactMatch ? '=' : '*=';
              var selector = '[' + prefixes[p] + 'model' + attributeEquals + '"' + expression + '"]';
              var elements = element.querySelectorAll(selector);
              if (elements.length) {
                return elements;
              }
            }
          };
          testability.getLocation = function() {
            return $location.url();
          };
          testability.setLocation = function(url) {
            if (url !== $location.url()) {
              $location.url(url);
              $rootScope.$digest();
            }
          };
          testability.whenStable = function(callback) {
            $browser.notifyWhenNoOutstandingRequests(callback);
          };
          return testability;
        }];
      }
      function $TimeoutProvider() {
        this.$get = ['$rootScope', '$browser', '$q', '$$q', '$exceptionHandler', function($rootScope, $browser, $q, $$q, $exceptionHandler) {
          var deferreds = {};
          function timeout(fn, delay, invokeApply) {
            if (!isFunction(fn)) {
              invokeApply = delay;
              delay = fn;
              fn = noop;
            }
            var args = sliceArgs(arguments, 3),
                skipApply = (isDefined(invokeApply) && !invokeApply),
                deferred = (skipApply ? $$q : $q).defer(),
                promise = deferred.promise,
                timeoutId;
            timeoutId = $browser.defer(function() {
              try {
                deferred.resolve(fn.apply(null, args));
              } catch (e) {
                deferred.reject(e);
                $exceptionHandler(e);
              } finally {
                delete deferreds[promise.$$timeoutId];
              }
              if (!skipApply)
                $rootScope.$apply();
            }, delay);
            promise.$$timeoutId = timeoutId;
            deferreds[timeoutId] = deferred;
            return promise;
          }
          timeout.cancel = function(promise) {
            if (promise && promise.$$timeoutId in deferreds) {
              deferreds[promise.$$timeoutId].reject('canceled');
              delete deferreds[promise.$$timeoutId];
              return $browser.defer.cancel(promise.$$timeoutId);
            }
            return false;
          };
          return timeout;
        }];
      }
      var urlParsingNode = document.createElement("a");
      var originUrl = urlResolve(window.location.href);
      function urlResolve(url) {
        var href = url;
        if (msie) {
          urlParsingNode.setAttribute("href", href);
          href = urlParsingNode.href;
        }
        urlParsingNode.setAttribute('href', href);
        return {
          href: urlParsingNode.href,
          protocol: urlParsingNode.protocol ? urlParsingNode.protocol.replace(/:$/, '') : '',
          host: urlParsingNode.host,
          search: urlParsingNode.search ? urlParsingNode.search.replace(/^\?/, '') : '',
          hash: urlParsingNode.hash ? urlParsingNode.hash.replace(/^#/, '') : '',
          hostname: urlParsingNode.hostname,
          port: urlParsingNode.port,
          pathname: (urlParsingNode.pathname.charAt(0) === '/') ? urlParsingNode.pathname : '/' + urlParsingNode.pathname
        };
      }
      function urlIsSameOrigin(requestUrl) {
        var parsed = (isString(requestUrl)) ? urlResolve(requestUrl) : requestUrl;
        return (parsed.protocol === originUrl.protocol && parsed.host === originUrl.host);
      }
      function $WindowProvider() {
        this.$get = valueFn(window);
      }
      function $$CookieReader($document) {
        var rawDocument = $document[0] || {};
        var lastCookies = {};
        var lastCookieString = '';
        function safeDecodeURIComponent(str) {
          try {
            return decodeURIComponent(str);
          } catch (e) {
            return str;
          }
        }
        return function() {
          var cookieArray,
              cookie,
              i,
              index,
              name;
          var currentCookieString = rawDocument.cookie || '';
          if (currentCookieString !== lastCookieString) {
            lastCookieString = currentCookieString;
            cookieArray = lastCookieString.split('; ');
            lastCookies = {};
            for (i = 0; i < cookieArray.length; i++) {
              cookie = cookieArray[i];
              index = cookie.indexOf('=');
              if (index > 0) {
                name = safeDecodeURIComponent(cookie.substring(0, index));
                if (isUndefined(lastCookies[name])) {
                  lastCookies[name] = safeDecodeURIComponent(cookie.substring(index + 1));
                }
              }
            }
          }
          return lastCookies;
        };
      }
      $$CookieReader.$inject = ['$document'];
      function $$CookieReaderProvider() {
        this.$get = $$CookieReader;
      }
      $FilterProvider.$inject = ['$provide'];
      function $FilterProvider($provide) {
        var suffix = 'Filter';
        function register(name, factory) {
          if (isObject(name)) {
            var filters = {};
            forEach(name, function(filter, key) {
              filters[key] = register(key, filter);
            });
            return filters;
          } else {
            return $provide.factory(name + suffix, factory);
          }
        }
        this.register = register;
        this.$get = ['$injector', function($injector) {
          return function(name) {
            return $injector.get(name + suffix);
          };
        }];
        register('currency', currencyFilter);
        register('date', dateFilter);
        register('filter', filterFilter);
        register('json', jsonFilter);
        register('limitTo', limitToFilter);
        register('lowercase', lowercaseFilter);
        register('number', numberFilter);
        register('orderBy', orderByFilter);
        register('uppercase', uppercaseFilter);
      }
      function filterFilter() {
        return function(array, expression, comparator) {
          if (!isArrayLike(array)) {
            if (array == null) {
              return array;
            } else {
              throw minErr('filter')('notarray', 'Expected array but received: {0}', array);
            }
          }
          var expressionType = getTypeForFilter(expression);
          var predicateFn;
          var matchAgainstAnyProp;
          switch (expressionType) {
            case 'function':
              predicateFn = expression;
              break;
            case 'boolean':
            case 'null':
            case 'number':
            case 'string':
              matchAgainstAnyProp = true;
            case 'object':
              predicateFn = createPredicateFn(expression, comparator, matchAgainstAnyProp);
              break;
            default:
              return array;
          }
          return Array.prototype.filter.call(array, predicateFn);
        };
      }
      function createPredicateFn(expression, comparator, matchAgainstAnyProp) {
        var shouldMatchPrimitives = isObject(expression) && ('$' in expression);
        var predicateFn;
        if (comparator === true) {
          comparator = equals;
        } else if (!isFunction(comparator)) {
          comparator = function(actual, expected) {
            if (isUndefined(actual)) {
              return false;
            }
            if ((actual === null) || (expected === null)) {
              return actual === expected;
            }
            if (isObject(expected) || (isObject(actual) && !hasCustomToString(actual))) {
              return false;
            }
            actual = lowercase('' + actual);
            expected = lowercase('' + expected);
            return actual.indexOf(expected) !== -1;
          };
        }
        predicateFn = function(item) {
          if (shouldMatchPrimitives && !isObject(item)) {
            return deepCompare(item, expression.$, comparator, false);
          }
          return deepCompare(item, expression, comparator, matchAgainstAnyProp);
        };
        return predicateFn;
      }
      function deepCompare(actual, expected, comparator, matchAgainstAnyProp, dontMatchWholeObject) {
        var actualType = getTypeForFilter(actual);
        var expectedType = getTypeForFilter(expected);
        if ((expectedType === 'string') && (expected.charAt(0) === '!')) {
          return !deepCompare(actual, expected.substring(1), comparator, matchAgainstAnyProp);
        } else if (isArray(actual)) {
          return actual.some(function(item) {
            return deepCompare(item, expected, comparator, matchAgainstAnyProp);
          });
        }
        switch (actualType) {
          case 'object':
            var key;
            if (matchAgainstAnyProp) {
              for (key in actual) {
                if ((key.charAt(0) !== '$') && deepCompare(actual[key], expected, comparator, true)) {
                  return true;
                }
              }
              return dontMatchWholeObject ? false : deepCompare(actual, expected, comparator, false);
            } else if (expectedType === 'object') {
              for (key in expected) {
                var expectedVal = expected[key];
                if (isFunction(expectedVal) || isUndefined(expectedVal)) {
                  continue;
                }
                var matchAnyProperty = key === '$';
                var actualVal = matchAnyProperty ? actual : actual[key];
                if (!deepCompare(actualVal, expectedVal, comparator, matchAnyProperty, matchAnyProperty)) {
                  return false;
                }
              }
              return true;
            } else {
              return comparator(actual, expected);
            }
            break;
          case 'function':
            return false;
          default:
            return comparator(actual, expected);
        }
      }
      function getTypeForFilter(val) {
        return (val === null) ? 'null' : typeof val;
      }
      currencyFilter.$inject = ['$locale'];
      function currencyFilter($locale) {
        var formats = $locale.NUMBER_FORMATS;
        return function(amount, currencySymbol, fractionSize) {
          if (isUndefined(currencySymbol)) {
            currencySymbol = formats.CURRENCY_SYM;
          }
          if (isUndefined(fractionSize)) {
            fractionSize = formats.PATTERNS[1].maxFrac;
          }
          return (amount == null) ? amount : formatNumber(amount, formats.PATTERNS[1], formats.GROUP_SEP, formats.DECIMAL_SEP, fractionSize).replace(/\u00A4/g, currencySymbol);
        };
      }
      numberFilter.$inject = ['$locale'];
      function numberFilter($locale) {
        var formats = $locale.NUMBER_FORMATS;
        return function(number, fractionSize) {
          return (number == null) ? number : formatNumber(number, formats.PATTERNS[0], formats.GROUP_SEP, formats.DECIMAL_SEP, fractionSize);
        };
      }
      var DECIMAL_SEP = '.';
      function formatNumber(number, pattern, groupSep, decimalSep, fractionSize) {
        if (isObject(number))
          return '';
        var isNegative = number < 0;
        number = Math.abs(number);
        var isInfinity = number === Infinity;
        if (!isInfinity && !isFinite(number))
          return '';
        var numStr = number + '',
            formatedText = '',
            hasExponent = false,
            parts = [];
        if (isInfinity)
          formatedText = '\u221e';
        if (!isInfinity && numStr.indexOf('e') !== -1) {
          var match = numStr.match(/([\d\.]+)e(-?)(\d+)/);
          if (match && match[2] == '-' && match[3] > fractionSize + 1) {
            number = 0;
          } else {
            formatedText = numStr;
            hasExponent = true;
          }
        }
        if (!isInfinity && !hasExponent) {
          var fractionLen = (numStr.split(DECIMAL_SEP)[1] || '').length;
          if (isUndefined(fractionSize)) {
            fractionSize = Math.min(Math.max(pattern.minFrac, fractionLen), pattern.maxFrac);
          }
          number = +(Math.round(+(number.toString() + 'e' + fractionSize)).toString() + 'e' + -fractionSize);
          var fraction = ('' + number).split(DECIMAL_SEP);
          var whole = fraction[0];
          fraction = fraction[1] || '';
          var i,
              pos = 0,
              lgroup = pattern.lgSize,
              group = pattern.gSize;
          if (whole.length >= (lgroup + group)) {
            pos = whole.length - lgroup;
            for (i = 0; i < pos; i++) {
              if ((pos - i) % group === 0 && i !== 0) {
                formatedText += groupSep;
              }
              formatedText += whole.charAt(i);
            }
          }
          for (i = pos; i < whole.length; i++) {
            if ((whole.length - i) % lgroup === 0 && i !== 0) {
              formatedText += groupSep;
            }
            formatedText += whole.charAt(i);
          }
          while (fraction.length < fractionSize) {
            fraction += '0';
          }
          if (fractionSize && fractionSize !== "0")
            formatedText += decimalSep + fraction.substr(0, fractionSize);
        } else {
          if (fractionSize > 0 && number < 1) {
            formatedText = number.toFixed(fractionSize);
            number = parseFloat(formatedText);
            formatedText = formatedText.replace(DECIMAL_SEP, decimalSep);
          }
        }
        if (number === 0) {
          isNegative = false;
        }
        parts.push(isNegative ? pattern.negPre : pattern.posPre, formatedText, isNegative ? pattern.negSuf : pattern.posSuf);
        return parts.join('');
      }
      function padNumber(num, digits, trim) {
        var neg = '';
        if (num < 0) {
          neg = '-';
          num = -num;
        }
        num = '' + num;
        while (num.length < digits)
          num = '0' + num;
        if (trim) {
          num = num.substr(num.length - digits);
        }
        return neg + num;
      }
      function dateGetter(name, size, offset, trim) {
        offset = offset || 0;
        return function(date) {
          var value = date['get' + name]();
          if (offset > 0 || value > -offset) {
            value += offset;
          }
          if (value === 0 && offset == -12)
            value = 12;
          return padNumber(value, size, trim);
        };
      }
      function dateStrGetter(name, shortForm) {
        return function(date, formats) {
          var value = date['get' + name]();
          var get = uppercase(shortForm ? ('SHORT' + name) : name);
          return formats[get][value];
        };
      }
      function timeZoneGetter(date, formats, offset) {
        var zone = -1 * offset;
        var paddedZone = (zone >= 0) ? "+" : "";
        paddedZone += padNumber(Math[zone > 0 ? 'floor' : 'ceil'](zone / 60), 2) + padNumber(Math.abs(zone % 60), 2);
        return paddedZone;
      }
      function getFirstThursdayOfYear(year) {
        var dayOfWeekOnFirst = (new Date(year, 0, 1)).getDay();
        return new Date(year, 0, ((dayOfWeekOnFirst <= 4) ? 5 : 12) - dayOfWeekOnFirst);
      }
      function getThursdayThisWeek(datetime) {
        return new Date(datetime.getFullYear(), datetime.getMonth(), datetime.getDate() + (4 - datetime.getDay()));
      }
      function weekGetter(size) {
        return function(date) {
          var firstThurs = getFirstThursdayOfYear(date.getFullYear()),
              thisThurs = getThursdayThisWeek(date);
          var diff = +thisThurs - +firstThurs,
              result = 1 + Math.round(diff / 6.048e8);
          return padNumber(result, size);
        };
      }
      function ampmGetter(date, formats) {
        return date.getHours() < 12 ? formats.AMPMS[0] : formats.AMPMS[1];
      }
      function eraGetter(date, formats) {
        return date.getFullYear() <= 0 ? formats.ERAS[0] : formats.ERAS[1];
      }
      function longEraGetter(date, formats) {
        return date.getFullYear() <= 0 ? formats.ERANAMES[0] : formats.ERANAMES[1];
      }
      var DATE_FORMATS = {
        yyyy: dateGetter('FullYear', 4),
        yy: dateGetter('FullYear', 2, 0, true),
        y: dateGetter('FullYear', 1),
        MMMM: dateStrGetter('Month'),
        MMM: dateStrGetter('Month', true),
        MM: dateGetter('Month', 2, 1),
        M: dateGetter('Month', 1, 1),
        dd: dateGetter('Date', 2),
        d: dateGetter('Date', 1),
        HH: dateGetter('Hours', 2),
        H: dateGetter('Hours', 1),
        hh: dateGetter('Hours', 2, -12),
        h: dateGetter('Hours', 1, -12),
        mm: dateGetter('Minutes', 2),
        m: dateGetter('Minutes', 1),
        ss: dateGetter('Seconds', 2),
        s: dateGetter('Seconds', 1),
        sss: dateGetter('Milliseconds', 3),
        EEEE: dateStrGetter('Day'),
        EEE: dateStrGetter('Day', true),
        a: ampmGetter,
        Z: timeZoneGetter,
        ww: weekGetter(2),
        w: weekGetter(1),
        G: eraGetter,
        GG: eraGetter,
        GGG: eraGetter,
        GGGG: longEraGetter
      };
      var DATE_FORMATS_SPLIT = /((?:[^yMdHhmsaZEwG']+)|(?:'(?:[^']|'')*')|(?:E+|y+|M+|d+|H+|h+|m+|s+|a|Z|G+|w+))(.*)/,
          NUMBER_STRING = /^\-?\d+$/;
      dateFilter.$inject = ['$locale'];
      function dateFilter($locale) {
        var R_ISO8601_STR = /^(\d{4})-?(\d\d)-?(\d\d)(?:T(\d\d)(?::?(\d\d)(?::?(\d\d)(?:\.(\d+))?)?)?(Z|([+-])(\d\d):?(\d\d))?)?$/;
        function jsonStringToDate(string) {
          var match;
          if (match = string.match(R_ISO8601_STR)) {
            var date = new Date(0),
                tzHour = 0,
                tzMin = 0,
                dateSetter = match[8] ? date.setUTCFullYear : date.setFullYear,
                timeSetter = match[8] ? date.setUTCHours : date.setHours;
            if (match[9]) {
              tzHour = toInt(match[9] + match[10]);
              tzMin = toInt(match[9] + match[11]);
            }
            dateSetter.call(date, toInt(match[1]), toInt(match[2]) - 1, toInt(match[3]));
            var h = toInt(match[4] || 0) - tzHour;
            var m = toInt(match[5] || 0) - tzMin;
            var s = toInt(match[6] || 0);
            var ms = Math.round(parseFloat('0.' + (match[7] || 0)) * 1000);
            timeSetter.call(date, h, m, s, ms);
            return date;
          }
          return string;
        }
        return function(date, format, timezone) {
          var text = '',
              parts = [],
              fn,
              match;
          format = format || 'mediumDate';
          format = $locale.DATETIME_FORMATS[format] || format;
          if (isString(date)) {
            date = NUMBER_STRING.test(date) ? toInt(date) : jsonStringToDate(date);
          }
          if (isNumber(date)) {
            date = new Date(date);
          }
          if (!isDate(date) || !isFinite(date.getTime())) {
            return date;
          }
          while (format) {
            match = DATE_FORMATS_SPLIT.exec(format);
            if (match) {
              parts = concat(parts, match, 1);
              format = parts.pop();
            } else {
              parts.push(format);
              format = null;
            }
          }
          var dateTimezoneOffset = date.getTimezoneOffset();
          if (timezone) {
            dateTimezoneOffset = timezoneToOffset(timezone, date.getTimezoneOffset());
            date = convertTimezoneToLocal(date, timezone, true);
          }
          forEach(parts, function(value) {
            fn = DATE_FORMATS[value];
            text += fn ? fn(date, $locale.DATETIME_FORMATS, dateTimezoneOffset) : value.replace(/(^'|'$)/g, '').replace(/''/g, "'");
          });
          return text;
        };
      }
      function jsonFilter() {
        return function(object, spacing) {
          if (isUndefined(spacing)) {
            spacing = 2;
          }
          return toJson(object, spacing);
        };
      }
      var lowercaseFilter = valueFn(lowercase);
      var uppercaseFilter = valueFn(uppercase);
      function limitToFilter() {
        return function(input, limit, begin) {
          if (Math.abs(Number(limit)) === Infinity) {
            limit = Number(limit);
          } else {
            limit = toInt(limit);
          }
          if (isNaN(limit))
            return input;
          if (isNumber(input))
            input = input.toString();
          if (!isArray(input) && !isString(input))
            return input;
          begin = (!begin || isNaN(begin)) ? 0 : toInt(begin);
          begin = (begin < 0) ? Math.max(0, input.length + begin) : begin;
          if (limit >= 0) {
            return input.slice(begin, begin + limit);
          } else {
            if (begin === 0) {
              return input.slice(limit, input.length);
            } else {
              return input.slice(Math.max(0, begin + limit), begin);
            }
          }
        };
      }
      orderByFilter.$inject = ['$parse'];
      function orderByFilter($parse) {
        return function(array, sortPredicate, reverseOrder) {
          if (!(isArrayLike(array)))
            return array;
          if (!isArray(sortPredicate)) {
            sortPredicate = [sortPredicate];
          }
          if (sortPredicate.length === 0) {
            sortPredicate = ['+'];
          }
          var predicates = processPredicates(sortPredicate, reverseOrder);
          predicates.push({
            get: function() {
              return {};
            },
            descending: reverseOrder ? -1 : 1
          });
          var compareValues = Array.prototype.map.call(array, getComparisonObject);
          compareValues.sort(doComparison);
          array = compareValues.map(function(item) {
            return item.value;
          });
          return array;
          function getComparisonObject(value, index) {
            return {
              value: value,
              predicateValues: predicates.map(function(predicate) {
                return getPredicateValue(predicate.get(value), index);
              })
            };
          }
          function doComparison(v1, v2) {
            var result = 0;
            for (var index = 0,
                length = predicates.length; index < length; ++index) {
              result = compare(v1.predicateValues[index], v2.predicateValues[index]) * predicates[index].descending;
              if (result)
                break;
            }
            return result;
          }
        };
        function processPredicates(sortPredicate, reverseOrder) {
          reverseOrder = reverseOrder ? -1 : 1;
          return sortPredicate.map(function(predicate) {
            var descending = 1,
                get = identity;
            if (isFunction(predicate)) {
              get = predicate;
            } else if (isString(predicate)) {
              if ((predicate.charAt(0) == '+' || predicate.charAt(0) == '-')) {
                descending = predicate.charAt(0) == '-' ? -1 : 1;
                predicate = predicate.substring(1);
              }
              if (predicate !== '') {
                get = $parse(predicate);
                if (get.constant) {
                  var key = get();
                  get = function(value) {
                    return value[key];
                  };
                }
              }
            }
            return {
              get: get,
              descending: descending * reverseOrder
            };
          });
        }
        function isPrimitive(value) {
          switch (typeof value) {
            case 'number':
            case 'boolean':
            case 'string':
              return true;
            default:
              return false;
          }
        }
        function objectValue(value, index) {
          if (typeof value.valueOf === 'function') {
            value = value.valueOf();
            if (isPrimitive(value))
              return value;
          }
          if (hasCustomToString(value)) {
            value = value.toString();
            if (isPrimitive(value))
              return value;
          }
          return index;
        }
        function getPredicateValue(value, index) {
          var type = typeof value;
          if (value === null) {
            type = 'string';
            value = 'null';
          } else if (type === 'string') {
            value = value.toLowerCase();
          } else if (type === 'object') {
            value = objectValue(value, index);
          }
          return {
            value: value,
            type: type
          };
        }
        function compare(v1, v2) {
          var result = 0;
          if (v1.type === v2.type) {
            if (v1.value !== v2.value) {
              result = v1.value < v2.value ? -1 : 1;
            }
          } else {
            result = v1.type < v2.type ? -1 : 1;
          }
          return result;
        }
      }
      function ngDirective(directive) {
        if (isFunction(directive)) {
          directive = {link: directive};
        }
        directive.restrict = directive.restrict || 'AC';
        return valueFn(directive);
      }
      var htmlAnchorDirective = valueFn({
        restrict: 'E',
        compile: function(element, attr) {
          if (!attr.href && !attr.xlinkHref) {
            return function(scope, element) {
              if (element[0].nodeName.toLowerCase() !== 'a')
                return;
              var href = toString.call(element.prop('href')) === '[object SVGAnimatedString]' ? 'xlink:href' : 'href';
              element.on('click', function(event) {
                if (!element.attr(href)) {
                  event.preventDefault();
                }
              });
            };
          }
        }
      });
      var ngAttributeAliasDirectives = {};
      forEach(BOOLEAN_ATTR, function(propName, attrName) {
        if (propName == "multiple")
          return;
        function defaultLinkFn(scope, element, attr) {
          scope.$watch(attr[normalized], function ngBooleanAttrWatchAction(value) {
            attr.$set(attrName, !!value);
          });
        }
        var normalized = directiveNormalize('ng-' + attrName);
        var linkFn = defaultLinkFn;
        if (propName === 'checked') {
          linkFn = function(scope, element, attr) {
            if (attr.ngModel !== attr[normalized]) {
              defaultLinkFn(scope, element, attr);
            }
          };
        }
        ngAttributeAliasDirectives[normalized] = function() {
          return {
            restrict: 'A',
            priority: 100,
            link: linkFn
          };
        };
      });
      forEach(ALIASED_ATTR, function(htmlAttr, ngAttr) {
        ngAttributeAliasDirectives[ngAttr] = function() {
          return {
            priority: 100,
            link: function(scope, element, attr) {
              if (ngAttr === "ngPattern" && attr.ngPattern.charAt(0) == "/") {
                var match = attr.ngPattern.match(REGEX_STRING_REGEXP);
                if (match) {
                  attr.$set("ngPattern", new RegExp(match[1], match[2]));
                  return;
                }
              }
              scope.$watch(attr[ngAttr], function ngAttrAliasWatchAction(value) {
                attr.$set(ngAttr, value);
              });
            }
          };
        };
      });
      forEach(['src', 'srcset', 'href'], function(attrName) {
        var normalized = directiveNormalize('ng-' + attrName);
        ngAttributeAliasDirectives[normalized] = function() {
          return {
            priority: 99,
            link: function(scope, element, attr) {
              var propName = attrName,
                  name = attrName;
              if (attrName === 'href' && toString.call(element.prop('href')) === '[object SVGAnimatedString]') {
                name = 'xlinkHref';
                attr.$attr[name] = 'xlink:href';
                propName = null;
              }
              attr.$observe(normalized, function(value) {
                if (!value) {
                  if (attrName === 'href') {
                    attr.$set(name, null);
                  }
                  return;
                }
                attr.$set(name, value);
                if (msie && propName)
                  element.prop(propName, attr[name]);
              });
            }
          };
        };
      });
      var nullFormCtrl = {
        $addControl: noop,
        $$renameControl: nullFormRenameControl,
        $removeControl: noop,
        $setValidity: noop,
        $setDirty: noop,
        $setPristine: noop,
        $setSubmitted: noop
      },
          SUBMITTED_CLASS = 'ng-submitted';
      function nullFormRenameControl(control, name) {
        control.$name = name;
      }
      FormController.$inject = ['$element', '$attrs', '$scope', '$animate', '$interpolate'];
      function FormController(element, attrs, $scope, $animate, $interpolate) {
        var form = this,
            controls = [];
        form.$error = {};
        form.$$success = {};
        form.$pending = undefined;
        form.$name = $interpolate(attrs.name || attrs.ngForm || '')($scope);
        form.$dirty = false;
        form.$pristine = true;
        form.$valid = true;
        form.$invalid = false;
        form.$submitted = false;
        form.$$parentForm = nullFormCtrl;
        form.$rollbackViewValue = function() {
          forEach(controls, function(control) {
            control.$rollbackViewValue();
          });
        };
        form.$commitViewValue = function() {
          forEach(controls, function(control) {
            control.$commitViewValue();
          });
        };
        form.$addControl = function(control) {
          assertNotHasOwnProperty(control.$name, 'input');
          controls.push(control);
          if (control.$name) {
            form[control.$name] = control;
          }
          control.$$parentForm = form;
        };
        form.$$renameControl = function(control, newName) {
          var oldName = control.$name;
          if (form[oldName] === control) {
            delete form[oldName];
          }
          form[newName] = control;
          control.$name = newName;
        };
        form.$removeControl = function(control) {
          if (control.$name && form[control.$name] === control) {
            delete form[control.$name];
          }
          forEach(form.$pending, function(value, name) {
            form.$setValidity(name, null, control);
          });
          forEach(form.$error, function(value, name) {
            form.$setValidity(name, null, control);
          });
          forEach(form.$$success, function(value, name) {
            form.$setValidity(name, null, control);
          });
          arrayRemove(controls, control);
          control.$$parentForm = nullFormCtrl;
        };
        addSetValidityMethod({
          ctrl: this,
          $element: element,
          set: function(object, property, controller) {
            var list = object[property];
            if (!list) {
              object[property] = [controller];
            } else {
              var index = list.indexOf(controller);
              if (index === -1) {
                list.push(controller);
              }
            }
          },
          unset: function(object, property, controller) {
            var list = object[property];
            if (!list) {
              return;
            }
            arrayRemove(list, controller);
            if (list.length === 0) {
              delete object[property];
            }
          },
          $animate: $animate
        });
        form.$setDirty = function() {
          $animate.removeClass(element, PRISTINE_CLASS);
          $animate.addClass(element, DIRTY_CLASS);
          form.$dirty = true;
          form.$pristine = false;
          form.$$parentForm.$setDirty();
        };
        form.$setPristine = function() {
          $animate.setClass(element, PRISTINE_CLASS, DIRTY_CLASS + ' ' + SUBMITTED_CLASS);
          form.$dirty = false;
          form.$pristine = true;
          form.$submitted = false;
          forEach(controls, function(control) {
            control.$setPristine();
          });
        };
        form.$setUntouched = function() {
          forEach(controls, function(control) {
            control.$setUntouched();
          });
        };
        form.$setSubmitted = function() {
          $animate.addClass(element, SUBMITTED_CLASS);
          form.$submitted = true;
          form.$$parentForm.$setSubmitted();
        };
      }
      var formDirectiveFactory = function(isNgForm) {
        return ['$timeout', '$parse', function($timeout, $parse) {
          var formDirective = {
            name: 'form',
            restrict: isNgForm ? 'EAC' : 'E',
            require: ['form', '^^?form'],
            controller: FormController,
            compile: function ngFormCompile(formElement, attr) {
              formElement.addClass(PRISTINE_CLASS).addClass(VALID_CLASS);
              var nameAttr = attr.name ? 'name' : (isNgForm && attr.ngForm ? 'ngForm' : false);
              return {pre: function ngFormPreLink(scope, formElement, attr, ctrls) {
                  var controller = ctrls[0];
                  if (!('action' in attr)) {
                    var handleFormSubmission = function(event) {
                      scope.$apply(function() {
                        controller.$commitViewValue();
                        controller.$setSubmitted();
                      });
                      event.preventDefault();
                    };
                    addEventListenerFn(formElement[0], 'submit', handleFormSubmission);
                    formElement.on('$destroy', function() {
                      $timeout(function() {
                        removeEventListenerFn(formElement[0], 'submit', handleFormSubmission);
                      }, 0, false);
                    });
                  }
                  var parentFormCtrl = ctrls[1] || controller.$$parentForm;
                  parentFormCtrl.$addControl(controller);
                  var setter = nameAttr ? getSetter(controller.$name) : noop;
                  if (nameAttr) {
                    setter(scope, controller);
                    attr.$observe(nameAttr, function(newValue) {
                      if (controller.$name === newValue)
                        return;
                      setter(scope, undefined);
                      controller.$$parentForm.$$renameControl(controller, newValue);
                      setter = getSetter(controller.$name);
                      setter(scope, controller);
                    });
                  }
                  formElement.on('$destroy', function() {
                    controller.$$parentForm.$removeControl(controller);
                    setter(scope, undefined);
                    extend(controller, nullFormCtrl);
                  });
                }};
            }
          };
          return formDirective;
          function getSetter(expression) {
            if (expression === '') {
              return $parse('this[""]').assign;
            }
            return $parse(expression).assign || noop;
          }
        }];
      };
      var formDirective = formDirectiveFactory();
      var ngFormDirective = formDirectiveFactory(true);
      var ISO_DATE_REGEXP = /\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z)/;
      var URL_REGEXP = /^[A-Za-z][A-Za-z\d.+-]*:\/*(?:\w+(?::\w+)?@)?[^\s/]+(?::\d+)?(?:\/[\w#!:.?+=&%@\-/]*)?$/;
      var EMAIL_REGEXP = /^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]+@[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;
      var NUMBER_REGEXP = /^\s*(\-|\+)?(\d+|(\d*(\.\d*)))([eE][+-]?\d+)?\s*$/;
      var DATE_REGEXP = /^(\d{4})-(\d{2})-(\d{2})$/;
      var DATETIMELOCAL_REGEXP = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d)(\.\d{1,3})?)?$/;
      var WEEK_REGEXP = /^(\d{4})-W(\d\d)$/;
      var MONTH_REGEXP = /^(\d{4})-(\d\d)$/;
      var TIME_REGEXP = /^(\d\d):(\d\d)(?::(\d\d)(\.\d{1,3})?)?$/;
      var inputType = {
        'text': textInputType,
        'date': createDateInputType('date', DATE_REGEXP, createDateParser(DATE_REGEXP, ['yyyy', 'MM', 'dd']), 'yyyy-MM-dd'),
        'datetime-local': createDateInputType('datetimelocal', DATETIMELOCAL_REGEXP, createDateParser(DATETIMELOCAL_REGEXP, ['yyyy', 'MM', 'dd', 'HH', 'mm', 'ss', 'sss']), 'yyyy-MM-ddTHH:mm:ss.sss'),
        'time': createDateInputType('time', TIME_REGEXP, createDateParser(TIME_REGEXP, ['HH', 'mm', 'ss', 'sss']), 'HH:mm:ss.sss'),
        'week': createDateInputType('week', WEEK_REGEXP, weekParser, 'yyyy-Www'),
        'month': createDateInputType('month', MONTH_REGEXP, createDateParser(MONTH_REGEXP, ['yyyy', 'MM']), 'yyyy-MM'),
        'number': numberInputType,
        'url': urlInputType,
        'email': emailInputType,
        'radio': radioInputType,
        'checkbox': checkboxInputType,
        'hidden': noop,
        'button': noop,
        'submit': noop,
        'reset': noop,
        'file': noop
      };
      function stringBasedInputType(ctrl) {
        ctrl.$formatters.push(function(value) {
          return ctrl.$isEmpty(value) ? value : value.toString();
        });
      }
      function textInputType(scope, element, attr, ctrl, $sniffer, $browser) {
        baseInputType(scope, element, attr, ctrl, $sniffer, $browser);
        stringBasedInputType(ctrl);
      }
      function baseInputType(scope, element, attr, ctrl, $sniffer, $browser) {
        var type = lowercase(element[0].type);
        if (!$sniffer.android) {
          var composing = false;
          element.on('compositionstart', function(data) {
            composing = true;
          });
          element.on('compositionend', function() {
            composing = false;
            listener();
          });
        }
        var listener = function(ev) {
          if (timeout) {
            $browser.defer.cancel(timeout);
            timeout = null;
          }
          if (composing)
            return;
          var value = element.val(),
              event = ev && ev.type;
          if (type !== 'password' && (!attr.ngTrim || attr.ngTrim !== 'false')) {
            value = trim(value);
          }
          if (ctrl.$viewValue !== value || (value === '' && ctrl.$$hasNativeValidators)) {
            ctrl.$setViewValue(value, event);
          }
        };
        if ($sniffer.hasEvent('input')) {
          element.on('input', listener);
        } else {
          var timeout;
          var deferListener = function(ev, input, origValue) {
            if (!timeout) {
              timeout = $browser.defer(function() {
                timeout = null;
                if (!input || input.value !== origValue) {
                  listener(ev);
                }
              });
            }
          };
          element.on('keydown', function(event) {
            var key = event.keyCode;
            if (key === 91 || (15 < key && key < 19) || (37 <= key && key <= 40))
              return;
            deferListener(event, this, this.value);
          });
          if ($sniffer.hasEvent('paste')) {
            element.on('paste cut', deferListener);
          }
        }
        element.on('change', listener);
        ctrl.$render = function() {
          var value = ctrl.$isEmpty(ctrl.$viewValue) ? '' : ctrl.$viewValue;
          if (element.val() !== value) {
            element.val(value);
          }
        };
      }
      function weekParser(isoWeek, existingDate) {
        if (isDate(isoWeek)) {
          return isoWeek;
        }
        if (isString(isoWeek)) {
          WEEK_REGEXP.lastIndex = 0;
          var parts = WEEK_REGEXP.exec(isoWeek);
          if (parts) {
            var year = +parts[1],
                week = +parts[2],
                hours = 0,
                minutes = 0,
                seconds = 0,
                milliseconds = 0,
                firstThurs = getFirstThursdayOfYear(year),
                addDays = (week - 1) * 7;
            if (existingDate) {
              hours = existingDate.getHours();
              minutes = existingDate.getMinutes();
              seconds = existingDate.getSeconds();
              milliseconds = existingDate.getMilliseconds();
            }
            return new Date(year, 0, firstThurs.getDate() + addDays, hours, minutes, seconds, milliseconds);
          }
        }
        return NaN;
      }
      function createDateParser(regexp, mapping) {
        return function(iso, date) {
          var parts,
              map;
          if (isDate(iso)) {
            return iso;
          }
          if (isString(iso)) {
            if (iso.charAt(0) == '"' && iso.charAt(iso.length - 1) == '"') {
              iso = iso.substring(1, iso.length - 1);
            }
            if (ISO_DATE_REGEXP.test(iso)) {
              return new Date(iso);
            }
            regexp.lastIndex = 0;
            parts = regexp.exec(iso);
            if (parts) {
              parts.shift();
              if (date) {
                map = {
                  yyyy: date.getFullYear(),
                  MM: date.getMonth() + 1,
                  dd: date.getDate(),
                  HH: date.getHours(),
                  mm: date.getMinutes(),
                  ss: date.getSeconds(),
                  sss: date.getMilliseconds() / 1000
                };
              } else {
                map = {
                  yyyy: 1970,
                  MM: 1,
                  dd: 1,
                  HH: 0,
                  mm: 0,
                  ss: 0,
                  sss: 0
                };
              }
              forEach(parts, function(part, index) {
                if (index < mapping.length) {
                  map[mapping[index]] = +part;
                }
              });
              return new Date(map.yyyy, map.MM - 1, map.dd, map.HH, map.mm, map.ss || 0, map.sss * 1000 || 0);
            }
          }
          return NaN;
        };
      }
      function createDateInputType(type, regexp, parseDate, format) {
        return function dynamicDateInputType(scope, element, attr, ctrl, $sniffer, $browser, $filter) {
          badInputChecker(scope, element, attr, ctrl);
          baseInputType(scope, element, attr, ctrl, $sniffer, $browser);
          var timezone = ctrl && ctrl.$options && ctrl.$options.timezone;
          var previousDate;
          ctrl.$$parserName = type;
          ctrl.$parsers.push(function(value) {
            if (ctrl.$isEmpty(value))
              return null;
            if (regexp.test(value)) {
              var parsedDate = parseDate(value, previousDate);
              if (timezone) {
                parsedDate = convertTimezoneToLocal(parsedDate, timezone);
              }
              return parsedDate;
            }
            return undefined;
          });
          ctrl.$formatters.push(function(value) {
            if (value && !isDate(value)) {
              throw ngModelMinErr('datefmt', 'Expected `{0}` to be a date', value);
            }
            if (isValidDate(value)) {
              previousDate = value;
              if (previousDate && timezone) {
                previousDate = convertTimezoneToLocal(previousDate, timezone, true);
              }
              return $filter('date')(value, format, timezone);
            } else {
              previousDate = null;
              return '';
            }
          });
          if (isDefined(attr.min) || attr.ngMin) {
            var minVal;
            ctrl.$validators.min = function(value) {
              return !isValidDate(value) || isUndefined(minVal) || parseDate(value) >= minVal;
            };
            attr.$observe('min', function(val) {
              minVal = parseObservedDateValue(val);
              ctrl.$validate();
            });
          }
          if (isDefined(attr.max) || attr.ngMax) {
            var maxVal;
            ctrl.$validators.max = function(value) {
              return !isValidDate(value) || isUndefined(maxVal) || parseDate(value) <= maxVal;
            };
            attr.$observe('max', function(val) {
              maxVal = parseObservedDateValue(val);
              ctrl.$validate();
            });
          }
          function isValidDate(value) {
            return value && !(value.getTime && value.getTime() !== value.getTime());
          }
          function parseObservedDateValue(val) {
            return isDefined(val) && !isDate(val) ? parseDate(val) || undefined : val;
          }
        };
      }
      function badInputChecker(scope, element, attr, ctrl) {
        var node = element[0];
        var nativeValidation = ctrl.$$hasNativeValidators = isObject(node.validity);
        if (nativeValidation) {
          ctrl.$parsers.push(function(value) {
            var validity = element.prop(VALIDITY_STATE_PROPERTY) || {};
            return validity.badInput && !validity.typeMismatch ? undefined : value;
          });
        }
      }
      function numberInputType(scope, element, attr, ctrl, $sniffer, $browser) {
        badInputChecker(scope, element, attr, ctrl);
        baseInputType(scope, element, attr, ctrl, $sniffer, $browser);
        ctrl.$$parserName = 'number';
        ctrl.$parsers.push(function(value) {
          if (ctrl.$isEmpty(value))
            return null;
          if (NUMBER_REGEXP.test(value))
            return parseFloat(value);
          return undefined;
        });
        ctrl.$formatters.push(function(value) {
          if (!ctrl.$isEmpty(value)) {
            if (!isNumber(value)) {
              throw ngModelMinErr('numfmt', 'Expected `{0}` to be a number', value);
            }
            value = value.toString();
          }
          return value;
        });
        if (isDefined(attr.min) || attr.ngMin) {
          var minVal;
          ctrl.$validators.min = function(value) {
            return ctrl.$isEmpty(value) || isUndefined(minVal) || value >= minVal;
          };
          attr.$observe('min', function(val) {
            if (isDefined(val) && !isNumber(val)) {
              val = parseFloat(val, 10);
            }
            minVal = isNumber(val) && !isNaN(val) ? val : undefined;
            ctrl.$validate();
          });
        }
        if (isDefined(attr.max) || attr.ngMax) {
          var maxVal;
          ctrl.$validators.max = function(value) {
            return ctrl.$isEmpty(value) || isUndefined(maxVal) || value <= maxVal;
          };
          attr.$observe('max', function(val) {
            if (isDefined(val) && !isNumber(val)) {
              val = parseFloat(val, 10);
            }
            maxVal = isNumber(val) && !isNaN(val) ? val : undefined;
            ctrl.$validate();
          });
        }
      }
      function urlInputType(scope, element, attr, ctrl, $sniffer, $browser) {
        baseInputType(scope, element, attr, ctrl, $sniffer, $browser);
        stringBasedInputType(ctrl);
        ctrl.$$parserName = 'url';
        ctrl.$validators.url = function(modelValue, viewValue) {
          var value = modelValue || viewValue;
          return ctrl.$isEmpty(value) || URL_REGEXP.test(value);
        };
      }
      function emailInputType(scope, element, attr, ctrl, $sniffer, $browser) {
        baseInputType(scope, element, attr, ctrl, $sniffer, $browser);
        stringBasedInputType(ctrl);
        ctrl.$$parserName = 'email';
        ctrl.$validators.email = function(modelValue, viewValue) {
          var value = modelValue || viewValue;
          return ctrl.$isEmpty(value) || EMAIL_REGEXP.test(value);
        };
      }
      function radioInputType(scope, element, attr, ctrl) {
        if (isUndefined(attr.name)) {
          element.attr('name', nextUid());
        }
        var listener = function(ev) {
          if (element[0].checked) {
            ctrl.$setViewValue(attr.value, ev && ev.type);
          }
        };
        element.on('click', listener);
        ctrl.$render = function() {
          var value = attr.value;
          element[0].checked = (value == ctrl.$viewValue);
        };
        attr.$observe('value', ctrl.$render);
      }
      function parseConstantExpr($parse, context, name, expression, fallback) {
        var parseFn;
        if (isDefined(expression)) {
          parseFn = $parse(expression);
          if (!parseFn.constant) {
            throw ngModelMinErr('constexpr', 'Expected constant expression for `{0}`, but saw ' + '`{1}`.', name, expression);
          }
          return parseFn(context);
        }
        return fallback;
      }
      function checkboxInputType(scope, element, attr, ctrl, $sniffer, $browser, $filter, $parse) {
        var trueValue = parseConstantExpr($parse, scope, 'ngTrueValue', attr.ngTrueValue, true);
        var falseValue = parseConstantExpr($parse, scope, 'ngFalseValue', attr.ngFalseValue, false);
        var listener = function(ev) {
          ctrl.$setViewValue(element[0].checked, ev && ev.type);
        };
        element.on('click', listener);
        ctrl.$render = function() {
          element[0].checked = ctrl.$viewValue;
        };
        ctrl.$isEmpty = function(value) {
          return value === false;
        };
        ctrl.$formatters.push(function(value) {
          return equals(value, trueValue);
        });
        ctrl.$parsers.push(function(value) {
          return value ? trueValue : falseValue;
        });
      }
      var inputDirective = ['$browser', '$sniffer', '$filter', '$parse', function($browser, $sniffer, $filter, $parse) {
        return {
          restrict: 'E',
          require: ['?ngModel'],
          link: {pre: function(scope, element, attr, ctrls) {
              if (ctrls[0]) {
                (inputType[lowercase(attr.type)] || inputType.text)(scope, element, attr, ctrls[0], $sniffer, $browser, $filter, $parse);
              }
            }}
        };
      }];
      var CONSTANT_VALUE_REGEXP = /^(true|false|\d+)$/;
      var ngValueDirective = function() {
        return {
          restrict: 'A',
          priority: 100,
          compile: function(tpl, tplAttr) {
            if (CONSTANT_VALUE_REGEXP.test(tplAttr.ngValue)) {
              return function ngValueConstantLink(scope, elm, attr) {
                attr.$set('value', scope.$eval(attr.ngValue));
              };
            } else {
              return function ngValueLink(scope, elm, attr) {
                scope.$watch(attr.ngValue, function valueWatchAction(value) {
                  attr.$set('value', value);
                });
              };
            }
          }
        };
      };
      var ngBindDirective = ['$compile', function($compile) {
        return {
          restrict: 'AC',
          compile: function ngBindCompile(templateElement) {
            $compile.$$addBindingClass(templateElement);
            return function ngBindLink(scope, element, attr) {
              $compile.$$addBindingInfo(element, attr.ngBind);
              element = element[0];
              scope.$watch(attr.ngBind, function ngBindWatchAction(value) {
                element.textContent = isUndefined(value) ? '' : value;
              });
            };
          }
        };
      }];
      var ngBindTemplateDirective = ['$interpolate', '$compile', function($interpolate, $compile) {
        return {compile: function ngBindTemplateCompile(templateElement) {
            $compile.$$addBindingClass(templateElement);
            return function ngBindTemplateLink(scope, element, attr) {
              var interpolateFn = $interpolate(element.attr(attr.$attr.ngBindTemplate));
              $compile.$$addBindingInfo(element, interpolateFn.expressions);
              element = element[0];
              attr.$observe('ngBindTemplate', function(value) {
                element.textContent = isUndefined(value) ? '' : value;
              });
            };
          }};
      }];
      var ngBindHtmlDirective = ['$sce', '$parse', '$compile', function($sce, $parse, $compile) {
        return {
          restrict: 'A',
          compile: function ngBindHtmlCompile(tElement, tAttrs) {
            var ngBindHtmlGetter = $parse(tAttrs.ngBindHtml);
            var ngBindHtmlWatch = $parse(tAttrs.ngBindHtml, function getStringValue(value) {
              return (value || '').toString();
            });
            $compile.$$addBindingClass(tElement);
            return function ngBindHtmlLink(scope, element, attr) {
              $compile.$$addBindingInfo(element, attr.ngBindHtml);
              scope.$watch(ngBindHtmlWatch, function ngBindHtmlWatchAction() {
                element.html($sce.getTrustedHtml(ngBindHtmlGetter(scope)) || '');
              });
            };
          }
        };
      }];
      var ngChangeDirective = valueFn({
        restrict: 'A',
        require: 'ngModel',
        link: function(scope, element, attr, ctrl) {
          ctrl.$viewChangeListeners.push(function() {
            scope.$eval(attr.ngChange);
          });
        }
      });
      function classDirective(name, selector) {
        name = 'ngClass' + name;
        return ['$animate', function($animate) {
          return {
            restrict: 'AC',
            link: function(scope, element, attr) {
              var oldVal;
              scope.$watch(attr[name], ngClassWatchAction, true);
              attr.$observe('class', function(value) {
                ngClassWatchAction(scope.$eval(attr[name]));
              });
              if (name !== 'ngClass') {
                scope.$watch('$index', function($index, old$index) {
                  var mod = $index & 1;
                  if (mod !== (old$index & 1)) {
                    var classes = arrayClasses(scope.$eval(attr[name]));
                    mod === selector ? addClasses(classes) : removeClasses(classes);
                  }
                });
              }
              function addClasses(classes) {
                var newClasses = digestClassCounts(classes, 1);
                attr.$addClass(newClasses);
              }
              function removeClasses(classes) {
                var newClasses = digestClassCounts(classes, -1);
                attr.$removeClass(newClasses);
              }
              function digestClassCounts(classes, count) {
                var classCounts = element.data('$classCounts') || createMap();
                var classesToUpdate = [];
                forEach(classes, function(className) {
                  if (count > 0 || classCounts[className]) {
                    classCounts[className] = (classCounts[className] || 0) + count;
                    if (classCounts[className] === +(count > 0)) {
                      classesToUpdate.push(className);
                    }
                  }
                });
                element.data('$classCounts', classCounts);
                return classesToUpdate.join(' ');
              }
              function updateClasses(oldClasses, newClasses) {
                var toAdd = arrayDifference(newClasses, oldClasses);
                var toRemove = arrayDifference(oldClasses, newClasses);
                toAdd = digestClassCounts(toAdd, 1);
                toRemove = digestClassCounts(toRemove, -1);
                if (toAdd && toAdd.length) {
                  $animate.addClass(element, toAdd);
                }
                if (toRemove && toRemove.length) {
                  $animate.removeClass(element, toRemove);
                }
              }
              function ngClassWatchAction(newVal) {
                if (selector === true || scope.$index % 2 === selector) {
                  var newClasses = arrayClasses(newVal || []);
                  if (!oldVal) {
                    addClasses(newClasses);
                  } else if (!equals(newVal, oldVal)) {
                    var oldClasses = arrayClasses(oldVal);
                    updateClasses(oldClasses, newClasses);
                  }
                }
                oldVal = shallowCopy(newVal);
              }
            }
          };
          function arrayDifference(tokens1, tokens2) {
            var values = [];
            outer: for (var i = 0; i < tokens1.length; i++) {
              var token = tokens1[i];
              for (var j = 0; j < tokens2.length; j++) {
                if (token == tokens2[j])
                  continue outer;
              }
              values.push(token);
            }
            return values;
          }
          function arrayClasses(classVal) {
            var classes = [];
            if (isArray(classVal)) {
              forEach(classVal, function(v) {
                classes = classes.concat(arrayClasses(v));
              });
              return classes;
            } else if (isString(classVal)) {
              return classVal.split(' ');
            } else if (isObject(classVal)) {
              forEach(classVal, function(v, k) {
                if (v) {
                  classes = classes.concat(k.split(' '));
                }
              });
              return classes;
            }
            return classVal;
          }
        }];
      }
      var ngClassDirective = classDirective('', true);
      var ngClassOddDirective = classDirective('Odd', 0);
      var ngClassEvenDirective = classDirective('Even', 1);
      var ngCloakDirective = ngDirective({compile: function(element, attr) {
          attr.$set('ngCloak', undefined);
          element.removeClass('ng-cloak');
        }});
      var ngControllerDirective = [function() {
        return {
          restrict: 'A',
          scope: true,
          controller: '@',
          priority: 500
        };
      }];
      var ngEventDirectives = {};
      var forceAsyncEvents = {
        'blur': true,
        'focus': true
      };
      forEach('click dblclick mousedown mouseup mouseover mouseout mousemove mouseenter mouseleave keydown keyup keypress submit focus blur copy cut paste'.split(' '), function(eventName) {
        var directiveName = directiveNormalize('ng-' + eventName);
        ngEventDirectives[directiveName] = ['$parse', '$rootScope', function($parse, $rootScope) {
          return {
            restrict: 'A',
            compile: function($element, attr) {
              var fn = $parse(attr[directiveName], null, true);
              return function ngEventHandler(scope, element) {
                element.on(eventName, function(event) {
                  var callback = function() {
                    fn(scope, {$event: event});
                  };
                  if (forceAsyncEvents[eventName] && $rootScope.$$phase) {
                    scope.$evalAsync(callback);
                  } else {
                    scope.$apply(callback);
                  }
                });
              };
            }
          };
        }];
      });
      var ngIfDirective = ['$animate', function($animate) {
        return {
          multiElement: true,
          transclude: 'element',
          priority: 600,
          terminal: true,
          restrict: 'A',
          $$tlb: true,
          link: function($scope, $element, $attr, ctrl, $transclude) {
            var block,
                childScope,
                previousElements;
            $scope.$watch($attr.ngIf, function ngIfWatchAction(value) {
              if (value) {
                if (!childScope) {
                  $transclude(function(clone, newScope) {
                    childScope = newScope;
                    clone[clone.length++] = document.createComment(' end ngIf: ' + $attr.ngIf + ' ');
                    block = {clone: clone};
                    $animate.enter(clone, $element.parent(), $element);
                  });
                }
              } else {
                if (previousElements) {
                  previousElements.remove();
                  previousElements = null;
                }
                if (childScope) {
                  childScope.$destroy();
                  childScope = null;
                }
                if (block) {
                  previousElements = getBlockNodes(block.clone);
                  $animate.leave(previousElements).then(function() {
                    previousElements = null;
                  });
                  block = null;
                }
              }
            });
          }
        };
      }];
      var ngIncludeDirective = ['$templateRequest', '$anchorScroll', '$animate', function($templateRequest, $anchorScroll, $animate) {
        return {
          restrict: 'ECA',
          priority: 400,
          terminal: true,
          transclude: 'element',
          controller: angular.noop,
          compile: function(element, attr) {
            var srcExp = attr.ngInclude || attr.src,
                onloadExp = attr.onload || '',
                autoScrollExp = attr.autoscroll;
            return function(scope, $element, $attr, ctrl, $transclude) {
              var changeCounter = 0,
                  currentScope,
                  previousElement,
                  currentElement;
              var cleanupLastIncludeContent = function() {
                if (previousElement) {
                  previousElement.remove();
                  previousElement = null;
                }
                if (currentScope) {
                  currentScope.$destroy();
                  currentScope = null;
                }
                if (currentElement) {
                  $animate.leave(currentElement).then(function() {
                    previousElement = null;
                  });
                  previousElement = currentElement;
                  currentElement = null;
                }
              };
              scope.$watch(srcExp, function ngIncludeWatchAction(src) {
                var afterAnimation = function() {
                  if (isDefined(autoScrollExp) && (!autoScrollExp || scope.$eval(autoScrollExp))) {
                    $anchorScroll();
                  }
                };
                var thisChangeId = ++changeCounter;
                if (src) {
                  $templateRequest(src, true).then(function(response) {
                    if (thisChangeId !== changeCounter)
                      return;
                    var newScope = scope.$new();
                    ctrl.template = response;
                    var clone = $transclude(newScope, function(clone) {
                      cleanupLastIncludeContent();
                      $animate.enter(clone, null, $element).then(afterAnimation);
                    });
                    currentScope = newScope;
                    currentElement = clone;
                    currentScope.$emit('$includeContentLoaded', src);
                    scope.$eval(onloadExp);
                  }, function() {
                    if (thisChangeId === changeCounter) {
                      cleanupLastIncludeContent();
                      scope.$emit('$includeContentError', src);
                    }
                  });
                  scope.$emit('$includeContentRequested', src);
                } else {
                  cleanupLastIncludeContent();
                  ctrl.template = null;
                }
              });
            };
          }
        };
      }];
      var ngIncludeFillContentDirective = ['$compile', function($compile) {
        return {
          restrict: 'ECA',
          priority: -400,
          require: 'ngInclude',
          link: function(scope, $element, $attr, ctrl) {
            if (/SVG/.test($element[0].toString())) {
              $element.empty();
              $compile(jqLiteBuildFragment(ctrl.template, document).childNodes)(scope, function namespaceAdaptedClone(clone) {
                $element.append(clone);
              }, {futureParentElement: $element});
              return;
            }
            $element.html(ctrl.template);
            $compile($element.contents())(scope);
          }
        };
      }];
      var ngInitDirective = ngDirective({
        priority: 450,
        compile: function() {
          return {pre: function(scope, element, attrs) {
              scope.$eval(attrs.ngInit);
            }};
        }
      });
      var ngListDirective = function() {
        return {
          restrict: 'A',
          priority: 100,
          require: 'ngModel',
          link: function(scope, element, attr, ctrl) {
            var ngList = element.attr(attr.$attr.ngList) || ', ';
            var trimValues = attr.ngTrim !== 'false';
            var separator = trimValues ? trim(ngList) : ngList;
            var parse = function(viewValue) {
              if (isUndefined(viewValue))
                return;
              var list = [];
              if (viewValue) {
                forEach(viewValue.split(separator), function(value) {
                  if (value)
                    list.push(trimValues ? trim(value) : value);
                });
              }
              return list;
            };
            ctrl.$parsers.push(parse);
            ctrl.$formatters.push(function(value) {
              if (isArray(value)) {
                return value.join(ngList);
              }
              return undefined;
            });
            ctrl.$isEmpty = function(value) {
              return !value || !value.length;
            };
          }
        };
      };
      var VALID_CLASS = 'ng-valid',
          INVALID_CLASS = 'ng-invalid',
          PRISTINE_CLASS = 'ng-pristine',
          DIRTY_CLASS = 'ng-dirty',
          UNTOUCHED_CLASS = 'ng-untouched',
          TOUCHED_CLASS = 'ng-touched',
          PENDING_CLASS = 'ng-pending';
      var ngModelMinErr = minErr('ngModel');
      var NgModelController = ['$scope', '$exceptionHandler', '$attrs', '$element', '$parse', '$animate', '$timeout', '$rootScope', '$q', '$interpolate', function($scope, $exceptionHandler, $attr, $element, $parse, $animate, $timeout, $rootScope, $q, $interpolate) {
        this.$viewValue = Number.NaN;
        this.$modelValue = Number.NaN;
        this.$$rawModelValue = undefined;
        this.$validators = {};
        this.$asyncValidators = {};
        this.$parsers = [];
        this.$formatters = [];
        this.$viewChangeListeners = [];
        this.$untouched = true;
        this.$touched = false;
        this.$pristine = true;
        this.$dirty = false;
        this.$valid = true;
        this.$invalid = false;
        this.$error = {};
        this.$$success = {};
        this.$pending = undefined;
        this.$name = $interpolate($attr.name || '', false)($scope);
        this.$$parentForm = nullFormCtrl;
        var parsedNgModel = $parse($attr.ngModel),
            parsedNgModelAssign = parsedNgModel.assign,
            ngModelGet = parsedNgModel,
            ngModelSet = parsedNgModelAssign,
            pendingDebounce = null,
            parserValid,
            ctrl = this;
        this.$$setOptions = function(options) {
          ctrl.$options = options;
          if (options && options.getterSetter) {
            var invokeModelGetter = $parse($attr.ngModel + '()'),
                invokeModelSetter = $parse($attr.ngModel + '($$$p)');
            ngModelGet = function($scope) {
              var modelValue = parsedNgModel($scope);
              if (isFunction(modelValue)) {
                modelValue = invokeModelGetter($scope);
              }
              return modelValue;
            };
            ngModelSet = function($scope, newValue) {
              if (isFunction(parsedNgModel($scope))) {
                invokeModelSetter($scope, {$$$p: ctrl.$modelValue});
              } else {
                parsedNgModelAssign($scope, ctrl.$modelValue);
              }
            };
          } else if (!parsedNgModel.assign) {
            throw ngModelMinErr('nonassign', "Expression '{0}' is non-assignable. Element: {1}", $attr.ngModel, startingTag($element));
          }
        };
        this.$render = noop;
        this.$isEmpty = function(value) {
          return isUndefined(value) || value === '' || value === null || value !== value;
        };
        var currentValidationRunId = 0;
        addSetValidityMethod({
          ctrl: this,
          $element: $element,
          set: function(object, property) {
            object[property] = true;
          },
          unset: function(object, property) {
            delete object[property];
          },
          $animate: $animate
        });
        this.$setPristine = function() {
          ctrl.$dirty = false;
          ctrl.$pristine = true;
          $animate.removeClass($element, DIRTY_CLASS);
          $animate.addClass($element, PRISTINE_CLASS);
        };
        this.$setDirty = function() {
          ctrl.$dirty = true;
          ctrl.$pristine = false;
          $animate.removeClass($element, PRISTINE_CLASS);
          $animate.addClass($element, DIRTY_CLASS);
          ctrl.$$parentForm.$setDirty();
        };
        this.$setUntouched = function() {
          ctrl.$touched = false;
          ctrl.$untouched = true;
          $animate.setClass($element, UNTOUCHED_CLASS, TOUCHED_CLASS);
        };
        this.$setTouched = function() {
          ctrl.$touched = true;
          ctrl.$untouched = false;
          $animate.setClass($element, TOUCHED_CLASS, UNTOUCHED_CLASS);
        };
        this.$rollbackViewValue = function() {
          $timeout.cancel(pendingDebounce);
          ctrl.$viewValue = ctrl.$$lastCommittedViewValue;
          ctrl.$render();
        };
        this.$validate = function() {
          if (isNumber(ctrl.$modelValue) && isNaN(ctrl.$modelValue)) {
            return;
          }
          var viewValue = ctrl.$$lastCommittedViewValue;
          var modelValue = ctrl.$$rawModelValue;
          var prevValid = ctrl.$valid;
          var prevModelValue = ctrl.$modelValue;
          var allowInvalid = ctrl.$options && ctrl.$options.allowInvalid;
          ctrl.$$runValidators(modelValue, viewValue, function(allValid) {
            if (!allowInvalid && prevValid !== allValid) {
              ctrl.$modelValue = allValid ? modelValue : undefined;
              if (ctrl.$modelValue !== prevModelValue) {
                ctrl.$$writeModelToScope();
              }
            }
          });
        };
        this.$$runValidators = function(modelValue, viewValue, doneCallback) {
          currentValidationRunId++;
          var localValidationRunId = currentValidationRunId;
          if (!processParseErrors()) {
            validationDone(false);
            return;
          }
          if (!processSyncValidators()) {
            validationDone(false);
            return;
          }
          processAsyncValidators();
          function processParseErrors() {
            var errorKey = ctrl.$$parserName || 'parse';
            if (isUndefined(parserValid)) {
              setValidity(errorKey, null);
            } else {
              if (!parserValid) {
                forEach(ctrl.$validators, function(v, name) {
                  setValidity(name, null);
                });
                forEach(ctrl.$asyncValidators, function(v, name) {
                  setValidity(name, null);
                });
              }
              setValidity(errorKey, parserValid);
              return parserValid;
            }
            return true;
          }
          function processSyncValidators() {
            var syncValidatorsValid = true;
            forEach(ctrl.$validators, function(validator, name) {
              var result = validator(modelValue, viewValue);
              syncValidatorsValid = syncValidatorsValid && result;
              setValidity(name, result);
            });
            if (!syncValidatorsValid) {
              forEach(ctrl.$asyncValidators, function(v, name) {
                setValidity(name, null);
              });
              return false;
            }
            return true;
          }
          function processAsyncValidators() {
            var validatorPromises = [];
            var allValid = true;
            forEach(ctrl.$asyncValidators, function(validator, name) {
              var promise = validator(modelValue, viewValue);
              if (!isPromiseLike(promise)) {
                throw ngModelMinErr("$asyncValidators", "Expected asynchronous validator to return a promise but got '{0}' instead.", promise);
              }
              setValidity(name, undefined);
              validatorPromises.push(promise.then(function() {
                setValidity(name, true);
              }, function(error) {
                allValid = false;
                setValidity(name, false);
              }));
            });
            if (!validatorPromises.length) {
              validationDone(true);
            } else {
              $q.all(validatorPromises).then(function() {
                validationDone(allValid);
              }, noop);
            }
          }
          function setValidity(name, isValid) {
            if (localValidationRunId === currentValidationRunId) {
              ctrl.$setValidity(name, isValid);
            }
          }
          function validationDone(allValid) {
            if (localValidationRunId === currentValidationRunId) {
              doneCallback(allValid);
            }
          }
        };
        this.$commitViewValue = function() {
          var viewValue = ctrl.$viewValue;
          $timeout.cancel(pendingDebounce);
          if (ctrl.$$lastCommittedViewValue === viewValue && (viewValue !== '' || !ctrl.$$hasNativeValidators)) {
            return;
          }
          ctrl.$$lastCommittedViewValue = viewValue;
          if (ctrl.$pristine) {
            this.$setDirty();
          }
          this.$$parseAndValidate();
        };
        this.$$parseAndValidate = function() {
          var viewValue = ctrl.$$lastCommittedViewValue;
          var modelValue = viewValue;
          parserValid = isUndefined(modelValue) ? undefined : true;
          if (parserValid) {
            for (var i = 0; i < ctrl.$parsers.length; i++) {
              modelValue = ctrl.$parsers[i](modelValue);
              if (isUndefined(modelValue)) {
                parserValid = false;
                break;
              }
            }
          }
          if (isNumber(ctrl.$modelValue) && isNaN(ctrl.$modelValue)) {
            ctrl.$modelValue = ngModelGet($scope);
          }
          var prevModelValue = ctrl.$modelValue;
          var allowInvalid = ctrl.$options && ctrl.$options.allowInvalid;
          ctrl.$$rawModelValue = modelValue;
          if (allowInvalid) {
            ctrl.$modelValue = modelValue;
            writeToModelIfNeeded();
          }
          ctrl.$$runValidators(modelValue, ctrl.$$lastCommittedViewValue, function(allValid) {
            if (!allowInvalid) {
              ctrl.$modelValue = allValid ? modelValue : undefined;
              writeToModelIfNeeded();
            }
          });
          function writeToModelIfNeeded() {
            if (ctrl.$modelValue !== prevModelValue) {
              ctrl.$$writeModelToScope();
            }
          }
        };
        this.$$writeModelToScope = function() {
          ngModelSet($scope, ctrl.$modelValue);
          forEach(ctrl.$viewChangeListeners, function(listener) {
            try {
              listener();
            } catch (e) {
              $exceptionHandler(e);
            }
          });
        };
        this.$setViewValue = function(value, trigger) {
          ctrl.$viewValue = value;
          if (!ctrl.$options || ctrl.$options.updateOnDefault) {
            ctrl.$$debounceViewValueCommit(trigger);
          }
        };
        this.$$debounceViewValueCommit = function(trigger) {
          var debounceDelay = 0,
              options = ctrl.$options,
              debounce;
          if (options && isDefined(options.debounce)) {
            debounce = options.debounce;
            if (isNumber(debounce)) {
              debounceDelay = debounce;
            } else if (isNumber(debounce[trigger])) {
              debounceDelay = debounce[trigger];
            } else if (isNumber(debounce['default'])) {
              debounceDelay = debounce['default'];
            }
          }
          $timeout.cancel(pendingDebounce);
          if (debounceDelay) {
            pendingDebounce = $timeout(function() {
              ctrl.$commitViewValue();
            }, debounceDelay);
          } else if ($rootScope.$$phase) {
            ctrl.$commitViewValue();
          } else {
            $scope.$apply(function() {
              ctrl.$commitViewValue();
            });
          }
        };
        $scope.$watch(function ngModelWatch() {
          var modelValue = ngModelGet($scope);
          if (modelValue !== ctrl.$modelValue && (ctrl.$modelValue === ctrl.$modelValue || modelValue === modelValue)) {
            ctrl.$modelValue = ctrl.$$rawModelValue = modelValue;
            parserValid = undefined;
            var formatters = ctrl.$formatters,
                idx = formatters.length;
            var viewValue = modelValue;
            while (idx--) {
              viewValue = formatters[idx](viewValue);
            }
            if (ctrl.$viewValue !== viewValue) {
              ctrl.$viewValue = ctrl.$$lastCommittedViewValue = viewValue;
              ctrl.$render();
              ctrl.$$runValidators(modelValue, viewValue, noop);
            }
          }
          return modelValue;
        });
      }];
      var ngModelDirective = ['$rootScope', function($rootScope) {
        return {
          restrict: 'A',
          require: ['ngModel', '^?form', '^?ngModelOptions'],
          controller: NgModelController,
          priority: 1,
          compile: function ngModelCompile(element) {
            element.addClass(PRISTINE_CLASS).addClass(UNTOUCHED_CLASS).addClass(VALID_CLASS);
            return {
              pre: function ngModelPreLink(scope, element, attr, ctrls) {
                var modelCtrl = ctrls[0],
                    formCtrl = ctrls[1] || modelCtrl.$$parentForm;
                modelCtrl.$$setOptions(ctrls[2] && ctrls[2].$options);
                formCtrl.$addControl(modelCtrl);
                attr.$observe('name', function(newValue) {
                  if (modelCtrl.$name !== newValue) {
                    modelCtrl.$$parentForm.$$renameControl(modelCtrl, newValue);
                  }
                });
                scope.$on('$destroy', function() {
                  modelCtrl.$$parentForm.$removeControl(modelCtrl);
                });
              },
              post: function ngModelPostLink(scope, element, attr, ctrls) {
                var modelCtrl = ctrls[0];
                if (modelCtrl.$options && modelCtrl.$options.updateOn) {
                  element.on(modelCtrl.$options.updateOn, function(ev) {
                    modelCtrl.$$debounceViewValueCommit(ev && ev.type);
                  });
                }
                element.on('blur', function(ev) {
                  if (modelCtrl.$touched)
                    return;
                  if ($rootScope.$$phase) {
                    scope.$evalAsync(modelCtrl.$setTouched);
                  } else {
                    scope.$apply(modelCtrl.$setTouched);
                  }
                });
              }
            };
          }
        };
      }];
      var DEFAULT_REGEXP = /(\s+|^)default(\s+|$)/;
      var ngModelOptionsDirective = function() {
        return {
          restrict: 'A',
          controller: ['$scope', '$attrs', function($scope, $attrs) {
            var that = this;
            this.$options = copy($scope.$eval($attrs.ngModelOptions));
            if (isDefined(this.$options.updateOn)) {
              this.$options.updateOnDefault = false;
              this.$options.updateOn = trim(this.$options.updateOn.replace(DEFAULT_REGEXP, function() {
                that.$options.updateOnDefault = true;
                return ' ';
              }));
            } else {
              this.$options.updateOnDefault = true;
            }
          }]
        };
      };
      function addSetValidityMethod(context) {
        var ctrl = context.ctrl,
            $element = context.$element,
            classCache = {},
            set = context.set,
            unset = context.unset,
            $animate = context.$animate;
        classCache[INVALID_CLASS] = !(classCache[VALID_CLASS] = $element.hasClass(VALID_CLASS));
        ctrl.$setValidity = setValidity;
        function setValidity(validationErrorKey, state, controller) {
          if (isUndefined(state)) {
            createAndSet('$pending', validationErrorKey, controller);
          } else {
            unsetAndCleanup('$pending', validationErrorKey, controller);
          }
          if (!isBoolean(state)) {
            unset(ctrl.$error, validationErrorKey, controller);
            unset(ctrl.$$success, validationErrorKey, controller);
          } else {
            if (state) {
              unset(ctrl.$error, validationErrorKey, controller);
              set(ctrl.$$success, validationErrorKey, controller);
            } else {
              set(ctrl.$error, validationErrorKey, controller);
              unset(ctrl.$$success, validationErrorKey, controller);
            }
          }
          if (ctrl.$pending) {
            cachedToggleClass(PENDING_CLASS, true);
            ctrl.$valid = ctrl.$invalid = undefined;
            toggleValidationCss('', null);
          } else {
            cachedToggleClass(PENDING_CLASS, false);
            ctrl.$valid = isObjectEmpty(ctrl.$error);
            ctrl.$invalid = !ctrl.$valid;
            toggleValidationCss('', ctrl.$valid);
          }
          var combinedState;
          if (ctrl.$pending && ctrl.$pending[validationErrorKey]) {
            combinedState = undefined;
          } else if (ctrl.$error[validationErrorKey]) {
            combinedState = false;
          } else if (ctrl.$$success[validationErrorKey]) {
            combinedState = true;
          } else {
            combinedState = null;
          }
          toggleValidationCss(validationErrorKey, combinedState);
          ctrl.$$parentForm.$setValidity(validationErrorKey, combinedState, ctrl);
        }
        function createAndSet(name, value, controller) {
          if (!ctrl[name]) {
            ctrl[name] = {};
          }
          set(ctrl[name], value, controller);
        }
        function unsetAndCleanup(name, value, controller) {
          if (ctrl[name]) {
            unset(ctrl[name], value, controller);
          }
          if (isObjectEmpty(ctrl[name])) {
            ctrl[name] = undefined;
          }
        }
        function cachedToggleClass(className, switchValue) {
          if (switchValue && !classCache[className]) {
            $animate.addClass($element, className);
            classCache[className] = true;
          } else if (!switchValue && classCache[className]) {
            $animate.removeClass($element, className);
            classCache[className] = false;
          }
        }
        function toggleValidationCss(validationErrorKey, isValid) {
          validationErrorKey = validationErrorKey ? '-' + snake_case(validationErrorKey, '-') : '';
          cachedToggleClass(VALID_CLASS + validationErrorKey, isValid === true);
          cachedToggleClass(INVALID_CLASS + validationErrorKey, isValid === false);
        }
      }
      function isObjectEmpty(obj) {
        if (obj) {
          for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
              return false;
            }
          }
        }
        return true;
      }
      var ngNonBindableDirective = ngDirective({
        terminal: true,
        priority: 1000
      });
      var ngOptionsMinErr = minErr('ngOptions');
      var NG_OPTIONS_REGEXP = /^\s*([\s\S]+?)(?:\s+as\s+([\s\S]+?))?(?:\s+group\s+by\s+([\s\S]+?))?(?:\s+disable\s+when\s+([\s\S]+?))?\s+for\s+(?:([\$\w][\$\w]*)|(?:\(\s*([\$\w][\$\w]*)\s*,\s*([\$\w][\$\w]*)\s*\)))\s+in\s+([\s\S]+?)(?:\s+track\s+by\s+([\s\S]+?))?$/;
      var ngOptionsDirective = ['$compile', '$parse', function($compile, $parse) {
        function parseOptionsExpression(optionsExp, selectElement, scope) {
          var match = optionsExp.match(NG_OPTIONS_REGEXP);
          if (!(match)) {
            throw ngOptionsMinErr('iexp', "Expected expression in form of " + "'_select_ (as _label_)? for (_key_,)?_value_ in _collection_'" + " but got '{0}'. Element: {1}", optionsExp, startingTag(selectElement));
          }
          var valueName = match[5] || match[7];
          var keyName = match[6];
          var selectAs = / as /.test(match[0]) && match[1];
          var trackBy = match[9];
          var valueFn = $parse(match[2] ? match[1] : valueName);
          var selectAsFn = selectAs && $parse(selectAs);
          var viewValueFn = selectAsFn || valueFn;
          var trackByFn = trackBy && $parse(trackBy);
          var getTrackByValueFn = trackBy ? function(value, locals) {
            return trackByFn(scope, locals);
          } : function getHashOfValue(value) {
            return hashKey(value);
          };
          var getTrackByValue = function(value, key) {
            return getTrackByValueFn(value, getLocals(value, key));
          };
          var displayFn = $parse(match[2] || match[1]);
          var groupByFn = $parse(match[3] || '');
          var disableWhenFn = $parse(match[4] || '');
          var valuesFn = $parse(match[8]);
          var locals = {};
          var getLocals = keyName ? function(value, key) {
            locals[keyName] = key;
            locals[valueName] = value;
            return locals;
          } : function(value) {
            locals[valueName] = value;
            return locals;
          };
          function Option(selectValue, viewValue, label, group, disabled) {
            this.selectValue = selectValue;
            this.viewValue = viewValue;
            this.label = label;
            this.group = group;
            this.disabled = disabled;
          }
          function getOptionValuesKeys(optionValues) {
            var optionValuesKeys;
            if (!keyName && isArrayLike(optionValues)) {
              optionValuesKeys = optionValues;
            } else {
              optionValuesKeys = [];
              for (var itemKey in optionValues) {
                if (optionValues.hasOwnProperty(itemKey) && itemKey.charAt(0) !== '$') {
                  optionValuesKeys.push(itemKey);
                }
              }
            }
            return optionValuesKeys;
          }
          return {
            trackBy: trackBy,
            getTrackByValue: getTrackByValue,
            getWatchables: $parse(valuesFn, function(optionValues) {
              var watchedArray = [];
              optionValues = optionValues || [];
              var optionValuesKeys = getOptionValuesKeys(optionValues);
              var optionValuesLength = optionValuesKeys.length;
              for (var index = 0; index < optionValuesLength; index++) {
                var key = (optionValues === optionValuesKeys) ? index : optionValuesKeys[index];
                var value = optionValues[key];
                var locals = getLocals(optionValues[key], key);
                var selectValue = getTrackByValueFn(optionValues[key], locals);
                watchedArray.push(selectValue);
                if (match[2] || match[1]) {
                  var label = displayFn(scope, locals);
                  watchedArray.push(label);
                }
                if (match[4]) {
                  var disableWhen = disableWhenFn(scope, locals);
                  watchedArray.push(disableWhen);
                }
              }
              return watchedArray;
            }),
            getOptions: function() {
              var optionItems = [];
              var selectValueMap = {};
              var optionValues = valuesFn(scope) || [];
              var optionValuesKeys = getOptionValuesKeys(optionValues);
              var optionValuesLength = optionValuesKeys.length;
              for (var index = 0; index < optionValuesLength; index++) {
                var key = (optionValues === optionValuesKeys) ? index : optionValuesKeys[index];
                var value = optionValues[key];
                var locals = getLocals(value, key);
                var viewValue = viewValueFn(scope, locals);
                var selectValue = getTrackByValueFn(viewValue, locals);
                var label = displayFn(scope, locals);
                var group = groupByFn(scope, locals);
                var disabled = disableWhenFn(scope, locals);
                var optionItem = new Option(selectValue, viewValue, label, group, disabled);
                optionItems.push(optionItem);
                selectValueMap[selectValue] = optionItem;
              }
              return {
                items: optionItems,
                selectValueMap: selectValueMap,
                getOptionFromViewValue: function(value) {
                  return selectValueMap[getTrackByValue(value)];
                },
                getViewValueFromOption: function(option) {
                  return trackBy ? angular.copy(option.viewValue) : option.viewValue;
                }
              };
            }
          };
        }
        var optionTemplate = document.createElement('option'),
            optGroupTemplate = document.createElement('optgroup');
        function ngOptionsPostLink(scope, selectElement, attr, ctrls) {
          var ngModelCtrl = ctrls[1];
          if (!ngModelCtrl)
            return;
          var selectCtrl = ctrls[0];
          var multiple = attr.multiple;
          var emptyOption;
          for (var i = 0,
              children = selectElement.children(),
              ii = children.length; i < ii; i++) {
            if (children[i].value === '') {
              emptyOption = children.eq(i);
              break;
            }
          }
          var providedEmptyOption = !!emptyOption;
          var unknownOption = jqLite(optionTemplate.cloneNode(false));
          unknownOption.val('?');
          var options;
          var ngOptions = parseOptionsExpression(attr.ngOptions, selectElement, scope);
          var renderEmptyOption = function() {
            if (!providedEmptyOption) {
              selectElement.prepend(emptyOption);
            }
            selectElement.val('');
            emptyOption.prop('selected', true);
            emptyOption.attr('selected', true);
          };
          var removeEmptyOption = function() {
            if (!providedEmptyOption) {
              emptyOption.remove();
            }
          };
          var renderUnknownOption = function() {
            selectElement.prepend(unknownOption);
            selectElement.val('?');
            unknownOption.prop('selected', true);
            unknownOption.attr('selected', true);
          };
          var removeUnknownOption = function() {
            unknownOption.remove();
          };
          if (!multiple) {
            selectCtrl.writeValue = function writeNgOptionsValue(value) {
              var option = options.getOptionFromViewValue(value);
              if (option && !option.disabled) {
                if (selectElement[0].value !== option.selectValue) {
                  removeUnknownOption();
                  removeEmptyOption();
                  selectElement[0].value = option.selectValue;
                  option.element.selected = true;
                  option.element.setAttribute('selected', 'selected');
                }
              } else {
                if (value === null || providedEmptyOption) {
                  removeUnknownOption();
                  renderEmptyOption();
                } else {
                  removeEmptyOption();
                  renderUnknownOption();
                }
              }
            };
            selectCtrl.readValue = function readNgOptionsValue() {
              var selectedOption = options.selectValueMap[selectElement.val()];
              if (selectedOption && !selectedOption.disabled) {
                removeEmptyOption();
                removeUnknownOption();
                return options.getViewValueFromOption(selectedOption);
              }
              return null;
            };
            if (ngOptions.trackBy) {
              scope.$watch(function() {
                return ngOptions.getTrackByValue(ngModelCtrl.$viewValue);
              }, function() {
                ngModelCtrl.$render();
              });
            }
          } else {
            ngModelCtrl.$isEmpty = function(value) {
              return !value || value.length === 0;
            };
            selectCtrl.writeValue = function writeNgOptionsMultiple(value) {
              options.items.forEach(function(option) {
                option.element.selected = false;
              });
              if (value) {
                value.forEach(function(item) {
                  var option = options.getOptionFromViewValue(item);
                  if (option && !option.disabled)
                    option.element.selected = true;
                });
              }
            };
            selectCtrl.readValue = function readNgOptionsMultiple() {
              var selectedValues = selectElement.val() || [],
                  selections = [];
              forEach(selectedValues, function(value) {
                var option = options.selectValueMap[value];
                if (option && !option.disabled)
                  selections.push(options.getViewValueFromOption(option));
              });
              return selections;
            };
            if (ngOptions.trackBy) {
              scope.$watchCollection(function() {
                if (isArray(ngModelCtrl.$viewValue)) {
                  return ngModelCtrl.$viewValue.map(function(value) {
                    return ngOptions.getTrackByValue(value);
                  });
                }
              }, function() {
                ngModelCtrl.$render();
              });
            }
          }
          if (providedEmptyOption) {
            emptyOption.remove();
            $compile(emptyOption)(scope);
            emptyOption.removeClass('ng-scope');
          } else {
            emptyOption = jqLite(optionTemplate.cloneNode(false));
          }
          updateOptions();
          scope.$watchCollection(ngOptions.getWatchables, updateOptions);
          function updateOptionElement(option, element) {
            option.element = element;
            element.disabled = option.disabled;
            if (option.label !== element.label) {
              element.label = option.label;
              element.textContent = option.label;
            }
            if (option.value !== element.value)
              element.value = option.selectValue;
          }
          function addOrReuseElement(parent, current, type, templateElement) {
            var element;
            if (current && lowercase(current.nodeName) === type) {
              element = current;
            } else {
              element = templateElement.cloneNode(false);
              if (!current) {
                parent.appendChild(element);
              } else {
                parent.insertBefore(element, current);
              }
            }
            return element;
          }
          function removeExcessElements(current) {
            var next;
            while (current) {
              next = current.nextSibling;
              jqLiteRemove(current);
              current = next;
            }
          }
          function skipEmptyAndUnknownOptions(current) {
            var emptyOption_ = emptyOption && emptyOption[0];
            var unknownOption_ = unknownOption && unknownOption[0];
            if (emptyOption_ || unknownOption_) {
              while (current && (current === emptyOption_ || current === unknownOption_ || current.nodeType === NODE_TYPE_COMMENT || current.value === '')) {
                current = current.nextSibling;
              }
            }
            return current;
          }
          function updateOptions() {
            var previousValue = options && selectCtrl.readValue();
            options = ngOptions.getOptions();
            var groupMap = {};
            var currentElement = selectElement[0].firstChild;
            if (providedEmptyOption) {
              selectElement.prepend(emptyOption);
            }
            currentElement = skipEmptyAndUnknownOptions(currentElement);
            options.items.forEach(function updateOption(option) {
              var group;
              var groupElement;
              var optionElement;
              if (option.group) {
                group = groupMap[option.group];
                if (!group) {
                  groupElement = addOrReuseElement(selectElement[0], currentElement, 'optgroup', optGroupTemplate);
                  currentElement = groupElement.nextSibling;
                  groupElement.label = option.group;
                  group = groupMap[option.group] = {
                    groupElement: groupElement,
                    currentOptionElement: groupElement.firstChild
                  };
                }
                optionElement = addOrReuseElement(group.groupElement, group.currentOptionElement, 'option', optionTemplate);
                updateOptionElement(option, optionElement);
                group.currentOptionElement = optionElement.nextSibling;
              } else {
                optionElement = addOrReuseElement(selectElement[0], currentElement, 'option', optionTemplate);
                updateOptionElement(option, optionElement);
                currentElement = optionElement.nextSibling;
              }
            });
            Object.keys(groupMap).forEach(function(key) {
              removeExcessElements(groupMap[key].currentOptionElement);
            });
            removeExcessElements(currentElement);
            ngModelCtrl.$render();
            if (!ngModelCtrl.$isEmpty(previousValue)) {
              var nextValue = selectCtrl.readValue();
              if (ngOptions.trackBy ? !equals(previousValue, nextValue) : previousValue !== nextValue) {
                ngModelCtrl.$setViewValue(nextValue);
                ngModelCtrl.$render();
              }
            }
          }
        }
        return {
          restrict: 'A',
          terminal: true,
          require: ['select', '?ngModel'],
          link: {
            pre: function ngOptionsPreLink(scope, selectElement, attr, ctrls) {
              ctrls[0].registerOption = noop;
            },
            post: ngOptionsPostLink
          }
        };
      }];
      var ngPluralizeDirective = ['$locale', '$interpolate', '$log', function($locale, $interpolate, $log) {
        var BRACE = /{}/g,
            IS_WHEN = /^when(Minus)?(.+)$/;
        return {link: function(scope, element, attr) {
            var numberExp = attr.count,
                whenExp = attr.$attr.when && element.attr(attr.$attr.when),
                offset = attr.offset || 0,
                whens = scope.$eval(whenExp) || {},
                whensExpFns = {},
                startSymbol = $interpolate.startSymbol(),
                endSymbol = $interpolate.endSymbol(),
                braceReplacement = startSymbol + numberExp + '-' + offset + endSymbol,
                watchRemover = angular.noop,
                lastCount;
            forEach(attr, function(expression, attributeName) {
              var tmpMatch = IS_WHEN.exec(attributeName);
              if (tmpMatch) {
                var whenKey = (tmpMatch[1] ? '-' : '') + lowercase(tmpMatch[2]);
                whens[whenKey] = element.attr(attr.$attr[attributeName]);
              }
            });
            forEach(whens, function(expression, key) {
              whensExpFns[key] = $interpolate(expression.replace(BRACE, braceReplacement));
            });
            scope.$watch(numberExp, function ngPluralizeWatchAction(newVal) {
              var count = parseFloat(newVal);
              var countIsNaN = isNaN(count);
              if (!countIsNaN && !(count in whens)) {
                count = $locale.pluralCat(count - offset);
              }
              if ((count !== lastCount) && !(countIsNaN && isNumber(lastCount) && isNaN(lastCount))) {
                watchRemover();
                var whenExpFn = whensExpFns[count];
                if (isUndefined(whenExpFn)) {
                  if (newVal != null) {
                    $log.debug("ngPluralize: no rule defined for '" + count + "' in " + whenExp);
                  }
                  watchRemover = noop;
                  updateElementText();
                } else {
                  watchRemover = scope.$watch(whenExpFn, updateElementText);
                }
                lastCount = count;
              }
            });
            function updateElementText(newText) {
              element.text(newText || '');
            }
          }};
      }];
      var ngRepeatDirective = ['$parse', '$animate', function($parse, $animate) {
        var NG_REMOVED = '$$NG_REMOVED';
        var ngRepeatMinErr = minErr('ngRepeat');
        var updateScope = function(scope, index, valueIdentifier, value, keyIdentifier, key, arrayLength) {
          scope[valueIdentifier] = value;
          if (keyIdentifier)
            scope[keyIdentifier] = key;
          scope.$index = index;
          scope.$first = (index === 0);
          scope.$last = (index === (arrayLength - 1));
          scope.$middle = !(scope.$first || scope.$last);
          scope.$odd = !(scope.$even = (index & 1) === 0);
        };
        var getBlockStart = function(block) {
          return block.clone[0];
        };
        var getBlockEnd = function(block) {
          return block.clone[block.clone.length - 1];
        };
        return {
          restrict: 'A',
          multiElement: true,
          transclude: 'element',
          priority: 1000,
          terminal: true,
          $$tlb: true,
          compile: function ngRepeatCompile($element, $attr) {
            var expression = $attr.ngRepeat;
            var ngRepeatEndComment = document.createComment(' end ngRepeat: ' + expression + ' ');
            var match = expression.match(/^\s*([\s\S]+?)\s+in\s+([\s\S]+?)(?:\s+as\s+([\s\S]+?))?(?:\s+track\s+by\s+([\s\S]+?))?\s*$/);
            if (!match) {
              throw ngRepeatMinErr('iexp', "Expected expression in form of '_item_ in _collection_[ track by _id_]' but got '{0}'.", expression);
            }
            var lhs = match[1];
            var rhs = match[2];
            var aliasAs = match[3];
            var trackByExp = match[4];
            match = lhs.match(/^(?:(\s*[\$\w]+)|\(\s*([\$\w]+)\s*,\s*([\$\w]+)\s*\))$/);
            if (!match) {
              throw ngRepeatMinErr('iidexp', "'_item_' in '_item_ in _collection_' should be an identifier or '(_key_, _value_)' expression, but got '{0}'.", lhs);
            }
            var valueIdentifier = match[3] || match[1];
            var keyIdentifier = match[2];
            if (aliasAs && (!/^[$a-zA-Z_][$a-zA-Z0-9_]*$/.test(aliasAs) || /^(null|undefined|this|\$index|\$first|\$middle|\$last|\$even|\$odd|\$parent|\$root|\$id)$/.test(aliasAs))) {
              throw ngRepeatMinErr('badident', "alias '{0}' is invalid --- must be a valid JS identifier which is not a reserved name.", aliasAs);
            }
            var trackByExpGetter,
                trackByIdExpFn,
                trackByIdArrayFn,
                trackByIdObjFn;
            var hashFnLocals = {$id: hashKey};
            if (trackByExp) {
              trackByExpGetter = $parse(trackByExp);
            } else {
              trackByIdArrayFn = function(key, value) {
                return hashKey(value);
              };
              trackByIdObjFn = function(key) {
                return key;
              };
            }
            return function ngRepeatLink($scope, $element, $attr, ctrl, $transclude) {
              if (trackByExpGetter) {
                trackByIdExpFn = function(key, value, index) {
                  if (keyIdentifier)
                    hashFnLocals[keyIdentifier] = key;
                  hashFnLocals[valueIdentifier] = value;
                  hashFnLocals.$index = index;
                  return trackByExpGetter($scope, hashFnLocals);
                };
              }
              var lastBlockMap = createMap();
              $scope.$watchCollection(rhs, function ngRepeatAction(collection) {
                var index,
                    length,
                    previousNode = $element[0],
                    nextNode,
                    nextBlockMap = createMap(),
                    collectionLength,
                    key,
                    value,
                    trackById,
                    trackByIdFn,
                    collectionKeys,
                    block,
                    nextBlockOrder,
                    elementsToRemove;
                if (aliasAs) {
                  $scope[aliasAs] = collection;
                }
                if (isArrayLike(collection)) {
                  collectionKeys = collection;
                  trackByIdFn = trackByIdExpFn || trackByIdArrayFn;
                } else {
                  trackByIdFn = trackByIdExpFn || trackByIdObjFn;
                  collectionKeys = [];
                  for (var itemKey in collection) {
                    if (hasOwnProperty.call(collection, itemKey) && itemKey.charAt(0) !== '$') {
                      collectionKeys.push(itemKey);
                    }
                  }
                }
                collectionLength = collectionKeys.length;
                nextBlockOrder = new Array(collectionLength);
                for (index = 0; index < collectionLength; index++) {
                  key = (collection === collectionKeys) ? index : collectionKeys[index];
                  value = collection[key];
                  trackById = trackByIdFn(key, value, index);
                  if (lastBlockMap[trackById]) {
                    block = lastBlockMap[trackById];
                    delete lastBlockMap[trackById];
                    nextBlockMap[trackById] = block;
                    nextBlockOrder[index] = block;
                  } else if (nextBlockMap[trackById]) {
                    forEach(nextBlockOrder, function(block) {
                      if (block && block.scope)
                        lastBlockMap[block.id] = block;
                    });
                    throw ngRepeatMinErr('dupes', "Duplicates in a repeater are not allowed. Use 'track by' expression to specify unique keys. Repeater: {0}, Duplicate key: {1}, Duplicate value: {2}", expression, trackById, value);
                  } else {
                    nextBlockOrder[index] = {
                      id: trackById,
                      scope: undefined,
                      clone: undefined
                    };
                    nextBlockMap[trackById] = true;
                  }
                }
                for (var blockKey in lastBlockMap) {
                  block = lastBlockMap[blockKey];
                  elementsToRemove = getBlockNodes(block.clone);
                  $animate.leave(elementsToRemove);
                  if (elementsToRemove[0].parentNode) {
                    for (index = 0, length = elementsToRemove.length; index < length; index++) {
                      elementsToRemove[index][NG_REMOVED] = true;
                    }
                  }
                  block.scope.$destroy();
                }
                for (index = 0; index < collectionLength; index++) {
                  key = (collection === collectionKeys) ? index : collectionKeys[index];
                  value = collection[key];
                  block = nextBlockOrder[index];
                  if (block.scope) {
                    nextNode = previousNode;
                    do {
                      nextNode = nextNode.nextSibling;
                    } while (nextNode && nextNode[NG_REMOVED]);
                    if (getBlockStart(block) != nextNode) {
                      $animate.move(getBlockNodes(block.clone), null, jqLite(previousNode));
                    }
                    previousNode = getBlockEnd(block);
                    updateScope(block.scope, index, valueIdentifier, value, keyIdentifier, key, collectionLength);
                  } else {
                    $transclude(function ngRepeatTransclude(clone, scope) {
                      block.scope = scope;
                      var endNode = ngRepeatEndComment.cloneNode(false);
                      clone[clone.length++] = endNode;
                      $animate.enter(clone, null, jqLite(previousNode));
                      previousNode = endNode;
                      block.clone = clone;
                      nextBlockMap[block.id] = block;
                      updateScope(block.scope, index, valueIdentifier, value, keyIdentifier, key, collectionLength);
                    });
                  }
                }
                lastBlockMap = nextBlockMap;
              });
            };
          }
        };
      }];
      var NG_HIDE_CLASS = 'ng-hide';
      var NG_HIDE_IN_PROGRESS_CLASS = 'ng-hide-animate';
      var ngShowDirective = ['$animate', function($animate) {
        return {
          restrict: 'A',
          multiElement: true,
          link: function(scope, element, attr) {
            scope.$watch(attr.ngShow, function ngShowWatchAction(value) {
              $animate[value ? 'removeClass' : 'addClass'](element, NG_HIDE_CLASS, {tempClasses: NG_HIDE_IN_PROGRESS_CLASS});
            });
          }
        };
      }];
      var ngHideDirective = ['$animate', function($animate) {
        return {
          restrict: 'A',
          multiElement: true,
          link: function(scope, element, attr) {
            scope.$watch(attr.ngHide, function ngHideWatchAction(value) {
              $animate[value ? 'addClass' : 'removeClass'](element, NG_HIDE_CLASS, {tempClasses: NG_HIDE_IN_PROGRESS_CLASS});
            });
          }
        };
      }];
      var ngStyleDirective = ngDirective(function(scope, element, attr) {
        scope.$watch(attr.ngStyle, function ngStyleWatchAction(newStyles, oldStyles) {
          if (oldStyles && (newStyles !== oldStyles)) {
            forEach(oldStyles, function(val, style) {
              element.css(style, '');
            });
          }
          if (newStyles)
            element.css(newStyles);
        }, true);
      });
      var ngSwitchDirective = ['$animate', function($animate) {
        return {
          require: 'ngSwitch',
          controller: ['$scope', function ngSwitchController() {
            this.cases = {};
          }],
          link: function(scope, element, attr, ngSwitchController) {
            var watchExpr = attr.ngSwitch || attr.on,
                selectedTranscludes = [],
                selectedElements = [],
                previousLeaveAnimations = [],
                selectedScopes = [];
            var spliceFactory = function(array, index) {
              return function() {
                array.splice(index, 1);
              };
            };
            scope.$watch(watchExpr, function ngSwitchWatchAction(value) {
              var i,
                  ii;
              for (i = 0, ii = previousLeaveAnimations.length; i < ii; ++i) {
                $animate.cancel(previousLeaveAnimations[i]);
              }
              previousLeaveAnimations.length = 0;
              for (i = 0, ii = selectedScopes.length; i < ii; ++i) {
                var selected = getBlockNodes(selectedElements[i].clone);
                selectedScopes[i].$destroy();
                var promise = previousLeaveAnimations[i] = $animate.leave(selected);
                promise.then(spliceFactory(previousLeaveAnimations, i));
              }
              selectedElements.length = 0;
              selectedScopes.length = 0;
              if ((selectedTranscludes = ngSwitchController.cases['!' + value] || ngSwitchController.cases['?'])) {
                forEach(selectedTranscludes, function(selectedTransclude) {
                  selectedTransclude.transclude(function(caseElement, selectedScope) {
                    selectedScopes.push(selectedScope);
                    var anchor = selectedTransclude.element;
                    caseElement[caseElement.length++] = document.createComment(' end ngSwitchWhen: ');
                    var block = {clone: caseElement};
                    selectedElements.push(block);
                    $animate.enter(caseElement, anchor.parent(), anchor);
                  });
                });
              }
            });
          }
        };
      }];
      var ngSwitchWhenDirective = ngDirective({
        transclude: 'element',
        priority: 1200,
        require: '^ngSwitch',
        multiElement: true,
        link: function(scope, element, attrs, ctrl, $transclude) {
          ctrl.cases['!' + attrs.ngSwitchWhen] = (ctrl.cases['!' + attrs.ngSwitchWhen] || []);
          ctrl.cases['!' + attrs.ngSwitchWhen].push({
            transclude: $transclude,
            element: element
          });
        }
      });
      var ngSwitchDefaultDirective = ngDirective({
        transclude: 'element',
        priority: 1200,
        require: '^ngSwitch',
        multiElement: true,
        link: function(scope, element, attr, ctrl, $transclude) {
          ctrl.cases['?'] = (ctrl.cases['?'] || []);
          ctrl.cases['?'].push({
            transclude: $transclude,
            element: element
          });
        }
      });
      var ngTranscludeDirective = ngDirective({
        restrict: 'EAC',
        link: function($scope, $element, $attrs, controller, $transclude) {
          if (!$transclude) {
            throw minErr('ngTransclude')('orphan', 'Illegal use of ngTransclude directive in the template! ' + 'No parent directive that requires a transclusion found. ' + 'Element: {0}', startingTag($element));
          }
          $transclude(function(clone) {
            $element.empty();
            $element.append(clone);
          });
        }
      });
      var scriptDirective = ['$templateCache', function($templateCache) {
        return {
          restrict: 'E',
          terminal: true,
          compile: function(element, attr) {
            if (attr.type == 'text/ng-template') {
              var templateUrl = attr.id,
                  text = element[0].text;
              $templateCache.put(templateUrl, text);
            }
          }
        };
      }];
      var noopNgModelController = {
        $setViewValue: noop,
        $render: noop
      };
      function chromeHack(optionElement) {
        if (optionElement[0].hasAttribute('selected')) {
          optionElement[0].selected = true;
        }
      }
      var SelectController = ['$element', '$scope', '$attrs', function($element, $scope, $attrs) {
        var self = this,
            optionsMap = new HashMap();
        self.ngModelCtrl = noopNgModelController;
        self.unknownOption = jqLite(document.createElement('option'));
        self.renderUnknownOption = function(val) {
          var unknownVal = '? ' + hashKey(val) + ' ?';
          self.unknownOption.val(unknownVal);
          $element.prepend(self.unknownOption);
          $element.val(unknownVal);
        };
        $scope.$on('$destroy', function() {
          self.renderUnknownOption = noop;
        });
        self.removeUnknownOption = function() {
          if (self.unknownOption.parent())
            self.unknownOption.remove();
        };
        self.readValue = function readSingleValue() {
          self.removeUnknownOption();
          return $element.val();
        };
        self.writeValue = function writeSingleValue(value) {
          if (self.hasOption(value)) {
            self.removeUnknownOption();
            $element.val(value);
            if (value === '')
              self.emptyOption.prop('selected', true);
          } else {
            if (value == null && self.emptyOption) {
              self.removeUnknownOption();
              $element.val('');
            } else {
              self.renderUnknownOption(value);
            }
          }
        };
        self.addOption = function(value, element) {
          assertNotHasOwnProperty(value, '"option value"');
          if (value === '') {
            self.emptyOption = element;
          }
          var count = optionsMap.get(value) || 0;
          optionsMap.put(value, count + 1);
          self.ngModelCtrl.$render();
          chromeHack(element);
        };
        self.removeOption = function(value) {
          var count = optionsMap.get(value);
          if (count) {
            if (count === 1) {
              optionsMap.remove(value);
              if (value === '') {
                self.emptyOption = undefined;
              }
            } else {
              optionsMap.put(value, count - 1);
            }
          }
        };
        self.hasOption = function(value) {
          return !!optionsMap.get(value);
        };
        self.registerOption = function(optionScope, optionElement, optionAttrs, interpolateValueFn, interpolateTextFn) {
          if (interpolateValueFn) {
            var oldVal;
            optionAttrs.$observe('value', function valueAttributeObserveAction(newVal) {
              if (isDefined(oldVal)) {
                self.removeOption(oldVal);
              }
              oldVal = newVal;
              self.addOption(newVal, optionElement);
            });
          } else if (interpolateTextFn) {
            optionScope.$watch(interpolateTextFn, function interpolateWatchAction(newVal, oldVal) {
              optionAttrs.$set('value', newVal);
              if (oldVal !== newVal) {
                self.removeOption(oldVal);
              }
              self.addOption(newVal, optionElement);
            });
          } else {
            self.addOption(optionAttrs.value, optionElement);
          }
          optionElement.on('$destroy', function() {
            self.removeOption(optionAttrs.value);
            self.ngModelCtrl.$render();
          });
        };
      }];
      var selectDirective = function() {
        return {
          restrict: 'E',
          require: ['select', '?ngModel'],
          controller: SelectController,
          priority: 1,
          link: {pre: selectPreLink}
        };
        function selectPreLink(scope, element, attr, ctrls) {
          var ngModelCtrl = ctrls[1];
          if (!ngModelCtrl)
            return;
          var selectCtrl = ctrls[0];
          selectCtrl.ngModelCtrl = ngModelCtrl;
          ngModelCtrl.$render = function() {
            selectCtrl.writeValue(ngModelCtrl.$viewValue);
          };
          element.on('change', function() {
            scope.$apply(function() {
              ngModelCtrl.$setViewValue(selectCtrl.readValue());
            });
          });
          if (attr.multiple) {
            selectCtrl.readValue = function readMultipleValue() {
              var array = [];
              forEach(element.find('option'), function(option) {
                if (option.selected) {
                  array.push(option.value);
                }
              });
              return array;
            };
            selectCtrl.writeValue = function writeMultipleValue(value) {
              var items = new HashMap(value);
              forEach(element.find('option'), function(option) {
                option.selected = isDefined(items.get(option.value));
              });
            };
            var lastView,
                lastViewRef = NaN;
            scope.$watch(function selectMultipleWatch() {
              if (lastViewRef === ngModelCtrl.$viewValue && !equals(lastView, ngModelCtrl.$viewValue)) {
                lastView = shallowCopy(ngModelCtrl.$viewValue);
                ngModelCtrl.$render();
              }
              lastViewRef = ngModelCtrl.$viewValue;
            });
            ngModelCtrl.$isEmpty = function(value) {
              return !value || value.length === 0;
            };
          }
        }
      };
      var optionDirective = ['$interpolate', function($interpolate) {
        return {
          restrict: 'E',
          priority: 100,
          compile: function(element, attr) {
            if (isDefined(attr.value)) {
              var interpolateValueFn = $interpolate(attr.value, true);
            } else {
              var interpolateTextFn = $interpolate(element.text(), true);
              if (!interpolateTextFn) {
                attr.$set('value', element.text());
              }
            }
            return function(scope, element, attr) {
              var selectCtrlName = '$selectController',
                  parent = element.parent(),
                  selectCtrl = parent.data(selectCtrlName) || parent.parent().data(selectCtrlName);
              if (selectCtrl) {
                selectCtrl.registerOption(scope, element, attr, interpolateValueFn, interpolateTextFn);
              }
            };
          }
        };
      }];
      var styleDirective = valueFn({
        restrict: 'E',
        terminal: false
      });
      var requiredDirective = function() {
        return {
          restrict: 'A',
          require: '?ngModel',
          link: function(scope, elm, attr, ctrl) {
            if (!ctrl)
              return;
            attr.required = true;
            ctrl.$validators.required = function(modelValue, viewValue) {
              return !attr.required || !ctrl.$isEmpty(viewValue);
            };
            attr.$observe('required', function() {
              ctrl.$validate();
            });
          }
        };
      };
      var patternDirective = function() {
        return {
          restrict: 'A',
          require: '?ngModel',
          link: function(scope, elm, attr, ctrl) {
            if (!ctrl)
              return;
            var regexp,
                patternExp = attr.ngPattern || attr.pattern;
            attr.$observe('pattern', function(regex) {
              if (isString(regex) && regex.length > 0) {
                regex = new RegExp('^' + regex + '$');
              }
              if (regex && !regex.test) {
                throw minErr('ngPattern')('noregexp', 'Expected {0} to be a RegExp but was {1}. Element: {2}', patternExp, regex, startingTag(elm));
              }
              regexp = regex || undefined;
              ctrl.$validate();
            });
            ctrl.$validators.pattern = function(modelValue, viewValue) {
              return ctrl.$isEmpty(viewValue) || isUndefined(regexp) || regexp.test(viewValue);
            };
          }
        };
      };
      var maxlengthDirective = function() {
        return {
          restrict: 'A',
          require: '?ngModel',
          link: function(scope, elm, attr, ctrl) {
            if (!ctrl)
              return;
            var maxlength = -1;
            attr.$observe('maxlength', function(value) {
              var intVal = toInt(value);
              maxlength = isNaN(intVal) ? -1 : intVal;
              ctrl.$validate();
            });
            ctrl.$validators.maxlength = function(modelValue, viewValue) {
              return (maxlength < 0) || ctrl.$isEmpty(viewValue) || (viewValue.length <= maxlength);
            };
          }
        };
      };
      var minlengthDirective = function() {
        return {
          restrict: 'A',
          require: '?ngModel',
          link: function(scope, elm, attr, ctrl) {
            if (!ctrl)
              return;
            var minlength = 0;
            attr.$observe('minlength', function(value) {
              minlength = toInt(value) || 0;
              ctrl.$validate();
            });
            ctrl.$validators.minlength = function(modelValue, viewValue) {
              return ctrl.$isEmpty(viewValue) || viewValue.length >= minlength;
            };
          }
        };
      };
      if (window.angular.bootstrap) {
        console.log('WARNING: Tried to load angular more than once.');
        return;
      }
      bindJQuery();
      publishExternalAPI(angular);
      angular.module("ngLocale", [], ["$provide", function($provide) {
        var PLURAL_CATEGORY = {
          ZERO: "zero",
          ONE: "one",
          TWO: "two",
          FEW: "few",
          MANY: "many",
          OTHER: "other"
        };
        function getDecimals(n) {
          n = n + '';
          var i = n.indexOf('.');
          return (i == -1) ? 0 : n.length - i - 1;
        }
        function getVF(n, opt_precision) {
          var v = opt_precision;
          if (undefined === v) {
            v = Math.min(getDecimals(n), 3);
          }
          var base = Math.pow(10, v);
          var f = ((n * base) | 0) % base;
          return {
            v: v,
            f: f
          };
        }
        $provide.value("$locale", {
          "DATETIME_FORMATS": {
            "AMPMS": ["AM", "PM"],
            "DAY": ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
            "ERANAMES": ["Before Christ", "Anno Domini"],
            "ERAS": ["BC", "AD"],
            "FIRSTDAYOFWEEK": 6,
            "MONTH": ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
            "SHORTDAY": ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
            "SHORTMONTH": ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
            "WEEKENDRANGE": [5, 6],
            "fullDate": "EEEE, MMMM d, y",
            "longDate": "MMMM d, y",
            "medium": "MMM d, y h:mm:ss a",
            "mediumDate": "MMM d, y",
            "mediumTime": "h:mm:ss a",
            "short": "M/d/yy h:mm a",
            "shortDate": "M/d/yy",
            "shortTime": "h:mm a"
          },
          "NUMBER_FORMATS": {
            "CURRENCY_SYM": "$",
            "DECIMAL_SEP": ".",
            "GROUP_SEP": ",",
            "PATTERNS": [{
              "gSize": 3,
              "lgSize": 3,
              "maxFrac": 3,
              "minFrac": 0,
              "minInt": 1,
              "negPre": "-",
              "negSuf": "",
              "posPre": "",
              "posSuf": ""
            }, {
              "gSize": 3,
              "lgSize": 3,
              "maxFrac": 2,
              "minFrac": 2,
              "minInt": 1,
              "negPre": "-\u00a4",
              "negSuf": "",
              "posPre": "\u00a4",
              "posSuf": ""
            }]
          },
          "id": "en-us",
          "pluralCat": function(n, opt_precision) {
            var i = n | 0;
            var vf = getVF(n, opt_precision);
            if (i == 1 && vf.v == 0) {
              return PLURAL_CATEGORY.ONE;
            }
            return PLURAL_CATEGORY.OTHER;
          }
        });
      }]);
      jqLite(document).ready(function() {
        angularInit(document, bootstrap);
      });
    })(window, document);
    !window.angular.$$csp().noInlineStyle && window.angular.element(document.head).prepend('<style type="text/css">@charset "UTF-8";[ng\\:cloak],[ng-cloak],[data-ng-cloak],[x-ng-cloak],.ng-cloak,.x-ng-cloak,.ng-hide:not(.ng-hide-animate){display:none !important;}ng\\:form{display:block;}.ng-animate-shim{visibility:hidden;}.ng-anchor{position:absolute;}</style>');
  })();
  return _retrieveGlobal();
});

$__System.registerDynamic("3c", ["51"], true, function(req, exports, module) {
  ;
  var global = this,
      __define = global.define;
  global.define = undefined;
  module.exports = req('51');
  global.define = __define;
  return module.exports;
});

$__System.register('52', ['50', '3c', '4b'], function (_export) {
	'use strict';

	var _, angular, routesModule;

	_export('bootstrap', bootstrap);

	function bootstrap() {
		// bootstrap code here
		// sort out angular

		var myApp = angular.module('pubApp', [routesModule.name]);

		angular.element(document).ready(function () {
			angular.bootstrap(document.querySelector('[data-pub-app]'), [myApp.name]);
		});
	}

	return {
		setters: [function (_2) {
			_ = _2['default'];
		}, function (_c) {
			angular = _c['default'];
		}, function (_b) {
			routesModule = _b['default'];
		}],
		execute: function () {}
	};
});
$__System.register('1', ['52'], function (_export) {
  'use strict';

  var bootstrap;
  return {
    setters: [function (_) {
      bootstrap = _.bootstrap;
    }],
    execute: function () {
      bootstrap();
    }
  };
});
})
(function(factory) {
  factory();
});
//# sourceMappingURL=build.js.map