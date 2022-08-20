const vscode = acquireVsCodeApi();
window.addEventListener("load", main);

function main() {
  const searchInput = document.querySelector("#searchInput");
  const body = document.querySelector("body");

  if (searchInput) {
    searchInput.addEventListener("input", searchInputOnChangeHandler);
  }

  // Extension messages listener.
  window.addEventListener("message", function (e) {
    const msg = event.data;

    switch (msg.command) {
      case "setSearchInputValue":
        const { value } = msg;
        if (searchInput) {
          searchInput.value = value;
          searchInput.dispatchEvent(new Event("input"));
        }
        body.style.display = "flex";
        toggleEmptyInputInfo(value);
        break;
      case "newResults":
        const { matches } = msg;
        handleNewResults(matches);
        break;
      default:
        break;
    }
  });

  vscode.postMessage({
    command: "ActivityBarViewDidLoad",
  });
}

function searchInputOnChangeHandler(event) {
  const value = event.target.value;

  toggleEmptyInputInfo(value);
  // Clear container where match results live.
  if (value.trim().length === 0) clearResultsContainer();

  vscode.postMessage({
    command: "searchInputChange",
    value,
  });
}

function toggleEmptyInputInfo(value) {
  if (value.trim().length === 0) {
    document.querySelector("#emptySearchInput").style.display = "flex";
  } else {
    document.querySelector("#emptySearchInput").style.display = "none";
  }
}

/**
 * Clear tree view with found matches.
 *
 * @returns {void}
 */
function clearResultsContainer() {
  const resultsContainer = document.querySelector("#resultsContainer");
  resultsContainer.innerHTML = "";
}

/**
 * Create a tree for displaying matched changes.
 * RedomJS helps developers to visualise a DOM tree by looking at code.
 * Dealing with a plain js would result in a rather messy code.
 *
 */
function handleNewResults(matches) {
  clearResultsContainer(); // Clear previous results.
  // @NOTE: in future matches will be contained in many workspaces.
  if (Array.isArray(matches)) {
    // Each match is a different file containing many lines with "add" changes.
    matches.forEach((match) => {
      // If this file doesn't have any changes that should be displayed then skip the whole file.
      if (!match.changes.find((c) => c.isVisible === true)) return;

      const fullFilename = `${match.fileName.name}.${match.fileName.extension}`;
      // Create file element
      const fileDomElement = redom.el("div.results-container__file", [
        // Create header for file element.
        redom.el("div.results-container__file-header", [
          // Create header contents.
          redom.el("a.results-container__file-header-icon", [
            redom.el(`div.${FileIcons.getClassWithColor(fullFilename)}`),
          ]),
          redom.el(
            "span.results-container__file-header-name",
            { title: match.filePath },
            redom.text(fullFilename)
          ),
        ]),
        // Create container for lines.
        redom.el(
          "div.results-container__file-lines-container",
          // Create lines.
          match.changes.map((change) => {
            if (!change.isVisible) return;

            const lineElement = redom.el("div.results-container__file-line", [
              redom.el("span.results-container__file-line-change", [
                redom.text(change.content),
              ]),
              redom.text(change.line + 1),
            ]);
            lineElement.addEventListener("click", function () {
              handleLineChangeClick(change, match.fullFilePath);
            });
            return lineElement;
          })
        ),
      ]);
      // Insert file element into a container. (In future a workspace)
      resultsContainer.appendChild(fileDomElement);
    });
  }
}

function handleLineChangeClick(change, fullFilePath) {
  vscode.postMessage({
    command: "changeClick",
    change,
    fullFilePath,
  });
}

function log(value) {
  vscode.postMessage({
    command: "log",
    value,
  });
}
