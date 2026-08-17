package router

import (
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestDashboardRouterRegistersCreditGrantsCompatibilityPaths(t *testing.T) {
	gin.SetMode(gin.TestMode)
	engine := gin.New()
	SetDashboardRouter(engine)

	routes := make(map[string]struct{}, len(engine.Routes()))
	for _, route := range engine.Routes() {
		routes[route.Method+" "+route.Path] = struct{}{}
	}

	require.Contains(t, routes, "GET /dashboard/billing/credit_grants")
	require.Contains(t, routes, "GET /v1/dashboard/billing/credit_grants")
	require.Contains(t, routes, "GET /user/balance")
	require.Contains(t, routes, "GET /v1/user/balance")
}
