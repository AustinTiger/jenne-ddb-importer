import { MODULE_ID, MODULE_TITLE } from "../config.mjs";
import { JenneDDBApi } from "../api.mjs";
import { JenneAdventureImporter } from "../importers/adventures.mjs";
import { JenneCharacterImporter } from "../importers/character.mjs";
import { JenneMonsterImporter } from "../importers/monsters.mjs";
import { JenneSpellItemImporter } from "../importers/spells-items.mjs";

/**
 * Main Application Interface for Jenne D&D Beyond Importer
 */
export class JenneDDBMainApp extends Application {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: "jenne-ddb-importer-app",
      title: MODULE_TITLE,
      classes: ["jenne-ddb-app"],
      template: "modules/jenne-ddb-importer/templates/main-app.hbs",
      width: 700,
      height: 600,
      resizable: true
    });
  }

  async getData() {
    return {
      proxyUrl: JenneDDBApi.getProxyUrl(),
      cobaltCookie: JenneDDBApi.getCobaltCookie()
    };
  }

  activateListeners(html) {
    super.activateListeners(html);

    // Tab Navigation
    html.find(".jenne-ddb-tabs button").on("click", (e) => {
      e.preventDefault();
      const tabName = $(e.currentTarget).data("tab");
      html.find(".jenne-ddb-tabs button").removeClass("active");
      $(e.currentTarget).addClass("active");
      html.find(".jenne-ddb-tab-content").removeClass("active");
      html.find(`.jenne-ddb-tab-content[data-tab="${tabName}"]`).addClass("active");
    });

    // Check Cobalt Connection
    html.find("#btn-check-cobalt").on("click", async (e) => {
      e.preventDefault();
      const statusBox = html.find("#cobalt-status");
      statusBox.html('<i class="fas fa-spinner fa-spin"></i> Checking connection to D&D Beyond via Jenne Proxy...');
      try {
        const ok = await JenneDDBApi.checkCobalt();
        if (ok) {
          statusBox.html('<span style="color: #4caf50; font-weight: bold;"><i class="fas fa-check-circle"></i> Connected & Authenticated with D&D Beyond!</span>');
        } else {
          statusBox.html('<span style="color: #f44336; font-weight: bold;"><i class="fas fa-times-circle"></i> Authentication Failed. Check Cobalt Cookie.</span>');
        }
      } catch (err) {
        statusBox.html(`<span style="color: #f44336; font-weight: bold;"><i class="fas fa-exclamation-triangle"></i> Error: ${err.message}</span>`);
      }
    });

    // Save Settings
    html.find("#btn-save-settings").on("click", async (e) => {
      e.preventDefault();
      const proxyUrl = html.find("#input-proxy-url").val();
      const cobaltCookie = html.find("#input-cobalt-cookie").val();
      await game.settings.set(MODULE_ID, "proxyUrl", proxyUrl);
      await game.settings.set(MODULE_ID, "cobaltCookie", cobaltCookie);
      ui.notifications.info("Jenne DDB Importer settings saved!");
    });

    // Import Character
    html.find("#btn-import-character").on("click", async (e) => {
      e.preventDefault();
      const charUrl = html.find("#input-char-url").val();
      const statusBox = html.find("#char-status");
      if (!charUrl) return ui.notifications.warn("Please enter a character URL or ID.");

      statusBox.html('<i class="fas fa-spinner fa-spin"></i> Fetching and parsing character from D&D Beyond...');
      try {
        const actor = await JenneCharacterImporter.importCharacter(charUrl);
        statusBox.html(`<span style="color: #4caf50; font-weight: bold;"><i class="fas fa-check-circle"></i> Imported ${actor.name}!</span>`);
        ui.notifications.info(`Successfully imported ${actor.name}!`);
      } catch (err) {
        statusBox.html(`<span style="color: #f44336;"><i class="fas fa-times-circle"></i> Error: ${err.message}</span>`);
      }
    });

    // Load Adventure List
    html.find("#btn-load-adventures").on("click", async (e) => {
      e.preventDefault();
      const select = html.find("#select-adventure");
      select.html('<option>Loading catalog from proxy...</option>');
      try {
        const cfg = await JenneDDBApi.getConfig();
        const sources = cfg?.sources?.filter(s => s.sourceURL && (s.sourceURL.includes("/sources/") || s.sourceURL.includes("sources/"))) || [];
        sources.sort((a, b) => (a.description || a.name).localeCompare(b.description || b.name));

        select.html(sources.map(s => `<option value="${s.id}">${s.description || s.name} (${s.name})</option>`).join(""));
      } catch (err) {
        select.html(`<option>Error loading: ${err.message}</option>`);
      }
    });

    // Import Selected Adventure
    html.find("#btn-import-adventure").on("click", async (e) => {
      e.preventDefault();
      const bookId = Number(html.find("#select-adventure").val());
      const statusBox = html.find("#adv-status");
      if (!bookId) return ui.notifications.warn("Please select an adventure.");

      statusBox.html('<i class="fas fa-spinner fa-spin"></i> Extracting adventure chapters and maps from D&D Beyond...');
      try {
        const res = await JenneAdventureImporter.importAdventure(bookId, (msg) => {
          statusBox.html(`<i class="fas fa-spinner fa-spin"></i> ${msg}`);
        });
        statusBox.html(`<span style="color: #4caf50; font-weight: bold;"><i class="fas fa-check-circle"></i> Successfully imported "${res.name}" (${res.chapterCount} chapters) into DDB Adventures & DDB Journals!</span>`);
        ui.notifications.info(`Successfully imported "${res.name}"!`);
      } catch (err) {
        statusBox.html(`<span style="color: #f44336;"><i class="fas fa-times-circle"></i> Error: ${err.message}</span>`);
      }
    });

    // Munch Monsters
    html.find("#btn-munch-monsters").on("click", async (e) => {
      e.preventDefault();
      const statusBox = html.find("#monster-status");
      statusBox.html('<i class="fas fa-spinner fa-spin"></i> Munching monsters from D&D Beyond...');
      try {
        const count = await JenneMonsterImporter.munchMonsters({}, (msg) => {
          statusBox.html(`<i class="fas fa-spinner fa-spin"></i> ${msg}`);
        });
        statusBox.html(`<span style="color: #4caf50; font-weight: bold;"><i class="fas fa-check-circle"></i> Successfully munched ${count} monsters into DDB Monsters compendium!</span>`);
        ui.notifications.info(`Successfully munched ${count} monsters!`);
      } catch (err) {
        statusBox.html(`<span style="color: #f44336;"><i class="fas fa-times-circle"></i> Error: ${err.message}</span>`);
      }
    });

    // Munch Items
    html.find("#btn-munch-items").on("click", async (e) => {
      e.preventDefault();
      const statusBox = html.find("#item-status");
      statusBox.html('<i class="fas fa-spinner fa-spin"></i> Munching items from D&D Beyond...');
      try {
        const count = await JenneSpellItemImporter.munchItems(null, (msg) => {
          statusBox.html(`<i class="fas fa-spinner fa-spin"></i> ${msg}`);
        });
        statusBox.html(`<span style="color: #4caf50; font-weight: bold;"><i class="fas fa-check-circle"></i> Successfully munched ${count} items into DDB Items compendium!</span>`);
        ui.notifications.info(`Successfully munched ${count} items!`);
      } catch (err) {
        statusBox.html(`<span style="color: #f44336;"><i class="fas fa-times-circle"></i> Error: ${err.message}</span>`);
      }
    });
  }
}
