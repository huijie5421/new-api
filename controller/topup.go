package controller

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting"
	"github.com/QuantumNous/new-api/setting/operation_setting"

	"github.com/Calcium-Ion/go-epay/epay"
	"github.com/gin-gonic/gin"
	"github.com/samber/lo"
	"github.com/shopspring/decimal"
)

func GetTopUpInfo(c *gin.Context) {
	complianceConfirmed := operation_setting.IsPaymentComplianceConfirmed()

	// 获取支付方式
	payMethods := operation_setting.PayMethods
	if !complianceConfirmed {
		payMethods = []map[string]string{}
	}

	// 如果启用了 Stripe 支付，添加到支付方法列表
	if isStripeTopUpEnabled() {
		// 检查是否已经包含 Stripe
		hasStripe := false
		for _, method := range payMethods {
			if method["type"] == "stripe" {
				hasStripe = true
				break
			}
		}

		if !hasStripe {
			stripeMethod := map[string]string{
				"name":      "Stripe",
				"type":      "stripe",
				"color":     "rgba(var(--semi-purple-5), 1)",
				"min_topup": strconv.Itoa(setting.StripeMinTopUp),
			}
			payMethods = append(payMethods, stripeMethod)
		}
	}

	// Waffo Pancake displayed above the legacy Waffo gateway.
	enableWaffoPancake := isWaffoPancakeTopUpEnabled()
	if enableWaffoPancake {
		hasWaffoPancake := false
		for _, method := range payMethods {
			if method["type"] == model.PaymentMethodWaffoPancake {
				hasWaffoPancake = true
				break
			}
		}

		if !hasWaffoPancake {
			payMethods = append(payMethods, map[string]string{
				"name":      "Waffo Pancake",
				"type":      model.PaymentMethodWaffoPancake,
				"color":     "rgba(var(--semi-orange-5), 1)",
				"min_topup": strconv.Itoa(setting.WaffoPancakeMinTopUp),
			})
		}
	}

	// 如果启用了 Waffo 支付，添加到支付方法列表
	enableWaffo := isWaffoTopUpEnabled()
	if enableWaffo {
		hasWaffo := false
		for _, method := range payMethods {
			if method["type"] == model.PaymentMethodWaffo {
				hasWaffo = true
				break
			}
		}

		if !hasWaffo {
			waffoMethod := map[string]string{
				"name":      "Waffo (Global Payment)",
				"type":      model.PaymentMethodWaffo,
				"color":     "rgba(var(--semi-blue-5), 1)",
				"min_topup": strconv.Itoa(setting.WaffoMinTopUp),
			}
			payMethods = append(payMethods, waffoMethod)
		}
	}

	data := gin.H{
		"enable_online_topup":              isEpayTopUpEnabled(),
		"enable_stripe_topup":              isStripeTopUpEnabled(),
		"enable_creem_topup":               isCreemTopUpEnabled(),
		"enable_waffo_topup":               enableWaffo,
		"enable_waffo_pancake_topup":       enableWaffoPancake,
		"enable_redemption":                complianceConfirmed,
		"payment_compliance_confirmed":     complianceConfirmed,
		"payment_compliance_terms_version": operation_setting.CurrentComplianceTermsVersion,
		"waffo_pay_methods": func() interface{} {
			if enableWaffo {
				return setting.GetWaffoPayMethods()
			}
			return nil
		}(),
		"creem_products":          setting.CreemProducts,
		"pay_methods":             payMethods,
		"min_topup":               operation_setting.MinTopUp,
		"stripe_min_topup":        setting.StripeMinTopUp,
		"waffo_min_topup":         setting.WaffoMinTopUp,
		"waffo_pancake_min_topup": setting.WaffoPancakeMinTopUp,
		"amount_options":          operation_setting.GetPaymentSetting().AmountOptions,
		"discount":                operation_setting.GetPaymentSetting().AmountDiscount,
		"topup_link":              common.TopUpLink,
	}
	common.ApiSuccess(c, data)
}

type EpayRequest struct {
	Amount        int64  `json:"amount"`
	PaymentMethod string `json:"payment_method"`
}

