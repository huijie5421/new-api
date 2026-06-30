# 渠道自动健康路由（Channel Health Router）— 技术方案 v2

> 状态：设计稿（已用生产数据校准），待 review 后进入实现
> 分支：`feat/custom`
> 关联子系统：渠道选路（`model/channel_cache.go`）、渠道亲和（`service/channel_affinity.go`）、性能指标（`pkg/perf_metrics`）、渠道监控（`service/channel_monitor_*`）、日志色标（`web/default/src/features/usage-logs/lib/format.ts`）
> v2 变更：用 gpt-5.5 生产日志（14 天 / 6.2 万次 / 18 渠道）实测校准，**废弃 v1 的绝对错误率阈值与"相对基线"路线**，改用 new-api 内置色标（绝对 UX 标准）+ 连续 20 窗 + 红色计数分带。

---

## 0. 决策基线（已确认）

| 决策点 | 选定方案 | 含义 |
|---|---|---|
| 健康"定义" | **内置色标，绝对统一** | 健康是 UX 标准，对所有渠道一视同仁（首字 5s/10s、流速 30/15 tok/s）。渠道能级不同 ≠ 健康标准不同。 |
| 健康"观测窗口" | **最近连续 20 次请求**（计数窗口，非时间窗口） | 低流量渠道也总有确定样本量；20 次足以稀释单次抖动。 |
| 切走流量的方式 | **按 priority 临时降级** | 不健康渠道在选路候选里被"软排除"，流量落到同层其他健康渠道或下一优先级层。低成本=高优先级，恢复后自动回归。 |
| 冷却时长 | **15 分钟 + 指数退避** | 实测 79% 的坏周期 15 分钟内自愈；但有 ≥2 天的慢性尾巴，故必须退避。 |
| 状态共享 | **Redis 共享（hybrid cache 兜底内存）** | 多实例看到一致的渠道健康状态。复用亲和同款 `pkg/cachex.HybridCache`。Redis 未上线时退化为单实例内存（见 §10）。 |

---

## 1. 背景与目标

### 1.1 问题
一个分组下常接入多个能跑同一模型的渠道，成本不同。希望系统**自动判断渠道当前是否健康**（首字 TTFB、流速 TPS、差体验比例），不健康时**自动把流量切到备用渠道**，源渠道恢复后**自动切回低成本渠道**。要求**灵敏但不误判**——区分"临时网络抖动"与"渠道确实坏了"。

### 1.2 功能目标
1. 按渠道实时观测健康（基于内置色标）。
2. 不健康渠道临时退出选路候选，流量走健康备用。
3. **切换前预判（canary）**：对状态未知的备用渠道，先放小比例试探流量确认健康再放量。
4. **切换后冷却 + 探测恢复**：冷却到期放小比例探测流量回源渠道，连续健康即立即切回低成本源渠道。
5. **防误判**：连续 20 窗 + 红色计数 + 连续确认 + 冷却退避，单次异常只记一票。
6. 与渠道亲和协调：不破坏亲和的 prompt 缓存局部性，但渠道真坏时让亲和让路。

### 1.3 非目标
- 不替换现有 `priority`/`weight`/亲和机制，只叠加一层"健康过滤"。
- 不依赖主动探测替代真实流量判定。
- 第一版**不新增数据库表**（健康状态存 Redis + 内存，失效即透明回退）。

---

## 2. 生产数据校准（本设计的实证基础）

数据源：生产 MySQL `newapi_logs.logs`，model=`gpt-5.5`，近 14 天，type=2 消费日志，逐请求 `Other.frt`（首字毫秒）、`use_time`、`completion_tokens`。

