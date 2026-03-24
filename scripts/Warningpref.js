function initWarningPrefPage() {
  const checkboxes = document.querySelectorAll("input[type='checkbox']");

  chrome.storage.local.get(null, (data) => {
    checkboxes.forEach(cb => {
      if (data[cb.id] !== undefined) {
        cb.checked = data[cb.id];
      }
    });
  });

  checkboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      chrome.storage.local.set({
        [cb.id]: cb.checked
      });
    });
  });
}