type AmountRequest struct {
	Amount int64 `json:"amount"`
}

func GetEpayClient() *epay.Client {
	if operation_setting.PayAddress == "" || operation_setting.EpayId == "" || operation_setting.EpayKey == "" {
		return nil
	}
	withUrl, err := epay.NewClient(&epay.Config{
		PartnerID: operation_setting.EpayId,
		Key:       operation_setting.EpayKey,
	}, operation_setting.PayAddress)
	if err != nil {
		return nil
	}
	return withUrl
}

func getPayMoney(amount int64, group string) float64 {
	dAmount := decimal.NewFromInt(amount)
	// 充值金额以“展示类型”为准：
	// - USD/CNY: 前端传 amount 为金额单位；TOKENS: 前端传 tokens，需要换成 USD 金额
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		dAmount = dAmount.Div(dQuotaPerUnit)
	}

	topupGroupRatio := common.GetTopupGroupRatio(group)
	if topupGroupRatio == 0 {
		topupGroupRatio = 1
	}

	dTopupGroupRatio := decimal.NewFromFloat(topupGroupRatio)
	dPrice := decimal.NewFromFloat(operation_setting.Price)
	// apply optional preset discount by the original request amount (if configured), default 1.0
	discount := 1.0
	if ds, ok := operation_setting.GetPaymentSetting().AmountDiscount[int(amount)]; ok {
		if ds > 0 {
			discount = ds
		}
	}
	dDiscount := decimal.NewFromFloat(discount)

	payMoney := dAmount.Mul(dPrice).Mul(dTopupGroupRatio).Mul(dDiscount)

	return payMoney.InexactFloat64()
}

func getMinTopup() int64 {
	minTopup := operation_setting.MinTopUp
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dMinTopup := decimal.NewFromInt(int64(minTopup))
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		minTopup = int(dMinTopup.Mul(dQuotaPerUnit).IntPart())
	}
	return int64(minTopup)
}

func RequestEpay(c *gin.Context) {
	var req EpayRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}
	if req.Amount < getMinTopup() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", getMinTopup())})
		return
	}

	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getPayMoney(req.Amount, group)
	if payMoney < 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}

	if !operation_setting.ContainsPayMethod(req.PaymentMethod) {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "支付方式不存在"})
		return
	}

	callBackAddress := service.GetCallbackAddress()
	returnUrl, _ := url.Parse(paymentReturnPath("/console/log"))
	notifyUrl, _ := url.Parse(callBackAddress + "/api/user/epay/notify")
	tradeNo := fmt.Sprintf("%s%d", common.GetRandomString(6), time.Now().Unix())
	tradeNo = fmt.Sprintf("USR%dNO%s", id, tradeNo)
	client := GetEpayClient()
	if client == nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "当前管理员未配置支付信息"})
		return
	}
	uri, params, err := client.Purchase(&epay.PurchaseArgs{
		Type:           req.PaymentMethod,
		ServiceTradeNo: tradeNo,
		Name:           fmt.Sprintf("TUC%d", req.Amount),
		Money:          strconv.FormatFloat(payMoney, 'f', 2, 64),
		Device:         epay.PC,
		NotifyUrl:      notifyUrl,
		ReturnUrl:      returnUrl,
	})
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 拉起支付失败 user_id=%d trade_no=%s payment_method=%s amount=%d error=%q", id, tradeNo, req.PaymentMethod, req.Amount, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "拉起支付失败"})
		return
	}
	amount := req.Amount
	if operation_setting.GetQuotaDisplayType() == operation_setting.QuotaDisplayTypeTokens {
		dAmount := decimal.NewFromInt(int64(amount))
		dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
		amount = dAmount.Div(dQuotaPerUnit).IntPart()
	}
	topUp := &model.TopUp{
		UserId:          id,
		Amount:          amount,
		Money:           payMoney,
		TradeNo:         tradeNo,
		PaymentMethod:   req.PaymentMethod,
		PaymentProvider: model.PaymentProviderEpay,
		CreateTime:      time.Now().Unix(),
		Status:          common.TopUpStatusPending,
	}
	err = topUp.Insert()
	if err != nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 创建充值订单失败 user_id=%d trade_no=%s payment_method=%s amount=%d error=%q", id, tradeNo, req.PaymentMethod, req.Amount, err.Error()))
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "创建订单失败"})
		return
	}
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 充值订单创建成功 user_id=%d trade_no=%s payment_method=%s amount=%d money=%.2f uri=%q params=%q", id, tradeNo, req.PaymentMethod, req.Amount, payMoney, uri, common.GetJsonString(params)))

	// 拼接 GET 形式的支付链接(uri + params)。旧前端仍可用 url+data 走表单跳转。
	payURL := buildEpayPayURL(uri, params)

	// 服务器端尝试解析扫码/付款链接。失败不影响下单,只返回空 qr_url 并保留旧跳转数据。
	qrURL := tryParseEpayQRCode(c.Request.Context(), uri, params, payURL)

	// 兼容旧前端:data 必须仍为原始 params(旧前端 submitPaymentForm(url, data) 会把
	// data 作为隐藏表单字段 POST 给支付网关)。结构化扫码信息单独放到顶层 payment 字段,
	// 并在顶层冗余 pay_url/qr_url/trade_no 方便新前端直接读取。
	c.JSON(http.StatusOK, gin.H{
		"message": "success",
		"data":    params,
		"url":     uri,
		"payment": gin.H{
			"trade_no":       tradeNo,
			"pay_url":        payURL,
			"form_url":       uri,
			"form_params":    params,
			"qr_url":         qrURL,
			"payment_method": req.PaymentMethod,
			"amount":         amount,
			"money":          payMoney,
		},
		"pay_url":  payURL,
		"qr_url":   qrURL,
		"trade_no": tradeNo,
	})
}

