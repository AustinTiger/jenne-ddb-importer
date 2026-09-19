// Universal Compendium Index Sanitizer
// Prevents Foundry VTT server-backend fatal crash:
// "TypeError: Cannot create property 'rules' on number '1'"
// which occurs when indexFields contains both an ancestor path (e.g. "system.source")
// and a child path (e.g. "system.source.rules"), causing server-side setProperty() to fail.
export function patchCompendiumIndexSanitizer() {
  const CompendiumCls = globalThis.CompendiumCollection ?? foundry?.documents?.collections?.CompendiumCollection;
  if (!CompendiumCls || CompendiumCls.prototype._sanitizedGetIndex) return;

  const origGetIndex = CompendiumCls.prototype.getIndex;
  CompendiumCls.prototype._sanitizedGetIndex = origGetIndex;

  CompendiumCls.prototype.getIndex = async function(options = {}) {
    if (Array.isArray(options?.fields) && options.fields.length > 0) {
      const currentFields = Array.from(this.indexFields || []);
      const sorted = [...options.fields].sort((a, b) => (typeof a === "string" ? a.split(".").length : 0) - (typeof b === "string" ? b.split(".").length : 0));
      const safeFields = [];
      for (const f of sorted) {
        if (!f || typeof f !== "string") continue;
        const parts = f.split(".");
        let hasAncestor = false;
        for (let i = 1; i < parts.length; i++) {
          const ancestor = parts.slice(0, i).join(".");
          if (currentFields.includes(ancestor) || safeFields.includes(ancestor)) {
            hasAncestor = true;
            break;
          }
        }
        if (!hasAncestor) safeFields.push(f);
      }
      options = { ...options, fields: safeFields };
    }
    return origGetIndex.call(this, options);
  };
}
patchCompendiumIndexSanitizer();

// Universal Item Properties Migration Sanitizer
// Prevents dnd5e fatal crash during document/compendium loading:
// "TypeError: Failed data migration for Item5e: source.system.properties?.findSplice is not a function"
// which occurs when items have source.system.properties as an Object ({ mgc: true }) or Set, rather than an Array.
export function patchItemPropertiesMigration() {
  // 1. Set.prototype.findSplice polyfill
  if (typeof Set !== "undefined" && !Set.prototype.findSplice) {
    Object.defineProperty(Set.prototype, "findSplice", {
      value: function(predicate) {
        for (const val of this) {
          if (predicate(val)) {
            this.delete(val);
            return val;
          }
        }
        return null;
      },
      configurable: true,
      writable: true
    });
  }

  // 2. Normalize properties on raw item source objects
  function normalizeProperties(source) {
    if (!source?.system?.properties) return;
    const props = source.system.properties;
    if (props instanceof Set) {
      source.system.properties = Array.from(props);
    } else if (typeof props === "object" && !Array.isArray(props)) {
      source.system.properties = Object.keys(props).filter(k => Boolean(props[k]));
    } else if (typeof props === "string") {
      source.system.properties = [props];
    }
  }

  // 3. Patch Item5e.migrateData
  const patchItemClass = (ItemCls) => {
    if (!ItemCls || ItemCls.prototype?._propertiesMigrationPatched) return;
    if (ItemCls.prototype) ItemCls.prototype._propertiesMigrationPatched = true;
    const origMigrateData = ItemCls.migrateData;
    ItemCls.migrateData = function(source) {
      normalizeProperties(source);
      return origMigrateData.call(this, source);
    };
  };

  const ItemCls = globalThis.dnd5e?.documents?.Item5e ?? CONFIG.Item?.documentClass;
  if (ItemCls) patchItemClass(ItemCls);

  // 4. Safe transformDurationData on BaseActivityData
  const safeTransformDurationData = function(source, options) {
    if (source.type === "spell") return {};
    let concentration = false;
    normalizeProperties(source);
    const props = source.system?.properties;
    if (Array.isArray(props)) {
      concentration = Boolean(props.findSplice?.(p => p === "concentration"));
    } else if (props instanceof Set) {
      concentration = props.has("concentration");
      props.delete("concentration");
    } else if (props && typeof props === "object") {
      concentration = Boolean(props.concentration);
      delete props.concentration;
    }
    return {
      concentration,
      value: source.system?.duration?.value ?? null,
      units: source.system?.duration?.units ?? "inst",
      special: ""
    };
  };

  const BaseActivity = globalThis.dnd5e?.dataModels?.activity?.BaseActivityData;
  if (BaseActivity && !BaseActivity._durationDataPatched) {
    BaseActivity._durationDataPatched = true;
    BaseActivity.transformDurationData = safeTransformDurationData;
  }

  // 5. Hook "init" for late-registered classes
  Hooks.once("init", () => {
    const lateItemCls = globalThis.dnd5e?.documents?.Item5e ?? CONFIG.Item?.documentClass;
    if (lateItemCls) patchItemClass(lateItemCls);

    if (CONFIG.DND5E?.activityTypes) {
      for (const act of Object.values(CONFIG.DND5E.activityTypes)) {
        if (act.documentClass && !act.documentClass._durationDataPatched) {
          act.documentClass._durationDataPatched = true;
          act.documentClass.transformDurationData = safeTransformDurationData;
        }
      }
    }
  });
}
patchItemPropertiesMigration();

