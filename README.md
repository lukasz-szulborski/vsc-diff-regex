# vsc-diff-regex

Visual Studio Code extension that facilitates searching for uncommitted source code changes across multiple Git repositories.

## Installation guide

Search for `vsc-diff-regex` in vscode extension market and hit `Install`. If the extension doesn't work then please reload vscode window.

## How to use

1. Activate extension by clicking on an extension icon inside an activity bar (the bar where you can also find Explorer and Source Control icons).
2. Enter a valid regular expression.
3. If there are any matches you should see results under the input field. You can click on any of the found lines to open the file. 

\!\[feature X\]\(images/feature-x.png\) 

## Extension Settings

In order to change extension settings please head to `Settings` and search for `vsc-diff-regex`.

Currently the only configurable part of this extension is a highlight color of a found expression. 

## Known Issues

* Improve Myers Diff Algorithm implementation (current implementation is neither stack-safe nor optimal)
* Add abort signal to analysing function.

Feel free to open an issue to report a bug or propose improvements.

## Release Notes

### 1.0.0

Initial release.