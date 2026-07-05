## 2026-07-04 - Task: AIGC 工坊入口、工作台 UI 与资料库能力
### What was done
- 将 AIGC 工坊统一入口调整到顶部导航栏，名称为 `AIGC 工坊`，并移除侧边栏入口和侧边栏路径映射残留。
- 重做 `/image` 前端为创作工作台布局，保留图片生成、视频生成、电商套图三个子模块和生成结果/资料库视图。
- 图片生成改为参考目标站的“比例 + 清晰度”参数，支持自动、正方形、横屏、竖屏、4:3、3:4、3:2、2:3、4:5、5:4、21:9，以及 1K/2K/4K。
- 视频生成移除用户分辨率选择，只提交模型、提示词、参考图 URL、秒数和条数；分辨率交给后台模型/渠道配置内置。
- 补充网页登录态 AIGC 桥接接口、24 小时资料库查询与移除能力，并取消收藏类长期存储设计。
- 更新 Docker 构建代理参数和默认主题，保证本地容器使用 default 前端并能访问 `/image`。
### Testing
- `bunx eslint src/hooks/use-sidebar-config.ts src/features/aigc-workshop src/routes/_authenticated/image src/hooks/use-top-nav-links.ts src/lib/nav-modules.ts src/features/system-settings/maintenance/config.ts src/features/system-settings/maintenance/header-navigation-section.tsx src/hooks/use-sidebar-data.ts src/i18n/static-keys.ts`：通过。
- `bun run build`：通过，default 前端生产构建成功。
- `bun run typecheck`：未完全通过；失败点为既有 `src/features/channel-monitor/view/channel-monitor-view.tsx` 第 326、348 行 Base UI Select 回调类型不匹配，非本轮 AIGC 改动引入。
- `docker build --pull=false --build-arg GOPROXY=https://goproxy.cn,direct -t new-api-aigc-local:latest .`：通过，包含 default 前端构建和 Go 二进制构建。
- `docker run --rm -d --name new-api-aigc-local -p 13000:3000 -e TZ=Asia/Shanghai new-api-aigc-local:latest --log-dir /data/logs`：容器启动成功。
- `Invoke-WebRequest http://127.0.0.1:13000/image`：返回 HTTP 200。当前本地容器为全新 SQLite，`/api/status` 显示 `setup: false`，需要完成初始化/登录后才能进入认证区页面。
### Notes
- `controller/aigc_workshop.go`：新增网页登录态 AIGC 桥接控制器和资料库查询/删除逻辑。
- `router/api-router.go`：注册 `/api/aigc/*` 桥接接口。
- `model/task.go`：补充视频任务属性读取需要的字段能力。
- `web/default/src/routes/_authenticated/image/index.tsx`：新增认证区 `/image` 路由。
- `web/default/src/features/aigc-workshop/api.ts`：新增前端 AIGC 桥接接口调用。
- `web/default/src/features/aigc-workshop/constants.ts`：新增工作台模块、图片比例、清晰度和电商套图场景配置。
- `web/default/src/features/aigc-workshop/index.tsx`：重做 AIGC 工坊工作台界面和生成/资料库交互。
- `web/default/src/features/aigc-workshop/types.ts`：定义 AIGC 生成、视频任务和资料库类型，视频请求不再包含宽高。
- `web/default/src/hooks/use-top-nav-links.ts`：顶部导航增加 `AIGC 工坊`。
- `web/default/src/hooks/use-sidebar-data.ts`：移除侧边栏 AIGC 工坊入口。
- `web/default/src/hooks/use-sidebar-config.ts`：移除 `/image` 的侧边栏模块映射。
- `web/default/src/lib/nav-modules.ts`：顶部导航配置支持 `aigc` 开关和登录要求。
- `web/default/src/features/system-settings/maintenance/config.ts`：后台维护配置支持 AIGC 顶部导航项。
- `web/default/src/features/system-settings/maintenance/header-navigation-section.tsx`：后台维护页支持配置 AIGC 顶部导航项。
- `web/default/src/i18n/static-keys.ts`、`web/default/src/i18n/locales/zh.json`、`web/default/src/i18n/locales/en.json`：补充 AIGC 工坊中文文案和必要英文回退。
- `web/default/src/routeTree.gen.ts`：路由生成文件包含 `/image` 路由。
- `setting/system_setting/theme.go`：默认主题切换为 `default`，避免 `/image` 被 classic 前端接管。
- `Dockerfile`、`Dockerfile.lite`：增加可配置 `GOPROXY`，便于国内网络构建。
- `docs/aigc-workshop-integration.md`：记录入口、模型选择边界、图片/视频参数规则、桥接接口和资料库策略。
- `progress.md`：记录本轮施工、验证和回滚信息。
- 回滚方式：使用版本控制回退上述文件；若只回滚本轮 AIGC 工坊改动，可删除 `controller/aigc_workshop.go`、`web/default/src/features/aigc-workshop/`、`web/default/src/routes/_authenticated/image/`、`docs/aigc-workshop-integration.md`，并将上述修改文件恢复到本轮前版本，然后重新运行前端构建和 Docker 构建。

