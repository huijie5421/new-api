# 钱包内嵌兑换码商城设计

## 目标

在现有钱包页面中新增 CatFK 兑换码商城入口，让用户能够在钱包内浏览商城，并在需要更大浏览区域时通过新标签页打开完整商城。现有钱包主题、导航、余额统计、在线充值、兑换码提交、订单记录和邀请返利保持原样。

商城地址固定为：`https://catfk.com/shop/WWADEZ6N`。

## 范围

本次包含：

- 新增独立的“购买兑换码”卡片。
- 卡片内使用 `iframe` 加载 CatFK 商城。
- 桌面端鼠标进入内嵌窗口时显示“点击最大化”按钮。
- 点击最大化按钮，在新标签页打开固定商城地址。
- 手机端常驻显示“新标签页打开”按钮。
- 保留并复用现有兑换码输入及兑换逻辑。
- 支持加载中、加载失败和超时降级状态。
- 所有新增界面文案接入现有 i18n。

本次不包含：

- 自动读取、回传或兑换 CatFK 发出的兑换码。
- CatFK 订单与 New API 用户绑定。
- CatFK 支付成功 Webhook。
- 商品列表同步、商品价格缓存或商城反向代理。
- 修改钱包现有主题变量、导航结构、充值业务或支付接口。

## 页面结构

现有钱包页面继续使用 `SectionPageLayout`、`WalletStatsCard`、`RechargeFormCard`、`SubscriptionPlansCard` 和 `AffiliateRewardsCard`。

新增 `RedeemCodeShopCard`：

- 当 `TopUpLink` 配置为有效的 `https://catfk.com/shop/...` 地址时使用该地址；配置为空时回退到固定的 `https://catfk.com/shop/WWADEZ6N`。
- 位于现有充值区域同一内容网格中，不建立新的页面主题或顶层页签。
- 充值卡与商城卡使用现有 `TitledCard`、`Button`、CSS 主题变量和 Tailwind 响应式断点。
- 大屏布局延续钱包当前双列结构；商城卡占右侧卡片区域。
- 小屏布局自动折为单列，商城卡位于充值卡之后。
- 订阅套餐存在时继续按现有逻辑显示，不改变其可用性判断；商城卡作为钱包内容流中的独立卡片插入，避免与订阅套餐互相覆盖。

## 内嵌商城交互

### 桌面端

- iframe 使用固定最小高度，内部自行滚动。
- 用户鼠标进入 iframe 容器时，在容器中央显示轻量遮罩与“点击最大化”按钮。
- 按钮具有清晰的可访问名称，并支持键盘聚焦。
- 点击按钮使用 `target="_blank"` 和 `rel="noopener noreferrer"` 打开固定商城地址。
- 遮罩只覆盖 iframe 容器，不改变钱包其他内容。

### 手机端

- iframe 宽度使用容器的 100%，高度适合钱包纵向浏览。
- 由于触屏没有稳定悬浮状态，卡片标题区和 iframe 下方常驻“新标签页打开”按钮。
- 用户仍可在 iframe 中直接浏览和操作商城。

### 加载与降级

- iframe 加载前显示骨架或加载提示。
- iframe `load` 后移除加载提示。
- 超过设定时间仍未完成加载时，展示简短提示和“新标签页打开”按钮。
- 浏览器或远端站点拒绝嵌入时，用户仍可通过常驻链接进入商城。
- 不读取 iframe DOM、URL、Cookie 或订单内容。

## 配置与安全

- 复用现有 `TopUpLink` 管理员设置和 `/api/user/topup/info` 返回的 `topup_link` 字段。
- 前端只接受 HTTPS 链接。
- 本次不写入数据库；前端默认指向 `https://catfk.com/shop/WWADEZ6N`，生产已有的 `TopUpLink` 配置若为空也能直接显示。
- 外部打开使用 `noopener noreferrer`，避免新页面获得钱包页面的 `window.opener`。
- iframe 使用明确的 `title`，并采用满足商城付款流程所需的最小权限属性。
- 不向商城 URL 拼接用户 ID、访问令牌、余额、邮箱或其他账户数据。

## 组件边界

新建：

- `web/src/features/wallet/components/redeem-code-shop-card.tsx`
  - 负责链接校验、iframe 加载状态、悬浮/触屏外部打开入口和降级提示。
  - 不处理兑换码提交、钱包余额刷新或支付状态。

修改：

- `web/src/features/wallet/index.tsx`
  - 将 `topupInfo.topup_link` 传给商城卡并放入现有布局。
- `web/src/i18n/locales/*.json`
  - 补齐新增文案。

现有 `RechargeFormCard` 不作结构或样式修改，其中的兑换码输入框和“Get one here”降级链接继续保留。

测试：

- `web/src/features/wallet/components/__tests__/redeem-code-shop-card.test.tsx`
  - 有效 HTTPS 商城链接时渲染 iframe。
  - 空链接和非 HTTPS 链接时不渲染商城卡。
  - 外部打开链接包含 `_blank`、`noopener` 和 `noreferrer`。
  - iframe 提供可访问名称。
  - 加载完成后清除加载提示。
  - 超时后显示降级入口。
  - 桌面悬浮入口与手机常驻入口具有相同目标地址。

## 验收标准

1. 钱包现有主题颜色、排版、导航、余额卡、充值方式和兑换行为没有变化。
2. 钱包中可见新增的“购买兑换码”卡片。
3. 内嵌窗口加载 `https://catfk.com/shop/WWADEZ6N`，尺寸与确认效果图一致。
4. 桌面端鼠标进入内嵌区域时显示“点击最大化”。
5. 点击最大化或手机端外部打开按钮会在新标签页进入固定商城地址。
6. 远端商城加载异常时，外部打开入口仍保持可用。
7. 用户购买后可继续使用现有兑换码输入框完成充值。
8. 受影响测试、TypeScript 类型检查、涉及文件 lint 和前端生产构建全部通过。

## 回滚

回滚只需撤销新商城卡组件、钱包挂载点、i18n 文案和对应测试。现有 `TopUpLink` 配置字段与兑换码接口保持兼容，因此回滚不涉及数据库迁移或生产数据修改。
