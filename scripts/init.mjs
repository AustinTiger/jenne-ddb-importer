import { MODULE_ID, MODULE_TITLE, DEFAULT_PROXY_URL } from "./config.mjs";
import { JenneDDBApi } from "./api.mjs";
import { JenneDDBMainApp } from "./apps/main-app.mjs";
import { JenneAdventureImporter } from "./importers/adventures.mjs";
import { JenneCharacterImporter } from "./importers/character.mjs";
import { JenneMonsterImporter } from "./importers/monsters.mjs";
import { JenneSpellItemImporter } from "./importers/spells-items.mjs";

Hooks.once("init", () => {
  console.log(`${MODULE_TITLE} | Initializing...`);

  // Expose API and Apps to global scope
  globalThis.JenneDDB = {
    Api: JenneDDBApi,
    MainApp: JenneDDBMainApp,
    AdventureImporter: JenneAdventureImporter,
    CharacterImporter: JenneCharacterImporter,
    MonsterImporter: JenneMonsterImporter,
    SpellItemImporter: JenneSpellItemImporter
  };

  // Register Settings
  game.settings.register(MODULE_ID, "proxyUrl", {
    name: "Jenne DDB Proxy URL",
    hint: "The base URL of your self-hosted Jenne DDB Proxy (e.g. https://ddb-proxy.clemson.engineer)",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_PROXY_URL
  });

  game.settings.register(MODULE_ID, "cobaltCookie", {
    name: "Cobalt Session Cookie",
    hint: "Your D&D Beyond CobaltSession authentication cookie.",
    scope: "world",
    config: true,
    type: String,
    default: ""
  });

  game.settings.register(MODULE_ID, "migratedFromDdbImporter", {
    scope: "world",
    config: false,
    type: Boolean,
    default: false
  });
});

Hooks.once("ready", async () => {
  console.log(`${MODULE_TITLE} | Ready`);

  // Automatic Migration from legacy ddb-importer settings
  const alreadyMigrated = game.settings.get(MODULE_ID, "migratedFromDdbImporter");
  if (!alreadyMigrated && game.user?.isGM) {
    try {
      let migratedAny = false;
      const currentCobalt = game.settings.get(MODULE_ID, "cobaltCookie");

      if (!currentCobalt || currentCobalt === "") {
        // Try getting from ddb-importer
        try {
          const oldCobalt = game.settings.get("ddb-importer", "cobalt-cookie");
          if (oldCobalt && oldCobalt !== "") {
            await game.settings.set(MODULE_ID, "cobaltCookie", oldCobalt);
            console.log(`${MODULE_TITLE} | Migrated Cobalt session cookie from ddb-importer!`);
            migratedAny = true;
          }
        } catch (e) {
          // ddb-importer setting might not exist
        }
      }

      // Try getting custom proxy url
      try {
        const oldProxy = game.settings.get("ddb-importer", "custom-proxy-url");
        if (oldProxy && oldProxy !== "") {
          await game.settings.set(MODULE_ID, "proxyUrl", oldProxy);
          console.log(`${MODULE_TITLE} | Migrated Custom Proxy URL from ddb-importer!`);
          migratedAny = true;
        }
      } catch (e) {
        // ddb-importer setting might not exist
      }

      await game.settings.set(MODULE_ID, "migratedFromDdbImporter", true);
      if (migratedAny) {
        ui.notifications.info(`${MODULE_TITLE}: Successfully migrated your D&D Beyond settings from ddb-importer!`);
      }
    } catch (err) {
      console.warn(`${MODULE_TITLE} | Settings migration note:`, err);
    }
  }
});

// Register with Jenne Suite Sidebar Controls
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user?.isGM) return;

  const isArray = Array.isArray(controls);
  let jenneSuite = isArray ? controls.find(c => c.name === "jenne-suite") : controls["jenne-suite"];

  if (!jenneSuite) {
    jenneSuite = {
      name: "jenne-suite",
      title: "Jenne Suite",
      icon: "fa-solid fa-j",
      layer: "jenneSuite",
      visible: true,
      tools: isArray ? [] : {}
    };
    if (isArray) {
      controls.push(jenneSuite);
    } else {
      controls["jenne-suite"] = jenneSuite;
    }
  }

  if (!jenneSuite.tools) {
    jenneSuite.tools = isArray ? [] : {};
  }

  const addTool = (tool) => {
    const isToolsArray = Array.isArray(jenneSuite.tools);
    if (isToolsArray) {
      if (!jenneSuite.tools.some(t => t.name === tool.name)) {
        jenneSuite.tools.push(tool);
      }
    } else {
      jenneSuite.tools[tool.name] = tool;
    }
  };

  addTool({
    name: "jenne-ddb-importer",
    title: "D&D Beyond Importer",
    icon: "fas fa-dragon",
    button: true,
    visible: true,
    onChange: () => {
      new JenneDDBMainApp().render(true);
    }
  });
});
