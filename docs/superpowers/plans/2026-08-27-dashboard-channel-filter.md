# 管理员数据看板渠道筛选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为管理员数据看板增加单选/多选渠道筛选，并让模型统计、缓存命中率和流量图按所选渠道联动刷新。

**Architecture:** 通过可选的 `channel_ids` 请求参数贯穿管理员 `/api/data` 与 `/api/data/flow`，后端在已有 `quota_data.channel_id` 索引上追加 `IN` 条件；前端在现有筛选弹窗内维护 `number[]`，从现有渠道 API 加载选项并序列化为逗号分隔值。普通用户接口不接收该筛选。

**Tech Stack:** Go、Gin、GORM、React、TypeScript、TanStack Query、现有 i18n 与 UI Select/Dialog 组件。

---

### Task 1: 后端渠道参数解析与查询过滤

**Files:**
- Modify: `controller/usedata.go`
- Modify: `model/usedata.go`
- Modify: `model/usedata_flow.go`
- Test: `controller/usedata_test.go` (extend existing tests if present)
- Test: `model/usedata_flow_test.go`

- [ ] **Step 1: Write failing controller tests for channel_ids parsing**

添加表格测试覆盖：缺省值返回空切片；`146,147,146` 返回去重后的 `[146,147]`；`0`、负数、字母和超过上限的列表返回错误。测试直接调用解析辅助函数并断言错误信息及结果，不启动真实数据库。

- [ ] **Step 2: Run the focused controller tests and confirm failure**

Run:

```bash
go test ./controller -run 'TestParse.*Channel' -count=1
```

Expected: FAIL，因为解析辅助函数尚不存在。

- [ ] **Step 3: Implement strict optional parser**

在 `controller/usedata.go` 增加 `parseChannelIDs(c *gin.Context) ([]int, bool)`：读取 `channel_ids`，空值返回 `nil,true`；按逗号拆分，去空格、正整数校验、去重，设置 100 个 ID 上限；非法输入调用 `common.ApiErrorMsg` 后返回 `nil,false`。仅在 `GetAllQuotaDates` 与 `GetAllFlowQuotaDates` 中调用，`self` 接口不读取该参数。

- [ ] **Step 4: Extend model method signatures with optional channel IDs**

将管理员查询改为：

```go
func GetAllQuotaDates(startTime int64, endTime int64, username string, channelIDs []int) ([]*QuotaData, error)
func GetFlowQuotaData(startTime int64, endTime int64, username string, channelIDs []int, userID int, role int) ([]*FlowQuotaData, error)
```

在管理员分支的 GORM query 上追加：

```go
if len(channelIDs) > 0 {
    query = query.Where("channel_id IN ?", channelIDs)
}
```

保持普通用户分支不使用该参数；更新所有生产调用点和现有测试调用点，缺省传 `nil`，确保旧行为不变。

- [ ] **Step 5: Wire parser into admin controllers**

`GetAllQuotaDates` 与 `GetAllFlowQuotaDates` 在查询前解析 `channel_ids`，解析失败立即返回；将切片传入模型层。`GetAllQuotaDates` 继续支持既有 `username` 条件。

- [ ] **Step 6: Run backend tests and commit**

Run:

```bash
go test ./controller ./model -run 'Test(Parse.*Channel|Get.*FlowQuotaData)' -count=1
```

Expected: PASS。

Commit:

```bash
git add controller/usedata.go controller/usedata_test.go model/usedata.go model/usedata_flow.go model/usedata_flow_test.go
 git commit -m "feat: filter admin dashboard data by channels"
```

---

### Task 2: 前端筛选类型、参数序列化与渠道选项查询

**Files:**
- Modify: `web/src/features/dashboard/types.ts`
- Modify: `web/src/features/dashboard/api.ts`
- Modify: `web/src/features/dashboard/lib/filters.ts`
- Create: `web/src/features/dashboard/hooks/use-dashboard-channels.ts`
- Test: `web/src/features/dashboard/lib/filters.test.ts`

- [ ] **Step 1: Write failing serialization tests**

为 `buildQueryParams` 增加测试：无渠道不发送 `channel_ids`；单渠道序列化为 `'146'`；多渠道按数值排序后序列化为 `'145,146,147'`；重复 ID 去重。

- [ ] **Step 2: Run focused frontend tests and confirm failure**

Run:

```bash
cd web && pnpm vitest run src/features/dashboard/lib/filters.test.ts
```

Expected: FAIL，因为 `DashboardFilters.channel_ids` 与序列化逻辑尚不存在。

- [ ] **Step 3: Add channel filter type and serialization**

