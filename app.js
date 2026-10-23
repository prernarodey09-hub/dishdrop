const $ = id => document.getElementById(id);
const esc = value => String(value).replace(/[&<>"']/g, character => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;"
}[character]));

const config = window.DISH_DROP_SUPABASE || {};
const supabaseConfigured = Boolean(
  config.url &&
  config.anonKey &&
  !config.url.startsWith("YOUR_") &&
  !config.anonKey.startsWith("YOUR_")
);
const client = supabaseConfigured && window.supabase
  ? window.supabase.createClient(config.url, config.anonKey)
  : null;
let me = null;
let recipes = [];
let requests = [];
let editId = null;
let replyingToRequestId = null;
let registering = false;
let registrationCooldownTimer = null;
const registrationCooldownKey = "dishdrop-registration-cooldown-until";

function updateRegistrationButton() {
  const cooldownUntil = Number(localStorage.getItem(registrationCooldownKey) || 0);
  const remaining = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
  if (registering && remaining > 0) {
    $("authGo").disabled = true;
    $("authGo").textContent = `Wait ${remaining}s`;
    if (!registrationCooldownTimer) {
      registrationCooldownTimer = setInterval(updateRegistrationButton, 1000);
    }
    return;
  }
  $("authGo").disabled = false;
  $("authGo").textContent = registering ? "Register" : "Login";
  if (remaining === 0) localStorage.removeItem(registrationCooldownKey);
  if (registrationCooldownTimer) {
    clearInterval(registrationCooldownTimer);
    registrationCooldownTimer = null;
  }
}

function explainAuthenticationError(error) {
  const message = error.message || "Something went wrong. Please try again.";
  if (!registering || !/security purposes|rate.?limit|after \d+ seconds/i.test(message)) {
    return message;
  }
  const seconds = Number(message.match(/after\s+(\d+)\s+seconds/i)?.[1] || 60);
  localStorage.setItem(registrationCooldownKey, String(Date.now() + seconds * 1000));
  updateRegistrationButton();
  return `Too many registration attempts. Wait ${seconds} seconds before trying again. If you already registered, choose “Have an account? Login” and sign in with your email and password.`;
}

function setStatus(message) {
  $("appStatus").textContent = message;
}

function displayName(user) {
  return user.user_metadata.full_name || user.email.split("@")[0];
}

function show(page) {
  if (page !== "login" && !me) page = "login";
  document.querySelectorAll(".page").forEach(section => {
    section.classList.toggle("show", section.id === page);
  });
  document.querySelectorAll("nav button").forEach(button => {
    button.classList.toggle("on", button.dataset.p === page);
  });
  if (page === "home") renderRecipes();
  if (page === "req") renderRequests();
  if (page === "dash") renderDash();
  $("authBtn").textContent = me ? `Logout (${displayName(me).split(" ")[0]})` : "Login";
}

function mapRecipe(row) {
  return {
    id: row.id,
    title: row.title,
    cat: row.category,
    time: row.cooking_time,
    ing: row.ingredients,
    steps: row.steps,
    by: row.author_id,
    author: row.author_name,
    requestId: row.request_id
  };
}

function mapRequest(row) {
  return {
    id: row.id,
    text: row.text,
    by: row.author_name,
    authorId: row.author_id
  };
}

async function loadCommunityData() {
  const [recipeResult, requestResult] = await Promise.all([
    client.from("recipes").select("*").order("created_at", { ascending: false }),
    client.from("recipe_requests").select("*").order("created_at", { ascending: false })
  ]);
  if (recipeResult.error) throw recipeResult.error;
  if (requestResult.error) throw requestResult.error;
  recipes = recipeResult.data.map(mapRecipe);
  requests = requestResult.data.map(mapRequest);
}

function readLegacyList(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (!Array.isArray(value)) throw new Error(`Old ${key} data is not a list.`);
  return value;
}

