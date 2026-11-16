"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/ignore/index.js
var require_ignore = __commonJS({
  "node_modules/ignore/index.js"(exports, module2) {
    function makeArray(subject) {
      return Array.isArray(subject) ? subject : [subject];
    }
    var UNDEFINED = void 0;
    var EMPTY = "";
    var SPACE = " ";
    var ESCAPE = "\\";
    var REGEX_TEST_BLANK_LINE = /^\s+$/;
    var REGEX_INVALID_TRAILING_BACKSLASH = /(?:[^\\]|^)\\$/;
    var REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION = /^\\!/;
    var REGEX_REPLACE_LEADING_EXCAPED_HASH = /^\\#/;
    var REGEX_SPLITALL_CRLF = /\r?\n/g;
    var REGEX_TEST_INVALID_PATH = /^\.{0,2}\/|^\.{1,2}$/;
    var REGEX_TEST_TRAILING_SLASH = /\/$/;
    var SLASH = "/";
    var TMP_KEY_IGNORE = "node-ignore";
    if (typeof Symbol !== "undefined") {
      TMP_KEY_IGNORE = Symbol.for("node-ignore");
    }
    var KEY_IGNORE = TMP_KEY_IGNORE;
    var define = (object, key, value) => {
      Object.defineProperty(object, key, { value });
      return value;
    };
    var REGEX_REGEXP_RANGE = /([0-z])-([0-z])/g;
    var RETURN_FALSE = () => false;
    var sanitizeRange = (range) => range.replace(
      REGEX_REGEXP_RANGE,
      (match, from, to) => from.charCodeAt(0) <= to.charCodeAt(0) ? match : EMPTY
    );
    var negateRange = (range) => range.startsWith("!") || range.startsWith("\\^") ? `^${range.slice(range[0] === "!" ? 1 : 2)}` : range;
    var cleanRangeBackSlash = (slashes) => {
      const { length } = slashes;
      return slashes.slice(0, length - length % 2);
    };
    var REPLACERS = [
      [
        // Remove BOM
        // TODO:
        // Other similar zero-width characters?
        /^\uFEFF/,
        () => EMPTY
      ],
      // > Trailing spaces are ignored unless they are quoted with backslash ("\")
      [
        // (a\ ) -> (a )
        // (a  ) -> (a)
        // (a ) -> (a)
        // (a \ ) -> (a  )
        /((?:\\\\)*?)(\\?\s+)$/,
        (_, m1, m2) => m1 + (m2.indexOf("\\") === 0 ? SPACE : EMPTY)
      ],
      // Replace (\ ) with ' '
      // (\ ) -> ' '
      // (\\ ) -> '\\ '
      // (\\\ ) -> '\\ '
      [
        /(\\+?)\s/g,
        (_, m1) => {
          const { length } = m1;
          return m1.slice(0, length - length % 2) + SPACE;
        }
      ],
      // Escape metacharacters
      // which is written down by users but means special for regular expressions.
      // > There are 12 characters with special meanings:
      // > - the backslash \,
      // > - the caret ^,
      // > - the dollar sign $,
      // > - the period or dot .,
      // > - the vertical bar or pipe symbol |,
      // > - the question mark ?,
      // > - the asterisk or star *,
      // > - the plus sign +,
      // > - the opening parenthesis (,
      // > - the closing parenthesis ),
      // > - and the opening square bracket [,
      // > - the opening curly brace {,
      // > These special characters are often called "metacharacters".
      [
        /[\\$.|*+(){^]/g,
        (match) => `\\${match}`
      ],
      [
        // > a question mark (?) matches a single character
        /(?!\\)\?/g,
        () => "[^/]"
      ],
      // leading slash
      [
        // > A leading slash matches the beginning of the pathname.
        // > For example, "/*.c" matches "cat-file.c" but not "mozilla-sha1/sha1.c".
        // A leading slash matches the beginning of the pathname
        /^\//,
        () => "^"
      ],
      // replace special metacharacter slash after the leading slash
      [
        /\//g,
        () => "\\/"
      ],
      [
        // > A leading "**" followed by a slash means match in all directories.
        // > For example, "**/foo" matches file or directory "foo" anywhere,
        // > the same as pattern "foo".
        // > "**/foo/bar" matches file or directory "bar" anywhere that is directly
        // >   under directory "foo".
        // Notice that the '*'s have been replaced as '\\*'
        /^\^*(?:\\\*\\\*\\\/)+/,
        // '**/foo' <-> 'foo'
        () => "^(?:.*\\/)?"
      ],
      // starting
      [
        // there will be no leading '/'
        //   (which has been replaced by section "leading slash")
        // If starts with '**', adding a '^' to the regular expression also works
        /^(?=[^^])/,
        function startingReplacer() {
          return !/\/(?!$)/.test(this) ? "(?:^|\\/)" : "^";
        }
      ],
      // two globstars
      [
        // Use lookahead assertions so that we could match more than one `'/**'`
        /\\\/\\\*\\\*(?=\\\/|$)/g,
        // Zero, one or several directories
        // should not use '*', or it will be replaced by the next replacer
        // Check if it is not the last `'/**'`
        (_, index, str) => index + 6 < str.length ? "(?:\\/[^\\/]+)*" : "\\/.+"
      ],
      // normal intermediate wildcards
      [
        // Never replace escaped '*'
        // ignore rule '\*' will match the path '*'
        // 'abc.*/' -> go
        // 'abc.*'  -> skip this rule,
        //    coz trailing single wildcard will be handed by [trailing wildcard]
        /(^|[^\\]+)(\\\*)+(?=.+)/g,
        // '*.js' matches '.js'
        // '*.js' doesn't match 'abc'
        (_, p1, p2) => {
          const unescaped = p2.replace(/\\\*/g, "[^\\/]*");
          return p1 + unescaped;
        }
      ],
      [
        // unescape, revert step 3 except for back slash
        // For example, if a user escape a '\\*',
        // after step 3, the result will be '\\\\\\*'
        /\\\\\\(?=[$.|*+(){^])/g,
        () => ESCAPE
      ],
      [
        // '\\\\' -> '\\'
        /\\\\/g,
        () => ESCAPE
      ],
      [
        // > The range notation, e.g. [a-zA-Z],
        // > can be used to match one of the characters in a range.
        // `\` is escaped by step 3
        /(\\)?\[([^\]/]*?)(\\*)($|\])/g,
        (match, leadEscape, range, endEscape, close) => leadEscape === ESCAPE ? `\\[${range}${cleanRangeBackSlash(endEscape)}${close}` : close === "]" ? endEscape.length % 2 === 0 ? `[${negateRange(sanitizeRange(range))}${endEscape}]` : "[]" : "[]"
      ],
      // ending
      [
        // 'js' will not match 'js.'
        // 'ab' will not match 'abc'
        /(?:[^*])$/,
        // WTF!
        // https://git-scm.com/docs/gitignore
        // changes in [2.22.1](https://git-scm.com/docs/gitignore/2.22.1)
        // which re-fixes #24, #38
        // > If there is a separator at the end of the pattern then the pattern
        // > will only match directories, otherwise the pattern can match both
        // > files and directories.
        // 'js*' will not match 'a.js'
        // 'js/' will not match 'a.js'
        // 'js' will match 'a.js' and 'a.js/'
        (match) => /\/$/.test(match) ? `${match}$` : `${match}(?=$|\\/$)`
      ]
    ];
    var REGEX_REPLACE_TRAILING_WILDCARD = /(^|\\\/)?\\\*$/;
    var MODE_IGNORE = "regex";
    var MODE_CHECK_IGNORE = "checkRegex";
    var UNDERSCORE = "_";
    var TRAILING_WILD_CARD_REPLACERS = {
      [MODE_IGNORE](_, p1) {
        const prefix = p1 ? `${p1}[^/]+` : "[^/]*";
        return `${prefix}(?=$|\\/$)`;
      },
      [MODE_CHECK_IGNORE](_, p1) {
        const prefix = p1 ? `${p1}[^/]*` : "[^/]*";
        return `${prefix}(?=$|\\/$)`;
      }
    };
    var makeRegexPrefix = (pattern) => REPLACERS.reduce(
      (prev, [matcher, replacer]) => prev.replace(matcher, replacer.bind(pattern)),
      pattern
    );
    var isString = (subject) => typeof subject === "string";
    var checkPattern = (pattern) => pattern && isString(pattern) && !REGEX_TEST_BLANK_LINE.test(pattern) && !REGEX_INVALID_TRAILING_BACKSLASH.test(pattern) && pattern.indexOf("#") !== 0;
    var splitPattern = (pattern) => pattern.split(REGEX_SPLITALL_CRLF).filter(Boolean);
    var IgnoreRule = class {
      constructor(pattern, mark, body, ignoreCase, negative, prefix) {
        this.pattern = pattern;
        this.mark = mark;
        this.negative = negative;
        define(this, "body", body);
        define(this, "ignoreCase", ignoreCase);
        define(this, "regexPrefix", prefix);
      }
      get regex() {
        const key = UNDERSCORE + MODE_IGNORE;
        if (this[key]) {
          return this[key];
        }
        return this._make(MODE_IGNORE, key);
      }
      get checkRegex() {
        const key = UNDERSCORE + MODE_CHECK_IGNORE;
        if (this[key]) {
          return this[key];
        }
        return this._make(MODE_CHECK_IGNORE, key);
      }
      _make(mode, key) {
        const str = this.regexPrefix.replace(
          REGEX_REPLACE_TRAILING_WILDCARD,
          // It does not need to bind pattern
          TRAILING_WILD_CARD_REPLACERS[mode]
        );
        const regex = this.ignoreCase ? new RegExp(str, "i") : new RegExp(str);
        return define(this, key, regex);
      }
    };
    var createRule = ({
      pattern,
      mark
    }, ignoreCase) => {
      let negative = false;
      let body = pattern;
      if (body.indexOf("!") === 0) {
        negative = true;
        body = body.substr(1);
      }
      body = body.replace(REGEX_REPLACE_LEADING_EXCAPED_EXCLAMATION, "!").replace(REGEX_REPLACE_LEADING_EXCAPED_HASH, "#");
      const regexPrefix = makeRegexPrefix(body);
      return new IgnoreRule(
        pattern,
        mark,
        body,
        ignoreCase,
        negative,
        regexPrefix
      );
    };
    var RuleManager = class {
      constructor(ignoreCase) {
        this._ignoreCase = ignoreCase;
        this._rules = [];
      }
      _add(pattern) {
        if (pattern && pattern[KEY_IGNORE]) {
          this._rules = this._rules.concat(pattern._rules._rules);
          this._added = true;
          return;
        }
        if (isString(pattern)) {
          pattern = {
            pattern
          };
        }
        if (checkPattern(pattern.pattern)) {
          const rule = createRule(pattern, this._ignoreCase);
          this._added = true;
          this._rules.push(rule);
        }
      }
      // @param {Array<string> | string | Ignore} pattern
      add(pattern) {
        this._added = false;
        makeArray(
          isString(pattern) ? splitPattern(pattern) : pattern
        ).forEach(this._add, this);
        return this._added;
      }
      // Test one single path without recursively checking parent directories
      //
      // - checkUnignored `boolean` whether should check if the path is unignored,
      //   setting `checkUnignored` to `false` could reduce additional
      //   path matching.
      // - check `string` either `MODE_IGNORE` or `MODE_CHECK_IGNORE`
      // @returns {TestResult} true if a file is ignored
      test(path, checkUnignored, mode) {
        let ignored = false;
        let unignored = false;
        let matchedRule;
        this._rules.forEach((rule) => {
          const { negative } = rule;
          if (unignored === negative && ignored !== unignored || negative && !ignored && !unignored && !checkUnignored) {
            return;
          }
          const matched = rule[mode].test(path);
          if (!matched) {
            return;
          }
          ignored = !negative;
          unignored = negative;
          matchedRule = negative ? UNDEFINED : rule;
        });
        const ret = {
          ignored,
          unignored
        };
        if (matchedRule) {
          ret.rule = matchedRule;
        }
        return ret;
      }
    };
    var throwError = (message, Ctor) => {
      throw new Ctor(message);
    };
    var checkPath = (path, originalPath, doThrow) => {
      if (!isString(path)) {
        return doThrow(
          `path must be a string, but got \`${originalPath}\``,
          TypeError
        );
      }
      if (!path) {
        return doThrow(`path must not be empty`, TypeError);
      }
      if (checkPath.isNotRelative(path)) {
        const r = "`path.relative()`d";
        return doThrow(
          `path should be a ${r} string, but got "${originalPath}"`,
          RangeError
        );
      }
      return true;
    };
    var isNotRelative = (path) => REGEX_TEST_INVALID_PATH.test(path);
    checkPath.isNotRelative = isNotRelative;
    checkPath.convert = (p) => p;
    var Ignore = class {
      constructor({
        ignorecase = true,
        ignoreCase = ignorecase,
        allowRelativePaths = false
      } = {}) {
        define(this, KEY_IGNORE, true);
        this._rules = new RuleManager(ignoreCase);
        this._strictPathCheck = !allowRelativePaths;
        this._initCache();
      }
      _initCache() {
        this._ignoreCache = /* @__PURE__ */ Object.create(null);
        this._testCache = /* @__PURE__ */ Object.create(null);
      }
      add(pattern) {
        if (this._rules.add(pattern)) {
          this._initCache();
        }
        return this;
      }
      // legacy
      addPattern(pattern) {
        return this.add(pattern);
      }
      // @returns {TestResult}
      _test(originalPath, cache, checkUnignored, slices) {
        const path = originalPath && checkPath.convert(originalPath);
        checkPath(
          path,
          originalPath,
          this._strictPathCheck ? throwError : RETURN_FALSE
        );
        return this._t(path, cache, checkUnignored, slices);
      }
      checkIgnore(path) {
        if (!REGEX_TEST_TRAILING_SLASH.test(path)) {
          return this.test(path);
        }
        const slices = path.split(SLASH).filter(Boolean);
        slices.pop();
        if (slices.length) {
          const parent = this._t(
            slices.join(SLASH) + SLASH,
            this._testCache,
            true,
            slices
          );
          if (parent.ignored) {
            return parent;
          }
        }
        return this._rules.test(path, false, MODE_CHECK_IGNORE);
      }
      _t(path, cache, checkUnignored, slices) {
        if (path in cache) {
          return cache[path];
        }
        if (!slices) {
          slices = path.split(SLASH).filter(Boolean);
        }
        slices.pop();
        if (!slices.length) {
          return cache[path] = this._rules.test(path, checkUnignored, MODE_IGNORE);
        }
        const parent = this._t(
          slices.join(SLASH) + SLASH,
          cache,
          checkUnignored,
          slices
        );
        return cache[path] = parent.ignored ? parent : this._rules.test(path, checkUnignored, MODE_IGNORE);
      }
      ignores(path) {
        return this._test(path, this._ignoreCache, false).ignored;
      }
      createFilter() {
        return (path) => !this.ignores(path);
      }
      filter(paths) {
        return makeArray(paths).filter(this.createFilter());
      }
      // @returns {TestResult}
      test(path) {
        return this._test(path, this._testCache, true);
      }
    };
    var factory = (options) => new Ignore(options);
    var isPathValid = (path) => checkPath(path && checkPath.convert(path), path, RETURN_FALSE);
    var setupWindows = () => {
      const makePosix = (str) => /^\\\\\?\\/.test(str) || /["<>|\u0000-\u001F]+/u.test(str) ? str : str.replace(/\\/g, "/");
      checkPath.convert = makePosix;
      const REGEX_TEST_WINDOWS_PATH_ABSOLUTE = /^[a-z]:\//i;
      checkPath.isNotRelative = (path) => REGEX_TEST_WINDOWS_PATH_ABSOLUTE.test(path) || isNotRelative(path);
    };
    if (
      // Detect `process` so that it can run in browsers.
      typeof process !== "undefined" && process.platform === "win32"
    ) {
      setupWindows();
    }
    module2.exports = factory;
    factory.default = factory;
    module2.exports.isPathValid = isPathValid;
    define(module2.exports, Symbol.for("setupWindows"), setupWindows);
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => CloudSyncPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian12 = require("obsidian");

// src/utils/gitignore.ts
var import_ignore = __toESM(require_ignore());
var GITIGNORE_FILE = ".gitignore";
var MANAGED_START = "# >>> gitee-sync-plus managed exclusions >>>";
var MANAGED_END = "# <<< gitee-sync-plus managed exclusions <<<";
var DEFAULT_GITIGNORE = [
  "# Git internal version control data, must never be synced",
  ".git",
  "",
  "# Plugin diagnostic log",
  "_gitee-sync-plus-log.md",
  "",
  "# Obsidian trash directory",
  ".trash",
  "",
  "# Obsidian workspace layout files, stores panel and tab states. Do not sync across different devices",
  ".obsidian/workspace.json",
  ".obsidian/workspace-mobile.json",
  ".obsidian/plugins/gitee-sync-plus/data.json"
].join("\n");
var GitIgnoreManager = class {
  constructor(vault) {
    this.vault = vault;
    this.ig = (0, import_ignore.default)();
  }
  ig;
  loaded = false;
  /** Creates a default .gitignore only if the vault does not already have one. */
  async ensureExists() {
    const adapter = this.vault.adapter;
    if (!await adapter.exists(GITIGNORE_FILE)) {
      await adapter.write(GITIGNORE_FILE, DEFAULT_GITIGNORE);
    }
  }
  /** (Re)loads .gitignore from disk. Must be called before using isIgnored(). */
  async load() {
    const adapter = this.vault.adapter;
    this.ig = (0, import_ignore.default)();
    if (await adapter.exists(GITIGNORE_FILE)) {
      const content = await adapter.read(GITIGNORE_FILE);
      this.ig.add(content);
    }
    this.loaded = true;
  }
  /** Returns true if the given vault-relative path is ignored by .gitignore. */
  isIgnored(path) {
    if (!this.loaded) {
      return false;
    }
    return this.ig.ignores(path);
  }
  /** Reads the raw content of .gitignore from the vault root. */
  async readFullContent() {
    const adapter = this.vault.adapter;
    if (!await adapter.exists(GITIGNORE_FILE)) {
      return "";
    }
    return await adapter.read(GITIGNORE_FILE);
  }
  /** Overwrites .gitignore with the given raw content. */
  async writeFullContent(content) {
    const adapter = this.vault.adapter;
    await adapter.write(GITIGNORE_FILE, content);
  }
  /**
   * Reads the plugin-managed exclusion list from .gitignore and returns it as a
   * comma-separated string for the settings UI.
   */
  async readManagedFolders() {
    const adapter = this.vault.adapter;
    if (!await adapter.exists(GITIGNORE_FILE)) {
      return "";
    }
    const content = await adapter.read(GITIGNORE_FILE);
    const block = this.extractManagedBlock(content);
    return block.split("\n").map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("#")).map((line) => line.replace(/\/+$/, "")).join(", ");
  }
  /**
   * Writes the plugin-managed exclusion list back to .gitignore.
   * Existing user entries outside the managed block are preserved.
   */
  async writeManagedFolders(foldersText) {
    const adapter = this.vault.adapter;
    await this.ensureExists();
    let content = await adapter.exists(GITIGNORE_FILE) ? await adapter.read(GITIGNORE_FILE) : DEFAULT_GITIGNORE;
    const folders = foldersText.split(",").map((s) => s.trim()).filter((s) => s.length > 0).map((s) => s.replace(/\/+$/, ""));
    const managedBlock = [
      MANAGED_START,
      "# The following entries are managed by the Gitee Sync Plus plugin settings.",
      ...folders.map((f) => `${f}/`),
      MANAGED_END
    ].join("\n");
    const start = content.indexOf(MANAGED_START);
    const end = content.indexOf(MANAGED_END);
    if (start !== -1 && end !== -1 && end > start) {
      content = content.slice(0, start) + managedBlock + content.slice(end + MANAGED_END.length);
    } else {
      content = content.trimEnd() + "\n\n" + managedBlock + "\n";
    }
    await adapter.write(GITIGNORE_FILE, content);
  }
  extractManagedBlock(content) {
    const start = content.indexOf(MANAGED_START);
    const end = content.indexOf(MANAGED_END);
    if (start === -1 || end === -1 || end <= start) {
      return "";
    }
    return content.slice(start + MANAGED_START.length, end);
  }
};

// src/utils/i18n.ts
var import_obsidian = require("obsidian");
var en = {
  clickToSync: "Click to sync with the remote repository",
  ribbonSync: "Sync with remote repository",
  commandSyncNow: "Sync now",
  commandPreview: "Preview sync plan (no changes; writes to diagnostic note)",
  commandResetSyncState: "Reset sync state (current repository)",
  statusIdle: "Sync: idle",
  statusRunning: "Sync: in progress\u2026",
  statusComplete: (time) => `Sync: ${time} complete`,
  statusFailed: "Sync: failed",
  syncInProgress: "Sync is already in progress",
  syncFailed: (message) => `Sync failed: ${message}`,
  previewWhileSyncing: "Sync is in progress. Try the preview again later.",
  previewComplete: (pulled, pushed, deletedLocal, deletedRemote, file) => `Preview complete: download ${pulled}, upload ${pushed}, delete local ${deletedLocal}, delete remote ${deletedRemote} (see ${file})`,
  previewFailed: (message) => `Preview failed: ${message}`,
  previewFailedLog: (time, message) => `
## Sync preview failed ${time}
${message}
`,
  diagnosticLogTitle: "# Gitee Sync Plus diagnostic log\n",
  summaryUpload: (count) => `uploaded ${count}`,
  summaryDownload: (count) => `downloaded ${count}`,
  summaryDeleteRemote: (count) => `deleted remote ${count}`,
  summaryDeleteLocal: (count) => `deleted local ${count}`,
  summaryConflict: (count) => `conflicts resolved ${count}`,
  summaryComplete: (parts) => `Sync complete: ${parts}`,
  summaryNoChanges: "Sync complete: no changes",
  missingGithubSettings: "Enter the GitHub owner, repository, and access token in settings first.",
  missingGitlabSettings: "Enter the GitLab owner, repository, and access token in settings first.",
  missingGiteaSettings: "Enter the Gitea owner, repository, and access token in settings first.",
  gitlabForbiddenHint: "If the repository is not empty, the access token is missing the read_repository (or api) scope \u2014 GET /projects/:id only needs read_api.",
  gitlabTestScopeError: "Token can reach the project but cannot read the repository. Grant the api scope (or read_repository + write_repository) when creating the access token.",
  gitlabProtectedBranchHint: "The target branch is protected and this token's role cannot push to it. Re-create the access token with the Maintainer role, or in the project's Settings \u2192 Repository \u2192 Protected branches allow Developers to push.",
  gitlabWriteForbiddenHint: "The token cannot write to this repository. Use a role of at least Developer and make sure the token has the write_repository (or api) scope.",
  missingGiteeSettings: "Enter the Gitee owner, repository, and personal access token in settings first.",
  apiFailed: (host, method, status, detail) => `${host} API ${method} failed (${status}): ${detail}`,
  remoteTreeTruncated: "The remote file tree was truncated because it is too large. Sync was stopped to prevent accidental deletion.",
  deleteNeedsSha: (path) => `Deleting ${path} requires the remote SHA.`,
  commitAdd: (path) => `sync: add ${path}`,
  commitUpdate: (path) => `sync: update ${path}`,
  commitDelete: (path) => `sync: delete ${path}`,
  commitBatch: (uploaded, deleted) => `sync: batch \u2014 ${uploaded} updated${deleted ? `, ${deleted} deleted` : ""}`,
  batchCommitFailed: (uploaded, deleted, message) => `Batch commit failed (${uploaded} files to update, ${deleted} to delete): ${message}`,
  settingsBackend: "Storage backend",
  settingsBackendDesc: "After switching backends, the next sync performs a full reconciliation and keeps the newer modification.",
  optionGitee: "Gitee repository",
  optionGithub: "GitHub repository",
  optionGitlab: "GitLab repository",
  optionGitea: "Gitea repository",
  settingsGiteeOwner: "Gitee owner",
  settingsGithubOwner: "GitHub owner",
  settingsGitlabOwner: "GitLab owner",
  settingsGiteaOwner: "Gitea owner",
  settingsOwnerDesc: "User or organization that owns the repository, as shown in its URL.",
  settingsRepo: "Repository name",
  settingsRepoDesc: "A dedicated private repository is recommended.",
  settingsGitlabUrl: "GitLab instance URL",
  settingsGitlabUrlDesc: "Base URL of your GitLab instance. Use https://gitlab.com for the hosted service or your self-managed domain.",
  settingsGiteaUrl: "Gitea instance URL",
  settingsGiteaUrlDesc: "Base URL of your Gitea instance. Use https://gitea.com for the hosted service or your self-managed domain.",
  settingsBranch: "Branch",
  settingsBranchNeedInfo: "Fill in owner, repository, and token to auto-populate branches.",
  settingsBranchLoadFailed: "Failed to fetch branches. Check owner, repository, and token.",
  refreshBranches: "Refresh branches",
  settingsGiteeToken: "Personal access token",
  settingsGiteeTokenDesc: "Gitee Settings \u2192 Security Settings \u2192 Personal access tokens; enable the projects permission.",
  settingsGithubToken: "Access token",
  settingsGithubTokenDesc: "GitHub Settings \u2192 Developer settings \u2192 Personal access tokens; enable the repo permission.",
  settingsGitlabToken: "Access token",
  settingsGitlabTokenDesc: "GitLab Settings \u2192 Access Tokens. A token with repo read/write is required.",
  settingsGiteaToken: "Access token",
  settingsGiteaTokenDesc: "Gitea Settings \u2192 Applications \u2192 Generate Token (or your instance's access token page). A token with repo read/write is required.",
  tokenStoredInKeychain: "This token is automatically stored in your Obsidian keychain for security.",
  keychainMigrated: "Token moved to your Obsidian keychain for security.",
  keychainMigrateFailed: (msg) => `Keychain write failed: ${msg}`,
  settingsAutoSync: "Automatic sync interval (minutes)",
  settingsAutoSyncDesc: "Enter 0 to disable automatic sync.",
  settingsSyncOnStart: "Sync on startup",
  settingsSyncOnStartDesc: "Run one sync after Obsidian starts.",
  settingsExcludeFolders: "Excluded folders",
  settingsExcludeFoldersDesc: "Raw contents of .gitignore at the vault root. Edit the rules here; they take effect on the next sync. Changes are saved when the field loses focus.",
  settingsDebugLog: "Diagnostic log",
  settingsDebugLogDesc: "Record each sync plan and result in _gitee-sync-plus-log.md at the vault root. The log should be excluded from sync via .gitignore.",
  settingsCommitMode: "Commit mode",
  settingsCommitModeDesc: "Choose whether each file gets its own commit or all changes are combined into a single commit.",
  optionPerFile: "One commit per file",
  optionBatch: "One commit for all changes (batch)",
  settingsMergeStrategy: "Merge strategy",
  settingsMergeStrategyDesc: "How to resolve conflicts when the same file changed on both sides during sync (sidebar button, startup, or scheduled sync).",
  optionMergeMtime: "Latest change time",
  optionMergeRemote: "All remote",
  optionMergeLocal: "All local",
  settingsShowSyncRibbon: "Sync button",
  settingsShowSyncRibbonDesc: "When enabled, a sync button appears in the left sidebar ribbon for quick access.",
  settingsResetSyncState: "Reset sync state (current repository)",
  settingsResetSyncStateDesc: "Clears the recorded baseline for the currently configured repository only. The next sync will treat it as a fresh destination and upload all local files (full push). Other repositories' baselines are kept.",
  sectionDanger: "Danger zone",
  buttonReset: "Reset",
  resetConfirmTitle: "Reset sync state?",
  resetConfirmDesc: "This clears the current repository's baseline. The next sync will upload all local files as if starting fresh. Continue?",
  syncStateReset: "Sync state for the current repository has been reset. The next sync will do a full push.",
  settingsShowPanelRibbon: "Git panel button",
  settingsShowPanelRibbonDesc: "When enabled, a Git panel button appears in the left sidebar ribbon.",
  selectToken: "Select token",
  testToken: "Test",
  tokenSelectTitle: "Select token",
  tokenSearchPlaceholder: "Search keys...",
  tokenSelected: "Selected",
  tokenAdd: "Add key...",
  tokenSave: "Save",
  tokenCancel: "Cancel",
  tokenKeyId: "Key ID (lowercase letters, numbers, dashes)",
  tokenValue: "Token value",
  tokenConfirmAdd: "Add",
  tokenTestSuccess: "Token test succeeded.",
  tokenTestFailed: (message) => `Token test failed: ${message}`,
  tokenNoTokenSelected: "No token selected.",
  tokenDeleteConfirm: (name) => `Delete key "${name}" from the keychain?`,
  tokenDuplicateName: "A key with this ID already exists.",
  tokenNameRequired: "Please enter a key ID.",
  tokenValueRequired: "Please enter a token value.",
  tokenNoMatch: "No matching keys.",
  tokenEmpty: "No keys in the Obsidian keychain.",
  tokenSaveFailed: (message) => `Failed to save token: ${message}`,
  sectionRepo: "Repository settings",
  sectionAutoSync: "Sync settings",
  sectionAdvanced: "Advanced",
  previewTitle: "Sync preview (not executed)",
  executionTitle: "Sync execution",
  pathFailed: (path, message) => `Failed to process "${path}": ${message}`,
  pushPartiallyFailed: (pushed, deletedRemote, failures) => `Sync finished with ${failures.length} file(s) not transferred (uploaded ${pushed}, deleted remote ${deletedRemote}). They will be retried on the next sync:
` + failures.slice(0, 20).map((f) => `- ${f}`).join("\n") + (failures.length > 20 ? `
\u2026 and ${failures.length - 20} more` : ""),
  resultFailed: (message) => `Result: **Failed** \u2014 ${message}
`,
  completedCounts: (pulled, pushed, deletedLocal, deletedRemote) => `(Completed: downloaded ${pulled}, uploaded ${pushed}, deleted local ${deletedLocal}, deleted remote ${deletedRemote})
`,
  resultSuccess: (pulled, pushed, deletedLocal, deletedRemote, conflicts) => `Result: success \u2014 downloaded ${pulled}, uploaded ${pushed}, deleted local ${deletedLocal}, deleted remote ${deletedRemote}, conflicts ${conflicts}
`,
  reasonLocalAdded: "Added locally",
  reasonLocalModified: "Modified locally",
  reasonLocalDeleted: "Deleted locally",
  reasonRemoteAdded: "Added remotely",
  reasonRemoteModified: "Modified remotely",
  reasonRemoteDeleted: "Deleted remotely",
  reasonConflictLocalNewer: (local, remote) => `Conflict: local is newer (local ${local} \u2265 remote ${remote})`,
  reasonConflictRemoteNewer: (remote, local) => `Conflict: remote is newer (remote ${remote} > local ${local})`,
  reasonConflictKeepLocal: "Conflict: remote was deleted but local was modified; keep local",
  reasonConflictKeepRemote: "Conflict: local was deleted but remote was modified; keep remote",
  reasonConflictBothChanged: "Conflict: both sides changed since last sync",
  reasonConflictUseRemote: "Conflict: remote wins (merge strategy)",
  reasonConflictUseLocal: "Conflict: local wins (merge strategy)",
  reasonConflictDeleteLocalByRemote: "Conflict: remote deleted this file; delete local copy (merge strategy)",
  reasonConflictDeleteRemoteByLocal: "Conflict: local deleted this file; delete remote copy (merge strategy)",
  planBackend: (target) => `Backend: ${target}`,
  planCounts: (local, remote, base, unchanged, conflicts) => `Local ${local} | Remote ${remote} | **Baseline ${base}** | Unchanged ${unchanged} | Conflicts ${conflicts}`,
  planNoActions: "Plan: both sides already match; no action needed",
  planActions: (pulled, pushed, deletedLocal, deletedRemote) => `Plan: download ${pulled}, upload ${pushed}, delete local ${deletedLocal}, delete remote ${deletedRemote}`,
  actionDownload: "Download",
  actionDeleteLocal: "Delete local",
  actionUpload: "Upload",
  actionDeleteRemote: "Delete remote",
  unknown: "Unknown",
  panelTitle: "Git panel",
  panelRibbon: "Open Gitee Sync Plus Git panel",
  panelOpenCommand: "Open Git panel",
  panelMessagePlaceholder: "Commit message (applies to batch mode)\u2026",
  panelCommitHint: "In per-file mode each file keeps its own message; the text above applies to batch commits.",
  panelCommit: "Commit",
  panelPull: "Pull",
  panelRefresh: "Refresh",
  panelGroupLocal: "Local changes",
  panelGroupRemote: "Remote changes",
  panelGroupEmpty: "Nothing here",
  panelNoChanges: "No changes \u2014 everything is in sync",
  panelStatusComputing: "Computing\u2026",
  panelStatusWorking: "Working\u2026",
  panelStatusChanges: (n) => `${n} change(s)`,
  panelStatusCommitCount: (committed, pending) => `${committed} / ${pending}`,
  panelStatusError: (msg) => `Error: ${msg}`,
  panelDiscard: "Discard",
  panelDiscardAll: "Discard all",
  panelDiscardConfirmTitle: "Discard local changes?",
  panelDiscardConfirm: (path) => `Discarding changes to "${path}" will replace it with the remote version (or delete it if it only exists locally). This cannot be undone.`,
  panelDiscardAllConfirm: (n) => `Discard all ${n} local change(s)? Modified files are replaced by the remote version; new local files are deleted. This cannot be undone.`,
  panelDiscarded: (n) => `Discarded ${n} change(s)`,
  panelDiscardFailed: (msg) => `Discard failed: ${msg}`,
  panelClickToDiff: "Click to view diff",
  panelGroupStaged: "Staged changes",
  panelGroupUnstaged: "Changes",
  panelStage: "Stage this file",
  panelUnstage: "Unstage this file",
  panelStageAll: "Stage all",
  panelUnstageAll: "Unstage all",
  panelStageAllHint: "Stage all local changes",
  panelUnstageAllHint: "Unstage all changes",
  panelNothingStaged: "No staged changes to commit",
  panelViewDiff: "View diff",
  panelCollapseGroup: "Collapse",
  panelExpandGroup: "Expand",
  diffTitle: "Diff",
  diffTitleFor: (path) => `Diff: ${path}`,
  diffLoading: "Loading diff\u2026",
  diffError: (msg) => `Unable to show diff: ${msg}`,
  diffBinaryFile: "Binary file \u2014 diff not available",
  diffPluginNotReady: "Gitee Sync Plus is not loaded yet",
  diffLeftRemote: "Remote version",
  diffRightLocal: "Local version",
  diffLeftLocal: "Local version",
  diffRightRemote: "Remote version",
  diffLeftEmpty: "(empty)",
  diffRightEmpty: "(empty)",
  diffRevertChunk: "Abandon",
  diffRevertChunkConfirm: (path) => `Revert this change block in "${path}"? The local file will be rewritten.`,
  diffReverted: "Change block reverted",
  diffRevertFailed: (msg) => `Revert failed: ${msg}`,
  diffLayoutSideBySide: "Side-by-side",
  diffLayoutVertical: "Vertical",
  diffLayoutToggle: "Switch diff layout",
  diffCollapseUnchanged: "Collapse unchanged fragments",
  diffRollback: "Rollback this change",
  diffAcceptLocal: "Accept local",
  diffAcceptRemote: "Accept remote",
  diffIdenticalHint: "Local and remote contents are identical (only line endings or the sync state differ).",
  diffMarkSynced: "Mark as synced",
  diffShowAnyway: "Show diff anyway",
  diffMarkedAsSynced: (path) => `Marked "${path}" as synced`,
  diffMarkSyncedFailed: (msg) => `Could not mark as synced: ${msg}`,
  diffExpandUnchanged: "Expand unchanged fragments",
  diffUnchangedLines: (n) => `${n} unchanged lines`,
  diffLargeFileHint: (n) => `Large diff (${n} lines) \u2014 unchanged runs are collapsed; click a "\u22EF" row to expand.`,
  statusTagModified: "M",
  cancel: "Cancel",
  statusTagAdded: "U",
  statusTagDeleted: "D",
  statusTagRemote: "\u2193",
  statusTagConflict: "\u26A0",
  conflictDiffLayoutSide: "Side by side",
  conflictDiffLayoutUnified: "Unified",
  conflictDiffCollapse: "Collapse unchanged",
  conflictDiffExpand: "Expand unchanged",
  conflictTitle: "Resolve pull conflicts",
  conflictIntro: (n) => `${n} file(s) changed on both sides since the last sync. Resolve each conflict, then confirm the pull.`,
  conflictUseLocal: "Keep local",
  conflictUseRemote: "Use remote",
  conflictApplyMerge: "Apply merge",
  conflictMerge: "Merge\u2026",
  conflictViewDiff: "View diff",
  conflictResolvedLocal: "Kept local",
  conflictResolvedRemote: "Use remote",
  conflictResolvedMerge: "Merged",
  conflictResolvedPending: "Unresolved",
  conflictUseRemoteAll: "Use remote for all",
  conflictUseLocalAll: "Keep local for all",
  conflictConfirmPull: "Confirm pull",
  conflictCancelled: "Pull cancelled",
  conflictPending: (done, total) => `Resolved ${done} / ${total}`,
  mergeTitle: "Merge conflict",
  mergeBack: "Back",
  mergeLocalVersion: "Local version",
  mergeRemoteVersion: "Remote version",
  mergeBoth: "Keep both",
  mergeUseLocal: "Use local",
  mergeUseRemote: "Use remote",
  mergeResult: "Merged result (editable)",
  mergeSave: "Save merge result",
  mergeCancel: "Cancel",
  mergeHint: "Pick a side for each conflicting block, or keep both. The result below updates automatically and can be edited freely.",
  mergeChunk: (n) => `Block ${n}`
};
var zh = {
  clickToSync: "\u70B9\u51FB\u540C\u6B65\u5230\u8FDC\u7AEF\u4ED3\u5E93",
  ribbonSync: "\u540C\u6B65\u5230\u8FDC\u7AEF\u4ED3\u5E93",
  commandSyncNow: "\u7ACB\u5373\u540C\u6B65",
  commandPreview: "\u9884\u89C8\u540C\u6B65\u8BA1\u5212\uFF08\u4E0D\u6267\u884C\uFF0C\u7ED3\u679C\u5199\u5165\u65E5\u5FD7\u7B14\u8BB0\uFF09",
  commandResetSyncState: "\u91CD\u7F6E\u540C\u6B65\u72B6\u6001\uFF08\u5F53\u524D\u4ED3\u5E93\uFF09",
  statusIdle: "\u540C\u6B65\uFF1A\u7A7A\u95F2",
  statusRunning: "\u540C\u6B65\uFF1A\u8FDB\u884C\u4E2D\u2026",
  statusComplete: (time) => `\u540C\u6B65\uFF1A${time} \u5B8C\u6210`,
  statusFailed: "\u540C\u6B65\uFF1A\u5931\u8D25",
  syncInProgress: "\u540C\u6B65\u6B63\u5728\u8FDB\u884C\u4E2D",
  syncFailed: (message) => `\u540C\u6B65\u5931\u8D25\uFF1A${message}`,
  previewWhileSyncing: "\u540C\u6B65\u6B63\u5728\u8FDB\u884C\u4E2D\uFF0C\u8BF7\u7A0D\u540E\u518D\u9884\u89C8",
  previewComplete: (pulled, pushed, deletedLocal, deletedRemote, file) => `\u9884\u6F14\u5B8C\u6210\uFF1A\u4E0B\u8F7D ${pulled}\uFF0C\u4E0A\u4F20 ${pushed}\uFF0C\u5220\u9664\u672C\u5730 ${deletedLocal}\uFF0C\u5220\u9664\u8FDC\u7AEF ${deletedRemote}\uFF08\u8BE6\u89C1 ${file}\uFF09`,
  previewFailed: (message) => `\u9884\u6F14\u5931\u8D25\uFF1A${message}`,
  previewFailedLog: (time, message) => `
## \u540C\u6B65\u9884\u6F14\u5931\u8D25 ${time}
${message}
`,
  diagnosticLogTitle: "# Gitee Sync Plus \u8BCA\u65AD\u65E5\u5FD7\n",
  summaryUpload: (count) => `\u4E0A\u4F20 ${count}`,
  summaryDownload: (count) => `\u4E0B\u8F7D ${count}`,
  summaryDeleteRemote: (count) => `\u5220\u9664\u8FDC\u7AEF ${count}`,
  summaryDeleteLocal: (count) => `\u5220\u9664\u672C\u5730 ${count}`,
  summaryConflict: (count) => `\u51B2\u7A81\uFF08\u5DF2\u89E3\u51B3\uFF09${count}`,
  summaryComplete: (parts) => `\u540C\u6B65\u5B8C\u6210\uFF1A${parts}`,
  summaryNoChanges: "\u540C\u6B65\u5B8C\u6210\uFF1A\u65E0\u53D8\u5316",
  missingGithubSettings: "\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199 GitHub \u7528\u6237\u540D\u3001\u4ED3\u5E93\u540D\u548C\u8BBF\u95EE\u4EE4\u724C\u3002",
  missingGitlabSettings: "\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199 GitLab \u7528\u6237\u540D\u3001\u4ED3\u5E93\u540D\u548C\u8BBF\u95EE\u4EE4\u724C\u3002",
  missingGiteaSettings: "\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199 Gitea \u7528\u6237\u540D\u3001\u4ED3\u5E93\u540D\u548C\u8BBF\u95EE\u4EE4\u724C\u3002",
  gitlabForbiddenHint: "\u82E5\u4ED3\u5E93\u975E\u7A7A\uFF0C\u8BF4\u660E\u8BBF\u95EE\u4EE4\u724C\u7F3A\u5C11 read_repository\uFF08\u6216 api\uFF09\u6743\u9650\u2014\u2014GET /projects/:id \u4EC5\u9700 read_api\uFF0C\u56E0\u6B64\u8FDE\u63A5\u6D4B\u8BD5\u80FD\u901A\u8FC7\u800C\u540C\u6B65\u4F1A\u5931\u8D25\u3002",
  gitlabTestScopeError: "\u4EE4\u724C\u53EF\u8BBF\u95EE\u9879\u76EE\u4F46\u65E0\u6CD5\u8BFB\u53D6\u4ED3\u5E93\u5185\u5BB9\uFF0C\u8BF7\u5728\u521B\u5EFA\u8BBF\u95EE\u4EE4\u724C\u65F6\u52FE\u9009 api \u6743\u9650\uFF08\u6216 read_repository + write_repository\uFF09\u3002",
  gitlabProtectedBranchHint: "\u76EE\u6807\u5206\u652F\u53D7\u4FDD\u62A4\uFF0C\u5F53\u524D\u4EE4\u724C\u89D2\u8272\u65E0\u6743\u63A8\u9001\u3002\u8BF7\u7528 Maintainer \u89D2\u8272\u91CD\u65B0\u751F\u6210\u8BBF\u95EE\u4EE4\u724C\uFF0C\u6216\u5728\u9879\u76EE \u8BBE\u7F6E \u2192 \u4ED3\u5E93 \u2192 \u53D7\u4FDD\u62A4\u5206\u652F \u4E2D\u5141\u8BB8 Developers \u63A8\u9001\u3002",
  gitlabWriteForbiddenHint: "\u4EE4\u724C\u65E0\u6743\u5199\u5165\u8BE5\u4ED3\u5E93\u3002\u8BF7\u4F7F\u7528 Developer \u53CA\u4EE5\u4E0A\u89D2\u8272\uFF0C\u5E76\u786E\u4FDD\u4EE4\u724C\u5177\u5907 write_repository\uFF08\u6216 api\uFF09\u6743\u9650\u3002",
  missingGiteeSettings: "\u8BF7\u5148\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199 Gitee \u7528\u6237\u540D\u3001\u4ED3\u5E93\u540D\u548C\u79C1\u4EBA\u4EE4\u724C\u3002",
  apiFailed: (host, method, status, detail) => `${host} API ${method} \u5931\u8D25\uFF08${status}\uFF09\uFF1A${detail}`,
  remoteTreeTruncated: "\u8FDC\u7AEF\u8FD4\u56DE\u7684\u6587\u4EF6\u6811\u88AB\u622A\u65AD\uFF08\u6587\u4EF6\u6570\u8FC7\u591A\uFF09\uFF0C\u5DF2\u4E2D\u6B62\u540C\u6B65\u4EE5\u9632\u8BEF\u5220\u3002",
  deleteNeedsSha: (path) => `\u5220\u9664 ${path} \u9700\u8981\u8FDC\u7AEF SHA\u3002`,
  commitAdd: (path) => `\u540C\u6B65\uFF1A\u65B0\u589E ${path}`,
  commitUpdate: (path) => `\u540C\u6B65\uFF1A\u66F4\u65B0 ${path}`,
  commitDelete: (path) => `\u540C\u6B65\uFF1A\u5220\u9664 ${path}`,
  commitBatch: (uploaded, deleted) => `\u540C\u6B65\uFF1A\u6279\u91CF\u63A8\u9001 \u2014 ${uploaded} \u66F4\u65B0${deleted ? `\uFF0C${deleted} \u5220\u9664` : ""}`,
  batchCommitFailed: (uploaded, deleted, message) => `\u6279\u91CF\u63A8\u9001\u5931\u8D25\uFF08${uploaded} \u4E2A\u6587\u4EF6\u5F85\u66F4\u65B0\uFF0C${deleted} \u4E2A\u5F85\u5220\u9664\uFF09\uFF1A${message}`,
  settingsBackend: "\u5B58\u50A8\u540E\u7AEF",
  settingsBackendDesc: "\u5207\u6362\u540E\u7AEF\u540E\uFF0C\u9996\u6B21\u540C\u6B65\u4F1A\u5BF9\u4E24\u8FB9\u5DEE\u5F02\u505A\u4E00\u6B21\u5168\u91CF\u5BF9\u8D26\uFF0C\u5E76\u4FDD\u7559\u4FEE\u6539\u65F6\u95F4\u8F83\u65B0\u7684\u7248\u672C\u3002",
  optionGitee: "Gitee \u4ED3\u5E93",
  optionGithub: "GitHub \u4ED3\u5E93",
  optionGitlab: "GitLab \u4ED3\u5E93",
  optionGitea: "Gitea \u4ED3\u5E93",
  settingsGiteeOwner: "Gitee \u7528\u6237\u540D",
  settingsGithubOwner: "GitHub \u7528\u6237\u540D",
  settingsGitlabOwner: "GitLab \u7528\u6237\u540D",
  settingsGiteaOwner: "Gitea \u7528\u6237\u540D",
  settingsOwnerDesc: "\u4ED3\u5E93\u6240\u5C5E\u7684\u7528\u6237\u540D\u6216\u7EC4\u7EC7\u540D\uFF08\u5373\u4ED3\u5E93 URL \u4E2D\u7684 owner\uFF09\u3002",
  settingsRepo: "\u4ED3\u5E93\u540D",
  settingsRepoDesc: "\u5EFA\u8BAE\u4F7F\u7528\u4E00\u4E2A\u4E13\u95E8\u7684\u79C1\u6709\u4ED3\u5E93\u3002",
  settingsGitlabUrl: "GitLab \u5B9E\u4F8B\u5730\u5740",
  settingsGitlabUrlDesc: "\u4F60\u7684 GitLab \u5B9E\u4F8B\u57FA\u7840\u5730\u5740\u3002\u6258\u7BA1\u7248\u4F7F\u7528 https://gitlab.com\uFF0C\u81EA\u5EFA\u7248\u586B\u5199\u4F60\u7684\u57DF\u540D\u3002",
  settingsGiteaUrl: "Gitea \u5B9E\u4F8B\u5730\u5740",
  settingsGiteaUrlDesc: "\u4F60\u7684 Gitea \u5B9E\u4F8B\u57FA\u7840\u5730\u5740\u3002\u6258\u7BA1\u7248\u4F7F\u7528 https://gitea.com\uFF0C\u81EA\u5EFA\u7248\u586B\u5199\u4F60\u7684\u57DF\u540D\u3002",
  settingsBranch: "\u5206\u652F",
  settingsBranchNeedInfo: "\u586B\u5199\u7528\u6237\u540D\u3001\u4ED3\u5E93\u540D\u548C\u4EE4\u724C\u540E\u53EF\u81EA\u52A8\u83B7\u53D6\u5206\u652F\u5217\u8868\u3002",
  settingsBranchLoadFailed: "\u65E0\u6CD5\u83B7\u53D6\u5206\u652F\u5217\u8868\uFF0C\u8BF7\u68C0\u67E5\u7528\u6237\u540D\u3001\u4ED3\u5E93\u540D\u548C\u4EE4\u724C\u662F\u5426\u6B63\u786E\u3002",
  refreshBranches: "\u5237\u65B0\u5206\u652F",
  settingsGiteeToken: "\u79C1\u4EBA\u4EE4\u724C",
  settingsGiteeTokenDesc: "Gitee \u8BBE\u7F6E \u2192 \u5B89\u5168\u8BBE\u7F6E \u2192 \u79C1\u4EBA\u4EE4\u724C\uFF0C\u9700\u52FE\u9009 projects \u6743\u9650\u3002",
  settingsGithubToken: "\u8BBF\u95EE\u4EE4\u724C",
  settingsGithubTokenDesc: "GitHub \u8BBE\u7F6E \u2192 Developer settings \u2192 \u8BBF\u95EE\u4EE4\u724C\uFF0C\u9700\u52FE\u9009 repo \u6743\u9650\u3002",
  settingsGitlabToken: "\u8BBF\u95EE\u4EE4\u724C",
  settingsGitlabTokenDesc: "GitLab \u8BBE\u7F6E \u2192 \u8BBF\u95EE\u4EE4\u724C\u3002\u9700\u5177\u5907\u4ED3\u5E93\u8BFB\u5199\u6743\u9650\u3002",
  settingsGiteaToken: "\u8BBF\u95EE\u4EE4\u724C",
  settingsGiteaTokenDesc: "Gitea \u8BBE\u7F6E \u2192 \u5E94\u7528 \u2192 \u751F\u6210\u4EE4\u724C\uFF08\u6216\u5B9E\u4F8B\u7684\u8BBF\u95EE\u4EE4\u724C\u9875\u9762\uFF09\u3002\u9700\u5177\u5907\u4ED3\u5E93\u8BFB\u5199\u6743\u9650\u3002",
  tokenStoredInKeychain: "\u8BE5\u4EE4\u724C\u4F1A\u81EA\u52A8\u5B58\u5165\u4F60\u7684 Obsidian \u94A5\u5319\u4E32\uFF08\u8BBE\u7F6E \u2192 \u94A5\u5319\u4E32\uFF09\uFF0C\u6570\u636E\u6587\u4EF6\u4E2D\u4E0D\u518D\u4FDD\u7559\u660E\u6587\u3002",
  keychainMigrated: "\u4EE4\u724C\u5DF2\u8FC1\u79FB\u5230 Obsidian \u94A5\u5319\u4E32\u3002",
  keychainMigrateFailed: (msg) => `\u94A5\u5319\u4E32\u5199\u5165\u5931\u8D25\uFF1A${msg}`,
  settingsAutoSync: "\u81EA\u52A8\u540C\u6B65\u95F4\u9694\uFF08\u5206\u949F\uFF09",
  settingsAutoSyncDesc: "0 \u8868\u793A\u5173\u95ED\u81EA\u52A8\u540C\u6B65\u3002",
  settingsSyncOnStart: "\u542F\u52A8\u65F6\u540C\u6B65",
  settingsSyncOnStartDesc: "Obsidian \u6253\u5F00\u540E\u81EA\u52A8\u6267\u884C\u4E00\u6B21\u540C\u6B65\u3002",
  settingsExcludeFolders: "\u6392\u9664\u76EE\u5F55",
  settingsExcludeFoldersDesc: "vault \u6839\u76EE\u5F55 .gitignore \u7684\u5B8C\u6574\u5185\u5BB9\u3002\u5728\u8FD9\u91CC\u7F16\u8F91\u89C4\u5219\uFF0C\u4E0B\u6B21\u540C\u6B65\u65F6\u751F\u6548\u3002\u8F93\u5165\u6846\u5931\u53BB\u7126\u70B9\u65F6\u81EA\u52A8\u4FDD\u5B58\u3002",
  settingsDebugLog: "\u8C03\u8BD5\u65E5\u5FD7",
  settingsDebugLogDesc: "\u628A\u6BCF\u6B21\u540C\u6B65\u7684\u5B8C\u6574\u8BA1\u5212\u548C\u7ED3\u679C\u8BB0\u5F55\u5230 vault \u6839\u76EE\u5F55\u7684 _gitee-sync-plus-log.md\uFF08\u5EFA\u8BAE\u901A\u8FC7 .gitignore \u6392\u9664\u540C\u6B65\uFF09\u3002",
  settingsCommitMode: "\u63D0\u4EA4\u6A21\u5F0F",
  settingsCommitModeDesc: "\u9009\u62E9\u6BCF\u4E2A\u6587\u4EF6\u5355\u72EC\u63D0\u4EA4\u4E00\u6B21\uFF0C\u8FD8\u662F\u5C06\u6240\u6709\u53D8\u66F4\u5408\u5E76\u4E3A\u4E00\u6B21\u63D0\u4EA4\u3002",
  optionPerFile: "\u6587\u4EF6\u5355\u72EC\u63D0\u4EA4",
  optionBatch: "\u6587\u4EF6\u6279\u91CF\u63D0\u4EA4",
  settingsMergeStrategy: "\u5408\u5E76\u65B9\u5F0F",
  settingsMergeStrategyDesc: "\u540C\u6B65\u65F6\uFF08\u4FA7\u8FB9\u680F\u6309\u94AE\u3001\u542F\u52A8\u65F6\u6216\u5B9A\u65F6\u540C\u6B65\uFF09\u4E24\u7AEF\u90FD\u4FEE\u6539\u4E86\u540C\u4E00\u6587\u4EF6\u65F6\u7684\u51B2\u7A81\u89E3\u51B3\u65B9\u5F0F\u3002",
  optionMergeMtime: "\u6700\u65B0\u66F4\u6539\u65F6\u95F4",
  optionMergeRemote: "\u5168\u90E8\u4F7F\u7528\u8FDC\u7AEF",
  optionMergeLocal: "\u5168\u90E8\u4F7F\u7528\u672C\u5730",
  settingsShowSyncRibbon: "\u540C\u6B65\u6309\u94AE",
  settingsShowSyncRibbonDesc: "\u5F00\u542F\u540E\uFF0C\u5DE6\u4FA7\u8FB9\u680F\u5C06\u663E\u793A\u540C\u6B65\u6309\u94AE\uFF0C\u65B9\u4FBF\u5FEB\u901F\u89E6\u53D1\u540C\u6B65\u3002",
  settingsResetSyncState: "\u91CD\u7F6E\u540C\u6B65\u72B6\u6001\uFF08\u5F53\u524D\u4ED3\u5E93\uFF09",
  settingsResetSyncStateDesc: "\u4EC5\u6E05\u7A7A\u5F53\u524D\u5DF2\u914D\u7F6E\u4ED3\u5E93\u7684\u8BB0\u5F55\u57FA\u7EBF\u3002\u4E0B\u6B21\u540C\u6B65\u4F1A\u5C06\u5176\u89C6\u4E3A\u5168\u65B0\u76EE\u6807\u3001\u628A\u672C\u5730\u6587\u4EF6\u5168\u91CF\u4E0A\u4F20\u3002\u5176\u4ED6\u4ED3\u5E93\u7684\u57FA\u7EBF\u4FDD\u7559\u3002",
  sectionDanger: "\u5371\u9669\u64CD\u4F5C",
  buttonReset: "\u91CD\u7F6E",
  resetConfirmTitle: "\u91CD\u7F6E\u540C\u6B65\u72B6\u6001\uFF1F",
  resetConfirmDesc: "\u5C06\u6E05\u7A7A\u5F53\u524D\u4ED3\u5E93\u7684\u540C\u6B65\u57FA\u7EBF\uFF0C\u4E0B\u6B21\u540C\u6B65\u4F1A\u50CF\u521D\u6B21\u4E00\u6837\u5168\u91CF\u4E0A\u4F20\u672C\u5730\u6587\u4EF6\u3002\u786E\u5B9A\u7EE7\u7EED\uFF1F",
  syncStateReset: "\u5F53\u524D\u4ED3\u5E93\u7684\u540C\u6B65\u72B6\u6001\u5DF2\u91CD\u7F6E\uFF0C\u4E0B\u6B21\u540C\u6B65\u5C06\u6267\u884C\u5168\u91CF\u4E0A\u4F20\u3002",
  settingsShowPanelRibbon: "Git \u9762\u677F\u6309\u94AE",
  settingsShowPanelRibbonDesc: "\u5F00\u542F\u540E\uFF0C\u5DE6\u4FA7\u8FB9\u680F\u5C06\u663E\u793A Git \u9762\u677F\u6309\u94AE\uFF0C\u53EF\u5FEB\u901F\u6253\u5F00 Git \u9762\u677F\u3002",
  selectToken: "\u9009\u62E9\u79D8\u94A5",
  testToken: "\u6D4B\u8BD5",
  tokenSelectTitle: "\u9009\u62E9\u5BC6\u94A5",
  tokenSearchPlaceholder: "\u67E5\u627E\u5BC6\u94A5...",
  tokenSelected: "\u5DF2\u9009\u62E9",
  tokenAdd: "\u6DFB\u52A0\u5BC6\u94A5...",
  tokenSave: "\u4FDD\u5B58",
  tokenCancel: "\u53D6\u6D88",
  tokenKeyId: "\u5BC6\u94A5 ID\uFF08\u5C0F\u5199\u5B57\u6BCD\u3001\u6570\u5B57\u3001\u6A2A\u7EBF\uFF09",
  tokenValue: "\u4EE4\u724C\u503C",
  tokenConfirmAdd: "\u6DFB\u52A0",
  tokenTestSuccess: "\u4EE4\u724C\u6D4B\u8BD5\u6210\u529F\u3002",
  tokenTestFailed: (message) => `\u4EE4\u724C\u6D4B\u8BD5\u5931\u8D25\uFF1A${message}`,
  tokenNoTokenSelected: "\u672A\u9009\u62E9\u4EE4\u724C\u3002",
  tokenDeleteConfirm: (name) => `\u786E\u5B9A\u4ECE\u94A5\u5319\u4E32\u5220\u9664\u5BC6\u94A5 "${name}" \u5417\uFF1F`,
  tokenDuplicateName: "\u5DF2\u5B58\u5728\u76F8\u540C ID \u7684\u5BC6\u94A5\u3002",
  tokenNameRequired: "\u8BF7\u8F93\u5165\u5BC6\u94A5 ID\u3002",
  tokenValueRequired: "\u8BF7\u8F93\u5165\u4EE4\u724C\u503C\u3002",
  tokenNoMatch: "\u6CA1\u6709\u5339\u914D\u7684\u5BC6\u94A5\u3002",
  tokenEmpty: "Obsidian \u94A5\u5319\u4E32\u4E2D\u6682\u65E0\u5BC6\u94A5\u3002",
  tokenSaveFailed: (message) => `\u4FDD\u5B58\u4EE4\u724C\u5931\u8D25\uFF1A${message}`,
  sectionRepo: "\u4ED3\u5E93\u8BBE\u7F6E",
  sectionAutoSync: "\u540C\u6B65\u8BBE\u7F6E",
  sectionAdvanced: "\u9AD8\u7EA7\u8BBE\u7F6E",
  previewTitle: "\u540C\u6B65\u9884\u6F14\uFF08\u672A\u6267\u884C\uFF09",
  executionTitle: "\u540C\u6B65\u6267\u884C",
  pathFailed: (path, message) => `\u5904\u7406\u201C${path}\u201D\u5931\u8D25\uFF1A${message}`,
  pushPartiallyFailed: (pushed, deletedRemote, failures) => `\u540C\u6B65\u5B8C\u6210\uFF0C\u4F46\u6709 ${failures.length} \u4E2A\u6587\u4EF6\u672A\u80FD\u4F20\u8F93\uFF08\u5DF2\u4E0A\u4F20 ${pushed}\uFF0C\u5DF2\u5220\u9664\u8FDC\u7AEF ${deletedRemote}\uFF09\u3002\u8FD9\u4E9B\u6587\u4EF6\u5C06\u5728\u4E0B\u6B21\u540C\u6B65\u65F6\u81EA\u52A8\u91CD\u8BD5\uFF1A
` + failures.slice(0, 20).map((f) => `- ${f}`).join("\n") + (failures.length > 20 ? `
\u2026 \u4EE5\u53CA\u53E6\u5916 ${failures.length - 20} \u4E2A` : ""),
  resultFailed: (message) => `\u7ED3\u679C\uFF1A**\u5931\u8D25** \u2014 ${message}
`,
  completedCounts: (pulled, pushed, deletedLocal, deletedRemote) => `\uFF08\u5DF2\u5B8C\u6210\uFF1A\u4E0B\u8F7D ${pulled}\uFF0C\u4E0A\u4F20 ${pushed}\uFF0C\u5220\u9664\u672C\u5730 ${deletedLocal}\uFF0C\u5220\u9664\u8FDC\u7AEF ${deletedRemote}\uFF09
`,
  resultSuccess: (pulled, pushed, deletedLocal, deletedRemote, conflicts) => `\u7ED3\u679C\uFF1A\u6210\u529F \u2014 \u4E0B\u8F7D ${pulled}\uFF0C\u4E0A\u4F20 ${pushed}\uFF0C\u5220\u9664\u672C\u5730 ${deletedLocal}\uFF0C\u5220\u9664\u8FDC\u7AEF ${deletedRemote}\uFF0C\u51B2\u7A81 ${conflicts}
`,
  reasonLocalAdded: "\u672C\u5730\u65B0\u589E",
  reasonLocalModified: "\u672C\u5730\u4FEE\u6539",
  reasonLocalDeleted: "\u672C\u5730\u5DF2\u5220\u9664",
  reasonRemoteAdded: "\u8FDC\u7AEF\u65B0\u589E",
  reasonRemoteModified: "\u8FDC\u7AEF\u4FEE\u6539",
  reasonRemoteDeleted: "\u8FDC\u7AEF\u5DF2\u5220\u9664",
  reasonConflictLocalNewer: (local, remote) => `\u51B2\u7A81\uFF1A\u672C\u5730\u8F83\u65B0\uFF08\u672C\u5730 ${local} \u2265 \u8FDC\u7AEF ${remote}\uFF09`,
  reasonConflictRemoteNewer: (remote, local) => `\u51B2\u7A81\uFF1A\u8FDC\u7AEF\u8F83\u65B0\uFF08\u8FDC\u7AEF ${remote} > \u672C\u5730 ${local}\uFF09`,
  reasonConflictKeepLocal: "\u51B2\u7A81\uFF1A\u8FDC\u7AEF\u5DF2\u5220\u4F46\u672C\u5730\u6709\u4FEE\u6539\uFF0C\u4FDD\u7559\u672C\u5730",
  reasonConflictKeepRemote: "\u51B2\u7A81\uFF1A\u672C\u5730\u5DF2\u5220\u4F46\u8FDC\u7AEF\u6709\u4FEE\u6539\uFF0C\u4FDD\u7559\u8FDC\u7AEF",
  reasonConflictBothChanged: "\u51B2\u7A81\uFF1A\u81EA\u4E0A\u6B21\u540C\u6B65\u4EE5\u6765\u4E24\u7AEF\u90FD\u5DF2\u4FEE\u6539",
  reasonConflictUseRemote: "\u51B2\u7A81\uFF1A\u6309\u5408\u5E76\u65B9\u5F0F\u4F7F\u7528\u8FDC\u7AEF",
  reasonConflictUseLocal: "\u51B2\u7A81\uFF1A\u6309\u5408\u5E76\u65B9\u5F0F\u4FDD\u7559\u672C\u5730",
  reasonConflictDeleteLocalByRemote: "\u51B2\u7A81\uFF1A\u8FDC\u7AEF\u5DF2\u5220\u9664\uFF0C\u6309\u5408\u5E76\u65B9\u5F0F\u5220\u9664\u672C\u5730",
  reasonConflictDeleteRemoteByLocal: "\u51B2\u7A81\uFF1A\u672C\u5730\u5DF2\u5220\u9664\uFF0C\u6309\u5408\u5E76\u65B9\u5F0F\u5220\u9664\u8FDC\u7AEF",
  planBackend: (target) => `\u540E\u7AEF\uFF1A${target}`,
  planCounts: (local, remote, base, unchanged, conflicts) => `\u672C\u5730 ${local} | \u8FDC\u7AEF ${remote} | **\u57FA\u7EBF ${base}** | \u4E00\u81F4\u8DF3\u8FC7 ${unchanged} | \u51B2\u7A81 ${conflicts}`,
  planNoActions: "\u8BA1\u5212\uFF1A\u4E24\u7AEF\u5DF2\u4E00\u81F4\uFF0C\u65E0\u9700\u4EFB\u4F55\u52A8\u4F5C",
  planActions: (pulled, pushed, deletedLocal, deletedRemote) => `\u8BA1\u5212\uFF1A\u4E0B\u8F7D ${pulled}\uFF0C\u4E0A\u4F20 ${pushed}\uFF0C\u5220\u9664\u672C\u5730 ${deletedLocal}\uFF0C\u5220\u9664\u8FDC\u7AEF ${deletedRemote}`,
  actionDownload: "\u4E0B\u8F7D",
  actionDeleteLocal: "\u5220\u9664\u672C\u5730",
  actionUpload: "\u4E0A\u4F20",
  actionDeleteRemote: "\u5220\u9664\u8FDC\u7AEF",
  unknown: "\u672A\u77E5",
  panelTitle: "Git \u9762\u677F",
  panelRibbon: "\u6253\u5F00 Gitee Sync Plus Git \u9762\u677F",
  panelOpenCommand: "\u6253\u5F00 Git \u9762\u677F",
  panelMessagePlaceholder: "\u63A8\u9001\u8BF4\u660E\uFF08\u6279\u91CF\u6A21\u5F0F\u4E0B\u751F\u6548\uFF09\u2026",
  panelCommitHint: "\u6BCF\u6587\u4EF6\u6A21\u5F0F\u4E0B\u6BCF\u4E2A\u6587\u4EF6\u4FDD\u7559\u5404\u81EA\u8BF4\u660E\uFF1B\u4E0A\u65B9\u6587\u672C\u4EC5\u5BF9\u6279\u91CF\u63A8\u9001\u751F\u6548\u3002",
  panelCommit: "\u63A8\u9001",
  panelPull: "\u62C9\u53D6",
  panelRefresh: "\u5237\u65B0",
  panelGroupLocal: "\u672C\u5730\u66F4\u6539",
  panelGroupRemote: "\u8FDC\u7AEF\u66F4\u6539",
  panelGroupEmpty: "\u65E0",
  panelNoChanges: "\u65E0\u66F4\u6539 \u2014\u2014 \u5DF2\u5B8C\u5168\u540C\u6B65",
  panelStatusComputing: "\u8BA1\u7B97\u4E2D\u2026",
  panelStatusWorking: "\u5904\u7406\u4E2D\u2026",
  panelStatusChanges: (n) => `\u5171 ${n} \u5904\u6539\u52A8`,
  panelStatusCommitCount: (committed, pending) => `${committed} / ${pending}`,
  panelStatusError: (msg) => `\u9519\u8BEF\uFF1A${msg}`,
  panelDiscard: "\u653E\u5F03",
  panelDiscardAll: "\u653E\u5F03\u5168\u90E8",
  panelDiscardConfirmTitle: "\u653E\u5F03\u672C\u5730\u66F4\u6539\uFF1F",
  panelDiscardConfirm: (path) => `\u653E\u5F03\u201C${path}\u201D\u7684\u66F4\u6539\u540E\uFF0C\u5C06\u7528\u8FDC\u7AEF\u7248\u672C\u8986\u76D6\u672C\u5730\uFF08\u82E5\u4EC5\u672C\u5730\u65B0\u589E\u5219\u5220\u9664\u672C\u5730\u6587\u4EF6\uFF09\uFF0C\u4E14\u4E0D\u53EF\u6062\u590D\u3002`,
  panelDiscardAllConfirm: (n) => `\u653E\u5F03\u5168\u90E8 ${n} \u5904\u672C\u5730\u66F4\u6539\uFF1F\u672C\u5730\u4FEE\u6539\u5C06\u88AB\u8FDC\u7AEF\u7248\u672C\u8986\u76D6\uFF0C\u672C\u5730\u65B0\u589E\u6587\u4EF6\u5C06\u88AB\u5220\u9664\uFF0C\u4E14\u4E0D\u53EF\u6062\u590D\u3002`,
  panelDiscarded: (n) => `\u5DF2\u653E\u5F03 ${n} \u5904\u66F4\u6539`,
  panelDiscardFailed: (msg) => `\u653E\u5F03\u5931\u8D25\uFF1A${msg}`,
  panelClickToDiff: "\u70B9\u51FB\u67E5\u770B\u5DEE\u5F02",
  panelGroupStaged: "\u6682\u5B58\u7684\u66F4\u6539",
  panelGroupUnstaged: "\u66F4\u6539",
  panelStage: "\u6682\u5B58\u6B64\u6587\u4EF6",
  panelUnstage: "\u53D6\u6D88\u6682\u5B58\u6B64\u6587\u4EF6",
  panelStageAll: "\u5168\u90E8\u6682\u5B58",
  panelUnstageAll: "\u5168\u90E8\u53D6\u6D88\u6682\u5B58",
  panelStageAllHint: "\u6682\u5B58\u6240\u6709\u672C\u5730\u66F4\u6539",
  panelUnstageAllHint: "\u53D6\u6D88\u6682\u5B58\u6240\u6709\u66F4\u6539",
  panelNothingStaged: "\u6CA1\u6709\u5DF2\u6682\u5B58\u7684\u66F4\u6539\u53EF\u63A8\u9001",
  panelViewDiff: "\u67E5\u770B\u5DEE\u5F02",
  panelCollapseGroup: "\u6298\u53E0",
  panelExpandGroup: "\u5C55\u5F00",
  diffTitle: "\u5DEE\u5F02\u5BF9\u6BD4",
  diffTitleFor: (path) => `\u5DEE\u5F02\uFF1A${path}`,
  diffLoading: "\u6B63\u5728\u52A0\u8F7D\u5DEE\u5F02\u2026",
  diffError: (msg) => `\u65E0\u6CD5\u5C55\u793A\u5DEE\u5F02\uFF1A${msg}`,
  diffBinaryFile: "\u4E8C\u8FDB\u5236\u6587\u4EF6\uFF0C\u6682\u4E0D\u652F\u6301\u5DEE\u5F02\u5BF9\u6BD4",
  diffPluginNotReady: "Gitee Sync Plus \u5C1A\u672A\u52A0\u8F7D",
  diffLeftRemote: "\u8FDC\u7AEF\u7248\u672C",
  diffRightLocal: "\u672C\u5730\u7248\u672C",
  diffLeftLocal: "\u672C\u5730\u7248\u672C",
  diffRightRemote: "\u8FDC\u7AEF\u7248\u672C",
  diffLeftEmpty: "\uFF08\u7A7A\uFF09",
  diffRightEmpty: "\uFF08\u7A7A\uFF09",
  diffRevertChunk: "\u653E\u5F03",
  diffRevertChunkConfirm: (path) => `\u786E\u5B9A\u8981\u8FD8\u539F\u201C${path}\u201D\u4E2D\u7684\u8FD9\u4E00\u5757\u66F4\u6539\u5417\uFF1F\u672C\u5730\u6587\u4EF6\u5C06\u88AB\u91CD\u5199\u3002`,
  diffReverted: "\u5DF2\u8FD8\u539F\u66F4\u6539\u5757",
  diffRevertFailed: (msg) => `\u8FD8\u539F\u5931\u8D25\uFF1A${msg}`,
  diffLayoutSideBySide: "\u6A2A\u5411\u5E76\u6392",
  diffLayoutVertical: "\u7EB5\u5411\u5806\u53E0",
  diffLayoutToggle: "\u5207\u6362\u5DEE\u5F02\u5E03\u5C40",
  diffCollapseUnchanged: "\u6536\u8D77\u672A\u66F4\u6539\u7684\u7247\u6BB5",
  diffRollback: "\u56DE\u6EDA\u6B64\u53D8\u66F4",
  diffAcceptLocal: "\u63A5\u53D7\u672C\u5730",
  diffAcceptRemote: "\u63A5\u53D7\u8FDC\u7AEF",
  diffIdenticalHint: "\u672C\u5730\u4E0E\u8FDC\u7AEF\u5185\u5BB9\u5B8C\u5168\u4E00\u81F4\uFF08\u4EC5\u6362\u884C\u7B26\u6216\u540C\u6B65\u72B6\u6001\u4E0D\u540C\uFF09\u3002",
  diffMarkSynced: "\u6807\u8BB0\u4E3A\u5DF2\u540C\u6B65",
  diffShowAnyway: "\u4ECD\u8981\u663E\u793A\u5DEE\u5F02",
  diffMarkedAsSynced: (path) => `\u5DF2\u5C06\u201C${path}\u201D\u6807\u8BB0\u4E3A\u5DF2\u540C\u6B65`,
  diffMarkSyncedFailed: (msg) => `\u65E0\u6CD5\u6807\u8BB0\u4E3A\u5DF2\u540C\u6B65\uFF1A${msg}`,
  diffExpandUnchanged: "\u5C55\u5F00\u672A\u66F4\u6539\u7684\u7247\u6BB5",
  diffUnchangedLines: (n) => `${n} \u884C\u672A\u66F4\u6539`,
  diffLargeFileHint: (n) => `\u5DEE\u5F02\u8F83\u5927\uFF08\u5171 ${n} \u884C\uFF09\u2014\u2014\u672A\u66F4\u6539\u7684\u7247\u6BB5\u5DF2\u6298\u53E0\uFF0C\u70B9\u51FB\u300C\u22EF\u300D\u884C\u53EF\u5C55\u5F00\u67E5\u770B\u3002`,
  statusTagModified: "M",
  cancel: "\u53D6\u6D88",
  statusTagAdded: "U",
  statusTagDeleted: "D",
  statusTagRemote: "\u2193",
  statusTagConflict: "\u26A0",
  conflictDiffLayoutSide: "\u5E76\u6392",
  conflictDiffLayoutUnified: "\u7EDF\u4E00",
  conflictDiffCollapse: "\u6536\u8D77\u672A\u66F4\u6539",
  conflictDiffExpand: "\u5C55\u5F00\u672A\u66F4\u6539",
  conflictTitle: "\u89E3\u51B3\u62C9\u53D6\u51B2\u7A81",
  conflictIntro: (n) => `\u81EA\u4E0A\u6B21\u540C\u6B65\u4EE5\u6765\uFF0C\u6709 ${n} \u4E2A\u6587\u4EF6\u5728\u4E24\u7AEF\u90FD\u88AB\u4FEE\u6539\u3002\u8BF7\u9010\u4E00\u89E3\u51B3\u51B2\u7A81\u540E\u518D\u786E\u8BA4\u62C9\u53D6\u3002`,
  conflictUseLocal: "\u4FDD\u7559\u672C\u5730",
  conflictUseRemote: "\u4F7F\u7528\u8FDC\u7AEF",
  conflictApplyMerge: "\u5E94\u7528\u5408\u5E76",
  conflictMerge: "\u5408\u5E76\u2026",
  conflictViewDiff: "\u67E5\u770B\u5DEE\u5F02",
  conflictResolvedLocal: "\u5DF2\u4FDD\u7559\u672C\u5730",
  conflictResolvedRemote: "\u5DF2\u4F7F\u7528\u8FDC\u7AEF",
  conflictResolvedMerge: "\u5DF2\u5408\u5E76",
  conflictResolvedPending: "\u672A\u89E3\u51B3",
  conflictUseRemoteAll: "\u5168\u90E8\u4F7F\u7528\u8FDC\u7AEF",
  conflictUseLocalAll: "\u5168\u90E8\u4FDD\u7559\u672C\u5730",
  conflictConfirmPull: "\u786E\u8BA4\u62C9\u53D6",
  conflictCancelled: "\u5DF2\u53D6\u6D88\u62C9\u53D6",
  conflictPending: (done, total) => `\u5DF2\u89E3\u51B3 ${done} / ${total}`,
  mergeTitle: "\u5408\u5E76\u51B2\u7A81",
  mergeBack: "\u8FD4\u56DE",
  mergeLocalVersion: "\u672C\u5730\u7248\u672C",
  mergeRemoteVersion: "\u8FDC\u7AEF\u7248\u672C",
  mergeBoth: "\u4E24\u8005\u90FD\u4FDD\u7559",
  mergeUseLocal: "\u91C7\u7528\u672C\u5730",
  mergeUseRemote: "\u91C7\u7528\u8FDC\u7AEF",
  mergeResult: "\u5408\u5E76\u7ED3\u679C\uFF08\u53EF\u7F16\u8F91\uFF09",
  mergeSave: "\u4FDD\u5B58\u5408\u5E76\u7ED3\u679C",
  mergeCancel: "\u53D6\u6D88",
  mergeHint: "\u4E3A\u6BCF\u4E2A\u51B2\u7A81\u533A\u5757\u9009\u62E9\u4E00\u4FA7\uFF0C\u6216\u4E24\u8005\u90FD\u4FDD\u7559\u3002\u4E0B\u65B9\u7ED3\u679C\u4F1A\u81EA\u52A8\u66F4\u65B0\uFF0C\u4E5F\u53EF\u81EA\u7531\u7F16\u8F91\u3002",
  mergeChunk: (n) => `\u533A\u5757 ${n}`
};
function messages(language = (0, import_obsidian.getLanguage)()) {
  return language.toLowerCase().startsWith("zh") ? zh : en;
}
function formatDateTime(date = /* @__PURE__ */ new Date()) {
  return date.toLocaleString((0, import_obsidian.getLanguage)().toLowerCase().startsWith("zh") ? "zh-CN" : "en-US");
}
function formatTime(date = /* @__PURE__ */ new Date()) {
  return date.toLocaleTimeString((0, import_obsidian.getLanguage)().toLowerCase().startsWith("zh") ? "zh-CN" : "en-US");
}

// src/settings/settings-tab.ts
var import_obsidian11 = require("obsidian");

// src/backends/gitee.ts
var import_obsidian2 = require("obsidian");

// src/utils/git-hash.ts
function sha1(bytes) {
  const blockSize = 64;
  const msgLen = bytes.length;
  const totalLen = msgLen + 1 + 8 + blockSize - 1 & ~(blockSize - 1);
  const padded = new Uint8Array(totalLen);
  padded.set(bytes);
  padded[msgLen] = 128;
  const bitLen = msgLen * 8;
  const hi = Math.floor(bitLen / 4294967296);
  const lo = bitLen >>> 0;
  padded[totalLen - 8] = hi >>> 24 & 255;
  padded[totalLen - 7] = hi >>> 16 & 255;
  padded[totalLen - 6] = hi >>> 8 & 255;
  padded[totalLen - 5] = hi & 255;
  padded[totalLen - 4] = lo >>> 24 & 255;
  padded[totalLen - 3] = lo >>> 16 & 255;
  padded[totalLen - 2] = lo >>> 8 & 255;
  padded[totalLen - 1] = lo & 255;
  let h0 = 1732584193;
  let h1 = 4023233417;
  let h2 = 2562383102;
  let h3 = 271733878;
  let h4 = 3285377520;
  const w = new Uint32Array(80);
  for (let off = 0; off < totalLen; off += blockSize) {
    for (let i = 0; i < 16; i++) {
      const j = off + i * 4;
      w[i] = (padded[j] << 24 | padded[j + 1] << 16 | padded[j + 2] << 8 | padded[j + 3]) >>> 0;
    }
    for (let i = 16; i < 80; i++) {
      const n = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16];
      w[i] = (n << 1 | n >>> 31) >>> 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f;
      let k;
      if (i < 20) {
        f = b & c | ~b & d;
        k = 1518500249;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 1859775393;
      } else if (i < 60) {
        f = b & c | b & d | c & d;
        k = 2400959708;
      } else {
        f = b ^ c ^ d;
        k = 3395469782;
      }
      const temp = (a << 5 | a >>> 27) + f + e + k + w[i] >>> 0;
      e = d;
      d = c;
      c = (b << 30 | b >>> 2) >>> 0;
      b = a;
      a = temp;
    }
    h0 = h0 + a >>> 0;
    h1 = h1 + b >>> 0;
    h2 = h2 + c >>> 0;
    h3 = h3 + d >>> 0;
    h4 = h4 + e >>> 0;
  }
  const hex = (n) => (n >>> 0).toString(16).padStart(8, "0");
  return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4);
}
async function gitBlobSha1(data) {
  const header = new TextEncoder().encode(`blob ${data.byteLength}\0`);
  const buf = new Uint8Array(header.byteLength + data.byteLength);
  buf.set(header, 0);
  buf.set(new Uint8Array(data), header.byteLength);
  return sha1(buf);
}
function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

// src/backends/gitee.ts
var GITEE_BATCH_ACTION_LIMIT = 100;
var GiteeBackend = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  /** Bumped from "git-blob-sha1" to invalidate stale caches after adding LF normalization. */
  id = "git-blob-sha1-lf";
  get repoBase() {
    const owner = encodeURIComponent(this.cfg.owner);
    const repo = encodeURIComponent(this.cfg.repo);
    return `https://gitee.com/api/v5/repos/${owner}/${repo}`;
  }
  withAuth(url) {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}access_token=${encodeURIComponent(this.cfg.token)}`;
  }
  async request(method, url, body) {
    const payload = body ? { access_token: this.cfg.token, ...body } : void 0;
    const resp = await (0, import_obsidian2.requestUrl)({
      url: this.withAuth(url),
      method,
      throw: false,
      headers: {},
      contentType: payload ? "application/json" : void 0,
      body: payload ? JSON.stringify(payload) : void 0
    });
    if (resp.status >= 400) {
      const l = messages();
      let detail = "";
      try {
        detail = resp.json.message ?? "";
      } catch {
        detail = resp.text.slice(0, 200);
      }
      throw new GiteeError(resp.status, l.apiFailed("gitee", method, resp.status, detail));
    }
    return resp;
  }
  async manifest() {
    let resp;
    try {
      resp = await this.request(
        "GET",
        `${this.repoBase}/git/trees/${encodeURIComponent(this.cfg.branch)}?recursive=1`
      );
    } catch (e) {
      if (e instanceof GiteeError && (e.status === 404 || e.status === 409)) return [];
      throw e;
    }
    const body = resp.json;
    if (body.truncated) {
      throw new Error(messages().remoteTreeTruncated);
    }
    return body.tree.filter((t) => t.type === "blob").map((t) => ({ path: t.path, hash: t.sha, mtime: 0, size: t.size ?? 0 }));
  }
  async download(path) {
    const resp = await this.request(
      "GET",
      `${this.repoBase}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.cfg.branch)}`
    );
    const file = resp.json;
    let base64 = (file.content ?? "").replace(/\s/g, "");
    if (!base64 && file.sha) {
      const blob = await this.request("GET", `${this.repoBase}/git/blobs/${file.sha}`);
      base64 = (blob.json.content ?? "").replace(/\s/g, "");
    }
    return { data: (0, import_obsidian2.base64ToArrayBuffer)(base64), hash: file.sha, mtime: 0 };
  }
  async upload(path, data, opts) {
    const url = `${this.repoBase}/contents/${encodePath(path)}`;
    const fallbackMessage = opts.remoteHash ? messages().commitUpdate(path) : messages().commitAdd(path);
    const body = {
      content: (0, import_obsidian2.arrayBufferToBase64)(data),
      message: opts.message && opts.message.trim() ? opts.message.trim() : fallbackMessage,
      branch: this.cfg.branch
    };
    if (opts.remoteHash) body.sha = opts.remoteHash;
    const method = opts.remoteHash ? "PUT" : "POST";
    try {
      await this.request(method, url, body);
    } catch (e) {
      if (!opts.remoteHash && this.isCreateConflict(e)) {
        const existingSha = await this.fileSha(path);
        if (existingSha === opts.hash) return;
        if (existingSha) {
          await this.request("PUT", url, { ...body, sha: existingSha });
          return;
        }
      }
      throw e;
    }
  }
  /** Returns the current blob SHA of a remote file, or null if it does not exist. */
  async fileSha(path) {
    try {
      const resp = await this.request(
        "GET",
        `${this.repoBase}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.cfg.branch)}`
      );
      return resp.json.sha ?? null;
    } catch (e) {
      if (e instanceof GiteeError && (e.status === 404 || e.status === 409)) return null;
      throw e;
    }
  }
  /** True when a create (POST) failed because the target already exists on the host. */
  isCreateConflict(e) {
    if (!(e instanceof GiteeError)) return false;
    if (/exist|已存在|duplicate|conflict|冲突/i.test(e.message)) return true;
    return e.status === 409;
  }
  /** True for gateway/proxy errors where retrying with smaller requests may help. */
  isGatewayError(e) {
    return e instanceof GiteeError && (e.status === 502 || e.status === 503 || e.status === 504);
  }
  /**
   * True when Gitee's batch /commits endpoint returns a 400 because a single
   * "create" action could not be applied (e.g. "文件新建失败"). The whole chunk
   * is rejected, but replaying the same change per-file either resolves the
   * conflict idempotently (file already exists with identical content) or
   * surfaces the exact offending path instead of failing thousands of files.
   */
  isGiteeBatchCreateFailure(e) {
    return e instanceof GiteeError && e.status === 400 && /文件新建失败|新建失败/.test(e.message);
  }
  async remove(path, remoteHash) {
    if (!remoteHash) throw new Error(messages().deleteNeedsSha(path));
    const url = `${this.repoBase}/contents/${encodePath(path)}`;
    const message = messages().commitDelete(path);
    await this.request(
      "DELETE",
      `${url}?sha=${encodeURIComponent(remoteHash)}&message=${encodeURIComponent(message)}&branch=${encodeURIComponent(this.cfg.branch)}`
    );
  }
  async batchCommit(files, deletes, message) {
    if (files.length === 0 && deletes.length === 0) return;
    const l = messages();
    const commitMessage = message && message.trim() ? message.trim() : l.commitBatch(files.length, deletes.length);
    const changes = [...files, ...deletes];
    const chunks = this.chunkArray(changes, GITEE_BATCH_ACTION_LIMIT);
    for (const chunk of chunks) {
      const chunkFiles = chunk.filter((c) => "data" in c);
      const chunkDeletes = chunk.filter((c) => !("data" in c));
      await this.batchCommitGiteeChunk(chunkFiles, chunkDeletes, commitMessage);
    }
  }
  async batchCommitGiteeChunk(files, deletes, commitMessage) {
    const actions = [];
    for (const f of files) {
      actions.push({
        action: f.remoteHash ? "update" : "create",
        path: f.path,
        content: (0, import_obsidian2.arrayBufferToBase64)(f.data),
        encoding: "base64"
      });
    }
    for (const d of deletes) {
      actions.push({ action: "delete", path: d.path });
    }
    if (actions.length === 0) return;
    try {
      await this.request("POST", `${this.repoBase}/commits`, {
        branch: this.cfg.branch,
        message: commitMessage,
        actions
      });
    } catch (e) {
      if (this.isCreateConflict(e) || this.isGatewayError(e) || this.isGiteeBatchCreateFailure(e)) {
        await this.batchCommitFallback(files, deletes, commitMessage);
        return;
      }
      throw e;
    }
  }
  /**
   * Gitee batch-commit fallback: replay each change as its own commit. Used
   * only after a batch fails on a create conflict. Reuses the per-file
   * upload/remove logic, which already resolves create conflicts idempotently.
   */
  async batchCommitFallback(files, deletes, message) {
    for (const f of files) {
      await this.upload(f.path, f.data, {
        hash: await gitBlobSha1(f.data),
        mtime: 0,
        remoteHash: f.remoteHash,
        message
      });
    }
    for (const d of deletes) {
      await this.remove(d.path, d.remoteHash);
    }
  }
  chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }
  hashData(data) {
    return gitBlobSha1(data);
  }
  /** Last commit time touching the path — only queried on real conflicts. */
  async statMtime(path) {
    const resp = await this.request(
      "GET",
      `${this.repoBase}/commits?sha=${encodeURIComponent(this.cfg.branch)}&path=${encodePath(path)}&page=1&per_page=1`
    );
    const commits = resp.json;
    const date = commits[0]?.commit?.committer?.date;
    return date ? Date.parse(date) : 0;
  }
};
async function testGiteeToken(owner, repo, token) {
  await fetchGiteeBranches(owner, repo, token);
}
async function fetchGiteeBranches(owner, repo, token) {
  const ownerEnc = encodeURIComponent(owner);
  const repoEnc = encodeURIComponent(repo);
  const urlBase = `https://gitee.com/api/v5/repos/${ownerEnc}/${repoEnc}`;
  const sep = urlBase.includes("?") ? "&" : "?";
  const url = `${urlBase}/branches${sep}access_token=${encodeURIComponent(token)}`;
  const resp = await (0, import_obsidian2.requestUrl)({
    url,
    method: "GET",
    throw: false,
    headers: {}
  });
  if (resp.status >= 400) {
    const l = messages();
    let detail = "";
    try {
      detail = resp.json.message ?? "";
    } catch {
      detail = resp.text.slice(0, 200);
    }
    throw new GiteeError(resp.status, l.apiFailed("gitee", "GET", resp.status, detail));
  }
  const branches = resp.json;
  return branches.map((b) => b.name);
}
var GiteeError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};

