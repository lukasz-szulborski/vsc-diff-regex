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

  vscode.postMessage({
    command: "searchInputChange",
    value,
  });
}
