import {
  DEFAULT_MARKET,
  DEFAULT_NAMEPLATE,
  adviseUkBuild,
  compareBuilds,
  findConfigurators,
  getFeatureDetails,
  getSpecsAndStandardFeatures,
  listFeatures,
  previewSelectionChange,
  summarizeConfiguration,
} from "./rangeRoverConfigurator.js";

export const protocolVersion = "2024-11-05";

export const instructions = [
  "Use these tools when the user asks about JLR or Range Rover configurators, models, engines, paints, wheels, interiors, packs, accessories, prices, specs, or build comparisons.",
  `Default to the UK market (${DEFAULT_MARKET}) and Range Rover (${DEFAULT_NAMEPLATE}) unless the user provides another market, model, or configurator URL.`,
  "Never choose Denmark/da_dk unless the user explicitly asks for Denmark, Danish, DK, da_dk, or provides a da_dk configurator URL. For ambiguous English-language requests, use UK/en_gb.",
  "For open-ended customer advice, call advise_jlr_uk_build first. If it returns questions, ask those questions before recommending. If it returns a recommendation, explain it in plain English with prices, specs and trade-offs.",
  "Behave like a helpful UK product specialist for a potential customer: explain choices in plain English, compare trade-offs, mention prices and specs when available, and avoid overwhelming the user with raw IDs.",
  "The user does not need feature IDs. Resolve natural words by calling list_jlr_configurator_features, preview dependency changes with preview_jlr_selection_change, then summarize the accepted build with summarize_jlr_configuration.",
  "Use find_jlr_configurators when the user asks what can be built in a market or names a model family such as Range Rover Sport, Evoque, or Velar.",
  "Do not claim retailer stock, saved builds, VIN/order lookup, lead times, finance eligibility, or final transaction terms. These tools only use public configurator payloads.",
].join("\n");

const marketProperty = {
  type: "string",
  description: "Optional market/locale. Defaults to en_gb/UK. Accepts en_gb or UK by default; use en_us, de_de, da_dk, or en_xi only when the user explicitly asks for another market or provides a market-specific configurator URL.",
};

const nameplateProperty = {
  type: "string",
  description: "Optional nameplate. Accepts l460/Range Rover, l461/Range Rover Sport, l551/Evoque, or l560/Velar. Defaults to l460.",
};

const sourceUrlProperty = {
  type: "string",
  description: "Optional public JLR configurator URL. Shorthand and expanded URLs are accepted; user-provided selected feature IDs in the URL are preserved.",
};

const selectionIdsProperty = {
  type: "array",
  description: "Optional configurator feature IDs already selected, e.g. ['a-std-hse_a-swb_a-td6-300_d', 'n-031ze'].",
  items: { type: "string" },
};

