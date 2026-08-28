package model

import (
	"errors"
	"time"

	"gorm.io/gorm"
)

const ResponsesWSUnsupportedCooldown = 24 * time.Hour

// ChannelResponsesWSBreaker stores a channel-scoped WS capability cooldown.
// It is deliberately separate from Channel.Status: HTTP/SSE traffic remains
// available while only the optional upstream WS transport is suspended.
type ChannelResponsesWSBreaker struct {
	ChannelID     int    `json:"channel_id" gorm:"primaryKey;column:channel_id"`
	DisabledUntil int64  `json:"disabled_until" gorm:"not null;index"`
	ReasonCode    string `json:"reason_code" gorm:"type:varchar(64)"`
	ReasonDetail  string `json:"reason_detail" gorm:"type:varchar(255)"`
	UpdatedAt     int64  `json:"updated_at" gorm:"not null"`
}

func (ChannelResponsesWSBreaker) TableName() string {
	return "channel_responses_ws_breakers"
}

func GetChannelResponsesWSBreaker(channelID int) (*ChannelResponsesWSBreaker, error) {
	if DB == nil {
		return nil, errors.New("database is not initialized")
	}
	var breaker ChannelResponsesWSBreaker
	result := DB.Where("channel_id = ?", channelID).Limit(1).Find(&breaker)
	if result.Error != nil {
		return nil, result.Error
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	return &breaker, nil
}

func TripChannelResponsesWSBreaker(channelID int, reasonCode, reasonDetail string, now time.Time) error {
	if DB == nil {
		return errors.New("database is not initialized")
	}
	nowUnix := now.Unix()
	breaker := &ChannelResponsesWSBreaker{
		ChannelID:     channelID,
		DisabledUntil: now.Add(ResponsesWSUnsupportedCooldown).Unix(),
		ReasonCode:    reasonCode,
		ReasonDetail:  reasonDetail,
		UpdatedAt:     nowUnix,
	}
	return DB.Save(breaker).Error
}

func ClearChannelResponsesWSBreaker(channelID int) error {
	if DB == nil {
		return errors.New("database is not initialized")
	}
	return DB.Delete(&ChannelResponsesWSBreaker{}, "channel_id = ?", channelID).Error
}

func AttachChannelResponsesWSBreakers(channels []*Channel) error {
	if DB == nil || len(channels) == 0 {
		return nil
	}
	ids := make([]int, 0, len(channels))
	byID := make(map[int]*Channel, len(channels))
	for _, channel := range channels {
		if channel == nil || channel.Id <= 0 {
			continue
		}
		ids = append(ids, channel.Id)
		byID[channel.Id] = channel
	}
	if len(ids) == 0 {
		return nil
	}
	var breakers []ChannelResponsesWSBreaker
	if err := DB.Where("channel_id IN ?", ids).Find(&breakers).Error; err != nil {
		return err
	}
	for index := range breakers {
		breaker := breakers[index]
		if channel := byID[breaker.ChannelID]; channel != nil {
			channel.ResponsesWSBreaker = &breaker
		}
	}
	return nil
}
