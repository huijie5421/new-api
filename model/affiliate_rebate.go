package model

import (
	"github.com/QuantumNous/new-api/common"
)

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

	return users, total, nil
}