## 2026-07-04 - Task: AIGC 工坊资料库、视频参数和电商套图工作流修正
### What was done
- 修正资料库入口体验，在工作台左侧和结果面板中都提供明确的 `资料库` 入口，点击会刷新并切换到资料库视图。
- 将生图默认清晰度从 2K 调整为 1K，并把 AIGC 工坊的主要界面文案改为中文展示。
- 修正视频参数表达，界面按 `秒/条` 展示单条视频时长，提交请求使用 `seconds` 字段，生成条数继续使用 `n`。
- 新增网页登录态文字模型桥接接口 `/api/aigc/chat/completions`，供电商套图先调用文字模型沟通方案。
- 将电商套图升级为两段式流程：先选文字模型和生图模型，由文字模型生成套图方案；用户确认或修改后，再按场景调用生图模型执行。
- 扩展电商套图场景，从基础主图/场景/细节/横幅扩展到商品主图、白底图、场景图、细节特写、卖点图、营销横幅。
- 更新集成文档，明确电商套图工作流、视频 `seconds` 参数和新增文字模型桥接接口。
### Testing
- `bunx eslint src/features/aigc-workshop src/routes/_authenticated/image src/hooks/use-top-nav-links.ts src/lib/nav-modules.ts`：通过。
- `bun run build`：通过，default 前端生产构建成功。
- `go test ./controller ./router -run '^$'`：通过。
- `bun run typecheck`：仍未完全通过；失败点仍为既有 `src/features/channel-monitor/view/channel-monitor-view.tsx` 第 326、348 行 Base UI Select 回调类型不匹配，非本轮 AIGC 改动引入。
- `docker build --pull=false --build-arg GOPROXY=https://goproxy.cn,direct -t new-api-aigc-local:latest .`：通过。
- 重启 `new-api-aigc-local` 容器后，`Invoke-WebRequest http://127.0.0.1:13000/image` 返回 HTTP 200。
### Notes
- `controller/aigc_workshop.go`：新增 AIGC 登录态文字模型桥接处理函数。
- `router/api-router.go`：注册 `/api/aigc/chat/completions`。
- `web/default/src/features/aigc-workshop/api.ts`：新增文字模型桥接 API 调用。
- `web/default/src/features/aigc-workshop/types.ts`：新增文字模型请求/响应类型，并将视频请求时长字段改为 `seconds`。
- `web/default/src/features/aigc-workshop/constants.ts`：改为中文模块/参数文案，补文字模型筛选提示和扩展电商场景。
- `web/default/src/features/aigc-workshop/index.tsx`：重做资料库入口、默认 1K、生图/视频参数、电商套图两段式工作流。
- `docs/aigc-workshop-integration.md`：同步文字模型桥接、电商工作流和视频参数边界。
- `progress.md`：记录本轮施工、验证和回滚信息。
- 回滚方式：使用版本控制恢复上述文件到本轮前状态；如只撤销本轮，可保留上一轮 AIGC 基础能力，回退 `/api/aigc/chat/completions` 路由、前端文字模型调用、电商套图两段式 UI 和 `seconds` 请求字段变更。

## 2026-07-04 - Task: AIGC 工坊电商套图多轮对话、素材复用和执行队列打磨
### What was done
- 新增会话级素材池，支持上传图片/视频、本次生成结果回流、资料库素材拖拽复用；本地上传素材只保存在当前浏览器会话，不写入后端长期存储。
- 新增前端模型预设，用于快速切换文字模型、生图模型、视频模型、比例、清晰度和电商套图场景；实际渠道仍由后台模型名和渠道分发配置决定。
- 将电商套图升级为多轮连续聊天体验，用户可持续向文字模型补充卖点、平台限制、模特要求、文案留白和参考素材。
- 新增可编辑方案卡片，文字模型输出会沉淀为可直接修改的套图方案，素材可拖入方案卡片作为参考。
- 新增一键执行队列，电商套图按选中场景并发提交生图请求，并展示等待中、执行中、已完成或失败状态。
- 顶部导航入口显示统一调整为 `AIGC工坊`。
### Testing
- `bunx prettier --write src/features/aigc-workshop/index.tsx src/hooks/use-top-nav-links.ts src/i18n/static-keys.ts src/i18n/locales/zh.json`：通过。
- `bunx eslint src/features/aigc-workshop src/routes/_authenticated/image src/hooks/use-top-nav-links.ts src/lib/nav-modules.ts`：通过。
- `bun run build`：通过，default 前端生产构建成功。
- `go test ./controller ./router -run '^$'`：通过。
- `bun run typecheck`：未完全通过；当前只剩既有 `src/features/channel-monitor/view/channel-monitor-view.tsx` 第 326、348 行 Base UI Select 回调类型不匹配，非本轮 AIGC 改动引入。
- `docker build --pull=false --build-arg GOPROXY=https://goproxy.cn,direct -t new-api-aigc-local:latest .`：通过。
- 重启 `new-api-aigc-local` 容器后，`Invoke-WebRequest http://127.0.0.1:13000/image` 返回 HTTP 200。
### Notes
- `web/default/src/features/aigc-workshop/index.tsx`：新增素材池、拖拽复用、模型预设、多轮聊天、方案卡片和并发执行队列。
- `web/default/src/hooks/use-top-nav-links.ts`：顶部导航入口名称改为 `AIGC工坊`。
- `web/default/src/i18n/static-keys.ts`：补充 AIGC 工坊入口和模型预设动态翻译键。
- `web/default/src/i18n/locales/zh.json`：补充 `AIGC工坊` 中文翻译键。
- `docs/aigc-workshop-integration.md`：记录会话素材池、多轮聊天、方案卡片、执行队列和模型预设边界。
- `progress.md`：记录本轮施工、验证和回滚信息。
- 回滚方式：使用版本控制恢复上述文件到本轮前状态；如只撤销本轮，可保留上一轮 AIGC 基础能力，回退会话素材池、模型预设、多轮聊天、方案卡片、执行队列和导航命名调整。

