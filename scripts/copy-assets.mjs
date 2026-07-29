#!/usr/bin/env node
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const target = process.argv[2];

const tasks = {
  capabilities: {
    from: path.join("src", "adapters", "capabilities"),
    to: path.join("dist", "adapters", "capabilities"),
  },
  web: {
    from: path.join("src", "web", "static"),
    to: path.join("dist", "web"),
  },
};

async function copyTask(name) {
  const task = tasks[name];
  if (!task) {
    throw new Error(`unknown asset target: ${name}`);
  }
  await mkdir(task.to, { recursive: true });
  await cp(task.from, task.to, { recursive: true, force: true });
}

if (target === "all") {
  for (const name of Object.keys(tasks)) {
    await copyTask(name);
  }
} else {
  await copyTask(target);
}
