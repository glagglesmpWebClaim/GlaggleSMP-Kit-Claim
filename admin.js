const api = (window.GLAGGLE_KIT_API || "").trim().replace(/\/$/, "");
const loginForm = document.querySelector("#login-form");
const loginButton = document.querySelector("#login-button");
const dashboard = document.querySelector("#dashboard");
const message = document.querySelector("#admin-message");
let sessionToken = "";

function showMessage(text, error = false) {
  message.textContent = text;
  message.classList.toggle("error", error);
}

function readableTime(seconds) {
  return new Date(seconds * 1000).toLocaleString();
}

async function loadOverview() {
  if (!api) throw new Error("The admin connection is not configured yet.");
  const response = await fetch(`${api}/api/admin/overview`, { headers: { Authorization: `Bearer ${sessionToken}` } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Could not load admin data.");
  loginForm.hidden = true;
  dashboard.hidden = false;
  const totals = Object.fromEntries(data.counts.map((row) => [row.status, row.total]));
  const cardNames = [["queued", "QUEUED"], ["processing", "PROCESSING"], ["fulfilled", "DELIVERED"], ["rejected", "REJECTED"], ["expired", "EXPIRED"]];
  document.querySelector("#status-cards").replaceChildren(...cardNames.map(([key, label]) => {
    const card = document.createElement("div");
    card.className = "status-card";
    const number = document.createElement("strong"); number.textContent = totals[key] || 0;
    const title = document.createElement("span"); title.textContent = label;
    card.append(number, title); return card;
  }));
  const rows = data.claims.map((claim) => {
    const tr = document.createElement("tr");
    for (const value of [claim.player_name, claim.status, claim.message || "—", readableTime(claim.created_at)]) {
      const td = document.createElement("td"); td.textContent = value; tr.append(td);
    }
    tr.children[1].className = `state state-${claim.status}`;
    return tr;
  });
  const tbody = document.querySelector("#claim-rows");
  if (!rows.length) {
    const tr = document.createElement("tr"); const td = document.createElement("td");
    td.colSpan = 4; td.textContent = "No claims yet."; tr.append(td); rows.push(tr);
  }
  tbody.replaceChildren(...rows);
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("Checking sign-in…");
  loginButton.disabled = true;
  try {
    const response = await fetch(`${api}/api/admin/login`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: loginForm.elements.password.value })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Sign-in failed.");
    sessionToken = data.token;
    loginForm.elements.password.value = "";
    await loadOverview();
  } catch (error) { showMessage(error.message, true); }
  finally { loginButton.disabled = false; }
});

document.querySelector("#logout-button").addEventListener("click", async () => {
  sessionToken = "";
  dashboard.hidden = true;
  loginForm.hidden = false;
  showMessage("You are signed out.");
});

loadOverview().catch((error) => {
  if (!/login required/i.test(error.message)) showMessage(error.message, true);
});