## 2026-07-05 - Task: AIGC 工坊独立布局、资料库修复和原站遗漏补齐
### What was done
- 详细检查原站 `/image` 与 `/canvas` 的可见产品结构，确认原站是 AIGC 独立 Dock，而不是控制台侧边栏内页。
- 将 `/image` 和 `/canvas` 改为登录态独立工作区布局，进入后不显示控制台侧边栏、控制台搜索和配置抽屉。
- 将 AIGC 内部左侧入口改为 `AIGC工坊`、`无限画布`、`提示词广场`、`音乐创作`、`我的资产`；音乐创作保持内测锁定。
- 修正资料库打开体验，把资料库升级为 `我的资产` 独立工作区，并兼容后端分页响应字段，避免资料库数据解析失败。
- 新增 `/canvas` 路由和会话级无限画布工作区，支持新建本地画布、查看会话素材和生成结果。
- 新增提示词广场工作区，支持搜索常用图片、视频、电商提示词，并一键带回工坊。
- 更新集成文档，记录原站对比后的已补齐点和仍需后端字段确认的边界。
### Testing
- `bunx prettier --write src/features/aigc-workshop/api.ts src/features/aigc-workshop/index.tsx src/components/layout/components/authenticated-layout.tsx src/routes/_authenticated/canvas/index.tsx`：通过。
- `bunx eslint src/features/aigc-workshop src/routes/_authenticated/image src/routes/_authenticated/canvas src/components/layout/components/authenticated-layout.tsx src/hooks/use-top-nav-links.ts src/lib/nav-modules.ts`：通过。
- `bun run build`：通过，default 前端生产构建成功，`/canvas` 已写入 `routeTree.gen.ts`。
- `bun run typecheck`：未完全通过；当前只剩既有 `src/features/channel-monitor/view/channel-monitor-view.tsx` 第 326、348 行 Base UI Select 回调类型不匹配，非本轮 AIGC 改动引入。
### Notes
- `web/default/src/components/layout/components/authenticated-layout.tsx`：为 `/image` 和 `/canvas` 增加 AIGC 独立布局分支。
- `web/default/src/features/aigc-workshop/api.ts`：兼容资料库分页响应字段，避免资产数据无法解析。
- `web/default/src/features/aigc-workshop/index.tsx`：新增 AIGC 专属 Dock、我的资产、无限画布和提示词广场工作区，并修正资料库打开方式。
- `web/default/src/routes/_authenticated/canvas/index.tsx`：新增认证区 `/canvas` 路由。
- `web/default/src/routeTree.gen.ts`：路由生成文件包含 `/canvas`。
- `docs/aigc-workshop-integration.md`：补充独立布局、原站对比和遗漏补齐说明。
- `progress.md`：记录本轮施工、验证和回滚信息。
- 回滚方式：使用版本控制恢复上述文件到本轮前状态；如只撤销本轮，可回退 `/canvas` 路由、AIGC 独立布局分支、AIGC 专属 Dock、我的资产/画布/提示词广场工作区和资料库响应兼容逻辑。

