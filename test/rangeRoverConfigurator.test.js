import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConfiguratorUrl,
  buildPreviewRulesUrl,
  buildRulesUrl,
  adviseUkBuild,
  findConfigurators,
  flattenFeatures,
  getConfiguratorData,
  getSpecsAndStandardFeatures,
  compareBuilds,
  parseJsonp,
  parseSourceUrl,
  parseSpecs,
  previewSelectionChange,
  summarizeConfiguration,
} from "../src/rangeRoverConfigurator.js";
import { handleMcpMessage } from "../src/mcpProtocol.js";

test("parses an expanded Range Rover configurator URL", () => {
  const parsed = parseSourceUrl("https://www.rangerover.com/lr/en_xi/l460_k27/4cujt/ipr/personalise/");

  assert.equal(parsed.brand, "lr");
  assert.equal(parsed.locale, "en_xi");
  assert.equal(parsed.vehicleId, "l460");
  assert.equal(parsed.modelYear, "k27");
  assert.equal(parsed.version, "4cujt");
});

test("rejects non-JLR configurator hosts", () => {
  assert.throws(
    () => parseSourceUrl("https://example.com/lr/en_gb/l460_k27/4culc/ipr/personalise/"),
    /official Range Rover\/Land Rover host/
  );
});

test("builds rules, preview and configurator URLs with selected feature IDs", () => {
  const source = parseSourceUrl("https://www.rangerover.com/lr/en_xi/l460_k27/4cujt/ipr/personalise/");

  assert.equal(
    buildRulesUrl(source, ["N-031ZE", "A-STD-HSE_A-SWB_A-TD6-300_D"]),
    "https://rules.config.landrover.com/rc/lr/en_xi/l460_k27/4cujt/n-031ze/a-std-hse_a-swb_a-td6-300_d/.jsonp?view=personalise&callback=config_rcjson"
  );
  assert.equal(
    buildPreviewRulesUrl(source, ["A-STD-HSE_A-SWB_A-TD6-300_D"], "N-017PB"),
    "https://rules.config.landrover.com/rc/lr/en_xi/l460_k27/4cujt/a-std-hse_a-swb_a-td6-300_d/.jsonp?q=n-017pb&view=personalise&callback=config_rcjson"
  );
  assert.equal(
    buildConfiguratorUrl(source, ["N-031ZE"]),
    "https://www.rangerover.com/lr/en_xi/l460_k27/4cujt/n-031ze/ipr/personalise/"
  );
});

test("parses JSONP", () => {
  assert.deepEqual(parseJsonp("config_rcjson({\"ok\":true});"), { ok: true });
});

