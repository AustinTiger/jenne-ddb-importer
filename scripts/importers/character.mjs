import { JenneDDBApi } from "../api.mjs";

/**
 * Character Importer & Sync for Jenne DDB Importer
 */
export class JenneCharacterImporter {
  static extractCharacterId(input) {
    if (!input) return null;
    const match = String(input).match(/(?:ddb\.ac\/characters\/|dndbeyond\.com\/characters\/|dndbeyond\.com\/profile\/[^/]+\/characters\/)?(\d+)/i);
    return match ? match[1] : input;
  }

  static async importCharacter(characterInput, options = {}) {
    const characterId = this.extractCharacterId(characterInput);
    if (!characterId) throw new Error("Invalid D&D Beyond character URL or ID.");

    const res = await JenneDDBApi.getCharacter(characterId);
    if (!res.success || !res.ddb?.character) {
      throw new Error(res.message || "Failed to parse character from D&D Beyond.");
    }

    const ddbChar = res.ddb.character;
    console.log(`Jenne DDB | Importing character: ${ddbChar.name}`);

    // Create or update Actor in Foundry
    let actor = game.actors.find(a => a.flags?.["jenne-ddb-importer"]?.characterId === characterId || a.flags?.ddbimporter?.dndbeyond?.characterId === Number(characterId));

    const actorData = {
      name: ddbChar.name,
      type: "character",
      img: ddbChar.decorations?.avatarUrl || "icons/svg/mystery-man.svg",
      system: {
        abilities: {
          str: { value: ddbChar.stats?.find(s => s.id === 1)?.value || 10 },
          dex: { value: ddbChar.stats?.find(s => s.id === 2)?.value || 10 },
          con: { value: ddbChar.stats?.find(s => s.id === 3)?.value || 10 },
          int: { value: ddbChar.stats?.find(s => s.id === 4)?.value || 10 },
          wis: { value: ddbChar.stats?.find(s => s.id === 5)?.value || 10 },
          cha: { value: ddbChar.stats?.find(s => s.id === 6)?.value || 10 }
        },
        attributes: {
          hp: {
            value: ddbChar.currentHitPoints || 10,
            max: ddbChar.baseHitPoints || 10,
            temp: ddbChar.temporaryHitPoints || 0
          }
        },
        details: {
          level: ddbChar.classes?.reduce((acc, c) => acc + (c.level || 0), 0) || 1,
          gender: ddbChar.gender || "",
          age: ddbChar.age || "",
          alignment: ddbChar.alignmentId ? "Neutral" : ""
        }
      },
      flags: {
        "jenne-ddb-importer": {
          characterId: characterId,
          syncId: ddbChar.id,
          lastSync: new Date().toISOString()
        }
      }
    };

    if (actor) {
      await actor.update(actorData);
    } else {
      actor = await Actor.create(actorData);
    }

    return actor;
  }
}