import "../dist/main.mjs";
import { JenneDDBApi } from "./api.mjs";

const COMPENDIUM_FOLDER_NAME = "Jenne D&D Beyond Importer";

export async function ensureDDBCompendiumsUnlocked() {
  if (!game.user?.isGM) return;

  const compendiumSettingKeys = [
    "entity-character-compendium",
    "entity-spell-compendium",
    "entity-item-compendium",
    "entity-monster-compendium",
    "entity-feat-compendium",
    "entity-class-compendium",
    "entity-subclass-compendium",
    "entity-species-compendium",
    "entity-background-compendium",
    "entity-vehicle-compendium",
    "entity-feature-compendium",
    "entity-trait-compendium",
    "entity-adventure-compendium",
    "entity-journal-compendium",
    "entity-table-compendium",
    "entity-summons-compendium",
    "entity-spell-2014-compendium",
    "entity-item-2014-compendium",
    "entity-monster-2014-compendium"
  ];

  const ddbPackKeys = new Set();
  compendiumSettingKeys.forEach(key => {
    for (const ns of ["jenne-ddb-importer", "ddb-importer"]) {
      try {
        const val = game.settings.get(ns, key);
        if (val) ddbPackKeys.add(val);
      } catch (e) {}
    }
  });

  for (const pack of game.packs) {
    const isDDB = ddbPackKeys.has(pack.collection) ||
                  ddbPackKeys.has(pack.metadata.id) ||
                  pack.collection.startsWith("jenne-bag-of-holding.d-d-beyond-") ||
                  pack.metadata.packageName === "jenne-ddb-importer" ||
                  pack.metadata.packageName === "ddb-importer" ||
                  pack.metadata.label.startsWith("DDB ") ||
                  pack.metadata.label.startsWith("Jenne DDB ");

    if (isDDB && pack.locked) {
      console.log(`[DDB Importer] Auto-unlocking compendium "${pack.metadata.label}" (${pack.collection}) for import.`);
      try {
        await pack.configure({ locked: false });
      } catch (err) {
        console.warn(`[DDB Importer] Could not unlock pack ${pack.collection}:`, err);
      }
    }
  }
}

