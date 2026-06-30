package service

import (
	"fmt"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/bytedance/gopkg/util/gopool"
)

// 渠道自动健康路由 —— 采集器 + 状态机。
//
// 设计文档：docs/channel-health-router-design.md（v2，生产数据校准）。
//
// 工作方式：
//   - 逐请求按 new-api 内置色标评级（绿/黄/红，取首字与流速最差），无首字计红。
//   - 每渠道维护最近 WindowSize 次评级的环形缓冲，统计红色计数 redCnt。
//   - 状态机：red<=Warn → OK；[Warn,Bad) → WARN(探测)；>=Bad 且连续 Confirm 窗 → BAD。
//     BAD 冷却 CooldownSeconds（×Backoff 退避至上限）；冷却到期转 PROBING，探测连续
//     RecoverOKStreak 窗健康 → 回 OK。
//   - 选路时 BAD/PROBING 渠道被排除（PROBING 以 ProbeRatio 概率放探测流量回去），
//     从而按 priority 临时降级到同层其它渠道或下一优先级层。
//   - 状态发生切换时写一条管理日志（type=管理，归属 root，详情含原因+证据）。
//
// 注：当前实现为单实例内存态（生产 Redis 未上线）。状态结构与读写已收敛到
// healthRouterStore，未来需多实例共享时可在此层接 HybridCache，不影响调用方。

const (
	healthStateOK      = "ok"
	healthStateWarn    = "warn"
	healthStateBad     = "bad"
	healthStateProbing = "probing"
)

// channelHealthEntry 单个渠道的健康观测 + 状态（按 group 维度隔离，见 healthKey）。
type channelHealthEntry struct {
	mu sync.Mutex

	// 环形缓冲：最近 N 次评级（0 绿 / 1 黄 / 2 红）
	ring    []int8
	pos     int
	filled  int
	redCnt  int // 当前窗口红色数（增量维护）
	grnCnt  int // 当前窗口绿色数（增量维护）
	lastLvl int8

	// 状态机
	state          string
	enteredAt      int64
	badStreak      int   // 连续达到 BadRedCnt 的评估窗数（用于确认）
	probeOKStreak  int   // PROBING 期间连续健康探测窗数
	cooldownUntil  int64 // BAD/PROBING 冷却截止（unix 秒）
	cooldownRounds int   // 退避计数

	// 末次切换证据（写日志用）
	lastSwitchReason string
}

type healthRouterStore struct {
	mu      sync.RWMutex
	entries map[string]*channelHealthEntry
}

var (
	healthStore = &healthRouterStore{entries: make(map[string]*channelHealthEntry)}

	// root 用户 id 缓存（写管理日志归属者）。
	healthRouterRootUserID   int
	healthRouterRootUserOnce sync.Once

	// 探测/canary 概率用的轻量随机源（避免 time/rand 在脚本沙箱的限制，这里是生产 Go 代码无此问题）。
	healthProbeCounter atomic.Uint64
)

// healthKey 渠道健康状态按 (group, channelId) 维度隔离：同一渠道在不同分组的
// 表现可能不同，且自动路由是按分组开启的。
func healthKey(group string, channelID int) string {
	return group + "\x00" + fmt.Sprintf("%d", channelID)
}