// src/backends/github.ts
var import_obsidian3 = require("obsidian");
var GitHubBackend = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  /** Bumped from "git-blob-sha1" to invalidate stale caches after adding LF normalization. */
  id = "git-blob-sha1-lf";
  get repoBase() {
    const owner = encodeURIComponent(this.cfg.owner);
    const repo = encodeURIComponent(this.cfg.repo);
    return `https://api.github.com/repos/${owner}/${repo}`;
  }
  authHeaders() {
    return {
      Authorization: `Bearer ${this.cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    };
  }
  async request(method, url, body) {
    const resp = await (0, import_obsidian3.requestUrl)({
      url,
      method,
      throw: false,
      headers: this.authHeaders(),
      contentType: body ? "application/json" : void 0,
      body: body ? JSON.stringify(body) : void 0
    });
    if (resp.status >= 400) {
      const l = messages();
      let detail = "";
      try {
        detail = resp.json.message ?? "";
      } catch {
        detail = resp.text.slice(0, 200);
      }
      throw new GithubError(resp.status, l.apiFailed("github", method, resp.status, detail));
    }
    return resp;
  }
  async manifest() {
    let resp;
    try {
      resp = await this.request(
        "GET",
        `${this.repoBase}/git/trees/${encodeURIComponent(this.cfg.branch)}?recursive=1`
      );
    } catch (e) {
      if (e instanceof GithubError && (e.status === 404 || e.status === 409)) return [];
      throw e;
    }
    const body = resp.json;
    if (body.truncated) {
      throw new Error(messages().remoteTreeTruncated);
    }
    return body.tree.filter((t) => t.type === "blob").map((t) => ({ path: t.path, hash: t.sha, mtime: 0, size: t.size ?? 0 }));
  }
  async download(path) {
    const resp = await this.request(
      "GET",
      `${this.repoBase}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.cfg.branch)}`
    );
    const file = resp.json;
    let base64 = (file.content ?? "").replace(/\s/g, "");
    if (!base64 && file.sha) {
      const blob = await this.request("GET", `${this.repoBase}/git/blobs/${file.sha}`);
      base64 = (blob.json.content ?? "").replace(/\s/g, "");
    }
    return { data: (0, import_obsidian3.base64ToArrayBuffer)(base64), hash: file.sha, mtime: 0 };
  }
  async upload(path, data, opts) {
    const url = `${this.repoBase}/contents/${encodePath(path)}`;
    const fallbackMessage = opts.remoteHash ? messages().commitUpdate(path) : messages().commitAdd(path);
    const body = {
      content: (0, import_obsidian3.arrayBufferToBase64)(data),
      message: opts.message && opts.message.trim() ? opts.message.trim() : fallbackMessage,
      branch: this.cfg.branch
    };
    if (opts.remoteHash) body.sha = opts.remoteHash;
    try {
      await this.request("PUT", url, body);
    } catch (e) {
      if (!opts.remoteHash && this.isGithubStaleCreate(e)) {
        const existingSha = await this.fileSha(path);
        if (existingSha === opts.hash) return;
        if (existingSha) {
          await this.request("PUT", url, { ...body, sha: existingSha });
          return;
        }
      }
      throw e;
    }
  }
  /** Returns the current blob SHA of a remote file, or null if it does not exist. */
  async fileSha(path) {
    try {
      const resp = await this.request(
        "GET",
        `${this.repoBase}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.cfg.branch)}`
      );
      return resp.json.sha ?? null;
    } catch (e) {
      if (e instanceof GithubError && (e.status === 404 || e.status === 409)) return null;
      throw e;
    }
  }
  /** True when a GitHub PUT (no sha) failed because the file already exists remotely. */
  isGithubStaleCreate(e) {
    if (!(e instanceof GithubError)) return false;
    return e.status === 422 && /"sha".*suppl|already exist/i.test(e.message);
  }
  async remove(path, remoteHash) {
    if (!remoteHash) throw new Error(messages().deleteNeedsSha(path));
    const url = `${this.repoBase}/contents/${encodePath(path)}`;
    const message = messages().commitDelete(path);
    await this.request("DELETE", url, {
      message,
      sha: remoteHash,
      branch: this.cfg.branch
    });
  }
  async batchCommit(files, deletes, message) {
    if (files.length === 0 && deletes.length === 0) return;
    await this.batchCommitGithub(files, deletes, message);
  }
  /**
   * GitHub: uses the Git Database API to batch multiple file changes into one commit.
   * Flow: get ref → get tree → create blobs → create tree → create commit → update ref.
   * The ref update with force:false provides fast-forward protection against
   * concurrent remote changes.
   */
  async batchCommitGithub(files, deletes, message) {
    const l = messages();
    let parentSha;
    let baseTreeSha;
    try {
      const refResp = await this.request(
        "GET",
        `${this.repoBase}/git/refs/heads/${encodeURIComponent(this.cfg.branch)}`
      );
      parentSha = refResp.json.object.sha;
      const commitResp = await this.request("GET", `${this.repoBase}/git/commits/${parentSha}`);
      baseTreeSha = commitResp.json.tree.sha;
    } catch (e) {
      if (!(e instanceof GithubError) || e.status !== 404 && e.status !== 409) throw e;
    }
    const treeEntries = [];
    for (const f of files) {
      const blobResp = await this.request("POST", `${this.repoBase}/git/blobs`, {
        content: (0, import_obsidian3.arrayBufferToBase64)(f.data),
        encoding: "base64"
      });
      treeEntries.push({
        path: f.path,
        mode: "100644",
        type: "blob",
        sha: blobResp.json.sha
      });
    }
    for (const d of deletes) {
      treeEntries.push({
        path: d.path,
        mode: "100644",
        type: "blob",
        sha: null
      });
    }
    const treeBody = { tree: treeEntries };
    if (baseTreeSha) treeBody.base_tree = baseTreeSha;
    const treeResp = await this.request("POST", `${this.repoBase}/git/trees`, treeBody);
    const newTreeSha = treeResp.json.sha;
    const commitBody = {
      message: message && message.trim() ? message.trim() : l.commitBatch(files.length, deletes.length),
      tree: newTreeSha
    };
    if (parentSha) commitBody.parents = [parentSha];
    const newCommitResp = await this.request("POST", `${this.repoBase}/git/commits`, commitBody);
    const newCommitSha = newCommitResp.json.sha;
    if (parentSha) {
      await this.request(
        "PATCH",
        `${this.repoBase}/git/refs/heads/${encodeURIComponent(this.cfg.branch)}`,
        { sha: newCommitSha, force: false }
      );
    } else {
      await this.request("POST", `${this.repoBase}/git/refs`, {
        ref: `refs/heads/${this.cfg.branch}`,
        sha: newCommitSha
      });
    }
  }
  hashData(data) {
    return gitBlobSha1(data);
  }
  /** Last commit time touching the path — only queried on real conflicts. */
  async statMtime(path) {
    const resp = await this.request(
      "GET",
      `${this.repoBase}/commits?sha=${encodeURIComponent(this.cfg.branch)}&path=${encodePath(path)}&page=1&per_page=1`
    );
    const commits = resp.json;
    const date = commits[0]?.commit?.committer?.date;
    return date ? Date.parse(date) : 0;
  }
};
async function testGithubToken(owner, repo, token) {
  await fetchGithubBranches(owner, repo, token);
}
async function fetchGithubBranches(owner, repo, token) {
  const ownerEnc = encodeURIComponent(owner);
  const repoEnc = encodeURIComponent(repo);
  const urlBase = `https://api.github.com/repos/${ownerEnc}/${repoEnc}`;
  const url = `${urlBase}/branches?per_page=100`;
  const resp = await (0, import_obsidian3.requestUrl)({
    url,
    method: "GET",
    throw: false,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  });
  if (resp.status >= 400) {
    const l = messages();
    let detail = "";
    try {
      detail = resp.json.message ?? "";
    } catch {
      detail = resp.text.slice(0, 200);
    }
    throw new GithubError(resp.status, l.apiFailed("github", "GET", resp.status, detail));
  }
  const branches = resp.json;
  return branches.map((b) => b.name);
}
var GithubError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};