### 2.1 关键实测结论
1. **错误日志在生产是关闭的**（`ErrorLogEnabled` off，全样本 0 条 type=5）。→ 历史错误率只能用 `stream_status`(已计费但中断) 与重试链 `use_channel` 估下界；**运行时系统不依赖错误日志**（直接 hook relay，见 §5）。建议另行打开错误日志收集 ground-truth（§11）。
2. **数据噪声**：3.6% 请求首字记为哨兵 `-1000`（"无首字"），且 ch49 占 16%、ch57 占 20%——**无首字本身是强故障信号**，计红处理（哨兵根因待查，见 §11）。极端首字达 7.5 分钟，**必须用分位/计数，不能用均值**。
3. **渠道是不同能级的上游**：ch68 流速中位 67 tok/s，ch49 仅 38；p99 首字 9.7s vs 80s。→ **健康定义若用绝对"流速下限"会永久误杀慢渠道**；故健康定义改用**色标 UX 标准**（差体验=绝对事实），路由再做渠道间比较。
4. **健康渠道也有约 13-15% 的瞬时坏窗**（ch68 红≥6 占 13%）。→ **必须连续确认，不能单窗触发**。
5. **坏周期持续性双峰**：62% 的坏streak < 2 分钟（抖动），但 41% 连续 ≥10 窗、21% ≥15 分钟，慢性尾巴长达 **2.1 天**。→ 15 分钟冷却合理 + **退避刚需**。

### 2.2 红色计数分带（最终判据，实测）
red = 首字≥10s **或** 流速<15 tok/s **或** 无首字。各渠道最近-20-窗的红色计数分布（节选）：

| 渠道 | 均红/20 | ok%(红≤2) | warn%(红3-5) | bad%(红≥6) | 判决 |
|---|---|---|---|---|---|
| 83 | 0.7 | 94 | 6 | 0 | 🟢 |
| 66 | 2.1 | 76 | 13 | 11 | 🟢 |
| 68 | 2.7 | 65 | 22 | 13 | 🟢 主力 |
| 76 | 3.6 | 59 | 18 | 23 | 🟡 |
| 16 | 4.5 | 49 | 19 | 32 | 🟡 |
| 49 | 6.0 | 26 | 29 | 45 | 🔴 高流量却差 |
| 61 | 7.7 | 19 | 26 | 55 | 🔴 |
| 80 | 6.7 | 4 | 30 | 66 | 🔴 最差 |

红色计数 tier 无关、直觉化（"最近 20 次里几次给了明确差体验"），绝对阈值 `≤2/3-5/≥6` 干净分开健康与坏。

---

## 3. 健康量化模型（数据校准版）

### 3.1 原子评级（逐请求）= 内置色标取最差
完全复用 `web/default/src/features/usage-logs/lib/format.ts` 的官方阈值（与用户日志里看到的颜色一致）：

| 维度 | 🟢 green(0) | 🟡 yellow(1) | 🔴 red(2) |
|---|---|---|---|
| 首字 `frt` | < 5s | 5–10s | ≥ 10s **或 无首字(-1000)** |
| 流速 `completion_tokens/use_time`（输出≥100 token） | ≥ 30 | 15–30 | < 15 |
| 总时长（输出<100 token） | < 10s | 10–30s | ≥ 30s |

`lvl = GREATEST(首字色, 响应色)`，即**取两者最差**。

### 3.2 渠道健康 = 最近 20 次请求的红色计数
对每个渠道维护一个长度 20 的环形缓冲（计数窗口），统计其中 `lvl==red` 的数量 `red_cnt`（同时可记 `green_cnt` 供展示）。

### 3.3 状态判定（带连续确认与滞回）
| 状态 | 触发条件 | 路由动作 |
|---|---|---|
| **OK** | `red_cnt ≤ 2` | 正常路由，最便宜优先 |
| **WARN** | `red_cnt ∈ [3,5]` | 早警（"黄色多了"）：分流**小比例探测流量**到备选渠道，观察是否更优 |
| **BAD** | `red_cnt ≥ 6` 且**连续 ≥3 个评估窗**保持 | 从正常选路候选**软排除**，进入冷却 |
| **COOLDOWN/PROBING** | 进入 BAD 后 | 排除出正常池，仅按概率放探测流量回该渠道 |

