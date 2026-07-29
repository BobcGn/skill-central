# Registry Query

`src/registry/query.ts` 是 resolved skills 的共享查询入口。它的目的，是避免 CLI、MCP、Web Board 和后续 compiler dry-run 各自实现一套过滤规则。

## 查询输入

```ts
interface SkillQuery {
  id?: string;
  type?: SkillType;
  tags?: string[];
  intent?: string;
  capabilities?: string[];
  status?: "effective" | "shadowed" | "conflicted" | "any";
}
```

默认 `status` 是 `effective`。这保证普通用户路径是确定的，并避免 conflicted 候选暴露到 MCP。

## 查询结果

```ts
interface SkillQueryResult {
  skills: ResolvedSkillView[];
  records: ResolutionRecordView[];
  totalCandidates: number;
}
```

`skills` 是过滤后的扁平候选列表。`records` 保留 resolution chain，因此诊断和 compiler 报告可以解释某个候选为什么 effective、shadowed 或 conflicted。

## 当前消费者

- `SkillEngine.querySkills()` 封装 `querySkillRecords()`。
- `skill-central list` 使用 `querySkills()` 做 type 和 tag 过滤。
- MCP `prompts/list`、`prompts/get`、`tools/list`、`tools/call` 使用 `querySkills()` 选择 effective prompt/tool。
- Web Board `/api/health` 和 `/api/skills` 使用 `querySkills()`。
- 测试直接调用 `querySkills()` 验证 `intent`、`capabilities` 和 provenance 查询。

## 排序

结果按 layer priority 升序、再按 id 排序。这保留了 tag composition 行为：更通用的低优先级上下文在前，更高优先级的专门规则在后。

## TODO

- 当 compiler dry-run 需要机器可读报告时，新增正式 CLI query 命令或 JSON 输出模式。
- lockfile 元数据升级后，将 registry records 用于 install/update provenance。

## 性能

`npm run test:registry-perf` 会生成 1000 个临时 Universal Skill v1 文件，通过真实 storage/engine 路径加载，然后测量 loaded registry records 上的查询延迟。Phase 1 目标是本地查询低于 200ms。
