'use strict';

function Loader(existsFileFn, readFileFn, evalScriptFn, builtins) {
  var cache = {};
  builtins = builtins || {};

  function throwError(err) {
    throw err;
  }

  function endsWith(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
  }

  function Module(pathComponents) {
    this.dirComponents = pathComponents.slice(0, -1);
    this.pathComponents = pathComponents;
    this.filename = pathComponents.join('/');
    this.dirname = this.dirComponents.length > 1 ? this.dirComponents.join('/') : '/';
    this.exports = {};
  }

  Module.prototype.require = function require(path) {
    var module = this;
    var resolvedPath = resolve(module, path);
    if (!resolvedPath) {
      throwError(new Error("Cannot resolve module '" + path + "' from '" + module.filename + "'"));
    }

    // eval file
    var pathComponents = resolvedPath.split('/');
    var displayPath = resolvedPath;
    var cacheKey = pathComponents.join('/');
    if (cache[cacheKey]) {
      return cache[cacheKey].exports;
    }

    var currentModule = global.module;
    var module = new Module(pathComponents);
    cache[cacheKey] = module;
    global.module = module;

    if (endsWith(resolvedPath, '.node')) {
      throwError(new Error("Native Node.js modules are not supported '" + resolvedPath + "'"));
    }

    var content = readFileFn(resolvedPath);
    if (!content) {
      throwError(new Error("Cannot load module '" + resolvedPath + "'"));
    }

    if (endsWith(resolvedPath, '.json')) {
      module.exports = JSON.parse(content);
    } else {
      evalScriptFn(
        '(function(require, exports, module, __filename, __dirname) { ' +
        content +
        '})(function(path){return global.module.require(path);},global.module.exports,global.module,global.module.filename,global.module.dirname)',
      displayPath);
    }

    global.module = currentModule;
    return module.exports;
  };

  function normalizePath(components) {
    var r = [];
    for (var i = 0; i < components.length; ++i) {
      var p = components[i];
      if ('' === p) {
        if (r.length === 0) {
          r.push(p);
        }
        continue;
      }

      if ('.' === p) {
        continue;
      }

      if ('..' === p) {
        if (r.length > 0) {
          r.pop();
        } else {
          return null;
        }
      } else {
        r.push(p);
      }
    }

    return r;
  }

  function loadAsFile(path) {
    if (existsFileFn(path)) {
      return path;
    }

    if (existsFileFn(path + '.js')) {
      return path + '.js';
    }

    if (existsFileFn(path + '.json')) {
      return path + '.json';
    }

    if (existsFileFn(path + '.node')) {
      return path + '.node';
    }

    return null;
  }

  function getPackageMain(packageJsonFile) {
    var json = readFileFn(packageJsonFile);
    var parsed = null;
    try {
      var parsed = JSON.parse(json);
    } catch (e) {
      throwError(new Error("package.json '" + packageJsonFile + "' parse error"));
    }

    if (parsed.runtime) {
      if (typeof parsed.runtime === 'string') {
        return parsed.runtime;
      } else {
        throwError(new Error("package.json '" + packageJsonFile + "' runtime field value is invalid"));
      }
    }

    return parsed.main || 'index.js';
  }

  function loadAsDirectory(path) {
    var mainFile = 'index';
    if (existsFileFn(path + '/package.json')) {
      mainFile = getPackageMain(path + '/package.json') || 'index';
    }

    var normalizedPath = normalizePath(path.split('/').concat(mainFile.split('/')));
    if (!normalizedPath) {
      return null;
    }

    return loadAsFile(normalizedPath.join('/'));
  }

  function loadNodeModules(dirComponents, parts) {
    var count = dirComponents.length;

    while (count-- > 0) {
      var p = dirComponents.slice(0, count + 1);
      if (p.length === 0) {
        continue;
      }

      if (p[p.length - 1] === 'node_modules') {
        continue;
      }

      p.push('node_modules');
      p = p.concat(parts);

      var normalizedPath = normalizePath(p);
      if (!normalizedPath) {
        continue;
      }

      var s = normalizedPath.join('/');
      var loadedPath = loadAsFile(s) || loadAsDirectory(s) || null;
      if (loadedPath) {
        return loadedPath;
      }
    }

    return null;
  }

  function resolve(module, path) {
    path = String(path || '');

    if (builtins.hasOwnProperty(path)) {
      path = builtins[path];
    }

    var pathComponents = path.split('/');
    var firstPathComponent = pathComponents[0];

    // starts with ./ ../  or /
    if (firstPathComponent === '.' ||
        firstPathComponent === '..' ||
        firstPathComponent === '') {
      var combinedPathComponents = (firstPathComponent === '')
        ? pathComponents
        : module.dirComponents.concat(pathComponents);

      var normalizedPath = normalizePath(combinedPathComponents);
      if (!normalizedPath) {
        return null;
      }

      var pathStr = normalizedPath.join('/');
      var loadedPath = loadAsFile(pathStr) || loadAsDirectory(pathStr) || null;
      return loadedPath;
    }

    return loadNodeModules(module.dirComponents, pathComponents);
  }

  this.require = function require(path) {
    var rootModule = new Module(['', '']);
    global.module = rootModule;
    return rootModule.require(path);
  };
}

module.exports = Loader;
