/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ([
/* 0 */,
/* 1 */
/***/ ((module) => {

module.exports = require("vscode");

/***/ }),
/* 2 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
const vscode = __webpack_require__(1);
const parseDiff = __webpack_require__(3);
const path = __webpack_require__(4);
const utils_1 = __webpack_require__(5);
class GitApi {
    constructor() {
        try {
            const gitExtension = vscode.extensions.getExtension("vscode.git");
            if (gitExtension == undefined)
                throw new Error();
            this._vscExtension = gitExtension;
        }
        catch (error) {
            console.log(error);
        }
    }
    /************
     *  Public  *
     ************/
    static get Instance() {
        return this._instance || (this._instance = new this());
    }
    async activateGit() {
        try {
            if (!this._vscExtension.isActive)
                await this._vscExtension.activate();
            this._vscGitExtension = this._vscExtension.exports;
            this._vscGitApi = this._vscGitExtension.getAPI(1);
            return true;
        }
        catch (error) {
            console.log(error);
            return false;
        }
    }
    async parseDiff(config) {
        const configExists = config !== undefined;
        const includeUntracked = !configExists ||
            (configExists &&
                (config.includeUntracked === undefined ||
                    config.includeUntracked === true));
        const cleanAddChange = !configExists ||
            (configExists &&
                (config.cleanAddChange === undefined ||
                    config.cleanAddChange === true));
        const parsedDiff = await this.diffToObject();
        const results = [];
        // Include changes from `git diff`
        if (parsedDiff) {
            parsedDiff.forEach((file, i) => {
                const parsedChangedFile = {
                    changes: file.chunks.flatMap((chunk) => {
                        return chunk.changes.map((change) => {
                            if (this.isParseDiffChangeAdd(change)) {
                                return {
                                    line: change.ln,
                                    content: cleanAddChange
                                        ? change.content
                                            .replace(/^\+/g, "")
                                            .replace(/^( |\t)*/g, "")
                                        : change.content,
                                    type: "add",
                                };
                            }
                            else if (this.isParseDiffChangeDelete(change)) {
                                return {
                                    line: change.ln,
                                    content: change.content,
                                    type: "del",
                                };
                            }
                            else {
                                return {
                                    line: change.ln1,
                                    content: change.content,
                                    type: "normal",
                                };
                            }
                        });
                    }),
                    // @NOTE: extension blocks cases where `git diff` cannot be parsed by parse-diff
                    filePath: file.from,
                };
                results.push(parsedChangedFile);
            });
        }
        // Also include untracked files (included by default)
        if (includeUntracked) {
            const untrackedChanges = await this.parseUntrackedFilesInWorkspace();
            results.push(...untrackedChanges);
        }
        return results;
    }
    /*************
     *  Private  *
     *************/
    getWorkspaceMainRepository() {
        const mainRepo = this._vscGitApi.getRepository(
        // @TODO: [roadmap] consider multiple workspaces
        vscode.workspace.workspaceFolders[0].uri);
        return mainRepo;
    }
    async diffToObject() {
        const repository = this.getWorkspaceMainRepository();
        if (repository) {
            const result = parseDiff(await repository.diff());
            return result;
        }
        return undefined;
    }
    // For untracked files.
    async parseUntrackedFilesInWorkspace() {
        try {
            const result = [];
            // @TODO: [roadmap] consider multiple workspaces
            let workspacePath = vscode.workspace.workspaceFolders[0].uri.path;
            workspacePath = workspacePath.replace(/^\//g, "");
            // Exec command.
            const commandResult = await (0, utils_1.asyncExec)(`git -C ${workspacePath} ls-files -o --exclude-standard`);
            // Get untracked files paths from command result string.
            const filePaths = commandResult
                .trim()
                .split("\n")
                .map((filename) => path.join(workspacePath, filename).replace(/\\/g, "/"));
            // Prepare for getting file contents.
            const contentGetters = [];
            filePaths.forEach((path) => {
                const relativeFilePath = path
                    .replace(workspacePath, "")
                    .replace(/^\//g, "");
                // Prepare Promises that will retrieve  file contents.
                contentGetters.push(new Promise(async (resolve) => {
                    try {
                        const textDocument = await vscode.workspace.openTextDocument(path);
                        const fileContent = textDocument.getText();
                        const fileLines = fileContent.split("\n");
                        resolve({
                            relativeFilePath,
                            fileLines,
                        });
                    }
                    catch (error) {
                        // Terminate silently upon encountering non-text (binary) files.
                        resolve(undefined);
                    }
                }));
            });
            // Get files contents.
            const filesAndContent = await Promise.all(contentGetters);
            // Format to expected out format.
            filesAndContent.forEach((fileContents) => {
                if (fileContents) {
                    const { fileLines, relativeFilePath } = fileContents;
                    result.push({
                        filePath: relativeFilePath,
                        changes: fileLines.map((line, i) => ({
                            content: line,
                            line: i,
                            type: "add",
                        })),
                    });
                }
            });
            return result;
        }
        catch (error) {
            throw error;
        }
    }
    isParseDiffChangeNormal(change) {
        return change.type === "normal";
    }
    isParseDiffChangeAdd(change) {
        return change.type === "add";
    }
    isParseDiffChangeDelete(change) {
        return change.type === "del";
    }
}
exports["default"] = GitApi;


/***/ }),
/* 3 */
/***/ ((module) => {

function _createForOfIteratorHelper(o,allowArrayLike){var it=typeof Symbol!=="undefined"&&o[Symbol.iterator]||o["@@iterator"];if(!it){if(Array.isArray(o)||(it=_unsupportedIterableToArray(o))||allowArrayLike&&o&&typeof o.length==="number"){if(it)o=it;var i=0;var F=function F(){};return{s:F,n:function n(){if(i>=o.length)return{done:true};return{done:false,value:o[i++]}},e:function e(_e2){throw _e2},f:F}}throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}var normalCompletion=true,didErr=false,err;return{s:function s(){it=it.call(o)},n:function n(){var step=it.next();normalCompletion=step.done;return step},e:function e(_e3){didErr=true;err=_e3},f:function f(){try{if(!normalCompletion&&it["return"]!=null)it["return"]()}finally{if(didErr)throw err}}}}function _defineProperty(obj,key,value){if(key in obj){Object.defineProperty(obj,key,{value:value,enumerable:true,configurable:true,writable:true})}else{obj[key]=value}return obj}function _slicedToArray(arr,i){return _arrayWithHoles(arr)||_iterableToArrayLimit(arr,i)||_unsupportedIterableToArray(arr,i)||_nonIterableRest()}function _nonIterableRest(){throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.")}function _unsupportedIterableToArray(o,minLen){if(!o)return;if(typeof o==="string")return _arrayLikeToArray(o,minLen);var n=Object.prototype.toString.call(o).slice(8,-1);if(n==="Object"&&o.constructor)n=o.constructor.name;if(n==="Map"||n==="Set")return Array.from(o);if(n==="Arguments"||/^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n))return _arrayLikeToArray(o,minLen)}function _arrayLikeToArray(arr,len){if(len==null||len>arr.length)len=arr.length;for(var i=0,arr2=new Array(len);i<len;i++){arr2[i]=arr[i]}return arr2}function _iterableToArrayLimit(arr,i){var _i=arr==null?null:typeof Symbol!=="undefined"&&arr[Symbol.iterator]||arr["@@iterator"];if(_i==null)return;var _arr=[];var _n=true;var _d=false;var _s,_e;try{for(_i=_i.call(arr);!(_n=(_s=_i.next()).done);_n=true){_arr.push(_s.value);if(i&&_arr.length===i)break}}catch(err){_d=true;_e=err}finally{try{if(!_n&&_i["return"]!=null)_i["return"]()}finally{if(_d)throw _e}}return _arr}function _arrayWithHoles(arr){if(Array.isArray(arr))return arr}module.exports=function(input){if(!input)return[];if(typeof input!=="string"||input.match(/^\s+$/))return[];var lines=input.split("\n");if(lines.length===0)return[];var files=[];var currentFile=null;var currentChunk=null;var deletedLineCounter=0;var addedLineCounter=0;var currentFileChanges=null;var normal=function normal(line){var _currentChunk;(_currentChunk=currentChunk)===null||_currentChunk===void 0?void 0:_currentChunk.changes.push({type:"normal",normal:true,ln1:deletedLineCounter++,ln2:addedLineCounter++,content:line});currentFileChanges.oldLines--;currentFileChanges.newLines--};var start=function start(line){var _parseFiles;var _ref=(_parseFiles=parseFiles(line))!==null&&_parseFiles!==void 0?_parseFiles:[],_ref2=_slicedToArray(_ref,2),fromFileName=_ref2[0],toFileName=_ref2[1];currentFile={chunks:[],deletions:0,additions:0,from:fromFileName,to:toFileName};files.push(currentFile)};var restart=function restart(){if(!currentFile||currentFile.chunks.length)start()};var newFile=function newFile(){restart();currentFile["new"]=true;currentFile.from="/dev/null"};var deletedFile=function deletedFile(){restart();currentFile.deleted=true;currentFile.to="/dev/null"};var index=function index(line){restart();currentFile.index=line.split(" ").slice(1)};var fromFile=function fromFile(line){restart();currentFile.from=parseOldOrNewFile(line)};var toFile=function toFile(line){restart();currentFile.to=parseOldOrNewFile(line)};var toNumOfLines=function toNumOfLines(number){return+(number||1)};var chunk=function chunk(line,match){if(!currentFile)return;var _match$slice=match.slice(1),_match$slice2=_slicedToArray(_match$slice,4),oldStart=_match$slice2[0],oldNumLines=_match$slice2[1],newStart=_match$slice2[2],newNumLines=_match$slice2[3];deletedLineCounter=+oldStart;addedLineCounter=+newStart;currentChunk={content:line,changes:[],oldStart:+oldStart,oldLines:toNumOfLines(oldNumLines),newStart:+newStart,newLines:toNumOfLines(newNumLines)};currentFileChanges={oldLines:toNumOfLines(oldNumLines),newLines:toNumOfLines(newNumLines)};currentFile.chunks.push(currentChunk)};var del=function del(line){if(!currentChunk)return;currentChunk.changes.push({type:"del",del:true,ln:deletedLineCounter++,content:line});currentFile.deletions++;currentFileChanges.oldLines--};var add=function add(line){if(!currentChunk)return;currentChunk.changes.push({type:"add",add:true,ln:addedLineCounter++,content:line});currentFile.additions++;currentFileChanges.newLines--};var eof=function eof(line){var _currentChunk$changes3;if(!currentChunk)return;var _currentChunk$changes=currentChunk.changes.slice(-1),_currentChunk$changes2=_slicedToArray(_currentChunk$changes,1),mostRecentChange=_currentChunk$changes2[0];currentChunk.changes.push((_currentChunk$changes3={type:mostRecentChange.type},_defineProperty(_currentChunk$changes3,mostRecentChange.type,true),_defineProperty(_currentChunk$changes3,"ln1",mostRecentChange.ln1),_defineProperty(_currentChunk$changes3,"ln2",mostRecentChange.ln2),_defineProperty(_currentChunk$changes3,"ln",mostRecentChange.ln),_defineProperty(_currentChunk$changes3,"content",line),_currentChunk$changes3))};var schemaHeaders=[[/^diff\s/,start],[/^new file mode \d+$/,newFile],[/^deleted file mode \d+$/,deletedFile],[/^index\s[\da-zA-Z]+\.\.[\da-zA-Z]+(\s(\d+))?$/,index],[/^---\s/,fromFile],[/^\+\+\+\s/,toFile],[/^@@\s+-(\d+),?(\d+)?\s+\+(\d+),?(\d+)?\s@@/,chunk],[/^\\ No newline at end of file$/,eof]];var schemaContent=[[/^-/,del],[/^\+/,add],[/^\s+/,normal]];var parseContentLine=function parseContentLine(line){var _iterator=_createForOfIteratorHelper(schemaContent),_step;try{for(_iterator.s();!(_step=_iterator.n()).done;){var _step$value=_slicedToArray(_step.value,2),pattern=_step$value[0],handler=_step$value[1];var match=line.match(pattern);if(match){handler(line,match);break}}}catch(err){_iterator.e(err)}finally{_iterator.f()}if(currentFileChanges.oldLines===0&&currentFileChanges.newLines===0){currentFileChanges=null}};var parseHeaderLine=function parseHeaderLine(line){var _iterator2=_createForOfIteratorHelper(schemaHeaders),_step2;try{for(_iterator2.s();!(_step2=_iterator2.n()).done;){var _step2$value=_slicedToArray(_step2.value,2),pattern=_step2$value[0],handler=_step2$value[1];var match=line.match(pattern);if(match){handler(line,match);break}}}catch(err){_iterator2.e(err)}finally{_iterator2.f()}};var parseLine=function parseLine(line){if(currentFileChanges){parseContentLine(line)}else{parseHeaderLine(line)}return};var _iterator3=_createForOfIteratorHelper(lines),_step3;try{for(_iterator3.s();!(_step3=_iterator3.n()).done;){var line=_step3.value;parseLine(line)}}catch(err){_iterator3.e(err)}finally{_iterator3.f()}return files};var fileNameDiffRegex=/a\/.*(?=["']? ["']?b\/)|b\/.*$/g;var gitFileHeaderRegex=/^(a|b)\//;var parseFiles=function parseFiles(line){var fileNames=line===null||line===void 0?void 0:line.match(fileNameDiffRegex);return fileNames===null||fileNames===void 0?void 0:fileNames.map(function(fileName){return fileName.replace(gitFileHeaderRegex,"").replace(/("|')$/,"")})};var qoutedFileNameRegex=/^\\?['"]|\\?['"]$/g;var parseOldOrNewFile=function parseOldOrNewFile(line){var fileName=leftTrimChars(line,"-+").trim();fileName=removeTimeStamp(fileName);return fileName.replace(qoutedFileNameRegex,"").replace(gitFileHeaderRegex,"")};var leftTrimChars=function leftTrimChars(string,trimmingChars){string=makeString(string);if(!trimmingChars&&String.prototype.trimLeft)return string.trimLeft();var trimmingString=formTrimmingString(trimmingChars);return string.replace(new RegExp("^".concat(trimmingString,"+")),"")};var timeStampRegex=/\t.*|\d{4}-\d\d-\d\d\s\d\d:\d\d:\d\d(.\d+)?\s(\+|-)\d\d\d\d/;var removeTimeStamp=function removeTimeStamp(string){var timeStamp=timeStampRegex.exec(string);if(timeStamp){string=string.substring(0,timeStamp.index).trim()}return string};var formTrimmingString=function formTrimmingString(trimmingChars){if(trimmingChars===null||trimmingChars===undefined)return"\\s";else if(trimmingChars instanceof RegExp)return trimmingChars.source;return"[".concat(makeString(trimmingChars).replace(/([.*+?^=!:${}()|[\]/\\])/g,"\\$1"),"]")};var makeString=function makeString(itemToConvert){return(itemToConvert!==null&&itemToConvert!==void 0?itemToConvert:"")+""};


/***/ }),
/* 4 */
/***/ ((module) => {

module.exports = require("path");

/***/ }),
/* 5 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(6), exports);


/***/ }),
/* 6 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(7), exports);


/***/ }),
/* 7 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.asyncExec = void 0;
const cp = __webpack_require__(8);
const asyncExec = (command) => {
    return new Promise((resolve, reject) => {
        cp.exec(command, (error, stdout, x) => {
            if (error)
                reject(error);
            resolve(stdout);
        });
    });
};
exports.asyncExec = asyncExec;


/***/ }),
/* 8 */
/***/ ((module) => {

module.exports = require("child_process");

/***/ }),
/* 9 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(10), exports);


/***/ }),
/* 10 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(11), exports);
__exportStar(__webpack_require__(12), exports);


/***/ }),
/* 11 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ActivityBarViewProvider = void 0;
const _1 = __webpack_require__(10);
/**
 * Class responsible for resolving vdr-activity-bar-view WebviewView.
 */
