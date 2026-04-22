const STORAGE_KEY = "arkiruoka-app-v1";
const DAY_NAMES = ["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"];
const SLOT_DEFS = [
  { key: "lounas", label: "Lounas" },
  { key: "paivallinen", label: "Päivällinen" },
  { key: "lastenruoka", label: "Lasten ruoka", optional: true },
];
const MEAL_TYPE_OPTIONS = [
  { value: "valmistetaan", label: "Valmistetaan", short: "Tehdään" },
  { value: "syodaan_aiemmin_tehtya", label: "Syödään aiemmin tehtyä", short: "Jääkaapista" },
  { value: "valmisruoka", label: "Valmisruoka", short: "Valmis" },
];

let state = loadState();
let activeView = "viikko";
let activeWeekView = "current";
let shoppingMode = "combined";

const elements = {
  tabButtons: document.querySelectorAll(".tab-button"),
  views: document.querySelectorAll(".view"),
  weekLabel: document.getElementById("week-label"),
  weekPlan: document.getElementById("week-plan"),
  foodLibrary: document.getElementById("food-library"),
  usageSummary: document.getElementById("usage-summary"),
  shoppingList: document.getElementById("shopping-list"),
  foodForm: document.getElementById("food-form"),
  formTitle: document.getElementById("form-title"),
  cancelEditButton: document.getElementById("cancel-edit-button"),
  foodDetailDialog: document.getElementById("food-detail-dialog"),
  foodDetailContent: document.getElementById("food-detail-content"),
  autoFillButton: document.getElementById("auto-fill-button"),
  clearAutoButton: document.getElementById("clear-auto-button"),
  newFoodButton: document.getElementById("new-food-button"),
  weekSwitches: document.querySelectorAll(".week-switch"),
  shoppingModes: document.querySelectorAll(".shopping-mode"),
  childrenDefaultToggle: document.getElementById("children-default-toggle"),
};

initialize();

function initialize() {
  registerServiceWorker();
  ensureWeekState();
  bindEvents();
  syncSettingsFields();
  render();
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("Service workerin rekisterointi epäonnistui", error);
    });
  });
}

function bindEvents() {
  elements.tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      activeView = button.dataset.view;
      renderViewState();
    });
  });

  elements.foodForm.addEventListener("submit", handleFoodSubmit);
  elements.cancelEditButton.addEventListener("click", resetFoodForm);
  elements.autoFillButton.addEventListener("click", autoFillWeek);
  elements.clearAutoButton.addEventListener("click", clearAutoFilledSlots);
  elements.newFoodButton.addEventListener("click", () => {
    resetFoodForm();
    activeView = "lomake";
    renderViewState();
  });

  elements.weekSwitches.forEach((button) => {
    button.addEventListener("click", () => {
      activeWeekView = button.dataset.weekView;
      render();
    });
  });

  elements.shoppingModes.forEach((button) => {
    button.addEventListener("click", () => {
      shoppingMode = button.dataset.shoppingMode;
      renderShoppingList();
      updateButtonGroups();
    });
  });

  elements.childrenDefaultToggle.addEventListener("change", (event) => {
    state.settings.showChildrenByDefault = event.target.checked;
    saveState();
  });
}

function loadState() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return createDefaultState();
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      foods: Array.isArray(parsed.foods) ? parsed.foods : [],
      weeks: parsed.weeks || {},
      settings: {
        showChildrenByDefault: Boolean(parsed.settings?.showChildrenByDefault),
      },
    };
  } catch (error) {
    console.error("Tallennuksen lukeminen epäonnistui", error);
    return createDefaultState();
  }
}

function createDefaultState() {
  return {
    foods: [],
    weeks: {},
    settings: {
      showChildrenByDefault: false,
    },
  };
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function syncSettingsFields() {
  elements.childrenDefaultToggle.checked = state.settings.showChildrenByDefault;
}

function render() {
  ensureWeekState();
  renderViewState();
  renderWeekPlanner();
  renderFoodLibrary();
  renderUsageSummary();
  renderShoppingList();
  updateButtonGroups();
  elements.autoFillButton.disabled = activeWeekView !== "current";
  elements.clearAutoButton.disabled = activeWeekView !== "current";
}

function renderViewState() {
  elements.tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.view === activeView);
  });

  elements.views.forEach((view) => {
    view.classList.toggle("active", view.dataset.viewPanel === activeView);
  });
}

