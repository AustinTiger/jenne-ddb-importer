import { JenneDDBApi } from "../api.mjs";

/**
 * Adventure & Sourcebook Importer for Jenne DDB Importer
 */
export class JenneAdventureImporter {
  static async getAdventureCompendium() {
    let pack = game.packs.get("world.ddb-adventures");
    if (!pack) {
      const CompClass = foundry?.documents?.collections?.CompendiumCollection || CompendiumCollection;
      pack = await CompClass.createCompendium({
        type: "Adventure",
        label: "DDB Adventures",
        name: "ddb-adventures",
        package: "world"
      });
    }
    await pack.getIndex();
    return pack;
  }

  static async getJournalCompendium() {
    let pack = game.packs.get("world.ddb-journals");
    if (!pack) {
      const CompClass = foundry?.documents?.collections?.CompendiumCollection || CompendiumCollection;
      pack = await CompClass.createCompendium({
        type: "JournalEntry",
        label: "DDB Journals",
        name: "ddb-journals",
        package: "world"
      });
    }
    await pack.getIndex();
    return pack;
  }

  static async importAdventure(sourceId, progressCallback = null) {
    if (progressCallback) progressCallback("Connecting to D&D Beyond via Jenne Proxy...");

    const res = await JenneDDBApi.extractAdventure(sourceId);
    if (!res.success || !res.data) {
      throw new Error(res.message || "Failed to extract adventure from D&D Beyond.");
    }

    const advData = res.data;
    if (progressCallback) progressCallback(`Extracted ${advData.name}. Saving to compendiums...`);

    const jPack = await this.getJournalCompendium();
    const aPack = await this.getAdventureCompendium();

    // 1. Create or find Folder inside DDB Journals
    let folder = jPack.folders?.find(f => f.name === advData.name);
    if (!folder) {
      try {
        const createdFolders = await Folder.createDocuments([{
          name: advData.name,
          type: "JournalEntry",
          color: "#e64a19"
        }], { pack: jPack.metadata.id });
        folder = createdFolders?.[0];
      } catch (e) {
        console.warn("Jenne DDB | Folder creation warning:", e);
      }
    }

    // 2. Create Journal Entries for each chapter
    const jEntries = (advData.journal || []).map(j => ({
      name: j.name,
      sort: j.sort || 0,
      folder: folder?.id || null,
      flags: {
        "jenne-ddb-importer": { sourceId, bookName: advData.name },
        core: { sheetClass: "dnd5e.JournalSheet5e" }
      },
      pages: (j.pages || []).map(p => ({
        name: p.name,
        type: "text",
        text: { content: p.text?.content || "", format: 1 }
      }))
    }));

    if (jEntries.length > 0) {
      await JournalEntry.createDocuments(jEntries, { pack: jPack.metadata.id });
    }

    // 3. Create or update Adventure Document inside DDB Adventures
    let advDoc = aPack.index.find(d => d.name === advData.name);
    if (!advDoc) {
      try {
        const created = await Adventure.createDocuments([{
          name: advData.name,
          description: advData.description,
          img: advData.img
        }], { pack: aPack.metadata.id, keepId: true, keepEmbeddedIds: true });
        advDoc = created?.[0];
      } catch (e) {
        console.warn("Jenne DDB | Adv createDocuments warning:", e);
      }
    }

    const targetAdvId = advDoc?._id || advDoc?.id;
    if (targetAdvId) {
      try {
        const doc = await aPack.getDocument(targetAdvId);
        if (doc) {
          advData._id = doc.id;
          await doc.update(advData, { diff: false, recursive: false });
        }
      } catch (e) {
        console.warn("Jenne DDB | Adv update warning:", e);
      }
    }

    await jPack.getIndex();
    await aPack.getIndex();
    if (ui.compendium) ui.compendium.render();

    return {
      name: advData.name,
      chapterCount: jEntries.length,
      sceneCount: (advData.scenes || []).length
    };
  }
}