export async function organizeDDBCompendiums() {
  if (!game.user.isGM) return;

  try {
    let folder = game.folders.find(f => f.type === "Compendium" && f.name === COMPENDIUM_FOLDER_NAME);
    if (!folder) {
      folder = await Folder.create({
        name: COMPENDIUM_FOLDER_NAME,
        type: "Compendium",
        color: "#98020a",
        sorting: "a"
      });
      console.log(`[DDB Importer] Created compendium folder: "${COMPENDIUM_FOLDER_NAME}"`);
    }

    const ddbPackKeys = new Set();

    // 1. Collect configured compendium settings
    const compendiumSettingKeys = [
      "entity-character-compendium",
      "entity-spell-compendium",
      "entity-item-compendium",
      "entity-monster-compendium",
      "entity-feat-compendium",
      "entity-class-compendium",
      "entity-subclass-compendium",
      "entity-species-compendium",
      "entity-background-compendium",
      "entity-vehicle-compendium",
      "entity-feature-compendium",
      "entity-trait-compendium",
      "entity-adventure-compendium",
      "entity-journal-compendium",
      "entity-table-compendium",
      "entity-summons-compendium",
      "entity-spell-2014-compendium",
      "entity-item-2014-compendium",
      "entity-monster-2014-compendium"
    ];

    compendiumSettingKeys.forEach(key => {
      for (const ns of ["jenne-ddb-importer", "ddb-importer"]) {
        try {
          const val = game.settings.get(ns, key);
          if (val) ddbPackKeys.add(val);
        } catch (e) {}
      }
    });

    // 2. Iterate all packs in world
    for (const pack of game.packs) {
      const isDDB = ddbPackKeys.has(pack.collection) ||
                    ddbPackKeys.has(pack.metadata.id) ||
                    pack.collection.startsWith("jenne-bag-of-holding.d-d-beyond-") ||
                    pack.metadata.packageName === "jenne-ddb-importer" ||
                    pack.metadata.packageName === "ddb-importer" ||
                    pack.metadata.label.startsWith("DDB ") ||
                    pack.metadata.label.startsWith("Jenne DDB ");

      if (isDDB) {
        if (pack.locked) {
          try {
            await pack.configure({ locked: false });
          } catch (_) {}
        }
        if (pack.folder?.id !== folder.id) {
          console.log(`[DDB Importer] Moving compendium "${pack.metadata.label}" into "${COMPENDIUM_FOLDER_NAME}" folder`);
          try {
            await pack.configure({ folder: folder.id, locked: pack.config?.locked ?? false });
          } catch (err) {
            try {
              await pack.setFolder(folder.id);
            } catch (e) {
              console.warn(`[DDB Importer] Could not set folder for pack ${pack.metadata.label}:`, e);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("[DDB Importer] Error organizing compendiums into folder:", err);
  }
}

Hooks.once("setup", async () => {
  await ensureDDBCompendiumsUnlocked();
});

Hooks.once("ready", async () => {
  await ensureDDBCompendiumsUnlocked();
  await organizeDDBCompendiums();
});

Hooks.on("ddb-importer.compendiumCreationComplete", async () => {
  await ensureDDBCompendiumsUnlocked();
  await organizeDDBCompendiums();
});

const openMuncher = () => {
  if (globalThis.DDBImporter?.DDBMuncher) {
    new globalThis.DDBImporter.DDBMuncher().render({ force: true });
  } else {
    const compBtn = document.querySelector("button.ddb-muncher");
    if (compBtn) {
      compBtn.click();
    } else {
      ui.notifications.info("D&D Beyond Importer is initializing...");
    }
  }
};

globalThis.JenneDDBImporter = {
  api: JenneDDBApi,
  openMuncher,
  organizeDDBCompendiums
};

// Hook into Actor Sheet Header Buttons (V1 sheets)
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  // Actor header buttons removed per user preference - imports managed via DDB Importer
});

// Hook into Header Controls for ApplicationV2 sheets
const handleHeaderControlsV2 = (sheet, controls) => {
  // Actor & party sheet header controls removed per user preference - imports managed via DDB Importer
};

[
  "getHeaderControlsBaseActorSheet",
  "getHeaderControlsActorSheetV2",
  "getHeaderControlsCharacterActorSheet",
  "getHeaderControlsNPCActorSheet",
  "getHeaderControlsGroupActorSheet",
  "getHeaderControlsDocumentSheetV2"
].forEach(hookName => Hooks.on(hookName, handleHeaderControlsV2));

// Universal listener for Cobalt Cookie forms across all D&D Beyond Importer windows
const attachCobaltListeners = (html) => {
  const root = html instanceof HTMLElement ? html : (html[0] || document);
  if (!root) return;

  const cobaltInput = root.querySelector("#cobalt-cookie-input") || root.querySelector("#ddb-cobalt-cookie") || root.querySelector('input[name="cobalt-cookie"]');
  const clearBtns = root.querySelectorAll(".clear-cobalt-btn, #btn-clear-cobalt, #btn-clear-cobalt-standalone");
  
  clearBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (cobaltInput) {
        cobaltInput.value = "";
        cobaltInput.dispatchEvent(new Event("change", { bubbles: true }));
        cobaltInput.dispatchEvent(new Event("input", { bubbles: true }));
        ui.notifications?.info?.("Cobalt cookie cleared.");
      }
    });
  });

  const checkBtn = root.querySelector("#check-cobalt-button") || root.querySelector('[data-action="checkCobaltButton"]');
  if (checkBtn && !checkBtn.dataset.listenerBound) {
    checkBtn.dataset.listenerBound = "true";
    checkBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      checkBtn.disabled = true;
      checkBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking Cobalt Cookie...';

      try {
        const cookieVal = cobaltInput ? cobaltInput.value.trim() : "";
        if (!cookieVal) {
          checkBtn.innerHTML = '<i class="fas fa-times-circle" style="color: #ef4444;"></i> Cookie is empty!';
          return;
        }

        const proxyInput = root.querySelector("#custom-proxy-url-input") || root.querySelector('input[name="api-endpoint"]');
        const proxyVal = proxyInput ? proxyInput.value.trim() : null;
        if (proxyVal) {
          try {
            await game.settings.set("jenne-ddb-importer", "api-endpoint", proxyVal);
            await game.settings.set("jenne-ddb-importer", "custom-proxy", true);
          } catch (e) {}
        }
        try {
          await game.settings.set("jenne-ddb-importer", "cobalt-cookie", cookieVal);
        } catch (e) {}

        let isAuth = false;
        let message = "";
        if (globalThis.JenneDDBImporter?.api?.checkCobalt) {
          const res = await globalThis.JenneDDBImporter.api.checkCobalt(cookieVal);
          isAuth = res.success;
          message = res.message;
        } else {
          const proxyUrl = (proxyVal || "https://ddb-proxy.clemson.engineer").replace(/\/$/, "");
          const res = await fetch(`${proxyUrl}/proxy/auth`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cobalt: cookieVal })
          }).then(r => r.json()).catch(err => ({ success: false, message: err.message }));
          isAuth = res.success;
          message = res.message;
        }

        if (isAuth) {
          checkBtn.innerHTML = '<i class="fas fa-check-circle" style="color: #22c55e;"></i> Cobalt Cookie is Valid!';
          ui.notifications?.info?.("Cobalt Cookie is valid and connected!");
          const nextBtn = root.querySelector('[data-action="goToCampaignTab"]');
          if (nextBtn) nextBtn.removeAttribute("disabled");
        } else {
          checkBtn.innerHTML = `<i class="fas fa-exclamation-circle" style="color: #f59e0b;"></i> ${message || "Invalid/Expired Cookie"}`;
          ui.notifications?.warn?.(message || "Cobalt Cookie is invalid or expired.");
        }
      } catch (err) {
        checkBtn.innerHTML = `<i class="fas fa-times-circle" style="color: #ef4444;"></i> Check failed: ${err.message}`;
      } finally {
        checkBtn.disabled = false;
      }
    });
  }
};