// buildEpayPayURL 将易支付返回的 uri 与表单参数 params 拼接成一个 GET 形式的支付链接。
// 若 uri 无法解析则原样返回 uri。
func buildEpayPayURL(uri string, params map[string]string) string {
	if uri == "" {
		return ""
	}
	if len(params) == 0 {
		return uri
	}
	u, err := url.Parse(uri)
	if err != nil {
		return uri
	}
	q := u.Query()
	for k, v := range params {
		q.Set(k, v)
	}
	u.RawQuery = q.Encode()
	return u.String()
}

const (
	epayQRFetchTimeout = 9 * time.Second
	epayQRMaxBodyBytes = 1 << 20 // 1MB
)

var (
	// z-pay submit.html?info=base64 形式(兼容 &amp; 转义后的 ; 分隔与 URL 编码字符)
	epayInfoQueryRegex = regexp.MustCompile(`[?&;]info=([A-Za-z0-9+/=_%-]+)`)
	// HTML 中常见的二维码/收款协议链接
	epayQRSchemeRegex = regexp.MustCompile(`(?i)((?:https?:)?//qr\.alipay\.com/[^\s"'<>\\]+|wxp://[^\s"'<>\\]+|weixin://[^\s"'<>\\]+|alipayqr://[^\s"'<>\\]+|alipays://[^\s"'<>\\]+)`)
	// <img src="...二维码图片..."> 形式
	epayImgSrcRegex = regexp.MustCompile(`(?i)<img[^>]+src=["']([^"']+)["']`)
	epayQRImgHint   = regexp.MustCompile(`(?i)(qr|qrcode|二维码|pay|alipay|weixin|wechat)`)
)

