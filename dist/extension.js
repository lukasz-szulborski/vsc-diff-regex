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
/*

@TODO: I don't like this class, please have a closer look later at what can be improved.
 */
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
        // @TODO: DRY
        const includeUntracked = !configExists ||
            (configExists &&
                (config.includeUntracked === undefined ||
                    config.includeUntracked === true));
        const cleanAddChange = !configExists ||
            (configExists &&
                (config.cleanAddChange === undefined ||
                    config.cleanAddChange === true));
        const cleanDelChange = !configExists ||
            (configExists &&
                (config.cleanDelChange === undefined ||
                    config.cleanDelChange === true));
        const parsedDiff = await this.diffToObject();
        const results = [];
        // Include changes from `git diff`
        if (parsedDiff) {
            parsedDiff.diffs.forEach((file, i) => {
                const parsedChangedFile = {
                    changes: file.chunks.flatMap((chunk) => {
                        return chunk.changes.map((change) => {
                            if (this.isParseDiffChangeAdd(change)) {
                                return {
                                    line: change.ln - 1,
                                    content: cleanAddChange
                                        ? change.content
                                            .replace(/^\+/g, "")
                                        // .replace(/^( |\t)*/g, "")
                                        : change.content,
                                    type: "add",
                                    isVisible: true,
                                };
                            }
                            else if (this.isParseDiffChangeDelete(change)) {
                                return {
                                    line: change.ln - 1,
                                    content: cleanDelChange
                                        ? change.content
                                            .replace(/^\-/g, "")
                                        // .replace(/^( |\t)*/g, "")
                                        : change.content,
                                    type: "del",
                                    isVisible: false,
                                };
                            }
                            else {
                                return {
                                    line: change.ln1 - 1,
                                    content: change.content,
                                    type: "normal",
                                    isVisible: false,
                                };
                            }
                        });
                    }),
                    // @NOTE: extension blocks cases where `git diff` cannot be parsed by parse-diff
                    filePath: file.from,
                    fileName: (0, utils_1.filenameFromPath)(file.from),
                    fullFilePath: `${parsedDiff.repository.rootUri.path}/${file.from}`,
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
    repositoryExist() {
        return this.getWorkspaceMainRepository() !== null;
    }
    onDidOpenRepository(cb) {
        this._vscGitApi.onDidOpenRepository(cb);
    }
    onDidChangeState(cb) {
        this._vscGitApi.onDidChangeState(cb);
    }
    getState() {
        return this._vscGitApi.state;
    }
    getWorkspaceMainRepository() {
        const mainRepo = this._vscGitApi.getRepository(
        // @TODO: [roadmap] consider multiple workspaces
        vscode.workspace.workspaceFolders[0].uri);
        return mainRepo;
    }
    /*************
     *  Private  *
     *************/
    /**
     * Get file diffs in workspace repositories.
     *
     */
    async diffToObject() {
        const repository = this.getWorkspaceMainRepository();
        if (repository) {
            const result = parseDiff(await repository.diff());
            return {
                diffs: result,
                repository,
            };
        }
        return undefined;
    }
    async parseUntrackedFilesInWorkspace() {
        try {
            const result = [];
            // @TODO: [roadmap] consider multiple workspaces
            let workspacePath = vscode.workspace.workspaceFolders[0].uri.path;
            workspacePath = workspacePath.replace(/^\//g, "");
            // Exec command.
            const commandResult = await (0, utils_1.asyncExec)(`git -C "${workspacePath}" ls-files -o --exclude-standard`);
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
                            fullFilePath: `/${path}`,
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
                        fileName: (0, utils_1.filenameFromPath)(relativeFilePath),
                        fullFilePath: fileContents.fullFilePath,
                        changes: fileLines.map((line, i) => ({
                            content: line,
                            line: i,
                            type: "add",
                            isVisible: true,
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
__exportStar(__webpack_require__(9), exports);
__exportStar(__webpack_require__(11), exports);


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
/**
 * Run command on a child process.
 */
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
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.filenameFromPath = void 0;
/**
 * Get filename and it's extension from full file path.
 */
const filenameFromPath = (path) => {
    // split by front/back slash.
    const pathParts = path.split(/[\/\\]/g);
    // Get last element, split by a dot.
    const fileName = pathParts[pathParts.length - 1];
    const fileNameSplitted = fileName.split(".");
    const numOfFilenameElements = fileNameSplitted.length;
    // Return name and extension.
    if (numOfFilenameElements === 1) {
        return {
            name: fileNameSplitted[0],
            extension: null,
        };
    }
    else {
        return {
            name: fileNameSplitted.slice(0, numOfFilenameElements - 1).join("."),
            extension: fileNameSplitted[numOfFilenameElements - 1],
        };
    }
};
exports.filenameFromPath = filenameFromPath;


/***/ }),
/* 11 */
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
__exportStar(__webpack_require__(12), exports);


/***/ }),
/* 12 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.myersDiff = void 0;
const print_operation = ({ content, operation_type, pos_end, pos_start, }) => {
    console.log(`{\n\tpos_start: ${pos_start}\n\tpos_end: ${pos_end}\n\toperation_type: ${operation_type}\n\tcontent: ${content}\n}\n`);
};
const get_cords_diff = (a_cords, b_cords) => ({
    x_delta: Math.abs(a_cords[0] - b_cords[0]),
    y_delta: Math.abs(a_cords[1] - b_cords[1]),
});
/*
 * Example:
 * (7, 7) (7, 6) -> Insert
 * (7, 6) (6, 6) -> Delete
 */
const get_operation_between_cords = (a_cords, b_cords) => {
    let { x_delta, y_delta } = get_cords_diff(a_cords, b_cords);
    if (y_delta > x_delta) {
        return "Insert";
    }
    else {
        return "Delete";
    }
};
const are_cords_non_negative = (cords) => {
    if (cords[0] >= 0 && cords[1] >= 0) {
        return true;
    }
    return false;
};
/*
 * Check if first cord is smaller or equal.
 */
const is_smaller_or_eq = (a_cords, b_cords) => a_cords[0] <= b_cords[0] && a_cords[1] <= b_cords[1];
const did_point_exceed_strings = (s1, s2, cord) => {
    const len1 = s1.length;
    const len2 = s2.length;
    if (cord[0] > len1 || cord[1] > len2) {
        return true;
    }
    return false;
};
/*
 * Whether coordinates are an endpoint to a snake.
 */
const is_end_of_snake = (cords, snake_length, s1, s2) => {
    const [x, y] = cords;
    if (x <= 0 || y <= 0 || did_point_exceed_strings(s1, s2, cords)) {
        return false;
    }
    else {
        const aux = (s1_index, s2_index, acc) => {
            const are_equal = s1[s1_index] === s2[s2_index];
            if (are_equal === false || s1_index <= 0 || s2_index <= 0) {
                return are_equal ? acc + 1 : acc;
            }
            return aux(s1_index - 1, s2_index - 1, acc + 1);
        };
        return aux(x - 1, y - 1, 0) >= snake_length;
    }
};
/*
 * In edit graph, check whether it is possible to move from point A to point B given two strings where A > B. We move backward.
 *
 * It checks whether *one* step length in a certain direction is valid. E.g. it is not possible to make a move of length more than 1 if there is no diagnal.
 */
const is_step_distance_valid = (a_cords, b_cords, s1, s2) => {
    const [a_x, a_y] = a_cords;
    const [b_x, b_y] = b_cords;
    const d = get_cords_diff(a_cords, b_cords);
    if (is_smaller_or_eq(b_cords, a_cords) === false) {
        return false;
    }
    else if ((d.x_delta === 1 && d.y_delta === 0) ||
        (d.x_delta === 0 && d.y_delta === 1)) {
        return true;
    }
    else if (d.y_delta === d.x_delta) {
        if (b_x === 0 && b_y === 0) {
            return s1.slice(0, a_x) === s2.slice(0, a_x);
        }
        else {
            return false;
        }
    }
    else {
        const diagonal_length = d.y_delta < d.x_delta ? d.y_delta : d.x_delta;
        return is_end_of_snake(a_cords, diagonal_length, s1, s2);
    }
};
const get_cords = (state, k_idx, k) => {
    const x = state[k_idx];
    const y = x - k;
    return [x, y];
};
const generate_list = (start, fin, step) => {
    const go = (start, fin, step, acc) => {
        if (start === fin) {
            return [...acc, start];
        }
        else {
            return go(start + step, fin, step, [...acc, start]);
        }
    };
    return go(start, fin, step, []);
};
const remove_N_first_chars_of_string = (str, n) => {
    return str.slice(n);
};
const remove_first_char_of_string = (str) => remove_N_first_chars_of_string(str, 1);
/*
 * Count equal characters at the beginning of each string.
 * eg. ('abc', 'abd') -> 2 ; ('abc', 'edf') -> 0
 */
const count_eq_chars = (s1, s2) => {
    const go = (s1, s2, acc) => {
        const l1 = s1.length;
        const l2 = s2.length;
        if (l1 === 0 || l2 === 0) {
            return acc;
        }
        else if (s1[0] === s2[0]) {
            return go(remove_first_char_of_string(s1), remove_first_char_of_string(s2), acc + 1);
        }
        else {
            return acc;
        }
    };
    return go(s1, s2, 0);
};
/*
 * Recover move from given position in a given direction of next V snapshot.
 */
const recover_single_move = (next_v_snapshot, str1, str2, current_cords, edit_graph, aux_function, history, is_out_of_bound, shifted_k, k) => {
    const len1 = str1.length;
    const len2 = str2.length;
    if (is_out_of_bound === false) {
        const next_cords = get_cords(next_v_snapshot, shifted_k, k);
        const [next_x, next_y] = next_cords;
        const can_travel = is_step_distance_valid(current_cords, next_cords, str1, str2);
        if (are_cords_non_negative(next_cords) === true &&
            can_travel === true &&
            next_x <= len1 &&
            next_y <= len2 &&
            is_smaller_or_eq(next_cords, current_cords) === true) {
            const operation_type = get_operation_between_cords(current_cords, next_cords);
            const start_position = operation_type === "Delete" ? next_x : next_y;
            const end_position = operation_type === "Delete" ? next_x + 1 : next_y + 1;
            const last_move = edit_graph.length >= 1 ? edit_graph[edit_graph.length - 1] : undefined;
            const should_concat = last_move !== undefined &&
                operation_type === last_move.operation_type &&
                last_move.pos_start === end_position;
            const this_move_content = operation_type === "Insert"
                ? str2[start_position]
                : str1[start_position];
            const move = {
                pos_start: start_position,
                pos_end: should_concat ? last_move.pos_end : end_position,
                operation_type: operation_type,
                content: should_concat
                    ? `${this_move_content}${last_move.content}`
                    : this_move_content,
            };
            const new_edit_graph = should_concat
                ? [...edit_graph.slice(0, -1), move]
                : [...edit_graph, move];
            const [_, ...rest_history] = history;
            return aux_function(rest_history, k, false, new_edit_graph);
        }
        else {
            return aux_function([], k, true, edit_graph);
        }
    }
    else {
        // If move impossible then don't continue this path.
        return aux_function([], k, true, edit_graph);
    }
};
/**
 * Not using Hunt & Szymanski LCS because R parameter is expected to be large (there would be a lot of matches between two strings)
 *
 *
 * @see(http://www.xmailserver.org/diff2.pdf) myers algo
 */
const myersDiff = (str1, str2) => {
    const len1 = str1.length;
    const len2 = str2.length;
    // Let 'nm' be the maximum number of moves in the edit graph.
    const nm = len1 + len2;
    const total_number_of_diagonals = nm * 2 + 1;
    // let 'v' be the array that holds reached depth (x axis) of particular k diagonal.
    // There is nm * 2 + 1 such diagonals starting from -nm to nm (including zero thus '+ 1').
    const v = Array(total_number_of_diagonals).fill(0);
    const is_out_of_bound = (x) => x < 0 || x > v.length - 1;
    // Make move given we're making Dth move and we have some state of moves basing on previous moves (v array).
    const make_move_on_ks = (diagonals, v, d, reached_NM) => {
        if (diagonals.length === 0) {
            return [v, reached_NM];
        }
        else {
            const [k, ...t] = diagonals;
            const shifted_k = k + nm; // Adjust to array indexing. Array indices cannot be negative.
            // Check whether to make a move.
            let updated_v = v; // For d = 0 do not move right or down. Just return current state.
            if (d > 0) {
                // Check whether to move down.
                const down = k === -d ||
                    (k !== -d &&
                        is_out_of_bound(shifted_k - 1) === false &&
                        is_out_of_bound(shifted_k + 1) === false &&
                        v[shifted_k - 1] < v[shifted_k + 1]);
                if (down) {
                    updated_v = v.map((a, i) => (i === shifted_k ? v[shifted_k + 1] : a));
                }
                else {
                    // Update k-diagonal depth for right move.
                    updated_v = v.map((a, i) => i === shifted_k ? v[shifted_k - 1] + 1 : a);
                }
            }
            // At this point we've made a move (or not). Let's check if it's possible to travel diagonal.
            const [x, y] = get_cords(updated_v, shifted_k, k);
            if (x + 1 <= len1 && y + 1 <= len2) {
                updated_v = updated_v.map((a, i) => {
                    if (i === shifted_k) {
                        return (a +
                            count_eq_chars(remove_N_first_chars_of_string(str1, x), remove_N_first_chars_of_string(str2, y)));
                    }
                    else {
                        return a;
                    }
                });
            }
            // Get (x, y) once more because it could have been changed by diagonal traversal.
            const [new_x, new_y] = get_cords(updated_v, shifted_k, k);
            // Check whether reached endpoint equals (N, M) final endpoint (end of the edit graph).
            if (new_x === len1 && new_y === len2) {
                return make_move_on_ks([], updated_v, d, true);
            }
            else {
                return make_move_on_ks(t, updated_v, d, false);
            }
        }
    };
    /*
          Take number of possible moves for given strings and produce array of moves history.
          Each history array item holds an array of x values for each k-diagonal where X value means furthest possible position of k-diagonal on X axis in edit graph during Dth move.
          This array of k-diagonal states facilitates recovering the shortest path from (N, M) to (0,0).
      */
    const traverse_edit_graph = (moves, history) => {
        const go = (dth_move, history) => {
            // Result of previous move.
            const previous_v_snapshot = history[history.length - 1];
            if (dth_move > moves) {
                return history;
            }
            else {
                const [new_v, reached_NM] = make_move_on_ks(generate_list(dth_move * -1, dth_move, 2), previous_v_snapshot, dth_move, false);
                const new_history = [...history, new_v];
                if (reached_NM === true) {
                    // If (N, M) was reached then stop computation for bigger ds.
                    return go(moves + 1, new_history);
                }
                else {
                    return go(dth_move + 1, new_history);
                }
            }
        };
        return go(0, history);
    };
    // Basing on list of snapshots of v-array (obtained in traverse_edit_graph) create an optimal edit script.
    const recover_edit_script = (history) => {
        const aux = (history, current_k_diag, invalid_path, edit_graph) => {
            const shifted_k = current_k_diag + nm; // Adjust to array indexing. Array indices cannot be negative.
            const history_len = history.length;
            if (history_len <= 1) {
                return {
                    operations: edit_graph,
                    is_invalid_path: invalid_path,
                };
            }
            else {
                const v_snapshot = history[0]; // Pop snapshot from "stack".
                const [x, y] = get_cords(v_snapshot, shifted_k, current_k_diag); // Current position.
                // If current position is (0, 0) then end the algorithm, we've reached the beginning of the edit script.
                if (x === 0 && y === 0) {
                    return {
                        operations: edit_graph,
                        is_invalid_path: false,
                    };
                }
                const shifted_k_left = shifted_k - 1;
                const shifted_k_right = shifted_k + 1;
                const is_left_move_out_of_bound = is_out_of_bound(shifted_k_left);
                const is_right_move_out_of_bound = is_out_of_bound(shifted_k_right);
                const next_v_snapshot = history[1];
                // Get state of current k diagonal in a previous move and check whether there is a diagonal on edit graph beginning.
                // Sometimes, when edit graph starts with a diagonal, it is vital to move downward in order to finish algorith run.
                const bottom_cords = get_cords(next_v_snapshot, shifted_k, shifted_k - nm);
                if (bottom_cords[0] === 0 &&
                    bottom_cords[1] === 0 &&
                    is_step_distance_valid([x, y], bottom_cords, str1, str2)) {
                    return {
                        operations: edit_graph,
                        is_invalid_path: false,
                    };
                }
                // Take next possible moves for left and right.
                const left_path = recover_single_move(next_v_snapshot, str1, str2, [x, y], edit_graph, aux, history, is_left_move_out_of_bound, shifted_k_left, shifted_k_left - nm);
                const right_path = recover_single_move(next_v_snapshot, str1, str2, [x, y], edit_graph, aux, history, is_right_move_out_of_bound, shifted_k_right, shifted_k_right - nm);
                // Choose path. Favour shorter paths and those with more deletions.
                const left_length = left_path.operations.length;
                const right_length = right_path.operations.length;
                if (left_path.is_invalid_path === true) {
                    return right_path;
                }
                else if (right_path.is_invalid_path === true) {
                    return left_path;
                }
                else {
                    if (left_length >= right_length) {
                        return right_path;
                    }
                    else {
                        return left_path;
                    }
                }
            }
        };
        return aux(history, len1 - len2, false, []);
    };
    const history = traverse_edit_graph(nm, [v]);
    const edit_script = recover_edit_script(history.reverse());
    return edit_script;
};
exports.myersDiff = myersDiff;


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
__exportStar(__webpack_require__(15), exports);
__exportStar(__webpack_require__(16), exports);


/***/ }),
/* 15 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ActivityBarViewProvider = void 0;
const _1 = __webpack_require__(14);
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
/* 16 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ActivityBarView = void 0;
const vscode = __webpack_require__(1);
const gitExtensionApi_1 = __webpack_require__(2);
const Helpers_1 = __webpack_require__(17);
const types_1 = __webpack_require__(19);
const utils_1 = __webpack_require__(5);
var RENDER_STATE;
(function (RENDER_STATE) {
    RENDER_STATE[RENDER_STATE["VIEW_LOADING"] = 0] = "VIEW_LOADING";
    RENDER_STATE[RENDER_STATE["VIEW_READY"] = 1] = "VIEW_READY";
    RENDER_STATE[RENDER_STATE["NO_REPO"] = 2] = "NO_REPO";
})(RENDER_STATE || (RENDER_STATE = {}));
/**
 * Class responsible for managing vdr-activity-bar-view WebviewView.
 */
class ActivityBarView {
    constructor(extensionContext, webviewView) {
        this._renderState = RENDER_STATE.VIEW_LOADING;
        this._disposables = [];
        this._gitApi = gitExtensionApi_1.default.Instance;
        this._textEditorsDecorations = [];
        this._loadingState = {
            gitRepositories: true,
        };
        this._extensionContext = extensionContext;
        this._view = webviewView;
        this._WebviewUriProvider = new Helpers_1.WebviewUriProvider(this._view.webview, this._extensionContext.extensionUri);
        this._view.webview.options = this._getWebviewOptions(); // Configure Webview.
        // Listen for messages within the View.
        this._setWebviewMessageListener();
        // Listen for text document save.
        const saveListener = vscode.workspace.onDidSaveTextDocument(async () => {
            await this._applyChanges();
        });
        // Changing tabs.
        const closeListener = vscode.workspace.onDidOpenTextDocument(async () => {
            // @TODO:
            // [X] Listen for new tab open.
            // [X] Repaint searched term decorations.
            // [ ] Check if it works for re-opening closed tabs
            // [ ] Check if it works po splitting into new tab.
            await this._applyChanges();
        });
        this._disposables.push(saveListener, closeListener);
        // Clean disposables.
        this._view.onDidDispose(this.dispose, undefined, this._disposables);
        if (this._gitApi.getState() === "initialized") {
            this._handleGitApiInitialized();
        }
        else {
            this._gitApi.onDidChangeState((e) => {
                if (e === "initialized") {
                    this._handleGitApiInitialized();
                }
            });
        }
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
    /**
     * Update variable that holds informations about this view's components loading state.
     * If all components did load then change render state to "ready to render".
     * Next render state (final one) will further handle loading.
     *
     */
    _updateLoadingState(key, value) {
        this._loadingState[key] = value;
        let isLoading = false;
        for (const key in this._loadingState) {
            const element = this._loadingState[key];
            if (element === true) {
                isLoading = true;
            }
        }
        if (isLoading === false) {
            this._renderState = RENDER_STATE.VIEW_READY;
        }
    }
    _setWebviewMessageListener() {
        let inputChangeWasNoted = false;
        // Webview messages.
        this._view.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.command) {
                case "searchInputChange":
                    const { value } = msg;
                    this._handleSearchInputChange(value, !inputChangeWasNoted);
                    inputChangeWasNoted = true;
                    break;
                case "ActivityBarViewDidLoad":
                    this._loadDataFromLocalStorage();
                    break;
                case "changeClick":
                    const { fullFilePath, change } = msg;
                    await this._handleChangeClick(fullFilePath, change);
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
        // @TODO: force should be made on every reload of this view (leaving the sidebar aswell)
        if (value !== currentValue || force) {
            workspaceState.update(types_1.WorkspaceStateKeys.ABV_SEARCH_INPUT, value);
        }
        // @NOTE: if UI lags, do not await
        // Always when input was changed, check for new search results.
        await this._applyChanges();
    }
    /**
     * Open text document in an editor.
     *
     * @param fullFilePath path pointing to clicked line of changed document
     * @param line number of line where change occured
     */
    async _handleChangeClick(fullFilePath, change) {
        // @TODO: catch statement
        const doc = await vscode.workspace.openTextDocument(`${fullFilePath}`);
        const editor = await vscode.window.showTextDocument(doc);
        // Center at the position of the change.
        editor.revealRange(new vscode.Range(new vscode.Position(change.line, 0), new vscode.Position(change.line, 0)), vscode.TextEditorRevealType.InCenter);
    }
    _handleGitApiInitialized() {
        // @TODO: [roadmap] consider multiple workspaces
        const repository = this._gitApi.getWorkspaceMainRepository();
        if (repository) {
            this._updateLoadingState("gitRepositories", false);
        }
        else {
            this._renderState = RENDER_STATE.NO_REPO;
        }
        this._renderView();
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
     * regex search, repaints changes tree and decorated active editor.
     *
     * @TODO: rename: what does "apply changes" mean?
     */
    async _applyChanges() {
        // If searched term does not exist then stop the routine.
        const searchInputValue = this._getSearchInputFromState;
        /*
          -----
          -- PARSING SUBROUTINE
          -----
    
          It will parse "git diff" command and put it into easy-to-interpret (for this special case) objects.
    
          Whole process consists of several steps.
          * Parse "git diff" (text -> array of javascript objects)
          * Filter only "add" and "delete" changes. Also keep only these lines where searched term can be found anywhere inside line (even if searched term is not "add" change). Also index changes by file path and line numbers.
          * Now, first phase of parsing is done. We have javascript objects that facilitate further manipulations.
        */
        // Run and parse `git diff`.
        const diff = await this._gitApi.parseDiff();
        // Filter with saved regex term.
        const filteredChanges = [];
        // Containing filtered changes (File name -> change line -> change) Hash map. Index to process changes within a single line easier.
        const filteredChangesHashMap = {};
        const searchedTermRegex = new RegExp(searchInputValue ?? "");
        diff.forEach((changedFile) => {
            let newIndex = undefined;
            changedFile.changes.forEach((fileChange) => {
                if ((fileChange.type === "add" &&
                    fileChange.content.match(searchedTermRegex) !== null) ||
                    fileChange.type === "del") {
                    // Create different object types for changed files. Later it will be easier to reason about this changed files.
                    if (newIndex === undefined) {
                        // First change in a file matched.
                        newIndex =
                            filteredChanges.push({
                                filePath: changedFile.filePath,
                                fileName: (0, utils_1.filenameFromPath)(changedFile.filePath),
                                fullFilePath: changedFile.fullFilePath,
                                changes: [fileChange],
                            }) - 1;
                    }
                    else {
                        // Rest of the changes matched in a file.
                        filteredChanges[newIndex].changes.push(fileChange);
                    }
                    // Index (aggregation) for changed files per line.
                    if (!filteredChangesHashMap[changedFile.fullFilePath])
                        filteredChangesHashMap[changedFile.fullFilePath] = {};
                    if (!filteredChangesHashMap[changedFile.fullFilePath][fileChange.line])
                        filteredChangesHashMap[changedFile.fullFilePath][fileChange.line] =
                            [];
                    filteredChangesHashMap[changedFile.fullFilePath][fileChange.line].push(fileChange);
                }
            });
        });
        /*
          -----
          -- PAINTING CHANGES SUBROUTINE
          -----
    
          It will further filter changes by searched term and visualise searched changes.
    
          * First of all we need to make sure that lines that doesn't contain searched term strictly in *changes* will be eventually filtered out (filter lines that contain searched term but not in changes). See `filteredChangesLinesToFilterOut` array.
          * Find added positions in changed lines.
          * Decorate these positions.
        */
        // Remove decorations from previous render.
        this._textEditorsDecorations.forEach((decoration) => decoration.dispose());
        this._textEditorsDecorations = [];
        // Array of changed files' indices in `filteredChanges` array and lines to filter out (where changes doesn't contain searched term).
        const filteredChangesLinesToFilterOut = [];
        filteredChanges.forEach((fileChange, fileChangeIndex) => {
            const changedFileFullPath = fileChange.fullFilePath;
            // Get all visible editors && For every changed file, try to find active editor.
            const editors = vscode.window.visibleTextEditors.filter((e) => e.document.uri.path.toLocaleLowerCase() ===
                changedFileFullPath.toLocaleLowerCase());
            if (!editors || editors.length === 0)
                return;
            // If active editor with changes exist, get changed lines for this editor and find out what changed on a line level using some kind of LCS algorithm. After line changes are found filter them further to leave only positions that match with a searched term.
            const changes = filteredChangesHashMap[changedFileFullPath];
            for (const changeLineNumber in changes) {
                const changeLineNumberParsed = parseInt(changeLineNumber);
                const change = changes[changeLineNumber];
                let isModified = change.length === 2;
                let isPlainAdd = change.length === 1;
                let originalContent, currentContent;
                if (isPlainAdd) {
                    // Consider whole line as changed.
                    originalContent = "";
                    const changeUnit = change[0];
                    if (changeUnit.type !== "add") {
                        // Do not analyze deletions as a single unit. There is nothing to paint there.
                        continue;
                    }
                    currentContent = changeUnit.content;
                }
                else if (isModified) {
                    const addChangeIndex = change.findIndex((c) => c.type === "add");
                    const delChange = change[1 - addChangeIndex];
                    const addChange = change[addChangeIndex];
                    originalContent = delChange.content;
                    currentContent = addChange.content;
                }
                else {
                    // Don't paint changes. Change at line shouldn't be longer than 2.
                    continue;
                }
                const originalToCurrentEditScript = (0, utils_1.myersDiff)(originalContent, currentContent);
                let termFoundInChanges = false;
                originalToCurrentEditScript.operations.forEach(async (operation) => {
                    // Use only adds.
                    if (operation.operation_type !== "Insert") {
                        return;
                    }
                    // Find terms in edit script.
                    const foundTerms = searchedTermRegex.exec(operation.content);
                    if (foundTerms && foundTerms[0]) {
                        termFoundInChanges = true;
                        // Find terms in edit script and Extract positions.
                        const positionsToPaint = {
                            lineNumber: changeLineNumberParsed,
                            posStart: foundTerms.index + operation.pos_start,
                            posEnd: foundTerms.index + operation.pos_start + foundTerms[0].length,
                            content: foundTerms[0],
                        };
                        // Create decoration.
                        const decoration = vscode.window.createTextEditorDecorationType({
                            backgroundColor: "green",
                            rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed,
                        });
                        this._textEditorsDecorations.push(decoration);
                        editors.forEach((editor) => editor.setDecorations(decoration, [
                            new vscode.Range(new vscode.Position(changeLineNumberParsed, positionsToPaint.posStart), new vscode.Position(changeLineNumberParsed, positionsToPaint.posEnd)),
                        ]));
                    }
                });
                // If "add change" doesn't contain searched term then mark this line as irrelevant.
                if (!filteredChangesLinesToFilterOut[fileChangeIndex]) {
                    filteredChangesLinesToFilterOut[fileChangeIndex] = [];
                }
                if (!termFoundInChanges) {
                    filteredChangesLinesToFilterOut[fileChangeIndex].push(changeLineNumberParsed);
                }
            }
        });
        // Second (and final) step of filtering where we filter lines that don't contain searched term in changes (but it may contain the term in the rest of the line contents).
        const fullyFilteredChanges = filteredChanges.map((fileChange, fileChangeIndex) => {
            const linesToFilter = filteredChangesLinesToFilterOut[fileChangeIndex];
            const updatedFileChange = { ...fileChange };
            if (linesToFilter &&
                Array.isArray(linesToFilter) &&
                linesToFilter.length > 0) {
                updatedFileChange.changes = fileChange.changes.filter((change) => !linesToFilter.includes(change.line));
            }
            return updatedFileChange;
        });
        this._view.webview.postMessage({
            command: "newResults",
            matches: fullyFilteredChanges,
        });
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
            case RENDER_STATE.NO_REPO:
                return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width,initial-scale=1.0">
                </head>
                <body>
                    It looks like you don't have any repositories inside opened workspaces.
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
                    <script type="module" src="${this._WebviewUriProvider.getRedomWebviewUri()}"></script>
                    <script type="module" src="${this._WebviewUriProvider.getFileIconsJsWebviewUri()}"></script>
                    <script type="module" src="${this._WebviewUriProvider.getScriptWebviewUri(["ActivityBarScripts.js"])}"></script>
                    <link rel="stylesheet" href="${this._WebviewUriProvider.getFileIconsCssWebviewUri()}">
                    <link rel="stylesheet" href="${this._WebviewUriProvider.getStyleWebviewUri(["activity-bar-scripts.css"])}">
                </head>
                
                <body>
                    <vscode-text-field id="searchInput" placeholder='eg. ".*console.log.*"'>
                      Search
                    </vscode-text-field>
                    <div class="empty-search-input" id="emptySearchInput">Feel free to use above search input.</div>
                    <div class="results-container" id="resultsContainer"></div>
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
                    Extension didn't load correctly. Please try reloading VSC window.
                </body>
            </html>
        `;
                break;
        }
    }
    _renderView() {
        this._view.webview.html = this._buildView();
    }
}
exports.ActivityBarView = ActivityBarView;


/***/ }),
/* 17 */
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
__exportStar(__webpack_require__(18), exports);


/***/ }),
/* 18 */
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WebviewUriProvider = void 0;
const vscode = __webpack_require__(1);
/**
 * Helper for retrieving URLs to be used on a web views.
 */
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
    getRedomWebviewUri() {
        return this._getWebviewUri([
            "node_modules",
            "redom",
            "dist",
            "redom.min.js",
        ]);
    }
    getFileIconsJsWebviewUri() {
        return this._getWebviewUri([
            "node_modules",
            "file-icons-js",
            "dist",
            "file-icons.js",
        ]);
    }
    getFileIconsCssWebviewUri() {
        return this._getWebviewUri([
            "node_modules",
            "file-icons-js",
            "css",
            "style.css",
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
/* 19 */
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
__exportStar(__webpack_require__(20), exports);
__exportStar(__webpack_require__(21), exports);
__exportStar(__webpack_require__(22), exports);
__exportStar(__webpack_require__(23), exports);


/***/ }),
/* 20 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.WorkspaceStateKeys = void 0;
var WorkspaceStateKeys;
(function (WorkspaceStateKeys) {
    WorkspaceStateKeys["ABV_SEARCH_INPUT"] = "ABV_SEARCH_INPUT";
})(WorkspaceStateKeys = exports.WorkspaceStateKeys || (exports.WorkspaceStateKeys = {}));


/***/ }),
/* 21 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));


/***/ }),
/* 22 */
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));


/***/ }),
/* 23 */
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
const Views_1 = __webpack_require__(13);
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