function updateButtonGroups() {
  elements.weekSwitches.forEach((button) => {
    button.classList.toggle("active", button.dataset.weekView === activeWeekView);
  });

  elements.shoppingModes.forEach((button) => {
    button.classList.toggle("active", button.dataset.shoppingMode === shoppingMode);
  });
}

function ensureWeekState() {
  const currentMeta = getCurrentWeekMeta();

  if (!state.weeks.current) {
    state.weeks.current = createWeek(currentMeta);
  } else if (state.weeks.current.id !== currentMeta.id) {
    state.weeks.previous = state.weeks.current;
    state.weeks.current = createWeek(currentMeta);
    activeWeekView = "current";
  }

  if (!state.weeks.previous && state.weeks.current) {
    state.weeks.previous = null;
  }

  saveState();
}

function getCurrentWeekMeta() {
  const now = new Date();
  const day = (now.getDay() + 6) % 7;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - day);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    id: formatDateId(monday),
    label: `${formatHumanDate(monday)} - ${formatHumanDate(sunday)}`,
    monday,
  };
}

function createWeek(meta) {
  return {
    id: meta.id,
    label: meta.label,
    days: DAY_NAMES.map((dayName, index) => {
      const date = new Date(meta.monday);
      date.setDate(meta.monday.getDate() + index);
      return {
        id: `${meta.id}-${index}`,
        dayName,
        dateLabel: formatHumanDate(date),
        showChildrenMeal: state.settings.showChildrenByDefault,
        slots: {
          lounas: createEmptySlot(),
          paivallinen: createEmptySlot(),
          lastenruoka: createEmptySlot(),
        },
      };
    }),
    shoppingChecks: {},
  };
}

function createEmptySlot() {
  return {
    foodId: "",
    mealType: "",
    locked: false,
    autoFilled: false,
  };
}

function formatDateId(date) {
  return date.toISOString().slice(0, 10);
}

function formatHumanDate(date) {
  return new Intl.DateTimeFormat("fi-FI", {
    day: "numeric",
    month: "numeric",
  }).format(date);
}

function handleFoodSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const name = String(formData.get("nimi") || "").trim();

  if (!name) {
    window.alert("Ruoan nimi on pakollinen.");
    return;
  }

  const foodId = document.getElementById("food-id").value;
  const food = {
    id: foodId || crypto.randomUUID(),
    nimi: name,
    ateriatyyppi: formData.get("ateriatyyppi"),
    kohderyhmä: formData.get("kohderyhmä"),
    syöntikerrat: clampNumber(formData.get("syöntikerrat"), 1, 5, 1),
    ruokatyyppi: formData.get("ruokatyyppi"),
    suosikki_indeksi: clampNumber(formData.get("suosikki_indeksi"), 1, 5, 1),
    ostoslista: String(formData.get("ostoslista") || "").trim(),
    resepti: String(formData.get("resepti") || "").trim(),
    reseptilinkki: String(formData.get("reseptilinkki") || "").trim(),
    muistiinpanot: String(formData.get("muistiinpanot") || "").trim(),
  };

  const existingIndex = state.foods.findIndex((item) => item.id === food.id);
  if (existingIndex >= 0) {
    state.foods[existingIndex] = food;
  } else {
    state.foods.unshift(food);
  }

  saveState();
  resetFoodForm();
  activeView = "ruokapankki";
  render();
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, number));
}

function resetFoodForm() {
  elements.foodForm.reset();
  document.getElementById("food-id").value = "";
  document.getElementById("syöntikerrat").value = "1";
  document.getElementById("suosikki_indeksi").value = "1";
  elements.formTitle.textContent = "Lisää ruoka";
  elements.cancelEditButton.classList.add("hidden");
}