export const tools = [
  {
    name: "advise_jlr_uk_build",
    title: "Advise UK JLR Build",
    description:
      "Use for open-ended UK customer guidance such as 'which Range Rover should I buy?', 'help me choose a build', or 'recommend a JLR model for my needs'. If key preferences are missing, returns 3-5 short buying questions. Once enough context is available, recommends a UK build with price, rationale, trade-offs, next options to explore, and alternative models.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        budget_gbp: {
          type: "number",
          description: "Optional rough on-the-road budget in GBP. Use this when the user gives a purchase budget rather than a monthly payment.",
        },
        monthly_budget_gbp: {
          type: "number",
          description: "Optional monthly affordability signal if the user gives a monthly figure. This is only used as context; the tool does not quote finance.",
        },
        passengers: {
          type: "integer",
          description: "How many people the customer regularly carries.",
          minimum: 1,
          maximum: 8,
        },
        typical_use: {
          type: "string",
          description: "Natural description of use case, e.g. city driving, motorway miles, family trips, towing, commuting, mixed use.",
        },
        driving_pattern: {
          type: "string",
          description: "Optional extra driving context such as mostly long-distance motorway, short urban trips, school runs, rural roads, or business use.",
        },
        fuel_preference: {
          type: "string",
          description: "Customer preference such as petrol, diesel, plug-in hybrid, electric-feeling driving, no preference, or lower emissions.",
        },
        charging_access: {
          type: "string",
          description: "Whether the customer can charge at home/work, cannot charge reliably, or is unsure.",
        },
        towing: {
          type: "boolean",
          description: "Whether towing should influence the recommendation.",
        },
        priorities: {
          type: "array",
          description: "Customer priorities such as comfort, quiet luxury, performance, compact size, technology, towing, lower running costs, design, audio.",
          items: { type: "string" },
        },
        must_haves: {
          type: "string",
          description: "Any must-have features or constraints in natural language.",
        },
        preferred_model: nameplateProperty,
        nameplate: nameplateProperty,
        force_refresh: {
          type: "boolean",
          description: "Bypass the short in-memory cache and refetch the JLR payload.",
          default: false,
        },
      },
    },
  },
  {
    name: "find_jlr_configurators",
    title: "Find JLR Configurators",
    description:
      "Use when the user asks which Range Rover/JLR configurators are available for a market or model. Resolves public shorthand configurator URLs to the current expanded vehicle/model-year/version URL and can include market price availability.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        market: marketProperty,
        nameplate: nameplateProperty,
        include_prices: {
          type: "boolean",
          description: "Whether to fetch public pricing from each configurator payload. Defaults to true.",
          default: true,
        },
        force_refresh: {
          type: "boolean",
          description: "Bypass the short in-memory cache and refetch JLR payloads.",
          default: false,
        },
      },
    },
  },
  {
    name: "list_jlr_configurator_features",
    title: "List JLR Configurator Features",
    description:
      "Use when the user asks what configurator choices are available, such as models, engines/propulsions, colours, wheels, interiors, packs, options, or accessories. Search accepts natural terms like 'Santorini', 'diesel', '23 inch', 'comfort pack', or 'pet pack'. If selection_ids or a selected source_url are provided, availability is evaluated for that configuration state.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        source_url: sourceUrlProperty,
        market: marketProperty,
        nameplate: nameplateProperty,
        section: {
          type: "string",
          description:
            "Optional section filter. Common values: all, bodystyle, model, engine, exterior, wheels, interior, options, accessories.",
          default: "all",
        },
        search: {
          type: "string",
          description: "Optional natural-language search term, e.g. 'Fuji White', 'P460e', 'SV', 'rear entertainment'.",
        },
        include_excluded: {
          type: "boolean",
          description: "Whether to include currently excluded/unavailable choices. Defaults to false.",
          default: false,
        },
        selection_ids: selectionIdsProperty,
        limit: {
          type: "integer",
          description: "Maximum number of features to return, from 1 to 200. Defaults to 50.",
          minimum: 1,
          maximum: 200,
          default: 50,
        },
        force_refresh: {
          type: "boolean",
          description: "Bypass the short in-memory cache and refetch the JLR payload.",
          default: false,
        },
      },
    },
  },
  {
    name: "get_jlr_feature_details",
    title: "Get JLR Feature Details",
    description:
      "Use when the user asks for detail about one configurator feature ID, including description, included items, related media, and upstream query hrefs. If the user gives a name rather than an ID, first use list_jlr_configurator_features.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["feature_id"],
      properties: {
        feature_id: {
          type: "string",
          description: "Configurator feature ID, e.g. 'N-031ZE', 'A-STD-HSE', or 'VPLKPET01'.",
        },
        source_url: sourceUrlProperty,
        market: marketProperty,
        nameplate: nameplateProperty,
        selection_ids: selectionIdsProperty,
        force_refresh: {
          type: "boolean",
          description: "Bypass the short in-memory cache and refetch the JLR payload.",
          default: false,
        },
      },
    },
  },
  {
    name: "summarize_jlr_configuration",
    title: "Summarize JLR Configuration",
    description:
      "Use when the user wants a Range Rover/JLR build summarized from selected feature IDs or from a selected configurator URL. Returns market-aware pricing where public payloads expose it, selected/default highlights, standard features, top specs, media URLs, and caveats.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        source_url: sourceUrlProperty,
        market: marketProperty,
        nameplate: nameplateProperty,
        selection_ids: selectionIdsProperty,
        include_all_features: {
          type: "boolean",
          description: "Include all selected/default/included features rather than a shorter user-facing summary.",
          default: false,
        },
        force_refresh: {
          type: "boolean",
          description: "Bypass the short in-memory cache and refetch the JLR payload.",
          default: false,
        },
      },
    },
  },
  {
    name: "preview_jlr_selection_change",
    title: "Preview JLR Selection Change",
    description:
      "Use before changing a build. Given the current selected feature IDs and a feature_id to select, returns the public configurator accept/reject paths, added and removed features with labels, and a plain-language dependency explanation.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["feature_id"],
      properties: {
        feature_id: {
          type: "string",
          description: "Configurator feature ID the user wants to select, e.g. 'N-017PB' for Comfort Pack or 'A-SV' for Range Rover SV.",
        },
        source_url: sourceUrlProperty,
        market: marketProperty,
        nameplate: nameplateProperty,
        selection_ids: selectionIdsProperty,
        force_refresh: {
          type: "boolean",
          description: "Bypass the short in-memory cache and refetch the JLR payload.",
          default: false,
        },
      },
    },
  },
  {
    name: "get_jlr_specs_and_standard_features",
    title: "Get JLR Specs And Standard Features",
    description:
      "Use when the user asks about technical specifications, WLTP, towing, powertrain, dimensions, standard equipment, or included features for a specific build.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        source_url: sourceUrlProperty,
        market: marketProperty,
        nameplate: nameplateProperty,
        selection_ids: selectionIdsProperty,
        spec_search: {
          type: "string",
          description: "Optional search term for specs, e.g. towing, WLTP, acceleration, dimensions, loadspace.",
        },
        include_all_features: {
          type: "boolean",
          description: "Include all standard feature candidates, including available/excluded, instead of only selected/default/included.",
          default: false,
        },
        force_refresh: {
          type: "boolean",
          description: "Bypass the short in-memory cache and refetch the JLR payload.",
          default: false,
        },
      },
    },
  },
  {
    name: "compare_jlr_builds",
    title: "Compare JLR Builds",
    description:
      "Use when the user wants to compare 2 to 4 configurator builds. Each build can provide a label, market, nameplate, source_url, and selected feature IDs. Returns price, highlight, and top-spec differences.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["builds"],
      properties: {
        market: marketProperty,
        nameplate: nameplateProperty,
        builds: {
          type: "array",
          minItems: 2,
          maxItems: 4,
          items: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: {
                type: "string",
                description: "Human-readable build label, e.g. 'HSE D300' or 'SV P550e'.",
              },
              source_url: sourceUrlProperty,
              market: marketProperty,
              nameplate: nameplateProperty,
              selection_ids: selectionIdsProperty,
            },
          },
        },
        force_refresh: {
          type: "boolean",
          description: "Bypass the short in-memory cache and refetch the JLR payload.",
          default: false,
        },
      },
    },
  },
];

