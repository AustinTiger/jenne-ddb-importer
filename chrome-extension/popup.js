document.getElementById("btn-copy").addEventListener("click", async () => {
  const status = document.getElementById("status");
  try {
    let cookie = await chrome.cookies.get({
      url: "https://www.dndbeyond.com",
      name: "CobaltSession"
    });
    if (!cookie) {
      cookie = await chrome.cookies.get({
        url: "https://www.dndbeyond.com",
        name: "Cobalt-Session"
      });
    }
    if (cookie && cookie.value) {
      await navigator.clipboard.writeText(cookie.value);
      status.textContent = "Copied to clipboard!";
      status.className = "status success";
    } else {
      status.textContent = "Could not find cookie. Are you logged in?";
      status.className = "status";
    }
  } catch (err) {
    status.textContent = "Error: " + err.message;
    status.className = "status";
  }
});