// tryParseEpayQRCode 尝试在服务器端解析易支付支付页中的二维码/付款链接。
// 它只请求易支付网关(operation_setting.PayAddress)同源的地址,不做任意 URL fetch。
// 任何失败都只记录日志并返回空字符串,绝不影响订单创建。
func tryParseEpayQRCode(ctx context.Context, uri string, params map[string]string, payURL string) (qrURL string) {
	defer func() {
		// 解析逻辑(含正则/外部响应)出现任何 panic 都不能影响下单。
		if r := recover(); r != nil {
			logger.LogError(ctx, fmt.Sprintf("易支付 解析二维码 panic: %v", r))
			qrURL = ""
		}
	}()

	// 优先:POST 表单到 uri。很多易支付页必须 POST 才会生成 submit.html?info=...,
	// 仅 GET 拿不到二维码。跟随同源重定向;若重定向直接指向付款/二维码链接则直接采用。
	if isAllowedEpayURL(uri) {
		finalURL, body, redirectQR, err := fetchEpayPaymentPage(ctx, uri, params)
		if err != nil {
			logger.LogWarn(ctx, fmt.Sprintf("易支付 解析二维码 POST 失败 uri=%q error=%q", uri, err.Error()))
		} else {
			// 1) 重定向直接给出付款/二维码链接(qr.alipay.com / wxp:// / weixin:// / alipayqr://)。
			if redirectQR != "" {
				return redirectQR
			}
			// 2) 从最终 URL 中提取 info(submit.html?info=...);两种解析都试,兼容 + 被转空格等情况。
			if q := extractInfoQRFromURL(finalURL); q != "" {
				return q
			}
			if q := extractInfoQRFromText(finalURL); q != "" {
				return q
			}
			// 3) 从响应 HTML 中提取。
			html := string(bytes.TrimSpace(body))
			if q := extractInfoQRFromText(html); q != "" {
				return q
			}
			if m := epayQRSchemeRegex.FindStringSubmatch(html); len(m) > 1 {
				return normalizeScheme(m[1])
			}
			// 4) 退而求其次:从 <img src> 中找带二维码语义的图片链接,相对路径基于最终页面 URL 解析为绝对地址。
			for _, m := range epayImgSrcRegex.FindAllStringSubmatch(html, -1) {
				if len(m) > 1 && epayQRImgHint.MatchString(m[1]) {
					return resolveURL(finalURL, m[1])
				}
			}
		}
	} else {
		logger.LogInfo(ctx, fmt.Sprintf("易支付 解析二维码 跳过(目标地址不在允许范围) uri=%q", uri))
	}

	// 兜底:POST 失败或未命中时,直接从 payURL/uri 的 info query 中解析(无需再请求)。
	if q := extractInfoQRFromURL(payURL); q != "" {
		return q
	}
	if q := extractInfoQRFromText(payURL); q != "" {
		return q
	}
	if q := extractInfoQRFromURL(uri); q != "" {
		return q
	}

	logger.LogInfo(ctx, fmt.Sprintf("易支付 解析二维码 未命中 uri=%q", uri))
	return ""
}

// resolveURL 基于 base 将可能为相对路径的 ref 解析为绝对 URL;解析失败则原样返回 ref。
func resolveURL(base, ref string) string {
	ref = strings.TrimSpace(ref)
	if ref == "" {
		return ""
	}
	b, err := url.Parse(base)
	if err != nil {
		return ref
	}
	r, err := url.Parse(ref)
	if err != nil {
		return ref
	}
	return b.ResolveReference(r).String()
}

// isPaymentSchemeURL 判断链接是否本身就是可直接拉起支付/渲染二维码的付款链接,
// 这类链接(常为外域或自定义协议)不应再发起请求,直接作为 qr_url 返回。
func isPaymentSchemeURL(raw string) bool {
	s := strings.ToLower(strings.TrimSpace(raw))
	if s == "" {
		return false
	}
	for _, p := range []string{"wxp://", "weixin://", "alipayqr://", "alipays://", "alipay://"} {
		if strings.HasPrefix(s, p) {
			return true
		}
	}
	if u, err := url.Parse(raw); err == nil && strings.EqualFold(u.Host, "qr.alipay.com") {
		return true
	}
	return false
}

// extractInfoQRFromURL 从一个 URL 的 info query 中解析二维码地址。
func extractInfoQRFromURL(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	info := u.Query().Get("info")
	if info == "" {
		return ""
	}
	return decodeInfoQR(info)
}

