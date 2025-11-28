// scan links on the page
const links = Array.from(document.querySelectorAll("a")).map(a => a.href);

if (links.length > 0){
    fetch("https://127.0.0.1:5000/check_links", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ urls: links})
    })
    .then(res => res.json())
    .then(data => {
        for(const item of data.results) {
            if(item.prediction === "phishing"){
                alert("Warning: Phishing link detected!\n" + item.url);
            }
        }
    })
    .catch(err => console.error("Server offline: ", err));
}