// src/backends/gitlab.ts
var import_obsidian4 = require("obsidian");
var DEFAULT_GITLAB_URL = "https://gitlab.com";
var GitLabBackend = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  /** Bumped from "git-blob-sha1" to invalidate stale caches after adding LF normalization. */
  id = "git-blob-sha1-lf";
  get baseUrl() {
    const url = (this.cfg.gitlabUrl || DEFAULT_GITLAB_URL).replace(/\/+$/, "");
    return `${url}/api/v4`;
  }
  get projectId() {
    return encodeURIComponent(`${this.cfg.owner}/${this.cfg.repo}`);
  }
  get projectBase() {
    return `${this.baseUrl}/projects/${this.projectId}`;
  }
  authHeaders() {
    return { "PRIVATE-TOKEN": this.cfg.token };
  }
  async request(method, url, body) {
    const resp = await (0, import_obsidian4.requestUrl)({
      url,
      method,
      throw: false,
      headers: this.authHeaders(),
      contentType: body ? "application/json" : void 0,
      body: body ? JSON.stringify(body) : void 0
    });
    if (resp.status >= 400) {
      const l = messages();
      let detail = "";
      try {
        detail = resp.json.message ?? "";
      } catch {
        detail = resp.text.slice(0, 200);
      }
      let message = l.apiFailed("gitlab", method, resp.status, detail);
      if (resp.status === 403) {
        const isWrite = method !== "GET" && method !== "HEAD";
        const protectedBranch = /not allowed to push/i.test(detail);
        if (protectedBranch) {
          message += " " + l.gitlabProtectedBranchHint;
        } else if (isWrite) {
          message += " " + l.gitlabWriteForbiddenHint;
        } else {
          message += " " + l.gitlabForbiddenHint;
        }
      }
      throw new GitLabError(resp.status, message);
    }
    return resp;
  }
  async manifest() {
    const entries = [];
    let page = 1;
    while (true) {
      let resp;
      try {
        resp = await this.request(
          "GET",
          `${this.projectBase}/repository/tree?recursive=true&per_page=100&page=${page}`
        );
      } catch (e) {
        if (e instanceof GitLabError && (e.status === 404 || e.status === 403 && page === 1)) {
          if (e.status === 403) {
            console.warn(
              "[gitee-sync-plus] GitLab repository/tree returned 403; treating the repository as empty. If the repository actually contains files, the access token is missing the read_repository (or api) scope."
            );
          }
          return entries;
        }
        throw e;
      }
      const items = resp.json;
      for (const item of items) {
        if (item.type === "blob") {
          entries.push({ path: item.path, hash: item.id, mtime: 0, size: 0 });
        }
      }
      const next = resp.headers?.["X-Next-Page"];
      if (!next) break;
      const parsed = Number(next);
      if (!Number.isFinite(parsed) || parsed <= page) break;
      page = parsed;
    }
    return entries;
  }
  async download(path) {
    const fp = encodeURIComponent(path);
    const resp = await this.request(
      "GET",
      `${this.projectBase}/repository/files/${fp}?ref=${encodeURIComponent(this.cfg.branch)}`
    );
    const file = resp.json;
    const base64 = (file.content ?? "").replace(/\s/g, "");
    return {
      data: (0, import_obsidian4.base64ToArrayBuffer)(base64),
      hash: file.blob_id ?? file.id ?? "",
      mtime: 0
    };
  }
  async upload(path, data, opts) {
    const fp = encodeURIComponent(path);
    const url = `${this.projectBase}/repository/files/${fp}?branch=${encodeURIComponent(this.cfg.branch)}`;
    const commitMessage = opts.message && opts.message.trim() ? opts.message.trim() : opts.remoteHash ? messages().commitUpdate(path) : messages().commitAdd(path);
    const body = {
      branch: this.cfg.branch,
      content: (0, import_obsidian4.arrayBufferToBase64)(data),
      encoding: "base64",
      commit_message: commitMessage
    };
    if (opts.remoteHash) {
      await this.request("PUT", url, body);
      return;
    }
    let exists = false;
    try {
      await this.request(
        "GET",
        `${this.projectBase}/repository/files/${fp}?ref=${encodeURIComponent(this.cfg.branch)}`
      );
      exists = true;
    } catch (e) {
      if (e instanceof GitLabError && e.status === 404) {
        exists = false;
      } else {
        throw e;
      }
    }
    await this.request(exists ? "PUT" : "POST", url, body);
  }
  async remove(path, _remoteHash) {
    const fp = encodeURIComponent(path);
    const url = `${this.projectBase}/repository/files/${fp}?branch=${encodeURIComponent(this.cfg.branch)}`;
    await this.request("DELETE", url, {
      branch: this.cfg.branch,
      commit_message: messages().commitDelete(path)
    });
  }
  async batchCommit(files, deletes, message) {
    if (files.length === 0 && deletes.length === 0) return;
    const l = messages();
    const commitMessage = message && message.trim() ? message.trim() : l.commitBatch(files.length, deletes.length);
    const actions = [];
    for (const f of files) {
      actions.push({
        action: f.remoteHash ? "update" : "create",
        file_path: f.path,
        content: (0, import_obsidian4.arrayBufferToBase64)(f.data),
        encoding: "base64"
      });
    }
    for (const d of deletes) {
      actions.push({ action: "delete", file_path: d.path });
    }
    await this.request("POST", `${this.projectBase}/repository/commits`, {
      branch: this.cfg.branch,
      commit_message: commitMessage,
      actions
    });
  }
  hashData(data) {
    return gitBlobSha1(data);
  }
  /** Last commit time touching the path — only queried on real conflicts. */
  async statMtime(path) {
    const fp = encodeURIComponent(path);
    const resp = await this.request(
      "GET",
      `${this.projectBase}/repository/commits?path=${fp}&ref=${encodeURIComponent(this.cfg.branch)}&per_page=1`
    );
    const commits = resp.json;
    const date = commits[0]?.committed_date;
    return date ? Date.parse(date) : 0;
  }
};
async function testGitLabToken(owner, repo, token, gitlabUrl = DEFAULT_GITLAB_URL, branch) {
  const url = (gitlabUrl || DEFAULT_GITLAB_URL).replace(/\/+$/, "");
  const projectId = encodeURIComponent(`${owner}/${repo}`);
  const l = messages();
  const detailOf = (r) => {
    try {
      return r.json.message ?? "";
    } catch {
      return r.text.slice(0, 200);
    }
  };
  const project = await (0, import_obsidian4.requestUrl)({
    url: `${url}/api/v4/projects/${projectId}`,
    method: "GET",
    throw: false,
    headers: { "PRIVATE-TOKEN": token }
  });
  if (project.status >= 400) {
    throw new GitLabError(project.status, l.apiFailed("gitlab", "GET", project.status, detailOf(project)));
  }
  const tree = await (0, import_obsidian4.requestUrl)({
    url: `${url}/api/v4/projects/${projectId}/repository/tree?per_page=1`,
    method: "GET",
    throw: false,
    headers: { "PRIVATE-TOKEN": token }
  });
  if (tree.status === 403) {
    throw new GitLabError(403, l.gitlabTestScopeError);
  }
  if (!branch) return;
  const branchResp = await (0, import_obsidian4.requestUrl)({
    url: `${url}/api/v4/projects/${projectId}/repository/branches/${encodeURIComponent(branch)}`,
    method: "GET",
    throw: false,
    headers: { "PRIVATE-TOKEN": token }
  });
  if (branchResp.status !== 200) return;
  if (!branchResp.json.protected) return;
  const projectJson = project.json;
  const tokenLevel = projectJson.permissions?.project_access?.access_level ?? projectJson.permissions?.group_access?.access_level ?? 0;
  const protection = await (0, import_obsidian4.requestUrl)({
    url: `${url}/api/v4/projects/${projectId}/protected_branches/${encodeURIComponent(branch)}`,
    method: "GET",
    throw: false,
    headers: { "PRIVATE-TOKEN": token }
  });
  if (protection.status === 200) {
    const levels = protection.json.push_access_levels;
    if (levels && levels.length > 0) {
      const canPush = levels.some((a) => {
        const lvl = a.access_level ?? 0;
        return lvl > 0 && tokenLevel >= lvl;
      });
      if (!canPush) throw new GitLabError(403, l.gitlabProtectedBranchHint);
      return;
    }
  }
  if (tokenLevel > 0 && tokenLevel < 40) {
    throw new GitLabError(403, l.gitlabProtectedBranchHint);
  }
}
async function fetchGitLabBranches(owner, repo, token, gitlabUrl = DEFAULT_GITLAB_URL) {
  const url = (gitlabUrl || DEFAULT_GITLAB_URL).replace(/\/+$/, "");
  const projectId = encodeURIComponent(`${owner}/${repo}`);
  const resp = await (0, import_obsidian4.requestUrl)({
    url: `${url}/api/v4/projects/${projectId}/repository/branches?per_page=100`,
    method: "GET",
    throw: false,
    headers: { "PRIVATE-TOKEN": token }
  });
  if (resp.status >= 400) {
    const l = messages();
    let detail = "";
    try {
      detail = resp.json.message ?? "";
    } catch {
      detail = resp.text.slice(0, 200);
    }
    throw new GitLabError(resp.status, l.apiFailed("gitlab", "GET", resp.status, detail));
  }
  const branches = resp.json;
  return branches.map((b) => b.name);
}
var GitLabError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};