// extractInfoQRFromText 从一段文本(HTML 或 URL 字符串)中正则提取 info=base64 并解析。
// 兼容 HTML 转义的 &amp; 以及 URL 编码(如 %3D);使用 PathUnescape 仅解码 %XX,
// 不会把 base64 中的 + 误转成空格。
func extractInfoQRFromText(text string) string {
	// HTML 中 & 常被转义为 &amp;,先还原以便匹配 &info= / 分隔符。
	text = strings.ReplaceAll(text, "&amp;", "&")
	m := epayInfoQueryRegex.FindStringSubmatch(text)
	if len(m) < 2 {
		return ""
	}
	info := m[1]
	if dec, err := url.PathUnescape(info); err == nil {
		info = dec
	}
	return decodeInfoQR(info)
}

// decodeInfoQR 将 z-pay 的 info(base64 编码的 JSON)解码,取 url 或 url2 作为二维码地址。
func decodeInfoQR(info string) string {
	info = strings.TrimSpace(info)
	if info == "" {
		return ""
	}
	var decoded []byte
	// 依次尝试标准/URL-safe、是否带 padding 的多种 base64 变体。
	for _, enc := range []*base64.Encoding{
		base64.StdEncoding,
		base64.RawStdEncoding,
		base64.URLEncoding,
		base64.RawURLEncoding,
	} {
		if b, err := enc.DecodeString(info); err == nil {
			decoded = b
			break
		}
	}
	if len(decoded) == 0 {
		return ""
	}
	var payload struct {
		URL  string `json:"url"`
		URL2 string `json:"url2"`
	}
	if err := common.Unmarshal(decoded, &payload); err != nil {
		return ""
	}
	if payload.URL != "" {
		return normalizeScheme(payload.URL)
	}
	return normalizeScheme(payload.URL2)
}

// normalizeScheme 将以 // 开头的协议相对链接补全为 https。
func normalizeScheme(s string) string {
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "//") {
		return "https:" + s
	}
	return s
}

// isAllowedEpayURL 仅允许请求易支付网关(PayAddress)同源的地址,防止 SSRF/任意 URL fetch。
func isAllowedEpayURL(raw string) bool {
	if raw == "" {
		return false
	}
	target, err := url.Parse(raw)
	if err != nil || (target.Scheme != "http" && target.Scheme != "https") {
		return false
	}
	base, err := url.Parse(operation_setting.PayAddress)
	if err != nil || base.Host == "" {
		return false
	}
	return strings.EqualFold(target.Host, base.Host)
}

