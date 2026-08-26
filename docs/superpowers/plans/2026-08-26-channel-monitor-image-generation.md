# V1 独立渠道监控生图检测实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 V1 独立渠道监控增加 OpenAI/Grok 生图 API 测活，并让生图成功请求在耗时小于 60 秒时显示绿色、达到 60 秒时显示黄色、失败显示红色。

**Architecture:** 在现有 `ProviderAdapter` 链路中增加 `image_generation` 模式和 OpenAI 兼容图片适配器，继续复用现有监控调度、历史、SSRF 和鉴权代码；数据库字段保持不变。前端通过共享状态色彩函数按 `api_mode + status + latency_ms` 计算徽标颜色，文本模式走原有颜色规则。

**Tech Stack:** Go、GORM、Gin、React 19、TypeScript、React Testing Library/Vitest、Bun。

---

### Task 1: 固化 API mode、超时规则与模板数据

**Files:**
- Modify: `service/channel_monitor_const.go`
- Modify: `service/channel_monitor_validate.go`
- Modify: `service/channel_monitor_template.go`
- Modify: `controller/channel_monitor.go:90-110,360-430`
- Modify: `model/channel_monitor.go:293-380`
- Test: `service/channel_monitor_validate_test.go`
- Test: `service/channel_monitor_template_test.go`

- [ ] **Step 1: Write failing backend validation tests**

在 `service/channel_monitor_validate_test.go` 添加表格测试，覆盖：

```go
func TestValidateMonitorConfigImageGeneration(t *testing.T) {
    cases := []struct {
        name     string
        provider string
        mode     string
        timeout  int
        wantErr  bool
    }{
        {name: "openai 90 seconds", provider: ProviderOpenAI, mode: APIModeImageGeneration, timeout: 90},
        {name: "openai 180 seconds", provider: ProviderOpenAI, mode: APIModeImageGeneration, timeout: 180},
        {name: "openai 181 seconds", provider: ProviderOpenAI, mode: APIModeImageGeneration, timeout: 181, wantErr: true},
        {name: "grok 90 seconds", provider: ProviderGrok, mode: APIModeImageGeneration, timeout: 90},
        {name: "anthropic rejects image mode", provider: ProviderAnthropic, mode: APIModeImageGeneration, timeout: 90, wantErr: true},
    }
    for _, tc := range cases {
        t.Run(tc.name, func(t *testing.T) {
            err := ValidateMonitorConfig(tc.provider, tc.mode, "https://api.example.com", "sk-test", "gpt-image-2", 300, tc.timeout)
            if (err != nil) != tc.wantErr {
                t.Fatalf("ValidateMonitorConfig() error = %v, wantErr %v", err, tc.wantErr)
            }
        })
    }
}
```

将测试改为直接调用 `ValidateMonitorConfig`，对 OpenAI/Grok 的 `image_generation` 断言 90/180 秒通过、181 秒失败；对 Anthropic/Gemini 的 `image_generation` 断言失败；保留既有 Chat/Responses 测试。