// src/backends/gitea.ts
var import_obsidian5 = require("obsidian");
var DEFAULT_GITEA_URL = "https://gitea.com";
var GiteaBackend = class {
  constructor(cfg) {
    this.cfg = cfg;
  }
  /** Bumped from "git-blob-sha1" to invalidate stale caches after adding LF normalization. */
  id = "git-blob-sha1-lf";
  get repoBase() {
    const url = (this.cfg.giteaUrl || DEFAULT_GITEA_URL).replace(/\/+$/, "");
    const owner = encodeURIComponent(this.cfg.owner);
    const repo = encodeURIComponent(this.cfg.repo);
    return `${url}/api/v1/repos/${owner}/${repo}`;
  }
  authHeaders() {
    return {
      Authorization: `token ${this.cfg.token}`,
      Accept: "application/json"
    };
  }
  async request(method, url, body) {
    const resp = await (0, import_obsidian5.requestUrl)({
      url,
      method,
      throw: false,
      headers: this.authHeaders(),
      contentType: body ? "application/json" : void 0,
      body: body ? JSON.stringify(body) : void 0
    });
    if (resp.status >= 400) {
      const l = messages();
      let detail = "";
      try {
        detail = resp.json.message ?? "";
      } catch {
        detail = resp.text.slice(0, 200);
      }
      throw new GiteaError(resp.status, l.apiFailed("gitea", method, resp.status, detail));
    }
    return resp;
  }
  async manifest() {
    let resp;
    try {
      resp = await this.request(
        "GET",
        `${this.repoBase}/git/trees/${encodeURIComponent(this.cfg.branch)}?recursive=1`
      );
    } catch (e) {
      if (e instanceof GiteaError && (e.status === 404 || e.status === 409)) return [];
      throw e;
    }
    const body = resp.json;
    if (body.truncated) {
      throw new Error(messages().remoteTreeTruncated);
    }
    return body.tree.filter((t) => t.type === "blob").map((t) => ({ path: t.path, hash: t.sha, mtime: 0, size: t.size ?? 0 }));
  }
  async download(path) {
    const resp = await this.request(
      "GET",
      `${this.repoBase}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.cfg.branch)}`
    );
    const file = resp.json;
    let base64 = (file.content ?? "").replace(/\s/g, "");
    if (!base64 && file.sha) {
      const blob = await this.request("GET", `${this.repoBase}/git/blobs/${file.sha}`);
      base64 = (blob.json.content ?? "").replace(/\s/g, "");
    }
    return { data: (0, import_obsidian5.base64ToArrayBuffer)(base64), hash: file.sha, mtime: 0 };
  }
  async upload(path, data, opts) {
    const url = `${this.repoBase}/contents/${encodePath(path)}`;
    const fallbackMessage = opts.remoteHash ? messages().commitUpdate(path) : messages().commitAdd(path);
    const body = {
      content: (0, import_obsidian5.arrayBufferToBase64)(data),
      message: opts.message && opts.message.trim() ? opts.message.trim() : fallbackMessage,
      branch: this.cfg.branch
    };
    if (opts.remoteHash) body.sha = opts.remoteHash;
    try {
      await this.request("PUT", url, body);
    } catch (e) {
      if (!opts.remoteHash && this.isGiteaStaleCreate(e)) {
        const existingSha = await this.fileSha(path);
        if (existingSha === opts.hash) return;
        if (existingSha) {
          await this.request("PUT", url, { ...body, sha: existingSha });
          return;
        }
      }
      throw e;
    }
  }
  /** Returns the current blob SHA of a remote file, or null if it does not exist. */
  async fileSha(path) {
    try {
      const resp = await this.request(
        "GET",
        `${this.repoBase}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.cfg.branch)}`
      );
      return resp.json.sha ?? null;
    } catch (e) {
      if (e instanceof GiteaError && (e.status === 404 || e.status === 409)) return null;
      throw e;
    }
  }
  /** True when a Gitea PUT (no sha) failed because the file already exists remotely. */
  isGiteaStaleCreate(e) {
    if (!(e instanceof GiteaError)) return false;
    return e.status === 409 && /already exist/i.test(e.message);
  }
  async remove(path, remoteHash) {
    if (!remoteHash) throw new Error(messages().deleteNeedsSha(path));
    const url = `${this.repoBase}/contents/${encodePath(path)}`;
    const message = messages().commitDelete(path);
    await this.request("DELETE", url, {
      message,
      sha: remoteHash,
      branch: this.cfg.branch
    });
  }
  async batchCommit(files, deletes, message) {
    if (files.length === 0 && deletes.length === 0) return;
    await this.batchCommitGitea(files, deletes, message);
  }
  /**
   * Gitea: uses the Git Data API to batch multiple file changes into one commit.
   * Flow: get ref → get tree → create blobs → create tree → create commit → update ref.
   * The ref update with force:false provides fast-forward protection against
   * concurrent remote changes. Mirrors the GitHub backend's batch path.
   */
  async batchCommitGitea(files, deletes, message) {
    const l = messages();
    let parentSha;
    let baseTreeSha;
    try {
      const refResp = await this.request(
        "GET",
        `${this.repoBase}/git/refs/heads/${encodeURIComponent(this.cfg.branch)}`
      );
      parentSha = refResp.json.object.sha;
      const commitResp = await this.request("GET", `${this.repoBase}/git/commits/${parentSha}`);
      baseTreeSha = commitResp.json.tree.sha;
    } catch (e) {
      if (!(e instanceof GiteaError) || e.status !== 404 && e.status !== 409) throw e;
    }
    const treeEntries = [];
    for (const f of files) {
      const blobResp = await this.request("POST", `${this.repoBase}/git/blobs`, {
        content: (0, import_obsidian5.arrayBufferToBase64)(f.data),
        encoding: "base64"
      });
      treeEntries.push({
        path: f.path,
        mode: "100644",
        type: "blob",
        sha: blobResp.json.sha
      });
    }
    for (const d of deletes) {
      treeEntries.push({
        path: d.path,
        mode: "100644",
        type: "blob",
        sha: null
      });
    }
    const treeBody = { tree: treeEntries };
    if (baseTreeSha) treeBody.base_tree = baseTreeSha;
    const treeResp = await this.request("POST", `${this.repoBase}/git/trees`, treeBody);
    const newTreeSha = treeResp.json.sha;
    const commitBody = {
      message: message && message.trim() ? message.trim() : l.commitBatch(files.length, deletes.length),
      tree: newTreeSha
    };
    if (parentSha) commitBody.parents = [parentSha];
    const newCommitResp = await this.request("POST", `${this.repoBase}/git/commits`, commitBody);
    const newCommitSha = newCommitResp.json.sha;
    if (parentSha) {
      await this.request(
        "PATCH",
        `${this.repoBase}/git/refs/heads/${encodeURIComponent(this.cfg.branch)}`,
        { sha: newCommitSha, force: false }
      );
    } else {
      await this.request("POST", `${this.repoBase}/git/refs`, {
        ref: `refs/heads/${this.cfg.branch}`,
        sha: newCommitSha
      });
    }
  }
  hashData(data) {
    return gitBlobSha1(data);
  }
  /** Last commit time touching the path — only queried on real conflicts. */
  async statMtime(path) {
    const resp = await this.request(
      "GET",
      `${this.repoBase}/commits?sha=${encodeURIComponent(this.cfg.branch)}&path=${encodePath(path)}&page=1&per_page=1`
    );
    const commits = resp.json;
    const date = commits[0]?.commit?.committer?.date;
    return date ? Date.parse(date) : 0;
  }
};
async function testGiteaToken(owner, repo, token, giteaUrl = DEFAULT_GITEA_URL) {
  await fetchGiteaBranches(owner, repo, token, giteaUrl);
}
async function fetchGiteaBranches(owner, repo, token, giteaUrl = DEFAULT_GITEA_URL) {
  const url = (giteaUrl || DEFAULT_GITEA_URL).replace(/\/+$/, "");
  const ownerEnc = encodeURIComponent(owner);
  const repoEnc = encodeURIComponent(repo);
  const urlBase = `${url}/api/v1/repos/${ownerEnc}/${repoEnc}`;
  const resp = await (0, import_obsidian5.requestUrl)({
    url: `${urlBase}/branches?per_page=100`,
    method: "GET",
    throw: false,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/json"
    }
  });
  if (resp.status >= 400) {
    const l = messages();
    let detail = "";
    try {
      detail = resp.json.message ?? "";
    } catch {
      detail = resp.text.slice(0, 200);
    }
    throw new GiteaError(resp.status, l.apiFailed("gitea", "GET", resp.status, detail));
  }
  const branches = resp.json;
  return branches.map((b) => b.name);
}
var GiteaError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
};

