import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { readHermesTask, listHermesTasks } from "../server/hermes-monitor.mjs";
import { runParallelHermesWorkflow } from "../server/hermes-parallel.mjs";
import { loadWorkflowCheckpoint } from "../server/workflow-checkpoints.mjs";
import { dataDir } from "../server/library.mjs";

test("Hermes控制台只返回过程信息，不暴露文档、Key或完整规划；日志保留真实校验结果", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "hermes-console-")),
    id = randomUUID(),
    runId = randomUUID();
  try {
    await fs.mkdir(path.join(root, "workflows"));
    await fs.mkdir(path.join(root, "hermes-runs", runId), { recursive: true });
    await fs.writeFile(
      path.join(root, "workflows", id + ".json"),
      JSON.stringify({
        id,
        status: "done",
        body: { document: "private-document", apiKey: "private-key" },
        plan: {
          title: "检验",
          slides: [{ title: "机制", bullets: ["private-body"] }],
        },
        metrics: [{ runId, role: "planner", modelRequests: 1 }],
        progress: { totalPages: 1, completedPages: [1] },
        createdAt: new Date().toISOString(),
      }),
    );
    await fs.writeFile(
      path.join(root, "hermes-runs", runId, "tool-events.jsonl"),
      JSON.stringify({
        name: "ppt_submit_storyboard",
        at: new Date().toISOString(),
        ok: false,
        error: "sk-example12345678",
        durationMs: 5,
      }) + "\npartial",
    );
    const task = await readHermesTask(id, { root }),
      serialized = JSON.stringify(task);
    for (const value of [
      "private-document",
      "private-key",
      "private-body",
      "sk-example12345678",
    ])
      assert.ok(!serialized.includes(value));
    assert.equal(task.events[0].ok, false);
    assert.equal(task.events[0].durationMs, 5);
    assert.equal(task.events[0].error, "[redacted]");
    assert.equal(task.runs[0].role, "planner");
    const list = await listHermesTasks({ root });
    assert.equal(list.total, 1);
    assert.equal(list.items[0].id, id);
    await assert.rejects(readHermesTask("../secrets", { root }), /无效/);
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith("hermes-console-"));
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("仅规划也使用Hermes阶段工具与可监控断点，不进入选材、Office或发布", async () => {
  const id = randomUUID(),
    document =
      "本次介绍设备维护、问题排查与协同验证的工作流程，并明确各岗位职责。";
  let calls = 0;
  try {
    const output = await runParallelHermesWorkflow(
      { planningOnly: true, document, pageCount: 3, apiKey: "unit-test-key" },
      {
        checkpointId: id,
        runAgent: async (options) => {
          calls++;
          assert.equal(options.role, "planner");
          const mid = await loadWorkflowCheckpoint(id);
          assert.equal(mid.runs[0].status, "running");
          const result = await options.onTool("ppt_submit_storyboard", {
            style: {
              family: "technical",
              rationale: "说明协同工作流程",
              evidence: ["本次介绍设备维护"],
            },
            plan: {
              title: "设备维护",
              slides: [
                {
                  kind: "cover",
                  visual: "text",
                  title: "设备维护",
                  bullets: ["协同工作"],
                },
                {
                  kind: "content",
                  visual: "process",
                  title: "职责与排查",
                  bullets: ["各岗位职责"],
                },
                {
                  kind: "ending",
                  visual: "parallel",
                  title: "总结",
                  bullets: ["验证结果"],
                },
              ],
            },
          });
          assert.equal(result.ok, true);
          options.onMetrics({
            runId: options.id,
            role: options.role,
            modelRequests: 1,
            toolCalls: 1,
          });
          return { type: "complete" };
        },
      },
    );
    assert.equal(output.planningOnly, true);
    assert.equal(calls, 1);
    assert.equal(output.id, undefined);
    const checkpoint = await loadWorkflowCheckpoint(id);
    assert.equal(checkpoint.status, "done");
    assert.equal(checkpoint.runs[0].status, "finished");
    assert.ok(
      checkpoint.workflowTrace.some((e) => e.name === "ppt_submit_outline"),
    );
    assert.ok(!checkpoint.workflowTrace.some((e) => e.name === "ppt_publish"));
  } finally {
    await fs.rm(path.join(dataDir, "workflows", id + ".json"), { force: true });
  }
});
