import { JenneDDBApi } from "../api.mjs";

/**
 * Monster Muncher for Jenne DDB Importer
 */
export class JenneMonsterImporter {
  static async getMonsterCompendium() {
    let pack = game.packs.get("world.ddb-monsters");
    if (!pack) {
      const CompClass = foundry?.documents?.collections?.CompendiumCollection || CompendiumCollection;
      pack = await CompClass.createCompendium({
        type: "Actor",
        label: "DDB Monsters",
        name: "ddb-monsters",
        package: "world"
      });
    }
    await pack.getIndex();
    return pack;
  }

  static async munchMonsters(options = {}, progressCallback = null) {
    if (progressCallback) progressCallback("Querying D&D Beyond monsters via Jenne Proxy...");

    const res = await JenneDDBApi.getMonsters(options);
    if (!res.success || !res.data) {
      throw new Error(res.message || "Failed to fetch monsters from proxy.");
    }

    const monsters = res.data;
    if (progressCallback) progressCallback(`Found ${monsters.length} monsters. Parsing and creating documents...`);

    const pack = await this.getMonsterCompendium();
    const toCreate = [];

    for (const m of monsters) {
      const actorData = {
        name: m.name,
        type: "npc",
        img: m.avatarUrl || "icons/svg/mystery-man.svg",
        system: {
          abilities: {
            str: { value: m.stats?.find(s => s.statId === 1)?.value || 10 },
            dex: { value: m.stats?.find(s => s.statId === 2)?.value || 10 },
            con: { value: m.stats?.find(s => s.statId === 3)?.value || 10 },
            int: { value: m.stats?.find(s => s.statId === 4)?.value || 10 },
            wis: { value: m.stats?.find(s => s.statId === 5)?.value || 10 },
            cha: { value: m.stats?.find(s => s.statId === 6)?.value || 10 }
          },
          attributes: {
            hp: {
              value: m.averageHitPoints || 10,
              max: m.averageHitPoints || 10,
              formula: m.hitPointDice?.diceString || ""
            },
            ac: {
              flat: m.armorClass || 10
            }
          },
          details: {
            cr: m.challengeRatingId || 0,
            alignment: m.alignmentId || "Unaligned",
            type: { value: m.type || "humanoid" }
          }
        },
        flags: {
          "jenne-ddb-importer": {
            monsterId: m.id,
            isLegacy: m.isLegacy || false,
            sourceIds: m.sources || []
          }
        }
      };

      toCreate.push(actorData);
    }

    if (toCreate.length > 0) {
      await Actor.createDocuments(toCreate, { pack: pack.metadata.id });
      await pack.getIndex();
      if (ui.compendium) ui.compendium.render();
    }

    return toCreate.length;
  }
}