Hooks.on("renderApplication", (app, html) => attachCobaltListeners(html));
Hooks.on("renderFormApplication", (app, html) => attachCobaltListeners(html));
Hooks.on("renderApplicationV2", (app, html) => attachCobaltListeners(html));

// Universal Spell Compendium Synchronizer
// Ensures that all legacy spells are properly seeded into the active DDB spell compendium.
// Rule: If a 2024 version exists, mark 2014 version as (Legacy) with rules="2014".
// If unique to 2014, do not mark and treat as rules="2024" (clean name).
export async function syncLegacySpellsToCompendium() {
  if (!game.user?.isGM) return;
  try {
    const compSetting = game.settings?.get("ddb-importer", "entity-spell-compendium") || "jenne-bag-of-holding.d-d-beyond-spells";
    const pack = game.packs?.get(compSetting);
    if (!pack) return;

    if (pack.locked) {
      try {
        await pack.configure({ locked: false });
      } catch (e) {
        console.warn("[Jenne DDB Importer] Could not unlock pack:", e);
      }
    }

    const index = await pack.getIndex({ fields: ["name", "system.source.rules", "flags.ddbimporter.is2024", "flags.ddbimporter.is2014"] });
    const existingExactNames = new Set(index.map(i => i.name?.toLowerCase().trim()));
    const modernNames = new Set(
      index
        .filter(i => i.system?.source?.rules === "2024" || i.flags?.ddbimporter?.is2024 === true || (!i.name?.includes("(Legacy)") && i.system?.source?.rules !== "2014"))
        .map(i => i.name?.replace(/\s*\((?:Legacy|Homebrew)\)\s*/gi, "").toLowerCase().trim())
    );

    console.log(`[Jenne DDB Importer] Checking legacy/missing spells for compendium "${compSetting}" (${index.size} existing)...`);
    const resp = await fetch("modules/jenne-ddb-importer/data/ddb-legacy-spells.json");
    if (!resp.ok) return;
    const spells = await resp.json();

    const toCreate = [];
    for (const sp of spells) {
      if (!sp.name) continue;
      const cleanName = sp.name.replace(/\s*\((?:Legacy|Homebrew)\)\s*/gi, "").trim();
      const cleanLower = cleanName.toLowerCase();

      const doc = foundry.utils.deepClone(sp);
      if (!doc.system) doc.system = { source: {} };
      if (!doc.system.source) doc.system.source = {};
      if (!doc.flags) doc.flags = {};
      if (!doc.flags.ddbimporter) doc.flags.ddbimporter = {};

      const isDuplicate = modernNames.has(cleanLower);
      if (isDuplicate) {
        // Duplicate: mark as (Legacy) with 2014 rules
        const legacyName = `${cleanName} (Legacy)`;
        if (existingExactNames.has(legacyName.toLowerCase())) continue;
        doc.name = legacyName;
        doc.system.source.rules = "2014";
        doc.flags.ddbimporter.isLegacy = true;
        doc.flags.ddbimporter.is2014 = true;
        doc.flags.ddbimporter.is2024 = false;
        existingExactNames.add(legacyName.toLowerCase());
        toCreate.push(doc);
      } else {
        // Unique: treat as 2024 with clean name (no (Legacy) tag)
        if (existingExactNames.has(cleanLower)) continue;
        doc.name = cleanName;
        doc.system.source.rules = "2024";
        doc.flags.ddbimporter.isLegacy = false;
        doc.flags.ddbimporter.is2014 = false;
        doc.flags.ddbimporter.is2024 = true;
        existingExactNames.add(cleanLower);
        toCreate.push(doc);
      }
    }

    if (toCreate.length > 0) {
      console.log(`[Jenne DDB Importer] Auto-seeding ${toCreate.length} legacy/missing spells to ${compSetting}...`);
      await pack.documentClass.createDocuments(toCreate, { pack: pack.metadata.id, keepId: false });
      ui.notifications?.info?.(`D&D Beyond Importer: Auto-seeded ${toCreate.length} legacy spells into ${pack.metadata.label}.`);
    } else {
      console.log(`[Jenne DDB Importer] All legacy spells are already present in ${compSetting}.`);
    }
  } catch (err) {
    console.warn("[Jenne DDB Importer] Spell sync error:", err);
  }
}