## 2026-07-05 - Task: AIGC 工坊本地容器验证补充
### What was done
- 补充验证 AIGC 工坊后端控制器与路由包的 Go 编译入口。
- 使用最新 `new-api-aigc-local:latest` 镜像重启本地 Docker 容器，并确认 `/image` 与 `/canvas` 两个独立入口都能访问。
### Testing
- `go test ./controller ./router -run '^$'`：通过。
- `docker run --rm -d --name new-api-aigc-local -p 13000:3000 -e TZ=Asia/Shanghai new-api-aigc-local:latest --log-dir /data/logs`：容器启动成功。
- `Invoke-WebRequest http://127.0.0.1:13000/image`：返回 HTTP 200。
- `Invoke-WebRequest http://127.0.0.1:13000/canvas`：返回 HTTP 200。
### Notes
- `progress.md`：追加本地容器与路由访问验证结果。
- 回滚方式：若只撤销本条记录，可从 `progress.md` 末尾删除本节；运行中的本地验证容器可用 `docker stop new-api-aigc-local` 停止，不影响仓库代码。

## 2026-07-05 - Task: AIGC 无限画布详情路由补齐
### What was done
- 对齐原站无限画布的详情入口，新增 `/canvas/{canvas_id}` 前端路由。
- 点击画布卡片会进入对应画布详情路径，并保持 AIGC 独立布局，不显示控制台侧边栏。
- 更新集成文档，明确 `/canvas` 与 `/canvas/{canvas_id}` 的入口边界。
### Testing
- `bunx prettier --write src/features/aigc-workshop/index.tsx src/components/layout/components/authenticated-layout.tsx src/routes/_authenticated/canvas/index.tsx src/routes/_authenticated/canvas/$canvasId.tsx`：通过。
- `bunx eslint src/features/aigc-workshop src/routes/_authenticated/image src/routes/_authenticated/canvas src/components/layout/components/authenticated-layout.tsx src/hooks/use-top-nav-links.ts src/lib/nav-modules.ts`：通过。
- `bun run build`：通过，default 前端生产构建成功，`/canvas/$canvasId` 已写入 `routeTree.gen.ts`。
- `bun run typecheck`：未完全通过；当前仍为既有 `src/features/channel-monitor/view/channel-monitor-view.tsx` 第 326、348 行 Base UI Select 回调类型不匹配，非 AIGC 工坊改动引入。
- `go test ./controller ./router -run '^$'`：通过。
- `bunx prettier --check src/features/aigc-workshop/index.tsx src/components/layout/components/authenticated-layout.tsx src/routes/_authenticated/canvas/index.tsx src/routes/_authenticated/canvas/$canvasId.tsx ../../docs/aigc-workshop-integration.md`：通过。
- `docker build --pull=false --build-arg GOPROXY=https://goproxy.cn,direct -t new-api-aigc-local:latest .`：通过。
- 重启 `new-api-aigc-local` 容器后，`/image`、`/canvas`、`/canvas/default` 均返回 HTTP 200。
### Notes
- `web/default/src/components/layout/components/authenticated-layout.tsx`：让 `/canvas/*` 动态路径也走 AIGC 独立布局。
- `web/default/src/features/aigc-workshop/index.tsx`：画布卡片支持跳转详情路径，并高亮当前画布。
- `web/default/src/routes/_authenticated/canvas/$canvasId.tsx`：新增画布详情路由。
- `web/default/src/routeTree.gen.ts`：路由生成文件包含 `/canvas/$canvasId`。
- `docs/aigc-workshop-integration.md`：补充无限画布详情路由说明。
- `progress.md`：记录本轮施工、验证和回滚信息。
- 回滚方式：使用版本控制恢复上述文件到本轮前状态；如只撤销本轮，可删除 `web/default/src/routes/_authenticated/canvas/$canvasId.tsx`，回退画布卡片跳转和 `/canvas/*` 独立布局匹配，再重新运行前端构建和 Docker 构建。

