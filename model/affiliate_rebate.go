package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

// maskUsername 对用户名打码,避免向邀请人暴露被邀请人的完整账号。
// 例: huijie5421 -> hu*******1, ab -> a*, abc -> a**
func maskUsername(name string) string {
	r := []rune(name)
	n := len(r)
	switch {
	case n == 0:
		return ""
	case n <= 2:
		return string(r[0]) + "*"
	case n <= 4:
		return string(r[0]) + strings.Repeat("*", n-1)
	default:
		return string(r[:2]) + strings.Repeat("*", n-3) + string(r[n-1])
	}
}

// AffiliateRebateRecord 充值返利台账：记录每一笔在线充值返利给邀请人的明细，便于溯源。
type AffiliateRebateRecord struct {
	Id             int     `json:"id"`
	InviterId      int     `json:"inviter_id" gorm:"index"`
	SourceUserId   int     `json:"source_user_id" gorm:"index"`
	SourceUsername string  `json:"source_username" gorm:"type:varchar(64);default:''"`
	Quota          int64   `json:"quota" gorm:"default:0"`
	RechargedQuota int64   `json:"recharged_quota" gorm:"default:0"`
	Ratio          float64 `json:"ratio" gorm:"default:0"`
	TradeNo        string  `json:"trade_no" gorm:"type:varchar(255);index"`
	TopUpId        int     `json:"top_up_id" gorm:"index"`
	CreatedAt      int64   `json:"created_at" gorm:"index"`
}

// GetUserRebateRecords 分页查询某邀请人收到的返利台账记录（按 id 倒序）。
func GetUserRebateRecords(inviterId int, pageInfo *common.PageInfo) ([]*AffiliateRebateRecord, int64, error) {
	var records []*AffiliateRebateRecord
	var total int64

	if err := DB.Model(&AffiliateRebateRecord{}).Where("inviter_id = ?", inviterId).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := DB.Where("inviter_id = ?", inviterId).
		Order("id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&records).Error; err != nil {
		return nil, 0, err
	}

	// 打码被邀请人用户名,避免暴露完整账号
	for _, rec := range records {
		rec.SourceUsername = maskUsername(rec.SourceUsername)
	}

	return records, total, nil
}

// GetUserInvitees 分页查询某邀请人邀请的用户列表（按 id 倒序）。
func GetUserInvitees(inviterId int, pageInfo *common.PageInfo) ([]*User, int64, error) {
	var users []*User
	var total int64

	if err := DB.Model(&User{}).Where("inviter_id = ?", inviterId).Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := DB.Model(&User{}).Where("inviter_id = ?", inviterId).
		Select("id, username, display_name, created_at, used_quota, quota").
		Order("id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&users).Error; err != nil {
		return nil, 0, err
	}

	// 打码用户名,避免暴露完整账号
	for _, u := range users {
		u.Username = maskUsername(u.Username)
	}

	return users, total, nil
}
