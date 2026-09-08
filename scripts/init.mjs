import "../dist/main.mjs";
import { JenneDDBApi } from "./api.mjs";

const COMPENDIUM_FOLDER_NAME = "Jenne D&D Beyond Importer";

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
            "entity-spell-2014-compendium",
      "entity-item-2014-compendium",
      "entity-monster-2014-compendium"
    ];

    compendiumSettingKeys.forEach(key => {
      try {
        const val = game.settings.get("jenne-ddb-importer", key);
        if (val) ddbPackKeys.add(val);
      } catch (e) {}
    });

    // 2. Iterate all packs in world
    for (const pack of game.packs) {
      const isDDB = ddbPackKeys.has(pack.collection) ||
                    ddbPackKeys.has(pack.metadata.id) ||
                    pack.metadata.packageName === "jenne-ddb-importer" ||
                    pack.metadata.packageName === "ddb-importer" ||
                    pack.metadata.label.startsWith("DDB ") ||
                    pack.metadata.label.startsWith("Jenne DDB ");

      if (isDDB && pack.folder?.id !== folder.id) {
        console.log(`[DDB Importer] Moving compendium "${pack.metadata.label}" into "${COMPENDIUM_FOLDER_NAME}" folder`);
        try {
          await pack.setFolder(folder.id);
        } catch (err) {
          try {
            await pack.setFolder(folder);
          } catch (e) {
            console.warn(`[DDB Importer] Could not set folder for pack ${pack.metadata.label}:`, e);
          }
        }
      }
    }
  } catch (err) {
    console.error("[DDB Importer] Error organizing compendiums into folder:", err);
  }
}

Hooks.once("ready", async () => {
  await organizeDDBCompendiums();
});

Hooks.on("ddb-importer.compendiumCreationComplete", async () => {
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