// fetchEpayPaymentPage 优先以 POST 表单方式请求易支付支付页(很多易支付页必须 POST 才会生成
// submit.html?info=...),并手动跟随同源重定向(最多 10 跳)。超时 8-10s,响应体最多读取 1MB。
//   - 若某次重定向 Location 直接是付款/二维码链接(qr.alipay.com / wxp:// / weixin:// / alipayqr://),
//     立即作为 redirectQR 返回,绝不再请求外域。
//   - 若 Location/最终 URL 含 info=(submit.html?info=...),停止跟随并把该 URL 作为 finalURL 交给调用方解析。
//   - 仅同源的 http(s) 重定向才会继续跟随(改用 GET)。
func fetchEpayPaymentPage(ctx context.Context, postURL string, params map[string]string) (finalURL string, body []byte, redirectQR string, err error) {
	reqCtx, cancel := context.WithTimeout(ctx, epayQRFetchTimeout)
	defer cancel()

	client := &http.Client{
		Timeout: epayQRFetchTimeout,
		// 关闭自动重定向,改为手动处理(需要在跳到外域/付款链接时停止并捕获 Location)。
		CheckRedirect: func(r *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	// epay 的 params 为 map[string]string,转成表单编码字符串。
	form := url.Values{}
	for k, v := range params {
		form.Set(k, v)
	}

	currentURL := postURL
	method := http.MethodPost
	var reqBody io.Reader = strings.NewReader(form.Encode())

	for i := 0; i < 10; i++ {
		if !isAllowedEpayURL(currentURL) {
			return finalURL, nil, "", fmt.Errorf("target not allowed: %s", currentURL)
		}
		req, reqErr := http.NewRequestWithContext(reqCtx, method, currentURL, reqBody)
		if reqErr != nil {
			return finalURL, nil, "", reqErr
		}
		req.Header.Set("User-Agent", "new-api-epay-qr/1.0")
		if method == http.MethodPost {
			req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}

		resp, doErr := client.Do(req)
		if doErr != nil {
			return finalURL, nil, "", doErr
		}
		buf, _ := io.ReadAll(io.LimitReader(resp.Body, epayQRMaxBodyBytes))
		resp.Body.Close()
		finalURL = currentURL

		if resp.StatusCode >= 300 && resp.StatusCode < 400 {
			loc := resp.Header.Get("Location")
			if loc == "" {
				return finalURL, buf, "", nil
			}
			// 原始 Location 即为付款/自定义协议链接(如 wxp://、weixin://、alipayqr://)。
			if isPaymentSchemeURL(loc) {
				return finalURL, buf, normalizeScheme(loc), nil
			}
			absLoc := resolveURL(currentURL, loc)
			if isPaymentSchemeURL(absLoc) {
				return finalURL, buf, normalizeScheme(absLoc), nil
			}
			// submit.html?info=... 直接把该 URL 作为最终地址,交由调用方解析 info,无需再请求。
			if strings.Contains(absLoc, "info=") {
				return absLoc, buf, "", nil
			}
			// 仅同源 http(s) 才继续跟随,且改用 GET。
			if isAllowedEpayURL(absLoc) {
				currentURL = absLoc
				method = http.MethodGet
				reqBody = nil
				continue
			}
			// 外域且非付款链接 → 停止,不请求外域。
			return finalURL, buf, "", nil
		}

		// 非重定向(200 等):返回最终 URL 与响应体。
		if resp.Request != nil && resp.Request.URL != nil {
			finalURL = resp.Request.URL.String()
		}
		return finalURL, buf, "", nil
	}
	return finalURL, body, "", fmt.Errorf("stopped after 10 redirects")
}

// GetUserTopUpStatus 返回当前登录用户自己某笔充值订单的状态。
// 仅允许查询属于自己的订单;订单不存在或不属于当前用户时返回 success=false。
func GetUserTopUpStatus(c *gin.Context) {
	tradeNo := strings.TrimSpace(c.Query("trade_no"))
	if tradeNo == "" {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "未提供订单号"})
		return
	}
	userId := c.GetInt("id")
	topUp := model.GetTopUpByTradeNo(tradeNo)
	if topUp == nil || topUp.UserId != userId {
		c.JSON(http.StatusOK, gin.H{"success": false, "message": "订单不存在"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"trade_no":       topUp.TradeNo,
			"status":         topUp.Status,
			"amount":         topUp.Amount,
			"money":          topUp.Money,
			"payment_method": topUp.PaymentMethod,
			"create_time":    topUp.CreateTime,
			"complete_time":  topUp.CompleteTime,
		},
	})
}

// tradeNo lock
var orderLocks sync.Map
var createLock sync.Mutex

// refCountedMutex 带引用计数的互斥锁，确保最后一个使用者才从 map 中删除
type refCountedMutex struct {
	mu       sync.Mutex
	refCount int
}

// LockOrder 尝试对给定订单号加锁
func LockOrder(tradeNo string) {
	createLock.Lock()
	var rcm *refCountedMutex
	if v, ok := orderLocks.Load(tradeNo); ok {
		rcm = v.(*refCountedMutex)
	} else {
		rcm = &refCountedMutex{}
		orderLocks.Store(tradeNo, rcm)
	}
	rcm.refCount++
	createLock.Unlock()
	rcm.mu.Lock()
}

// UnlockOrder 释放给定订单号的锁
func UnlockOrder(tradeNo string) {
	v, ok := orderLocks.Load(tradeNo)
	if !ok {
		return
	}
	rcm := v.(*refCountedMutex)
	rcm.mu.Unlock()

	createLock.Lock()
	rcm.refCount--
	if rcm.refCount == 0 {
		orderLocks.Delete(tradeNo)
	}
	createLock.Unlock()
}