async function migrateLegacyData() {
  const marker = `dishdrop-cloud-migration-v1-${me.id}`;
  if (localStorage.getItem(marker)) return;

  const oldRecipes = readLegacyList("recipes");
  const oldRequests = readLegacyList("requests");
  const ownedRequests = oldRequests.filter(request =>
    request.email && request.email.toLowerCase() === me.email.toLowerCase()
  );
  const requestKeys = new Map(ownedRequests.map(request => [
    String(request.id),
    `${me.id}:request:${request.id}`
  ]));

  if (ownedRequests.length) {
    const { error } = await client.from("recipe_requests").upsert(
      ownedRequests.map(request => ({
        text: request.text,
        author_id: me.id,
        author_name: displayName(me),
        legacy_key: `${me.id}:request:${request.id}`
      })),
      { onConflict: "legacy_key", ignoreDuplicates: true }
    );
    if (error) throw error;
  }

  const requestIds = new Map();
  if (requestKeys.size) {
    const { data, error } = await client
      .from("recipe_requests")
      .select("id, legacy_key")
      .in("legacy_key", [...requestKeys.values()]);
    if (error) throw error;
    data.forEach(request => {
      const oldId = [...requestKeys].find(([, key]) => key === request.legacy_key)?.[0];
      if (oldId !== undefined) requestIds.set(oldId, request.id);
    });
  }

  const ownedRecipes = oldRecipes.filter(recipe =>
    recipe.by && recipe.by.toLowerCase() === me.email.toLowerCase()
  );
  if (ownedRecipes.length) {
    const { error } = await client.from("recipes").upsert(
      ownedRecipes.map(recipe => ({
        title: recipe.title,
        category: recipe.cat,
        cooking_time: recipe.time,
        ingredients: recipe.ing,
        steps: recipe.steps,
        author_id: me.id,
        author_name: displayName(me),
        request_id: recipe.requestId === undefined ? null : requestIds.get(String(recipe.requestId)) || null,
        legacy_key: `${me.id}:recipe:${recipe.id}`
      })),
      { onConflict: "legacy_key", ignoreDuplicates: true }
    );
    if (error) throw error;
  }

  localStorage.setItem(marker, "complete");
  localStorage.removeItem("users");
  localStorage.removeItem("me");
  if (ownedRecipes.length || ownedRequests.length) {
    setStatus(`Imported ${ownedRecipes.length} of your saved recipes and ${ownedRequests.length} of your requests.`);
  }
}

function resetForm() {
  editId = null;
  replyingToRequestId = null;
  $("formTitle").textContent = "Share a Recipe";
  $("saveRecipe").textContent = "Save recipe";
  ["rTitle", "rTime", "rIng", "rSteps"].forEach(id => {
    $(id).value = "";
  });
  $("rErr").textContent = "";
}

function renderRecipes() {
  const query = $("search").value.toLowerCase();
  const category = $("filter").value;
  const matchingRecipes = recipes.filter(recipe =>
    (!category || recipe.cat === category) &&
    (recipe.title.toLowerCase().includes(query) || recipe.ing.join(" ").toLowerCase().includes(query))
  );

  $("list").innerHTML = matchingRecipes.length ? matchingRecipes.map(recipe => `
    <article class="recipe">
      <h3>${esc(recipe.title)}</h3>
      <div class="meta">${esc(recipe.cat)}, ${recipe.time} min, by ${esc(recipe.author)}</div>
      <b>Ingredients</b><ul>${recipe.ing.map(item => `<li>${esc(item)}</li>`).join("")}</ul>
      <b>Steps</b><ol>${recipe.steps.map(step => `<li>${esc(step)}</li>`).join("")}</ol>
      ${me && recipe.by === me.id ? `
        <button class="btn sm" onclick="editRecipe('${esc(recipe.id)}')">Edit</button>
        <button class="btn sm alt" onclick="delRecipe('${esc(recipe.id)}')">Delete</button>` : ""}
    </article>`).join("") : '<p class="empty">No recipes match. Try another search or share one.</p>';
}

async function saveRecipe() {
  const title = $("rTitle").value.trim();
  const time = Number($("rTime").value);
  const ingredients = $("rIng").value.split("\n").map(value => value.trim()).filter(Boolean);
  const steps = $("rSteps").value.split("\n").map(value => value.trim()).filter(Boolean);
  if (title.length < 3) return $("rErr").textContent = "Title needs at least 3 characters.";
  if (!(time > 0)) return $("rErr").textContent = "Enter cooking time in minutes.";
  if (ingredients.length < 2) return $("rErr").textContent = "Add at least 2 ingredients.";
  if (!steps.length) return $("rErr").textContent = "Add at least 1 step.";

  const data = {
    title,
    category: $("rCat").value,
    cooking_time: time,
    ingredients,
    steps
  };
  let result;
  if (editId) {
    result = await client.from("recipes").update(data).eq("id", editId);
  } else {
    result = await client.from("recipes").insert({
      ...data,
      author_id: me.id,
      author_name: displayName(me),
      request_id: replyingToRequestId
    });
  }
  if (result.error) throw result.error;
  await loadCommunityData();
  resetForm();
  setStatus("");
  show("home");
}