在新建的 `service/channel_monitor_template_test.go` 添加 `BuildRequestBodyFromMode` 的 image auto/minimal 断言，确认 JSON 含 `n:1` 与 `size:"1024x1024"`，文本模式仍含 `max_tokens`。

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
go test ./service -run 'TestValidateMonitorConfigImageGeneration|TestBuildRequestBodyFromModeImage' -count=1
```

Expected: FAIL because `APIModeImageGeneration`, image timeout branch and API-mode-aware body builder do not exist。

- [ ] **Step 3: Add constants and provider paths**

在 `service/channel_monitor_const.go` 添加：

```go
APIModeImageGeneration = "image_generation"
DefaultImageCheckInterval = 300
DefaultImageCheckTimeout = 90
MaxImageCheckTimeout = 180
ImageSlowLatencyMs = 60_000
```

为 OpenAI/Grok 的 `ProviderPaths` 增加 `APIModeImageGeneration: "/v1/images/generations"`。保留文本模式常量和 60 秒文本超时上限。

- [ ] **Step 4: Make validation API-mode aware**

将 OpenAI/Grok 的 API mode 校验扩展为 Chat、Responses、Image 三者；生图 timeout 上限使用 `MaxImageCheckTimeout`，文本仍使用 `MaxCheckTimeout`；继续校验 timeout 小于 interval。为 Anthropic/Gemini 传入生图模式返回明确错误。

将 `ValidateTemplateConfig` 签名扩展为 `ValidateTemplateConfig(provider, apiMode, name, bodyMode string)`，同步检查 API mode 与 provider 匹配；在 `controller/channel_monitor.go` 的模板创建/更新调用点传入 `template.APIMode`。

- [ ] **Step 5: Make body builder API-mode aware**

将 `BuildRequestBodyFromMode` 签名改为 `BuildRequestBodyFromMode(provider, apiMode, bodyMode, customBody string)`，同步更新创建监控 controller 调用。对 `image_generation` 的 auto/minimal 返回：

```json
{"n":1,"size":"1024x1024"}
```

custom 原样返回；Chat/Responses/Anthropic/Gemini 逻辑保持现状。

- [ ] **Step 6: Seed the idempotent image templates**

在 `model/channel_monitor.go` 的默认模板列表加入：

```go
{
    Provider: "openai",
    Name: "OpenAI Image Generations (Default)",
    APIMode: "image_generation",
    BodyMode: "auto",
    Headers: "{}",
    Body: `{"n":1,"size":"1024x1024"}`,
    Description: "Default health-check template for OpenAI Image Generations API.",
    IsDefault: true,
},
{
    Provider: "grok",
    Name: "Grok Image Generations (Default)",
    APIMode: "image_generation",
    BodyMode: "auto",
    Headers: "{}",
    Body: `{"n":1,"size":"1024x1024"}`,
    Description: "Default health-check template for Grok Image Generations API.",
    IsDefault: true,
},
```

沿用 provider+name 幂等种子逻辑，不修改已有模板。

- [ ] **Step 7: Run backend unit tests**

Run:

```bash
gofmt -w service/channel_monitor_const.go service/channel_monitor_validate.go service/channel_monitor_template.go service/channel_monitor_validate_test.go service/channel_monitor_template_test.go controller/channel_monitor.go model/channel_monitor.go
go test ./service ./controller ./model -run 'ChannelMonitor|BuildRequestBody|ValidateTemplate' -count=1
```

Expected: PASS。

- [ ] **Step 8: Commit the configuration slice**

```bash
git add service/channel_monitor_const.go service/channel_monitor_validate.go service/channel_monitor_template.go service/channel_monitor_validate_test.go service/channel_monitor_template_test.go controller/channel_monitor.go model/channel_monitor.go
git commit -m "feat: add image generation monitor mode"
```

### Task 2: Implement and test the OpenAI-compatible image adapter

**Files:**
- Modify: `service/channel_monitor_checker.go`
- Modify: `service/channel_monitor_types.go`
- Test: `service/channel_monitor_checker_test.go`

- [ ] **Step 1: Write failing adapter tests**

在 `service/channel_monitor_checker_test.go` 添加：

- endpoint `https://api.example.com` 生成 `https://api.example.com/v1/images/generations`；
- endpoint `https://api.example.com/v1` 生成 `https://api.example.com/v1/images/generations`，不重复 `/v1`；
- headers 含 `Authorization: Bearer sk-test` 和 `Content-Type: application/json`；
- 默认 body 含任务模型、`prompt:"a cute cat"`、`n:1`、`size:"1024x1024"`；
- custom body 的 `n:4` 最终仍为 `n:1`，模型和 prompt 不能被覆盖；
- `ValidateResponse` 对 200 + `data[0].url`、200 + `data[0].b64_json` 返回成功，对空 data、缺 url/base64、非 JSON、非 2xx 返回失败原因。

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
go test ./service -run 'TestOpenAIImageAdapter|TestGetProviderAdapterImage' -count=1
```

Expected: FAIL because the image adapter and mode dispatch do not exist。

- [ ] **Step 3: Add the image adapter**

在 `service/channel_monitor_checker.go` 增加 `OpenAIImageAdapter`：

```go
type OpenAIImageAdapter struct{}
```

`BuildRequest` 使用 endpoint helper：根 endpoint 拼接 `/v1/images/generations`，已以 `/v1` 结尾时拼接 `/images/generations`，已以完整图片路径结尾时不重复；设置 Bearer 鉴权和 JSON content type。请求体先放入 `model`、固定 `prompt:"a cute cat"`、`n:1`、`size:"1024x1024"`，再合并 body 中除 `model`、`prompt`、`n` 外的字段，最后强制 `n=1`。

`ValidateResponse` 要求 2xx、合法 JSON、非空 `data` 数组，并检查首项 `url` 或 `b64_json` 是非空字符串；错误信息只返回状态/契约原因，不回显 API key。

在 `GetProviderAdapter` 中让 OpenAI/Grok + `APIModeImageGeneration` 返回该 adapter；未知 API mode 返回错误，不再静默落到 Chat adapter。

- [ ] **Step 4: Run adapter tests and all service tests**

Run:

```bash
gofmt -w service/channel_monitor_checker.go service/channel_monitor_types.go service/channel_monitor_checker_test.go
go test ./service -run 'TestOpenAIImageAdapter|TestGetProviderAdapterImage|ChannelMonitor' -count=1
```

Expected: PASS。

- [ ] **Step 5: Commit the adapter slice**

```bash
git add service/channel_monitor_checker.go service/channel_monitor_types.go service/channel_monitor_checker_test.go
git commit -m "feat: add image generation channel monitor adapter"
```

### Task 3: Add admin UI mode, configurable image defaults, and i18n

**Files:**
- Modify: `web/src/features/channel-monitor/types.ts`
- Modify: `web/src/features/channel-monitor/components/monitor-form-dialog.tsx`
- Modify: `web/src/features/channel-monitor/components/template-form-dialog.tsx`
- Modify: `web/src/features/channel-monitor/monitor-zh.test.ts`
- Modify: `web/src/i18n/locales/en.json`
- Modify: `web/src/i18n/locales/zh.json`

- [ ] **Step 1: Add failing UI source/i18n tests**

扩展 `monitor-zh.test.ts` 的 key 列表，要求 `Image Generations`、`Image health-check success under 60 seconds is green; 60 seconds or slower is yellow; failures are red.`、`Image timeout must be between 1 and 180 seconds` 均存在简体中文翻译；增加源码断言，确认两个表单的 API mode 列表包含 `image_generation` 且使用 `t(m.label)`。

- [ ] **Step 2: Run the focused UI test to verify it fails**

Run:

```bash
cd web && bun test src/features/channel-monitor/monitor-zh.test.ts
```

Expected: FAIL because the mode and translations are absent。

- [ ] **Step 3: Extend types and form options**

将 `APIMode` 扩展为 `'chat_completions' | 'responses' | 'image_generation'`。两个表单的 `API_MODES` 增加：

```ts
{ value: 'image_generation', label: 'Image Generations' }
```

Provider 切换到 Anthropic/Gemini 时自动回到 Chat；OpenAI/Grok 可选择三种模式。只在 OpenAI/Grok 显示 API mode。

- [ ] **Step 4: Add image-specific defaults without overwriting edits**

在 monitor form 中保留文本默认值 `interval=60/timeout=10`；新建表单选中 image mode 时使用 `interval=300/timeout=90`，切回文本恢复文本默认值。仅当当前数值仍等于上一个模式的默认值时自动切换，管理员已手工改过的数值保持不变。timeout 的前端上限随 mode 为文本 60、生图 180；interval 仍为 60–3600，且 timeout 必须小于 interval。提交 payload 继续使用 `api_mode`、`interval_seconds`、`timeout_seconds`。

- [ ] **Step 5: Add the health-color help text and Chinese copy**

在生图 API mode 选择器下显示说明：成功且耗时小于 60 秒为绿色，达到 60 秒为黄色，失败为红色。为英文和简体中文 JSON 添加对应 key、`Image Generations`、`Slow`、`Image timeout must be between 1 and 180 seconds` 等文案，并保持 JSON 排序/格式化脚本要求。

- [ ] **Step 6: Run focused UI tests and typecheck**

Run:

```bash
cd web
bun test src/features/channel-monitor/monitor-zh.test.ts
bun run typecheck
```

Expected: PASS。

- [ ] **Step 7: Commit the admin UI slice**

```bash
git add web/src/features/channel-monitor/types.ts web/src/features/channel-monitor/components/monitor-form-dialog.tsx web/src/features/channel-monitor/components/template-form-dialog.tsx web/src/features/channel-monitor/monitor-zh.test.ts web/src/i18n/locales/en.json web/src/i18n/locales/zh.json
git commit -m "feat(web): expose image generation monitor mode"
```

### Task 4: Apply latency color policy to admin history, run results, and public status

**Files:**
- Create: `web/src/features/channel-monitor/lib/status.ts`
- Test: `web/src/features/channel-monitor/lib/status.test.ts`
- Modify: `web/src/features/channel-monitor/view/channel-monitor-view.tsx`
- Modify: `web/src/features/channel-monitor/components/run-result-dialog.tsx`
- Modify: `web/src/features/channel-monitor/components/monitor-history-dialog.tsx`
- Modify: `web/src/features/channel-status/components/status-helpers.ts`
- Modify: `web/src/features/channel-status/components/status-card.tsx`
- Modify: `web/src/features/channel-status/components/status-timeline.tsx`

- [ ] **Step 1: Write failing status-policy tests**

在 `status.test.ts` 添加：

```ts
expect(statusTone('success', 59999, 'image_generation')).toBe('success')
expect(statusTone('success', 60000, 'image_generation')).toBe('warning')
expect(statusTone('failure', 1000, 'image_generation')).toBe('failure')
expect(statusTone('success', 60000, 'chat_completions')).toBe('success')
expect(statusTone('unknown', 0, 'image_generation')).toBe('unknown')
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd web && bun test src/features/channel-monitor/lib/status.test.ts
```

Expected: FAIL because the shared status function does not exist。

- [ ] **Step 3: Implement the shared status policy**

创建 `status.ts`，导出 `IMAGE_SLOW_LATENCY_MS=60_000` 和 `statusTone(status, latencyMs, apiMode)`。只有 `apiMode === 'image_generation' && status === 'success' && latencyMs >= 60_000` 返回 `warning`；失败优先返回 `failure`，文本成功返回 `success`。

- [ ] **Step 4: Update admin status displays**

将 `ChannelMonitorView` 的 `StatusBadge` 改为接收 `status`、`latencyMs`、`apiMode`，生图 warning 使用 amber badge，并在列表调用时传入 `monitor.last_latency_ms` 与 `monitor.api_mode`。`RunResultDialog` 增加 `apiMode` prop，按每条结果 latency 调用同一函数；view 传入当前 monitor 的 API mode。`MonitorHistoryDialog` 从 monitor 传入 API mode，对历史行套用同一规则。失败始终 destructive，文本成功保持 success。

- [ ] **Step 5: Update public status surface**

扩展 `status-helpers.ts` 的 `timelineBar(status, latencyMs, apiMode)`，生图成功且 latency ≥60 秒使用 amber；`StatusCard` 的状态 chip 对生图慢成功使用 amber “Up”样式，仍保持成功语义；`StatusTimeline` 接收 `apiMode` 并传入 timeline bar。公共详情和时间线不改变可用率统计。

- [ ] **Step 6: Run status tests and UI typecheck**

Run:

```bash
cd web
bun test src/features/channel-monitor/lib/status.test.ts src/features/channel-monitor/monitor-zh.test.ts
bun run typecheck
```

Expected: PASS。

- [ ] **Step 7: Commit the status slice**

```bash
git add web/src/features/channel-monitor/lib/status.ts web/src/features/channel-monitor/lib/status.test.ts web/src/features/channel-monitor/view/channel-monitor-view.tsx web/src/features/channel-monitor/components/run-result-dialog.tsx web/src/features/channel-monitor/components/monitor-history-dialog.tsx web/src/features/channel-status/components/status-helpers.ts web/src/features/channel-status/components/status-card.tsx web/src/features/channel-status/components/status-timeline.tsx
git commit -m "feat(web): color slow image probes amber"
```

### Task 5: End-to-end verification, migration safety, and release notes

**Files:**
- Modify: `docs/AI-MAINTAINER-HANDOFF.md`
- Modify: `/home/huiji/code/Api/progress.md`
- Modify: `/home/huiji/code/Api/SERVER-OPS.md`

- [ ] **Step 1: Run backend regression suite**

Run:

```bash
go test ./service ./controller ./model -count=1
```

Expected: PASS with no database migration required。

- [ ] **Step 2: Run frontend regression and quality checks**

Run:

```bash
cd web
bun test
bun run typecheck
bun run lint
bun run format:check
```

Expected: PASS。

- [ ] **Step 3: Build the frontend and backend**

Run:

```bash
cd web && bun run build:check
cd .. && go build -o /tmp/aizzz-gateway-slim-image-monitor ./
```

Expected: both commands exit 0 and produce the frontend bundle plus `/tmp/aizzz-gateway-slim-image-monitor`。

- [ ] **Step 4: Verify database compatibility and seeded templates**

在现有数据库上启动测试二进制，确认 GORM 不新增迁移列；调用模板列表确认 OpenAI/Grok Image Generations 默认模板各一条且重复启动不会增加数量。创建一个 image monitor，确认保存 `api_mode=image_generation`、timeout=90、interval=300，并通过手动 run 返回 image contract 后记录 success。

- [ ] **Step 5: Verify color boundary with deterministic fixtures**

使用已有手动 run/history API 或前端测试夹具验证：latency 59,999ms 成功为绿色、60,000ms 成功为黄色、任何 failure 为红色、Chat 成功 60,000ms 仍绿色。

- [ ] **Step 6: Update handoff and operational notes**

在维护文档记录新 API mode、默认值、`/v1/images/generations` 请求契约、颜色边界、回滚不需要数据库操作，以及测试命令。

- [ ] **Step 7: Commit release documentation**

```bash
git add docs/AI-MAINTAINER-HANDOFF.md
git commit -m "docs: record image generation monitor support"
```

同步将同样的版本、验证命令和回滚说明追加到仓库外运维记录 `/home/huiji/code/Api/progress.md` 与 `/home/huiji/code/Api/SERVER-OPS.md`；这两份记录不纳入本仓库提交。