func EpayNotify(c *gin.Context) {
	if !isEpayWebhookEnabled() {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 webhook 被拒绝 reason=webhook_disabled path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}

	var params map[string]string

	if c.Request.Method == "POST" {
		// POST 请求：从 POST body 解析参数
		if err := c.Request.ParseForm(); err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 webhook POST 表单解析失败 path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
			_, _ = c.Writer.Write([]byte("fail"))
			return
		}
		params = lo.Reduce(lo.Keys(c.Request.PostForm), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.PostForm.Get(t)
			return r
		}, map[string]string{})
	} else {
		// GET 请求：从 URL Query 解析参数
		params = lo.Reduce(lo.Keys(c.Request.URL.Query()), func(r map[string]string, t string, i int) map[string]string {
			r[t] = c.Request.URL.Query().Get(t)
			return r
		}, map[string]string{})
	}
	logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 webhook 收到请求 path=%q client_ip=%s method=%s params=%q", c.Request.RequestURI, c.ClientIP(), c.Request.Method, common.GetJsonString(params)))

	if len(params) == 0 {
		logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 webhook 参数为空 path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		_, _ = c.Writer.Write([]byte("fail"))
		return
	}
	client := GetEpayClient()
	if client == nil {
		logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 client 未初始化 path=%q client_ip=%s", c.Request.RequestURI, c.ClientIP()))
		_, err := c.Writer.Write([]byte("fail"))
		if err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 webhook 响应写入失败 path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
		}
		return
	}
	verifyInfo, err := client.Verify(params)
	if err == nil && verifyInfo.VerifyStatus {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 webhook 验签成功 trade_no=%s callback_type=%s trade_status=%s client_ip=%s verify_info=%q", verifyInfo.ServiceTradeNo, verifyInfo.Type, verifyInfo.TradeStatus, c.ClientIP(), common.GetJsonString(verifyInfo)))
		_, err := c.Writer.Write([]byte("success"))
		if err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 webhook 响应写入失败 trade_no=%s client_ip=%s error=%q", verifyInfo.ServiceTradeNo, c.ClientIP(), err.Error()))
		}
	} else {
		_, err := c.Writer.Write([]byte("fail"))
		if err != nil {
			logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 webhook 响应写入失败 path=%q client_ip=%s error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
		}
		if err != nil {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 webhook 验签失败 path=%q client_ip=%s verify_error=%q", c.Request.RequestURI, c.ClientIP(), err.Error()))
		} else {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 webhook 验签失败 path=%q client_ip=%s verify_status=false", c.Request.RequestURI, c.ClientIP()))
		}
		return
	}

	if verifyInfo.TradeStatus == epay.StatusTradeSuccess {
		LockOrder(verifyInfo.ServiceTradeNo)
		defer UnlockOrder(verifyInfo.ServiceTradeNo)
		topUp := model.GetTopUpByTradeNo(verifyInfo.ServiceTradeNo)
		if topUp == nil {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 回调订单不存在 trade_no=%s callback_type=%s client_ip=%s verify_info=%q", verifyInfo.ServiceTradeNo, verifyInfo.Type, c.ClientIP(), common.GetJsonString(verifyInfo)))
			return
		}
		if topUp.PaymentProvider != model.PaymentProviderEpay {
			logger.LogWarn(c.Request.Context(), fmt.Sprintf("易支付 订单支付网关不匹配 trade_no=%s order_provider=%s callback_type=%s client_ip=%s", verifyInfo.ServiceTradeNo, topUp.PaymentProvider, verifyInfo.Type, c.ClientIP()))
			return
		}
		if topUp.Status == common.TopUpStatusPending {
			if topUp.PaymentMethod != verifyInfo.Type {
				logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 实际支付方式与订单不同 trade_no=%s order_payment_method=%s actual_type=%s client_ip=%s", verifyInfo.ServiceTradeNo, topUp.PaymentMethod, verifyInfo.Type, c.ClientIP()))
				topUp.PaymentMethod = verifyInfo.Type
			}
			topUp.Status = common.TopUpStatusSuccess
			err := topUp.Update()
			if err != nil {
				logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 更新充值订单失败 trade_no=%s user_id=%d client_ip=%s error=%q topup=%q", topUp.TradeNo, topUp.UserId, c.ClientIP(), err.Error(), common.GetJsonString(topUp)))
				return
			}
			//user, _ := model.GetUserById(topUp.UserId, false)
			//user.Quota += topUp.Amount * 500000
			dAmount := decimal.NewFromInt(int64(topUp.Amount))
			dQuotaPerUnit := decimal.NewFromFloat(common.QuotaPerUnit)
			quotaToAdd := int(dAmount.Mul(dQuotaPerUnit).IntPart())
			err = model.IncreaseUserQuota(topUp.UserId, quotaToAdd, true)
			if err != nil {
				logger.LogError(c.Request.Context(), fmt.Sprintf("易支付 更新用户额度失败 trade_no=%s user_id=%d client_ip=%s quota_to_add=%d error=%q topup=%q", topUp.TradeNo, topUp.UserId, c.ClientIP(), quotaToAdd, err.Error(), common.GetJsonString(topUp)))
				return
			}
			logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 充值成功 trade_no=%s user_id=%d client_ip=%s quota_to_add=%d money=%.2f topup=%q", topUp.TradeNo, topUp.UserId, c.ClientIP(), quotaToAdd, topUp.Money, common.GetJsonString(topUp)))
			model.RecordTopupLog(topUp.UserId, fmt.Sprintf("使用在线充值成功，充值金额: %v，支付金额：%f", logger.LogQuota(quotaToAdd), topUp.Money), c.ClientIP(), topUp.PaymentMethod, "epay")
			model.RebateInviterForTopUp(topUp, int64(quotaToAdd))
		}
	} else {
		logger.LogInfo(c.Request.Context(), fmt.Sprintf("易支付 webhook 忽略事件 trade_no=%s callback_type=%s trade_status=%s client_ip=%s verify_info=%q", verifyInfo.ServiceTradeNo, verifyInfo.Type, verifyInfo.TradeStatus, c.ClientIP(), common.GetJsonString(verifyInfo)))
	}
}

