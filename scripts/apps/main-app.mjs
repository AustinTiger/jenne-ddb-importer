import { MODULE_ID, MODULE_TITLE } from "../config.mjs";
import { JenneDDBApi } from "../api.mjs";
import { JenneAdventureImporter } from "../importers/adventures.mjs";
import { JenneCharacterImporter } from "../importers/character.mjs";
import { JenneMonsterImporter } from "../importers/monsters.mjs";
import { JenneSpellItemImporter } from "../importers/spells-items.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Main Application Interface for Jenne D&D Beyond Importer
 * Modernized to Foundry VTT ApplicationV2 framework
 */
export class JenneDDBMainApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "jenne-ddb-importer-app",
    tag: "div",
    classes: ["jenne-ddb-app"],
    window: {
      title: MODULE_TITLE,
      icon: "fa-solid fa-j",
      resizable: true
    },
    position: {
      width: 820,
      height: 640
    },
    actions: {
      openSettings: JenneDDBMainApp._onOpenSettings
    }
  };

  static _onOpenSettings(event, target) {
    new SettingsConfig().render(true);
  }

  static PARTS = {
    main: {
      template: "modules/jenne-ddb-importer/templates/main-app.hbs"
    }
  };

  async _prepareContext(options) {
    return {
      proxyUrl: JenneDDBApi.getProxyUrl(),
      cobaltCookie: JenneDDBApi.getCobaltCookie(),
      moduleVersion: game.modules?.get(MODULE_ID)?.version || "1.0.0"
    };
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const html = $(this.element);

    const tabDescriptions = {
      monsters: {
        title: "Monsters Muncher",
        sub: "Extract and import creature statblocks, tokens, and avatars from D&D Beyond."
      },
      spells: {
        title: "Spells Muncher",
        sub: "Munch full spell lists categorized by spellcasting class."
      },
      items: {
        title: "Items & Equipment Muncher",
        sub: "Munch weapons, armor, adventuring gear, and magic items."
      },
      "character-features": {
        title: "Classes & Character Features",
        sub: "Munch classes, subclasses, feats, species, and backgrounds into compendiums."
      },
      adventures: {
        title: "Adventures & Sourcebooks",
        sub: "Extract complete adventure books, chapters, and journals into DDB compendiums."
      },
      "character-import": {
        title: "Character Importer",
        sub: "Import individual character sheets directly from D&D Beyond."
      },
      settings: {
        title: "Settings & Proxy Configuration",
        sub: "Configure your self-hosted Jenne DDB Proxy and authentication."
      }
    };

    // Sidebar Tab Navigation
    html.find(".jenne-nav-item").on("click", (e) => {
      e.preventDefault();
      const tabName = $(e.currentTarget).data("tab");
      html.find(".jenne-nav-item").removeClass("active");
      $(e.currentTarget).addClass("active");

      html.find(".jenne-tab-panel").removeClass("active");
      html.find(`.jenne-tab-panel[data-tab="${tabName}"]`).addClass("active");

      // Update Header Text
      if (tabDescriptions[tabName]) {
        html.find("#active-tab-title").text(tabDescriptions[tabName].title);
        html.find("#active-tab-subtitle").text(tabDescriptions[tabName].sub);
      }
    });

    // Spell Class Toggle Buttons
    html.find(".jenne-class-buttons button").on("click", (e) => {
      e.preventDefault();
      html.find(".jenne-class-buttons button").removeClass("active");
      $(e.currentTarget).addClass("active");
    });

    // Test Connection Buttons
    const testAuth = async (statusEl) => {
      statusEl.html('<i class="fas fa-spinner fa-spin"></i> Testing connection to Jenne Proxy...');
      try {
        const liveProxy = html.find("#settings-proxy-url").val()?.trim() || null;
        const liveCookie = html.find("#settings-cobalt-cookie").val()?.trim() || null;
        const result = await JenneDDBApi.checkCobalt(liveCookie, liveProxy);
        if (result.success) {
          statusEl.html('<span style="color: var(--success-color); font-weight: bold;"><i class="fas fa-check-circle"></i> Authenticated with D&D Beyond via Jenne Proxy!</span>');
        } else {
          statusEl.html(`<span style="color: var(--warning-color); font-weight: bold;"><i class="fas fa-exclamation-circle"></i> ${result.message || "Connected to proxy, but D&D Beyond session is unauthenticated."}</span>`);
        }
      } catch (err) {
        statusEl.html(`<span style="color: var(--danger-color); font-weight: bold;"><i class="fas fa-times-circle"></i> Proxy connection failed: ${err.message}</span>`);
      }
    };

    html.find("#btn-quick-check-auth").on("click", (e) => {
      e.preventDefault();
      testAuth(html.find(".jenne-tab-panel.active .jenne-status-card"));
    });

    html.find("#btn-test-auth").on("click", (e) => {
      e.preventDefault();
      testAuth(html.find("#status-settings"));
    });

    // Clear Cobalt Cookie
    html.find("#btn-clear-settings-cobalt").on("click", (e) => {
      e.preventDefault();
      html.find("#settings-cobalt-cookie").val("");
      ui.notifications.info("Cobalt cookie field cleared. Click 'Save Settings' to apply.");
    });

    // Save Settings
    html.find("#btn-save-cfg").on("click", async (e) => {
      e.preventDefault();
      const proxyUrl = html.find("#settings-proxy-url").val()?.trim();
      const cobaltCookie = html.find("#settings-cobalt-cookie").val()?.trim();
      await game.settings.set(MODULE_ID, "api-endpoint", proxyUrl);
      await game.settings.set(MODULE_ID, "cobalt-cookie", cobaltCookie);
      html.find("#status-settings").html('<span style="color: var(--success-color);"><i class="fas fa-check"></i> Settings saved successfully!</span>');
      ui.notifications.info("Jenne D&D Beyond Importer settings saved.");
    });

    // Munch Monsters
    html.find("#btn-munch-monsters").on("click", async (e) => {
      e.preventDefault();
      const statusBox = html.find("#status-monsters");
      const searchTerm = html.find("#monster-search-input").val();
      const homebrew = html.find("#monster-opt-homebrew").is(":checked");
      const excludeLegacy = html.find("#monster-opt-legacy").is(":checked");
      const exactMatch = html.find("#monster-opt-exact").is(":checked");

      statusBox.html('<i class="fas fa-spinner fa-spin"></i> Munching monsters from D&D Beyond...');
      try {
        const count = await JenneMonsterImporter.munchMonsters({
          searchTerm,
          homebrew,
          excludeLegacy,
          exactMatch
        }, (msg) => {
          statusBox.html(`<i class="fas fa-spinner fa-spin"></i> ${msg}`);
        });
        statusBox.html(`<span style="color: var(--success-color); font-weight: bold;"><i class="fas fa-check-circle"></i> Munched ${count} monsters into DDB Monsters compendium!</span>`);
        ui.notifications.info(`Successfully munched ${count} monsters!`);
      } catch (err) {
        statusBox.html(`<span style="color: var(--danger-color);"><i class="fas fa-times-circle"></i> Error: ${err.message}</span>`);
      }
    });

    // Munch Spells
    html.find("#btn-munch-spells").on("click", async (e) => {
      e.preventDefault();
      const statusBox = html.find("#status-spells");
      const selectedClass = html.find(".jenne-class-buttons button.active").data("class") || "Wizard";

      statusBox.html(`<i class="fas fa-spinner fa-spin"></i> Munching ${selectedClass} spells...`);
      try {
        const count = await JenneSpellItemImporter.munchSpells(selectedClass, (msg) => {
          statusBox.html(`<i class="fas fa-spinner fa-spin"></i> ${msg}`);
        });
        statusBox.html(`<span style="color: var(--success-color); font-weight: bold;"><i class="fas fa-check-circle"></i> Munched ${count} spells into DDB Spells compendium!</span>`);
        ui.notifications.info(`Successfully munched ${count} spells!`);
      } catch (err) {
        statusBox.html(`<span style="color: var(--danger-color);"><i class="fas fa-times-circle"></i> Error: ${err.message}</span>`);
      }
    });

    // Munch Items
    html.find("#btn-munch-items").on("click", async (e) => {
      e.preventDefault();
      const statusBox = html.find("#status-items");
      const campaignId = html.find("#items-campaign-id").val() || null;

      statusBox.html('<i class="fas fa-spinner fa-spin"></i> Munching items from D&D Beyond...');
      try {
        const count = await JenneSpellItemImporter.munchItems(campaignId, (msg) => {
          statusBox.html(`<i class="fas fa-spinner fa-spin"></i> ${msg}`);
        });
        statusBox.html(`<span style="color: var(--success-color); font-weight: bold;"><i class="fas fa-check-circle"></i> Munched ${count} items into DDB Items compendium!</span>`);
        ui.notifications.info(`Successfully munched ${count} items!`);
      } catch (err) {
        statusBox.html(`<span style="color: var(--danger-color);"><i class="fas fa-times-circle"></i> Error: ${err.message}</span>`);
      }
    });

    // Munch Character Features (Classes, Feats, Species, Backgrounds)
    html.find(".btn-feature-munch").on("click", async (e) => {
      e.preventDefault();
      const feature = $(e.currentTarget).data("feature");
      const statusBox = html.find("#status-features");

      statusBox.html(`<i class="fas fa-spinner fa-spin"></i> Munching ${feature} from D&D Beyond...`);
      try {
        const res = await JenneDDBApi.getGameData(feature);
        if (!res.success || !res.data) throw new Error(res.message || `Failed to fetch ${feature}`);
        
        const labelMap = {
          classes: { type: "Item", label: "DDB Classes", pack: "ddb-classes" },
          feats: { type: "Item", label: "DDB Feats", pack: "ddb-feats" },
          races: { type: "Item", label: "DDB Species", pack: "ddb-species" },
          backgrounds: { type: "Item", label: "DDB Backgrounds", pack: "ddb-backgrounds" }
        };

        const target = labelMap[feature] || { type: "Item", label: `DDB ${feature}`, pack: `ddb-${feature}` };
        const pack = await JenneSpellItemImporter.getCompendium(target.type, target.label, target.pack);

        const toCreate = (res.data || []).map(d => ({
          name: d.name,
          type: "feat",
          img: d.avatarUrl || "icons/svg/book.svg",
          system: {
            description: { value: d.description || d.snippet || "" }
          },
          flags: {
            "jenne-ddb-importer": { id: d.id, type: feature }
          }
        }));

        if (toCreate.length > 0) {
          await Item.createDocuments(toCreate, { pack: pack.metadata.id });
          await pack.getIndex();
        }

        statusBox.html(`<span style="color: var(--success-color); font-weight: bold;"><i class="fas fa-check-circle"></i> Munched ${toCreate.length} ${feature} into ${target.label} compendium!</span>`);
        ui.notifications.info(`Successfully munched ${toCreate.length} ${feature}!`);
      } catch (err) {
        statusBox.html(`<span style="color: var(--danger-color);"><i class="fas fa-times-circle"></i> Error: ${err.message}</span>`);
      }
    });

    // Load Adventure Catalog
    html.find("#btn-load-adv-catalog").on("click", async (e) => {
      e.preventDefault();
      const select = html.find("#select-adventure-catalog");
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
    html.find("#btn-import-adv").on("click", async (e) => {
      e.preventDefault();
      const bookId = Number(html.find("#select-adventure-catalog").val());
      const statusBox = html.find("#status-adventures");
      if (!bookId) return ui.notifications.warn("Please select an adventure from the catalog.");

      statusBox.html('<i class="fas fa-spinner fa-spin"></i> Extracting adventure chapters and maps from D&D Beyond...');
      try {
        const res = await JenneAdventureImporter.importAdventure(bookId, (msg) => {
          statusBox.html(`<i class="fas fa-spinner fa-spin"></i> ${msg}`);
        });
        statusBox.html(`<span style="color: var(--success-color); font-weight: bold;"><i class="fas fa-check-circle"></i> Successfully imported "${res.name}" (${res.chapterCount} chapters) into DDB Adventures & DDB Journals!</span>`);
        ui.notifications.info(`Successfully imported "${res.name}"!`);
      } catch (err) {
        statusBox.html(`<span style="color: var(--danger-color);"><i class="fas fa-times-circle"></i> Error: ${err.message}</span>`);
      }
    });

    // Import Character
    html.find("#btn-import-char").on("click", async (e) => {
      e.preventDefault();
      const charUrl = html.find("#char-import-url").val();
      const statusBox = html.find("#status-character");
      if (!charUrl) return ui.notifications.warn("Please enter a character URL or ID.");

      statusBox.html('<i class="fas fa-spinner fa-spin"></i> Fetching and parsing character from D&D Beyond...');
      try {
        const actor = await JenneCharacterImporter.importCharacter(charUrl);
        statusBox.html(`<span style="color: var(--success-color); font-weight: bold;"><i class="fas fa-check-circle"></i> Successfully imported ${actor.name}!</span>`);
        ui.notifications.info(`Successfully imported ${actor.name}!`);
      } catch (err) {
        statusBox.html(`<span style="color: var(--danger-color);"><i class="fas fa-times-circle"></i> Error: ${err.message}</span>`);
      }
    });
  }
}