export async function handleMcpMessage(message) {
  if (!message || typeof message !== "object") {
    return jsonRpcError(null, -32600, "Invalid Request");
  }

  try {
    switch (message.method) {
      case "initialize":
        return jsonRpcResult(message.id, {
          protocolVersion: message.params?.protocolVersion || protocolVersion,
          capabilities: { tools: {} },
          serverInfo: {
            name: "jlr-configurator-mcp",
            version: "0.3.0",
          },
          instructions,
        });

      case "tools/list":
        return jsonRpcResult(message.id, { tools });

      case "tools/call":
        return jsonRpcResult(message.id, await callTool(message.params || {}));

      case "ping":
        return jsonRpcResult(message.id, {});

      default:
        return jsonRpcError(message.id, -32601, `Method not found: ${message.method}`);
    }
  } catch (error) {
    return jsonRpcError(message.id, -32000, error.message || String(error));
  }
}

export async function callTool(params) {
  const name = params.name;
  const args = params.arguments || {};
  let result;

  if (name === "find_jlr_configurators") {
    result = await findConfigurators(args);
  } else if (name === "advise_jlr_uk_build") {
    result = await adviseUkBuild(args);
  } else if (name === "list_jlr_configurator_features" || name === "list_range_rover_features") {
    result = await listFeatures(args);
  } else if (name === "get_jlr_feature_details" || name === "get_range_rover_feature_details") {
    result = await getFeatureDetails(args);
  } else if (name === "summarize_jlr_configuration" || name === "summarize_range_rover_configuration") {
    result = await summarizeConfiguration(args);
  } else if (name === "preview_jlr_selection_change") {
    result = await previewSelectionChange(args);
  } else if (name === "get_jlr_specs_and_standard_features") {
    result = await getSpecsAndStandardFeatures(args);
  } else if (name === "compare_jlr_builds") {
    result = await compareBuilds(args);
  } else {
    throw new Error(`Unknown tool: ${name}`);
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

function jsonRpcResult(id, result) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  };
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
    },
  };
}