// src/settings/token-select-modal.ts
var import_obsidian6 = require("obsidian");
var TokenSelectModal = class extends import_obsidian6.Modal {
  constructor(app, plugin, host, onSave) {
    super(app);
    this.plugin = plugin;
    this.host = host;
    this.onSave = onSave;
    this.selectedName = this.plugin.tokenManager.getActiveKey(host);
  }
  selectedName;
  searchQuery = "";
  showAddForm = false;
  visibleTokens = /* @__PURE__ */ new Set();
  secrets = [];
  listContainer;
  addForm;
  nameInput;
  valueInput;
  onOpen() {
    this.modalEl.addClass("gitee-sync-plus-token-modal");
    const { contentEl } = this;
    contentEl.empty();
    const l = messages();
    contentEl.createEl("h2", { text: l.tokenSelectTitle, cls: "gitee-sync-plus-token-title" });
    const searchContainer = contentEl.createDiv({ cls: "gitee-sync-plus-token-search" });
    const searchInput = searchContainer.createEl("input", {
      type: "search",
      placeholder: l.tokenSearchPlaceholder,
      cls: "gitee-sync-plus-token-search-input"
    });
    searchInput.value = this.searchQuery;
    searchInput.addEventListener("input", () => {
      this.searchQuery = searchInput.value.trim().toLowerCase();
      this.renderList();
    });
    this.addForm = contentEl.createDiv({ cls: "gitee-sync-plus-token-add-form" });
    this.addForm.style.display = this.showAddForm ? "block" : "none";
    this.nameInput = this.addForm.createEl("input", {
      type: "text",
      placeholder: l.tokenKeyId,
      cls: "gitee-sync-plus-token-add-input"
    });
    this.valueInput = this.addForm.createEl("input", {
      type: "password",
      placeholder: l.tokenValue,
      cls: "gitee-sync-plus-token-add-input"
    });
    const addFormButtons = this.addForm.createDiv({ cls: "gitee-sync-plus-token-add-buttons" });
    const confirmAddBtn = addFormButtons.createEl("button", { text: l.tokenConfirmAdd, cls: "mod-cta" });
    const cancelAddBtn = addFormButtons.createEl("button", { text: l.tokenCancel });
    confirmAddBtn.addEventListener("click", () => {
      void this.addSecret();
    });
    cancelAddBtn.addEventListener("click", () => {
      this.toggleAddForm(false);
    });
    this.listContainer = contentEl.createDiv({ cls: "gitee-sync-plus-token-list" });
    const footer = contentEl.createDiv({ cls: "gitee-sync-plus-token-footer" });
    const addBtn = footer.createEl("button", { text: l.tokenAdd });
    addBtn.addEventListener("click", () => {
      this.toggleAddForm(true);
      this.nameInput.focus();
    });
    const rightButtons = footer.createDiv({ cls: "gitee-sync-plus-token-footer-right" });
    const saveBtn = rightButtons.createEl("button", { text: l.tokenSave, cls: "mod-cta" });
    const cancelBtn = rightButtons.createEl("button", { text: l.tokenCancel });
    saveBtn.addEventListener("click", () => {
      void this.save();
    });
    cancelBtn.addEventListener("click", () => {
      this.close();
    });
    this.scope.register([], "Escape", () => this.close());
    this.renderList();
    void this.loadSecrets();
  }
  async loadSecrets() {
    this.secrets = await this.plugin.tokenManager.listSecrets();
    this.renderList();
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
  toggleAddForm(show) {
    this.showAddForm = show;
    this.addForm.style.display = show ? "block" : "none";
    if (!show) {
      this.nameInput.value = "";
      this.valueInput.value = "";
    }
  }
  renderList() {
    const l = messages();
    this.listContainer.empty();
    const keys = this.secrets.filter((k) => k.toLowerCase().includes(this.searchQuery));
    if (keys.length === 0) {
      this.listContainer.createDiv({
        text: this.searchQuery ? l.tokenNoMatch : l.tokenEmpty,
        cls: "gitee-sync-plus-token-empty"
      });
      return;
    }
    for (const key of keys) {
      const isSelected = this.selectedName === key;
      const item = this.listContainer.createDiv({ cls: "gitee-sync-plus-token-item" });
      if (isSelected) item.addClass("is-selected");
      const left = item.createDiv({ cls: "gitee-sync-plus-token-item-left" });
      const radio = left.createEl("input", { type: "radio", value: key });
      radio.name = "token-select";
      radio.checked = isSelected;
      radio.addEventListener("change", () => {
        this.selectedName = key;
        this.renderList();
      });
      left.createSpan({ text: key, cls: "gitee-sync-plus-token-name" });
      if (isSelected) {
        left.createSpan({ text: l.tokenSelected, cls: "gitee-sync-plus-token-badge" });
      }
      const actions = item.createDiv({ cls: "gitee-sync-plus-token-actions" });
      const isVisible = this.visibleTokens.has(key);
      const eyeBtn = actions.createEl("button", { cls: "gitee-sync-plus-token-icon-btn" });
      (0, import_obsidian6.setIcon)(eyeBtn, isVisible ? "eye-off" : "eye");
      eyeBtn.addEventListener("click", () => {
        if (isVisible) {
          this.visibleTokens.delete(key);
        } else {
          this.visibleTokens.add(key);
        }
        this.renderList();
      });
      const delBtn = actions.createEl("button", { cls: "gitee-sync-plus-token-icon-btn" });
      (0, import_obsidian6.setIcon)(delBtn, "trash-2");
      delBtn.addEventListener("click", () => {
        if (confirm(l.tokenDeleteConfirm(key))) {
          void this.deleteSecret(key);
        }
      });
      if (isVisible) {
        void this.plugin.tokenManager.getToken(key).then((v) => {
          const valueEl = item.createDiv({ cls: "gitee-sync-plus-token-value" });
          valueEl.setText(v ?? "");
        });
      }
    }
  }
  async addSecret() {
    const l = messages();
    const rawName = this.nameInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    const value = this.valueInput.value.trim();
    if (!rawName) {
      new import_obsidian6.Notice(l.tokenNameRequired);
      return;
    }
    if (!value) {
      new import_obsidian6.Notice(l.tokenValueRequired);
      return;
    }
    if (this.secrets.includes(rawName)) {
      new import_obsidian6.Notice(l.tokenDuplicateName);
      return;
    }
    try {
      await this.plugin.tokenManager.setToken(rawName, value);
      this.secrets.push(rawName);
      this.selectedName = rawName;
      this.toggleAddForm(false);
      this.renderList();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new import_obsidian6.Notice(l.tokenSaveFailed(msg), 8e3);
    }
  }
  async deleteSecret(name) {
    await this.plugin.tokenManager.deleteToken(name);
    this.secrets = this.secrets.filter((k) => k !== name);
    if (this.selectedName === name) {
      this.selectedName = null;
    }
    this.renderList();
  }
  async save() {
    await this.plugin.tokenManager.setActiveKey(this.host, this.selectedName);
    this.onSave();
    this.close();
  }
};

// src/ui/git-panel-view.ts
var import_obsidian10 = require("obsidian");

// src/backends/index.ts
function createBackend(s) {
  if (s.backend === "gitea") {
    if (!s.giteaOwner || !s.giteaRepo || !s.giteaToken) {
      throw new Error(messages().missingGiteaSettings);
    }
    return new GiteaBackend({
      owner: s.giteaOwner,
      repo: s.giteaRepo,
      branch: s.giteaBranch || "main",
      token: s.giteaToken,
      giteaUrl: s.giteaUrl || DEFAULT_GITEA_URL
    });
  }
  if (s.backend === "gitlab") {
    if (!s.gitlabOwner || !s.gitlabRepo || !s.gitlabToken) {
      throw new Error(messages().missingGitlabSettings);
    }
    return new GitLabBackend({
      owner: s.gitlabOwner,
      repo: s.gitlabRepo,
      branch: s.gitlabBranch || "main",
      token: s.gitlabToken,
      gitlabUrl: s.gitlabUrl || DEFAULT_GITLAB_URL
    });
  }
  if (s.backend === "github") {
    if (!s.githubOwner || !s.githubRepo || !s.githubToken) {
      throw new Error(messages().missingGithubSettings);
    }
    return new GitHubBackend({
      owner: s.githubOwner,
      repo: s.githubRepo,
      branch: s.githubBranch || "main",
      token: s.githubToken
    });
  }
  if (!s.giteeOwner || !s.giteeRepo || !s.giteeToken) {
    throw new Error(messages().missingGiteeSettings);
  }
  return new GiteeBackend({
    owner: s.giteeOwner,
    repo: s.giteeRepo,
    branch: s.giteeBranch || "master",
    token: s.giteeToken
  });
}

// src/utils/engine.ts
var LOG_FILE = "_gitee-sync-plus-log.md";
var SyncEngine = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  get vault() {
    return this.plugin.app.vault;
  }
  isExcluded(path) {
    return this.plugin.gitIgnoreManager.isIgnored(path);
  }
  /** Cache of the remote manifest to avoid repeated API calls during panel refreshes. */
  manifestCache = null;
  MANIFEST_CACHE_TTL = 5e3;
  /**
   * Cache of LF-normalized remote hashes. The sync engine compares local files
   * by their LF-normalized hash, but the remote manifest stores raw git blob
   * SHAs. This cache lets us avoid downloading the same remote file repeatedly
   * just to check whether a hash mismatch is only a line-ending difference.
   */
  normalizedRemoteCache = /* @__PURE__ */ new Map();
  NORMALIZED_REMOTE_CACHE_TTL = 6e4;
  async fetchManifest(backend) {
    if (this.manifestCache && Date.now() - this.manifestCache.ts < this.MANIFEST_CACHE_TTL) {
      return this.manifestCache.entries;
    }
    const entries = await backend.manifest();
    this.manifestCache = { entries, ts: Date.now() };
    return entries;
  }
  /** Drops cached remote state; call before mutating operations. */
  invalidateCaches() {
    this.manifestCache = null;
    this.normalizedRemoteCache.clear();
  }
  /**
   * Returns the hash the remote file would have if its line endings were
   * normalized to LF. Local hashes are always computed over LF-normalized
   * content, so comparing with this value lets the sync plan ignore CRLF-vs-LF
   * differences that are not meaningful content changes.
   */
  async getNormalizedRemoteHash(backend, path, rem) {
    const cached = this.normalizedRemoteCache.get(path);
    if (cached && cached.rawHash === rem.hash && Date.now() - cached.ts < this.NORMALIZED_REMOTE_CACHE_TTL) {
      return cached.normalizedHash;
    }
    const { data } = await backend.download(path);
    const normalized = normalizeLineEndings(data);
    const normalizedHash = await backend.hashData(normalized);
    this.normalizedRemoteCache.set(path, {
      rawHash: rem.hash,
      normalizedHash,
      ts: Date.now()
    });
    return normalizedHash;
  }
  /** Dry run: build and describe the plan without transferring anything. */
  async preview() {
    const backend = createBackend(this.plugin.settings);
    const plan = await this.buildPlan(backend);
    return { plan, report: this.formatPlan(plan, messages().previewTitle) };
  }
  async run(message) {
    this.invalidateCaches();
    const l = messages();
    const backend = createBackend(this.plugin.settings);
    const plan = await this.buildPlan(backend);
    if (this.plugin.settings.debugLog) {
      await this.plugin.appendLog(this.formatPlan(plan, l.executionTitle));
    }
    const summary = {
      pushed: 0,
      pulled: 0,
      deletedLocal: 0,
      deletedRemote: 0,
      conflicts: plan.conflicts
    };
    const nextState = { ...plan.nextState };
    try {
      await this.executePull(backend, plan, nextState, summary);
      await this.executePush(backend, plan, nextState, summary, { message });
    } catch (e) {
      this.plugin.baseline = nextState;
      await this.plugin.savePluginData();
      if (this.plugin.settings.debugLog) {
        await this.plugin.appendLog(
          l.resultFailed(e instanceof Error ? e.message : String(e)) + l.completedCounts(
            summary.pulled,
            summary.pushed,
            summary.deletedLocal,
            summary.deletedRemote
          )
        );
      }
      throw e;
    }
    this.plugin.baseline = nextState;
    await this.plugin.savePluginData();
    if (this.plugin.settings.debugLog) {
      await this.plugin.appendLog(
        l.resultSuccess(
          summary.pulled,
          summary.pushed,
          summary.deletedLocal,
          summary.deletedRemote,
          summary.conflicts
        )
      );
    }
    return summary;
  }
  /** Builds the three-way sync plan without transferring anything. */
  async computePlan(opts) {
    return this.buildPlan(createBackend(this.plugin.settings), opts);
  }
  /** Phase 1 only: download remote changes and apply remote deletions.
   * When `conflictResolutions` is supplied (the pull-button flow), conflicting
   * files are resolved manually instead of by mtime, and the conflict-derived
   * auto-pull/push entries are skipped. */
  async pullRemote(conflictResolutions) {
    this.invalidateCaches();
    const backend = createBackend(this.plugin.settings);
    const plan = await this.buildPlan(backend);
    const summary = {
      pushed: 0,
      pulled: 0,
      deletedLocal: 0,
      deletedRemote: 0,
      conflicts: plan.conflicts
    };
    const nextState = { ...plan.nextState };
    try {
      await this.executePull(backend, plan, nextState, summary, conflictResolutions);
    } catch (e) {
      this.plugin.baseline = nextState;
      await this.plugin.savePluginData();
      throw e;
    }
    this.plugin.baseline = nextState;
    await this.plugin.savePluginData();
    return summary;
  }
  /**
   * Phase 2 only: push local changes (and remote deletions). When commitMode
   * is "batch", `message` overrides the auto-generated batch commit message.
   * If `staged` is provided, only the local-change paths in that set are sent;
   * the rest remain in the working tree for a later commit.
   */
  async pushLocal(message, staged) {
    this.invalidateCaches();
    const backend = createBackend(this.plugin.settings);
    const plan = await this.buildPlan(backend);
    const summary = {
      pushed: 0,
      pulled: 0,
      deletedLocal: 0,
      deletedRemote: 0,
      conflicts: plan.conflicts
    };
    const nextState = { ...plan.nextState };
    try {
      await this.executePush(backend, plan, nextState, summary, { message, staged });
    } catch (e) {
      this.plugin.baseline = nextState;
      await this.plugin.savePluginData();
      throw e;
    }
    this.plugin.baseline = nextState;
    await this.plugin.savePluginData();
    return summary;
  }
  /**
   * Discards local working-tree changes for the given paths so they will no
   * longer be pushed on the next sync:
   * - a file that exists remotely → download the remote copy, overwriting the
   *   local edit (reverts to the last synced version);
   * - a newly added local file (not on remote) → delete the local copy.
   * Only entries in plan.pushes are eligible — these are changes introduced
   * locally since the last successful sync.
   */
  async discardChanges(plan, paths) {
    const backend = createBackend(this.plugin.settings);
    const wanted = new Set(paths);
    const nextState = { ...this.plugin.baseline };
    let count = 0;
    for (const p of plan.pushes) {
      if (!wanted.has(p.path)) continue;
      if (p.rem) {
        let { data, mtime } = await backend.download(p.path);
        data = normalizeLineEndings(data);
        const localMtime = await this.writeLocal(p.path, data, mtime || p.rem.mtime);
        const finalHash = await backend.hashData(data);
        nextState[p.path] = finalHash;
        this.plugin.hashCache[p.path] = {
          mtime: localMtime,
          size: data.byteLength,
          hash: finalHash,
          algo: backend.id
        };
      } else {
        if (await this.vault.adapter.exists(p.path)) {
          await this.vault.adapter.remove(p.path);
        }
        delete this.plugin.hashCache[p.path];
        delete nextState[p.path];
      }
      count++;
    }
    this.plugin.baseline = nextState;
    await this.plugin.savePluginData();
    return count;
  }
  async executePull(backend, plan, nextState, summary, conflictResolutions) {
    const l = messages();
    const conflictMode = !!conflictResolutions;
    const step = async (path, fn) => {
      try {
        await fn();
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(l.pathFailed(path, msg));
      }
    };
    for (const entry of plan.pulls) {
      if (conflictMode && entry.isConflict) continue;
      const { path, rem } = entry;
      await step(path, async () => {
        let { data, mtime } = await backend.download(path);
        data = normalizeLineEndings(data);
        const localMtime = await this.writeLocal(path, data, mtime || rem.mtime);
        const finalHash = await backend.hashData(data);
        nextState[path] = finalHash;
        this.plugin.hashCache[path] = {
          mtime: localMtime,
          size: data.byteLength,
          hash: finalHash,
          algo: backend.id
        };
        summary.pulled++;
      });
    }
    for (const { path, loc, isConflict } of plan.localDeletes) {
      if (conflictMode && isConflict) continue;
      await step(path, async () => {
        await this.vault.adapter.remove(loc.path);
        delete this.plugin.hashCache[path];
        summary.deletedLocal++;
      });
    }
    if (conflictMode) {
      for (const c of plan.conflictEntries) {
        const res = conflictResolutions.get(c.path);
        const action = res ? res.action : c.preferred === "local" ? "local" : "remote";
        await step(c.path, async () => {
          if (action === "local") {
            if (c.loc) {
              nextState[c.path] = c.loc.hash;
            } else if (await this.vault.adapter.exists(c.path)) {
              await this.vault.adapter.remove(c.path);
              delete this.plugin.hashCache[c.path];
              delete nextState[c.path];
            }
            return;
          }
          let data;
          let sourceMtime;
          if (action === "merge" && res && res.action === "merge") {
            data = encodeText(res.content);
            sourceMtime = c.loc?.mtime ?? 0;
          } else if (c.rem) {
            const dl = await backend.download(c.path);
            data = normalizeLineEndings(dl.data);
            sourceMtime = dl.mtime || c.rem.mtime || 0;
          } else {
            if (c.loc && await this.vault.adapter.exists(c.path)) {
              await this.vault.adapter.remove(c.path);
              delete this.plugin.hashCache[c.path];
              delete nextState[c.path];
            }
            return;
          }
          const localMtime = await this.writeLocal(c.path, data, sourceMtime);
          const finalHash = await backend.hashData(data);
          nextState[c.path] = finalHash;
          this.plugin.hashCache[c.path] = {
            mtime: localMtime,
            size: data.byteLength,
            hash: finalHash,
            algo: backend.id
          };
          summary.pulled++;
        });
      }
    }
  }
  async executePush(backend, plan, nextState, summary, opts = {}) {
    const l = messages();
    const { message, staged } = opts;
    const isStaged = (path) => !staged || staged.has(path);
    const stagedPushes = plan.pushes.filter((p) => isStaged(p.path));
    const stagedDeletes = plan.remoteDeletes.filter((d) => isStaged(d.path));
    const pushFailures = [];
    const deleteFailures = [];
    if (this.plugin.settings.commitMode === "batch" && backend.batchCommit) {
      const batchFiles = [];
      for (const { path, loc, rem } of stagedPushes) {
        let data = await this.vault.adapter.readBinary(loc.path);
        data = normalizeLineEndings(data);
        batchFiles.push({ path, data, remoteHash: rem?.hash });
      }
      const batchDeletes = stagedDeletes.map(({ path, rem }) => ({
        path,
        remoteHash: rem.hash
      }));
      if (batchFiles.length > 0 || batchDeletes.length > 0) {
        try {
          await backend.batchCommit(batchFiles, batchDeletes, message);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          throw new Error(
            l.batchCommitFailed(batchFiles.length, batchDeletes.length, msg)
          );
        }
      }
      for (const { path, loc } of stagedPushes) {
        nextState[path] = loc.hash;
        summary.pushed++;
      }
      for (const { path } of stagedDeletes) {
        summary.deletedRemote++;
      }
    } else {
      for (const { path, loc, rem } of stagedPushes) {
        try {
          let data = await this.vault.adapter.readBinary(loc.path);
          data = normalizeLineEndings(data);
          await backend.upload(path, data, {
            hash: loc.hash,
            mtime: loc.mtime,
            remoteHash: rem?.hash,
            message
          });
          nextState[path] = loc.hash;
          summary.pushed++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          pushFailures.push(l.pathFailed(path, msg));
        }
      }
      for (const { path, rem } of stagedDeletes) {
        try {
          await backend.remove(path, rem.hash);
          summary.deletedRemote++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          deleteFailures.push(l.pathFailed(path, msg));
        }
      }
    }
    const failures = [...pushFailures, ...deleteFailures];
    if (failures.length > 0) {
      throw new Error(l.pushPartiallyFailed(summary.pushed, summary.deletedRemote, failures));
    }
  }
  async buildPlan(backend, opts = {}) {
    await this.plugin.gitIgnoreManager.load();
    const l = messages();
    const resolveConflictMtime = !opts.forPanel;
    const [remoteList, local] = await Promise.all([
      this.fetchManifest(backend),
      this.buildLocalManifest(backend)
    ]);
    const remote = new Map(
      remoteList.filter((e) => !this.isExcluded(e.path)).map((e) => [e.path, e])
    );
    const base = this.plugin.baseline;
    const basePaths = Object.keys(base).filter((p) => !this.isExcluded(p));
    const plan = {
      localCount: local.size,
      remoteCount: remote.size,
      baseCount: basePaths.length,
      unchanged: 0,
      conflicts: 0,
      pulls: [],
      localDeletes: [],
      pushes: [],
      remoteDeletes: [],
      conflictEntries: [],
      nextState: {}
    };
    const allPaths = /* @__PURE__ */ new Set([...local.keys(), ...remote.keys(), ...basePaths]);
    for (const path of allPaths) {
      const loc = local.get(path);
      const rem = remote.get(path);
      const baseHash = base[path];
      if (loc && rem && loc.hash === rem.hash) {
        plan.nextState[path] = loc.hash;
        plan.unchanged++;
        continue;
      }
      if (loc && rem && loc.hash !== rem.hash) {
        try {
          const normalizedRemoteHash = await this.getNormalizedRemoteHash(backend, path, rem);
          if (loc.hash === normalizedRemoteHash) {
            plan.nextState[path] = loc.hash;
            plan.unchanged++;
            continue;
          }
        } catch (e) {
          console.error(
            `[gitee-sync-plus] failed to compute normalized remote hash for ${path}`,
            e
          );
        }
      }
      if (!loc && !rem) continue;
      const localChanged = loc?.hash !== baseHash;
      const remoteChanged = rem?.hash !== baseHash;
      const isNew = baseHash === void 0;
      if (localChanged && !remoteChanged) {
        if (loc)
          plan.pushes.push({
            path,
            loc,
            rem,
            reason: isNew ? l.reasonLocalAdded : l.reasonLocalModified
          });
        else if (rem) plan.remoteDeletes.push({ path, rem, reason: l.reasonLocalDeleted });
      } else if (remoteChanged && !localChanged) {
        if (rem)
          plan.pulls.push({
            path,
            rem,
            reason: isNew ? l.reasonRemoteAdded : l.reasonRemoteModified
          });
        else if (loc) plan.localDeletes.push({ path, loc, reason: l.reasonRemoteDeleted });
      } else {
        plan.conflicts++;
        const strategy = this.plugin.settings.mergeStrategy;
        let preferred = "remote";
        let reason;
        if (loc && rem) {
          if (!resolveConflictMtime) {
            preferred = "remote";
            reason = l.reasonConflictBothChanged;
            plan.pushes.push({ path, loc, rem, reason, isConflict: true });
          } else if (strategy === "remote") {
            preferred = "remote";
            reason = l.reasonConflictUseRemote;
            plan.pulls.push({ path, rem, reason, isConflict: true });
          } else if (strategy === "local") {
            preferred = "local";
            reason = l.reasonConflictUseLocal;
            plan.pushes.push({ path, loc, rem, reason, isConflict: true });
          } else {
            const remoteMtime = await this.remoteMtime(backend, path, rem);
            if (loc.mtime >= remoteMtime) {
              preferred = "local";
              reason = l.reasonConflictLocalNewer(ts(loc.mtime), ts(remoteMtime));
              plan.pushes.push({ path, loc, rem, reason, isConflict: true });
            } else {
              preferred = "remote";
              reason = l.reasonConflictRemoteNewer(ts(remoteMtime), ts(loc.mtime));
              plan.pulls.push({ path, rem, reason, isConflict: true });
            }
          }
        } else if (loc) {
          if (resolveConflictMtime && strategy === "remote") {
            preferred = "remote";
            reason = l.reasonConflictDeleteLocalByRemote;
            plan.localDeletes.push({ path, loc, reason, isConflict: true });
          } else {
            preferred = "local";
            reason = l.reasonConflictKeepLocal;
            plan.pushes.push({ path, loc, rem, reason, isConflict: true });
          }
        } else if (rem) {
          if (resolveConflictMtime && strategy === "local") {
            preferred = "local";
            reason = l.reasonConflictDeleteRemoteByLocal;
            plan.remoteDeletes.push({ path, rem, reason, isConflict: true });
          } else {
            preferred = "remote";
            reason = l.reasonConflictKeepRemote;
            plan.pulls.push({ path, rem, reason, isConflict: true });
          }
        } else {
          continue;
        }
        plan.conflictEntries.push({ path, loc, rem, reason, preferred });
      }
    }
    return plan;
  }
  formatPlan(plan, title) {
    const l = messages();
    const s = this.plugin.settings;
    const target = s.backend === "github" ? `github ${s.githubOwner}/${s.githubRepo}@${s.githubBranch}` : s.backend === "gitlab" ? `gitlab ${s.gitlabOwner}/${s.gitlabRepo}@${s.gitlabBranch}` : s.backend === "gitea" ? `gitea ${s.giteaOwner}/${s.giteaRepo}@${s.giteaBranch}` : `gitee ${s.giteeOwner}/${s.giteeRepo}@${s.giteeBranch}`;
    const lines = [];
    lines.push(`
## ${title} ${formatDateTime()}`);
    lines.push(
      l.planBackend(target) + "\n" + l.planCounts(
        plan.localCount,
        plan.remoteCount,
        plan.baseCount,
        plan.unchanged,
        plan.conflicts
      )
    );
    const total = plan.pulls.length + plan.pushes.length + plan.localDeletes.length + plan.remoteDeletes.length;
    if (total === 0) {
      lines.push(l.planNoActions);
    } else {
      lines.push(
        l.planActions(
          plan.pulls.length,
          plan.pushes.length,
          plan.localDeletes.length,
          plan.remoteDeletes.length
        )
      );
      for (const a of plan.pulls)
        lines.push(`- \u2B07\uFE0F ${l.actionDownload} \`${a.path}\` \u2014 ${a.reason}`);
      for (const a of plan.localDeletes)
        lines.push(`- \u{1F5D1}\uFE0F ${l.actionDeleteLocal} \`${a.path}\` \u2014 ${a.reason}`);
      for (const a of plan.pushes)
        lines.push(`- \u2B06\uFE0F ${l.actionUpload} \`${a.path}\` \u2014 ${a.reason}`);
      for (const a of plan.remoteDeletes)
        lines.push(`- \u274C ${l.actionDeleteRemote} \`${a.path}\` \u2014 ${a.reason}`);
    }
    return lines.join("\n") + "\n";
  }
  async remoteMtime(backend, path, rem) {
    if (rem.mtime > 0 || !backend.statMtime) return rem.mtime;
    try {
      return await backend.statMtime(path);
    } catch {
      return 0;
    }
  }
  /**
   * Recursively lists every file under `dir` (including hidden files/dirs)
   * using the low-level adapter, which bypasses Obsidian's file-index filter.
   *
   * On Windows the adapter may return entries as full vault-relative paths
   * (e.g. ".git\\hooks") rather than bare names.  We detect and handle both
   * forms to avoid path-doubling bugs like ".git/.git/hooks".
   */
  async listAllFiles(dir) {
    const result = [];
    const listing = await this.vault.adapter.list(dir);
    const dirNorm = dir.replace(/\\/g, "/");
    const joinPath = (name) => {
      const norm = name.replace(/\\/g, "/");
      if (dirNorm && (norm === dirNorm || norm.startsWith(dirNorm + "/"))) {
        return norm;
      }
      return dirNorm ? `${dirNorm}/${norm}` : norm;
    };
    for (const file of listing.files) {
      result.push(joinPath(file));
    }
    for (const folder of listing.folders) {
      const subDir = joinPath(folder);
      if (this.isExcluded(subDir) || this.isExcluded(subDir + "/")) continue;
      const subFiles = await this.listAllFiles(subDir);
      result.push(...subFiles);
    }
    return result;
  }
  /** Builds { path -> hash } for the vault, reusing cached hashes when mtime+size are unchanged. */
  async buildLocalManifest(backend) {
    const result = /* @__PURE__ */ new Map();
    const cache = this.plugin.hashCache;
    const seen = /* @__PURE__ */ new Set();
    const adapter = this.vault.adapter;
    const allFiles = await this.listAllFiles("");
    const CONCURRENCY = 10;
    const processFile = async (path) => {
      if (this.isExcluded(path)) return;
      seen.add(path);
      const stat = await adapter.stat(path);
      if (!stat || stat.type !== "file") return;
      const cached = cache[path];
      let hash;
      if (cached && cached.algo === backend.id && cached.mtime === stat.mtime && cached.size === stat.size) {
        hash = cached.hash;
      } else {
        let data = await adapter.readBinary(path);
        data = normalizeLineEndings(data);
        hash = await backend.hashData(data);
        cache[path] = {
          mtime: stat.mtime,
          size: stat.size,
          hash,
          algo: backend.id
        };
      }
      result.set(path, { path, hash, mtime: stat.mtime });
    };
    for (let i = 0; i < allFiles.length; i += CONCURRENCY) {
      const batch = allFiles.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(processFile));
    }
    for (const path of Object.keys(cache)) {
      if (!seen.has(path)) delete cache[path];
    }
    return result;
  }
  /** Writes the file and returns its resulting local mtime (for the hash cache). */
  async writeLocal(path, data, mtime) {
    const dir = path.split("/").slice(0, -1).join("/");
    if (dir) await this.ensureFolder(dir);
    await this.vault.adapter.writeBinary(path, data);
    const stat = await this.vault.adapter.stat(path);
    return stat ? stat.mtime : mtime;
  }
  async ensureFolder(dir) {
    const parts = dir.split("/");
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      if (!await this.vault.adapter.exists(current)) {
        try {
          await this.vault.adapter.mkdir(current);
        } catch {
        }
      }
    }
  }
};
function normalizeLineEndings(data) {
  const bytes = new Uint8Array(data);
  let hasCR = false;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 13) {
      hasCR = true;
      break;
    }
  }
  if (!hasCR) return data;
  const sampleLen = Math.min(bytes.length, 1024);
  for (let i = 0; i < sampleLen; i++) {
    if (bytes[i] === 0) return data;
  }
  const result = [];
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 13 && i + 1 < bytes.length && bytes[i + 1] === 10) continue;
    result.push(bytes[i]);
  }
  return new Uint8Array(result).buffer;
}
function ts(ms) {
  return ms > 0 ? formatDateTime(new Date(ms)) : messages().unknown;
}
function encodeText(text) {
  return new TextEncoder().encode(text.replace(/\r\n/g, "\n")).buffer;
}