恢复：冷却到期转 PROBING；探测样本 `red_cnt ≤ 2` 连续 K 次 → 回 OK（**立即切回低成本**）；探测仍 `red_cnt ≥ 6` → 冷却 `×2` 退避至上限。

> 设计要点：BAD 的"连续 ≥3 窗确认"对应实测——14-33% 的坏streak 是 ≤2 窗抖动，确认门槛把它们滤掉；而真故障（均长 ~19 窗）会稳定越过门槛。

### 3.4 防误判机制（全部有数据支撑）
| 闸 | 机制 | 实测依据 |
|---|---|---|
| ① 绝对色标 | 差体验=客观事实，不受渠道能级影响 | ch49 中位流速 38 但仍按 UX 判 |
| ② 连续 20 窗 | 单次抖动只占 1/20 票 | 健康渠道约 15% 黄属正常基线 |
| ③ 红色硬判 | 只数"明确差"（红），黄(尚可)不直接触发切走 | 黄只触发探测，不触发降级 |
| ④ 连续 ≥3 窗确认 | 滤掉 ≤2 窗抖动 | 14-33% 坏streak 是 ≤2 窗 |
| ⑤ 冷却 15min + 退避 | 防慢性渠道高频探测 | 21% 坏周期 ≥15min，尾巴达 2.1 天 |
| ⑥ 总开关 + fail-safe | 失效即透明回退原生 | — |

---

## 4. 总体架构

健康路由 = 叠加在现有选路上的两件事：**(A) 被动观测 → 维护状态**，**(B) 选路时按状态过滤/调权候选**。

```
                          ┌────────────────── 观测回路（异步）──────────────────┐
请求 ─▶ Distribute(中间件)                          响应结束                        │
        │                                          ├─ 成功 text_quota.go:495 ──────┤
        ├─ [亲和闸门] distributor.go:104            └─ 失败 relay.go:243 ───────────┤
        │   命中 & Enabled & IsChannelEnabledForGroupModel                          ▼
        │   └─[新增] && !IsChannelBadForAffinity(id)  ── 仅 BAD 否决亲和    RecordChannelHealthSample(channelId, lvl)
        │        可用 ─▶ 用亲和渠道                                                 │
        │        被否决 ─▶ ClearCurrentChannelAffinityCache(现成)                   ▼
        └─ 未命中/被否决 ─▶ CacheGetRandomSatisfiedChannel             per-channel 环形缓冲(最近20) → red_cnt
                            └─[新增] 健康过滤候选:                                  │ 评估(连续确认)
                               · BAD     → 排除                                     ▼
                               · WARN    → 保留 + 触发探测概率                状态机 OK/WARN/BAD/PROBING
                               · Unknown → canary 小概率                            │ CAS
                               · OK      → 正常权重                                 ▼
                            ─▶ model.GetRandomSatisfiedChannelExcluding      Redis 共享状态(HybridCache, TTL fail-safe)
                                                                                   ▲
                            选路读状态(本地1s缓存)──────────────────────────────┘
```

三个新组件：
- **组件 A — 采集器**（`service/channel_health_collector.go`）：逐请求评级 + 每渠道环形缓冲。
- **组件 B — 状态机**（`service/channel_health_state.go`）：红色计数判定 + OK/WARN/BAD/PROBING + 冷却退避 + Redis 共享。
- **组件 C — 选路集成**（改 `service/channel_select.go` + `model/channel_cache.go` + `middleware/distributor.go`）：候选过滤 + 探测/canary + 亲和协作。

---

## 5. 组件 A：采集器

### 5.1 采集点
在 perf_metrics 既有两个调用点**旁挂**（不改 perf_metrics 包）：
- 成功：`service/text_quota.go:495`（持有 `relayInfo` + `completion_tokens`）。
- 失败：`controller/relay.go:243`（失败请求；首字/流速缺失 → 直接计红）。

