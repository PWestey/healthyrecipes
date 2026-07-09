(function () {
  const data = window.MEAL_PLANNER_DATA || { recipes: [], guides: [], defaults: {}, stats: {} };
  const curatedData = window.CURATED_RECIPES || { recipes: [] };
  const curatedMap = new Map((curatedData.recipes || []).map((recipe) => [recipe.id, recipe]));
  const recipes = (data.recipes || []).map((recipe) => {
    const curated = curatedMap.get(recipe.id);
    return curated ? { ...recipe, ...curated, isCurated: true, curationStatus: "curated", curationIssues: [] } : recipe;
  });
  const guides = data.guides || [];
  const dinnerRecipes = recipes.filter((recipe) => recipe.category === "Dinner");
  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  const storageKey = "privateMealPlannerState.v1";
  const proteinTypes = ["Chicken", "Beef", "Fish", "Turkey", "Pork", "Meatless", "Other"];

  const els = {
    statRecipes: document.getElementById("statRecipes"),
    statCurated: document.getElementById("statCurated"),
    statGuides: document.getElementById("statGuides"),
    statSelected: document.getElementById("statSelected"),
    servingsInput: document.getElementById("servingsInput"),
    mealTargetInput: document.getElementById("mealTargetInput"),
    healthyFocusToggle: document.getElementById("healthyFocusToggle"),
    guideSourcesToggle: document.getElementById("guideSourcesToggle"),
    curatedOnlyToggle: document.getElementById("curatedOnlyToggle"),
    beginnerReadyToggle: document.getElementById("beginnerReadyToggle"),
    proteinFocusOptions: document.getElementById("proteinFocusOptions"),
    proteinExcludeOptions: document.getElementById("proteinExcludeOptions"),
    reviewToggle: document.getElementById("reviewToggle"),
    activeCard: document.getElementById("activeCard"),
    passButton: document.getElementById("passButton"),
    keepButton: document.getElementById("keepButton"),
    randomButton: document.getElementById("randomButton"),
    selectedList: document.getElementById("selectedList"),
    clearPlanButton: document.getElementById("clearPlanButton"),
    buildFromPickerButton: document.getElementById("buildFromPickerButton"),
    recipeSearch: document.getElementById("recipeSearch"),
    categoryFilter: document.getElementById("categoryFilter"),
    qualityFilter: document.getElementById("qualityFilter"),
    readinessFilter: document.getElementById("readinessFilter"),
    recipeGrid: document.getElementById("recipeGrid"),
    guideSearch: document.getElementById("guideSearch"),
    guideCategoryFilter: document.getElementById("guideCategoryFilter"),
    guideGrid: document.getElementById("guideGrid"),
    buildPlanButton: document.getElementById("buildPlanButton"),
    planMeals: document.getElementById("planMeals"),
    groceryList: document.getElementById("groceryList"),
    cookingPlan: document.getElementById("cookingPlan"),
  };

  const state = loadState();
  let currentRecipe = null;
  let skipped = new Set();
  let drag = null;

  function loadState() {
    const defaults = data.defaults || {};
    const fallback = {
      servings: defaults.servings || 5,
      mealTarget: defaults.mealTarget || 5,
      healthyFocus: defaults.healthyFocus !== false,
      includeGuideSources: false,
      curatedOnly: true,
      beginnerReadyOnly: true,
      includeReviewInLibrary: false,
      proteinFocus: [],
      proteinExclude: [],
      selectedIds: [],
      activeTab: "picker",
    };
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
      return {
        ...fallback,
        ...saved,
        proteinFocus: Array.isArray(saved.proteinFocus) ? saved.proteinFocus.filter((type) => proteinTypes.includes(type)) : [],
        proteinExclude: Array.isArray(saved.proteinExclude) ? saved.proteinExclude.filter((type) => proteinTypes.includes(type)) : [],
        selectedIds: Array.isArray(saved.selectedIds) ? saved.selectedIds.filter((id) => recipeById.has(id)) : [],
      };
    } catch (_error) {
      return fallback;
    }
  }

  function saveState() {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        servings: state.servings,
        mealTarget: state.mealTarget,
        healthyFocus: state.healthyFocus,
        includeGuideSources: state.includeGuideSources,
        curatedOnly: state.curatedOnly,
        beginnerReadyOnly: state.beginnerReadyOnly,
        includeReviewInLibrary: state.includeReviewInLibrary,
        proteinFocus: state.proteinFocus,
        proteinExclude: state.proteinExclude,
        selectedIds: state.selectedIds,
        activeTab: state.activeTab,
      })
    );
  }

  function init() {
    els.statRecipes.textContent = String(dinnerRecipes.length);
    els.statCurated.textContent = String(dinnerRecipes.filter((recipe) => recipe.curationStatus === "curated").length);
    els.statGuides.textContent = String(data.stats?.guideCount || guides.length);
    els.servingsInput.value = state.servings;
    els.mealTargetInput.value = state.mealTarget;
    els.healthyFocusToggle.checked = state.healthyFocus;
    els.guideSourcesToggle.checked = state.includeGuideSources;
    els.curatedOnlyToggle.checked = state.curatedOnly;
    els.beginnerReadyToggle.checked = state.beginnerReadyOnly;
    els.reviewToggle.checked = state.includeReviewInLibrary;
    populateSelects();
    renderProteinControls();
    bindEvents();
    activateTab(state.activeTab || "picker");
    chooseRandom();
    renderAll();
  }

  function populateSelects() {
    const recipeCategories = [...new Set(recipes.map((recipe) => recipe.category).filter(Boolean))].sort();
    const guideCategories = [...new Set(guides.map((guide) => guide.category).filter(Boolean))].sort();
    recipeCategories.forEach((category) => {
      els.categoryFilter.append(new Option(category, category));
    });
    guideCategories.forEach((category) => {
      els.guideCategoryFilter.append(new Option(category, category));
    });
  }

  function renderProteinControls() {
    renderProteinGroup(els.proteinFocusOptions, "focus", state.proteinFocus, "is-focus");
    renderProteinGroup(els.proteinExcludeOptions, "exclude", state.proteinExclude, "is-exclude");
  }

  function renderProteinGroup(container, mode, activeTypes, activeClass) {
    if (!container) return;
    container.innerHTML = proteinTypes
      .map((type) => {
        const active = activeTypes.includes(type);
        return `<button class="protein-chip ${active ? activeClass : ""}" type="button" data-protein-mode="${mode}" data-protein-type="${type}" aria-pressed="${active}">${type}</button>`;
      })
      .join("");
  }

  function bindEvents() {
    document.querySelectorAll(".tab").forEach((button) => {
      button.addEventListener("click", () => activateTab(button.dataset.tab));
    });

    els.servingsInput.addEventListener("change", () => {
      state.servings = clampNumber(els.servingsInput.value, 1, 30, 5);
      els.servingsInput.value = state.servings;
      saveState();
      renderAll();
    });

    els.mealTargetInput.addEventListener("change", () => {
      state.mealTarget = clampNumber(els.mealTargetInput.value, 1, 21, 5);
      els.mealTargetInput.value = state.mealTarget;
      saveState();
      renderAll();
    });

    els.healthyFocusToggle.addEventListener("change", () => {
      state.healthyFocus = els.healthyFocusToggle.checked;
      skipped = new Set();
      saveState();
      chooseRandom();
      renderAll();
    });

    els.guideSourcesToggle.addEventListener("change", () => {
      state.includeGuideSources = els.guideSourcesToggle.checked;
      skipped = new Set();
      saveState();
      chooseRandom();
      renderAll();
    });

    els.curatedOnlyToggle.addEventListener("change", () => {
      state.curatedOnly = els.curatedOnlyToggle.checked;
      skipped = new Set();
      saveState();
      chooseRandom();
      renderAll();
    });

    els.beginnerReadyToggle.addEventListener("change", () => {
      state.beginnerReadyOnly = els.beginnerReadyToggle.checked;
      skipped = new Set();
      saveState();
      chooseRandom();
      renderAll();
    });

    els.reviewToggle.addEventListener("change", () => {
      state.includeReviewInLibrary = els.reviewToggle.checked;
      saveState();
      renderRecipeLibrary();
    });

    els.randomButton.addEventListener("click", chooseRandom);
    els.passButton.addEventListener("click", passCurrent);
    els.keepButton.addEventListener("click", keepCurrent);
    els.clearPlanButton.addEventListener("click", clearPlan);
    els.buildPlanButton.addEventListener("click", buildPlan);
    els.buildFromPickerButton.addEventListener("click", buildPlan);
    els.recipeSearch.addEventListener("input", renderRecipeLibrary);
    els.categoryFilter.addEventListener("change", renderRecipeLibrary);
    els.qualityFilter.addEventListener("change", renderRecipeLibrary);
    els.readinessFilter.addEventListener("change", renderRecipeLibrary);
    els.guideSearch.addEventListener("input", renderGuideLibrary);
    els.guideCategoryFilter.addEventListener("change", renderGuideLibrary);

    els.proteinFocusOptions.addEventListener("click", onProteinClick);
    els.proteinExcludeOptions.addEventListener("click", onProteinClick);
    els.recipeGrid.addEventListener("click", onRecipeGridClick);
    els.guideGrid.addEventListener("click", onGuideGridClick);
    els.selectedList.addEventListener("click", onSelectedClick);
    els.planMeals.addEventListener("click", onSelectedClick);

    els.activeCard.addEventListener("pointerdown", startDrag);
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", endDrag);

    window.addEventListener("keydown", (event) => {
      if (event.target.matches("input, select, textarea")) return;
      if (event.key === "ArrowRight") keepCurrent();
      if (event.key === "ArrowLeft") passCurrent();
      if (event.key.toLowerCase() === "r") chooseRandom();
    });
  }

  function onProteinClick(event) {
    const button = event.target.closest("button[data-protein-type]");
    if (!button) return;
    const type = button.dataset.proteinType;
    const mode = button.dataset.proteinMode;
    if (!proteinTypes.includes(type)) return;
    const ownKey = mode === "focus" ? "proteinFocus" : "proteinExclude";
    const otherKey = mode === "focus" ? "proteinExclude" : "proteinFocus";
    state[ownKey] = toggleArrayValue(state[ownKey], type);
    state[otherKey] = state[otherKey].filter((value) => value !== type);
    skipped = new Set();
    saveState();
    renderProteinControls();
    chooseRandom();
    renderAll();
  }

  function activateTab(tabName) {
    const valid = ["picker", "recipes", "guides", "plan"].includes(tabName) ? tabName : "picker";
    state.activeTab = valid;
    document.querySelectorAll(".tab").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.tab === valid);
    });
    document.querySelectorAll(".view").forEach((view) => {
      view.classList.toggle("is-active", view.id === `view-${valid}`);
    });
    saveState();
    if (valid === "recipes") renderRecipeLibrary();
    if (valid === "guides") renderGuideLibrary();
    if (valid === "plan") renderPlan();
  }

  function renderAll() {
    renderStats();
    renderActiveCard();
    renderSelected();
    renderPlan();
    if (state.activeTab === "recipes") renderRecipeLibrary();
    if (state.activeTab === "guides") renderGuideLibrary();
  }

  function renderStats() {
    els.statSelected.textContent = `${state.selectedIds.length}/${state.mealTarget}`;
  }

  function selectedRecipes() {
    return state.selectedIds.map((id) => recipeById.get(id)).filter(Boolean);
  }

  function eligibleRecipes() {
    const selected = new Set(state.selectedIds);
    let pool = recipes.filter((recipe) => !selected.has(recipe.id) && !skipped.has(recipe.id));
    if (state.healthyFocus) {
      pool = pool.filter((recipe) => recipe.healthLevel === "preferred" && recipe.extractionQuality !== "limited");
    }
    if (!state.includeGuideSources) {
      pool = pool.filter((recipe) => recipe.sourceKind !== "guide");
    }
    if (state.curatedOnly) {
      pool = pool.filter((recipe) => recipe.curationStatus === "curated");
    }
    if (state.beginnerReadyOnly) {
      pool = pool.filter((recipe) => recipe.curationStatus === "beginner_ready" || recipe.curationStatus === "curated");
    }
    if (state.proteinFocus.length) {
      pool = pool.filter((recipe) => getProteinTypes(recipe).some((type) => state.proteinFocus.includes(type)));
    }
    if (state.proteinExclude.length) {
      pool = pool.filter((recipe) => !getProteinTypes(recipe).some((type) => state.proteinExclude.includes(type)));
    }
    pool = pool.filter((recipe) => getGroceryItems(recipe).length > 0 || getRecipeSteps(recipe).length > 0);
    if (pool.length === 0 && skipped.size) {
      skipped = new Set();
      return eligibleRecipes();
    }
    return pool;
  }

  function chooseRandom() {
    const pool = eligibleRecipes();
    if (!pool.length) {
      currentRecipe = null;
      renderActiveCard();
      return;
    }
    currentRecipe = pool[Math.floor(Math.random() * pool.length)];
    renderActiveCard();
  }

  function keepCurrent() {
    if (!currentRecipe) return;
    if (!state.selectedIds.includes(currentRecipe.id)) {
      state.selectedIds.push(currentRecipe.id);
      saveState();
    }
    chooseRandom();
    renderAll();
  }

  function passCurrent() {
    if (!currentRecipe) return;
    skipped.add(currentRecipe.id);
    chooseRandom();
    renderAll();
  }

  function clearPlan() {
    state.selectedIds = [];
    saveState();
    chooseRandom();
    renderAll();
  }

  function buildPlan() {
    activateTab("plan");
    renderPlan();
  }

  function renderActiveCard() {
    if (!currentRecipe) {
      els.activeCard.innerHTML = `<div class="card-empty">No dinners match the current charms</div>`;
      return;
    }

    const recipe = currentRecipe;
    const macros = macroPills(recipe);
    const servings = recipe.baseServings ? `Base ${formatServing(recipe.baseServings)} servings` : "Base servings unknown";
    const groceries = getGroceryItems(recipe);
    const ingredientItems = groceries.slice(0, 14).map((line) => `<li>${escapeHtml(scaleIngredient(line, recipe))}</li>`).join("");
    const cookingFlow = flowHtml(recipe, 8);
    const review = reviewPill(recipe);

    els.activeCard.innerHTML = `
      <div class="pill-row">
        <span class="pill blue">${escapeHtml(recipe.category)}</span>
        <span class="pill">${escapeHtml(recipe.extractionQuality)}</span>
        ${curationPill(recipe)}
        <span class="pill">${escapeHtml(servings)}</span>
        ${sourcePill("Grocery", recipe.grocerySource)}
        ${review}
        ${macros}
      </div>
      <h2 class="recipe-title">${escapeHtml(recipe.title)}</h2>
      <div class="pill-row">
        ${getProteinTypes(recipe).map((type) => `<span class="pill blue">${escapeHtml(type)}</span>`).join("")}
        ${recipe.tags.slice(0, 8).map((tag) => `<span class="pill">${escapeHtml(tag)}</span>`).join("")}
      </div>
      <div class="recipe-columns">
        <div class="recipe-block">
          <h3>Market List</h3>
          ${ingredientItems ? `<ul>${ingredientItems}</ul>` : `<p class="card-note">Source text only</p>`}
        </div>
        <div class="recipe-block">
          <h3>Cooking Steps</h3>
          ${cookingFlow || `<p class="card-note">${escapeHtml(recipe.rawText.slice(0, 700))}</p>`}
        </div>
      </div>
      <p class="source-line">${escapeHtml(recipe.source)}${recipe.page ? `, page ${recipe.page}` : ""} · <a href="${recipe.sourceFileUrl}" target="_blank" rel="noreferrer">Open source</a></p>
    `;
  }

  function macroPills(recipe) {
    const macros = recipe.macros || {};
    const pills = [];
    pills.push(sourcePill("Macros", recipe.macroSource));
    if (macros.calories) pills.push(`<span class="pill amber">${macros.calories} cal</span>`);
    if (macros.protein) pills.push(`<span class="pill green">${formatNumber(macros.protein)}g protein</span>`);
    if (macros.carbs) pills.push(`<span class="pill">${formatNumber(macros.carbs)}g carbs</span>`);
    if (macros.fat) pills.push(`<span class="pill">${formatNumber(macros.fat)}g fat</span>`);
    return pills.join("");
  }

  function sourcePill(label, source) {
    const value = source || "unknown";
    const tone = value === "listed" ? "green" : value === "estimated" ? "amber" : "blue";
    const text = value === "mixed" ? "listed + estimate" : value;
    return `<span class="pill ${tone}">${escapeHtml(label)}: ${escapeHtml(text)}</span>`;
  }

  function curationPill(recipe) {
    if (recipe.curationStatus === "curated") {
      return `<span class="pill green">Curated</span>`;
    }
    if (recipe.curationStatus === "beginner_ready") {
      return `<span class="pill green">Beginner ready</span>`;
    }
    const issues = Array.isArray(recipe.curationIssues) && recipe.curationIssues.length ? `: ${recipe.curationIssues.slice(0, 2).join(", ")}` : "";
    return `<span class="pill amber">Needs cleanup${escapeHtml(issues)}</span>`;
  }

  function getHealthReviewFlags(recipe) {
    return Array.isArray(recipe.healthReviewFlags) ? recipe.healthReviewFlags.filter(Boolean) : [];
  }

  function reviewPill(recipe) {
    const flags = getHealthReviewFlags(recipe);
    if (!flags.length) return `<span class="pill green">Healthy focus</span>`;
    return `<span class="pill tomato">Tagged: ${escapeHtml(flags.slice(0, 3).join(", "))}</span>`;
  }

  function getGroceryItems(recipe) {
    return (recipe.groceryItems && recipe.groceryItems.length ? recipe.groceryItems : recipe.ingredients || []).filter(Boolean);
  }

  function getProteinTypes(recipe) {
    const types = Array.isArray(recipe.proteinTypes) && recipe.proteinTypes.length ? recipe.proteinTypes : inferProteinTypes(recipe);
    return types.filter((type, index) => types.indexOf(type) === index);
  }

  function inferProteinTypes(recipe) {
    const haystack = `${recipe.title} ${(recipe.tags || []).join(" ")} ${(recipe.groceryItems || recipe.ingredients || []).join(" ")}`.toLowerCase();
    const types = [];
    const checks = [
      ["Chicken", /\b(chicken|chicken tenders?)\b/],
      ["Beef", /\b(beef|steak|burger|meatball|bulgogi)\b/],
      ["Fish", /\b(fish|salmon|tuna|shrimp|cod|tilapia|seafood|crab)\b/],
      ["Turkey", /\bturkey\b/],
      ["Pork", /\b(pork|ham|bacon|pepperoni|prosciutto)\b/],
      ["Meatless", /\b(vegetarian|vegan|tofu|tempeh|egg whites?|eggs?|greek yogurt|cottage cheese|protein powder|beans|lentils)\b/],
    ];
    checks.forEach(([label, pattern]) => {
      if (pattern.test(haystack)) types.push(label);
    });
    if (types.includes("Turkey") && /\bturkey\s+(sausage|bacon|pepperoni)\b/.test(haystack)) {
      return types.filter((type) => type !== "Pork");
    }
    return types.length ? types : ["Other"];
  }

  function getRecipeSteps(recipe) {
    if (recipe.flowSections && recipe.flowSections.length) {
      return recipe.flowSections.flatMap((section) => section.steps || []).filter(Boolean);
    }
    return (recipe.instructions || []).filter(Boolean);
  }

  function flowHtml(recipe, limit) {
    const sections = recipe.flowSections && recipe.flowSections.length
      ? recipe.flowSections
      : [{ title: "Cook", steps: getRecipeSteps(recipe) }];
    let remaining = limit || 30;
    const html = [];
    sections.forEach((section) => {
      if (remaining <= 0) return;
      const steps = (section.steps || []).filter(Boolean).slice(0, remaining);
      if (!steps.length) return;
      remaining -= steps.length;
      html.push(`
        <div class="flow-section">
          <h4>${escapeHtml(section.title)}</h4>
          <ol>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>
        </div>
      `);
    });
    return html.join("");
  }

  function renderSelected() {
    const selected = selectedRecipes();
    renderStats();
    if (!selected.length) {
      els.selectedList.innerHTML = `<div class="empty-state">No feast picks yet</div>`;
      return;
    }
    els.selectedList.innerHTML = selected
      .map(
        (recipe) => `
        <article class="mini-card">
          <p class="mini-title">${escapeHtml(recipe.title)}</p>
          <div class="pill-row">
            <span class="pill">${escapeHtml(recipe.category)}</span>
            <span class="pill">${escapeHtml(recipe.extractionQuality)}</span>
            ${curationPill(recipe)}
            ${sourcePill("Grocery", recipe.grocerySource)}
            ${reviewPill(recipe)}
            ${getProteinTypes(recipe).map((type) => `<span class="pill blue">${escapeHtml(type)}</span>`).join("")}
          </div>
          <div class="mini-actions">
            <button type="button" data-action="view" data-id="${recipe.id}">View</button>
            <button type="button" data-action="remove" data-id="${recipe.id}">Remove</button>
          </div>
        </article>
      `
      )
      .join("");
  }

  function renderRecipeLibrary() {
    const query = els.recipeSearch.value.trim().toLowerCase();
    const category = els.categoryFilter.value;
    const quality = els.qualityFilter.value;
    const readiness = els.readinessFilter.value;
    const includeReview = state.includeReviewInLibrary;
    let list = recipes.filter((recipe) => {
      const haystack = `${recipe.title} ${recipe.source} ${recipe.tags.join(" ")} ${getProteinTypes(recipe).join(" ")} ${getHealthReviewFlags(recipe).join(" ")} ${recipe.sourcePath}`.toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (category !== "all" && recipe.category !== category) return false;
      if (quality !== "all" && recipe.extractionQuality !== quality) return false;
      if (readiness !== "all" && recipe.curationStatus !== readiness) return false;
      if (!includeReview && recipe.healthLevel === "review") return false;
      return true;
    });
    list = list.sort((a, b) => a.title.localeCompare(b.title));
    const total = list.length;
    list = list.slice(0, 240);

    if (!list.length) {
      els.recipeGrid.innerHTML = `<div class="empty-state">No dinner entries match</div>`;
      return;
    }

    const note = total > list.length ? `<div class="empty-state">Showing ${list.length} of ${total}. Search to narrow.</div>` : "";
    els.recipeGrid.innerHTML =
      note +
      list
        .map(
          (recipe) => `
          <article class="library-card">
            <div class="pill-row">
              ${reviewPill(recipe)}
              <span class="pill">${escapeHtml(recipe.category)}</span>
              <span class="pill">${escapeHtml(recipe.extractionQuality)}</span>
              ${curationPill(recipe)}
              ${sourcePill("Grocery", recipe.grocerySource)}
              ${getProteinTypes(recipe).map((type) => `<span class="pill blue">${escapeHtml(type)}</span>`).join("")}
            </div>
            <p class="library-title">${escapeHtml(recipe.title)}</p>
            <p class="card-note">${escapeHtml(recipe.source)}${recipe.page ? `, page ${recipe.page}` : ""} · macros ${escapeHtml(recipe.macroSource || "unknown")}</p>
            <div class="library-actions">
              <button type="button" data-action="add" data-id="${recipe.id}">Add</button>
              <button type="button" data-action="view" data-id="${recipe.id}">View</button>
            </div>
          </article>
        `
        )
        .join("");
  }

  function renderGuideLibrary() {
    const query = els.guideSearch.value.trim().toLowerCase();
    const category = els.guideCategoryFilter.value;
    const list = guides
      .filter((guide) => {
        const haystack = `${guide.title} ${guide.sourcePath} ${guide.tags.join(" ")}`.toLowerCase();
        if (query && !haystack.includes(query)) return false;
        if (category !== "all" && guide.category !== category) return false;
        return true;
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    if (!list.length) {
      els.guideGrid.innerHTML = `<div class="empty-state">No guides match</div>`;
      return;
    }

    els.guideGrid.innerHTML = list
      .map(
        (guide) => `
        <article class="guide-card">
          <div class="pill-row">
            <span class="pill blue">${escapeHtml(guide.category)}</span>
            <span class="pill">${escapeHtml(guide.format)}</span>
            ${guide.pageCount ? `<span class="pill">${guide.pageCount} pages</span>` : ""}
          </div>
          <p class="library-title">${escapeHtml(guide.title)}</p>
          <p class="card-note">${escapeHtml(guide.description)}${guide.recipeCount ? ` · ${guide.recipeCount} extracted recipes` : ""}</p>
          <div class="library-actions">
            <a class="text-button" href="${guide.sourceFileUrl}" target="_blank" rel="noreferrer">Open source</a>
          </div>
        </article>
      `
      )
      .join("");
  }

  function renderPlan() {
    const selected = selectedRecipes();
    renderStats();
    if (!selected.length) {
      els.planMeals.innerHTML = `<div class="empty-state">No feast picks yet</div>`;
      els.groceryList.innerHTML = `<div class="empty-state">No market list yet</div>`;
      els.cookingPlan.innerHTML = `<div class="empty-state">No cooking steps yet</div>`;
      return;
    }

    els.planMeals.innerHTML = selected
      .map(
        (recipe, index) => `
        <article class="meal-card">
          <div class="pill-row">
            <span class="pill blue">Dinner ${index + 1}</span>
            <span class="pill">${escapeHtml(recipe.category)}</span>
            <span class="pill">${recipe.baseServings ? `${formatServing(recipe.baseServings)} base servings` : "base unknown"}</span>
            ${sourcePill("Grocery", recipe.grocerySource)}
            ${reviewPill(recipe)}
          </div>
          <p class="library-title">${escapeHtml(recipe.title)}</p>
          <div class="mini-actions">
            <button type="button" data-action="view" data-id="${recipe.id}">View</button>
            <button type="button" data-action="remove" data-id="${recipe.id}">Remove</button>
          </div>
        </article>
      `
      )
      .join("");

    renderGroceries(selected);
    renderCooking(selected);
  }

  function renderGroceries(selected) {
    const combined = combineIngredients(selected);
    const combinedHtml = combined.length
      ? `<div class="grocery-group"><h3>Combined</h3><ul>${combined.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></div>`
      : "";

    const byRecipe = selected
      .map((recipe) => {
        const items = getGroceryItems(recipe).filter(isUsefulIngredientLine).slice(0, 80);
        if (!items.length) return "";
        return `
          <div class="grocery-group">
            <h3>${escapeHtml(recipe.title)}</h3>
            <p class="source-line">Market source: ${escapeHtml(recipe.grocerySource || "unknown")}</p>
            <ul>${items.map((line) => `<li>${escapeHtml(scaleIngredient(line, recipe))}</li>`).join("")}</ul>
          </div>
        `;
      })
      .join("");

    els.groceryList.innerHTML = combinedHtml + byRecipe || `<div class="empty-state">No readable ingredients</div>`;
  }

  function renderCooking(selected) {
    els.cookingPlan.innerHTML = selected
      .map((recipe, index) => {
        return `
          <div class="grocery-group">
            <h3>Dinner ${index + 1}: ${escapeHtml(recipe.title)}</h3>
            ${flowHtml(recipe, 30) || `<p class="card-note">${escapeHtml(recipe.rawText.slice(0, 900))}</p>`}
            <p class="source-line">${escapeHtml(recipe.source)}${recipe.page ? `, page ${recipe.page}` : ""} · <a href="${recipe.sourceFileUrl}" target="_blank" rel="noreferrer">Open source</a></p>
          </div>
        `;
      })
      .join("");
  }

  function onRecipeGridClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const recipe = recipeById.get(button.dataset.id);
    if (!recipe) return;
    if (button.dataset.action === "add") {
      addRecipe(recipe.id);
      renderAll();
    }
    if (button.dataset.action === "view") {
      currentRecipe = recipe;
      activateTab("picker");
      renderAll();
    }
  }

  function onGuideGridClick(_event) {}

  function onSelectedClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const id = button.dataset.id;
    if (button.dataset.action === "remove") {
      state.selectedIds = state.selectedIds.filter((selectedId) => selectedId !== id);
      saveState();
      renderAll();
    }
    if (button.dataset.action === "view") {
      const recipe = recipeById.get(id);
      if (recipe) {
        currentRecipe = recipe;
        activateTab("picker");
        renderAll();
      }
    }
  }

  function addRecipe(id) {
    if (!state.selectedIds.includes(id)) {
      state.selectedIds.push(id);
      saveState();
    }
  }

  function toggleArrayValue(values, value) {
    return values.includes(value) ? values.filter((item) => item !== value) : values.concat(value);
  }

  function startDrag(event) {
    if (!currentRecipe) return;
    drag = { startX: event.clientX, currentX: event.clientX };
    els.activeCard.classList.add("dragging");
    els.activeCard.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!drag) return;
    drag.currentX = event.clientX;
    const dx = drag.currentX - drag.startX;
    const rotate = Math.max(-8, Math.min(8, dx / 28));
    els.activeCard.style.transform = `translateX(${dx}px) rotate(${rotate}deg)`;
    els.activeCard.classList.toggle("keep-tilt", dx > 60);
    els.activeCard.classList.toggle("pass-tilt", dx < -60);
  }

  function endDrag() {
    if (!drag) return;
    const dx = drag.currentX - drag.startX;
    drag = null;
    els.activeCard.classList.remove("dragging", "keep-tilt", "pass-tilt");
    els.activeCard.style.transform = "";
    if (dx > 95) keepCurrent();
    if (dx < -95) passCurrent();
  }

  function combineIngredients(selected) {
    const groups = new Map();
    const other = [];
    selected.forEach((recipe) => {
      getGroceryItems(recipe).filter(isUsefulIngredientLine).forEach((line) => {
        const scaled = scaleIngredient(line, recipe);
        const parsed = parseIngredient(scaled);
        if (!parsed) {
          other.push(`${scaled} (${recipe.title})`);
          return;
        }
        const existing = groups.get(parsed.key) || { ...parsed, amount: 0, examples: [] };
        if (parsed.amount && existing.unit === parsed.unit) {
          existing.amount += parsed.amount;
        } else {
          existing.examples.push(`${scaled} (${recipe.title})`);
        }
        groups.set(parsed.key, existing);
      });
    });

    const combined = [...groups.values()]
      .map((group) => {
        if (group.amount && group.unit) return `${formatNumber(group.amount)} ${group.unit} ${group.item}`;
        if (group.amount) return `${formatNumber(group.amount)} ${group.item}`;
        return group.examples[0];
      })
      .sort((a, b) => a.localeCompare(b));
    return combined.concat(other).slice(0, 260);
  }

  function parseIngredient(line) {
    const cleaned = line
      .replace(/^[\-*•\s]+/, "")
      .replace(/^[a-z]\.\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!cleaned || !isUsefulIngredientLine(cleaned)) return null;
    const match = cleaned.match(/^([0-9]+(?:\.[0-9]+)?|[0-9]+\s+[0-9]+\/[0-9]+|[0-9]+\/[0-9]+)\s*([A-Za-z]+)?\s+(.+)$/);
    if (!match) return null;
    const amount = parseAmount(match[1]);
    const unit = normalizeUnit(match[2] || "");
    let item = match[3].replace(/\([^)]*\)/g, "").split(",")[0].trim();
    item = item.replace(/^(of|fresh|frozen|diced|sliced|minced|chopped)\s+/i, "").trim();
    if (!item || item.length < 2) return null;
    const key = `${unit}|${item.toLowerCase().replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim()}`;
    return { amount, unit, item, key, examples: [] };
  }

  function scaleIngredient(line, recipe) {
    const base = Number(recipe.baseServings) || Number(recipe.defaultServings) || state.servings;
    const factor = base ? state.servings / base : 1;
    if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.01) return cleanIngredientLine(line);
    let scaled = cleanIngredientLine(line);
    scaled = scaled.replace(
      /^(\s*(?:[-*•]\s*)?)([0-9]+(?:\s+[0-9]+\/[0-9]+)?|[0-9]+\/[0-9]+|[0-9]*\.[0-9]+|[¼½¾⅓⅔⅛⅜⅝⅞])(?=\s*[A-Za-z])/,
      (_match, prefix, amount) => `${prefix}${formatAmount(parseAmount(amount) * factor)}`
    );
    scaled = scaled.replace(
      /([0-9]+(?:\s+[0-9]+\/[0-9]+)?|[0-9]+\/[0-9]+|[0-9]*\.[0-9]+|[¼½¾⅓⅔⅛⅜⅝⅞])(?=\s*(?:g|kg|oz|lb|lbs|cup|cups|tsp|tbsp|teaspoon|teaspoons|tablespoon|tablespoons|ml|l|clove|cloves|egg|eggs|can|cans|jar|jars|bag|bags)\b)/gi,
      (amount) => formatAmount(parseAmount(amount) * factor)
    );
    return scaled;
  }

  function cleanIngredientLine(line) {
    return String(line || "")
      .replace(/^[\-*•\s]+/, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isUsefulIngredientLine(line) {
    const value = String(line || "").trim();
    if (!value || !/[A-Za-z0-9]/.test(value)) return false;
    if (/^(calories|fat|protein|carbs|sodium|potassium|fiber)\b/i.test(value)) return false;
    if (/^(per serving|macros|yield\/servings|recipe is for|adjust amounts|modify amounts)/i.test(value)) return false;
    return true;
  }

  function parseAmount(value) {
    const map = { "¼": 0.25, "½": 0.5, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875 };
    const text = String(value).trim();
    if (map[text]) return map[text];
    const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
    const fraction = text.match(/^(\d+)\/(\d+)$/);
    if (fraction) return Number(fraction[1]) / Number(fraction[2]);
    return Number(text) || 0;
  }

  function formatAmount(value) {
    if (!Number.isFinite(value)) return "";
    if (value === 0) return "0";
    if (Math.abs(value - Math.round(value)) < 0.03) return String(Math.round(value));
    const denominator = 8;
    const whole = Math.floor(value);
    const fraction = Math.round((value - whole) * denominator);
    if (fraction === 0) return String(whole);
    if (fraction === denominator) return String(whole + 1);
    const divisor = gcd(fraction, denominator);
    const top = fraction / divisor;
    const bottom = denominator / divisor;
    return whole ? `${whole} ${top}/${bottom}` : `${top}/${bottom}`;
  }

  function gcd(a, b) {
    while (b) {
      const temp = b;
      b = a % b;
      a = temp;
    }
    return a;
  }

  function normalizeUnit(unit) {
    const value = unit.toLowerCase();
    const map = {
      tablespoons: "tbsp",
      tablespoon: "tbsp",
      teaspoons: "tsp",
      teaspoon: "tsp",
      cups: "cup",
      cloves: "clove",
      eggs: "egg",
      cans: "can",
      jars: "jar",
      bags: "bag",
      lbs: "lb",
    };
    return map[value] || value;
  }

  function formatServing(value) {
    return formatNumber(value).replace(/\.0$/, "");
  }

  function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return String(value);
    return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(/\.0$/, "");
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, Math.round(number)));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  init();
})();