test("flattens nested feature lists", () => {
  const data = {
    "feature-dictionary": {
      "feature-list": [
        {
          name: "EXTERIOR",
          type: "mutex1",
          description: { en: "Exterior" },
          "feature-list": [
            {
              name: "PAINT_COLOUR",
              type: "mutex1",
              description: { en: "Colours and Finish" },
              feature: [
                {
                  id: "N-1AA",
                  availability: "default",
                  description: { en: "Fuji White" },
                  property: {
                    ExtendedDescription: { en: "<p>Solid - Gloss Finish</p>" },
                    JLRCode: "1AA",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };

  const features = flattenFeatures(data);
  assert.equal(features.length, 1);
  assert.equal(features[0].section, "EXTERIOR");
  assert.equal(features[0].group, "PAINT_COLOUR");
  assert.equal(features[0].label, "Fuji White");
  assert.equal(features[0].description, "Solid - Gloss Finish");
});

test("parses spec table rows", () => {
  const specs = parseSpecs({
    specs: [
      {
        id: ":SECTION_1",
        description: { en: "PERFORMANCE AND WEIGHT" },
        table: [
          {
            id: ":TABLE_1",
            labels: {
              heading: { description: { en: "PERFORMANCE" } },
              label: [
                { description: { en: "Maximum speed km/h (mph)" } },
                { description: { en: "Acceleration (secs) 0-100 km/h (0-60mph)" } },
              ],
            },
            datasets: [
              {
                refs: "A-TD6-300",
                data: [
                  { description: { en: "218" } },
                  { description: { en: "6,6" } },
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  assert.equal(specs[0].label, "PERFORMANCE AND WEIGHT");
  assert.equal(specs[0].tables[0].label, "PERFORMANCE");
  assert.deepEqual(specs[0].tables[0].rows[0], {
    label: "Maximum speed km/h (mph)",
    value: "218",
    refs: "A-TD6-300",
  });
});

test("MCP initialize and tools/list return the enhanced tool surface", async () => {
  const initialized = await handleMcpMessage({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.equal(initialized.result.serverInfo.name, "jlr-configurator-mcp");

  const listed = await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const names = listed.result.tools.map((tool) => tool.name);
  assert.ok(names.includes("find_jlr_configurators"));
  assert.ok(names.includes("advise_jlr_uk_build"));
  assert.ok(names.includes("preview_jlr_selection_change"));
  assert.ok(names.includes("compare_jlr_builds"));
  assert.equal(names.length, 8);
});

test("resolves configured URLs for key markets and nameplates", async () => {
  const markets = ["da_dk", "en_gb", "de_de", "en_us", "en_xi"];
  for (const market of markets) {
    const context = await getConfiguratorData({ market, nameplate: "l460" });
    assert.equal(context.source.locale, market);
    assert.equal(context.source.vehicleId, "l460");
    assert.ok(context.source.modelYear);
    assert.ok(context.source.version);
    assert.equal(context.data.metadata.status, "200");
  }
});

test("Danish Range Rover summary exposes gross price while en_xi keeps a no-price caveat", async () => {
  const dk = await summarizeConfiguration({ market: "da_dk", nameplate: "l460" });
  const xi = await summarizeConfiguration({ market: "en_xi", nameplate: "l460" });

  assert.equal(dk.price.available, true);
  assert.equal(dk.price.gross.currency, "DKK");
  assert.ok(dk.price.gross.formatted.includes("kr"));
  assert.equal(xi.price.available, false);
  assert.match(xi.price.note, /does not expose/);
});

test("find_jlr_configurators returns supported Danish nameplates", async () => {
  const result = await findConfigurators({ market: "da_dk", include_prices: false });
  const nameplates = result.configurators.map((item) => item.nameplate);

  assert.deepEqual(nameplates, ["l460", "l461", "l551", "l560"]);
  assert.ok(result.configurators.every((item) => item.expanded_url.includes("/lr/da_dk/")));
});

test("previewing Comfort Pack returns public added and removed feature dependencies", async () => {
  const preview = await previewSelectionChange({
    market: "en_xi",
    nameplate: "l460",
    selection_ids: ["a-std-hse_a-swb_a-td6-300_d"],
    feature_id: "N-017PB",
  });

  assert.equal(preview.feature.label, "Comfort Pack");
  assert.ok(preview.added.some((item) => item.id === "N-047DB" && item.label === "Privacy glass"));
  assert.ok(preview.removed.some((item) => item.id === "N-047DA" && item.label === "Standard glass"));
  assert.match(preview.explanation, /Selecting Comfort Pack adds/);
});

test("previewing SV returns major added and removed labels", async () => {
  const preview = await previewSelectionChange({
    market: "en_xi",
    nameplate: "l460",
    selection_ids: ["a-std-hse_a-swb_a-td6-300_d"],
    feature_id: "A-SV",
  });

  assert.equal(preview.feature.label, "Range Rover SV");
  assert.ok(preview.added.some((item) => item.label?.includes("P550e Petrol Plug-in Hybrid")));
  assert.ok(preview.removed.some((item) => item.label?.includes("D300 Diesel Mild Hybrid")));
});

test("specs and standard features can be filtered for towing/WLTP scenarios", async () => {
  const result = await getSpecsAndStandardFeatures({
    market: "en_xi",
    nameplate: "l460",
    selection_ids: ["a-std-hse_a-swb_a-td6-300_d"],
    spec_search: "towing",
  });

  assert.ok(result.specs.length > 0);
  assert.ok(result.specs.some((section) => section.tables.some((table) => /towing/i.test(table.label))));
  assert.ok(result.standard_features.feature_lists.includes("EXTERIOR"));
});

test("compares two public JLR builds by highlights and specs", async () => {
  const result = await compareBuilds({
    market: "en_xi",
    nameplate: "l460",
    builds: [
      { label: "HSE D300", selection_ids: ["a-std-hse_a-swb_a-td6-300_d"] },
      { label: "SV P550e", selection_ids: ["a-si6-550-aj22_a-sv_a-swb_h"] },
    ],
  });

  assert.equal(result.builds.length, 2);
  assert.equal(result.builds[0].highlights.model.label, "Range Rover HSE");
  assert.equal(result.builds[1].highlights.model.label, "Range Rover SV");
  assert.ok(result.highlight_differences.model);
});

test("UK advisor asks buying questions before recommending", async () => {
  const result = await adviseUkBuild({});

  assert.equal(result.status, "needs_preferences");
  assert.ok(result.questions.length >= 3);
  assert.equal(result.market, "en_gb");
});

test("UK advisor recommends a customer-friendly build with trade-offs", async () => {
  const result = await adviseUkBuild({
    budget_gbp: 95000,
    passengers: 4,
    typical_use: "family car with motorway trips and a sportier drive",
    charging_access: "I can charge at home",
    priorities: ["performance", "technology"],
  });

  assert.equal(result.status, "recommendation");
  assert.equal(result.market, "en_gb");
  assert.ok(result.recommendation.vehicle);
  assert.ok(result.recommendation.price.formatted.includes("£"));
  assert.ok(result.recommendation.why_this_fits.length > 0);
  assert.ok(result.alternatives.length >= 2);
});
