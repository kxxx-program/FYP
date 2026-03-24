const showBtn = document.getElementById("addURL");
const dialog = document.getElementById("addSiteDialog");
const form = document.getElementById("addForm");
const removeBtn = document.getElementById("removeURL");
const tableBody = document.querySelector("#listURL tbody");

//dialog
showBtn.addEventListener("click", () => {
  dialog.showModal(); 
});

// Load list
function renderList(urlList) {
   if (urlList.length === 0) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = 3;
    td.textContent = "No URLs in whitelist.";
    td.style.textAlign = "center";
    tr.appendChild(td);
    tableBody.appendChild(tr);
    return;
  }

  urlList.forEach((item) => {
    const tr = document.createElement("tr");

    // Name cell
    const nameTd = document.createElement("td");
    nameTd.textContent = item.name;

    // URL cell
    const urlTd = document.createElement("td");
    urlTd.innerHTML = `<a href="${item.url}" target="_blank">${item.url}</a>`;

    // Date cell
    const dateTd = document.createElement("td");
    dateTd.textContent = item.date || "N/A";

    tr.appendChild(nameTd);
    tr.appendChild(urlTd);
    tr.appendChild(dateTd);

    tableBody.appendChild(tr);
  });
};

async function loadList() {
  const data = await chrome.storage.local.get("urlList");
  const entries = data.urlList || [];
  renderList(entries);
  return entries;
}

// Add new entry
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = await chrome.storage.local.get("urlList");
  const urlList = data.urlList || [];

   const now = new Date();
  const newEntry = {
    name: document.getElementById("webname").value.trim(),
    url: document.getElementById("whitelistURL").value.trim(),
    date: now.toLocaleDateString() + " " + now.toLocaleTimeString()
  };

  urlList.push(newEntry);
  await chrome.storage.local.set({ urlList });

  renderList(urlList);
  form.reset();
  dialog.close();
});

//cancel
document.querySelector(".btn.no").addEventListener("click", () => {
  dialog.close();
  form.reset();
});

loadList();


//Remove URL

let removeMode = false;

// Toggle remove mode
removeBtn.addEventListener("click", () => {
  removeMode = !removeMode;

  if (removeMode) {
    removeBtn.textContent = "Cancel";
    tableBody.style.cursor = "pointer";
    alert("Select a row to remove.");
  } else {
    removeBtn.textContent = "Remove URL";
    removeBtn.style.backgroundColor = "";
    tableBody.style.cursor = "default";
    clearSelection();
  }
});

tableBody.addEventListener("click", async (e) => {
  if (!removeMode) return;

  const row = e.target.closest("tr");
  if (!row) return;

  clearSelection();
  row.classList.add("selected");

  const confirmDelete = confirm(`Remove "${row.cells[0].textContent}" from whitelist?`);
  if (!confirmDelete) return;

  const data = await chrome.storage.local.get("urlList");
  let urlList = data.urlList || [];

  const index = row.dataset.index;
  urlList.splice(index, 1);

  await chrome.storage.local.set({ urlList });
  renderList(urlList);

  // Exit remove mode after deletion
  removeMode = false;
  removeBtn.textContent = "Remove URL";
  removeBtn.style.backgroundColor = "";
  tableBody.style.cursor = "default";
});


function clearSelection() {
  document.querySelectorAll("tr.selected").forEach(r => r.classList.remove("selected"));
}