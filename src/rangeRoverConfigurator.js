const DEFAULT_MARKET = "en_gb";
const DEFAULT_NAMEPLATE = "l460";
const DEFAULT_SOURCE_URL =
  "https://www.rangerover.com/lr/en_gb/l460/ipr/personalise/";

const RULES_BASE_URL = "https://rules.config.landrover.com";
const CONFIGURATOR_HOST = "https://www.rangerover.com";
const DEFAULT_TIMEOUT_MS = 20000;
const CACHE_TTL_MS = 5 * 60 * 1000;

const rulesCache = new Map();
const sourceCache = new Map();

const NAMEPLATES = {
  l460: { id: "l460", label: "Range Rover", pathSuffix: "" },
  l461: { id: "l461", label: "Range Rover Sport", pathSuffix: "model/" },
  l551: { id: "l551", label: "Range Rover Evoque", pathSuffix: "" },
  l560: { id: "l560", label: "Range Rover Velar", pathSuffix: "model/" },
};

const MARKET_ALIASES = new Map([
  ["dk", "da_dk"],
  ["danmark", "da_dk"],
  ["denmark", "da_dk"],
  ["danish", "da_dk"],
  ["da_dk", "da_dk"],
  ["uk", "en_gb"],
  ["gb", "en_gb"],
  ["britain", "en_gb"],
  ["united kingdom", "en_gb"],
  ["en_gb", "en_gb"],
  ["us", "en_us"],
  ["usa", "en_us"],
  ["united states", "en_us"],
  ["en_us", "en_us"],
  ["de", "de_de"],
  ["germany", "de_de"],
  ["german", "de_de"],
  ["de_de", "de_de"],
  ["xi", "en_xi"],
  ["international", "en_xi"],
  ["en_xi", "en_xi"],
]);

const SECTION_ALIASES = new Map([
  ["all", "all"],
  ["body", "bodystyle"],
  ["bodystyle", "bodystyle"],
  ["body style", "bodystyle"],
  ["model", "model"],
  ["trim", "model"],
  ["engine", "engine"],
  ["propulsion", "engine"],
  ["fuel", "engine"],
  ["product", "product"],
  ["exterior", "exterior"],
  ["colour", "exterior"],
  ["color", "exterior"],
  ["paint", "exterior"],
  ["wheels", "wheels"],
  ["wheel", "wheels"],
  ["wheel configuration", "wheels"],
  ["wheelconfiguration", "wheels"],
  ["interior", "interior"],
  ["packs", "options"],
  ["pack", "options"],
  ["options", "options"],
  ["accessories", "accessories"],
  ["accessory", "accessories"],
  ["charges", "charges"],
]);

const SELECTED_AVAILABILITIES = new Set(["default", "included", "selected", "standard"]);

export { DEFAULT_MARKET, DEFAULT_NAMEPLATE, DEFAULT_SOURCE_URL, NAMEPLATES };

export function parseSourceUrl(sourceUrl) {
  const parsed = parseConfiguratorUrl(sourceUrl || DEFAULT_SOURCE_URL);
  if (!parsed.expanded) {
    throw new Error("Source URL must be an expanded JLR configurator URL with vehicle, model year, and version.");
  }
  return parsed;
}

export function parseConfiguratorUrl(sourceUrl) {
  const url = new URL(sourceUrl || DEFAULT_SOURCE_URL, CONFIGURATOR_HOST);
  const parts = url.pathname.split("/").filter(Boolean);
  const brand = parts[0];
  const locale = parts[1];
  const vehicleAndYear = parts[2];
  const version = parts[3];

  if (!brand || !locale || !vehicleAndYear) {
    throw new Error("Source URL does not look like a JLR configurator URL.");
  }

  const expanded = vehicleAndYear.includes("_") && !!version && version !== "ipr";
  const [vehicleId, modelYear] = expanded ? vehicleAndYear.split("_") : [vehicleAndYear, ""];
  const iprIndex = parts.indexOf("ipr");
  const urlSelectionIds = expanded && iprIndex > 4
    ? parts.slice(4, iprIndex).filter((part) => part && part !== "_")
    : [];

  return {
    brand,
    locale,
    market: locale,
    vehicleId,
    nameplate: vehicleId,
    modelYear,
    version: expanded ? version : "",
    sourceUrl: url.toString(),
    requestedSourceUrl: url.toString(),
    selectionIds: normalizeSelectionIds(urlSelectionIds),
    expanded,
  };
}

export async function resolveConfiguratorSource(args = {}) {
  const sourceUrl = args.sourceUrl || args.source_url;
  const market = normalizeMarket(args.market);
  const nameplate = normalizeNameplate(args.nameplate);
  const requestedUrl = sourceUrl || buildShorthandConfiguratorUrl({ market, nameplate });
  const parsed = parseConfiguratorUrl(requestedUrl);

  if (parsed.expanded) {
    return {
      ...parsed,
      requestedSourceUrl: requestedUrl,
      vehicleLabel: NAMEPLATES[parsed.vehicleId]?.label || parsed.vehicleId,
    };
  }

  const cacheKey = requestedUrl;
  const cached = sourceCache.get(cacheKey);
  if (!args.forceRefresh && cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.value;
  }

  const finalUrl = await resolveFinalUrl(requestedUrl);
  const resolved = {
    ...parseSourceUrl(finalUrl),
    requestedSourceUrl: requestedUrl,
    vehicleLabel: NAMEPLATES[parsed.vehicleId]?.label || NAMEPLATES[nameplate]?.label || parsed.vehicleId,
  };
  sourceCache.set(cacheKey, { time: Date.now(), value: resolved });
  return resolved;
}

export function buildShorthandConfiguratorUrl({ market = DEFAULT_MARKET, nameplate = DEFAULT_NAMEPLATE } = {}) {
  const normalizedMarket = normalizeMarket(market);
  const normalizedNameplate = normalizeNameplate(nameplate);
  const suffix = NAMEPLATES[normalizedNameplate]?.pathSuffix || "";
  return `${CONFIGURATOR_HOST}/lr/${normalizedMarket}/${normalizedNameplate}/ipr/personalise/${suffix}`;
}