if (typeof window !== "undefined") {
  window.syncLegacySpellsToCompendium = syncLegacySpellsToCompendium;
}

Hooks.once("ready", async () => {
  try {
    // 1. Sanitize cobalt-cookie setting
    for (const ns of ["ddb-importer", "jenne-ddb-importer"]) {
      try {
        const c = game.settings.get(ns, "cobalt-cookie");
        if (typeof c === "string" && (c.startsWith("\"") || c.endsWith("\"") || c !== c.trim())) {
          const cleaned = c.replace(/^"|"$/g, "").trim();
          await game.settings.set(ns, "cobalt-cookie", cleaned);
          console.log(`[Jenne DDB Importer] Sanitized ${ns}.cobalt-cookie`);
        }
      } catch (e) {}
    }

    // 2. Ensure source categories 26 ("5e Core Rules") and 1 ("5e Expanded Rules") are included when legacy is not excluded
    try {
      const excludeLegacy = game.settings.get("ddb-importer", "munching-policy-exclude-legacy");
      if (!excludeLegacy) {
        const inc = game.settings.get("ddb-importer", "munching-policy-muncher-included-source-categories") || [];
        let mod = false;
        for (const id of [26, 1, 8, 12]) {
          if (!inc.includes(id)) {
            inc.push(id);
            mod = true;
          }
        }
        if (mod) {
          await game.settings.set("ddb-importer", "munching-policy-muncher-included-source-categories", inc);
          console.log("[Jenne DDB Importer] Auto-included legacy source categories:", inc);
        }
      }
    } catch (e) {}
  } catch (err) {
    console.warn("[Jenne DDB Importer] Startup configuration check warning:", err);
  }

  await syncLegacySpellsToCompendium();
});

