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
      template: null,
      width: 700,
      height: 600,
      resizable: true
    });
  }

  async _render(force = false, options = {}) {
    await super._render(force, options);
  }

  async getData() {
    return {};
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

  render(force = false, options = {}) {
    const currentProxyUrl = JenneDDBApi.getProxyUrl();
    const currentCobalt = JenneDDBApi.getCobaltCookie();

    const content = `
      <div class="jenne-ddb-header">
        <i class="fas fa-dragon"></i>
        <div>
          <h2>Jenne D&D Beyond Importer</h2>
          <span style="font-size: 11px; opacity: 0.8;">100% Self-Hosted • Patreon-Free • Direct Compendium Builder</span>
        </div>
      </div>

      <nav class="jenne-ddb-tabs">
        <button class="active" data-tab="adventures"><i class="fas fa-book-open"></i> Adventures</button>
        <button data-tab="characters"><i class="fas fa-user"></i> Characters</button>
        <button data-tab="muncher"><i class="fas fa-skull"></i> Content Muncher</button>
        <button data-tab="settings"><i class="fas fa-cog"></i> Settings</button>
      </nav>

      <div class="jenne-ddb-body">
        <!-- Adventures Tab -->
        <div class="jenne-ddb-tab-content active" data-tab="adventures">
          <div class="jenne-ddb-card">
            <h3><i class="fas fa-book"></i> Direct D&D Beyond Adventure Importer</h3>
            <p style="font-size: 12px; color: #aaa;">Extracts complete adventures, chapters, artwork, and maps directly from D&D Beyond into your <strong>DDB Adventures</strong> and <strong>DDB Journals</strong> compendiums without external proxy keys.</p>
            
            <div class="jenne-ddb-form-group">
              <label>Select Adventure / Sourcebook:</label>
              <div style="display: flex; gap: 8px;">
                <select id="select-adventure" style="flex: 1;">
                  <option value="">Click "Load Catalog" below...</option>
                </select>
                <button type="button" id="btn-load-adventures" class="jenne-ddb-btn-secondary"><i class="fas fa-sync"></i> Load Catalog</button>
              </div>
            </div>

            <button type="button" id="btn-import-adventure" class="jenne-ddb-btn-primary" style="width: 100%; justify-content: center; margin-top: 10px;">
              <i class="fas fa-download"></i> Extract & Import Adventure
            </button>

            <div id="adv-status" class="jenne-ddb-status-box">Ready.</div>
          </div>
        </div>

        <!-- Characters Tab -->
        <div class="jenne-ddb-tab-content" data-tab="characters">
          <div class="jenne-ddb-card">
            <h3><i class="fas fa-user-plus"></i> Import Character</h3>
            <p style="font-size: 12px; color: #aaa;">Import your D&D Beyond character directly into your game world.</p>
            
            <div class="jenne-ddb-form-group">
              <label>Character URL or ID:</label>
              <input type="text" id="input-char-url" placeholder="https://www.dndbeyond.com/characters/12345678" />
            </div>

            <button type="button" id="btn-import-character" class="jenne-ddb-btn-primary">
              <i class="fas fa-file-import"></i> Import Character
            </button>

            <div id="char-status" class="jenne-ddb-status-box">Ready.</div>
          </div>
        </div>

        <!-- Content Muncher Tab -->
        <div class="jenne-ddb-tab-content" data-tab="muncher">
          <div class="jenne-ddb-card">
            <h3><i class="fas fa-skull"></i> Monsters Compendium</h3>
            <p style="font-size: 12px; color: #aaa;">Munch all monsters from your owned D&D Beyond sources into <strong>DDB Monsters</strong>.</p>
            <button type="button" id="btn-munch-monsters" class="jenne-ddb-btn-primary">
              <i class="fas fa-dragon"></i> Munch All Monsters
            </button>
            <div id="monster-status" class="jenne-ddb-status-box">Ready.</div>
          </div>

          <div class="jenne-ddb-card">
            <h3><i class="fas fa-shield-alt"></i> Equipment & Items Compendium</h3>
            <p style="font-size: 12px; color: #aaa;">Munch all equipment and magic items into <strong>DDB Items</strong>.</p>
            <button type="button" id="btn-munch-items" class="jenne-ddb-btn-primary">
              <i class="fas fa-boxes"></i> Munch All Items
            </button>
            <div id="item-status" class="jenne-ddb-status-box">Ready.</div>
          </div>
        </div>

        <!-- Settings Tab -->
        <div class="jenne-ddb-tab-content" data-tab="settings">
          <div class="jenne-ddb-card">
            <h3><i class="fas fa-server"></i> Self-Hosted Proxy Configuration</h3>
            
            <div class="jenne-ddb-form-group">
              <label>Proxy URL:</label>
              <input type="text" id="input-proxy-url" value="${currentProxyUrl}" />
            </div>

            <div class="jenne-ddb-form-group">
              <label>Cobalt Session Cookie:</label>
              <input type="password" id="input-cobalt-cookie" value="${currentCobalt}" />
            </div>

            <div style="display: flex; gap: 8px; margin-top: 12px;">
              <button type="button" id="btn-check-cobalt" class="jenne-ddb-btn-secondary"><i class="fas fa-plug"></i> Test Connection</button>
              <button type="button" id="btn-save-settings" class="jenne-ddb-btn-primary"><i class="fas fa-save"></i> Save Settings</button>
            </div>

            <div id="cobalt-status" class="jenne-ddb-status-box">Connection not tested yet.</div>
          </div>
        </div>
      </div>
    `;

    this.options.template = null;
    const element = $(`<div class="window-app ${this.options.classes.join(" ")}" id="${this.options.id}">${content}</div>`);
    
    super.render(force, options);
    
    // Replace content directly
    setTimeout(() => {
      const appEl = $(`#${this.options.id}`);
      if (appEl.length) {
        appEl.find(".window-content").html(content);
        this.activateListeners(appEl);
      }
    }, 50);

    return this;
  }
}