// src/ui/diff-view.ts
var import_obsidian7 = require("obsidian");
var DIFF_VIEW_TYPE = "gitee-sync-plus-diff";
var BATCH_THRESHOLD = 800;
var LARGE_FILE_ROWS = 5e3;
var FRAME_BUDGET_MS = 12;
var pluginInstance;
function setDiffPluginInstance(p) {
  pluginInstance = p;
}
var DiffView = class extends import_obsidian7.ItemView {
  viewState = null;
  diffContentEl = null;
  busy = false;
  opened = false;
  currentBeforeText = "";
  currentAfterText = "";
  layout = "side-by-side";
  // Collapse unchanged fragments by default: keeps the DOM tiny on large
  // files (e.g. 10k-line data.json) so the diff opens instantly and only
  // expands the few lines of context around each change on demand.
  collapseUnchanged = true;
  scrollSyncHandler;
  sectionScrollEls = [];
  /** Monotonic token: every renderDiff bumps it so a stale batched render
   * (from a view switch or re-render) stops touching the DOM. */
  renderToken = 0;
  /** chunkIndex → rows in that chunk, built once per render so reverting a
   * chunk is O(1) instead of O(rows). */
  chunkRowsIndex = /* @__PURE__ */ new Map();
  lastDiff = null;
  /** Which side of the current diff holds the local version. Used to place
   * revert buttons only on the local side. */
  localSide = "after";
  /** Aborts listeners attached by the drag-to-scroll helper so repeated
   * renders don't leak window-level mouse handlers. */
  dragAbort;
  constructor(leaf) {
    super(leaf);
  }
  get plugin() {
    if (pluginInstance) return pluginInstance;
    const plugins = this.app.plugins;
    const p = plugins?.getPlugin("gitee-sync-plus");
    if (!p) throw new Error(messages().diffPluginNotReady);
    return p;
  }
  getViewType() {
    return DIFF_VIEW_TYPE;
  }
  getDisplayText() {
    const l = messages();
    if (!this.viewState) return l.diffTitle;
    return l.diffTitleFor(this.viewState.path);
  }
  getIcon() {
    return "columns-2";
  }
  async setState(state, result) {
    this.viewState = state;
    await super.setState(state, result);
    if (this.opened) {
      void this.loadDiff();
    }
  }
  getState() {
    return this.viewState ?? { path: "", kind: "local-mod" };
  }
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("gitee-sync-plus-diff");
    const header = container.createDiv("gitee-sync-plus-diff-header");
    header.createEl("span", { cls: "gitee-sync-plus-diff-path" });
    const actions = header.createDiv("gitee-sync-plus-diff-actions");
    const layoutBtn = actions.createEl("button", {
      cls: "gitee-sync-plus-diff-layout-btn",
      title: messages().diffLayoutToggle
    });
    layoutBtn.addEventListener("click", () => this.toggleLayout());
    const collapseBtn = actions.createEl("button", {
      cls: "gitee-sync-plus-diff-action-btn gitee-sync-plus-diff-collapse-btn",
      title: messages().diffCollapseUnchanged
    });
    collapseBtn.addEventListener("click", () => this.toggleCollapseUnchanged());
    this.updateLayoutButton();
    this.updateCollapseButton();
    this.diffContentEl = container.createDiv("gitee-sync-plus-diff-content");
    this.opened = true;
    if (this.viewState) {
      void this.loadDiff();
    }
  }
  toggleLayout() {
    this.layout = this.layout === "side-by-side" ? "vertical" : "side-by-side";
    this.updateLayoutButton();
    if (this.lastDiff) {
      this.renderDiff(
        this.lastDiff.path,
        this.lastDiff.beforeText,
        this.lastDiff.afterText,
        this.lastDiff.beforeLabel,
        this.lastDiff.afterLabel
      );
    } else if (this.diffContentEl) {
      this.diffContentEl.removeClass("layout-side-by-side", "layout-vertical");
      this.diffContentEl.addClass(`layout-${this.layout}`);
    }
  }
  updateLayoutButton() {
    const btn = this.containerEl.querySelector(".gitee-sync-plus-diff-layout-btn");
    if (!btn) return;
    const l = messages();
    const title = this.layout === "side-by-side" ? l.diffLayoutVertical : l.diffLayoutSideBySide;
    btn.setAttribute("aria-label", title);
    btn.setAttribute("title", title);
    btn.setText(this.layout === "side-by-side" ? "\u21C5" : "\u21C4");
  }
  toggleCollapseUnchanged() {
    this.collapseUnchanged = !this.collapseUnchanged;
    this.updateCollapseButton();
    if (this.diffContentEl) {
      this.diffContentEl.toggleClass("collapse-unchanged", this.collapseUnchanged);
      if (!this.collapseUnchanged) {
        this.diffContentEl.querySelectorAll(".gitee-sync-plus-diff-collapsed-placeholder").forEach((el) => {
          if (el instanceof HTMLElement) el.click();
        });
      }
    }
  }
  updateCollapseButton() {
    const btn = this.containerEl.querySelector(".gitee-sync-plus-diff-collapse-btn");
    if (!btn) return;
    const l = messages();
    const title = this.collapseUnchanged ? l.diffExpandUnchanged : l.diffCollapseUnchanged;
    btn.setAttribute("aria-label", title);
    btn.setAttribute("title", title);
    btn.setText(this.collapseUnchanged ? "\u2263" : "\u2261");
    btn.toggleClass("is-active", this.collapseUnchanged);
  }
  attachScrollSync() {
    this.detachScrollSync();
    if (this.sectionScrollEls.length !== 2) return;
    const [left, right] = this.sectionScrollEls;
    let active = null;
    let timeout;
    const onScroll = (source) => {
      if (active && active !== source) return;
      active = source;
      const target = source === left ? right : left;
      const maxSource = source.scrollHeight - source.clientHeight;
      const maxTarget = target.scrollHeight - target.clientHeight;
      if (maxSource <= 0 || maxTarget <= 0) return;
      const ratio = source.scrollTop / maxSource;
      target.scrollTop = ratio * maxTarget;
      if (timeout) window.clearTimeout(timeout);
      timeout = window.setTimeout(() => {
        active = null;
      }, 100);
    };
    this.scrollSyncHandler = () => {
      if (document.activeElement === left || left.matches(":hover")) onScroll(left);
      else onScroll(right);
    };
    left.addEventListener("scroll", this.scrollSyncHandler);
    right.addEventListener("scroll", this.scrollSyncHandler);
  }
  detachScrollSync() {
    if (!this.scrollSyncHandler || this.sectionScrollEls.length !== 2) return;
    const [left, right] = this.sectionScrollEls;
    left.removeEventListener("scroll", this.scrollSyncHandler);
    right.removeEventListener("scroll", this.scrollSyncHandler);
    this.scrollSyncHandler = void 0;
  }
  /**
   * Enables click-and-drag horizontal panning on a diff scroll container
   * (drag-to-scroll), so a long line that overflows the pane can be revealed
   * without hunting for the thin scrollbar. Vertical scrolling stays native.
   * A small movement threshold keeps normal clicks / inline buttons working.
   * Listeners are tied to this.dragAbort so re-renders don't leak them.
   */
  attachDragScroll(scroller) {
    if (!this.dragAbort) this.dragAbort = new AbortController();
    const signal = this.dragAbort.signal;
    const DRAG_THRESHOLD = 4;
    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let hasDragged = false;
    scroller.addEventListener(
      "mousedown",
      (e) => {
        if (e.button !== 0) return;
        isDown = true;
        hasDragged = false;
        startX = e.clientX;
        startScrollLeft = scroller.scrollLeft;
        scroller.classList.add("is-dragging");
      },
      { signal }
    );
    window.addEventListener(
      "mousemove",
      (e) => {
        if (!isDown) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > DRAG_THRESHOLD) hasDragged = true;
        scroller.scrollLeft = startScrollLeft - dx;
      },
      { signal }
    );
    window.addEventListener(
      "mouseup",
      () => {
        if (!isDown) return;
        isDown = false;
        scroller.classList.remove("is-dragging");
      },
      { signal }
    );
    scroller.addEventListener(
      "click",
      (e) => {
        if (hasDragged) {
          e.stopPropagation();
          e.preventDefault();
          hasDragged = false;
        }
      },
      { capture: true, signal }
    );
  }
  updateTitle() {
    const header = this.containerEl.querySelector(".gitee-sync-plus-diff-path");
    if (header) header.setText(this.getDisplayText());
    try {
      this.leaf.updateDisplayText?.();
    } catch {
    }
  }
  async loadDiff() {
    if (this.busy || !this.viewState || !this.diffContentEl) return;
    this.busy = true;
    const l = messages();
    this.diffContentEl.empty();
    this.diffContentEl.setText(l.diffLoading);
    this.updateTitle();
    try {
      const { path, kind } = this.viewState;
      const backend = createBackend(this.plugin.settings);
      let beforeText = "";
      let afterText = "";
      let beforeLabel = l.diffLeftLocal;
      let afterLabel = l.diffRightRemote;
      let localSide = "after";
      switch (kind) {
        case "local-mod": {
          const { data, hash: remoteHash } = await backend.download(path);
          beforeText = this.decodeText(data);
          afterText = await this.readLocalText(path);
          beforeLabel = l.diffLeftRemote;
          afterLabel = l.diffRightLocal;
          localSide = "after";
          if (this.textsAreEffectivelyEqual(beforeText, afterText)) {
            this.renderIdenticalDiff(path, remoteHash, beforeText, afterText, beforeLabel, afterLabel);
            return;
          }
          break;
        }
        case "local-add": {
          afterText = await this.readLocalText(path);
          beforeLabel = l.diffLeftEmpty;
          afterLabel = l.diffRightLocal;
          localSide = "after";
          break;
        }
        case "local-del": {
          const { data } = await backend.download(path);
          beforeText = this.decodeText(data);
          beforeLabel = l.diffLeftRemote;
          afterLabel = l.diffRightEmpty;
          localSide = "after";
          break;
        }
        case "remote-mod": {
          beforeText = await this.readLocalText(path);
          const { data, hash: remoteHash } = await backend.download(path);
          afterText = this.decodeText(data);
          beforeLabel = l.diffLeftLocal;
          afterLabel = l.diffRightRemote;
          localSide = "before";
          if (this.textsAreEffectivelyEqual(beforeText, afterText)) {
            this.renderIdenticalDiff(path, remoteHash, beforeText, afterText, beforeLabel, afterLabel);
            return;
          }
          break;
        }
        case "remote-del": {
          beforeText = await this.readLocalText(path);
          beforeLabel = l.diffLeftLocal;
          afterLabel = l.diffRightEmpty;
          localSide = "before";
          break;
        }
      }
      await this.renderDiff(path, beforeText, afterText, beforeLabel, afterLabel, localSide);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[gitee-sync-plus] diff load failed", e);
      this.diffContentEl?.empty();
      this.diffContentEl?.createEl("p", {
        text: l.diffError(msg),
        cls: "gitee-sync-plus-diff-error"
      });
    } finally {
      this.busy = false;
    }
  }
  async readLocalText(path) {
    const data = await this.app.vault.adapter.readBinary(path);
    return this.decodeText(data);
  }
  decodeText(data) {
    const sample = new Uint8Array(data.slice(0, 1024));
    for (let i = 0; i < sample.length; i++) {
      if (sample[i] === 0) {
        throw new Error(messages().diffBinaryFile);
      }
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  }
  async renderDiff(path, beforeText, afterText, beforeLabel, afterLabel, localSide = "after") {
    if (!this.diffContentEl) return;
    this.diffContentEl.empty();
    const l = messages();
    const header = this.containerEl.querySelector(".gitee-sync-plus-diff-path");
    if (header) header.setText(`${path} \u2014 ${l.diffTitle}`);
    const beforeLines = splitLines(beforeText);
    const afterLines = splitLines(afterText);
    const rows = computeDiffRows(beforeLines, afterLines);
    this.rebuildChunkIndex(rows);
    this.currentBeforeText = beforeText;
    this.currentAfterText = afterText;
    this.lastDiff = { path, beforeText, afterText, beforeLabel, afterLabel };
    this.localSide = localSide;
    this.dragAbort?.abort();
    this.dragAbort = new AbortController();
    this.diffContentEl.removeClass("layout-side-by-side", "layout-vertical");
    this.diffContentEl.addClass(`layout-${this.layout}`);
    this.updateLayoutButton();
    this.sectionScrollEls = [];
    this.detachScrollSync();
    const wrapper = this.diffContentEl.createDiv("gitee-sync-plus-diff-files");
    const token = ++this.renderToken;
    await this.renderSplitPanes(wrapper, rows, beforeLabel, afterLabel, token);
    if (token !== this.renderToken || !this.diffContentEl) return;
    this.diffContentEl.toggleClass("collapse-unchanged", this.collapseUnchanged);
    this.updateCollapseButton();
    this.attachScrollSync();
    if (rows.length > LARGE_FILE_ROWS) {
      new import_obsidian7.Notice(messages().diffLargeFileHint(rows.length));
    }
  }
  /**
   * True when the two texts differ only by line endings (CRLF vs LF) or are
   * exactly equal. The sync engine normalizes CRLF before hashing on the local
   * side, but the remote manifest stores the raw git blob SHA; a file uploaded
   * with CRLF therefore has a different remote hash while being textually
   * identical. Without this guard the diff view would show two identical panes
   * for a file the panel lists as changed.
   */
  textsAreEffectivelyEqual(a, b) {
    return normalizeLineEndings2(a) === normalizeLineEndings2(b);
  }
  /**
   * Renders a friendly placeholder when the local and remote contents are
   * textually identical but the sync state says the file changed. Offers a
   * one-click way to realign the local sync state with the remote hash.
   */
  renderIdenticalDiff(path, remoteHash, beforeText, afterText, beforeLabel, afterLabel) {
    if (!this.diffContentEl) return;
    this.diffContentEl.empty();
    const l = messages();
    const container = this.diffContentEl.createDiv("gitee-sync-plus-diff-identical");
    container.createEl("p", {
      text: l.diffIdenticalHint,
      cls: "gitee-sync-plus-diff-identical-hint"
    });
    const actions = container.createDiv("gitee-sync-plus-diff-identical-actions");
    const syncBtn = actions.createEl("button", {
      text: l.diffMarkSynced,
      cls: "mod-cta"
    });
    const localText = this.localSide === "before" ? beforeText : afterText;
    syncBtn.addEventListener("click", () => void this.markAsSynced(path, localText));
    const showBtn = actions.createEl("button", {
      text: l.diffShowAnyway,
      cls: "gitee-sync-plus-diff-identical-secondary"
    });
    showBtn.addEventListener(
      "click",
      () => void this.renderDiff(path, beforeText, afterText, beforeLabel, afterLabel)
    );
  }
  async markAsSynced(path, localText) {
    const l = messages();
    try {
      const backend = createBackend(this.plugin.settings);
      const normalized = new TextEncoder().encode(normalizeLineEndings2(localText)).buffer;
      const localHash = await backend.hashData(normalized);
      this.plugin.markBaseline(path, localHash);
      await this.plugin.savePluginData();
      new import_obsidian7.Notice(l.diffMarkedAsSynced(path));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new import_obsidian7.Notice(l.diffMarkSyncedFailed(msg), 8e3);
    }
  }
  /**
   * Renders the diff as two independent panes — one for the "before"
   * version, one for the "after" version. Each pane owns its own label,
   * scroll container and [num + content] table, so:
   *  - both version labels are always fully visible (never squeezed by
   *    an over-wide shared table);
   *  - each pane gets its own horizontal scrollbar and drag-to-scroll,
   *    so long lines can be revealed per version (see reference:
   *    ConflictDiffModal uses the same structure);
   *  - vertical scrolling stays ratio-synced via attachScrollSync().
   *
   * Side-by-side vs vertical is purely a CSS flex-direction switch on
   * .gitee-sync-plus-diff-files, driven by the layout-* class set in
   * renderDiff().
   */
  renderSplitPanes(wrapper, rows, beforeLabel, afterLabel, token) {
    const beforeSection = wrapper.createDiv("gitee-sync-plus-diff-section gitee-sync-plus-diff-section-before");
    beforeSection.createDiv("gitee-sync-plus-diff-section-label").setText(beforeLabel);
    const beforeScroll = beforeSection.createDiv("gitee-sync-plus-diff-section-scroll");
    const beforeTable = beforeScroll.createEl("table", { cls: "gitee-sync-plus-diff-section-table" });
    this.sectionScrollEls.push(beforeScroll);
    this.attachDragScroll(beforeScroll);
    const afterSection = wrapper.createDiv("gitee-sync-plus-diff-section gitee-sync-plus-diff-section-after");
    afterSection.createDiv("gitee-sync-plus-diff-section-label").setText(afterLabel);
    const afterScroll = afterSection.createDiv("gitee-sync-plus-diff-section-scroll");
    const afterTable = afterScroll.createEl("table", { cls: "gitee-sync-plus-diff-section-table" });
    this.sectionScrollEls.push(afterScroll);
    this.attachDragScroll(afterScroll);
    const segments = this.buildRowSegments(rows);
    if (rows.length <= BATCH_THRESHOLD) {
      for (const seg of segments) {
        if (token !== this.renderToken) return Promise.resolve();
        this.renderSplitSegment(beforeTable, afterTable, seg, rows);
      }
      return Promise.resolve();
    }
    return this.renderSegmentsBatched(
      token,
      segments,
      (seg) => this.renderSplitSegment(beforeTable, afterTable, seg, rows)
    );
  }
  renderSplitSegment(beforeTable, afterTable, seg, rows) {
    const l = messages();
    const CONTEXT_LINES = 2;
    const len = seg.end - seg.start + 1;
    if (seg.type === "diff" || len <= CONTEXT_LINES * 2) {
      const beforeBody = beforeTable.createEl("tbody");
      const afterBody = afterTable.createEl("tbody");
      for (let i = seg.start; i <= seg.end; i++) {
        this.renderSplitRows(beforeBody, afterBody, rows[i], rows[i].chunkIndex >= 0 ? rows[i].chunkIndex : void 0);
      }
      return;
    }
    const beforeGroup = beforeTable.createEl("tbody", { cls: "gitee-sync-plus-diff-collapsed-body" });
    const afterGroup = afterTable.createEl("tbody", { cls: "gitee-sync-plus-diff-collapsed-body" });
    for (let i = seg.start; i < seg.start + CONTEXT_LINES; i++) {
      this.renderSplitRows(beforeGroup, afterGroup, rows[i], rows[i].chunkIndex >= 0 ? rows[i].chunkIndex : void 0);
    }
    const hiddenCount = len - CONTEXT_LINES * 2;
    const beforePlaceholder = beforeGroup.createEl("tr", {
      cls: "gitee-sync-plus-diff-row gitee-sync-plus-diff-collapsed-placeholder"
    });
    beforePlaceholder.createEl("td", { cls: "gitee-sync-plus-diff-num" }).setText("\u22EF");
    beforePlaceholder.createEl("td", { cls: "gitee-sync-plus-diff-cell" });
    const afterPlaceholder = afterGroup.createEl("tr", {
      cls: "gitee-sync-plus-diff-row gitee-sync-plus-diff-collapsed-placeholder"
    });
    afterPlaceholder.createEl("td", { cls: "gitee-sync-plus-diff-num" }).setText("\u22EF");
    afterPlaceholder.createEl("td", { cls: "gitee-sync-plus-diff-cell" }).setText(l.diffUnchangedLines(hiddenCount));
    const expand = () => {
      if (!beforeGroup.hasAttribute("data-expanded")) {
        beforeGroup.setAttribute("data-expanded", "1");
        const beforeFrag = document.createDocumentFragment();
        const afterFrag = document.createDocumentFragment();
        for (let i = seg.start + CONTEXT_LINES; i <= seg.end - CONTEXT_LINES; i++) {
          const { before, after } = this.buildSplitRows(
            rows[i],
            rows[i].chunkIndex >= 0 ? rows[i].chunkIndex : void 0,
            true
          );
          beforeFrag.appendChild(before);
          afterFrag.appendChild(after);
        }
        beforePlaceholder.after(beforeFrag);
        afterPlaceholder.after(afterFrag);
      }
      beforeGroup.toggleClass("is-expanded", true);
      afterGroup.toggleClass("is-expanded", true);
    };
    beforePlaceholder.addEventListener("click", expand);
    afterPlaceholder.addEventListener("click", expand);
    for (let i = seg.end - CONTEXT_LINES + 1; i <= seg.end; i++) {
      this.renderSplitRows(beforeGroup, afterGroup, rows[i], rows[i].chunkIndex >= 0 ? rows[i].chunkIndex : void 0);
    }
  }
  renderSplitRows(beforeBody, afterBody, row, chunkIndex, collapsible = false) {
    const { before, after } = this.buildSplitRows(row, chunkIndex, collapsible);
    beforeBody.appendChild(before);
    afterBody.appendChild(after);
  }
  /** Builds the before/after row pair (one row per pane table). Native DOM
   * so the rows can be appended into a tbody or a DocumentFragment (lazy
   * expand). Both panes render one single-line row per DiffRow, so the two
   * tables stay vertically aligned. */
  buildSplitRows(row, chunkIndex, collapsible) {
    const l = messages();
    const beforeTr = document.createElement("tr");
    beforeTr.className = collapsible ? `gitee-sync-plus-diff-row gitee-sync-plus-diff-collapsible ${row.oldLine > 0 ? `state-${row.state}` : "state-placeholder"}` : `gitee-sync-plus-diff-row ${row.oldLine > 0 ? `state-${row.state}` : "state-placeholder"}`;
    const beforeNum = document.createElement("td");
    beforeNum.className = "gitee-sync-plus-diff-num";
    beforeNum.textContent = row.oldLine > 0 ? String(row.oldLine) : "";
    const beforeCell = document.createElement("td");
    beforeCell.className = `gitee-sync-plus-diff-cell ${row.oldLine === 0 ? "gitee-sync-plus-diff-empty" : ""}`;
    const beforeText = document.createElement("span");
    beforeText.className = "gitee-sync-plus-diff-cell-text";
    beforeText.textContent = row.oldLine > 0 ? row.oldText : "";
    beforeCell.appendChild(beforeText);
    const afterTr = document.createElement("tr");
    afterTr.className = collapsible ? `gitee-sync-plus-diff-row gitee-sync-plus-diff-collapsible ${row.newLine > 0 ? `state-${row.state}` : "state-placeholder"}` : `gitee-sync-plus-diff-row ${row.newLine > 0 ? `state-${row.state}` : "state-placeholder"}`;
    const afterNum = document.createElement("td");
    afterNum.className = "gitee-sync-plus-diff-num";
    afterNum.textContent = row.newLine > 0 ? String(row.newLine) : "";
    const afterCell = document.createElement("td");
    afterCell.className = `gitee-sync-plus-diff-cell ${row.newLine === 0 ? "gitee-sync-plus-diff-empty" : ""}`;
    const afterText = document.createElement("span");
    afterText.className = "gitee-sync-plus-diff-cell-text";
    afterText.textContent = row.newLine > 0 ? row.newText : "";
    afterCell.appendChild(afterText);
    beforeTr.append(beforeNum, beforeCell);
    afterTr.append(afterNum, afterCell);
    if (chunkIndex !== void 0) {
      const attach = (numCell) => {
        const revertBtn = document.createElement("button");
        revertBtn.textContent = "\u21A9";
        revertBtn.title = l.diffRevertChunk;
        revertBtn.className = "gitee-sync-plus-diff-revert-btn";
        revertBtn.addEventListener("click", (evt) => {
          evt.stopPropagation();
          void this.onRevertChunk(chunkIndex);
        });
        numCell.appendChild(revertBtn);
      };
      if (this.localSide === "before" && row.oldLine > 0) attach(beforeNum);
      if (this.localSide === "after" && row.newLine > 0) attach(afterNum);
    }
    return { before: beforeTr, after: afterTr };
  }
  buildRowSegments(rows) {
    const segments = [];
    let i = 0;
    while (i < rows.length) {
      const start = i;
      const state = rows[i].state;
      if (state === "equal") {
        while (i < rows.length && rows[i].state === "equal") i++;
        segments.push({ type: "equal", start, end: i - 1 });
      } else {
        while (i < rows.length && rows[i].state !== "equal") i++;
        segments.push({ type: "diff", start, end: i - 1 });
      }
    }
    return segments;
  }
  isFirstRowOfChunk(row, rows) {
    const idx = rows.indexOf(row);
    return idx === 0 || rows[idx - 1].chunkIndex !== row.chunkIndex;
  }
  async onRevertChunk(chunkIndex) {
    if (!this.viewState) return;
    const l = messages();
    new RevertConfirmModal(
      this.app,
      l.diffRevertChunkConfirm(this.viewState.path),
      () => void this.revertChunk(chunkIndex)
    ).open();
  }
  async revertChunk(chunkIndex) {
    if (!this.viewState || !this.diffContentEl) return;
    const { path, kind } = this.viewState;
    const l = messages();
    this.diffContentEl.setText(l.diffLoading);
    try {
      const chunkRows = this.chunkRowsIndex.get(chunkIndex) ?? [];
      if (chunkRows.length === 0) return;
      const newText = this.buildTextWithChunkReverted(kind, chunkRows);
      await this.writeLocalText(path, newText);
      new import_obsidian7.Notice(l.diffReverted);
      void this.loadDiff();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[gitee-sync-plus] revert chunk failed", e);
      new import_obsidian7.Notice(l.diffRevertFailed(msg));
    }
  }
  buildTextWithChunkReverted(kind, chunkRows) {
    const localIsAfter = kind.startsWith("local");
    const targetLines = splitLines(localIsAfter ? this.currentAfterText : this.currentBeforeText);
    const sourceLines = splitLines(localIsAfter ? this.currentBeforeText : this.currentAfterText);
    const first = chunkRows[0];
    const last = chunkRows[chunkRows.length - 1];
    const targetStartLine = localIsAfter ? first.newLine : first.oldLine;
    const targetEndLine = localIsAfter ? last.newLine : last.oldLine;
    const sourceStartLine = localIsAfter ? first.oldLine : first.newLine;
    const sourceEndLine = localIsAfter ? last.oldLine : last.newLine;
    const targetStartIdx = targetStartLine > 0 ? targetStartLine - 1 : -1;
    const targetEndIdx = targetEndLine > 0 ? targetEndLine - 1 : -1;
    const sourceStartIdx = sourceStartLine > 0 ? sourceStartLine - 1 : -1;
    const sourceEndIdx = sourceEndLine > 0 ? sourceEndLine - 1 : -1;
    let newLines;
    if (targetStartIdx === -1 && targetLines.length === 0) {
      newLines = sourceStartIdx === -1 ? [] : sourceLines.slice(sourceStartIdx, sourceEndIdx + 1);
    } else {
      const beforeChunk = targetStartIdx >= 0 ? targetLines.slice(0, targetStartIdx) : [];
      const replacement = sourceStartIdx === -1 ? [] : sourceLines.slice(sourceStartIdx, sourceEndIdx + 1);
      const afterChunk = targetEndIdx >= 0 ? targetLines.slice(targetEndIdx + 1) : targetLines.slice();
      newLines = beforeChunk.concat(replacement).concat(afterChunk);
    }
    return newLines.join("\n");
  }
  async writeLocalText(path, text) {
    const encoder = new TextEncoder();
    await this.app.vault.adapter.writeBinary(path, encoder.encode(text).buffer);
  }
  /** Rebuilds the chunkIndex → rows map so reverting a chunk is O(1). */
  rebuildChunkIndex(rows) {
    this.chunkRowsIndex.clear();
    for (const row of rows) {
      if (row.chunkIndex < 0) continue;
      const list = this.chunkRowsIndex.get(row.chunkIndex);
      if (list) list.push(row);
      else this.chunkRowsIndex.set(row.chunkIndex, [row]);
    }
  }
  /** Renders segments one at a time, yielding to the browser between frames
   * so the main thread stays responsive on very large diffs. A stale `token`
   * (from a newer render or view switch) aborts the work cleanly. */
  renderSegmentsBatched(token, segments, render) {
    return new Promise((resolve) => {
      let idx = 0;
      const step = () => {
        if (token !== this.renderToken) {
          resolve();
          return;
        }
        const start = performance.now();
        while (idx < segments.length) {
          render(segments[idx++]);
          if (performance.now() - start > FRAME_BUDGET_MS) break;
        }
        if (idx < segments.length) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }
};
var RevertConfirmModal = class extends import_obsidian7.Modal {
  message;
  onConfirm;
  constructor(app, message, onConfirm) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("p", { text: this.message });
    const buttons = contentEl.createDiv({ cls: "gitee-sync-plus-modal-buttons" });
    buttons.createEl("button", { text: messages().cancel, cls: "mod-cta" }).addEventListener("click", () => this.close());
    buttons.createEl("button", { text: messages().diffRevertChunk, cls: "mod-warning" }).addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
function splitLines(text) {
  if (text === "") return [];
  return text.split(/\r?\n/);
}
function normalizeLineEndings2(text) {
  return text.replace(/\r\n/g, "\n");
}
function computeDiffRows(oldLines, newLines) {
  const rows = [];
  let i = 0;
  let j = 0;
  let oldLine = 1;
  let newLine = 1;
  let chunkIndex = -1;
  let currentChunk = -1;
  const flushChunk = () => {
    currentChunk = -1;
  };
  const pushRow = (row) => {
    if (row.state !== "equal") {
      if (currentChunk === -1) {
        chunkIndex++;
        currentChunk = chunkIndex;
      }
      row.chunkIndex = currentChunk;
    } else {
      flushChunk();
      row.chunkIndex = -1;
    }
    rows.push(row);
  };
  const newIndex = /* @__PURE__ */ new Map();
  for (let idx = 0; idx < newLines.length; idx++) {
    const line = newLines[idx];
    const list = newIndex.get(line);
    if (list) list.push(idx);
    else newIndex.set(line, [idx]);
  }
  const oldIndex = /* @__PURE__ */ new Map();
  for (let idx = 0; idx < oldLines.length; idx++) {
    const line = oldLines[idx];
    const list = oldIndex.get(line);
    if (list) list.push(idx);
    else oldIndex.set(line, [idx]);
  }
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      pushRow({
        oldLine,
        newLine,
        oldText: oldLines[i],
        newText: newLines[j],
        state: "equal",
        chunkIndex: -1
      });
      i++;
      j++;
      oldLine++;
      newLine++;
      continue;
    }
    const candidates = newIndex.get(oldLines[i]);
    let nextMatchNew = -1;
    if (candidates) {
      for (const idx of candidates) {
        if (idx >= j) {
          nextMatchNew = idx;
          break;
        }
      }
    }
    let nextMatchOld = -1;
    if (j < newLines.length) {
      const oldCandidates = oldIndex.get(newLines[j]);
      if (oldCandidates) {
        for (const idx of oldCandidates) {
          if (idx >= i) {
            nextMatchOld = idx;
            break;
          }
        }
      }
    }
    if (nextMatchNew === -1 && nextMatchOld === -1) {
      const oldChunk = oldLines.slice(i);
      const newChunk = newLines.slice(j);
      pushChangeBlock(rows, oldChunk, newChunk, oldLine, newLine, pushRow);
      break;
    }
    if (nextMatchNew !== -1 && (nextMatchOld === -1 || nextMatchNew - j <= nextMatchOld - i)) {
      const inserted = newLines.slice(j, nextMatchNew);
      for (const line of inserted) {
        pushRow({ oldLine: 0, newLine, oldText: "", newText: line, state: "insert", chunkIndex: -1 });
        newLine++;
      }
      j = nextMatchNew;
    } else {
      const deleted = oldLines.slice(i, nextMatchOld);
      for (const line of deleted) {
        pushRow({ oldLine, newLine: 0, oldText: line, newText: "", state: "delete", chunkIndex: -1 });
        oldLine++;
      }
      i = nextMatchOld;
    }
  }
  flushChunk();
  return rows;
}
function pushChangeBlock(rows, oldChunk, newChunk, oldStart, newStart, pushRow) {
  const len = Math.max(oldChunk.length, newChunk.length);
  for (let k = 0; k < len; k++) {
    const oldText = oldChunk[k] ?? "";
    const newText = newChunk[k] ?? "";
    pushRow({
      oldLine: k < oldChunk.length ? oldStart + k : 0,
      newLine: k < newChunk.length ? newStart + k : 0,
      oldText,
      newText,
      state: oldText === newText ? "equal" : "change",
      chunkIndex: -1
    });
  }
}
async function openDiffView(plugin, path, kind) {
  const { workspace } = plugin.app;
  const leaf = workspace.getLeaf("tab");
  await leaf.setViewState({
    type: DIFF_VIEW_TYPE,
    active: true,
    state: { path, kind }
  });
  workspace.revealLeaf(leaf);
}

// src/ui/conflict-resolver.ts
var import_obsidian9 = require("obsidian");

// src/ui/conflict-diff-modal.ts
var import_obsidian8 = require("obsidian");
function decodeText(data) {
  const sample = new Uint8Array(data.slice(0, 1024));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) throw new Error(messages().diffBinaryFile);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(data);
}
var ConflictDiffModal = class extends import_obsidian8.Modal {
  constructor(app, plugin, entry, onResolve) {
    super(app);
    this.plugin = plugin;
    this.entry = entry;
    this.onResolve = onResolve;
  }
  bodyEl;
  layoutBtn;
  collapseBtn;
  applyMergeBtn;
  layout = "side-by-side";
  collapseUnchanged = true;
  rows = [];
  /** Per-row resolution for the line-level merge. Keyed by DiffRow index.
   *  A row not present here falls back to `entry.preferred`. */
  lineChoices = /* @__PURE__ */ new Map();
  /** Line ending used when reassembling merged content (preserves CRLF files). */
  eol = "\n";
  loaded = false;
  contextLines = 2;
  /** Aborts listeners attached by the drag-to-scroll helper so re-renders
   * (layout toggle / collapse) don't leak window-level mouse handlers. */
  dragAbort;
  onOpen() {
    const l = messages();
    const { contentEl, modalEl } = this;
    contentEl.empty();
    contentEl.addClass("gitee-sync-plus-conflict-diff-modal");
    modalEl.addClass("gitee-sync-plus-conflict-diff-frame");
    const header = contentEl.createDiv("gitee-sync-plus-conflict-diff-header");
    header.createSpan({
      text: fileBasename(this.entry.path),
      cls: "gitee-sync-plus-conflict-diff-title"
    });
    const actions = header.createDiv("gitee-sync-plus-conflict-diff-actions");
    this.layoutBtn = actions.createEl("button", {
      cls: "gitee-sync-plus-conflict-diff-btn gitee-sync-plus-conflict-diff-icon-btn",
      title: l.diffLayoutToggle
    });
    this.layoutBtn.addEventListener("click", () => {
      this.layout = this.layout === "side-by-side" ? "vertical" : "side-by-side";
      this.updateLayoutButton();
      this.render();
    });
    this.collapseBtn = actions.createEl("button", {
      cls: "gitee-sync-plus-conflict-diff-btn gitee-sync-plus-conflict-diff-icon-btn",
      title: l.diffCollapseUnchanged
    });
    this.collapseBtn.addEventListener("click", () => {
      this.collapseUnchanged = !this.collapseUnchanged;
      this.updateCollapseButton();
      this.render();
    });
    this.bodyEl = contentEl.createDiv("gitee-sync-plus-conflict-diff-body");
    this.bodyEl.createEl("p", { text: l.diffLoading });
    const footer = contentEl.createDiv("gitee-sync-plus-conflict-diff-footer");
    const left = footer.createDiv("gitee-sync-plus-conflict-diff-footer-left");
    const keepLocal = left.createEl("button", {
      text: l.conflictUseLocal,
      cls: "gitee-sync-plus-conflict-btn gitee-sync-plus-conflict-btn-local"
    });
    keepLocal.addEventListener("click", () => {
      this.setAllChoices("local");
    });
    const useRemote = left.createEl("button", {
      text: l.conflictUseRemote,
      cls: "gitee-sync-plus-conflict-btn gitee-sync-plus-conflict-btn-remote"
    });
    useRemote.addEventListener("click", () => {
      this.setAllChoices("remote");
    });
    const right = footer.createDiv("gitee-sync-plus-conflict-diff-footer-right");
    const applyMerge = right.createEl("button", {
      text: l.conflictApplyMerge,
      cls: "gitee-sync-plus-conflict-btn gitee-sync-plus-conflict-btn-merge mod-cta"
    });
    applyMerge.addEventListener("click", () => {
      this.applyMerge();
    });
    this.applyMergeBtn = applyMerge;
    this.updateApplyMergeBtn();
    this.updateLayoutButton();
    this.updateCollapseButton();
    void this.loadAndRender();
  }
  updateLayoutButton() {
    this.layoutBtn.setText(
      this.layout === "side-by-side" ? "\u21C5" : "\u21C4"
      /* ⇄ */
    );
  }
  updateCollapseButton() {
    this.collapseBtn.setText(
      this.collapseUnchanged ? "\u2263" : "\u2261"
      /* ≡ */
    );
    this.collapseBtn.toggleClass("is-active", this.collapseUnchanged);
  }
  /** Update a per-row choice from a checkbox change event. */
  onCheckboxChange(index, side, checked) {
    if (checked) this.lineChoices.set(index, side);
    else if (this.lineChoices.get(index) === side) this.lineChoices.delete(index);
    this.render();
  }
  /** Count conflicting rows (those that need an explicit choice). */
  conflictRowCount() {
    let total = 0;
    for (const r of this.rows) if (r.state !== "equal") total++;
    return total;
  }
  /** Number of conflicting rows that have been explicitly picked. */
  pickedRowCount() {
    let picked = 0;
    for (let i = 0; i < this.rows.length; i++) {
      if (this.rows[i].state !== "equal" && this.lineChoices.has(i)) picked++;
    }
    return picked;
  }
  /** Batch-set every conflicting row to the given side. Mirrors the per-row
   * accept buttons but applies to the whole file at once; the merge is only
   * finalized when the user clicks "Apply merge". */
  setAllChoices(side) {
    for (let i = 0; i < this.rows.length; i++) {
      if (this.rows[i].state !== "equal") this.lineChoices.set(i, side);
    }
    this.render();
  }
  /** Apply the merge only after every conflicting row is resolved. */
  applyMerge() {
    const total = this.conflictRowCount();
    if (total === 0 || this.pickedRowCount() < total) return;
    this.onResolve({ action: "merge", content: this.assembleMerge() });
    this.close();
  }
  /** Enable "Apply merge" only after every conflicting row is explicitly
   * picked. The label stays constant; the remaining-row count is reported by
   * the footer status line instead of bloating the button. */
  updateApplyMergeBtn() {
    if (!this.applyMergeBtn) return;
    const l = messages();
    const total = this.conflictRowCount();
    const unresolved = total - this.pickedRowCount();
    const ready = total > 0 && unresolved === 0;
    this.applyMergeBtn.disabled = !ready;
    this.applyMergeBtn.toggleClass("is-disabled", !ready);
    this.applyMergeBtn.setText(l.conflictApplyMerge);
  }
  /** Build the merged file content from per-row choices. Untouched rows fall
   *  back to `entry.preferred`; equal rows always keep their text. A choice
   *  pointing at an empty side (e.g. accept-local on an insert) drops the row. */
  assembleMerge() {
    const out = [];
    for (let i = 0; i < this.rows.length; i++) {
      const r = this.rows[i];
      if (r.state === "equal") {
        out.push(r.oldText);
        continue;
      }
      const side = this.lineChoices.get(i) ?? this.entry.preferred;
      if (side === "local") {
        if (r.oldLine > 0) out.push(r.oldText);
      } else {
        if (r.newLine > 0) out.push(r.newText);
      }
    }
    return out.join(this.eol);
  }
  /** Infer the dominant line ending so merged output matches the source file. */
  detectEol(sample) {
    if (!sample) return "\n";
    const crlf = (sample.match(/\r\n/g) ?? []).length;
    const lf = (sample.replace(/\r\n/g, "").match(/\n/g) ?? []).length;
    return crlf > 0 && crlf >= lf ? "\r\n" : "\n";
  }
  async loadAndRender() {
    const l = messages();
    try {
      const { local, remote } = await this.loadText();
      this.eol = this.detectEol(local || remote);
      const localLines = splitLines(local);
      const remoteLines = splitLines(remote);
      this.rows = computeDiffRows(localLines, remoteLines);
      this.loaded = true;
      this.render();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.bodyEl.empty();
      this.bodyEl.createEl("p", {
        text: l.diffError(msg),
        cls: "gitee-sync-plus-diff-error"
      });
    }
  }
  async loadText() {
    const adapter = this.plugin.app.vault.adapter;
    let local = "";
    if (this.entry.loc && await adapter.exists(this.entry.path)) {
      const data = await adapter.readBinary(this.entry.path);
      local = decodeText(data);
    }
    let remote = "";
    if (this.entry.rem) {
      const backend = createBackend(this.plugin.settings);
      const { data } = await backend.download(this.entry.path);
      remote = decodeText(data);
    }
    return { local, remote };
  }
  render() {
    if (!this.loaded) return;
    const l = messages();
    this.bodyEl.empty();
    this.dragAbort?.abort();
    this.dragAbort = new AbortController();
    this.bodyEl.addClass("gitee-sync-plus-diff-content");
    this.bodyEl.removeClass("layout-side-by-side", "layout-vertical");
    this.bodyEl.addClass(this.layout === "side-by-side" ? "layout-side-by-side" : "layout-vertical");
    this.bodyEl.toggleClass("collapse-unchanged", this.collapseUnchanged);
    if (this.layout === "side-by-side") this.renderSideBySide();
    else this.renderVertical();
    this.updateApplyMergeBtn();
  }
  buildSegments() {
    const rows = this.rows;
    const segments = [];
    let i = 0;
    while (i < rows.length) {
      const start = i;
      if (rows[i].state === "equal") {
        while (i < rows.length && rows[i].state === "equal") i++;
        segments.push({ type: "equal", start, end: i - 1 });
      } else {
        while (i < rows.length && rows[i].state !== "equal") i++;
        segments.push({ type: "diff", start, end: i - 1 });
      }
    }
    return segments;
  }
  renderSideBySide() {
    const l = messages();
    const ctx = this.contextLines;
    const wrapper = this.bodyEl.createDiv("gitee-sync-plus-diff-files");
    const localSection = wrapper.createDiv(
      "gitee-sync-plus-diff-section gitee-sync-plus-diff-section-local"
    );
    localSection.createDiv("gitee-sync-plus-diff-section-label").setText(l.diffLeftLocal);
    const localScroll = localSection.createDiv("gitee-sync-plus-diff-section-scroll");
    const localTable = localScroll.createEl("table", {
      cls: "gitee-sync-plus-diff-section-table"
    });
    this.attachDragScroll(localScroll);
    const remoteSection = wrapper.createDiv(
      "gitee-sync-plus-diff-section gitee-sync-plus-diff-section-remote"
    );
    remoteSection.createDiv("gitee-sync-plus-diff-section-label").setText(l.diffRightRemote);
    const remoteScroll = remoteSection.createDiv("gitee-sync-plus-diff-section-scroll");
    const remoteTable = remoteScroll.createEl("table", {
      cls: "gitee-sync-plus-diff-section-table"
    });
    this.attachDragScroll(remoteScroll);
    for (const seg of this.buildSegments()) {
      const len = seg.end - seg.start + 1;
      if (seg.type === "diff" || len <= ctx * 2 || !this.collapseUnchanged) {
        const localBody2 = localTable.createEl("tbody");
        const remoteBody2 = remoteTable.createEl("tbody");
        for (let i = seg.start; i <= seg.end; i++) {
          const { remoteEl, localEl } = this.buildVerticalPair(this.rows[i], false, i);
          localBody2.appendChild(localEl);
          remoteBody2.appendChild(remoteEl);
        }
        continue;
      }
      const localBody = localTable.createEl("tbody", { cls: "gitee-sync-plus-diff-collapsed-body" });
      const remoteBody = remoteTable.createEl("tbody", { cls: "gitee-sync-plus-diff-collapsed-body" });
      for (let i = seg.start; i < seg.start + ctx; i++) {
        const { remoteEl, localEl } = this.buildVerticalPair(this.rows[i], false, i);
        localBody.appendChild(localEl);
        remoteBody.appendChild(remoteEl);
      }
      const hidden = len - ctx * 2;
      const localPh = localBody.createEl("tr", {
        cls: "gitee-sync-plus-diff-row gitee-sync-plus-diff-collapsed-placeholder"
      });
      localPh.createEl("td", { cls: "gitee-sync-plus-diff-num" }).setText("\u22EF");
      localPh.createEl("td", { cls: "gitee-sync-plus-diff-cell" });
      const remotePh = remoteBody.createEl("tr", {
        cls: "gitee-sync-plus-diff-row gitee-sync-plus-diff-collapsed-placeholder"
      });
      remotePh.createEl("td", { cls: "gitee-sync-plus-diff-num" }).setText("\u22EF");
      remotePh.createEl("td", { cls: "gitee-sync-plus-diff-cell" }).setText(l.diffUnchangedLines(hidden));
      const fragLocal = document.createDocumentFragment();
      const fragRemote = document.createDocumentFragment();
      for (let i = seg.start + ctx; i <= seg.end - ctx; i++) {
        const { remoteEl, localEl } = this.buildVerticalPair(this.rows[i], true, i);
        fragLocal.appendChild(localEl);
        fragRemote.appendChild(remoteEl);
      }
      localPh.after(fragLocal);
      remotePh.after(fragRemote);
      const expand = () => {
        localBody.toggleClass("is-expanded", true);
        remoteBody.toggleClass("is-expanded", true);
      };
      localPh.addEventListener("click", expand);
      remotePh.addEventListener("click", expand);
      for (let i = seg.end - ctx + 1; i <= seg.end; i++) {
        const { remoteEl, localEl } = this.buildVerticalPair(this.rows[i], false, i);
        localBody.appendChild(localEl);
        remoteBody.appendChild(remoteEl);
      }
    }
  }
  renderVertical() {
    const l = messages();
    const ctx = this.contextLines;
    const wrapper = this.bodyEl.createDiv(
      "gitee-sync-plus-diff-files gitee-sync-plus-diff-files-vertical"
    );
    const remoteSection = wrapper.createDiv(
      "gitee-sync-plus-diff-section gitee-sync-plus-diff-section-remote"
    );
    remoteSection.createDiv("gitee-sync-plus-diff-section-label").setText(l.diffRightRemote);
    const remoteScroll = remoteSection.createDiv("gitee-sync-plus-diff-section-scroll");
    const remoteTable = remoteScroll.createEl("table", {
      cls: "gitee-sync-plus-diff-section-table"
    });
    this.attachDragScroll(remoteScroll);
    const localSection = wrapper.createDiv(
      "gitee-sync-plus-diff-section gitee-sync-plus-diff-section-local"
    );
    localSection.createDiv("gitee-sync-plus-diff-section-label").setText(l.diffLeftLocal);
    const localScroll = localSection.createDiv("gitee-sync-plus-diff-section-scroll");
    const localTable = localScroll.createEl("table", {
      cls: "gitee-sync-plus-diff-section-table"
    });
    this.attachDragScroll(localScroll);
    for (const seg of this.buildSegments()) {
      const len = seg.end - seg.start + 1;
      if (seg.type === "diff" || len <= ctx * 2 || !this.collapseUnchanged) {
        const remoteBody2 = remoteTable.createEl("tbody");
        const localBody2 = localTable.createEl("tbody");
        for (let i = seg.start; i <= seg.end; i++) {
          this.appendVerticalRows(remoteBody2, localBody2, this.rows[i], false, i);
        }
        continue;
      }
      const remoteBody = remoteTable.createEl("tbody", { cls: "gitee-sync-plus-diff-collapsed-body" });
      const localBody = localTable.createEl("tbody", { cls: "gitee-sync-plus-diff-collapsed-body" });
      for (let i = seg.start; i < seg.start + ctx; i++) {
        this.appendVerticalRows(remoteBody, localBody, this.rows[i], false, i);
      }
      const hidden = len - ctx * 2;
      const remotePh = remoteBody.createEl("tr", {
        cls: "gitee-sync-plus-diff-row gitee-sync-plus-diff-collapsed-placeholder"
      });
      remotePh.createEl("td", { cls: "gitee-sync-plus-diff-num" }).setText("\u22EF");
      remotePh.createEl("td", { cls: "gitee-sync-plus-diff-cell" });
      const localPh = localBody.createEl("tr", {
        cls: "gitee-sync-plus-diff-row gitee-sync-plus-diff-collapsed-placeholder"
      });
      localPh.createEl("td", { cls: "gitee-sync-plus-diff-num" }).setText("\u22EF");
      localPh.createEl("td", { cls: "gitee-sync-plus-diff-cell" }).setText(l.diffUnchangedLines(hidden));
      const fragRemote = document.createDocumentFragment();
      const fragLocal = document.createDocumentFragment();
      for (let i = seg.start + ctx; i <= seg.end - ctx; i++) {
        const { remoteEl, localEl } = this.buildVerticalPair(this.rows[i], true, i);
        fragRemote.appendChild(remoteEl);
        fragLocal.appendChild(localEl);
      }
      remotePh.after(fragRemote);
      localPh.after(fragLocal);
      const expand = () => {
        remoteBody.toggleClass("is-expanded", true);
        localBody.toggleClass("is-expanded", true);
      };
      remotePh.addEventListener("click", expand);
      localPh.addEventListener("click", expand);
      for (let i = seg.end - ctx + 1; i <= seg.end; i++) {
        this.appendVerticalRows(remoteBody, localBody, this.rows[i], false, i);
      }
    }
  }
  appendVerticalRows(remoteBody, localBody, row, collapsible, rowIndex) {
    const { remoteEl, localEl } = this.buildVerticalPair(row, collapsible, rowIndex);
    remoteBody.appendChild(remoteEl);
    localBody.appendChild(localEl);
  }
  buildVerticalPair(row, collapsible, rowIndex) {
    const l = messages();
    const cls = collapsible ? " gitee-sync-plus-diff-collapsible" : "";
    const choice = this.lineChoices.get(rowIndex);
    const remoteTr = document.createElement("tr");
    remoteTr.className = `gitee-sync-plus-diff-row${cls} ${row.newLine > 0 ? `state-${row.state}` : "state-placeholder"}`;
    const remoteNum = document.createElement("td");
    remoteNum.className = "gitee-sync-plus-diff-num";
    const remoteNumText = remoteNum.createEl("span", {
      cls: "gitee-sync-plus-diff-num-text"
    });
    remoteNumText.textContent = row.newLine > 0 ? String(row.newLine) : row.oldLine > 0 ? String(row.oldLine) : "";
    const remoteCell = document.createElement("td");
    remoteCell.className = "gitee-sync-plus-diff-cell" + (row.newLine === 0 ? " gitee-sync-plus-diff-empty" : "");
    const remoteText = document.createElement("span");
    remoteText.className = "gitee-sync-plus-diff-cell-text";
    remoteText.textContent = row.newText;
    remoteCell.appendChild(remoteText);
    remoteTr.append(remoteNum, remoteCell);
    const localTr = document.createElement("tr");
    localTr.className = `gitee-sync-plus-diff-row${cls} ${row.oldLine > 0 ? `state-${row.state}` : "state-placeholder"}`;
    const localNum = document.createElement("td");
    localNum.className = "gitee-sync-plus-diff-num";
    const localNumText = localNum.createEl("span", {
      cls: "gitee-sync-plus-diff-num-text"
    });
    localNumText.textContent = row.oldLine > 0 ? String(row.oldLine) : row.newLine > 0 ? String(row.newLine) : "";
    const localCell = document.createElement("td");
    localCell.className = "gitee-sync-plus-diff-cell" + (row.oldLine === 0 ? " gitee-sync-plus-diff-empty" : "");
    const localText = document.createElement("span");
    localText.className = "gitee-sync-plus-diff-cell-text";
    localText.textContent = row.oldText;
    localCell.appendChild(localText);
    localTr.append(localNum, localCell);
    if (row.state !== "equal") {
      const acceptRemote = remoteNum.createEl("input", {
        type: "checkbox",
        cls: "gitee-sync-plus-diff-accept-checkbox gitee-sync-plus-diff-accept-remote",
        title: l.diffAcceptRemote
      });
      acceptRemote.checked = choice === "remote";
      acceptRemote.addEventListener("change", (evt) => {
        evt.stopPropagation();
        this.onCheckboxChange(rowIndex, "remote", acceptRemote.checked);
      });
      remoteTr.addClass("has-choice");
      const acceptLocal = localNum.createEl("input", {
        type: "checkbox",
        cls: "gitee-sync-plus-diff-accept-checkbox gitee-sync-plus-diff-accept-local",
        title: l.diffAcceptLocal
      });
      acceptLocal.checked = choice === "local";
      acceptLocal.addEventListener("change", (evt) => {
        evt.stopPropagation();
        this.onCheckboxChange(rowIndex, "local", acceptLocal.checked);
      });
      localTr.addClass("has-choice");
      if (choice === "remote") {
        remoteTr.addClass("is-accepted");
        localTr.addClass("is-rejected");
      } else if (choice === "local") {
        localTr.addClass("is-accepted");
        remoteTr.addClass("is-rejected");
      }
    }
    return { remoteEl: remoteTr, localEl: localTr };
  }
  /**
   * Enables click-and-drag horizontal panning on a diff scroll container
   * (drag-to-scroll), so a long line that overflows the pane can be revealed
   * without hunting for the thin scrollbar. Vertical scrolling stays native.
   * A small movement threshold keeps normal clicks / inline buttons working.
   * Listeners are tied to this.dragAbort so re-renders don't leak them.
   */
  attachDragScroll(scroller) {
    if (!this.dragAbort) this.dragAbort = new AbortController();
    const signal = this.dragAbort.signal;
    const DRAG_THRESHOLD = 4;
    let isDown = false;
    let startX = 0;
    let startScrollLeft = 0;
    let hasDragged = false;
    scroller.addEventListener(
      "mousedown",
      (e) => {
        if (e.button !== 0) return;
        isDown = true;
        hasDragged = false;
        startX = e.clientX;
        startScrollLeft = scroller.scrollLeft;
        scroller.classList.add("is-dragging");
      },
      { signal }
    );
    window.addEventListener(
      "mousemove",
      (e) => {
        if (!isDown) return;
        const dx = e.clientX - startX;
        if (Math.abs(dx) > DRAG_THRESHOLD) hasDragged = true;
        scroller.scrollLeft = startScrollLeft - dx;
      },
      { signal }
    );
    window.addEventListener(
      "mouseup",
      () => {
        if (!isDown) return;
        isDown = false;
        scroller.classList.remove("is-dragging");
      },
      { signal }
    );
    scroller.addEventListener(
      "click",
      (e) => {
        if (hasDragged) {
          e.stopPropagation();
          e.preventDefault();
          hasDragged = false;
        }
      },
      { capture: true, signal }
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};
function fileBasename(path) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}

// src/ui/conflict-resolver.ts
function fileBasename2(path) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}
function decodeText2(data) {
  const sample = new Uint8Array(data.slice(0, 1024));
  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) throw new Error(messages().diffBinaryFile);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(data);
}
var ConflictResolverModal = class extends import_obsidian9.Modal {
  constructor(app, plugin, conflicts, onResolve, onCancel) {
    super(app);
    this.plugin = plugin;
    this.conflicts = conflicts;
    this.onResolve = onResolve;
    this.onCancel = onCancel;
  }
  resolutions = /* @__PURE__ */ new Map();
  itemEls = /* @__PURE__ */ new Map();
  resolved = false;
  onOpen() {
    const l = messages();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gitee-sync-plus-conflict-modal");
    contentEl.createEl("h3", { text: l.conflictTitle });
    contentEl.createEl("p", {
      text: l.conflictIntro(this.conflicts.length),
      cls: "gitee-sync-plus-conflict-intro"
    });
    const list = contentEl.createDiv("gitee-sync-plus-conflict-list");
    for (const c of this.conflicts) {
      this.renderItem(list, c);
    }
    this.renderFooter();
  }
  renderItem(parent, c) {
    const l = messages();
    const card = parent.createDiv("gitee-sync-plus-conflict-item");
    card.title = c.path;
    const status = card.createSpan("gitee-sync-plus-conflict-item-status s-pending");
    status.setText("\u25CF");
    card.createSpan({
      text: fileBasename2(c.path),
      cls: "gitee-sync-plus-conflict-item-name"
    });
    card.createSpan({
      text: c.path,
      cls: "gitee-sync-plus-conflict-item-path"
    });
    card.addEventListener("dblclick", () => {
      new ConflictDiffModal(this.app, this.plugin, c, (res) => {
        this.resolve(c.path, res);
        new import_obsidian9.Notice(
          res.action === "local" ? l.conflictResolvedLocal : res.action === "remote" ? l.conflictResolvedRemote : l.conflictResolvedMerge
        );
      }).open();
    });
    this.itemEls.set(c.path, { status });
  }
  openMerge(c) {
    const l = messages();
    new MergeEditorModal(this.app, this.plugin, c, (content) => {
      this.resolve(c.path, { action: "merge", content });
      new import_obsidian9.Notice(l.conflictResolvedMerge);
    }).open();
  }
  resolve(path, resolution) {
    this.resolutions.set(path, resolution);
    this.updateItem(path);
    this.updateFooter();
  }
  updateItem(path) {
    const el = this.itemEls.get(path);
    if (!el) return;
    const l = messages();
    const res = this.resolutions.get(path);
    let icon = "\u25CF";
    let key = "pending";
    if (res?.action === "local") {
      icon = "\u2713";
      key = "local";
    } else if (res?.action === "remote") {
      icon = "\u2713";
      key = "remote";
    } else if (res?.action === "merge") {
      icon = "\u25CF";
      key = "merge";
    }
    el.status.setText(icon);
    el.status.className = `gitee-sync-plus-conflict-item-status s-${key}`;
  }
  renderFooter() {
    const l = messages();
    const footer = this.contentEl.createDiv("gitee-sync-plus-conflict-footer");
    const left = footer.createDiv("gitee-sync-plus-conflict-footer-left");
    const useRemoteAll = left.createEl("button", {
      text: l.conflictUseRemoteAll,
      cls: "gitee-sync-plus-conflict-btn"
    });
    const keepLocalAll = left.createEl("button", {
      text: l.conflictUseLocalAll,
      cls: "gitee-sync-plus-conflict-btn"
    });
    useRemoteAll.addEventListener("click", () => {
      for (const c of this.conflicts) this.resolve(c.path, { action: "remote" });
    });
    keepLocalAll.addEventListener("click", () => {
      for (const c of this.conflicts) this.resolve(c.path, { action: "local" });
    });
    const right = footer.createDiv("gitee-sync-plus-conflict-footer-right");
    this.confirmBtn = right.createEl("button", {
      text: l.conflictConfirmPull,
      cls: "mod-cta"
    });
    this.confirmBtn.addEventListener("click", () => this.confirm());
    this.updateFooter();
  }
  confirmBtn;
  updateFooter() {
    const done = this.resolutions.size;
    const total = this.conflicts.length;
    const allResolved = done >= total;
    this.confirmBtn.disabled = !allResolved;
    this.confirmBtn.toggleClass("is-disabled", !allResolved);
  }
  confirm() {
    if (this.resolutions.size < this.conflicts.length) return;
    this.resolved = true;
    this.close();
    this.onResolve(this.resolutions);
  }
  onClose() {
    this.contentEl.empty();
    if (!this.resolved) this.onCancel();
  }
};
function buildMergeBlocks(rows) {
  const blocks = [];
  let i = 0;
  while (i < rows.length) {
    if (rows[i].state === "equal") {
      const lines = [];
      while (i < rows.length && rows[i].state === "equal") {
        lines.push(rows[i].oldText);
        i++;
      }
      if (lines.length > 0) blocks.push({ type: "equal", lines });
    } else {
      const chunkIndex = rows[i].chunkIndex;
      const localLines = [];
      const remoteLines = [];
      while (i < rows.length && rows[i].chunkIndex === chunkIndex) {
        const r = rows[i];
        if (r.oldLine > 0) localLines.push(r.oldText);
        if (r.newLine > 0) remoteLines.push(r.newText);
        i++;
      }
      blocks.push({
        type: "chunk",
        chunk: { index: chunkIndex, localLines, remoteLines, choice: "local" }
      });
    }
  }
  return blocks;
}
var MergeEditorModal = class extends import_obsidian9.Modal {
  constructor(app, plugin, entry, onMerged) {
    super(app);
    this.plugin = plugin;
    this.entry = entry;
    this.onMerged = onMerged;
  }
  bodyEl;
  resultEl;
  blocks = [];
  onOpen() {
    const l = messages();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gitee-sync-plus-merge-modal");
    const header = contentEl.createDiv("gitee-sync-plus-merge-header");
    header.createSpan({
      text: `${l.mergeTitle} \u2014 ${fileBasename2(this.entry.path)}`,
      cls: "gitee-sync-plus-merge-title"
    });
    const back = header.createEl("button", {
      text: l.mergeBack,
      cls: "gitee-sync-plus-merge-back"
    });
    back.addEventListener("click", () => this.close());
    contentEl.createEl("p", {
      text: l.mergeHint,
      cls: "gitee-sync-plus-merge-hint"
    });
    this.bodyEl = contentEl.createDiv("gitee-sync-plus-merge-body");
    this.bodyEl.createEl("p", { text: l.diffLoading });
    void this.loadAndRender();
  }
  async loadAndRender() {
    const l = messages();
    try {
      const { localText, remoteText } = await this.loadContent();
      this.bodyEl.empty();
      const localLines = splitLines(localText);
      const remoteLines = splitLines(remoteText);
      const rows = computeDiffRows(localLines, remoteLines);
      this.blocks = buildMergeBlocks(rows);
      let chunkSeq = 0;
      for (const b of this.blocks) {
        if (b.type === "equal") {
          this.bodyEl.createDiv({
            text: l.diffUnchangedLines(b.lines.length),
            cls: "gitee-sync-plus-merge-equal"
          });
        } else {
          chunkSeq++;
          this.renderChunk(b.chunk, chunkSeq);
        }
      }
      this.bodyEl.createEl("label", {
        text: l.mergeResult,
        cls: "gitee-sync-plus-merge-result-label"
      });
      this.resultEl = this.bodyEl.createEl("textarea", {
        cls: "gitee-sync-plus-merge-result"
      });
      this.updateResult();
      const footer = this.bodyEl.createDiv("gitee-sync-plus-merge-footer");
      const cancel = footer.createEl("button", {
        text: l.mergeCancel,
        cls: "mod-cancel"
      });
      cancel.addEventListener("click", () => this.close());
      const save = footer.createEl("button", {
        text: l.mergeSave,
        cls: "mod-cta"
      });
      save.addEventListener("click", () => {
        this.onMerged(this.resultEl.value);
        this.close();
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.bodyEl.empty();
      this.bodyEl.createEl("p", {
        text: l.diffError(msg),
        cls: "gitee-sync-plus-diff-error"
      });
    }
  }
  async loadContent() {
    const adapter = this.plugin.app.vault.adapter;
    let localText = "";
    if (this.entry.loc && await adapter.exists(this.entry.path)) {
      const data = await adapter.readBinary(this.entry.path);
      localText = decodeText2(data);
    }
    let remoteText = "";
    if (this.entry.rem) {
      const backend = createBackend(this.plugin.settings);
      const { data } = await backend.download(this.entry.path);
      remoteText = decodeText2(data);
    }
    return { localText, remoteText };
  }
  renderChunk(chunk, seq) {
    const l = messages();
    const card = this.bodyEl.createDiv("gitee-sync-plus-merge-chunk");
    card.createDiv({
      text: l.mergeChunk(seq),
      cls: "gitee-sync-plus-merge-chunk-label"
    });
    const sides = card.createDiv("gitee-sync-plus-merge-chunk-sides");
    const localBox = sides.createDiv(
      "gitee-sync-plus-merge-side gitee-sync-plus-merge-side-local"
    );
    localBox.createDiv({
      text: l.mergeLocalVersion,
      cls: "gitee-sync-plus-merge-side-title"
    });
    localBox.createEl("pre", {
      text: chunk.localLines.join("\n") || "\uFF08\u7A7A\uFF09",
      cls: "gitee-sync-plus-merge-side-pre"
    });
    const remoteBox = sides.createDiv(
      "gitee-sync-plus-merge-side gitee-sync-plus-merge-side-remote"
    );
    remoteBox.createDiv({
      text: l.mergeRemoteVersion,
      cls: "gitee-sync-plus-merge-side-title"
    });
    remoteBox.createEl("pre", {
      text: chunk.remoteLines.join("\n") || "\uFF08\u7A7A\uFF09",
      cls: "gitee-sync-plus-merge-side-pre"
    });
    const btns = card.createDiv("gitee-sync-plus-merge-chunk-btns");
    const useLocal = btns.createEl("button", {
      text: l.mergeUseLocal,
      cls: "gitee-sync-plus-merge-choice"
    });
    const useRemote = btns.createEl("button", {
      text: l.mergeUseRemote,
      cls: "gitee-sync-plus-merge-choice"
    });
    const keepBoth = btns.createEl("button", {
      text: l.mergeBoth,
      cls: "gitee-sync-plus-merge-choice"
    });
    const setChoice = (choice) => {
      chunk.choice = choice;
      useLocal.toggleClass("is-selected", choice === "local");
      useRemote.toggleClass("is-selected", choice === "remote");
      keepBoth.toggleClass("is-selected", choice === "both");
      this.updateResult();
    };
    useLocal.addEventListener("click", () => setChoice("local"));
    useRemote.addEventListener("click", () => setChoice("remote"));
    keepBoth.addEventListener("click", () => setChoice("both"));
    setChoice(chunk.choice);
  }
  assemble() {
    const out = [];
    for (const b of this.blocks) {
      if (b.type === "equal") {
        out.push(...b.lines ?? []);
      } else if (b.chunk) {
        if (b.chunk.choice === "local") out.push(...b.chunk.localLines);
        else if (b.chunk.choice === "remote") out.push(...b.chunk.remoteLines);
        else out.push(...b.chunk.localLines, ...b.chunk.remoteLines);
      }
    }
    return out.join("\n");
  }
  updateResult() {
    if (this.resultEl) this.resultEl.value = this.assemble();
  }
  onClose() {
    this.contentEl.empty();
  }
};

// src/ui/git-panel-view.ts
var GIT_PANEL_VIEW_TYPE = "gitee-sync-plus-git-panel";
function fileBasename3(path) {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] || path;
}
var ConfirmModal = class extends import_obsidian10.Modal {
  title;
  message;
  confirmLabel;
  onConfirm;
  constructor(app, title, message, confirmLabel, onConfirm) {
    super(app);
    this.title = title;
    this.message = message;
    this.confirmLabel = confirmLabel;
    this.onConfirm = onConfirm;
  }
  onOpen() {
    const l = messages();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.title });
    contentEl.createEl("p", { text: this.message });
    const row = contentEl.createDiv("modal-button-row");
    row.createEl("button", { text: l.cancel, cls: "mod-cancel" }).addEventListener("click", () => this.close());
    const ok = row.createEl("button", { text: this.confirmLabel, cls: "mod-warning" });
    ok.addEventListener("click", () => {
      this.close();
      this.onConfirm();
    });
  }
  onClose() {
    this.contentEl.empty();
  }
};
var GitPanelView = class extends import_obsidian10.ItemView {
  plugin;
  engine;
  plan = null;
  messageEl;
  listEl;
  statusEl;
  infoEl;
  busy = false;
  refreshTimer = null;
  /** Paths selected for the next commit. Reset when a commit succeeds. */
  staged = /* @__PURE__ */ new Set();
  /** Group keys that are currently collapsed in the Git panel. */
  collapsedGroups = /* @__PURE__ */ new Set();
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.engine = new SyncEngine(plugin);
  }
  getViewType() {
    return GIT_PANEL_VIEW_TYPE;
  }
  getDisplayText() {
    return messages().panelTitle;
  }
  getIcon() {
    return "git-pull-request";
  }
  async onOpen() {
    const l = messages();
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("gitee-sync-plus-panel");
    const header = container.createDiv("gitee-sync-plus-panel-header");
    header.createSpan({ text: l.panelTitle, cls: "gitee-sync-plus-panel-title" });
    this.statusEl = header.createSpan({ cls: "gitee-sync-plus-panel-status" });
    this.infoEl = container.createDiv("gitee-sync-plus-panel-info");
    this.infoEl.setText(this.targetLabel());
    const msgWrap = container.createDiv("gitee-sync-plus-panel-message");
    this.messageEl = msgWrap.createEl("textarea", {
      placeholder: l.panelMessagePlaceholder,
      cls: "gitee-sync-plus-panel-textarea"
    });
    container.createDiv({ text: l.panelCommitHint, cls: "gitee-sync-plus-panel-hint" });
    this.messageEl.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        void this.onCommit();
      }
    });
    const btnWrapper = container.createDiv("gitee-sync-plus-panel-buttons");
    btnWrapper.createEl("button", { text: l.panelCommit, cls: "mod-cta gitee-sync-plus-panel-btn" }).addEventListener("click", () => void this.onCommit());
    const secondaryRow = btnWrapper.createDiv("gitee-sync-plus-panel-button-row");
    secondaryRow.createEl("button", { text: l.panelPull, cls: "gitee-sync-plus-panel-btn" }).addEventListener("click", () => void this.onPull());
    secondaryRow.createEl("button", { text: l.panelRefresh, cls: "gitee-sync-plus-panel-btn" }).addEventListener("click", () => void this.refresh(true));
    this.listEl = container.createDiv("gitee-sync-plus-panel-list");
    this.registerEvent(this.app.vault.on("modify", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("create", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("delete", () => this.scheduleRefresh()));
    this.registerEvent(this.app.vault.on("rename", () => this.scheduleRefresh()));
    await this.refresh(true);
  }
  async onClose() {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }
  targetLabel() {
    const s = this.plugin.settings;
    if (s.backend === "github") {
      return `github: ${s.githubOwner}/${s.githubRepo}@${s.githubBranch}`;
    }
    if (s.backend === "gitlab") {
      return `gitlab: ${s.gitlabOwner}/${s.gitlabRepo}@${s.gitlabBranch}`;
    }
    if (s.backend === "gitea") {
      return `gitea: ${s.giteaOwner}/${s.giteaRepo}@${s.giteaBranch}`;
    }
    return `gitee: ${s.giteeOwner}/${s.giteeRepo}@${s.giteeBranch}`;
  }
  /** Called by the plugin when settings change. Updates the repo/branch label and refreshes. */
  onSettingsChanged() {
    if (this.infoEl) this.infoEl.setText(this.targetLabel());
    void this.refresh(true);
  }
  setStatus(text) {
    if (this.statusEl) this.statusEl.setText(text);
  }
  scheduleRefresh() {
    if (this.refreshTimer !== null) window.clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, 3e3);
  }
  async refresh(force = false) {
    if (this.busy) return;
    if (!force && !this.containerEl.isShown()) return;
    this.busy = true;
    const l = messages();
    try {
      if (force) this.engine.invalidateCaches();
      this.setStatus(l.panelStatusComputing);
      this.plan = await this.engine.computePlan({ forPanel: true });
      this.renderList();
      this.setStatus(l.panelStatusChanges(this.changeCount()));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setStatus(l.panelStatusError(msg));
    } finally {
      this.busy = false;
    }
  }
  changeCount() {
    const p = this.plan;
    if (!p) return 0;
    return p.pulls.length + p.pushes.length + p.localDeletes.length + p.remoteDeletes.length + p.conflictEntries.length;
  }
  renderList() {
    const l = messages();
    const p = this.plan;
    this.listEl.empty();
    if (!p) return;
    const localChangePaths = /* @__PURE__ */ new Set([
      ...p.pushes.map((x) => x.path),
      ...p.remoteDeletes.map((x) => x.path)
    ]);
    for (const path of this.staged) {
      if (!localChangePaths.has(path)) this.staged.delete(path);
    }
    const makeLocalItem = (x, kind, tag) => ({
      path: x.path,
      tag,
      kind,
      discardable: true,
      group: "local"
    });
    const unstagedItems = [
      ...p.pushes.filter((x) => !this.staged.has(x.path)).map((x) => makeLocalItem(x, x.rem ? "mod" : "add", x.rem ? l.statusTagModified : l.statusTagAdded)),
      ...p.remoteDeletes.filter((x) => !this.staged.has(x.path)).map((x) => makeLocalItem(x, "del", l.statusTagDeleted))
    ];
    const stagedItems = [
      ...p.pushes.filter((x) => this.staged.has(x.path)).map((x) => makeLocalItem(x, x.rem ? "mod" : "add", x.rem ? l.statusTagModified : l.statusTagAdded)),
      ...p.remoteDeletes.filter((x) => this.staged.has(x.path)).map((x) => makeLocalItem(x, "del", l.statusTagDeleted))
    ];
    const remoteItems = [
      ...p.pulls.map((x) => ({
        path: x.path,
        tag: l.statusTagRemote,
        kind: "remote",
        discardable: false,
        group: "remote"
      })),
      ...p.localDeletes.map((x) => ({
        path: x.path,
        tag: l.statusTagDeleted,
        kind: "del",
        discardable: false,
        group: "remote"
      })),
      ...p.conflictEntries.map((x) => ({
        path: x.path,
        tag: l.statusTagConflict,
        kind: "conflict",
        discardable: false,
        group: "remote"
      }))
    ];
    this.renderGroup("staged", l.panelGroupStaged, stagedItems, "staged", {
      unstageAll: () => this.onUnstageAll()
    });
    this.renderGroup("unstaged", l.panelGroupUnstaged, unstagedItems, "unstaged", {
      stageAll: () => this.onStageAll(),
      discardAll: () => this.onDiscardAll()
    });
    this.renderGroup("remote", l.panelGroupRemote, remoteItems);
  }
  renderGroup(groupKey, title, items, mode, actions) {
    const l = messages();
    const group = this.listEl.createDiv("gitee-sync-plus-panel-group");
    const isCollapsed = this.collapsedGroups.has(groupKey);
    if (isCollapsed) group.addClass("is-collapsed");
    const header = group.createDiv("gitee-sync-plus-panel-group-header");
    const headerLeft = header.createDiv("gitee-sync-plus-panel-group-header-left");
    const collapseBtn = headerLeft.createEl("button", {
      cls: "clickable-icon gitee-sync-plus-panel-icon-btn gitee-sync-plus-panel-collapse-btn",
      title: isCollapsed ? l.panelExpandGroup : l.panelCollapseGroup
    });
    (0, import_obsidian10.setIcon)(collapseBtn, isCollapsed ? "chevron-right" : "chevron-down");
    collapseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleGroupCollapse(groupKey);
    });
    headerLeft.createSpan({
      text: `${title} (${items.length})`,
      cls: "gitee-sync-plus-panel-group-title"
    });
    header.addEventListener("click", (e) => {
      const target = e.target;
      if (target.closest(".gitee-sync-plus-panel-group-actions")) return;
      this.toggleGroupCollapse(groupKey);
    });
    const headerBtns = header.createDiv("gitee-sync-plus-panel-group-actions");
    if (actions?.discardAll) {
      const btn = headerBtns.createEl("button", {
        text: "\u21A9",
        cls: "clickable-icon gitee-sync-plus-panel-icon-btn",
        title: l.panelDiscardAll
      });
      btn.addEventListener("click", actions.discardAll);
    }
    if (actions?.stageAll) {
      const btn = headerBtns.createEl("button", {
        text: "+",
        cls: "clickable-icon gitee-sync-plus-panel-icon-btn",
        title: l.panelStageAllHint
      });
      btn.addEventListener("click", actions.stageAll);
    }
    if (actions?.unstageAll) {
      const btn = headerBtns.createEl("button", {
        text: "-",
        cls: "clickable-icon gitee-sync-plus-panel-icon-btn",
        title: l.panelUnstageAllHint
      });
      btn.addEventListener("click", actions.unstageAll);
    }
    if (items.length === 0) {
      if (!isCollapsed) {
        group.createDiv({
          text: l.panelGroupEmpty,
          cls: "gitee-sync-plus-panel-group-empty"
        });
      }
      return;
    }
    if (isCollapsed) return;
    for (const item of items) {
      const row = group.createDiv("gitee-sync-plus-panel-item");
      row.createSpan({
        text: item.tag,
        cls: `gitee-sync-plus-panel-item-status s-${item.kind}`
      });
      const pathEl = row.createSpan({
        text: fileBasename3(item.path),
        cls: "gitee-sync-plus-panel-item-path"
      });
      (0, import_obsidian10.setTooltip)(pathEl, item.path, { placement: "top" });
      const viewBtn = row.createEl("button", {
        cls: "clickable-icon gitee-sync-plus-panel-icon-btn gitee-sync-plus-panel-item-action",
        title: l.panelViewDiff
      });
      (0, import_obsidian10.setIcon)(viewBtn, "file-text");
      viewBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.openDiff(item);
      });
      if (item.discardable) {
        const btn = row.createEl("button", {
          text: "\u21A9",
          cls: "clickable-icon gitee-sync-plus-panel-icon-btn gitee-sync-plus-panel-item-action",
          title: l.panelDiscard
        });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.onDiscard(item.path);
        });
      }
      if (mode === "unstaged") {
        const btn = row.createEl("button", {
          text: "+",
          cls: "clickable-icon gitee-sync-plus-panel-icon-btn gitee-sync-plus-panel-item-action gitee-sync-plus-panel-stage-btn",
          title: l.panelStage
        });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleStage(item.path, true);
        });
      } else if (mode === "staged") {
        const btn = row.createEl("button", {
          text: "-",
          cls: "clickable-icon gitee-sync-plus-panel-icon-btn gitee-sync-plus-panel-item-action gitee-sync-plus-panel-stage-btn",
          title: l.panelUnstage
        });
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          this.toggleStage(item.path, false);
        });
      }
    }
  }
  toggleGroupCollapse(groupKey) {
    if (this.collapsedGroups.has(groupKey)) {
      this.collapsedGroups.delete(groupKey);
    } else {
      this.collapsedGroups.add(groupKey);
    }
    this.renderList();
  }
  openDiff(item) {
    const kind = this.mapKind(item);
    void openDiffView(this.plugin, item.path, kind);
  }
  mapKind(item) {
    if (item.group === "local") {
      if (item.kind === "add") return "local-add";
      if (item.kind === "del") return "local-del";
      return "local-mod";
    }
    if (item.kind === "del") return "remote-del";
    return "remote-mod";
  }
  onDiscard(path) {
    const l = messages();
    new ConfirmModal(
      this.app,
      l.panelDiscardConfirmTitle,
      l.panelDiscardConfirm(path),
      l.panelDiscard,
      () => void this.doDiscard([path])
    ).open();
  }
  onDiscardAll() {
    const l = messages();
    if (!this.plan) return;
    const paths = [
      ...this.plan.pushes.filter((x) => !this.staged.has(x.path)).map((x) => x.path),
      ...this.plan.remoteDeletes.filter((x) => !this.staged.has(x.path)).map((x) => x.path)
    ];
    if (paths.length === 0) return;
    new ConfirmModal(
      this.app,
      l.panelDiscardConfirmTitle,
      l.panelDiscardAllConfirm(paths.length),
      l.panelDiscard,
      () => void this.doDiscard(paths)
    ).open();
  }
  toggleStage(path, checked) {
    if (checked) this.staged.add(path);
    else this.staged.delete(path);
    this.renderList();
  }
  onStageAll() {
    if (!this.plan) return;
    for (const p of this.plan.pushes) this.staged.add(p.path);
    for (const d of this.plan.remoteDeletes) this.staged.add(d.path);
    this.renderList();
  }
  onUnstageAll() {
    this.staged.clear();
    this.renderList();
  }
  async doDiscard(paths) {
    if (this.busy || !this.plan) return;
    this.busy = true;
    try {
      const n = await this.engine.discardChanges(this.plan, paths);
      new import_obsidian10.Notice(messages().panelDiscarded(n));
      await this.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new import_obsidian10.Notice(messages().panelDiscardFailed(msg), 8e3);
    } finally {
      this.busy = false;
    }
  }
  async onCommit() {
    if (this.busy) return;
    this.busy = true;
    const l = messages();
    this.setStatus(l.panelStatusWorking);
    try {
      const msg = this.messageEl.value.trim() || void 0;
      if (this.staged.size === 0) {
        new import_obsidian10.Notice(l.panelNothingStaged, 4e3);
        return;
      }
      const pending = this.staged.size;
      this.setStatus(l.panelStatusCommitCount(0, pending));
      const summary = await this.engine.pushLocal(msg, new Set(this.staged));
      this.setStatus(l.panelStatusCommitCount(summary.pushed, 0));
      this.staged.clear();
      this.messageEl.value = "";
      this.plugin.announceSummary(summary);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setStatus(l.panelStatusError(msg));
      new import_obsidian10.Notice(l.syncFailed(msg), 8e3);
    } finally {
      this.busy = false;
    }
    await this.refresh();
  }
  async onPull() {
    if (this.busy) return;
    this.busy = true;
    const l = messages();
    this.setStatus(l.panelStatusWorking);
    try {
      const plan = await this.engine.computePlan();
      if (plan.conflictEntries.length > 0) {
        new ConflictResolverModal(
          this.app,
          this.plugin,
          plan.conflictEntries,
          (resolutions) => void this.runPullWithResolutions(resolutions),
          () => void this.endPullBusy()
        ).open();
        return;
      }
      await this.runPullWithResolutions(void 0);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setStatus(l.panelStatusError(msg));
      new import_obsidian10.Notice(l.syncFailed(msg), 8e3);
      void this.endPullBusy();
    }
  }
  /** Runs the pull (with optional manual conflict resolutions) and refreshes. */
  async runPullWithResolutions(resolutions) {
    const l = messages();
    try {
      const summary = await this.engine.pullRemote(resolutions);
      this.plugin.announceSummary(summary);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setStatus(l.panelStatusError(msg));
      new import_obsidian10.Notice(l.syncFailed(msg), 8e3);
    } finally {
      await this.endPullBusy();
    }
  }
  /** Releases the busy lock and refreshes the panel (shared by both paths). */
  async endPullBusy() {
    this.busy = false;
    await this.refresh();
  }
};