两处都已持有 `relayInfo`（`ChannelId`/`StartTime`/`FirstResponseTime`/`IsStream`），无需新增上下文穿透。

### 5.2 逐请求评级
按 §3.1 计算 `lvl ∈ {0,1,2}`。注意运行时用 `FirstResponseTime - StartTime` 的**精确毫秒**与精确流速（perf_metrics 的 `generationMs`），不受历史 `use_time` 整秒粗粒度影响。失败请求、无首字 → 计红。

```go
type ChannelHealthSample struct {
    ChannelID int
    Lvl       int8 // 0 green / 1 yellow / 2 red
}
```

### 5.3 每渠道环形缓冲（计数窗口）
```go
type channelHealthRing struct {
    buf   [20]int8 // 最近 20 次评级
    pos   int
    n     int      // 已填充数(<20 时不足窗)
    red   int      // 当前窗口红色计数(增量维护)
    green int
}
```
- 写入 O(1)：弹出最旧、压入最新、增量更新 `red/green`。
- 不足 20 样本（`n<20`）→ 视为 Unknown，不判 BAD（最小样本门槛）。

### 5.4 多实例：本地观测 + Redis 状态权威
- 每实例本地各自维护环形缓冲做观测；**状态转换决定写 Redis 共享**（§6.4）。谁先判 BAD 谁写，其他实例尊重。
- 与 perf_metrics「本地 hotBuckets + 可选 Redis」一脉相承。单实例样本不足由 §5.3 门槛兜底。

---

## 6. 组件 B：状态机

### 6.1 评估循环
每实例一个后台 ticker（如每 2s）或每次窗口写入后触发，对"近窗口有样本"的渠道：
1. `n<20` → 跳过（维持 OK/Unknown）。
2. 读 `red_cnt`，据 §3.3 分带。
3. BAD 需连续 ≥3 次评估保持 `red_cnt≥6` 才落 BAD（连续确认计数器）。
4. PROBING 渠道累计探测样本，`red_cnt≤2` 连续 K 次 → 回 OK；仍 `≥6` → 冷却 `×2`。

### 6.2 Redis 状态结构（HybridCache，fail-safe）
```go
type ChannelHealthState struct {
    State          string `json:"state"`           // ok | warn | bad | probing
    RedCnt         int    `json:"red_cnt"`          // 末次评估(展示)
    EnteredAt      int64  `json:"entered_at"`
    CooldownUntil  int64  `json:"cooldown_until"`
    CooldownRounds int    `json:"cooldown_rounds"`  // 退避计数
    ProbeOKStreak  int    `json:"probe_ok_streak"`
}
```
- 命名空间 `new-api:channel_health:v1:{channelId}`，JSON 走 `common.Marshal/Unmarshal`（Rule 1）。
- **TTL fail-safe**：`cooldown + buffer`；无人维护即过期 → 读不到当 OK → 回退原生行为。
- **Redis 不可用**：读失败一律当 OK，**绝不阻断请求**。
- 选路读状态加**本地 1s 缓存**，避免高 QPS 每请求打 Redis。

### 6.3 冷却退避（实测驱动）
- 基础冷却 **15min**。
- 每次探测仍 BAD：`cooldown = min(15min × 2^rounds, cap)`，`cap` 建议 **4h**（慢性尾巴可达 2.1 天，无需更频繁探测）。
- 回 OK 后 `rounds` 清零。

---

## 7. 组件 C：选路集成（priority 临时降级）

### 7.1 候选处理
| 状态 | 选路处理 |
|---|---|
| OK | 正常权重 |
| WARN | 正常权重 **+** 以小概率 `probeRatio` 额外分流到备选（早警探测，不降级源渠道） |
| BAD / PROBING | **排除**出正常池；PROBING 以概率 `probeRatio` 放探测流量回该渠道 |
| Unknown（无状态/不足样本） | 正常参与；若承接切换流量则按 `canaryRatio` 渐进放量 |

某优先级层渠道**排除后为空** → 该层视为空 → 自然降到下一层（即 priority 临时降级）。