export function normalizeSelectionIds(selectionIds = []) {
  if (!Array.isArray(selectionIds)) {
    throw new Error("selection_ids must be an array of configurator feature IDs.");
  }

  return selectionIds
    .map((id) => String(id || "").trim())
    .filter(Boolean)
    .map((id) => {
      if (!/^[a-z0-9_-]+$/i.test(id)) {
        throw new Error(`Invalid feature ID "${id}". Feature IDs may only contain letters, numbers, hyphens and underscores.`);
      }
      return id.toLowerCase();
    });
}

export function buildRulesUrl(source, selectionIds = []) {
  const selected = normalizeSelectionIds(selectionIds);
  const selectedPath = selected.length ? `${selected.map(encodeURIComponent).join("/")}/.jsonp` : ".jsonp";
  return `${RULES_BASE_URL}/rc/${source.brand}/${source.locale}/${source.vehicleId}_${source.modelYear}/${source.version}/${selectedPath}?view=personalise&callback=config_rcjson`;
}

export function buildPreviewRulesUrl(source, selectionIds = [], featureId) {
  const selected = normalizeSelectionIds(selectionIds);
  const feature = normalizeSelectionIds([featureId])[0];
  const selectedPath = selected.length ? selected.map(encodeURIComponent).join("/") : "_";
  return `${RULES_BASE_URL}/rc/${source.brand}/${source.locale}/${source.vehicleId}_${source.modelYear}/${source.version}/${selectedPath}/.jsonp?q=${encodeURIComponent(feature)}&view=personalise&callback=config_rcjson`;
}

export function buildConfiguratorUrl(source, selectionIds = []) {
  const selected = normalizeSelectionIds(selectionIds);
  const selectedPath = selected.length ? `${selected.map(encodeURIComponent).join("/")}/` : "";
  return `${CONFIGURATOR_HOST}/${source.brand}/${source.locale}/${source.vehicleId}_${source.modelYear}/${source.version}/${selectedPath}ipr/personalise/`;
}

export function parseJsonp(text) {
  const open = text.indexOf("(");
  const close = text.lastIndexOf(")");

  if (open < 0 || close <= open) {
    throw new Error("Response is not valid JSONP.");
  }

  return JSON.parse(text.slice(open + 1, close));
}