func RequestAmount(c *gin.Context) {
	var req AmountRequest
	err := c.ShouldBindJSON(&req)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "参数错误"})
		return
	}

	if req.Amount < getMinTopup() {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": fmt.Sprintf("充值数量不能小于 %d", getMinTopup())})
		return
	}
	id := c.GetInt("id")
	group, err := model.GetUserGroup(id, true)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "获取用户分组失败"})
		return
	}
	payMoney := getPayMoney(req.Amount, group)
	if payMoney <= 0.01 {
		c.JSON(http.StatusOK, gin.H{"message": "error", "data": "充值金额过低"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "success", "data": strconv.FormatFloat(payMoney, 'f', 2, 64)})
}

func GetUserTopUps(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)
	keyword := c.Query("keyword")

	var (
		topups []*model.TopUp
		total  int64
		err    error
	)
	if keyword != "" {
		topups, total, err = model.SearchUserTopUps(userId, keyword, pageInfo)
	} else {
		topups, total, err = model.GetUserTopUps(userId, pageInfo)
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}

	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(topups)
	common.ApiSuccess(c, pageInfo)
}

// GetAllTopUps 管理员获取全平台充值记录
func GetAllTopUps(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	keyword := c.Query("keyword")

	var (
		topups []*model.TopUp
		total  int64
		err    error
	)
	if keyword != "" {
		topups, total, err = model.SearchAllTopUps(keyword, pageInfo)
	} else {
		topups, total, err = model.GetAllTopUps(pageInfo)
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}

	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(topups)
	common.ApiSuccess(c, pageInfo)
}

type AdminCompleteTopupRequest struct {
	TradeNo string `json:"trade_no"`
}

// AdminCompleteTopUp 管理员补单接口
func AdminCompleteTopUp(c *gin.Context) {
	var req AdminCompleteTopupRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.TradeNo == "" {
		common.ApiErrorMsg(c, "参数错误")
		return
	}

	// 订单级互斥，防止并发补单
	LockOrder(req.TradeNo)
	defer UnlockOrder(req.TradeNo)

	if err := model.ManualCompleteTopUp(req.TradeNo, c.ClientIP()); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, nil)
}