## 2026-07-05 - Task: AIGC 工坊按原站 /image 创作页纠偏
### What was done
- 重新按登录态 `https://cdn.aipaiai.cn/image` 可见页面核对产品结构，明确目标是 `/image` 创作页，不是首页或外围功能页。
- 将 `/image` 主工作台从控制台式多栏表单改为原站式居中创作页：柔和彩色背景、浮动 Dock、工坊标题、模式胶囊 Tab、生成面板和“我的 / 模板”结果区。
- 图片生成对齐原站首屏参数：提示词、参考图上传、比例、图片模型、1K/2K/4K、数量、更多设置、预计费用和开始生成。
- 视频生成对齐原站首屏参数：首帧/尾帧、多参考图、固定 9:16、视频模型、秒/条、条数、更多设置和生成视频；分辨率仍不提供给用户选择。
- 电商套图首屏改为一句话规划入口，保留比例、图片模型、清晰度、规划模型和开始编辑；多轮沟通、方案卡片和执行队列移动到开始编辑后的工作区。
- AIGC 独立布局顶部补回站点级导航，但仍不显示控制台侧边栏、控制台搜索和配置抽屉。
- 更新集成文档，说明 `/image` 主工作台按原站创作页复刻，资料库/画布/提示词仅作为 Dock 入口。
### Testing
- `bunx prettier --write src/features/aigc-workshop/index.tsx src/components/layout/components/authenticated-layout.tsx`：通过。
- `bunx eslint src/features/aigc-workshop src/routes/_authenticated/image src/routes/_authenticated/canvas src/components/layout/components/authenticated-layout.tsx src/hooks/use-top-nav-links.ts src/lib/nav-modules.ts`：通过。
- `bun run build`：通过，default 前端生产构建成功。
- `bun run typecheck`：未完全通过；当前仍为既有 `src/features/channel-monitor/view/channel-monitor-view.tsx` 第 326、348 行 Base UI Select 回调类型不匹配，非 AIGC 工坊改动引入。
- `go test ./controller ./router -run '^$'`：通过。
- `docker build --pull=false --build-arg GOPROXY=https://goproxy.cn,direct -t new-api-aigc-local:latest .`：通过。
- 重启 `new-api-aigc-local` 容器后，`/image`、`/canvas`、`/canvas/default` 均返回 HTTP 200。
### Notes
- `web/default/src/features/aigc-workshop/index.tsx`：重构 `/image` 首屏为原站式创作页，删除本轮不再使用的旧控制台表单组件，并调整电商规划入口。
- `web/default/src/components/layout/components/authenticated-layout.tsx`：AIGC 独立布局补回站点顶部导航，同时继续隐藏控制台侧边栏。
- `docs/aigc-workshop-integration.md`：补充 `/image` 创作页复刻边界与原站对比说明。
- `progress.md`：记录本轮施工、验证和回滚信息。
- 回滚方式：使用版本控制恢复上述文件到本轮前状态；如只撤销本轮，可回退 `/image` 首屏重构、AIGC 独立顶部导航调整和文档补充，然后重新运行前端构建与 Docker 构建。

## 2026-07-05 - Task: AIGC 工坊控件生效性核对与比例面板补齐
### What was done
- 将图片和电商套图的比例选择从普通系统下拉框改为专用弹层面板，常用比例以卡片网格展示。
- 新增自定义分辨率能力，支持输入 256 到 4096 像素的宽高；选择自定义后，图片生成和电商套图都会把该宽高作为最终 `size` 提交。
- 核对首屏控件状态，移除无效的模型预设残留参数，把没有后端能力支撑的更多设置开关改为禁用说明，避免出现可点击但无实际效果的控件。
- 将视频参考模式写入 `metadata.reference_mode`，让“首帧/尾帧”和“多参考图”选择能进入请求上下文。
- 修正电商套图执行条件，不再依赖页面上不存在的“商品名称”隐藏字段，方案生成后可按当前电商需求文本进入执行队列。
- 更新集成文档，补充控件生效状态、自定义分辨率边界和仍未接入的模板/音乐/高级设置能力。
### Testing
- `bunx prettier --write src/features/aigc-workshop/index.tsx src/features/aigc-workshop/constants.ts`：通过。
- `bunx eslint src/features/aigc-workshop src/routes/_authenticated/image src/routes/_authenticated/canvas src/components/layout/components/authenticated-layout.tsx src/hooks/use-top-nav-links.ts src/lib/nav-modules.ts`：通过。
- `bun run build`：通过，default 前端生产构建成功。
- `bun run typecheck`：未完全通过；当前仍为既有 `src/features/channel-monitor/view/channel-monitor-view.tsx` 第 326、348 行 Base UI Select 回调类型不匹配，非 AIGC 工坊改动引入。
- `docker build --pull=false --build-arg GOPROXY=https://goproxy.cn,direct -t new-api-aigc-local:latest .`：通过。
- 使用新镜像重启 `new-api-aigc-local` 容器后，`Invoke-WebRequest http://127.0.0.1:13000/image` 返回 HTTP 200，`Invoke-WebRequest http://127.0.0.1:13000/canvas` 返回 HTTP 200。
- 未实际点击生成付费任务；本轮验证到前端构建、容器路由和请求参数接线层面。
### Notes
- `web/default/src/features/aigc-workshop/constants.ts`：新增 `custom` 图片比例项，用于自定义分辨率。
- `web/default/src/features/aigc-workshop/index.tsx`：新增比例弹层、自定义宽高状态、最终 `size` 计算、禁用态高级开关、视频参考模式 metadata 和电商套图执行条件修复。
- `docs/aigc-workshop-integration.md`：记录自定义分辨率、控件生效状态和未接入能力边界。
- `progress.md`：记录本轮施工、验证和回滚信息。
- 回滚方式：使用版本控制恢复上述文件到本轮前状态；如只撤销本轮，可回退比例弹层、自定义宽高、禁用态开关、视频 metadata 和电商执行条件修复，然后重新运行前端构建与 Docker 构建。