function editRecipe(id) {
  const recipe = recipes.find(item => item.id === id);
  if (!recipe || recipe.by !== me.id) return;
  editId = id;
  replyingToRequestId = null;
  $("formTitle").textContent = "Edit Recipe";
  $("saveRecipe").textContent = "Update recipe";
  $("rTitle").value = recipe.title;
  $("rCat").value = recipe.cat;
  $("rTime").value = recipe.time;
  $("rIng").value = recipe.ing.join("\n");
  $("rSteps").value = recipe.steps.join("\n");
  show("add");
}

async function delRecipe(id) {
  if (!confirm("Delete this recipe?")) return;
  const { error } = await client.from("recipes").delete().eq("id", id);
  if (error) throw error;
  await loadCommunityData();
  renderRecipes();
  if (document.querySelector("#req.show")) renderRequests();
}

async function addRequest() {
  const text = $("reqText").value.trim();
  if (text.length < 4) return $("reqErr").textContent = "Describe the recipe in at least 4 characters.";
  const { error } = await client.from("recipe_requests").insert({
    text,
    author_id: me.id,
    author_name: displayName(me)
  });
  if (error) throw error;
  $("reqText").value = "";
  $("reqErr").textContent = "";
  await loadCommunityData();
  renderRequests();
}

function renderRequests() {
  const renderedRequests = requests.map(request => {
    const answers = recipes.filter(recipe => recipe.requestId === request.id);
    const status = answers.length ? "Fulfilled" : "Pending";
    return `
      <div class="req">
        <div><b>${esc(request.text)}</b><div class="meta">Requested by ${esc(request.by)}</div></div>
        <div>
          <span class="tag ${status}">${status}</span>
          <button class="btn sm" onclick="provideRecipe('${esc(request.id)}')">${answers.length ? "Add another recipe" : "Provide a recipe"}</button>
          ${request.authorId === me.id ? `<button class="btn sm alt" onclick="delRequest('${esc(request.id)}')">Remove</button>` : ""}
        </div>
        ${answers.map(recipe => `
          <article class="req-recipes">
            <h4>${esc(recipe.title)} · shared by ${esc(recipe.author)}</h4>
            <div class="meta">${esc(recipe.cat)}, ${recipe.time} min</div>
            <b>Ingredients</b><ul>${recipe.ing.map(item => `<li>${esc(item)}</li>`).join("")}</ul>
            <b>Steps</b><ol>${recipe.steps.map(step => `<li>${esc(step)}</li>`).join("")}</ol>
          </article>`).join("")}
      </div>`;
  }).join("");
  $("reqList").innerHTML = renderedRequests || '<p class="empty">No requests yet. Ask for a recipe above.</p>';
}

function provideRecipe(id) {
  const request = requests.find(item => item.id === id);
  if (!request) return;
  resetForm();
  replyingToRequestId = id;
  $("formTitle").textContent = `Recipe for: ${request.text}`;
  $("saveRecipe").textContent = "Share recipe with community";
  $("rTitle").value = request.text;
  show("add");
}

async function delRequest(id) {
  if (!confirm("Remove this request? Any recipes already shared for it will stay in the community.")) return;
  const { error } = await client.from("recipe_requests").delete().eq("id", id);
  if (error) throw error;
  await loadCommunityData();
  renderRequests();
}

