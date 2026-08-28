package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relaykit/dto"
	"github.com/QuantumNous/new-api/relaykit/types"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func getChannelWithCapacity(c *gin.Context, info *relaycommon.RelayInfo, retryParam *service.RetryParam) (*model.Channel, *service.ChannelCapacityLease, *types.NewAPIError) {
	excluded := make(map[int]struct{})
	capacityGroup := ""
	retryAfter := int64(0)

	for {
		selectionParam := retryParam
		if len(excluded) > 0 {
			copied := *retryParam
			copied.ExcludedChannelIDs = excluded
			copied.ForceReselect = true
			if capacityGroup != "" {
				copied.TokenGroup = capacityGroup
			}
			selectionParam = &copied
		}

		channel, channelErr := getChannel(c, info, selectionParam)
		if channelErr != nil || channel == nil {
			if len(excluded) > 0 && (channelErr == nil || channelErr.GetErrorCode() == types.ErrorCodeGetChannelFailed) {
				return nil, nil, newChannelCapacityError(c, retryAfter)
			}
			return nil, nil, channelErr
		}

		settings, _ := common.GetContextKeyType[dto.ChannelSettings](c, constant.ContextKeyChannelSetting)
		lease, decision, err := service.AcquireChannelCapacity(c.Request.Context(), channel.Id, settings)
		if err != nil {
			logger.LogError(c, fmt.Sprintf("channel capacity check failed: channel_id=%d error=%v", channel.Id, err))
			return nil, nil, types.NewErrorWithStatusCode(
				errors.New("渠道容量检查失败，请稍后重试"),
				types.ErrorCodeChannelCapacityExceeded,
				http.StatusServiceUnavailable,
				types.ErrOptionWithSkipRetry(),
			)
		}
		if decision.Allowed {
			return channel, lease, nil
		}

		if retryAfter == 0 || decision.RetryAfterSeconds < retryAfter {
			retryAfter = decision.RetryAfterSeconds
		}
		logger.LogInfo(c, fmt.Sprintf(
			"channel capacity saturated: channel_id=%d reason=%s retry_after=%d",
			channel.Id,
			decision.Reason,
			decision.RetryAfterSeconds,
		))
		if _, specific := c.Get("specific_channel_id"); specific {
			return nil, nil, newChannelCapacityError(c, retryAfter)
		}
		excluded[channel.Id] = struct{}{}
		if capacityGroup == "" {
			capacityGroup = retryParam.TokenGroup
			if capacityGroup == "auto" {
				capacityGroup = common.GetContextKeyString(c, constant.ContextKeyAutoGroup)
				if capacityGroup == "" {
					return nil, nil, newChannelCapacityError(c, retryAfter)
				}
			}
		}
	}
}

func acquireLockedChannelCapacity(c *gin.Context, channel *model.Channel) (*service.ChannelCapacityLease, *types.NewAPIError) {
	lease, decision, err := service.AcquireChannelCapacity(c.Request.Context(), channel.Id, channel.GetSetting())
	if err != nil {
		logger.LogError(c, fmt.Sprintf("locked channel capacity check failed: channel_id=%d error=%v", channel.Id, err))
		return nil, types.NewErrorWithStatusCode(
			errors.New("渠道容量检查失败，请稍后重试"),
			types.ErrorCodeChannelCapacityExceeded,
			http.StatusServiceUnavailable,
			types.ErrOptionWithSkipRetry(),
		)
	}
	if !decision.Allowed {
		return nil, newChannelCapacityError(c, decision.RetryAfterSeconds)
	}
	return lease, nil
}

func newChannelCapacityError(c *gin.Context, retryAfter int64) *types.NewAPIError {
	if retryAfter < 1 {
		retryAfter = 1
	}
	c.Header("Retry-After", strconv.FormatInt(retryAfter, 10))
	return types.NewErrorWithStatusCode(
		errors.New("同分组内匹配渠道均已达到并发或 RPM 上限，请稍后重试"),
		types.ErrorCodeChannelCapacityExceeded,
		http.StatusServiceUnavailable,
		types.ErrOptionWithSkipRetry(),
	)
}
