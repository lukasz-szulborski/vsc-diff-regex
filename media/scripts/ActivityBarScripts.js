const vscode = acquireVsCodeApi();

window.addEventListener("load", main);

function main() {
  const searchInput = document.querySelector("#searchInput");

  if (searchInput) {
    searchInput.addEventListener("input", searchInputOnChangeHandler);
  }

  // Extension messages listener.
  window.addEventListener("message", function (e) {
    const msg = event.data;

    switch (msg.command) {
      case "setSearchInputValue":
        const { value } = msg;
        if (searchInput) searchInput.value = value;
        toggleEmptyInputInfo(value);
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

function log(value) {
  vscode.postMessage({
    command: "log",
    value,
  });
}