// src/settings/settings-tab.ts
function hostCfg(host) {
  switch (host) {
    case "gitee":
      return {
        ownerKey: "giteeOwner",
        repoKey: "giteeRepo",
        branchKey: "giteeBranch",
        tokenKey: "giteeToken",
        profileKey: "giteeTokenProfile",
        ownerLabel: "settingsGiteeOwner",
        defaultBranch: "master",
        missingSettings: "missingGiteeSettings",
        testToken: testGiteeToken,
        fetchBranches: fetchGiteeBranches
      };
    case "github":
      return {
        ownerKey: "githubOwner",
        repoKey: "githubRepo",
        branchKey: "githubBranch",
        tokenKey: "githubToken",
        profileKey: "githubTokenProfile",
        ownerLabel: "settingsGithubOwner",
        defaultBranch: "main",
        missingSettings: "missingGithubSettings",
        testToken: testGithubToken,
        fetchBranches: fetchGithubBranches
      };
    case "gitlab":
      return {
        ownerKey: "gitlabOwner",
        repoKey: "gitlabRepo",
        branchKey: "gitlabBranch",
        tokenKey: "gitlabToken",
        profileKey: "gitlabTokenProfile",
        ownerLabel: "settingsGitlabOwner",
        defaultBranch: "main",
        missingSettings: "missingGitlabSettings",
        testToken: testGitLabToken,
        fetchBranches: fetchGitLabBranches
      };
    case "gitea":
      return {
        ownerKey: "giteaOwner",
        repoKey: "giteaRepo",
        branchKey: "giteaBranch",
        tokenKey: "giteaToken",
        profileKey: "giteaTokenProfile",
        ownerLabel: "settingsGiteaOwner",
        defaultBranch: "main",
        missingSettings: "missingGiteaSettings",
        testToken: testGiteaToken,
        fetchBranches: fetchGiteaBranches
      };
  }
}
var branchCache = /* @__PURE__ */ new Map();
var CACHE_TTL = 5 * 60 * 1e3;
function getCacheKey(host, owner, repo) {
  return `${host}:${owner}/${repo}`;
}
function getCachedBranches(host, owner, repo) {
  const key = getCacheKey(host, owner, repo);
  const cached = branchCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.branches;
  }
  return null;
}
function setCachedBranches(host, owner, repo, branches) {
  const key = getCacheKey(host, owner, repo);
  branchCache.set(key, { branches, timestamp: Date.now() });
}
function clearBranchCache(host, owner, repo) {
  const key = getCacheKey(host, owner, repo);
  branchCache.delete(key);
}
var DEFAULT_SETTINGS = {
  backend: "gitee",
  giteeOwner: "",
  giteeRepo: "",
  giteeBranch: "master",
  giteeToken: "",
  giteeTokenProfile: "",
  githubOwner: "",
  githubRepo: "",
  githubBranch: "main",
  githubToken: "",
  githubTokenProfile: "",
  gitlabOwner: "",
  gitlabRepo: "",
  gitlabBranch: "main",
  gitlabToken: "",
  gitlabTokenProfile: "",
  gitlabUrl: DEFAULT_GITLAB_URL,
  giteaOwner: "",
  giteaRepo: "",
  giteaBranch: "main",
  giteaToken: "",
  giteaTokenProfile: "",
  giteaUrl: DEFAULT_GITEA_URL,
  autoSyncMinutes: 0,
  syncOnStart: false,
  debugLog: false,
  commitMode: "per-file",
  mergeStrategy: "mtime",
  showSyncRibbon: true,
  showPanelRibbon: false
};
var SyncSettingTab = class extends import_obsidian11.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.tokenManager = plugin.tokenManager;
  }
  branchWidgets = /* @__PURE__ */ new Map();
  tokenManager;
  async display() {
    const { containerEl } = this;
    containerEl.empty();
    this.branchWidgets.clear();
    const l = messages();
    const s = this.plugin.settings;
    const save = () => this.plugin.savePluginData();
    const gitignoreContent = await this.plugin.gitIgnoreManager.readFullContent();
    await this.plugin.migrateTokensToKeychain();
    const hasKeychain = !!this.app.secretStorage;
    this.createSectionHeader(containerEl, l.sectionRepo);
    new import_obsidian11.Setting(containerEl).setName(l.settingsBackend).setDesc(l.settingsBackendDesc).addDropdown(
      (d) => d.addOption("gitee", l.optionGitee).addOption("github", l.optionGithub).addOption("gitlab", l.optionGitlab).addOption("gitea", l.optionGitea).setValue(s.backend).onChange(async (v) => {
        s.backend = v;
        await save();
        this.display();
      })
    );
    if (s.backend === "gitee") {
      this.renderRepoSection("gitee", l.settingsGiteeToken, l.settingsGiteeTokenDesc);
    } else if (s.backend === "github") {
      this.renderRepoSection("github", l.settingsGithubToken, l.settingsGithubTokenDesc);
    } else if (s.backend === "gitlab") {
      this.renderRepoSection("gitlab", l.settingsGitlabToken, l.settingsGitlabTokenDesc);
      new import_obsidian11.Setting(containerEl).setName(l.settingsGitlabUrl).setDesc(l.settingsGitlabUrlDesc).addText(
        (t) => t.setPlaceholder(DEFAULT_GITLAB_URL).setValue(s.gitlabUrl).onChange(async (v) => {
          s.gitlabUrl = v.trim() || DEFAULT_GITLAB_URL;
          await save();
          void this.refreshBranchDropdown("gitlab");
        })
      );
    } else {
      this.renderRepoSection("gitea", l.settingsGiteaToken, l.settingsGiteaTokenDesc);
      new import_obsidian11.Setting(containerEl).setName(l.settingsGiteaUrl).setDesc(l.settingsGiteaUrlDesc).addText(
        (t) => t.setPlaceholder(DEFAULT_GITEA_URL).setValue(s.giteaUrl).onChange(async (v) => {
          s.giteaUrl = v.trim() || DEFAULT_GITEA_URL;
          await save();
          void this.refreshBranchDropdown("gitea");
        })
      );
    }
    this.createSectionHeader(containerEl, l.sectionAutoSync);
    new import_obsidian11.Setting(containerEl).setName(l.settingsShowSyncRibbon).setDesc(l.settingsShowSyncRibbonDesc).addToggle(
      (t) => t.setValue(s.showSyncRibbon).onChange(async (v) => {
        s.showSyncRibbon = v;
        await save();
        this.plugin.updateRibbonIcons();
      })
    );
    new import_obsidian11.Setting(containerEl).setName(l.settingsSyncOnStart).setDesc(l.settingsSyncOnStartDesc).addToggle(
      (t) => t.setValue(s.syncOnStart).onChange(async (v) => {
        s.syncOnStart = v;
        await save();
      })
    );
    new import_obsidian11.Setting(containerEl).setName(l.settingsAutoSync).setDesc(l.settingsAutoSyncDesc).addText((t) => {
      t.setValue(String(s.autoSyncMinutes)).onChange(async (v) => {
        const n = Number(v);
        s.autoSyncMinutes = Number.isFinite(n) && n > 0 ? n : 0;
        await save();
        this.plugin.setupAutoSync();
      });
      t.inputEl.type = "number";
      t.inputEl.min = "0";
      t.inputEl.step = "1";
      t.inputEl.inputMode = "numeric";
    });
    new import_obsidian11.Setting(containerEl).setName(l.settingsMergeStrategy).setDesc(l.settingsMergeStrategyDesc).addDropdown(
      (d) => d.addOption("mtime", l.optionMergeMtime).addOption("remote", l.optionMergeRemote).addOption("local", l.optionMergeLocal).setValue(s.mergeStrategy).onChange(async (v) => {
        s.mergeStrategy = v;
        await save();
      })
    );
    new import_obsidian11.Setting(containerEl).setName(l.settingsCommitMode).setDesc(l.settingsCommitModeDesc).addDropdown(
      (d) => d.addOption("per-file", l.optionPerFile).addOption("batch", l.optionBatch).setValue(s.commitMode).onChange(async (v) => {
        s.commitMode = v;
        await save();
      })
    );
    this.createSectionHeader(containerEl, l.sectionAdvanced);
    new import_obsidian11.Setting(containerEl).setName(l.settingsShowPanelRibbon).setDesc(l.settingsShowPanelRibbonDesc).addToggle(
      (t) => t.setValue(s.showPanelRibbon).onChange(async (v) => {
        s.showPanelRibbon = v;
        await save();
        this.plugin.updateRibbonIcons();
      })
    );
    new import_obsidian11.Setting(containerEl).setName(l.settingsDebugLog).setDesc(l.settingsDebugLogDesc).addToggle(
      (t) => t.setValue(s.debugLog).onChange(async (v) => {
        s.debugLog = v;
        await save();
      })
    );
    new import_obsidian11.Setting(containerEl).setName(l.settingsResetSyncState).setDesc(l.settingsResetSyncStateDesc).addButton(
      (b) => b.setButtonText(l.buttonReset).setWarning().onClick(async () => {
        new ConfirmModal(
          this.app,
          l.resetConfirmTitle,
          l.resetConfirmDesc,
          l.buttonReset,
          async () => {
            await this.plugin.resetSyncState();
          }
        ).open();
      })
    );
    new import_obsidian11.Setting(containerEl).setName(l.settingsExcludeFolders).setDesc(l.settingsExcludeFoldersDesc).addTextArea((t) => {
      t.setValue(gitignoreContent);
      t.inputEl.rows = 12;
      t.inputEl.addClass("gitee-sync-plus-gitignore-editor");
      t.inputEl.addEventListener("blur", async () => {
        await this.plugin.gitIgnoreManager.writeFullContent(t.getValue());
      });
    }).settingEl.addClass("gitee-sync-plus-gitignore-setting");
  }
  renderRepoSection(host, tokenName, tokenDesc) {
    const l = messages();
    const cfg = hostCfg(host);
    const s = this.plugin.settings;
    const save = () => this.plugin.savePluginData();
    this.renderTokenSetting(host, tokenName, tokenDesc);
    new import_obsidian11.Setting(this.containerEl).setName(l[cfg.ownerLabel]).setDesc(l.settingsOwnerDesc).addText(
      (t) => t.setPlaceholder("your-name").setValue(s[cfg.ownerKey]).onChange(async (v) => {
        s[cfg.ownerKey] = v.trim();
        await save();
        void this.refreshBranchDropdown(host);
      })
    );
    new import_obsidian11.Setting(this.containerEl).setName(l.settingsRepo).setDesc(l.settingsRepoDesc).addText(
      (t) => t.setPlaceholder("obsidian-vault").setValue(s[cfg.repoKey]).onChange(async (v) => {
        s[cfg.repoKey] = v.trim();
        await save();
        void this.refreshBranchDropdown(host);
      })
    );
    void this.renderBranchSetting(host, (v) => {
      s[cfg.branchKey] = v;
    });
  }
  renderTokenSetting(host, name, desc) {
    const l = messages();
    const cfg = hostCfg(host);
    const setting = new import_obsidian11.Setting(this.containerEl).setName(name).setDesc(desc);
    const activeKey = this.tokenManager.getActiveKey(host);
    setting.addButton(
      (b) => b.setButtonText(l.selectToken).setTooltip(activeKey || l.selectToken).onClick(() => {
        new TokenSelectModal(this.app, this.plugin, host, () => this.display()).open();
      })
    );
    setting.addButton(
      (b) => b.setButtonText(l.testToken).setCta().onClick(async () => {
        const key = this.tokenManager.getActiveKey(host);
        if (!key) {
          new import_obsidian11.Notice(l.tokenNoTokenSelected);
          return;
        }
        const token = await this.tokenManager.getToken(key);
        if (!token) {
          new import_obsidian11.Notice(l.tokenNoTokenSelected);
          return;
        }
        const s = this.plugin.settings;
        const owner = s[cfg.ownerKey];
        const repo = s[cfg.repoKey];
        const gitlabUrl = host === "gitlab" ? s.gitlabUrl : host === "gitea" ? s.giteaUrl : void 0;
        const branch = s[cfg.branchKey];
        if (!owner || !repo) {
          new import_obsidian11.Notice(l[cfg.missingSettings]);
          return;
        }
        b.setDisabled(true);
        try {
          await cfg.testToken(owner, repo, token, gitlabUrl, branch);
          new import_obsidian11.Notice(l.tokenTestSuccess);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          new import_obsidian11.Notice(l.tokenTestFailed(msg), 8e3);
        } finally {
          b.setDisabled(false);
        }
      })
    );
  }
  createSectionHeader(containerEl, title) {
    const header = containerEl.createDiv({ cls: "setting-item" });
    header.addClass("gitee-sync-plus-section-header");
    const nameEl = header.createDiv({ cls: "setting-item-name" });
    nameEl.setText(title);
    const descEl = header.createDiv({ cls: "setting-item-description" });
  }
  async renderBranchSetting(host, setBranch) {
    const l = messages();
    const cfg = hostCfg(host);
    const s = this.plugin.settings;
    const save = () => this.plugin.savePluginData();
    const owner = s[cfg.ownerKey];
    const repo = s[cfg.repoKey];
    const token = s[cfg.tokenKey];
    const currentBranch = s[cfg.branchKey];
    const defaultBranch = cfg.defaultBranch;
    const value = currentBranch || defaultBranch;
    let dropdownComponent;
    let isLoading = false;
    const setting = new import_obsidian11.Setting(this.containerEl).setName(l.settingsBranch);
    setting.addDropdown((d) => {
      dropdownComponent = d;
      d.addOption(value, value);
      d.setValue(value);
      d.onChange(async (v) => {
        setBranch(v);
        await save();
      });
    });
    this.branchWidgets.set(host, { setting, dropdown: dropdownComponent, host });
    setting.addButton(
      (b) => b.setIcon("refresh-cw").setTooltip(l.refreshBranches).onClick(async () => {
        if (isLoading || !owner || !repo || !token) return;
        isLoading = true;
        b.setDisabled(true);
        try {
          clearBranchCache(host, owner, repo);
          const gitlabUrl = host === "gitlab" ? s.gitlabUrl : host === "gitea" ? s.giteaUrl : void 0;
          const branches = await cfg.fetchBranches(owner, repo, token, gitlabUrl);
          setCachedBranches(host, owner, repo, branches);
          const currentVal = dropdownComponent.getValue();
          dropdownComponent.selectEl.empty();
          for (const branch of branches) {
            dropdownComponent.addOption(branch, branch);
          }
          if (branches.includes(currentVal)) {
            dropdownComponent.setValue(currentVal);
          } else if (branches.length > 0) {
            dropdownComponent.setValue(branches[0]);
            setBranch(branches[0]);
            await save();
          }
          setting.setDesc("");
        } catch (err) {
          setting.setDesc(l.settingsBranchLoadFailed);
        } finally {
          isLoading = false;
          b.setDisabled(false);
        }
      })
    );
    if (owner && repo && token) {
      const cached = getCachedBranches(host, owner, repo);
      if (cached) {
        const currentVal = dropdownComponent.getValue();
        dropdownComponent.selectEl.empty();
        for (const branch of cached) {
          dropdownComponent.addOption(branch, branch);
        }
        if (cached.includes(currentVal)) {
          dropdownComponent.setValue(currentVal);
        } else if (cached.length > 0) {
          dropdownComponent.setValue(cached[0]);
          setBranch(cached[0]);
          await save();
        }
      }
    } else {
      setting.setDesc(l.settingsBranchNeedInfo);
    }
  }
  /**
   * Re-fetches branches for the given host using the CURRENT settings
   * (owner/repo/token) and refreshes the dropdown options in place. Called
   * from the owner/repo onChange handlers instead of the full this.display()
   * re-render so the user does not lose focus on every keystroke.
   */
  async refreshBranchDropdown(host) {
    const widget = this.branchWidgets.get(host);
    if (!widget) return;
    const cfg = hostCfg(host);
    const s = this.plugin.settings;
    const owner = s[cfg.ownerKey];
    const repo = s[cfg.repoKey];
    const token = s[cfg.tokenKey];
    if (!owner || !repo || !token) return;
    try {
      const gitlabUrl = host === "gitlab" ? s.gitlabUrl : host === "gitea" ? s.giteaUrl : void 0;
      clearBranchCache(host, owner, repo);
      const branches = await cfg.fetchBranches(owner, repo, token, gitlabUrl);
      setCachedBranches(host, owner, repo, branches);
      const currentVal = widget.dropdown.getValue();
      widget.dropdown.selectEl.empty();
      for (const branch of branches) {
        widget.dropdown.addOption(branch, branch);
      }
      if (branches.includes(currentVal)) {
        widget.dropdown.setValue(currentVal);
      } else if (branches.length > 0) {
        widget.dropdown.setValue(branches[0]);
        s[cfg.branchKey] = branches[0];
        await this.plugin.savePluginData();
      }
      widget.setting.setDesc("");
    } catch {
      widget.setting.setDesc(messages().settingsBranchLoadFailed);
    }
  }
};

