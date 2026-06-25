export function formatSubscriptionDuration(plan, t) {
  const unit = plan?.duration_unit || 'month';
  const value = plan?.duration_value || 1;
  const unitLabels = {
    year: t('年'),
    month: t('个月'),
    day: t('天'),
    hour: t('小时'),
    custom: t('自定义'),
  };
  if (unit === 'custom') {
    const seconds = plan?.custom_seconds || 0;
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('天')}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('小时')}`;
    return `${seconds} ${t('秒')}`;
  }
  return `${value} ${unitLabels[unit] || unit}`;
}

export function formatSubscriptionResetPeriod(plan, t) {
  const period = plan?.quota_reset_period || 'never';
  if (period === 'never') return t('不重置');
  if (period === 'daily') return t('每天');
  if (period === 'weekly') return t('每周');
  if (period === 'monthly') return t('每月');
  if (period === 'custom') {
    const seconds = Number(plan?.quota_reset_custom_seconds || 0);
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('天')}`;
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('小时')}`;
    if (seconds >= 60) return `${Math.floor(seconds / 60)} ${t('分钟')}`;
    return `${seconds} ${t('秒')}`;
  }
  return t('不重置');
}

// 套餐额度的展示文案：额度按重置周期发放（每日/每周/每月）时，
// “总额度”会让人误以为是整个有效期的总量，故按周期动态显示。
// 用于「可购买套餐」卡片（有完整 plan，可拿到 quota_reset_period）。
export function formatSubscriptionQuotaLabel(plan, t) {
  const period = plan?.quota_reset_period || 'never';
  if (period === 'daily') return t('每日额度');
  if (period === 'weekly') return t('每周额度');
  if (period === 'monthly') return t('每月额度');
  if (period === 'custom') return t('周期额度');
  return t('总额度');
}

// 用于「已购订阅」列表：用户侧订阅数据不含 quota_reset_period，
// 只能依据 next_reset_time 判断是否为周期性重置额度。
export function formatSubscriptionQuotaLabelByReset(nextResetTime, t) {
  return Number(nextResetTime) > 0 ? t('周期额度') : t('总额度');
}