function startEditFood(foodId) {
  const food = state.foods.find((item) => item.id === foodId);
  if (!food) {
    return;
  }

  document.getElementById("food-id").value = food.id;
  document.getElementById("nimi").value = food.nimi;
  document.getElementById("ateriatyyppi").value = food.ateriatyyppi;
  document.getElementById("kohderyhmä").value = food.kohderyhmä;
  document.getElementById("syöntikerrat").value = String(food.syöntikerrat);
  document.getElementById("ruokatyyppi").value = food.ruokatyyppi;
  document.getElementById("suosikki_indeksi").value = String(food.suosikki_indeksi);
  document.getElementById("ostoslista").value = food.ostoslista || "";
  document.getElementById("resepti").value = food.resepti || "";
  document.getElementById("reseptilinkki").value = food.reseptilinkki || "";
  document.getElementById("muistiinpanot").value = food.muistiinpanot || "";
  elements.formTitle.textContent = "Muokkaa ruokaa";
  elements.cancelEditButton.classList.remove("hidden");
  activeView = "lomake";
  renderViewState();
}

function deleteFood(foodId) {
  const food = state.foods.find((item) => item.id === foodId);
  if (!food) {
    return;
  }

  const confirmed = window.confirm(`Poistetaanko ruoka "${food.nimi}"?`);
  if (!confirmed) {
    return;
  }

  state.foods = state.foods.filter((item) => item.id !== foodId);
  removeFoodFromWeek(state.weeks.current, foodId);
  removeFoodFromWeek(state.weeks.previous, foodId);
  saveState();
  render();
}

function removeFoodFromWeek(week, foodId) {
  if (!week) {
    return;
  }

  week.days.forEach((day) => {
    Object.values(day.slots).forEach((slot) => {
      if (slot.foodId === foodId) {
        slot.foodId = "";
        slot.mealType = "";
        slot.locked = false;
        slot.autoFilled = false;
      }
    });
  });
}

function openFoodDetails(foodId) {
  const food = state.foods.find((item) => item.id === foodId);
  if (!food) {
    return;
  }

  elements.foodDetailContent.innerHTML = `
    <h3>${escapeHtml(food.nimi)}</h3>
    <div class="detail-section"><span class="badge">${escapeHtml(food.ateriatyyppi)}</span><span class="badge">${escapeHtml(food.kohderyhmä)}</span><span class="badge">${escapeHtml(food.ruokatyyppi)}</span></div>
    <section>
      <h4>Ostoslista</h4>
      <p>${formatMultiline(food.ostoslista)}</p>
    </section>
    <section>
      <h4>Resepti</h4>
      <p>${formatMultiline(food.resepti)}</p>
    </section>
    <section>
      <h4>Reseptilinkki</h4>
      <p>${food.reseptilinkki ? `<a href="${escapeAttribute(food.reseptilinkki)}" target="_blank" rel="noreferrer">${escapeHtml(food.reseptilinkki)}</a>` : "Ei linkkiä."}</p>
    </section>
    <section>
      <h4>Muistiinpanot</h4>
      <p>${formatMultiline(food.muistiinpanot)}</p>
    </section>
  `;
  elements.foodDetailDialog.showModal();
}