## 2026-07-05 - Task: AIGC 工坊滚动、素材压缩与固定参数修复
### What was done
- 修复 AIGC 独立布局的滚动高度链路，让 `/image` 主内容区在固定顶部导航下使用自己的纵向滚动容器。
- 给比例弹层增加最大高度和内部滚动，避免下拉面板内容超过视口后无法向下滚动。
- 将“超 8MB 自动压缩”从文案改为真实图片上传处理：图片超过 8MB 时在浏览器端用 canvas 压缩为 JPEG 后进入会话素材池。
- 明确本地视频素材超过 8MB 不做浏览器端转码，会提示用户先压缩后上传，避免静默制造超大 data URL。
- 开启“固定参数”能力，前端可设置固定随机种子 `seed`；图片生成、电商套图和视频生成会在开启时提交该参数。
- 后端图片请求 DTO 保留 `seed`，并为 Ali、SiliconFlow、Jimeng、Replicate 图像适配器补充 seed 映射。
- 更新集成文档，记录图片压缩范围、固定 seed 生效边界和桥接接口参数变化。
### Testing
- `bunx prettier --write src/features/aigc-workshop/index.tsx src/features/aigc-workshop/types.ts src/components/layout/components/authenticated-layout.tsx`：通过。
- `gofmt -w dto/openai_image.go relay/channel/ali/image.go relay/channel/siliconflow/dto.go relay/channel/siliconflow/adaptor.go relay/channel/jimeng/adaptor.go relay/channel/replicate/adaptor.go`：通过。
- `bunx eslint src/features/aigc-workshop src/routes/_authenticated/image src/routes/_authenticated/canvas src/components/layout/components/authenticated-layout.tsx src/hooks/use-top-nav-links.ts src/lib/nav-modules.ts`：通过。
- `bun run build`：通过，default 前端生产构建成功。
- `go test ./dto ./relay/channel/ali ./relay/channel/siliconflow ./relay/channel/jimeng ./relay/channel/replicate -run '^$'`：通过。
- `go test ./controller ./router -run '^$'`：通过。
- `bun run typecheck`：未完全通过；当前仍为既有 `src/features/channel-monitor/view/channel-monitor-view.tsx` 第 326、348 行 Base UI Select 回调类型不匹配，非 AIGC 工坊改动引入。
- `docker build --pull=false --build-arg GOPROXY=https://goproxy.cn,direct -t new-api-aigc-local:latest .`：通过。
- 使用新镜像重启 `new-api-aigc-local` 容器后，`Invoke-WebRequest http://127.0.0.1:13000/image` 返回 HTTP 200，`Invoke-WebRequest http://127.0.0.1:13000/canvas` 返回 HTTP 200。
- `git diff --check`：通过；仅提示工作区既有 Dockerfile 换行转换警告。
### Notes
- `web/default/src/components/layout/components/authenticated-layout.tsx`：修复 AIGC 独立布局子容器的 flex/overflow 高度链路。
- `web/default/src/features/aigc-workshop/index.tsx`：新增图片压缩、固定 seed UI、生成请求 seed 接线，并修复页面与比例弹层滚动。
- `web/default/src/features/aigc-workshop/types.ts`：图片和视频生成 payload 增加可选 `seed`。
- `dto/openai_image.go`：图片生成请求 DTO 增加可选 `seed`。
- `relay/channel/ali/image.go`：Ali 图片参数映射固定 seed。
- `relay/channel/siliconflow/dto.go`：SiliconFlow 图片 seed 改为指针，保留显式 seed。
- `relay/channel/siliconflow/adaptor.go`：SiliconFlow 图片参数映射固定 seed。
- `relay/channel/jimeng/adaptor.go`：即梦图片参数映射固定 seed。
- `relay/channel/replicate/adaptor.go`：Replicate/Flux 图片输入映射固定 seed。
- `docs/aigc-workshop-integration.md`：同步素材压缩、固定 seed 和桥接接口说明。
- `progress.md`：记录本轮施工、验证和回滚信息。
- 回滚方式：使用版本控制恢复上述文件到本轮前状态；如只撤销本轮，可回退 AIGC 滚动容器、图片压缩、固定 seed UI、`seed` DTO/适配器映射和文档补充，然后重新运行前端构建、Go 编译测试与 Docker 构建。
## 2026-07-05 - Task: AIGC 工坊生产分组模型绑定与免 Key 计费修正

### What was done
- 将 AIGC 工坊模型来源改为后端按生产分组读取，默认图片绑定 `GPT生图专用`、`AzGPT生图`、`Gemini`，视频绑定 `即梦`，电商规划文字模型绑定 `GPT PLUS号池`、`GPT PRO号池`、`CCMAX极速版`。
- 新增 AIGC 分类模型接口和提交前分组校验，前端只提交后端返回的模型分组，后端校验用户分组权限和生产能力映射后再进入渠道分发。
- 修正网页登录态免 API Key 桥接的预扣逻辑：临时 token 不查 token key，不扣 token 表余额，但继续按目标分组走用户钱包/订阅资金源计费。
- 按运维记录修正即梦/Sora 视频请求：固定 15 秒模型实际提交 `seconds=1`，视频条数拆成多次独立任务，不再透传上游 `n`；视频参考图改用 `input_reference`。

