import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./library.mjs";
import { hermesRuntimeStatus } from "./hermes-client.mjs";
import { executionOptions } from "./hermes-parallel.mjs";

const validId = (id) => typeof id === "string" && /^[a-f0-9-]{36}$/i.test(id);
const cleanError = (text) =>
  String(text || "")
    .replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "[redacted]")
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [redacted]");
export function taskSummary(task) {
  return {
    id: task.id,
    rootId:task.body?.rootId,
    pageNumber:task.body?.page,
    status: task.status,
    kind:
      task.body?.taskKind==='page-edit'?'page-edit':task.body?.taskKind==='material-audit'?'material-audit':task.body?.planningOnly || task.output?.planningOnly
        ? "planning"
        : "generation",
    stale:
      task.status === "running" &&
      Date.now() - (Date.parse(task.updatedAt || task.createdAt) || 0) > 600000,
    title: task.body?.taskKind==='material-audit'?'素材库逐张图片标签复核':task.plan?.title || task.body?.title || "文档演示制作",
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    phase: task.phase,
    totalPages: task.progress?.totalPages || task.plan?.slides?.length || 0,
    completedPages: task.progress?.completedPages || [],
    modelRequests: (task.metrics || []).reduce(
      (n, m) => n + (m.modelRequests || 0),
      0,
    ),
    elapsedMs: task.timing?.totalActiveMs || task.progress?.elapsedMs || 0,
    resumable: task.resumable === true,
    outputId: task.output?.id,
    error: cleanError(task.error),
  };
}

const summaries = new Map();
export async function listHermesTasks({ root = dataDir, limit = 30 } = {}) {
  const folder = path.join(root, "workflows"),
    names = (
      await fs.readdir(folder).catch((e) => {
        if (e.code === "ENOENT") return [];
        throw e;
      })
    ).filter(
      (name) => validId(name.replace(/\.json$/, "")) && name.endsWith(".json"),
    );
  const tasks = [];
  for (let i = 0; i < names.length; i += 8)
    for (const result of await Promise.all(
      names.slice(i, i + 8).map(async (name) => {
        try {
          const file = path.join(folder, name),
            stat = await fs.stat(file),
            cached = summaries.get(file);
          if (cached?.mtime === stat.mtimeMs)
            return {
              ...cached.value,
              stale:
                cached.value.status === "running" &&
                Date.now() -
                  (Date.parse(
                    cached.value.updatedAt || cached.value.createdAt,
                  ) || 0) >
                  600000,
            };
          const value = taskSummary(
            JSON.parse(await fs.readFile(file, "utf8")),
          );
          summaries.set(file, { mtime: stat.mtimeMs, value });
          return value;
        } catch {
          return null;
        }
      }),
    ))
      if (result) tasks.push(result);
  while (summaries.size > 240) summaries.delete(summaries.keys().next().value);
  tasks.sort(
    (a, b) =>
      (Date.parse(b.updatedAt || b.createdAt) || 0) -
      (Date.parse(a.updatedAt || a.createdAt) || 0),
  );
  return {
    items: tasks.slice(0, Math.max(1, Math.min(100, Number(limit) || 30))),
    total: tasks.length,
    counts: {
      running: tasks.filter((t) => t.status === "running" && !t.stale).length,
      stale: tasks.filter((t) => t.stale).length,
      done: tasks.filter((t) => t.status === "done").length,
      failed: tasks.filter((t) => t.status === "failed").length,
    },
  };
}

export async function readHermesTask(id, { root = dataDir, liveTask } = {}) {
  if (!validId(id))
    throw Object.assign(Error("无效的任务编号"), { status: 400 });
  let task;
  try {
    task = JSON.parse(
      await fs.readFile(path.join(root, "workflows", id + ".json"), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT" || !liveTask) throw error;
    task = {
      ...liveTask,
      metrics: liveTask.output?.execution?.metrics || [],
      plan: liveTask.plan || liveTask.output?.plan,
      body: {
        title: liveTask.kind === "replace" ? "单页素材换版" : "文档演示制作",
      },
    };
  }
  if(liveTask)task={...task,status:liveTask.status,phase:liveTask.phase,resumable:liveTask.resumable??task.resumable};
  const metrics = (task.metrics || []).map((m) => ({
    runId: m.runId,
    role: m.role,
    modelRequests: m.modelRequests,
    toolCalls: m.toolCalls,
    toolFailures: m.toolFailures,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    cacheReadTokens: m.cacheReadTokens,
    elapsedMs: m.elapsedMs,
  }));
  const runs =
      task.runs ||
      metrics.map((m) => ({
        runId: m.runId,
        role: m.role,
        status: "finished",
      })),
    events = [];
  for (const run of runs.filter((r) => validId(r.runId))) {
    const lines = (
      await fs
        .readFile(
          path.join(root, "hermes-runs", run.runId, "tool-events.jsonl"),
          "utf8",
        )
        .catch(() => "")
    )
      .trim()
      .split("\n")
      .filter(Boolean);
    for (const line of lines.slice(-100))
      try {
        const event = JSON.parse(line);
        events.push({
          runId: run.runId,
          role: run.role,
          name: event.name,
          at: event.at,
          durationMs: event.durationMs,
          ok: event.ok,
          error: cleanError(
            event.error ||
              (event.errors || [])
                .slice(0, 3)
                .map((e) => `第${e.page}页：${(e.issues || []).join("；")}`)
                .join("；"),
          ),
        });
      } catch {}
  }
  events.sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));
  return {
    ...taskSummary(task),
    progress: task.progress,
    metrics,
    runs: runs.map(({ runId, role, status, startedAt, finishedAt }) => ({
      runId,
      role,
      status,
      startedAt,
      finishedAt,
    })),
    events: events.slice(-200),
    trace: (task.workflowTrace || task.plan?.agentTrace || [])
      .slice(-120)
      .map((t) => ({ name: t.name, skill: t.skill || t.skillName, at: t.at })),
    style: task.plan?.styleDecision?.family,
    pages: (task.plan?.slides || task.sourcePages || []).map((s, i) => ({
      page: i + 1,
      title: s.title,
      kind: s.kind,
      sourceName: s.materialSnapshot?.sourceName||s.sourceName,
      sourcePage: s.materialSnapshot?.page||s.sourcePage,
      filled: (task.progress?.completedPages || []).includes(i + 1),
    })),
    styleSkill:task.plan?.styleSkillSnapshot?{id:task.plan.styleSkillSnapshot.id,name:task.plan.styleSkillSnapshot.name,fontFamily:task.plan.styleSkillSnapshot.fontFamily}:undefined,
    model: task.body?.model || "DeepSeek",
  };
}

export async function hermesOverview() {
  const [runtime, tasks] = await Promise.all([
    hermesRuntimeStatus(),
    listHermesTasks(),
  ]);
  return {
    runtime,
    execution: {
      ...executionOptions({}),
      visualConcurrency: 2,
      officeConcurrency: 1,
    },
    tasks,
    bridge: {
      server: "Node.js",
      frontend: "React",
      runtime: "Hermes AIAgent",
      transport: "JSON工具桥接",
      provider: "DeepSeek",
    },
  };
}
