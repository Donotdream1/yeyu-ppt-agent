import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./library.mjs";

export async function outputHistory({
  folder = path.join(dataDir, "outputs"),
  q = "",
  page = 1,
  limit = 12,
  canAccess=async()=>true,
  organization=()=>({}), folderId="all", trash=false,
} = {}) {
  const names = (
    await fs.readdir(folder).catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    })
  ).filter((name) => /^[a-f0-9-]{36}\.json$/i.test(name));
  const items = [];
  // Bound filesystem fan-out; do not return source documents or full page plans.
  for (let i = 0; i < names.length; i += 8)
    for (const result of await Promise.all(
      names.slice(i, i + 8).map(async (name) => {
        try {
          if(!await canAccess(name.slice(0,-5)))return null;
          const value = JSON.parse(
            await fs.readFile(path.join(folder, name), "utf8"),
          );
          if (
            value.internalTest===true ||
            !/^[a-f0-9-]{36}$/i.test(value.id) ||
            !Number.isInteger(value.pages) ||
            value.pages < 1
          )
            return null;
          await fs.access(path.join(folder, value.id + ".pptx"));
          const meta=organization(value);if(Boolean(meta.deletedAt)!==trash)return null;if(folderId!=="all"&&(meta.folderId||"unfiled")!==folderId)return null;
          return {
            folderId:meta.folderId||null, rootId:value.conversationRootId||value.plan?.conversationRootId||value.id, deletedAt:meta.deletedAt,
            id: value.id,
            title: value.title || "未命名演示",
            pages: value.pages,
            createdAt: value.createdAt,
            thumbnail: `/api/previews/${value.id}/1.png`,
            url: `/api/files/${value.id}.pptx`,
            checked: value.textFit?.status === "checked",
          };
        } catch {
          return null;
        }
      }),
    ))
      if (result) items.push(result);
  const query = String(q).toLowerCase(),
    filtered = items
      .filter((item) => !query || item.title.toLowerCase().includes(query))
      .sort(
        (a, b) =>
          (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) ||
          a.id.localeCompare(b.id),
      );
  const size = Math.max(1, Math.min(40, Math.floor(Number(limit) || 12))),
    current = Math.max(1, Math.floor(Number(page) || 1));
  return {
    items: filtered.slice((current - 1) * size, current * size),
    total: filtered.length,
    page: current,
    pages: Math.max(1, Math.ceil(filtered.length / size)),
  };
}