function formatMultiline(value) {
  if (!value) {
    return "Ei sisältöä.";
  }
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function renderFoodLibrary() {
  if (!state.foods.length) {
    elements.foodLibrary.replaceChildren(createEmptyState("Ruokapankki on vielä tyhjä. Lisää ensimmäinen ruoka."));
    return;
  }

  const list = document.createElement("div");
  list.className = "food-library-list";

  state.foods
    .slice()
    .sort((a, b) => a.nimi.localeCompare(b.nimi, "fi"))
    .forEach((food) => {
      const card = document.createElement("article");
      card.className = "food-card";
      card.innerHTML = `
        <div class="food-card-header">
          <div>
            <h3>${escapeHtml(food.nimi)}</h3>
            <div class="food-meta">
              <span class="badge">${escapeHtml(food.ateriatyyppi)}</span>
              <span class="badge">${escapeHtml(food.kohderyhmä)}</span>
              <span class="badge">${food.syöntikerrat} krt</span>
              <span class="badge">${escapeHtml(food.ruokatyyppi)}</span>
              <span class="badge">Suosikki ${food.suosikki_indeksi}/5</span>
            </div>
          </div>
          <div class="food-card-actions">
            <button class="secondary-button" data-action="details" data-food-id="${food.id}">Näytä tiedot</button>
            <button class="secondary-button" data-action="edit" data-food-id="${food.id}">Muokkaa</button>
            <button class="secondary-button" data-action="delete" data-food-id="${food.id}">Poista</button>
          </div>
        </div>
      `;

      card.querySelector('[data-action="details"]').addEventListener("click", () => openFoodDetails(food.id));
      card.querySelector('[data-action="edit"]').addEventListener("click", () => startEditFood(food.id));
      card.querySelector('[data-action="delete"]').addEventListener("click", () => deleteFood(food.id));
      list.appendChild(card);
    });

  elements.foodLibrary.replaceChildren(list);
}

function renderWeekPlanner() {
  const week = getActiveWeek();
  elements.weekLabel.textContent = week ? week.label : "";

  if (!week) {
    elements.weekPlan.replaceChildren(createEmptyState("Edellistä viikkoa ei ole vielä tallennettu."));
    return;
  }

  if (!state.foods.length && activeWeekView === "current") {
    elements.weekPlan.replaceChildren(createEmptyState("Lisää ensin ruokia Ruokapankkiin, niin voit suunnitella viikon."));
    return;
  }

  const isReadOnly = activeWeekView === "previous";
  const grid = document.createElement("div");
  grid.className = "week-grid";

  week.days.forEach((day, dayIndex) => {
    const card = document.createElement("article");
    card.className = "day-card";

    const dayHeader = document.createElement("div");
    dayHeader.className = "day-header";
    dayHeader.innerHTML = `
      <h4>${day.dayName}</h4>
      <p class="muted">${day.dateLabel}</p>
    `;
    card.appendChild(dayHeader);

    const slotList = document.createElement("div");
    slotList.className = "slot-list";

    SLOT_DEFS.forEach((slotDef) => {
      if (slotDef.optional && !day.showChildrenMeal && activeWeekView !== "previous") {
        return;
      }

      if (slotDef.optional && activeWeekView === "previous" && !day.showChildrenMeal && !day.slots.lastenruoka.foodId) {
        return;
      }

      slotList.appendChild(createSlotCard(week, dayIndex, slotDef, isReadOnly));
    });

    if (!isReadOnly) {
      const toggle = document.createElement("button");
      toggle.className = "secondary-button";
      toggle.textContent = day.showChildrenMeal ? "Piilota lasten ruoka" : "Lisää lasten ruoka";
      toggle.addEventListener("click", () => {
        day.showChildrenMeal = !day.showChildrenMeal;
        if (!day.showChildrenMeal) {
          day.slots.lastenruoka = createEmptySlot();
        }
        saveState();
        renderWeekPlanner();
        renderShoppingList();
        renderUsageSummary();
      });
      card.appendChild(toggle);
    }

    card.appendChild(slotList);
    grid.appendChild(card);
  });

  elements.weekPlan.replaceChildren(grid);
}

function createSlotCard(week, dayIndex, slotDef, isReadOnly) {
  const day = week.days[dayIndex];
  const slot = day.slots[slotDef.key];
  const card = document.createElement("div");
  card.className = "slot-card";

  if (slot.autoFilled) {
    card.classList.add("auto-filled");
  }
  if (slot.locked) {
    card.classList.add("locked");
  }
  if (isReadOnly) {
    card.classList.add("read-only");
  }

  const food = state.foods.find((item) => item.id === slot.foodId);
  const mealTypeLabel = MEAL_TYPE_OPTIONS.find((item) => item.value === slot.mealType)?.short || "Ei valintaa";
  const badges = [];
  if (slot.locked) {
    badges.push('<span class="badge locked">Lukittu</span>');
  }
  if (slot.autoFilled) {
    badges.push('<span class="badge auto">Automaattinen</span>');
  }
  if (slot.mealType) {
    badges.push(`<span class="badge meal-type">${escapeHtml(mealTypeLabel)}</span>`);
  }

  const header = document.createElement("div");
  header.className = "slot-header";
  header.innerHTML = `
    <strong>${slotDef.label}</strong>
    <div class="slot-badges">${badges.join("")}</div>
  `;
  card.appendChild(header);

  if (isReadOnly) {
    const summary = document.createElement("div");
    summary.className = "tiny-text";
    summary.innerHTML = food
      ? `${escapeHtml(food.nimi)}<br>${escapeHtml(food.ateriatyyppi)} • ${escapeHtml(food.kohderyhmä)}`
      : "Ei valintaa.";
    card.appendChild(summary);
    return card;
  }

  const controls = document.createElement("div");
  controls.className = "slot-controls";

  const foodSelect = document.createElement("select");
  foodSelect.innerHTML = `<option value="">Valitse ruoka</option>${buildFoodOptions(day, slotDef, slot.foodId)}`;
  foodSelect.value = slot.foodId || "";
  foodSelect.disabled = slot.locked;
  foodSelect.addEventListener("change", (event) => {
    updateSlotFood(dayIndex, slotDef.key, event.target.value);
  });

  const mealTypeSelect = document.createElement("select");
  mealTypeSelect.innerHTML = '<option value="">Valitse tapa</option>' +
    MEAL_TYPE_OPTIONS.map((option) => `<option value="${option.value}">${option.label}</option>`).join("");
  mealTypeSelect.value = slot.mealType || "";
  mealTypeSelect.disabled = !slot.foodId || slot.locked;
  mealTypeSelect.addEventListener("change", (event) => {
    updateSlotMealType(dayIndex, slotDef.key, event.target.value);
  });

  const metaRow = document.createElement("div");
  metaRow.className = "slot-meta";

  const lockButton = document.createElement("button");
  lockButton.className = "secondary-button";
  lockButton.textContent = slot.locked ? "Avaa lukitus" : "Lukitse";
  lockButton.addEventListener("click", () => {
    slot.locked = !slot.locked;
    saveState();
    renderWeekPlanner();
  });

  const clearButton = document.createElement("button");
  clearButton.className = "secondary-button";
  clearButton.textContent = "Tyhjennä";
  clearButton.disabled = slot.locked;
  clearButton.addEventListener("click", () => {
    day.slots[slotDef.key] = createEmptySlot();
    saveState();
    render();
  });

  metaRow.append(lockButton, clearButton);
  controls.append(foodSelect, mealTypeSelect, metaRow);
  card.appendChild(controls);
  return card;
}

function buildFoodOptions(day, slotDef, selectedFoodId) {
  return getSelectableFoods(day, slotDef, selectedFoodId)
    .map(
      (food) =>
        `<option value="${food.id}">${escapeHtml(
          `${food.nimi} • ${food.ateriatyyppi} • ${food.kohderyhmä} • ${food.syöntikerrat} krt • ${food.ruokatyyppi}`
        )}</option>`
    )
    .join("");
}

function getSelectableFoods(day, slotDef, selectedFoodId = "") {
  const takenFoodIds = new Set(
    Object.entries(day.slots)
      .filter(([key, slot]) => key !== slotDef.key && slot.foodId)
      .map(([, slot]) => slot.foodId)
  );

  return state.foods.filter((food) => {
    if (food.id !== selectedFoodId && takenFoodIds.has(food.id)) {
      return false;
    }

    if (slotDef.key === "lounas" && !["lounas", "molemmat"].includes(food.ateriatyyppi)) {
      return false;
    }

    if (slotDef.key === "paivallinen" && !["päivällinen", "molemmat"].includes(food.ateriatyyppi)) {
      return false;
    }

    return true;
  });
}

function updateSlotFood(dayIndex, slotKey, foodId) {
  const day = state.weeks.current.days[dayIndex];
  const slot = day.slots[slotKey];

  if (slot.locked) {
    return;
  }

  if (foodId && isFoodAlreadyUsedOnDay(day, slotKey, foodId)) {
    window.alert("Samaa ruokaa ei voi käyttää saman päivän kahdessa kohdassa.");
    renderWeekPlanner();
    return;
  }

  slot.foodId = foodId;
  slot.autoFilled = false;

  if (!foodId) {
    slot.mealType = "";
    slot.locked = false;
  } else {
    const food = state.foods.find((item) => item.id === foodId);
    if (food?.ruokatyyppi === "valmisruoka") {
      slot.mealType = "valmisruoka";
    } else if (!slot.mealType) {
      slot.mealType = "valmistetaan";
    }
  }

  saveState();
  render();
}

function updateSlotMealType(dayIndex, slotKey, mealType) {
  const day = state.weeks.current.days[dayIndex];
  const slot = day.slots[slotKey];
  if (slot.locked) {
    return;
  }
  slot.mealType = mealType;
  slot.autoFilled = false;
  saveState();
  renderWeekPlanner();
}

function isFoodAlreadyUsedOnDay(day, currentSlotKey, foodId) {
  return Object.entries(day.slots).some(([slotKey, slot]) => slotKey !== currentSlotKey && slot.foodId === foodId);
}

function renderUsageSummary() {
  if (!state.foods.length) {
    elements.usageSummary.replaceChildren(createEmptyState("Käyttöyhteenveto ilmestyy, kun ruokia on lisätty."));
    return;
  }

  const usage = getWeekUsage(state.weeks.current);
  const list = document.createElement("div");
  list.className = "usage-list";

  state.foods
    .slice()
    .sort((a, b) => a.nimi.localeCompare(b.nimi, "fi"))
    .forEach((food) => {
      const used = usage[food.id] || 0;
      const remaining = food.syöntikerrat - used;
      const card = document.createElement("div");
      card.className = "usage-card";
      card.innerHTML = `
        <strong>${escapeHtml(food.nimi)}</strong>
        <p class="muted">Käytössä ${used} / ${food.syöntikerrat} kertaa. Jäljellä ${remaining}.</p>
      `;
      list.appendChild(card);
    });

  elements.usageSummary.replaceChildren(list);
}

function getWeekUsage(week) {
  const usage = {};
  if (!week) {
    return usage;
  }

  week.days.forEach((day) => {
    Object.values(day.slots).forEach((slot) => {
      if (slot.foodId) {
        usage[slot.foodId] = (usage[slot.foodId] || 0) + 1;
      }
    });
  });
  return usage;
}

function renderShoppingList() {
  const week = getActiveWeek();
  if (!week) {
    elements.shoppingList.replaceChildren(createEmptyState("Ei ostoslistaa näytettävänä."));
    return;
  }

  const shopping = buildShoppingData(week);
  if (!shopping.combined.length && !shopping.grouped.length) {
    elements.shoppingList.replaceChildren(createEmptyState("Kauppalista muodostuu valituista ruoista."));
    return;
  }

  if (shoppingMode === "grouped") {
    const groupList = document.createElement("div");
    groupList.className = "shopping-list";

    shopping.grouped.forEach((group) => {
      const card = document.createElement("div");
      card.className = "shopping-card";
      const listItems = group.items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
      card.innerHTML = `
        <strong>${escapeHtml(group.foodName)}</strong>
        <ul>${listItems}</ul>
      `;
      groupList.appendChild(card);
    });

    elements.shoppingList.replaceChildren(groupList);
    return;
  }

  const list = document.createElement("div");
  list.className = "shopping-list";

  shopping.combined.forEach((item) => {
    const row = document.createElement("div");
    row.className = "shopping-card";

    const checkbox = document.createElement("label");
    checkbox.className = "shopping-check-row";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = Boolean(week.shoppingChecks[item.key]);
    input.disabled = activeWeekView === "previous";
    input.addEventListener("change", (event) => {
      week.shoppingChecks[item.key] = event.target.checked;
      saveState();
    });

    const text = document.createElement("div");
    text.innerHTML = `
      <strong>${escapeHtml(item.label)}</strong>
      <div class="tiny-text">${escapeHtml(item.sources.join(", "))}</div>
    `;

    checkbox.append(input, text);
    row.appendChild(checkbox);
    list.appendChild(row);
  });

  elements.shoppingList.replaceChildren(list);
}

function buildShoppingData(week) {
  const grouped = [];
  const combinedMap = new Map();

  collectWeekFoods(week).forEach((food) => {
    if (!food?.ostoslista) {
      return;
    }

    const items = splitShoppingText(food.ostoslista);
    if (!items.length) {
      return;
    }

    grouped.push({ foodName: food.nimi, items });

    items.forEach((item) => {
      const key = item.toLocaleLowerCase("fi");
      const existing = combinedMap.get(key);
      if (existing) {
        if (!existing.sources.includes(food.nimi)) {
          existing.sources.push(food.nimi);
        }
      } else {
        combinedMap.set(key, {
          key,
          label: item,
          sources: [food.nimi],
        });
      }
    });
  });

  return {
    grouped,
    combined: Array.from(combinedMap.values()).sort((a, b) => a.label.localeCompare(b.label, "fi")),
  };
}

function splitShoppingText(value) {
  return value
    .split(/\n|,|;/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function collectWeekFoods(week) {
  const foodsById = new Map();
  if (!week) {
    return [];
  }

  week.days.forEach((day) => {
    Object.values(day.slots).forEach((slot) => {
      if (!slot.foodId) {
        return;
      }
      const food = state.foods.find((item) => item.id === slot.foodId);
      if (food && !foodsById.has(food.id)) {
        foodsById.set(food.id, food);
      }
    });
  });
  return Array.from(foodsById.values());
}

function autoFillWeek() {
  if (!state.foods.length) {
    window.alert("Lisää ensin ruokia Ruokapankkiin.");
    return;
  }

  const week = state.weeks.current;
  const usage = getWeekUsage(week);

  week.days.forEach((day, dayIndex) => {
    SLOT_DEFS.forEach((slotDef) => {
      if (slotDef.optional && !day.showChildrenMeal) {
        return;
      }

      const slot = day.slots[slotDef.key];
      if (slot.locked || slot.foodId) {
        return;
      }

      const candidate = chooseFoodForSlot(week, dayIndex, slotDef, usage);
      if (!candidate) {
        return;
      }

      slot.foodId = candidate.id;
      slot.autoFilled = true;
      slot.mealType = determineAutoMealType(candidate, usage[candidate.id] || 0);
      usage[candidate.id] = (usage[candidate.id] || 0) + 1;
    });
  });

  saveState();
  render();
}

function chooseFoodForSlot(week, dayIndex, slotDef, usage) {
  const day = week.days[dayIndex];
  const candidates = getSelectableFoods(day, slotDef).filter((food) => {
    if (slotDef.key === "lastenruoka") {
      return ["koko perhe", "lapset"].includes(food.kohderyhmä);
    }
    return ["koko perhe", "aikuiset"].includes(food.kohderyhmä);
  });

  if (!candidates.length) {
    return null;
  }

  const ranked = candidates
    .map((food) => ({
      food,
      score: scoreFoodCandidate(week, dayIndex, food, usage[food.id] || 0),
    }))
    .sort((a, b) => b.score - a.score || a.food.nimi.localeCompare(b.food.nimi, "fi"));

  return ranked[0]?.food || null;
}

function scoreFoodCandidate(week, dayIndex, food, currentUsage) {
  let score = food.suosikki_indeksi * 10;
  const remaining = Math.max(food.syöntikerrat - currentUsage, -2);
  score += remaining * 3;

  if (currentUsage === 0) {
    score += 5;
  }

  if (currentUsage >= food.syöntikerrat) {
    score -= 8;
  }

  if (food.ruokatyyppi === "valmisruoka") {
    score += 1;
  }

  const recentReuseBonus = hasRecentUsage(week, dayIndex, food.id) ? 4 : 0;
  score += recentReuseBonus;

  return score;
}

function hasRecentUsage(week, dayIndex, foodId) {
  const start = Math.max(0, dayIndex - 2);
  for (let index = start; index < dayIndex; index += 1) {
    const day = week.days[index];
    if (Object.values(day.slots).some((slot) => slot.foodId === foodId)) {
      return true;
    }
  }
  return false;
}

function determineAutoMealType(food, currentUsage) {
  if (food.ruokatyyppi === "valmisruoka") {
    return "valmisruoka";
  }
  return currentUsage === 0 ? "valmistetaan" : "syodaan_aiemmin_tehtya";
}

function clearAutoFilledSlots() {
  const week = state.weeks.current;
  week.days.forEach((day) => {
    Object.keys(day.slots).forEach((slotKey) => {
      const slot = day.slots[slotKey];
      if (slot.autoFilled && !slot.locked) {
        day.slots[slotKey] = createEmptySlot();
      }
    });
  });
  saveState();
  render();
}

function getActiveWeek() {
  return activeWeekView === "previous" ? state.weeks.previous : state.weeks.current;
}

function createEmptyState(text) {
  const template = document.getElementById("empty-state-template");
  const node = template.content.firstElementChild.cloneNode(true);
  node.querySelector("p").textContent = text;
  return node;
}
