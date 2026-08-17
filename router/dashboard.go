package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

func SetDashboardRouter(router *gin.Engine) {
	readOnlyRouter := router.Group("/")
	readOnlyRouter.Use(middleware.RouteTag("old_api"))
	readOnlyRouter.Use(gzip.Gzip(gzip.DefaultCompression))
	readOnlyRouter.Use(middleware.GlobalAPIRateLimit())
	readOnlyRouter.Use(middleware.CORS())
	readOnlyRouter.Use(middleware.TokenAuthReadOnly())
	{
		readOnlyRouter.GET("/user/balance", controller.GetUserBalance)
		readOnlyRouter.GET("/v1/user/balance", controller.GetUserBalance)
		readOnlyRouter.GET("/dashboard/billing/credit_grants", controller.GetCreditGrants)
		readOnlyRouter.GET("/v1/dashboard/billing/credit_grants", controller.GetCreditGrants)
	}

	apiRouter := router.Group("/")
	apiRouter.Use(middleware.RouteTag("old_api"))
	apiRouter.Use(gzip.Gzip(gzip.DefaultCompression))
	apiRouter.Use(middleware.GlobalAPIRateLimit())
	apiRouter.Use(middleware.CORS())
	apiRouter.Use(middleware.TokenAuth())
	{
		apiRouter.GET("/dashboard/billing/subscription", controller.GetSubscription)
		apiRouter.GET("/v1/dashboard/billing/subscription", controller.GetSubscription)
		apiRouter.GET("/dashboard/billing/usage", controller.GetUsage)
		apiRouter.GET("/v1/dashboard/billing/usage", controller.GetUsage)
	}
}