function renderDash() {
  const answeredRequestIds = new Set(recipes.map(recipe => recipe.requestId).filter(Boolean));
  const answered = requests.filter(request => answeredRequestIds.has(request.id)).length;
  $("stats").innerHTML = [
    ["Recipes", recipes.length],
    ["Pending requests", requests.length - answered],
    ["Answered requests", answered]
  ].map(([label, count]) => `<div class="stat"><b>${count}</b>${label}</div>`).join("");

  const counts = {};
  recipes.forEach(recipe => {
    counts[recipe.cat] = (counts[recipe.cat] || 0) + 1;
  });
  const maximum = Math.max(1, ...Object.values(counts));
  $("cats").innerHTML = Object.entries(counts).map(([category, count]) =>
    `<div class="cat"><span class="n">${esc(category)} (${count})</span><i style="width:${count / maximum * 60}%"></i></div>`
  ).join("") || '<p class="empty">No recipes have been shared yet.</p>';
}

async function finishAuthentication(user) {
  me = user;
  await migrateLegacyData();
  await loadCommunityData();
  setStatus("");
  show("home");
}

$("nav").addEventListener("click", async event => {
  const button = event.target.closest("button[data-p]");
  if (!button) return;
  if (button.id === "authBtn" && me) {
    try {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      me = null;
      recipes = [];
      requests = [];
      setStatus("");
      show("login");
    } catch (error) {
      setStatus(`Could not log out: ${error.message}`);
    }
    return;
  }
  if (button.dataset.p === "add") resetForm();
  show(button.dataset.p);
});

$("authSwitch").addEventListener("click", () => {
  registering = !registering;
  $("nameRow").style.display = registering ? "block" : "none";
  $("authTitle").textContent = registering ? "Register" : "Login";
  $("authSwitch").textContent = registering ? "Have an account? Login" : "New here? Register";
  $("aErr").textContent = "";
  updateRegistrationButton();
});

$("authGo").addEventListener("click", async () => {
  $("aErr").textContent = "";
  if (!client) {
    $("aErr").textContent = "Login is not available yet. Please try again later.";
    return;
  }
  const name = $("aName").value.trim();
  const email = $("aEmail").value.trim().toLowerCase();
  const password = $("aPass").value;
  if (!/^\S+@\S+\.\S+$/.test(email)) return $("aErr").textContent = "Enter a valid email address.";
  if (password.length < 6) return $("aErr").textContent = "Password must be at least 6 characters.";
  if (registering && name.length < 2) return $("aErr").textContent = "Enter your full name.";

  try {
    const result = registering
      ? await client.auth.signUp({ email, password, options: { data: { full_name: name } } })
      : await client.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    $("aPass").value = "";
    if (!result.data.session) {
      $("aErr").textContent = "Check your email to confirm your account, then log in.";
      return;
    }
    registering = false;
    $("nameRow").style.display = "none";
    $("authTitle").textContent = "Login";
    $("authSwitch").textContent = "New here? Register";
    updateRegistrationButton();
    await finishAuthentication(result.data.user);
  } catch (error) {
    $("aErr").textContent = explainAuthenticationError(error);
  }
});

$("saveRecipe").addEventListener("click", async () => {
  $("rErr").textContent = "";
  try {
    await saveRecipe();
  } catch (error) {
    $("rErr").textContent = `Could not save this recipe: ${error.message}`;
  }
});
$("cancelEdit").addEventListener("click", () => {
  resetForm();
  show("home");
});
$("search").addEventListener("input", renderRecipes);
$("filter").addEventListener("change", renderRecipes);
$("addReq").addEventListener("click", async () => {
  $("reqErr").textContent = "";
  try {
    await addRequest();
  } catch (error) {
    $("reqErr").textContent = `Could not send this request: ${error.message}`;
  }
});

window.editRecipe = id => editRecipe(id);
window.delRecipe = id => delRecipe(id).catch(error => alert(`Could not delete this recipe: ${error.message}`));
window.provideRecipe = id => provideRecipe(id);
window.delRequest = id => delRequest(id).catch(error => alert(`Could not remove this request: ${error.message}`));

async function start() {
  show("login");
  updateRegistrationButton();
  if (!supabaseConfigured) {
    setStatus("DishDrop is being set up. Please try again later.");
    return;
  }
  if (!client) {
    setStatus("DishDrop could not load its Supabase client. Check your connection and refresh.");
    return;
  }
  const { data, error } = await client.auth.getSession();
  if (error) {
    setStatus(`Could not check your login: ${error.message}`);
    return;
  }
  if (!data.session) return;
  try {
    await finishAuthentication(data.session.user);
  } catch (loadError) {
    setStatus(`Could not load shared data: ${loadError.message}`);
  }
}

start();
