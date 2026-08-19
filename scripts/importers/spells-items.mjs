import { JenneDDBApi } from "../api.mjs";

/**
 * Spells & Items Muncher for Jenne DDB Importer
 */
export class JenneSpellItemImporter {
  static async getCompendium(type, label, name) {
    let pack = game.packs.get(`world.${name}`);
    if (!pack) {
      const CompClass = foundry?.documents?.collections?.CompendiumCollection || CompendiumCollection;
      pack = await CompClass.createCompendium({
        type: type,
        label: label,
        name: name,
        package: "world"
      });
    }
    await pack.getIndex();
    return pack;
  }

  static async munchItems(campaignId = null, progressCallback = null) {
    if (progressCallback) progressCallback("Fetching items from D&D Beyond via Jenne Proxy...");

    const res = await JenneDDBApi.getItems(campaignId);
    if (!res.success || !res.data) {
      throw new Error(res.message || "Failed to fetch items.");
    }

    const items = res.data;
    const pack = await this.getCompendium("Item", "DDB Items", "ddb-items");

    const toCreate = items.map(item => ({
      name: item.definition?.name || item.name,
      type: "equipment",
      img: item.definition?.avatarUrl || "icons/svg/item-bag.svg",
      system: {
        description: { value: item.definition?.description || item.description || "" }
      },
      flags: {
        "jenne-ddb-importer": { id: item.definition?.id || item.id }
      }
    }));

    if (toCreate.length > 0) {
      await Item.createDocuments(toCreate, { pack: pack.metadata.id });
      await pack.getIndex();
    }

    return toCreate.length;
  }

  static async munchSpells(className = "Wizard", progressCallback = null) {
    if (progressCallback) progressCallback(`Fetching spells for ${className}...`);

    const res = await JenneDDBApi.getSpells({ className, classLevel: 20 });
    if (!res.success || !res.data) {
      throw new Error(res.message || "Failed to fetch spells.");
    }

    const spells = res.data;
    const pack = await this.getCompendium("Item", "DDB Spells", "ddb-spells");

    const toCreate = spells.map(s => ({
      name: s.definition?.name || s.name,
      type: "spell",
      img: s.definition?.avatarUrl || "icons/svg/daze.svg",
      system: {
        description: { value: s.definition?.description || s.description || "" },
        level: s.definition?.level ?? 1,
        school: s.definition?.school?.toLowerCase() || "evo"
      },
      flags: {
        "jenne-ddb-importer": { id: s.definition?.id || s.id }
      }
    }));

    if (toCreate.length > 0) {
      await Item.createDocuments(toCreate, { pack: pack.metadata.id });
      await pack.getIndex();
    }

    return toCreate.length;
  }
}