// src/utils/token-manager.ts
var LEGACY_SECRET_GITEE = "gitee-sync-plus-gitee";
var LEGACY_SECRET_GITHUB = "gitee-sync-plus-github";
async function listSecretIds(ss) {
  try {
    const result = ss.listSecrets();
    return await Promise.resolve(result) ?? [];
  } catch {
    return [];
  }
}
async function getSecret(ss, id) {
  try {
    const value = ss.getSecret(id);
    return await Promise.resolve(value) ?? null;
  } catch {
    return null;
  }
}
async function setSecret(ss, id, secret) {
  await Promise.resolve(ss.setSecret(id, secret));
}
var TokenManager = class {
  constructor(plugin) {
    this.plugin = plugin;
  }
  get ss() {
    return this.plugin.app.secretStorage;
  }
  /** List every secret ID currently stored in Obsidian's keychain. */
  async listSecrets() {
    const ss = this.ss;
    if (!ss) return [];
    return listSecretIds(ss);
  }
  /** Read the secret value for a given key. */
  async getToken(key) {
    const ss = this.ss;
    if (!ss) return null;
    return getSecret(ss, key);
  }
  /** Write or overwrite a secret value under the given key. */
  async setToken(key, value) {
    const ss = this.ss;
    if (!ss) throw new Error("secretStorage unavailable");
    await setSecret(ss, key, value);
  }
  /**
   * Clear a secret. Obsidian's SecretStorage does not expose deleteSecret,
   * so we overwrite the value with an empty string.
   */
  async deleteToken(key) {
    const ss = this.ss;
    if (!ss) return;
    try {
      await setSecret(ss, key, "");
    } catch {
    }
  }
  /** Get the currently selected secret key for a host. */
  getActiveKey(host) {
    const s = this.plugin.settings;
    if (host === "gitee") return s.giteeTokenProfile;
    if (host === "github") return s.githubTokenProfile;
    if (host === "gitea") return s.giteaTokenProfile;
    return s.gitlabTokenProfile;
  }
  /** Set which secret key is active for a host. */
  async setActiveKey(host, key) {
    const s = this.plugin.settings;
    if (host === "gitee") {
      s.giteeTokenProfile = key ?? "";
    } else if (host === "github") {
      s.githubTokenProfile = key ?? "";
    } else if (host === "gitea") {
      s.giteaTokenProfile = key ?? "";
    } else {
      s.gitlabTokenProfile = key ?? "";
    }
    await this.refreshInMemoryToken(host);
    await this.plugin.savePluginData();
  }
  /** Refresh the in-memory token from the active key. */
  async refreshInMemoryToken(host) {
    const key = this.getActiveKey(host);
    const token = key ? await this.getToken(key) : null;
    const s = this.plugin.settings;
    if (host === "gitee") {
      s.giteeToken = token ?? "";
    } else if (host === "github") {
      s.githubToken = token ?? "";
    } else if (host === "gitea") {
      s.giteaToken = token ?? "";
    } else {
      s.gitlabToken = token ?? "";
    }
  }
  /**
   * One-shot migration from the legacy single-token settings to the new
   * keychain-first model. If data.json still contains a plaintext token and
   * no active key is selected, the token is written under the legacy keychain
   * key and that key becomes the active selection.
   * @returns true if at least one token was migrated.
   *
   * GitLab never used a legacy secret (it shipped after this migration), so
   * only Gitee and GitHub are handled here.
   */
  async migrateLegacyTokens() {
    const ss = this.ss;
    if (!ss) return false;
    const migrate = async (host, settingKey, profileKey, legacyKey) => {
      const token = this.plugin.settings[settingKey];
      if (token && !this.plugin.settings[profileKey]) {
        await setSecret(ss, legacyKey, token);
        this.plugin.settings[profileKey] = legacyKey;
        dirty = true;
      }
    };
    let dirty = false;
    await migrate("gitee", "giteeToken", "giteeTokenProfile", LEGACY_SECRET_GITEE);
    await migrate("github", "githubToken", "githubTokenProfile", LEGACY_SECRET_GITHUB);
    if (dirty) {
      await this.plugin.savePluginData();
    }
    return dirty;
  }
};

// src/main.ts
var LOCAL_SYNC_STATE_KEY = "gitee-sync-plus-sync-state-v1";
function remoteKeyOf(s) {
  const map = s;
  const owner = map[`${s.backend}Owner`] ?? "";
  const repo = map[`${s.backend}Repo`] ?? "";
  const branch = map[`${s.backend}Branch`] ?? "";
  return `${s.backend}:${owner}/${repo}@${branch}`;
}
function migrateSyncState(raw, s) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const values = Object.values(raw);
  const flat = values.length > 0 && values.every((v) => typeof v === "string");
  if (flat) {
    return { [remoteKeyOf(s)]: raw };
  }
  return raw;
}
var CloudSyncPlugin = class extends import_obsidian12.Plugin {
  settings = { ...DEFAULT_SETTINGS };
  syncState = {};
  hashCache = {};
  gitIgnoreManager;
  tokenManager;
  statusBar;
  syncing = false;
  autoSyncTimer = null;
  /** Ribbon icon references so they can be dynamically shown/hidden. */
  syncRibbonIcon;
  panelRibbonIcon;
  async onload() {
    this.tokenManager = new TokenManager(this);
    await this.loadPluginData();
    await this.tokenManager.migrateLegacyTokens();
    const l = messages();
    this.gitIgnoreManager = new GitIgnoreManager(this.app.vault);
    await this.gitIgnoreManager.ensureExists();
    await this.migrateLegacyExclusions();
    await this.gitIgnoreManager.load();
    setDiffPluginInstance(this);
    this.addSettingTab(new SyncSettingTab(this.app, this));
    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass("mod-clickable");
    this.statusBar.setAttribute("aria-label", l.clickToSync);
    this.statusBar.addEventListener("click", () => void this.runSync());
    this.setStatus(l.statusIdle);
    this.addCommand({
      id: "sync-now",
      name: l.commandSyncNow,
      callback: () => void this.runSync()
    });
    this.addCommand({
      id: "sync-preview",
      name: l.commandPreview,
      callback: () => void this.runPreview()
    });
    if (this.settings.showSyncRibbon) {
      this.syncRibbonIcon = this.addRibbonIcon("refresh-cw", l.ribbonSync, () => void this.runSync());
    }
    this.registerView(GIT_PANEL_VIEW_TYPE, (leaf) => new GitPanelView(leaf, this));
    this.registerView(DIFF_VIEW_TYPE, (leaf) => new DiffView(leaf));
    if (this.settings.showPanelRibbon) {
      this.panelRibbonIcon = this.addRibbonIcon("git-pull-request-arrow", l.panelRibbon, () => void this.activateGitPanel());
    }
    this.addCommand({
      id: "open-git-panel",
      name: l.panelOpenCommand,
      callback: () => void this.activateGitPanel()
    });
    this.addCommand({
      id: "reset-sync-state",
      name: l.commandResetSyncState,
      callback: () => void this.resetSyncState()
    });
    this.setupAutoSync();
    if (this.settings.syncOnStart) {
      this.app.workspace.onLayoutReady(() => void this.runSync(true));
    }
  }
  onunload() {
    this.clearAutoSync();
  }
  /** Migrates the legacy "Excluded folders" setting into .gitignore and clears it. */
  async migrateLegacyExclusions() {
    const legacy = this.settings.excludeFolders?.trim();
    if (legacy) {
      await this.gitIgnoreManager.writeManagedFolders(legacy);
      this.settings.excludeFolders = "";
      await this.savePluginData();
    }
  }
  setupAutoSync() {
    this.clearAutoSync();
    const minutes = this.settings.autoSyncMinutes;
    if (minutes > 0) {
      this.autoSyncTimer = window.setInterval(
        () => void this.runSync(true),
        minutes * 60 * 1e3
      );
      this.registerInterval(this.autoSyncTimer);
    }
  }
  clearAutoSync() {
    if (this.autoSyncTimer !== null) {
      window.clearInterval(this.autoSyncTimer);
      this.autoSyncTimer = null;
    }
  }
  /** Show or hide ribbon icons based on current settings. Called when settings change. */
  updateRibbonIcons() {
    const l = messages();
    if (this.settings.showSyncRibbon && !this.syncRibbonIcon) {
      this.syncRibbonIcon = this.addRibbonIcon("refresh-cw", l.ribbonSync, () => void this.runSync());
    } else if (!this.settings.showSyncRibbon && this.syncRibbonIcon) {
      this.syncRibbonIcon.remove();
      this.syncRibbonIcon = void 0;
    }
    if (this.settings.showPanelRibbon && !this.panelRibbonIcon) {
      this.panelRibbonIcon = this.addRibbonIcon("git-pull-request-arrow", l.panelRibbon, () => void this.activateGitPanel());
    } else if (!this.settings.showPanelRibbon && this.panelRibbonIcon) {
      this.panelRibbonIcon.remove();
      this.panelRibbonIcon = void 0;
    }
  }
  async runSync(silent = false) {
    const l = messages();
    if (this.syncing) {
      if (!silent) new import_obsidian12.Notice(l.syncInProgress);
      return;
    }
    this.syncing = true;
    this.setStatus(l.statusRunning);
    try {
      const summary = await new SyncEngine(this).run();
      this.setStatus(l.statusComplete(formatTime()));
      const changed = summary.pushed + summary.pulled + summary.deletedLocal + summary.deletedRemote;
      if (!silent || changed > 0) {
        new import_obsidian12.Notice(this.formatSummary(summary));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setStatus(l.statusFailed);
      new import_obsidian12.Notice(l.syncFailed(msg), 8e3);
      console.error("[gitee-sync-plus]", e);
    } finally {
      this.syncing = false;
    }
  }
  async runPreview() {
    const l = messages();
    if (this.syncing) {
      new import_obsidian12.Notice(l.previewWhileSyncing);
      return;
    }
    try {
      const { plan, report } = await new SyncEngine(this).preview();
      await this.appendLog(report);
      new import_obsidian12.Notice(
        l.previewComplete(
          plan.pulls.length,
          plan.pushes.length,
          plan.localDeletes.length,
          plan.remoteDeletes.length,
          LOG_FILE
        )
      );
      await this.app.workspace.openLinkText(LOG_FILE, "", true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      new import_obsidian12.Notice(l.previewFailed(msg), 8e3);
      await this.appendLog(l.previewFailedLog(formatDateTime(), msg));
    }
  }
  /** Opens (or focuses) the Git panel in the right sidebar. */
  async activateGitPanel() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(GIT_PANEL_VIEW_TYPE)[0];
    if (!leaf) {
      const sideLeaf = workspace.getRightLeaf(false) ?? workspace.getRightLeaf(true);
      if (!sideLeaf) return;
      leaf = sideLeaf;
      await leaf.setViewState({ type: GIT_PANEL_VIEW_TYPE, active: true });
    }
    workspace.revealLeaf(leaf);
  }
  /** Shows a Notice summarizing a sync result (used by the Git panel). */
  announceSummary(s) {
    new import_obsidian12.Notice(this.formatSummary(s));
  }
  /** Appends to the diagnostic note (which is itself excluded from sync). */
  async appendLog(text) {
    const adapter = this.app.vault.adapter;
    if (!await adapter.exists(LOG_FILE)) {
      await adapter.write(LOG_FILE, messages().diagnosticLogTitle);
    }
    await adapter.append(LOG_FILE, text);
  }
  formatSummary(s) {
    const l = messages();
    const parts = [];
    if (s.pushed) parts.push(l.summaryUpload(s.pushed));
    if (s.pulled) parts.push(l.summaryDownload(s.pulled));
    if (s.deletedRemote) parts.push(l.summaryDeleteRemote(s.deletedRemote));
    if (s.deletedLocal) parts.push(l.summaryDeleteLocal(s.deletedLocal));
    if (s.conflicts) parts.push(l.summaryConflict(s.conflicts));
    return parts.length ? l.summaryComplete(parts.join(", ")) : l.summaryNoChanges;
  }
  setStatus(text) {
    this.statusBar.setText(text);
  }
  async loadPluginData() {
    const data = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...data?.settings };
    if (this.settings.backend !== "gitee" && this.settings.backend !== "github" && this.settings.backend !== "gitlab" && this.settings.backend !== "gitea") {
      this.settings.backend = "gitee";
    }
    this.syncState = migrateSyncState(this.app.loadLocalStorage(LOCAL_SYNC_STATE_KEY), this.settings) ?? {};
    this.hashCache = data?.hashCache ?? {};
    await this.tokenManager.refreshInMemoryToken("gitee");
    await this.tokenManager.refreshInMemoryToken("github");
    await this.tokenManager.refreshInMemoryToken("gitlab");
    await this.tokenManager.refreshInMemoryToken("gitea");
  }
  /**
   * Persist plugin settings. When the Obsidian keychain is available, the
   * in-memory token is kept out of data.json so the vault sync never carries
   * the real value. On mobile / pre-1.11.4 Obsidian without secretStorage,
   * the token is persisted in data.json as a fallback.
   */
  async savePluginData() {
    this.app.saveLocalStorage(LOCAL_SYNC_STATE_KEY, this.syncState);
    const ss = this.app.secretStorage;
    const persist = {
      ...this.settings,
      // When the keychain is available, blank the on-disk token so the
      // vault sync cannot leak it. The in-memory value stays intact.
      giteeToken: ss ? "" : this.settings.giteeToken,
      githubToken: ss ? "" : this.settings.githubToken,
      gitlabToken: ss ? "" : this.settings.gitlabToken,
      giteaToken: ss ? "" : this.settings.giteaToken
    };
    const data = { settings: persist, hashCache: this.hashCache };
    await this.saveData(data);
    this.notifyGitPanelsOfSettingsChange();
  }
  /** Key identifying the currently configured remote destination. */
  currentRemoteKey() {
    return remoteKeyOf(this.settings);
  }
  /** The three-way baseline (path→hash) for the currently configured remote. */
  get baseline() {
    return this.syncState[this.currentRemoteKey()] ?? {};
  }
  set baseline(map) {
    this.syncState[this.currentRemoteKey()] = map;
  }
  /** Records a single path's baseline hash for the current remote (used by the diff view's "mark as synced"). */
  markBaseline(path, hash) {
    const key = this.currentRemoteKey();
    if (!this.syncState[key]) this.syncState[key] = {};
    this.syncState[key][path] = hash;
  }
  /** Clears the baseline for the CURRENT remote only, so the next sync treats it
   * as a fresh destination and uploads everything locally (full push). Other
   * remotes' baselines are preserved. */
  async resetSyncState() {
    this.syncState[this.currentRemoteKey()] = {};
    await this.savePluginData();
    new import_obsidian12.Notice(messages().syncStateReset);
  }
  /**
   * One-shot helper that moves any plaintext token still living in data.json
   * into the Obsidian keychain under the legacy key names. Safe to call
   * repeatedly: if the keychain is missing or there is nothing to migrate,
   * this is a no-op.
   */
  async migrateTokensToKeychain() {
    return this.tokenManager.migrateLegacyTokens();
  }
  /** Notify all open Git panels that settings have changed so they update their target label and refresh. */
  notifyGitPanelsOfSettingsChange() {
    for (const leaf of this.app.workspace.getLeavesOfType(GIT_PANEL_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof GitPanelView) {
        view.onSettingsChanged();
      }
    }
  }
};

/* nosourcemap */