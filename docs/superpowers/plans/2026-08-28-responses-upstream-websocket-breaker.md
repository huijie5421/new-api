# Responses 上游 WebSocket 透传与通道熔断实施计划

## 目标

在现有下游 Responses WebSocket 桥接基础上，增加按通道配置的上游 `ws/wss` 透传。透传仅作用于下游 WS 请求，不改变普通 HTTP/SSE；上游明确表示不支持 WS 时，当前请求立即在同一通道回退 HTTP/SSE，并将该通道 WS 透传禁用 24 小时。

## 实施步骤

1. **配置与持久化**
   - 在 `relaykit/dto/channel_settings.go` 增加 `ResponsesWSUpstreamEnabled` 和可选 `ResponsesWSUpstreamURL`，校验 URL 只允许 `ws/wss`。
   - 新增 `model/channel_responses_ws_breaker.go`，持久化通道 ID、禁用截止时间、原因码/详情、更新时间；在 `model/main.go` AutoMigrate。
   - 新增 URL 派生、状态分类和按通道半开探测的纯逻辑，便于单元测试。

2. **下游桥接标记与上游 WS 请求**
   - 在内部 POST 的 request context 写入私有 Responses WS 桥接标记。
   - 在 `relay/responses_handler.go` 中仅当标记、通道开关、Responses 模式和熔断状态均满足时尝试上游 WS。
   - 使用 `adaptor.GetRequestURL` 派生 `ws/wss` 地址，或使用通道显式覆盖地址；通过 `Authorization: Bearer <channel-key>` 建立连接，发送 `response.create`。
   - 将上游事件原样转发给桥接 writer，识别终态与 usage，并保持一次消费计费。

3. **回退与 24 小时熔断**
   - 握手 `404/405/410/426/501`、明确的 WS 不支持错误码或 close `1003` 视为不支持：记录通道熔断、重建请求体、同一次请求走现有 HTTP/SSE 链路。
   - DNS/TLS/超时/网络、鉴权、限流、5xx（不含 501）和输出后的协议错误只结束本次 WS 尝试，不触发 24 小时熔断。
   - 熔断期间其他请求直接 HTTP；截止后单通道半开探测，成功清除状态，显式不支持重新设置 24 小时。

4. **管理端配置与状态**
   - 在管理员通道编辑表单加入 WS 透传开关、覆盖 URL、当前熔断截止时间/原因展示，并补充简体中文文案；普通用户界面不展示。

5. **测试与验证**
   - 先添加 URL、分类、熔断状态和 JSON `response.create` 规范化的失败测试，再实现。
   - 使用 `httptest` WebSocket 服务覆盖成功透传、同请求 HTTP 回退、单通道隔离、24 小时后半开、普通 HTTP 不受影响和一次计费。
   - 运行 `go test ./relay/... ./controller/... ./model/...`、前端 lint/build；检查迁移、日志和回滚脚本语法后再生成部署候选。

## 验证命令

```bash
go test ./relay/... ./controller/... ./model/...
go test -race ./relay/... ./controller/...
cd web && npm run lint && npm run build
```