func (s *healthRouterStore) get(group string, channelID int) *channelHealthEntry {
	key := healthKey(group, channelID)
	s.mu.RLock()
	e := s.entries[key]
	s.mu.RUnlock()
	if e != nil {
		return e
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if e = s.entries[key]; e != nil {
		return e
	}
	e = &channelHealthEntry{state: healthStateOK}
	s.entries[key] = e
	return e
}

// ---- 逐请求评级 ----

// rateRelaySample 按内置色标对一次请求评级，返回 0 绿 / 1 黄 / 2 红。
// success=false（请求失败）在开启错误率收集时直接计红。
func rateRelaySample(cfg *operation_setting.ChannelHealthRouterSetting, info *relaycommon.RelayInfo, success bool, outputTokens int64) int8 {
	if !success {
		if cfg.CollectErrorRate {
			return 2
		}
		// 不收集错误率时，失败请求不参与评级（返回 -1 表示跳过，由调用方处理）。
		return -1
	}

	now := time.Now()
	hasTTFB := info.IsStream && info.HasSendResponse()

	// 无首字（流式但完全没收到首字）是硬故障，不参与组合佐证，直接计红。
	noFirstByte := info.IsStream && !hasTTFB && cfg.NoFirstByteIsRed

	// 首字色（有首字时按延迟分带；无首字单独处理，见上）
	frtLvl := int8(0)
	if hasTTFB {
		frtMs := info.FirstResponseTime.Sub(info.StartTime).Milliseconds()
		frtLvl = bandFromThresholds(int(frtMs), cfg.FrtYellowMs, cfg.FrtRedMs)
	}

	// 响应色：输出 token 足够时按流速，否则按总时长。
	respLvl := int8(0)
	latencyMs := now.Sub(info.StartTime).Milliseconds()
	if outputTokens >= int64(cfg.TpsMinOutputTokens) && latencyMs > 0 {
		genMs := latencyMs
		if hasTTFB {
			genMs = now.Sub(info.FirstResponseTime).Milliseconds()
		}
		if genMs <= 0 {
			genMs = latencyMs
		}
		tps := float64(outputTokens) / (float64(genMs) / 1000.0)
		// 流速越高越好，分带方向与延迟相反。
		switch {
		case tps >= float64(cfg.TpsGreen):
			respLvl = 0
		case tps >= float64(cfg.TpsYellow):
			respLvl = 1
		default:
			respLvl = 2
		}
	} else {
		durSec := int(latencyMs / 1000)
		respLvl = bandFromThresholds(durSec, cfg.DurationYellowSec, cfg.DurationRedSec)
	}

	if noFirstByte {
		return 2
	}

	// 组合判定（而非取最差）：单一维度差只算波动，需两维度互相佐证才升级。
	// 等级求和 sum = frtLvl + respLvl：
	//   sum==0           → 绿(0)
	//   sum∈{1,2}        → 黄(1)  例如「首字红(2)+响应绿(0)=2」= 首字波动但实际正常 → 仅黄
	//   sum>=3           → 红(2)  需两维度都不佳（至少一黄一红）才判红
	// 这样首字单飞的红/黄（多为网络波动）不会单独把请求判红。
	sum := int(frtLvl) + int(respLvl)
	switch {
	case sum == 0:
		return 0
	case sum >= 3:
		return 2
	default:
		return 1
	}
}

// bandFromThresholds 越小越好的指标分带：< yellow 绿(0)，[yellow,red) 黄(1)，>= red 红(2)。
func bandFromThresholds(v, yellow, red int) int8 {
	switch {
	case v < yellow:
		return 0
	case v < red:
		return 1
	default:
		return 2
	}
}

// ---- 采集入口 ----

// RecordChannelHealthSample 记录一次请求的健康样本并推进状态机。
// 在 relay 成功/失败两个收尾点旁挂调用（异步）。仅对开启自动健康路由的分组生效。
func RecordChannelHealthSample(info *relaycommon.RelayInfo, success bool, outputTokens int64) {
	if info == nil || info.ChannelMeta == nil {
		return
	}
	group := info.UsingGroup
	if !operation_setting.IsHealthRouterEnabledForGroup(group) {
		return
	}
	cfg := operation_setting.GetChannelHealthRouterSetting()

	lvl := rateRelaySample(cfg, info, success, outputTokens)
	if lvl < 0 {
		return // 失败且不收集错误率 → 跳过
	}

	e := healthStore.get(group, info.ChannelId)

	// PROBING 态渠道被排除出常规选路，其收到的任何样本必然是探测流量 →
	// 走探测恢复判定（按单次结果累计连胜），不计入常规窗口。
	if e.isProbing() {
		e.observeProbe(cfg, group, info.ChannelId, lvl)
		return
	}

	e.observe(cfg, lvl)
	// channelName 留空，由 logHealthStateTransition 在需要时用 CacheGetChannel 补全。
	e.evaluate(cfg, group, info.ChannelId, "")
}

// observe 把一次评级写入环形缓冲，增量维护红/绿计数。
func (e *channelHealthEntry) observe(cfg *operation_setting.ChannelHealthRouterSetting, lvl int8) {
	e.mu.Lock()
	defer e.mu.Unlock()

	size := cfg.WindowSize
	if size <= 0 {
		size = 20
	}
	if len(e.ring) != size {
		// 首次或窗口大小变更：重建缓冲（计数清零，逐步重新填充）。
		e.ring = make([]int8, size)
		e.pos = 0
		e.filled = 0
		e.redCnt = 0
		e.grnCnt = 0
	}

	if e.filled == size {
		// 弹出最旧
		old := e.ring[e.pos]
		if old == 2 {
			e.redCnt--
		} else if old == 0 {
			e.grnCnt--
		}
	} else {
		e.filled++
	}
	e.ring[e.pos] = lvl
	if lvl == 2 {
		e.redCnt++
	} else if lvl == 0 {
		e.grnCnt++
	}
	e.pos = (e.pos + 1) % size
	e.lastLvl = lvl
}

// evaluate 据当前窗口推进状态机；状态切换时写管理日志。
// 注意：仅 OK/WARN 态在此（样本驱动）做判定。BAD/PROBING 态的渠道已被选路排除、
// 收不到常规样本，其转换分别由 status() 惰性触发（BAD→PROBING 冷却到期）和
// observeProbe()（PROBING 的探测样本）驱动，不在此处理。
func (e *channelHealthEntry) evaluate(cfg *operation_setting.ChannelHealthRouterSetting, group string, channelID int, channelName string) {
	e.mu.Lock()
	windowReady := e.filled >= len(e.ring) && len(e.ring) > 0
	redCnt := e.redCnt
	grnCnt := e.grnCnt
	windowN := e.filled
	prevState := e.state
	now := common.GetTimestamp()

	// 样本不足：维持当前态，不做 BAD 判定（最小样本门槛）。
	if !windowReady {
		e.mu.Unlock()
		return
	}

	// 仅 OK/WARN 在样本路径判定；BAD/PROBING 由读路径/探测路径推进。
	if e.state == healthStateOK || e.state == healthStateWarn {
		switch {
		case redCnt >= cfg.BadRedCnt:
			e.badStreak++
			if e.badStreak >= cfg.ConfirmWindows {
				e.toBad(cfg, now, redCnt, windowN)
			} else if redCnt >= cfg.WarnRedCnt {
				e.state = healthStateWarn
			}
		case redCnt >= cfg.WarnRedCnt:
			e.badStreak = 0
			e.state = healthStateWarn
		default:
			e.badStreak = 0
			e.state = healthStateOK
		}
	}

	newState := e.state
	reason := e.lastSwitchReason
	e.mu.Unlock()

	if newState != prevState {
		logHealthStateTransition(group, channelID, channelName, prevState, newState, reason, redCnt, grnCnt, windowN)
	}
}

func (e *channelHealthEntry) toBad(cfg *operation_setting.ChannelHealthRouterSetting, now int64, redCnt, windowN int) {
	e.state = healthStateBad
	e.enteredAt = now
	e.cooldownRounds = 0
	e.cooldownUntil = now + int64(cfg.CooldownSeconds)
	e.lastSwitchReason = fmt.Sprintf("最近%d次请求中%d次为红色(明确差体验)，达阈值%d且连续%d窗确认",
		windowN, redCnt, cfg.BadRedCnt, cfg.ConfirmWindows)
}

func (e *channelHealthEntry) toBadBackoff(cfg *operation_setting.ChannelHealthRouterSetting, now int64, redCnt, windowN int) {
	e.state = healthStateBad
	e.enteredAt = now
	e.cooldownRounds++
	backoff := cfg.CooldownSeconds
	for i := 0; i < e.cooldownRounds; i++ {
		next := int(float64(backoff) * cfg.CooldownBackoff)
		if next > cfg.CooldownMaxSeconds {
			backoff = cfg.CooldownMaxSeconds
			break
		}
		backoff = next
	}
	e.cooldownUntil = now + int64(backoff)
	e.lastSwitchReason = fmt.Sprintf("探测仍不健康(最近%d次中%d次红色)，冷却退避至%d秒(第%d轮)",
		windowN, redCnt, backoff, e.cooldownRounds)
}

// toOKProbe 探测连胜达标后恢复 OK（按探测样本，非窗口），并清空环形缓冲，
// 避免恢复后旧的坏样本残留在窗口里立刻把渠道再判坏。
func (e *channelHealthEntry) toOKProbe(now int64) {
	e.state = healthStateOK
	e.enteredAt = now
	e.badStreak = 0
	e.probeOKStreak = 0
	e.cooldownRounds = 0
	e.cooldownUntil = 0
	// 清空窗口（重新积累），防止旧坏样本污染恢复后的判定。
	for i := range e.ring {
		e.ring[i] = 0
	}
	e.pos = 0
	e.filled = 0
	e.redCnt = 0
	e.grnCnt = 0
	e.lastSwitchReason = "探测连续健康，源渠道已恢复，切回低成本渠道"
}

// ---- 选路集成读取面 ----

// channelHealthStatus 选路用的轻量状态快照。
type channelHealthStatus struct {
	state   string
	probing bool
}

// isProbing 无副作用读当前是否处于探测态（不触发冷却惰性转换）。
func (e *channelHealthEntry) isProbing() bool {
	e.mu.Lock()
	defer e.mu.Unlock()
	return e.state == healthStateProbing
}

// status 返回选路用的轻量状态快照，并在读路径惰性推进 BAD→PROBING：
// BAD 渠道已被排除、收不到样本，只能在被查询时检查冷却是否到期。
func (e *channelHealthEntry) status(group string, channelID int) channelHealthStatus {
	e.mu.Lock()
	transitioned := false
	var prev string
	if e.state == healthStateBad && common.GetTimestamp() >= e.cooldownUntil && e.cooldownUntil > 0 {
		prev = e.state
		e.state = healthStateProbing
		e.probeOKStreak = 0
		e.enteredAt = common.GetTimestamp()
		e.lastSwitchReason = "冷却到期，开始分流探测流量检测源渠道是否恢复"
		transitioned = true
	}
	st := channelHealthStatus{state: e.state, probing: e.state == healthStateProbing}
	reason := e.lastSwitchReason
	e.mu.Unlock()

	if transitioned {
		logHealthStateTransition(group, channelID, "", prev, healthStateProbing, reason, 0, 0, 0)
	}
	return st
}

// observeProbe 处理一次“探测请求”的结果（仅 PROBING 态渠道收到探测流量时调用）。
// 探测样本量小，故按单次结果累计连胜：绿/黄 → +1，红 → 清零并退避冷却。
// 连续 RecoverOKStreak 次健康 → 恢复 OK（立即切回低成本）。
func (e *channelHealthEntry) observeProbe(cfg *operation_setting.ChannelHealthRouterSetting, group string, channelID int, lvl int8) {
	e.mu.Lock()
	if e.state != healthStateProbing {
		e.mu.Unlock()
		return
	}
	prev := e.state
	now := common.GetTimestamp()
	if lvl < 2 {
		e.probeOKStreak++
		if e.probeOKStreak >= cfg.RecoverOKStreak {
			e.toOKProbe(now)
		}
	} else {
		e.probeOKStreak = 0
		e.toBadBackoff(cfg, now, 1, 1)
	}
	newState := e.state
	reason := e.lastSwitchReason
	e.mu.Unlock()

	if newState != prev {
		logHealthStateTransition(group, channelID, "", prev, newState, reason, 0, 0, 0)
	}
}

// BuildHealthExcludeSet 为某分组+模型构造选路排除集与探测目标集。
//   - exclude：处于 BAD/PROBING 的渠道（不进正常选路池）。
//   - probeTargets：处于 PROBING 的渠道（可按概率放探测流量回去）。
//
// 仅对开启自动健康路由的分组生效；否则返回空集（不影响原生选路）。
func BuildHealthExcludeSet(group string) (exclude map[int]bool, probeTargets []int) {
	if !operation_setting.IsHealthRouterEnabledForGroup(group) {
		return nil, nil
	}
	healthStore.mu.RLock()
	prefix := group + "\x00"
	candidates := make([]*channelHealthEntry, 0)
	cids := make([]int, 0)
	for key, e := range healthStore.entries {
		if !strings.HasPrefix(key, prefix) {
			continue
		}
		cid := parseHealthKeyChannelID(key, prefix)
		if cid <= 0 {
			continue
		}
		candidates = append(candidates, e)
		cids = append(cids, cid)
	}
	healthStore.mu.RUnlock()

	for i, e := range candidates {
		st := e.status(group, cids[i]) // 可能惰性把 BAD→PROBING（冷却到期）
		if st.state == healthStateBad || st.state == healthStateProbing {
			if exclude == nil {
				exclude = make(map[int]bool)
			}
			exclude[cids[i]] = true
			if st.probing {
				probeTargets = append(probeTargets, cids[i])
			}
		}
	}
	return exclude, probeTargets
}

// MaybePickProbeChannel 以 ProbeRatio 概率从探测目标中选一个渠道放本次请求（用于
// 冷却后探测源渠道是否恢复）。返回 nil 表示本次走正常选路。
func MaybePickProbeChannel(group, modelName string, probeTargets []int) *model.Channel {
	if len(probeTargets) == 0 {
		return nil
	}
	cfg := operation_setting.GetChannelHealthRouterSetting()
	if cfg.ProbeRatio <= 0 {
		return nil
	}
	// 简单概率门：用计数器取模近似 ProbeRatio，避免引入额外随机源依赖。
	denom := int(1.0/cfg.ProbeRatio + 0.5)
	if denom < 1 {
		denom = 1
	}
	if common.GetRandomInt(denom) != 0 {
		return nil
	}
	// 轮转选一个探测目标。
	idx := int(healthProbeCounter.Add(1)) % len(probeTargets)
	cid := probeTargets[idx]
	ch, err := model.CacheGetChannel(cid)
	if err != nil || ch == nil {
		return nil
	}
	// 探测渠道必须仍能服务该分组+模型，且处于启用状态。
	if ch.Status != common.ChannelStatusEnabled || !model.IsChannelEnabledForGroupModel(group, modelName, cid) {
		return nil
	}
	return ch
}

// ShouldVetoAffinityForHealth 渠道是否因健康原因否决亲和（仅 BAD 否决）。
// 用于在亲和闸门处放弃缓存局部性、切走到健康备用。
func ShouldVetoAffinityForHealth(group string, channelID int) bool {
	if !operation_setting.IsHealthRouterEnabledForGroup(group) {
		return false
	}
	cfg := operation_setting.GetChannelHealthRouterSetting()
	if !cfg.VetoAffinityOnBad {
		return false
	}
	e := healthStore.get(group, channelID)
	st := e.status(group, channelID)
	return st.state == healthStateBad
}

// ---- 管理日志（渠道切换可察觉 + 排查证据）----

func getHealthRouterRootUserID() int {
	healthRouterRootUserOnce.Do(func() {
		var rootUser model.User
		if err := model.DB.Select("id").Where("role = ?", common.RoleRootUser).First(&rootUser).Error; err == nil {
			healthRouterRootUserID = rootUser.Id
		}
	})
	return healthRouterRootUserID
}

// logHealthStateTransition 渠道健康状态切换时写一条管理日志。
// type=管理(LogTypeManage)，归属 root 用户；admin_info 含切换原因与证据（普通用户查询会被剥离）。
func logHealthStateTransition(group string, channelID int, channelName, from, to, reason string, redCnt, grnCnt, windowN int) {
	rootID := getHealthRouterRootUserID()
	if rootID == 0 {
		return
	}

	if channelName == "" {
		if ch, err := model.CacheGetChannel(channelID); err == nil && ch != nil {
			channelName = ch.Name
		}
	}

	content := fmt.Sprintf("自动健康路由：分组[%s] 渠道#%d(%s) %s → %s",
		group, channelID, channelName, healthStateLabel(from), healthStateLabel(to))

	adminInfo := map[string]interface{}{
		"feature":      "channel_health_router",
		"event":        "state_transition",
		"group":        group,
		"channel_id":   channelID,
		"channel_name": channelName,
		"from_state":   from,
		"to_state":     to,
		"reason":       reason,
		"evidence": map[string]interface{}{
			"window_size":  windowN,
			"red_count":    redCnt,
			"green_count":  grnCnt,
			"yellow_count": windowN - redCnt - grnCnt,
		},
	}

	gopool.Go(func() {
		model.RecordLogWithAdminInfo(rootID, model.LogTypeManage, content, adminInfo)
		logger.LogInfo(nil, content+" | "+reason)
	})
}

func healthStateLabel(s string) string {
	switch s {
	case healthStateOK:
		return "健康"
	case healthStateWarn:
		return "尚可(早警)"
	case healthStateBad:
		return "降级(切走)"
	case healthStateProbing:
		return "探测中"
	default:
		return s
	}
}

// ---- stats（管理面只读）----

// ChannelHealthRouterStats 单渠道健康快照（管理接口用）。
type ChannelHealthRouterStats struct {
	Group         string `json:"group"`
	ChannelID     int    `json:"channel_id"`
	State         string `json:"state"`
	RedCount      int    `json:"red_count"`
	GreenCount    int    `json:"green_count"`
	WindowN       int    `json:"window_n"`
	CooldownUntil int64  `json:"cooldown_until"`
	Reason        string `json:"reason"`
}

// GetChannelHealthRouterStats 返回当前所有被观测渠道的健康快照（按 group, channel 排序）。
func GetChannelHealthRouterStats() []ChannelHealthRouterStats {
	healthStore.mu.RLock()
	keys := make([]string, 0, len(healthStore.entries))
	entries := make(map[string]*channelHealthEntry, len(healthStore.entries))
	for k, v := range healthStore.entries {
		keys = append(keys, k)
		entries[k] = v
	}
	healthStore.mu.RUnlock()

	sort.Strings(keys)
	out := make([]ChannelHealthRouterStats, 0, len(keys))
	for _, k := range keys {
		e := entries[k]
		idx := strings.IndexByte(k, '\x00')
		if idx < 0 {
			continue
		}
		group := k[:idx]
		cid := parseHealthKeyChannelID(k, group+"\x00")
		e.mu.Lock()
		out = append(out, ChannelHealthRouterStats{
			Group:         group,
			ChannelID:     cid,
			State:         e.state,
			RedCount:      e.redCnt,
			GreenCount:    e.grnCnt,
			WindowN:       e.filled,
			CooldownUntil: e.cooldownUntil,
			Reason:        e.lastSwitchReason,
		})
		e.mu.Unlock()
	}
	return out
}

func parseHealthKeyChannelID(key, prefix string) int {
	s := strings.TrimPrefix(key, prefix)
	n := 0
	for _, r := range s {
		if r < '0' || r > '9' {
			return 0
		}
		n = n*10 + int(r-'0')
	}
	return n
}