class ActivityBarViewProvider {
    constructor(extensionContext) {
        this._extensionContext = extensionContext;
    }
    resolveWebviewView(webviewView) {
        this._ActibityBarView = new _1.ActivityBarView(this._extensionContext, webviewView);
    }
    /************
     *  Public  *
     ************/
    static getViewId() {
        return this._viewId;
    }
}
exports.ActivityBarViewProvider = ActivityBarViewProvider;
ActivityBarViewProvider._viewId = "vdr-activity-bar-view";


/***/ }),
/* 12 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ActivityBarView = void 0;
const vscode = __webpack_require__(1);
const gitExtensionApi_1 = __webpack_require__(2);
const Helpers_1 = __webpack_require__(13);
const types_1 = __webpack_require__(15);
var RENDER_STATE;
(function (RENDER_STATE) {
    RENDER_STATE[RENDER_STATE["VIEW_LOADING"] = 0] = "VIEW_LOADING";
    RENDER_STATE[RENDER_STATE["VIEW_READY"] = 1] = "VIEW_READY";
})(RENDER_STATE || (RENDER_STATE = {}));
/**
 * Class responsible for managing vdr-activity-bar-view WebviewView.
 */
class ActivityBarView {
    constructor(extensionContext, webviewView) {
        this._renderState = RENDER_STATE.VIEW_LOADING;
        this._disposables = [];
        this._gitApi = gitExtensionApi_1.default.Instance;
        this._extensionContext = extensionContext;
        this._view = webviewView;
        this._view.webview.options = this._getWebviewOptions(); // Configure Webview.
        this._WebviewUriProvider = new Helpers_1.WebviewUriProvider(this._view.webview, this._extensionContext.extensionUri);
        // Listen for messages within the View.
        this._setWebviewMessageListener();
        // Listen for text document save.
        vscode.workspace.onDidSaveTextDocument(async (e) => {
            await this._applyChanges();
        });
        // Clean disposables.
        this._view.onDidDispose(this.dispose, undefined, this._disposables);
        // Dependent modules configured, ready to render.
        this._renderState = RENDER_STATE.VIEW_READY;
        this._renderView();
    }
    dispose() {
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable)
                disposable.dispose();
        }
    }
    /*************
     *  Private  *
     *************/
    _getWebviewOptions() {
        return {
            enableScripts: true, // For UI Toolkit
        };
    }
    _setWebviewMessageListener() {
        let inputChangeWasNoted = false;
        // Webview messages.
        this._view.webview.onDidReceiveMessage((msg) => {
            switch (msg.command) {
                case "searchInputChange":
                    const { value } = msg;
                    this._handleSearchInputChange(value, !inputChangeWasNoted);
                    inputChangeWasNoted = true;
                    break;
                case "ActivityBarViewDidLoad":
                    this._loadDataFromLocalStorage();
                    break;
                case "log":
                    console.log(msg.value);
                    break;
                default:
                    break;
            }
        }, undefined, this._disposables);
    }
    get _getSearchInputFromState() {
        const { workspaceState } = this._extensionContext;
        const currentValue = workspaceState.get(types_1.WorkspaceStateKeys.ABV_SEARCH_INPUT);
        if (!currentValue)
            return undefined;
        return currentValue;
    }
    async _handleSearchInputChange(value, force = false) {
        const { workspaceState } = this._extensionContext;
        const currentValue = this._getSearchInputFromState;
        // Avoid unnecessary renders and updates
        if (value !== currentValue || force) {
            workspaceState.update(types_1.WorkspaceStateKeys.ABV_SEARCH_INPUT, value);
            // @NOTE: if UI lags, do not await
            await this._applyChanges();
        }
    }
    /**
     * Loads data from extenstion storage to the view.
     */
    _loadDataFromLocalStorage() {
        // Load search input content.
        const searchInputValue = this._getSearchInputFromState;
        this._view.webview.postMessage({
            command: "setSearchInputValue",
            value: searchInputValue ?? "",
        });
    }
    /**
     * Subroutine that is run on changes. Analyzes `git diff`, filters by current
     * regex search and repaints changes tree.
     */
    async _applyChanges() {
        const searchInputValue = this._getSearchInputFromState;
        if (searchInputValue) {
            // Run and parse `git diff`.
            const diff = await this._gitApi.parseDiff();
            // Filter with saved regex term.
            const filteredChanges = [];
            const regex = new RegExp(searchInputValue, "g"); // Parse search term as RegEx.
            diff.forEach((changedFile) => {
                changedFile.changes.forEach((fileChange) => {
                    let newIndex = undefined;
                    // @NOTE: For now consider only 'add' changes. Maybe later add ability to change this in extension settings.
                    if (fileChange.type === "add" &&
                        fileChange.content.match(regex) !== null) {
                        // First change in a file matched.
                        if (newIndex === undefined) {
                            newIndex =
                                filteredChanges.push({
                                    filePath: changedFile.filePath,
                                    changes: [fileChange],
                                }) - 1;
                        }
                        else {
                            // Rest of the changes matched in a file.
                            filteredChanges[newIndex].changes.push(fileChange);
                        }
                    }
                });
            });
            // @TOOD: Send data to view (will rerender upon this message).
            // ...
        }
    }
    /**
     * Generate Webview HTML basing on current View state.
     */
    _buildView() {
        switch (this._renderState) {
            case RENDER_STATE.VIEW_LOADING:
                return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width,initial-scale=1.0">
                </head>
                <body>
                    Extension is loading...
                </body>
            </html>
        `;
                break;
            case RENDER_STATE.VIEW_READY:
                return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width,initial-scale=1.0">
                    <script type="module" src="${this._WebviewUriProvider.getUiToolkitWebviewUri()}"></script>
                    <script type="module" src="${this._WebviewUriProvider.getScriptWebviewUri(["ActivityBarScripts.js"])}"></script>
                    <link rel="stylesheet" href="${this._WebviewUriProvider.getStyleWebviewUri(["activity-bar-scripts.css"])}">
                </head>
                
                <body>
                    <vscode-text-field id="searchInput" placeholder='eg. ".*console.log.*"'>
                      Search
                    </vscode-text-field>
                    <div class="empty-search-input" id="emptySearchInput">Feel free to use above search input.</div>
                </body>
            </html>
        `;
                break;
            default:
                return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width,initial-scale=1.0">
                </head>
                <body>
                    ???
                </body>
            </html>
        `;
                break;
        }
    }
    _renderView() {
        this._view.webview.html = this._buildView();
        this._onDidRender();
    }
    _onDidRender() {
        // @TODO: ???
        this._loadDataFromLocalStorage();
    }
}
exports.ActivityBarView = ActivityBarView;


/***/ }),
/* 13 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(14), exports);


/***/ }),
/* 14 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WebviewUriProvider = void 0;
const vscode = __webpack_require__(1);
class WebviewUriProvider {
    constructor(WebviewView, extenstionUri) {
        this._WebviewView = WebviewView;
        this._extenstionUri = extenstionUri;
    }
    /************
     *  Public  *
     ************/
    getUiToolkitWebviewUri() {
        return this._getWebviewUri([
            "node_modules",
            "@vscode",
            "webview-ui-toolkit",
            "dist",
            "toolkit.js",
        ]);
    }
    getScriptWebviewUri(scriptPath) {
        return this._getWebviewUri(["media", "scripts", ...scriptPath]);
    }
    getStyleWebviewUri(scriptPath) {
        return this._getWebviewUri(["media", "styles", ...scriptPath]);
    }
    /*************
     *  Private  *
     *************/
    _getWebviewUri(modulePathList) {
        return this._WebviewView.asWebviewUri(vscode.Uri.joinPath(this._extenstionUri, ...modulePathList));
    }
}
exports.WebviewUriProvider = WebviewUriProvider;


/***/ }),
/* 15 */
/***/ (function(__unused_webpack_module, exports, __webpack_require__) {


var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", ({ value: true }));
__exportStar(__webpack_require__(16), exports);
__exportStar(__webpack_require__(17), exports);


/***/ }),
/* 16 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WorkspaceStateKeys = void 0;
var WorkspaceStateKeys;
(function (WorkspaceStateKeys) {
    WorkspaceStateKeys["ABV_SEARCH_INPUT"] = "ABV_SEARCH_INPUT";
})(WorkspaceStateKeys = exports.WorkspaceStateKeys || (exports.WorkspaceStateKeys = {}));


/***/ }),
/* 17 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));


/***/ })
/******/ 	]);
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
(() => {
var exports = __webpack_exports__;

Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.deactivate = exports.activate = void 0;
const vscode = __webpack_require__(1);
const gitExtensionApi_1 = __webpack_require__(2);
const Views_1 = __webpack_require__(9);
/**
 ******* NOTES *******
 *
 *
 * 1. Maintaing a valid repository state is a TODO - not so important right now, let's focus on main funcionalities such as:
 * 2. D̶i̶s̶p̶l̶a̶y̶ i̶n̶p̶u̶t̶ f̶i̶e̶l̶d̶ i̶n̶s̶i̶d̶e̶ V̶i̶e̶w̶ a̶n̶d̶ s̶t̶o̶r̶i̶n̶g̶ i̶t̶'̶s̶ v̶a̶l̶u̶e̶ i̶n̶ a̶ V̶S̶C̶'̶s̶ l̶o̶c̶a̶l̶s̶t̶o̶r̶a̶g̶e̶.̶
 * 3. R̶u̶n̶ c̶o̶m̶m̶a̶n̶d̶ w̶h̶i̶c̶h̶ w̶i̶l̶l̶ r̶u̶n̶ `̶g̶i̶t̶ d̶i̶f̶f̶`̶
 * 4. Get changed files from `git diff` (https://github.com/sergeyt/parse-diff) X
 * 5. Open file upon click (is there a quick way to show diff like in a SCM view?)
 * 6. Highlight searched regex inside this file
 * 7. Run `git diff` on file changes X
 * 8. Change highlight in opened window while typing in search input.
 * 9. Don't care bout rename alone (but do care about rename & contents change) (`git diff --no-renames` ???)
 * 10. Show TreeView (controlled by main View) and create easy update mechanism
 * 11. Translate `git diff` to TreeView
 *
 * --- Road map functionalities ---
 * 7. Find and replace occurrences in all files
 * 8. Handle multiple repositeries within opened Workspace
 * 9. Handle multiple Workspaces
 * 10. Create pull request on https://github.com/sergeyt/parse-diff that enables parsing filenames where diff.noprefix === true OR diff.mnemonicPrefix === true
 *
 */
async function activate(context) {
    console.log("*** vsc-diff-regex startup ***");
    /***********************
     *  Extension startup  *
     ***********************/
    const gitApi = gitExtensionApi_1.default.Instance;
    // Make sure git extension is active
    if (await gitApi.activateGit()) {
        // check config (due to parse limitations of "parse-diff": "^0.9.0")
        // ...
        // git config diff.noprefix === FALSE | undef
        // git config diff.mnemonicPrefix === FALSE | undef
        context.subscriptions.push(vscode.window.registerWebviewViewProvider(Views_1.ActivityBarViewProvider.getViewId(), new Views_1.ActivityBarViewProvider(context)));
        // Test command
        let ping = vscode.commands.registerCommand("vdr.ping", () => {
            vscode.window.showInformationMessage("Pong");
        });
        let gitDiff = vscode.commands.registerCommand("vdr.git-diff", async () => {
            const diff = await gitApi.parseDiff();
            console.log(diff);
        });
        context.subscriptions.push(ping, gitDiff);
    }
}
exports.activate = activate;
// this method is called when your extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;

})();

module.exports = __webpack_exports__;
/******/ })()
;
//# sourceMappingURL=extension.js.map