### Testing
- `go test ./service -run TestPreConsumeTokenQuotaSkipsTokenlessLoginBridge`：通过。
- `go test ./controller ./router -run '^$'`：通过。
- `bunx eslint src/features/aigc-workshop src/routes/_authenticated/image src/routes/_authenticated/canvas`：通过。
- `bunx prettier --check src/features/aigc-workshop/api.ts src/features/aigc-workshop/types.ts src/features/aigc-workshop/index.tsx`：通过。
- `bun run typecheck`：未完全通过；仍为既有 `src/features/channel-monitor/view/channel-monitor-view.tsx` 第 326、348 行 Base UI Select 回调类型不匹配，非本轮 AIGC 改动引入。
- `go test ./controller ./router`：未完全通过；触发既有 `TestListModelsTokenLimitIncludesTieredBillingModel` 失败，包编译已通过 `-run '^$'` 验证。

### Notes
- `controller/aigc_workshop.go`：新增 AIGC 模型分组配置、分类模型接口、提交前模型/分组校验，并让桥接临时 token 使用目标 AIGC 分组。
- `router/api-router.go`：将 AIGC 分组绑定中间件接入提交路由，并新增 `/api/aigc/models`。
- `service/quota.go`：允许无持久化 token 的网页登录态桥接跳过 token 表预扣，保留用户钱包/订阅扣费。
- `service/quota_tokenless_test.go`：新增免 Key 桥接预扣单元测试。
- `web/default/src/features/aigc-workshop/api.ts`：新增 AIGC 模型接口调用，并通过 `X-AIGC-Group` 请求头提交绑定分组。
- `web/default/src/features/aigc-workshop/types.ts`：新增 AIGC 模型分类响应类型，并收窄视频生成 payload。
- `web/default/src/features/aigc-workshop/index.tsx`：模型下拉改用后端分类模型；图片、视频、电商规划请求按绑定分组提交；视频固定时长与多任务提交逻辑修正。
- `docs/aigc-workshop-integration.md`：同步生产分组绑定、固定时长视频请求和免 Key 计费说明。
- `progress.md`：追加本轮施工记录。
- 回滚方式：使用版本控制恢复上述文件；如只撤销本轮，可回退 `/api/aigc/models`、`AigcWorkshopModelBinding`、免 Key token 预扣跳过逻辑、前端分组模型选择和视频 payload 修正，再重新运行后端编译、前端 eslint/typecheck 与 Docker 构建。

## 2026-07-05 - Task: AIGC 工坊生产分组绑定补充构建验证

### What was done
- 补齐 default 与 classic 两套前端生产构建产物后，重新验证后端全包编译。
- 使用当前 Dockerfile 构建本地镜像，并以临时容器运行验证 `/image` 与 `/canvas` 入口。
- 检查 `/api/aigc/models` 路由存在性，确认未登录时返回鉴权拦截，符合网页登录态接口预期。

### Testing
- `bun run build`（`web/default`）：通过。
- `bun run build`（`web/classic`）：通过。
- `go test ./... -run '^$'`：通过。
- `docker build --pull=false --build-arg GOPROXY=https://goproxy.cn,direct -t new-api-aigc-local:latest .`：通过。
- `docker run --rm -d --name new-api-aigc-local -p 13000:3000 -e TZ=Asia/Shanghai new-api-aigc-local:latest --log-dir /data/logs`：通过，容器启动成功。
- `Invoke-WebRequest http://127.0.0.1:13000/image`：返回 HTTP 200。
- `Invoke-WebRequest http://127.0.0.1:13000/canvas`：返回 HTTP 200。
- `curl.exe -i http://127.0.0.1:13000/api/aigc/models`：返回 HTTP 401，符合未登录访问 AIGC 模型接口的鉴权预期。
- `bun run typecheck`：未完全通过；仍为既有 `src/features/channel-monitor/view/channel-monitor-view.tsx` 第 326、348 行 Base UI Select 回调类型不匹配，非本轮 AIGC 工坊改动引入。

### Notes
- `progress.md`：追加本轮补充构建、容器运行和路由鉴权验证记录。
- 回滚方式：只需使用版本控制回退本次 `progress.md` 追加段落；本轮未改动业务代码。

## 2026-07-05 - Task: AIGC 工坊视频模型分辨率与时长规则修正

### What was done
- 视频模型列表增加后端识别出的分辨率信息，按模型名中的 `480p`、`720p`、`1080p` 展示为 `480P`、`720P`、`1080P`。
- 视频固定时长判断改为识别模型名中的 `15s`；固定 15 秒模型在前端只允许选择条数，并按每条 15 秒展示和估算。
- 普通视频模型的秒数选择改为 `5s`、`8s`、`10s`、`15s`，默认 5 秒；只有无固定时长模型才显示该选择。
- 生成结果 meta 同步展示模型分辨率和最终展示时长，避免固定模型仍显示旧的可选秒数。
- 更新 AIGC 集成文档，明确视频分辨率、固定时长和可选秒数规则。