export async function fetchJsonp(url, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const cached = rulesCache.get(url);
  if (!options.forceRefresh && cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.value;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/javascript, application/json, text/javascript, */*",
        "user-agent": "jlr-configurator-mcp/0.2",
      },
    });

    if (!response.ok) {
      throw new Error(`Upstream configurator request failed with HTTP ${response.status}.`);
    }

    const data = parseJsonp(await response.text());
    rulesCache.set(url, { time: Date.now(), value: data });
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getConfiguratorData(args = {}) {
  const source = await resolveConfiguratorSource(args);
  const selected = mergeSelectionIds(source.selectionIds, args.selectionIds || args.selection_ids || []);
  const rulesUrl = buildRulesUrl(source, selected);
  const data = await fetchJsonp(rulesUrl, { forceRefresh: args.forceRefresh || args.force_refresh });

  return {
    source,
    selectionIds: selected,
    rulesUrl,
    configuratorUrl: buildConfiguratorUrl(source, selected),
    data,
  };
}

export async function findConfigurators(args = {}) {
  const market = normalizeMarket(args.market);
  const nameplates = args.nameplate
    ? [normalizeNameplate(args.nameplate)]
    : Object.keys(NAMEPLATES);
  const includePrices = args.include_prices !== false;
  const forceRefresh = !!args.force_refresh;

  const configurators = await Promise.all(nameplates.map(async (nameplate) => {
    const source = await resolveConfiguratorSource({ market, nameplate, forceRefresh });
    const rulesUrl = buildRulesUrl(source, []);
    const data = await fetchJsonp(rulesUrl, { forceRefresh });
    const features = flattenFeatures(data);
    const selected = selectedFeatures(features);

    return removeEmpty({
      nameplate,
      label: stripHtml(localize(data["feature-dictionary"]?.vehicle?.description)) || NAMEPLATES[nameplate]?.label,
      market: source.locale,
      requested_url: source.requestedSourceUrl,
      expanded_url: source.sourceUrl,
      configurator_url: buildConfiguratorUrl(source, []),
      rules_url: rulesUrl,
      generated: data.metadata?.meta?.Generated,
      feature_count: features.length,
      price: includePrices ? priceSummary(data, source.locale) : undefined,
      default_build: buildHighlights(selected),
      caveats: caveatsFor(data),
    });
  }));

  return {
    market,
    configurators,
    caveats: [
      "Configurator URLs are resolved through public Range Rover/JLR redirects, so versions can change when JLR updates a market.",
      "Only public configurator payloads are used; no saved-build, stock, order, VIN, retailer, or finance quote endpoints are called.",
    ],
  };
}

export async function listFeatures(args = {}) {
  const {
    section = "all",
    search = "",
    include_excluded: includeExcluded = false,
    limit = 50,
  } = args;

  const context = await getConfiguratorData(args);
  const allFeatures = flattenFeatures(context.data);
  const normalizedSection = normalizeSection(section);
  const query = normalizeText(search);
  const max = clampLimit(limit);

  const matches = allFeatures.filter((feature) => {
    if (!includeExcluded && feature.availability === "excluded") return false;
    if (normalizedSection !== "all" && normalizeSection(feature.section) !== normalizedSection) return false;
    if (!query) return true;

    const haystack = normalizeText([
      feature.id,
      feature.label,
      feature.section,
      feature.section_label,
      feature.group,
      feature.group_label,
      feature.description,
      feature.jlr_code,
    ].filter(Boolean).join(" "));
    return haystack.includes(query);
  });

  return {
    source: sourceSummary(context),
    filters: {
      section: normalizedSection,
      search: search || "",
      include_excluded: includeExcluded,
      selection_ids: context.selectionIds,
      limit: max,
    },
    total_features: allFeatures.length,
    total_matches: matches.length,
    features: matches.slice(0, max).map(compactFeature),
    caveats: caveatsFor(context.data),
  };
}

export async function getFeatureDetails(args = {}) {
  const featureId = args.feature_id;

  if (!featureId || typeof featureId !== "string") {
    throw new Error("feature_id is required.");
  }

  const context = await getConfiguratorData(args);
  const allFeatures = flattenFeatures(context.data);
  const normalizedId = featureId.toLowerCase();
  const feature = allFeatures.find((item) => item.id.toLowerCase() === normalizedId);

  if (!feature) {
    const close = allFeatures
      .filter((item) => normalizeText(`${item.id} ${item.label}`).includes(normalizeText(featureId)))
      .slice(0, 10)
      .map(compactFeature);

    return {
      source: sourceSummary(context),
      found: false,
      feature_id: featureId,
      close_matches: close,
      caveats: caveatsFor(context.data),
    };
  }

  return {
    source: sourceSummary(context),
    found: true,
    feature: detailedFeature(feature),
    caveats: caveatsFor(context.data),
  };
}

export async function summarizeConfiguration(args = {}) {
  const includeAllFeatures = !!(args.include_all_features || args.include_all_default_features);
  const context = await getConfiguratorData(args);
  const allFeatures = flattenFeatures(context.data);
  const chosen = selectedFeatures(allFeatures);
  const standardFeatures = extractStandardFeatures(context.data, allFeatures, includeAllFeatures);
  const specs = parseSpecs(context.data);

  return {
    source: sourceSummary(context),
    input_selection_ids: context.selectionIds,
    configurator_url: context.configuratorUrl,
    rules_url: context.rulesUrl,
    metadata: context.data.metadata?.meta || {},
    status: context.data.metadata?.status || null,
    vehicle: stripHtml(localize(context.data["feature-dictionary"]?.vehicle?.description)),
    price: priceSummary(context.data, context.source.locale),
    highlights: buildHighlights(chosen),
    grouped_features: groupFeatures(chosen, includeAllFeatures),
    standard_features: standardFeatures,
    top_specs: topSpecs(specs),
    summary_media: extractSummaryMedia(context.data),
    caveats: caveatsFor(context.data),
  };
}

export async function previewSelectionChange(args = {}) {
  const featureId = args.feature_id;
  if (!featureId || typeof featureId !== "string") {
    throw new Error("feature_id is required.");
  }

  const context = await getConfiguratorData(args);
  const previewUrl = buildPreviewRulesUrl(context.source, context.selectionIds, featureId);
  const previewData = await fetchJsonp(previewUrl, { forceRefresh: args.force_refresh });
  const conflict = previewData["conflict-resolution"] || {};
  const acceptedData = conflict.accept
    ? await fetchJsonp(rulesPathToUrl(conflict.accept), { forceRefresh: args.force_refresh })
    : null;

  const index = featureIndex([
    ...flattenFeatures(context.data),
    ...flattenFeatures(previewData),
    ...flattenFeatures(acceptedData),
  ]);
  const selected = index.get(featureId.toLowerCase());
  const added = arrayOrEmpty(conflict.added).map((id) => labelledFeature(id, index));
  const removed = arrayOrEmpty(conflict.removed).map((id) => labelledFeature(id, index));

  return {
    source: sourceSummary(context),
    feature: selected ? compactFeature(selected) : { id: featureId },
    preview_rules_url: previewUrl,
    status: previewData.metadata?.status || null,
    action: conflict.action || null,
    accept: conflict.accept ? {
      rules_path: conflict.accept,
      rules_url: rulesPathToUrl(conflict.accept),
      configurator_url: rulesPathToConfiguratorUrl(conflict.accept),
    } : null,
    reject: conflict.reject ? {
      rules_path: conflict.reject,
      rules_url: rulesPathToUrl(conflict.reject),
      configurator_url: rulesPathToConfiguratorUrl(conflict.reject),
    } : null,
    added,
    removed,
    explanation: explainChange(selected || { id: featureId, label: featureId }, added, removed),
    caveats: caveatsFor(previewData),
  };
}

export async function getSpecsAndStandardFeatures(args = {}) {
  const includeAllFeatures = !!args.include_all_features;
  const specSearch = normalizeText(args.spec_search || args.search || "");
  const context = await getConfiguratorData(args);
  const allFeatures = flattenFeatures(context.data);
  const specs = parseSpecs(context.data);
  const filteredSpecs = specSearch
    ? specs
        .map((section) => ({
          ...section,
          tables: section.tables
            .map((table) => ({
              ...table,
              rows: table.rows.filter((row) => normalizeText(`${section.label} ${table.label} ${row.label} ${row.value}`).includes(specSearch)),
            }))
            .filter((table) => table.rows.length),
        }))
        .filter((section) => section.tables.length)
    : specs;

  return {
    source: sourceSummary(context),
    configurator_url: context.configuratorUrl,
    selected_features: buildHighlights(selectedFeatures(allFeatures)),
    specs: filteredSpecs,
    standard_features: extractStandardFeatures(context.data, allFeatures, includeAllFeatures),
    caveats: caveatsFor(context.data),
  };
}

export async function compareBuilds(args = {}) {
  const builds = args.builds || [];
  if (!Array.isArray(builds) || builds.length < 2 || builds.length > 4) {
    throw new Error("builds must contain 2 to 4 build definitions.");
  }

  const summaries = await Promise.all(builds.map(async (build, index) => {
    const context = await getConfiguratorData({
      ...args,
      ...build,
      selectionIds: build.selection_ids || build.selectionIds || [],
      forceRefresh: args.force_refresh || build.force_refresh,
    });
    const features = flattenFeatures(context.data);
    const selected = selectedFeatures(features);
    const specs = parseSpecs(context.data);

    return {
      label: build.label || `Build ${index + 1}`,
      source: sourceSummary(context),
      configurator_url: context.configuratorUrl,
      selection_ids: context.selectionIds,
      vehicle: stripHtml(localize(context.data["feature-dictionary"]?.vehicle?.description)),
      price: priceSummary(context.data, context.source.locale),
      highlights: buildHighlights(selected),
      top_specs: topSpecs(specs),
      feature_ids: selected.map((feature) => feature.id),
    };
  }));

  return {
    builds: summaries.map(({ feature_ids, ...summary }) => summary),
    price_comparison: comparePrices(summaries),
    highlight_differences: compareHighlights(summaries),
    spec_differences: compareSpecs(summaries),
    caveats: [
      "Compares public configurator payload outputs. It does not check retailer stock, lead times, or finance eligibility.",
    ],
  };
}

export async function adviseUkBuild(args = {}) {
  const preferences = normalizeAdvisorPreferences(args);
  const questions = advisorQuestions(preferences);

  if (!preferences.ready) {
    return {
      status: "needs_preferences",
      market: "en_gb",
      message: "I can recommend a UK JLR build, but I need a little more buying context first.",
      questions,
      already_known: preferences.known,
      guidance:
        "Answer in normal language. Budget, passenger needs, driving pattern, charging access, towing and comfort/performance priorities are enough to produce a first recommendation.",
      caveats: [
        "This is product guidance from public UK configurator data, not finance, stock, delivery, retailer or order advice.",
      ],
    };
  }

  const candidates = await Promise.all(Object.keys(NAMEPLATES).map(async (nameplate) => {
    const summary = await summarizeConfiguration({
      market: "en_gb",
      nameplate,
      force_refresh: args.force_refresh,
    });
    return scoreAdvisorCandidate(summary, preferences);
  }));

  candidates.sort((a, b) => b.score - a.score);
  const recommended = candidates[0];
  const optionIdeas = advisorOptionIdeas(recommended.summary, preferences);

  return {
    status: "recommendation",
    market: "en_gb",
    customer_profile: preferences.known,
    recommendation: {
      nameplate: recommended.summary.source.nameplate,
      vehicle: NAMEPLATES[recommended.summary.source.nameplate]?.label || recommended.summary.vehicle,
      model: recommended.summary.highlights.model?.label,
      engine: recommended.summary.highlights.propulsion?.label,
      price: recommended.summary.price?.gross,
      configurator_url: recommended.summary.configurator_url,
      why_this_fits: recommended.reasons.slice(0, 4),
      trade_offs: recommended.tradeoffs.slice(0, 4),
      key_specs: customerKeySpecs(recommended.summary.top_specs),
      options_to_explore_next: optionIdeas,
    },
    alternatives: candidates.slice(1).map((candidate) => ({
      vehicle: NAMEPLATES[candidate.summary.source.nameplate]?.label || candidate.summary.vehicle,
      model: candidate.summary.highlights.model?.label,
      engine: candidate.summary.highlights.propulsion?.label,
      price: candidate.summary.price?.gross,
      fit: candidate.reasons.slice(0, 2),
      watch_out: candidate.tradeoffs.slice(0, 2),
      configurator_url: candidate.summary.configurator_url,
    })),
    follow_up_questions: advisorRefinementQuestions(preferences),
    caveats: [
      "Recommendation is based on public UK configurator defaults and visible prices.",
      "It does not check retailer stock, delivery timing, finance, part-exchange, incentives, saved builds or ordering.",
      "Use preview_jlr_selection_change before adding a specific option or trim so dependencies are clear.",
    ],
  };
}

function normalizeAdvisorPreferences(args = {}) {
  const priorities = arrayOrEmpty(args.priorities).map((item) => normalizeText(item)).filter(Boolean);
  const text = normalizeText([
    args.typical_use,
    args.driving_pattern,
    args.fuel_preference,
    args.charging_access,
    args.must_haves,
    args.current_vehicle,
    args.notes,
    priorities.join(" "),
  ].filter(Boolean).join(" "));
  const passengers = Number(args.passengers || args.seats || 0);
  const budget = Number(args.budget_gbp || args.monthly_budget_gbp || args.budget || 0);
  const hasBudget = Number.isFinite(budget) && budget > 0;
  const known = removeEmpty({
    budget_gbp: hasBudget ? budget : undefined,
    passengers: Number.isFinite(passengers) && passengers > 0 ? passengers : undefined,
    typical_use: args.typical_use,
    driving_pattern: args.driving_pattern,
    fuel_preference: args.fuel_preference,
    charging_access: args.charging_access,
    towing: args.towing,
    priorities: arrayOrEmpty(args.priorities),
    must_haves: args.must_haves,
    preferred_model: args.preferred_model || args.nameplate,
  });
  const signalCount = [
    hasBudget,
    passengers > 0,
    !!args.typical_use || !!args.driving_pattern,
    !!args.fuel_preference || !!args.charging_access,
    typeof args.towing === "boolean",
    priorities.length > 0 || !!args.must_haves,
    !!args.preferred_model || !!args.nameplate,
  ].filter(Boolean).length;

  return {
    ...args,
    text,
    budget,
    hasBudget,
    passengers: Number.isFinite(passengers) ? passengers : 0,
    priorities,
    known,
    ready: signalCount >= 3,
  };
}

function advisorQuestions(preferences) {
  const questions = [];
  if (!preferences.hasBudget) {
    questions.push("What is your rough on-the-road budget in GBP, or are you mainly comparing monthly affordability?");
  }
  if (!preferences.passengers) {
    questions.push("How many people do you regularly carry, and do you need a large boot or occasional seven-seat flexibility?");
  }
  if (!preferences.typical_use && !preferences.driving_pattern) {
    questions.push("What is the car mostly for: city driving, motorway miles, family trips, towing, commuting, or mixed use?");
  }
  if (!preferences.fuel_preference && !preferences.charging_access) {
    questions.push("Can you charge at home or work, or would you prefer petrol/diesel simplicity?");
  }
  if (!preferences.priorities.length && !preferences.must_haves) {
    questions.push("What matters most: comfort, quiet luxury, performance, lower running costs, technology, towing, or compact size?");
  }
  return questions.slice(0, 5);
}

function scoreAdvisorCandidate(summary, preferences) {
  const nameplate = summary.source.nameplate;
  const price = summary.price?.gross?.value || 0;
  const text = preferences.text;
  let score = 0;
  const reasons = [];
  const tradeoffs = [];

  if (preferences.hasBudget && price) {
    if (price <= preferences.budget) {
      score += 20;
      reasons.push(`Fits within the stated budget at ${summary.price.gross.formatted}.`);
    } else {
      const over = price - preferences.budget;
      score -= Math.min(30, Math.ceil(over / 5000) * 4);
      tradeoffs.push(`Starts above the stated budget at ${summary.price.gross.formatted}.`);
    }
  }

  if (/luxury|comfort|quiet|refined|chauffeur|premium/.test(text)) {
    if (nameplate === "l460") {
      score += 18;
      reasons.push("Best fit for quiet luxury, comfort and flagship Range Rover presence.");
    }
    if (nameplate === "l551") tradeoffs.push("More compact and accessible, but less flagship-luxury than Range Rover or Velar.");
  }

  if (/sport|performance|dynamic|fast|driver|handling/.test(text)) {
    if (nameplate === "l461") {
      score += 18;
      reasons.push("Best fit for a more dynamic Range Rover feel without going to the full-size flagship.");
    }
    if (nameplate === "l460") tradeoffs.push("More luxurious than sporting; Range Rover Sport is the sharper drive.");
  }

  if (/city|urban|compact|parking|small|easy/.test(text)) {
    if (nameplate === "l551") {
      score += 18;
      reasons.push("Most compact and easiest Range Rover family option for urban use.");
    }
    if (nameplate === "l460") tradeoffs.push("Large and luxurious, but less convenient for tight city parking.");
  }

  if (/style|design|sleek|coupe|coupe|looks/.test(text)) {
    if (nameplate === "l560") {
      score += 14;
      reasons.push("Strong fit if design, style and a more elegant mid-size SUV feel matter.");
    }
  }

  if (/tow|horse|boat|caravan|trailer/.test(text) || preferences.towing === true) {
    if (nameplate === "l460" || nameplate === "l461") {
      score += 14;
      reasons.push("Better suited to towing-focused use than the smaller models.");
    } else {
      tradeoffs.push("If towing is important, compare towing limits carefully against Range Rover or Range Rover Sport.");
    }
  }

  if (/charge|charging|plug|phev|electric|ev|low emission|tax|company car/.test(text)) {
    const engine = normalizeText(summary.highlights.propulsion?.label || "");
    if (/plug/.test(engine)) {
      score += 16;
      reasons.push(`The default ${summary.highlights.propulsion.label} suits charging access and lower-emission use cases.`);
    } else {
      tradeoffs.push("The default engine is not a plug-in hybrid; check PHEV alternatives if charging or company-car tax is central.");
    }
  }

  if (/motorway|long distance|long miles|diesel|range/.test(text)) {
    const engine = normalizeText(summary.highlights.propulsion?.label || "");
    if (/diesel/.test(engine)) {
      score += 14;
      reasons.push(`The default ${summary.highlights.propulsion.label} is a sensible long-distance starting point.`);
    } else {
      tradeoffs.push("A plug-in hybrid can be excellent with charging, but long motorway use may favour a diesel alternative.");
    }
  }

  if (preferences.passengers >= 5) {
    if (nameplate === "l460" || nameplate === "l461") {
      score += 10;
      reasons.push("Better family-space starting point than Evoque or Velar.");
    } else {
      tradeoffs.push("More compact cabin and boot than Range Rover or Range Rover Sport.");
    }
  }

  if (preferences.preferred_model || preferences.nameplate) {
    const preferred = normalizeNameplate(preferences.preferred_model || preferences.nameplate);
    if (nameplate === preferred) {
      score += 20;
      reasons.push("Matches the model family you asked about.");
    }
  }

  if (preferences.hasBudget) {
    if (preferences.budget < 60000 && nameplate === "l551") score += 12;
    if (preferences.budget >= 60000 && preferences.budget < 85000 && nameplate === "l560") score += 10;
    if (preferences.budget >= 85000 && preferences.budget < 105000 && nameplate === "l461") score += 10;
    if (preferences.budget >= 105000 && nameplate === "l460") score += 10;
  }

  if (!reasons.length) {
    reasons.push(`${NAMEPLATES[nameplate]?.label || summary.vehicle} is a credible UK starting point at ${summary.price?.gross?.formatted || "the visible configurator price"}.`);
  }

  return {
    score,
    summary,
    reasons,
    tradeoffs,
  };
}

function customerKeySpecs(specs = []) {
  const wanted = /acceleration|combined wltp consumption|combined wltp co|maximum towing|maximum power|maximum torque/i;
  return specs
    .filter((spec) => wanted.test(`${spec.group} ${spec.label}`))
    .slice(0, 6)
    .map((spec) => ({
      label: spec.label,
      value: spec.value,
      group: spec.group,
    }));
}

function advisorOptionIdeas(summary, preferences) {
  const ideas = [];
  const text = preferences.text;

  if (/comfort|luxury|quiet|family/.test(text)) {
    ideas.push("Explore Comfort Pack or seating upgrades, then preview dependencies before adding them.");
  }
  if (/tow|horse|boat|caravan|trailer/.test(text) || preferences.towing === true) {
    ideas.push("Explore tow bar and towing assistance options, then check the maximum towing spec for the chosen engine.");
  }
  if (/music|audio|meridian|sound/.test(text)) {
    ideas.push("Compare Meridian audio options against the default sound system.");
  }
  if (/black|stealth|dark|privacy/.test(text)) {
    ideas.push("Search black exterior packs, privacy glass and wheel choices before finalising the look.");
  }
  if (!ideas.length) {
    ideas.push("Next, choose paint, wheels, interior trim and one comfort or technology pack rather than changing everything at once.");
  }

  if (summary.summary_media?.[0]?.url) {
    ideas.push("Use the configurator media URLs to show the customer the exact visual direction of the build.");
  }

  return ideas.slice(0, 4);
}

function advisorRefinementQuestions(preferences) {
  const questions = [];
  if (!/charge|charging|plug|phev|electric|ev|diesel|petrol/.test(preferences.text)) {
    questions.push("Do you have reliable home or work charging, or should we bias toward petrol/diesel?");
  }
  if (!/comfort|luxury|sport|performance|city|tow|family|technology|audio/.test(preferences.text)) {
    questions.push("Which one should lead the build: comfort, performance, technology, towing, or compact everyday use?");
  }
  if (preferences.towing !== true && !/tow|trailer|caravan|horse|boat/.test(preferences.text)) {
    questions.push("Will you tow anything heavy enough that towing capacity should drive the engine choice?");
  }
  return questions.slice(0, 3);
}

export function flattenFeatures(data) {
  const rootLists = data?.["feature-dictionary"]?.["feature-list"];
  const lists = Array.isArray(rootLists) ? rootLists : Object.values(rootLists || {});
  const features = [];

  for (const list of lists) {
    walkFeatureList(list, [], features);
  }

  return features;
}

export function parseSpecs(data) {
  return arrayOrEmpty(data?.specs).map((section) => ({
    id: section.id || "",
    label: stripHtml(localize(section.description)),
    tables: arrayOrEmpty(section.table).map((table) => {
      const labels = arrayOrEmpty(table.labels?.label).map((label) => stripHtml(localize(label.description)));
      const dataset = arrayOrEmpty(table.datasets)[0] || {};
      const values = arrayOrEmpty(dataset.data).map((item) => stripHtml(localize(item.description)));
      return {
        id: table.id || "",
        label: stripHtml(localize(table.labels?.heading?.description)) || stripHtml(localize(table.description)),
        refs: dataset.refs || "",
        rows: labels.map((label, index) => removeEmpty({
          label,
          value: values[index] || "",
          refs: dataset.refs,
        })).filter((row) => row.label || row.value),
      };
    }).filter((table) => table.rows.length),
  })).filter((section) => section.tables.length);
}

function walkFeatureList(list, lineage, features) {
  const nextLineage = [...lineage, {
    name: list.name || "",
    label: stripHtml(localize(list.description)) || list.name || "",
    type: list.type || "",
  }];

  for (const feature of list.feature || []) {
    const section = nextLineage[0] || {};
    const group = nextLineage[nextLineage.length - 1] || {};
    features.push(toFeatureRecord(feature, section, group, nextLineage, list));
  }

  for (const child of list["feature-list"] || []) {
    walkFeatureList(child, nextLineage, features);
  }
}

function toFeatureRecord(feature, section, group, lineage, list) {
  const property = feature.property || {};

  return {
    id: feature.id || "",
    label: stripHtml(localize(feature.description)),
    availability: feature.availability || "",
    preferred: feature.preferred === "y" || feature.preferred === true,
    section: section.name || "",
    section_label: section.label || section.name || "",
    group: group.name || "",
    group_label: group.label || group.name || "",
    path: lineage.map((item) => item.label || item.name).filter(Boolean),
    type: list.type || "",
    jlr_code: property.JLRCode || "",
    price: normalizePrice(feature.price),
    description: stripHtml(localize(property.ExtendedDescription)),
    leadtime_code: property.LEADTIME_CODE || "",
    content_list: parseEmbeddedList(localize(property.ContentList)),
    model_card_summary: parseEmbeddedList(localize(property.ModelCardSummary)),
    will_include: arrayOrEmpty(feature["will-include"]),
    will_exclude: arrayOrEmpty(feature["will-exclude"]),
    media: normalizeMedia(feature.media),
    query_hrefs: arrayOrEmpty(feature.query).map((item) => item.href).filter(Boolean),
    raw: feature,
  };
}

function compactFeature(feature) {
  if (!feature?.id) return {};

  return removeEmpty({
    id: feature.id,
    label: feature.label,
    availability: feature.availability,
    preferred: feature.preferred || undefined,
    section: feature.section,
    section_label: feature.section_label,
    group: feature.group,
    group_label: feature.group_label,
    path: feature.path,
    jlr_code: feature.jlr_code,
    price: feature.price,
    description: truncate(feature.description, 360),
    leadtime_code: feature.leadtime_code,
    will_include: feature.will_include,
    media: arrayOrEmpty(feature.media).slice(0, 3),
  });
}

function detailedFeature(feature) {
  return removeEmpty({
    ...compactFeature(feature),
    description: feature.description,
    content_list: feature.content_list,
    model_card_summary: feature.model_card_summary,
    will_exclude: feature.will_exclude,
    query_hrefs: feature.query_hrefs,
  });
}

function selectedFeatures(features) {
  return features.filter((feature) => SELECTED_AVAILABILITIES.has(feature.availability));
}

function groupFeatures(features, includeAllFeatures) {
  const groups = new Map();
  const relevant = includeAllFeatures
    ? features
    : features.filter((feature) => isSummaryRelevant(feature));

  for (const feature of relevant) {
    const key = feature.section_label || feature.section || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(compactFeature(feature));
  }

  return Object.fromEntries(groups);
}

function isSummaryRelevant(feature) {
  const section = normalizeSection(feature.section);
  if (["bodystyle", "model", "engine", "product", "exterior", "wheels", "interior", "accessories"].includes(section)) {
    return true;
  }

  return [
    "PACKS",
    "OPTIONS",
    "SOUND_SYSTEM",
    "TOWING",
    "REAR_SEAT_ENTERTAINMENT",
    "SEAT_TECH",
  ].includes(feature.group);
}

function buildHighlights(features) {
  const find = (predicate) => features.find(predicate);
  const bySection = (section) => find((feature) => normalizeSection(feature.section) === section);
  const byGroup = (...groups) => find((feature) => groups.includes(feature.group));

  return removeEmpty({
    bodystyle: compactFeature(bySection("bodystyle") || {}),
    model: compactFeature(bySection("model") || {}),
    propulsion: compactFeature(bySection("engine") || {}),
    product: compactFeature(bySection("product") || {}),
    paint: compactFeature(byGroup("PAINT_COLOUR") || {}),
    roof: compactFeature(byGroup("ROOF_COLOUR") || {}),
    wheels: compactFeature(byGroup("WHEEL") || {}),
    interior_trim: compactFeature(byGroup("TRIM") || {}),
    sound: compactFeature(byGroup("SOUND_SYSTEM") || {}),
    towing: compactFeature(byGroup("TOWING") || {}),
  });
}

function extractStandardFeatures(data, features, includeAllFeatures = false) {
  const standardListNames = arrayOrEmpty(data?.configuration?.["standard-features"]?.["feature-lists"]);
  const standardNames = new Set(standardListNames);
  const relevant = features.filter((feature) => (
    standardNames.has(feature.section) || standardNames.has(feature.group)
  ) && (includeAllFeatures || SELECTED_AVAILABILITIES.has(feature.availability)));

  const grouped = new Map();
  for (const feature of relevant) {
    const key = feature.group_label || feature.group || feature.section_label || feature.section || "Standard features";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(compactFeature(feature));
  }

  return {
    feature_lists: standardListNames,
    groups: Object.fromEntries(grouped),
  };
}

function extractSummaryMedia(data) {
  const media = data?.configuration?.summary?.media || [];
  return media
    .filter((item) => item?.url && !/mask|offset/i.test(`${item.name} ${item.purpose} ${item.url}`))
    .slice(0, 12)
    .map((item) => ({
      name: item.name,
      purpose: item.purpose,
      url: item.url,
    }));
}

function topSpecs(specs) {
  const wanted = /maximum speed|acceleration|combined wltp consumption|combined wltp co|maximum power|maximum torque|maximum towing|wading depth|loadspace|turning circle/i;
  const rows = [];

  for (const section of specs) {
    for (const table of section.tables) {
      for (const row of table.rows) {
        if (wanted.test(row.label)) {
          rows.push(removeEmpty({
            section: section.label,
            group: table.label,
            label: row.label,
            value: row.value,
          }));
        }
      }
    }
  }

  return rows.slice(0, 16);
}

function sourceSummary(context) {
  return {
    requested_source_url: context.source.requestedSourceUrl,
    resolved_source_url: context.source.sourceUrl,
    brand: context.source.brand,
    market: context.source.locale,
    nameplate: context.source.vehicleId,
    vehicle_label: context.source.vehicleLabel,
    model_year: context.source.modelYear,
    version: context.source.version,
    url_selection_ids: context.source.selectionIds,
    generated: context.data.metadata?.meta?.Generated,
    environment: context.data.metadata?.meta?.Environment,
  };
}

function caveatsFor(data) {
  const caveats = [
    "Uses public JLR configurator payloads; availability, prices and versions can change when JLR updates a market.",
  ];

  if (!hasVisiblePrice(data)) {
    caveats.push("This market payload does not expose visible price values.");
  }

  if (data?.metadata?.meta?.["AvailabilityEngine.info"]) {
    caveats.push(`Availability engine note: ${data.metadata.meta["AvailabilityEngine.info"]}.`);
  }

  caveats.push("No saved-build, stock, order, VIN, retailer, or finance quote endpoints are called.");
  return caveats;
}

function normalizeSection(section = "all") {
  const key = String(section || "all").trim().toLowerCase().replace(/_/g, " ");
  return SECTION_ALIASES.get(key) || key.replace(/\s+/g, "");
}

function normalizeMarket(market = DEFAULT_MARKET) {
  const key = String(market || DEFAULT_MARKET).trim().toLowerCase().replace("-", "_");
  return MARKET_ALIASES.get(key) || key;
}

function normalizeNameplate(nameplate = DEFAULT_NAMEPLATE) {
  const key = String(nameplate || DEFAULT_NAMEPLATE).trim().toLowerCase();
  const aliases = {
    "range rover": "l460",
    rangerover: "l460",
    l460: "l460",
    sport: "l461",
    "range rover sport": "l461",
    rangeroversport: "l461",
    l461: "l461",
    evoque: "l551",
    "range rover evoque": "l551",
    l551: "l551",
    velar: "l560",
    "range rover velar": "l560",
    l560: "l560",
  };

  const normalized = aliases[key] || aliases[key.replace(/\s+/g, "")] || key;
  if (!NAMEPLATES[normalized]) {
    throw new Error(`Unsupported nameplate "${nameplate}". Supported nameplates: ${Object.keys(NAMEPLATES).join(", ")}.`);
  }
  return normalized;
}

function clampLimit(limit) {
  const value = Number(limit || 50);
  if (!Number.isFinite(value)) return 50;
  return Math.max(1, Math.min(200, Math.floor(value)));
}

function localize(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    return value.en || value["en-GB"] || value["en_XI"] || Object.values(value).find((item) => typeof item === "string") || "";
  }
  return String(value);
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeText(value = "") {
  return stripHtml(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePrice(price) {
  if (!price || (typeof price === "object" && Object.keys(price).length === 0)) return null;
  if (typeof price === "string" || typeof price === "number") return price;
  return removeEmpty({
    value: price.value,
    formatted: price.formatted || price.display,
    currency: price.currency,
  });
}

function priceSummary(data, market) {
  const raw = data?.configuration?.summary?.price || {};
  const currencyFormat = data?.metadata?.meta?.["currency-format"] || "";
  const entries = Object.entries(raw);

  if (!entries.length) {
    return {
      available: false,
      note: "This market payload does not expose visible price values.",
    };
  }

  const breakdown = Object.fromEntries(entries.map(([key, price]) => [
    key.toLowerCase(),
    formatPrice(price, market, currencyFormat),
  ]));

  return removeEmpty({
    available: true,
    currency_format: currencyFormat,
    gross: breakdown.gross,
    net: breakdown.net,
    options_gross: breakdown.options_gross,
    accessories_gross: breakdown.accessories_gross,
    charges_gross: breakdown.charges_gross,
    breakdown,
  });
}

function formatPrice(price, market, currencyFormat = "") {
  const value = Number(price?.value);
  const currency = normalizeCurrency(price?.currency, market);
  const locale = localeForMarket(market);
  const decimals = /[,.]00/.test(currencyFormat) ? 2 : 0;
  const formatted = Number.isFinite(value)
    ? new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: decimals,
        minimumFractionDigits: decimals,
      }).format(value)
    : undefined;

  return removeEmpty({
    currency,
    value: Number.isFinite(value) ? value : price?.value,
    formatted,
  });
}

function normalizeCurrency(currency, market) {
  if (currency === "EUR-DK" || market === "da_dk") return "DKK";
  return currency || (market === "en_gb" ? "GBP" : market === "en_us" ? "USD" : "EUR");
}

function localeForMarket(market) {
  return {
    da_dk: "da-DK",
    en_gb: "en-GB",
    de_de: "de-DE",
    en_us: "en-US",
  }[market] || "en-US";
}

function hasVisiblePrice(data) {
  return Object.keys(data?.configuration?.summary?.price || {}).length > 0;
}

function normalizeMedia(media = []) {
  return arrayOrEmpty(media)
    .filter((item) => item?.url)
    .map((item) => ({
      name: item.name,
      purpose: item.purpose,
      url: item.url,
    }));
}

function parseEmbeddedList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.map((item) => removeEmpty({
          id: item.id,
          title: stripHtml(item.title || ""),
          feature_list: item.featureList,
          image_url: item.imageUrl,
          description: stripHtml(item.extendedDescription || ""),
        }))
      : [];
  } catch {
    return [];
  }
}

function featureIndex(features) {
  const index = new Map();
  for (const feature of features) {
    if (feature?.id && !index.has(feature.id.toLowerCase())) {
      index.set(feature.id.toLowerCase(), feature);
    }
  }
  return index;
}

function labelledFeature(id, index) {
  const feature = index.get(String(id).toLowerCase());
  return feature ? compactFeature(feature) : { id };
}

function explainChange(feature, added, removed) {
  const addText = added.length ? `adds ${listLabels(added)}` : "";
  const removeText = removed.length ? `removes ${listLabels(removed)}` : "";
  const joiner = addText && removeText ? " and " : "";
  const effect = `${addText}${joiner}${removeText}` || "does not require additional feature changes";
  return `Selecting ${feature.label || feature.id} ${effect}.`;
}

function listLabels(items) {
  const labels = items.map((item) => item.label || item.id);
  if (labels.length <= 5) return labels.join(", ");
  return `${labels.slice(0, 5).join(", ")} and ${labels.length - 5} more`;
}

function rulesPathToUrl(path) {
  const separator = path.includes("?") ? "&" : "?";
  return `${RULES_BASE_URL}${path}${separator}callback=config_rcjson`;
}

function rulesPathToConfiguratorUrl(path) {
  const cleanPath = path.split("?")[0].replace(/\.jsonp$/, "");
  const parts = cleanPath.split("/").filter(Boolean);
  const rcIndex = parts.indexOf("rc");
  const brand = parts[rcIndex + 1];
  const locale = parts[rcIndex + 2];
  const vehicleAndYear = parts[rcIndex + 3];
  const version = parts[rcIndex + 4];
  const selection = parts.slice(rcIndex + 5).filter((part) => part !== "_");
  const [vehicleId, modelYear] = vehicleAndYear.split("_");
  return buildConfiguratorUrl({ brand, locale, vehicleId, modelYear, version }, selection);
}

function comparePrices(summaries) {
  const rows = summaries.map((summary) => ({
    label: summary.label,
    gross: summary.price?.gross || null,
  }));
  const values = rows.map((row) => row.gross?.value).filter((value) => typeof value === "number");
  const min = values.length ? Math.min(...values) : null;

  return rows.map((row) => removeEmpty({
    ...row,
    delta_from_lowest: typeof row.gross?.value === "number" && min !== null
      ? row.gross.value - min
      : undefined,
  }));
}

function compareHighlights(summaries) {
  const keys = new Set(summaries.flatMap((summary) => Object.keys(summary.highlights || {})));
  const differences = {};

  for (const key of keys) {
    const values = summaries.map((summary) => ({
      build: summary.label,
      id: summary.highlights?.[key]?.id,
      label: summary.highlights?.[key]?.label,
    }));
    if (new Set(values.map((value) => value.id || "")).size > 1) {
      differences[key] = values;
    }
  }

  return differences;
}

function compareSpecs(summaries) {
  const byLabel = new Map();
  for (const summary of summaries) {
    for (const spec of summary.top_specs || []) {
      const key = `${spec.group}: ${spec.label}`;
      if (!byLabel.has(key)) byLabel.set(key, []);
      byLabel.get(key).push({ build: summary.label, value: spec.value });
    }
  }

  return Object.fromEntries([...byLabel.entries()].filter(([, values]) => (
    values.length > 1 && new Set(values.map((value) => value.value)).size > 1
  )));
}

function mergeSelectionIds(...groups) {
  const seen = new Set();
  const merged = [];
  for (const id of groups.flatMap((group) => normalizeSelectionIds(group || []))) {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  }
  return merged;
}

async function resolveFinalUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "jlr-configurator-mcp/0.2",
      },
    });
    if (!response.ok) {
      throw new Error(`Could not resolve configurator URL; HTTP ${response.status}.`);
    }
    return response.url;
  } finally {
    clearTimeout(timeout);
  }
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function truncate(value, max) {
  if (!value || value.length <= max) return value;
  return `${value.slice(0, max - 1).trim()}...`;
}

function removeEmpty(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => {
      if (value === undefined || value === null || value === "") return false;
      if (Array.isArray(value) && value.length === 0) return false;
      if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return false;
      return true;
    })
  );
}
