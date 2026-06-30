package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

// GetChannelHealthRouterStats 返回当前各分组各渠道的自动健康路由状态快照（只读，RootAuth）。
// 用于管理面观察哪些渠道处于 OK/WARN/BAD/PROBING、红色计数与冷却截止，便于排查与调参。
func GetChannelHealthRouterStats(c *gin.Context) {
	stats := service.GetChannelHealthRouterStats()
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    stats,
	})
}
