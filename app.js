const form = document.querySelector("#claim-form");
const message = document.querySelector("#claim-message");
const button = document.querySelector("#claim-submit");

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.className = "claim-message";
  const api = (window.GLAGGLE_KIT_API || "").trim().replace(/\/$/, "");
  if (!api) {
    message.textContent = "The claim connection is still being set up. No claim was submitted.";
    return;
  }

  const player = form.elements.player.value.trim();
  const code = form.elements.code.value.trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(player)) {
    message.textContent = "Enter a valid Minecraft Java username.";
    message.classList.add("error");
    return;
  }
  if (!/^[A-Za-z0-9-]{4,12}$/.test(code)) {
    message.textContent = "Check the one-time code from /kitlink and try again.";
    message.classList.add("error");
    return;
  }

  button.disabled = true;
  button.innerHTML = "CHECKING LINK… <span>◌</span>";
  message.textContent = "Contacting the GlaggleSMP armory…";
  try {
    const response = await fetch(`${api}/api/claims`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ player, code })
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.message || "The claim could not be submitted.");
    if (!result.id) throw new Error("The claim service didn't return a request ID.");
    message.textContent = "Link accepted. Waiting for the server to deliver your kit…";
    let completed = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const statusResponse = await fetch(`${api}/api/claims/${encodeURIComponent(result.id)}`);
      const status = await statusResponse.json().catch(() => ({}));
      if (!statusResponse.ok) throw new Error(status.message || "Couldn't check claim status.");
      if (status.status === "fulfilled") {
        message.textContent = status.message || "Your kit was delivered. The next claim is available in 5 minutes.";
        message.classList.add("success");
        completed = true;
        break;
      }
      if (["rejected", "expired"].includes(status.status)) {
        throw new Error(status.message || "The server couldn't complete this claim.");
      }
    }
    if (!completed) message.textContent = "Your request is still queued. Join GlaggleSMP; the server will finish it when online.";
  } catch (error) {
    message.textContent = error.message || "Couldn't reach the claim service. Try again in a moment.";
    message.classList.add("error");
  } finally {
    button.disabled = false;
    button.innerHTML = "LINK &amp; CLAIM KIT <span>→</span>";
  }
});