### 7.2 model 层改动（保留旧函数）
```go
// model/channel_cache.go
// 按优先级从高到低遍历；每层先剔除 exclude，第一个"剔除后非空"的层内加权随机。
func GetRandomSatisfiedChannelExcluding(group, model string, retry int, exclude map[int]bool) (*Channel, error)
```
- 不依赖 service 包（避免循环依赖）；exclude 由 service 层算好传入。
- DB 兜底（`model/ability.go`）加 `Where("channel_id NOT IN ?", ids)` 变体，三库兼容（Rule 2）。

### 7.3 service 层调度
```go
// service/channel_select.go（CacheGetRandomSatisfiedChannel 内）
exclude, probeTargets := BuildHealthExcludeSet(group, model) // 读状态(本地1s缓存)
if pick, ok := MaybePickProbeChannel(probeTargets); ok { return pick, group, nil } // 概率探测/canary
channel, err = model.GetRandomSatisfiedChannelExcluding(group, model, retry, exclude)
```
- **探测/canary 用"每请求独立概率"实现 → 多实例天然安全**，无需 Redis 协调配额。
- `auto` 分组路径逐 group 调同一过滤逻辑。

---

## 8. 组件 D：与渠道亲和协作（冲突解决）

**单向关系：亲和负责"粘"，健康路由负责"何时允许不粘"。** 两者共用 `distributor.go:128` 逐出出口，不并行抢方向盘。

### 8.1 接入点
扩展 `middleware/distributor.go:104-127` 亲和闸门的 `affinityUsable` 判断：
```go
if affinityUsable && service.IsChannelBadForAffinity(preferred.Id) {
    affinityUsable = false // 仅当渠道处于 BAD 才放弃亲和
}
// 落到现有 :128 逐出 + 回落随机选路(避开BAD渠道→选健康备用)
```
- **只有 BAD 才否决亲和**；WARN/黄色不否决（避免为缓存局部性付一点延迟代价就丢缓存）。

### 8.2 切换与恢复语义
- **切换**：亲和渠道被否决 → 逐出 → 回落随机 → 选健康备用。成功后 `SwitchOnSuccess`（默认开）自动把粘性迁到备用。
- **恢复**：
  - **非亲和普通流量**：源渠道一回 OK，因 `priority` 高，选路**立即回归低成本源渠道**。
  - **亲和流量**：已粘到备用的会话**不强切回**，待亲和 TTL 自然过期回归（强切会丢备用已建缓存，得不偿失）。

---

## 9. 配置项（仿亲和 setting，全局可调 + 总开关；默认值已校准）

```go
type ChannelHealthRouterSetting struct {
    Enabled        bool `json:"enabled"`          // 总开关，默认 false 保守上线
    WindowSize     int  `json:"window_size"`      // 20（最近 N 次请求）

    // 原子评级阈值（对齐内置色标，ms / tok-per-sec）
    FrtYellowMs    int `json:"frt_yellow_ms"`     // 5000
    FrtRedMs       int `json:"frt_red_ms"`        // 10000
    TpsYellow      int `json:"tps_yellow"`        // 15
    TpsGreen       int `json:"tps_green"`         // 30
    NoFirstByteIsRed bool `json:"no_first_byte_is_red"` // true

    // 红色计数分带（窗口=20）
    WarnRedCnt     int `json:"warn_red_cnt"`      // 3
    BadRedCnt      int `json:"bad_red_cnt"`       // 6
    ConfirmWindows int `json:"confirm_windows"`   // 3（BAD 连续确认）
    RecoverOKStreak int `json:"recover_ok_streak"` // 3（PROBING→OK）

    // 冷却 + 探测
    CooldownSeconds    int     `json:"cooldown_seconds"`     // 900 (15min)
    CooldownMaxSeconds int     `json:"cooldown_max_seconds"` // 14400 (4h)
    CooldownBackoff    float64 `json:"cooldown_backoff"`     // 2.0
    ProbeRatio         float64 `json:"probe_ratio"`          // 0.08
    CanaryRatio        float64 `json:"canary_ratio"`         // 0.05

    VetoAffinityOnBad  bool    `json:"veto_affinity_on_bad"` // true
}
```
- `init()`：`config.GlobalConfig.Register("channel_health_router_setting", &channelHealthRouterSetting)`。
- 前端：仿亲和面板的配置 section（可后置）。
- **总开关默认关**：上线先 shadow（只观测不干预）→ 灰度开。

