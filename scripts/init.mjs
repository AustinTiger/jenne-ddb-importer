import "../dist/main.mjs";
import { JenneDDBApi } from "./api.mjs";

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
  openMuncher
};

// Hook into Actor Sheet Header Buttons (V1 sheets)
Hooks.on("getActorSheetHeaderButtons", (sheet, buttons) => {
  const actor = sheet.actor || sheet.document || sheet.object;
  if (!actor || !(actor instanceof Actor)) return;
  if (!actor.isOwner) return;

  const isPC = actor.type === "character";
  const isNPC = actor.type === "npc";

  if (isPC) {
    if (!buttons.some(b => b.class === "ddb-open-url" || b.action === "ddbclick")) {
      buttons.unshift({
        label: "D&D Beyond Importer",
        class: "ddb-open-url",
        icon: "fab fa-d-and-d-beyond",
        onclick: (ev) => {
          ev.preventDefault();
          openCharacterManager(actor);
        }
      });
    }
  } else if (isNPC && actor.flags?.monsterMunch?.url) {
    if (!buttons.some(b => b.class === "ddb-open-url" || b.action === "ddbclick")) {
      buttons.unshift({
        label: "D&D Beyond Importer",
        class: "ddb-open-url",
        icon: "fab fa-d-and-d-beyond",
        onclick: (ev) => {
          ev.preventDefault();
          window.open(actor.flags.monsterMunch.url, "_blank");
        }
      });
    }
  }
});

// Hook into Header Controls for ApplicationV2 sheets
const handleHeaderControlsV2 = (sheet, controls) => {
  const actor = sheet.actor || sheet.document || sheet.object;
  if (!actor || !(actor instanceof Actor)) return;
  if (!actor.isOwner) return;

  const isPC = actor.type === "character";
  const isNPC = actor.type === "npc";
  const isGroup = actor.type === "group";

  if (isPC) {
    if (!sheet.options) sheet.options = {};
    if (!sheet.options.actions) sheet.options.actions = {};
    sheet.options.actions.ddbclick = function (event) {
      const targetActor = this.actor || this.document || actor;
      openCharacterManager(targetActor);
    };

    if (!controls.some(c => c.action === "ddbclick" || c.class === "ddb-open-url")) {
      controls.unshift({
        label: "D&D Beyond Importer",
        icon: "fab fa-d-and-d-beyond",
        action: "ddbclick",
        ownership: "OWNER"
      });
    }
  } else if (isNPC && actor.flags?.monsterMunch?.url) {
    if (!sheet.options) sheet.options = {};
    if (!sheet.options.actions) sheet.options.actions = {};
    sheet.options.actions.ddbclick = function () {
      const targetActor = this.actor || this.document || actor;
      if (targetActor.flags?.monsterMunch?.url) {
        window.open(targetActor.flags.monsterMunch.url, "_blank");
      }
    };

    if (!controls.some(c => c.action === "ddbclick" || c.class === "ddb-open-url")) {
      controls.unshift({
        label: "D&D Beyond Importer",
        icon: "fab fa-d-and-d-beyond",
        action: "ddbclick",
        ownership: "OWNER"
      });
    }
  } else if (isGroup) {
    if (!sheet.options) sheet.options = {};
    if (!sheet.options.actions) sheet.options.actions = {};
    sheet.options.actions.ddbpartysync = function () {
      const targetActor = this.actor || this.document || actor;
      if (globalThis.DDBImporter?.apps?.DDBPartySync) {
        globalThis.DDBImporter.apps.DDBPartySync.open({ actor: targetActor });
      }
    };

    if (!controls.some(c => c.action === "ddbpartysync")) {
      controls.unshift({
        label: "DDB Party Sync",
        icon: "fab fa-d-and-d-beyond",
        action: "ddbpartysync",
        ownership: "OWNER"
      });
    }
  }
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

        let isAuth = false;
        let message = "";
        if (globalThis.JenneDDBImporter?.api?.checkCobalt) {
          const res = await globalThis.JenneDDBImporter.api.checkCobalt(cookieVal);
          isAuth = res.success;
          message = res.message;
        } else {
          const res = await fetch("https://ddb.jenne.vip/proxy/auth", {
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