### Testing
- `gofmt -w controller\aigc_workshop.go controller\aigc_workshop_test.go`：通过。
- `bunx prettier --write src/features/aigc-workshop/index.tsx src/features/aigc-workshop/types.ts`：通过。
- `go test ./controller -run 'TestDetect(FixedVideoDurationSeconds|VideoResolution)'`：通过。
- `go test ./controller ./router -run '^$'`：通过。
- `bunx eslint src/features/aigc-workshop src/routes/_authenticated/image src/routes/_authenticated/canvas`：通过。
- `bun run build`（`web/default`）：通过。
- `go test ./... -run '^$'`：通过；首次与前端构建并行执行时因 `web/default/dist` 被构建过程重写导致 embed 文件短暂缺失，构建完成后单独重跑通过。
- `bunx prettier --check src/features/aigc-workshop/index.tsx src/features/aigc-workshop/types.ts`：通过。
- `bun run typecheck`：未完全通过；仍为既有 `src/features/channel-monitor/view/channel-monitor-view.tsx` 第 326、348 行 Base UI Select 回调类型不匹配，非本轮 AIGC 工坊改动引入。

### Notes
- `controller/aigc_workshop.go`：视频模型 option 增加分辨率字段，并按模型名识别 `480P/720P/1080P` 与固定 `15s`。
- `controller/aigc_workshop_test.go`：新增视频分辨率和固定 15 秒识别单元测试。
- `web/default/src/features/aigc-workshop/types.ts`：AIGC 模型 option 增加可选 `resolution` 字段。
- `web/default/src/features/aigc-workshop/index.tsx`：视频控制条改为固定模型只选条数、普通模型选 `5/8/10/15` 秒，并同步预计费用和结果 meta。
- `docs/aigc-workshop-integration.md`：记录视频分辨率和时长规则。
- `progress.md`：追加本轮施工、验证和回滚信息。
- 回滚方式：使用版本控制恢复上述文件；如只撤销本轮，可回退 `resolution` 字段、视频模型名解析、前端视频秒数选项和文档补充，然后重新运行后端测试、前端 lint/build 与 Go 编译检查。

## 2026-07-05 - Task: AIGC 工坊视频规则补充容器验证

### What was done
- 使用包含视频分辨率和固定时长规则修正的最新代码重新构建本地 Docker 镜像。
- 重启 `new-api-aigc-local` 本地容器，让 `13000` 端口页面更新到本轮版本。

### Testing
- `docker build --pull=false --build-arg GOPROXY=https://goproxy.cn,direct -t new-api-aigc-local:latest .`：通过。
- `docker run --rm -d --name new-api-aigc-local -p 13000:3000 -e TZ=Asia/Shanghai new-api-aigc-local:latest --log-dir /data/logs`：通过，容器启动成功。
- `Invoke-WebRequest http://127.0.0.1:13000/image`：返回 HTTP 200。
- `Invoke-WebRequest http://127.0.0.1:13000/canvas`：返回 HTTP 200。

### Notes
- `progress.md`：追加本轮 Docker 构建与本地容器路由验证记录。
- 回滚方式：只需使用版本控制回退本次 `progress.md` 追加段落；本轮未新增业务代码改动。

## 2026-07-05 - Task: 修复 AIGC 工坊提交请求 403

### What was done
- 排查生产日志，确认 `/api/aigc/models` 登录态可正常返回，但图片和电商规划提交在进入 relay 前返回 403。
- 修复 AIGC 工坊提交链路：在 `Distribute` 中间件执行前加载用户缓存、写入用户分组，并创建网页登录态免 Key 临时 token 上下文。
- 保留 access token 禁用边界，AIGC 工坊仍只支持网页登录态，不支持直接用 access token 发起。

### Testing
- `gofmt -w controller\aigc_workshop.go`：通过。
- `go test ./controller ./router ./service -run 'TestDetect(FixedVideoDurationSeconds|VideoResolution)|TestPreConsumeTokenQuotaSkipsTokenlessLoginBridge|^$'`：通过。
- `go test ./... -run '^$'`：通过。

### Notes
- `controller/aigc_workshop.go`：将 AIGC 临时 token 初始化提前到提交路由的模型分组绑定中间件内，确保模型限权、分组计费和渠道分发在进入 relay 前看到正确上下文。
- `progress.md`：追加本轮排查、修复、验证和回滚信息。
- 回滚方式：使用版本控制恢复上述文件；如只撤销本轮，可回退 `AigcWorkshopModelBinding` 中提前初始化用户缓存和临时 token 的逻辑，然后重新运行后端编译检查。