---

## 10. 改动文件清单

| 文件 | 改动 | 风险 |
|---|---|---|
| `service/channel_health_collector.go` | **新增**：评级 + 每渠道环形缓冲 | 低 |
| `service/channel_health_state.go` | **新增**：状态机 + Redis(HybridCache) + 评估循环 | 中（核心） |
| `setting/operation_setting/channel_health_router_setting.go` | **新增**：配置 + 注册 | 低 |
| `service/text_quota.go:495`、`controller/relay.go:243` 旁 | 加 `RecordChannelHealthSample` | 低 |
| `model/channel_cache.go` | 加 `GetRandomSatisfiedChannelExcluding` | 中（热路径） |
| `model/ability.go` | DB 兜底 exclude 变体（三库兼容） | 中 |
| `service/channel_select.go` | 健康过滤 + 探测/canary 调度 | 中（热路径） |
| `middleware/distributor.go:104-127` | 亲和闸门加 BAD 否决 | 低 |
| `controller/` + `router/api-router.go` | 健康状态 stats / 清除接口（仿 `channel_affinity_cache.go`） | 低 |
| `main.go` | 启动评估循环 ticker | 低 |
| 前端配置/状态面板 | 仿亲和 section | 低（可后置） |

---

## 11. 分阶段实施计划

- **阶段 0 — Shadow**：采集器 + 状态机**只观测不干预**（`Enabled=false` 仍计算状态并出 stats）。用真实流量验证状态判定与预设阈值（直接复用 §2 的口径），对比"内置色标实际表现"。
- **阶段 1 — 选路排除**：BAD 排除 + 冷却退避 + 亲和 BAD 否决。灰度开 `Enabled`。
- **阶段 2 — WARN 探测 + canary**：黄色早警分流探测；Unknown 备用渐进放量；前端面板。
- **并行建议 — 打开错误日志**：生产 `ErrorLogEnabled` 现为关闭，建议打开收集 ground-truth 按渠道错误率，补 `stream_status` 抓不到的"首字前失败/全失败"，并查清 `frt=-1000` 哨兵根因。

---

## 12. 风险、回退、可观测性

- **回退**：`Enabled=false` 一键关闭，hook 短路；Redis 失效自动透明回退；无 DB 迁移、回退无残留。
- **热路径开销**：采集是 O(1) 环形缓冲更新；选路读状态有本地 1s 缓存。需压测确认 p99 无回归。
- **误判风险**：靠 §3.4 六道闸 + 阶段 0 Shadow 校准；保守起步（高 `BadRedCnt`、足 `ConfirmWindows`）。
- **可观测性**：stats 接口（仿 `controller/channel_affinity_cache.go`）暴露各渠道 state / red_cnt / cooldownUntil；状态转换写结构化日志；可选接入 root 通知（默认仅日志）。

---

## 13. 待 review 拍板的点

1. **WARN→探测 vs 仅 BAD 才动作**：第一版是否要做 WARN 早警探测（更灵敏、稍复杂），还是先只做 BAD 排除（更稳）？
2. **健康粒度**：per-channel（默认，样本足）还是 per-(channel, model)（精准但样本稀疏）？
3. **`BadRedCnt=6 / ConfirmWindows=3`** 是否按你偏好微调（更激进=更早切但易误判 / 更保守反之）。
4. **是否并行打开错误日志**收集 ground-truth（生产配置改动）。
5. 状态变更通知：仅日志还是接 root 通知。