在 `DashboardFilters` 增加 `channel_ids?: number[]`。更新 `buildQueryParams` 的 filters 类型和返回类型；对有效正整数去重、升序后生成 `channel_ids` 字符串，空数组不发送。保留 username 与现有时间参数。

- [ ] **Step 4: Implement admin channel options hook**

新建 `use-dashboard-channels.ts`，使用 `getChannels({ p: 1, page_size: 1000, status: '' })`；返回 `{ channels, isLoading, isError }`，以 `id/name` 作为选项；使用 TanStack Query 缓存 60 秒。请求异常不抛到筛选弹窗外，交由 UI 显示加载失败状态。

- [ ] **Step 5: Run serialization tests and commit**

Run:

```bash
cd web && pnpm vitest run src/features/dashboard/lib/filters.test.ts
```

Expected: PASS。

Commit:

```bash
git add web/src/features/dashboard/types.ts web/src/features/dashboard/api.ts web/src/features/dashboard/lib/filters.ts web/src/features/dashboard/lib/filters.test.ts web/src/features/dashboard/hooks/use-dashboard-channels.ts
 git commit -m "feat: add dashboard channel filter state"
```

---

### Task 3: 管理员筛选 UI 与看板联动

**Files:**
- Modify: `web/src/features/dashboard/components/models/models-filter-dialog.tsx`
- Modify: `web/src/features/dashboard/index.tsx`
- Modify: `web/src/features/dashboard/components/flow/flow-charts.tsx` (only if prop typing requires it)
- Modify: `web/src/i18n/locales/zh.json`
- Modify: `web/src/i18n/locales/en.json`
- Modify: `web/src/i18n/static-keys.ts` (if project requires static key registration)

- [ ] **Step 1: Add admin-only multi-select UI**

在 `ModelsFilter` 的 Admin Only 区域增加渠道多选。使用现有 `Select`/`SelectItem` 组件的多选模式或项目已有多选控件；选项标签为 `渠道名称（#ID）`，支持搜索、全选、清空；未选择显示“全部渠道”。普通用户不渲染该区域。选择状态只写入对话框本地副本，点击 Apply 后才回调父组件。

- [ ] **Step 2: Preserve apply, reopen, reset semantics**

打开弹窗从 `currentFilters.channel_ids` 同步；Apply 传递清洗后的数字数组；Reset 删除渠道筛选并恢复全部渠道；渠道 API 加载失败时保留已有值并显示错误提示，不重置筛选。

- [ ] **Step 3: Add localized labels**

补充简体中文和英文键：`Channels`、`All channels`、`Search channels`、`Select channels`、`Select all`、`Clear selection`、`Failed to load channels`。其余语言沿用 i18n key 回退。

- [ ] **Step 4: Verify parent query invalidation behavior**

确认 `Dashboard` 继续以整个 `modelFilters` 作为依赖传给模型统计和流量组件；`buildQueryParams` 生成的 `channel_ids` 进入 TanStack Query key，渠道变更会重新请求并刷新卡片、图表与流量分析。普通用户路径的 filters 不包含该值。

- [ ] **Step 5: Run frontend lint/typecheck/tests and commit**

Run:

```bash
cd web && pnpm vitest run src/features/dashboard/lib/filters.test.ts src/features/dashboard/lib/stats.test.ts
cd web && pnpm lint
cd web && pnpm typecheck
```

Expected: PASS。

Commit:

```bash
git add web/src/features/dashboard web/src/i18n/locales/zh.json web/src/i18n/locales/en.json web/src/i18n/static-keys.ts
 git commit -m "feat: add admin channel selector to dashboard"
```

---

### Task 4: 集成验证与发布前检查

**Files:**
- Modify: `docs/README.md` or current project progress document only if release notes are maintained there.

- [ ] **Step 1: Run complete backend test suite for touched packages**

```bash
go test ./controller ./model -count=1
```

Expected: PASS。

- [ ] **Step 2: Run complete frontend validation**

```bash
cd web && pnpm test --run
cd web && pnpm lint
cd web && pnpm typecheck
```

Expected: PASS。

- [ ] **Step 3: Verify API behavior with a local request**

With the local service running, request `/api/data?start_timestamp=...&end_timestamp=...&channel_ids=146,147` as an administrator and verify every returned row has `channel_id` in `{146,147}`; request without `channel_ids` and verify totals match the unfiltered result. Verify `/api/data/self` does not expose or apply the admin filter.

- [ ] **Step 4: Inspect diff and ensure no secret/data changes**

```bash
git diff HEAD~3..HEAD --stat
git status --short
```

Expected: only source, tests, localization, and documentation changes; no database dump, credentials, or generated build output.

- [ ] **Step 5: Create release summary**

Record the feature, API parameter, permission boundary, test commands and rollback point in the project progress document, then commit documentation separately.
