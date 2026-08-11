import { auth, signInWithEmailAndPassword, signOut, onAuthStateChanged, ADMIN_EMAILS } from "../../js/firebase-init.js";

const statusEl = document.getElementById("status");

onAuthStateChanged(auth, (user) => {
  if (user && ADMIN_EMAILS.includes(user.email)) {
    location.href = "dashboard.html";
  }
});

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  statusEl.textContent = "";
  statusEl.className = "status-msg";
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    if (!ADMIN_EMAILS.includes(cred.user.email)) {
      await signOut(auth);
      statusEl.textContent = "Esse e-mail não tem acesso ao painel de admin.";
      statusEl.className = "status-msg err";
      return;
    }
    location.href = "dashboard.html";
  } catch (err) {
    statusEl.textContent = "E-mail ou senha incorretos.";
    statusEl.className = "status-msg err";
  }
});
