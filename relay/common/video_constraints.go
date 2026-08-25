package common

import (
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"
)

const (
	MaxVideoReferenceImages = 30
	MaxVideoReferenceVideos = 10
	MaxVideoReferenceAudios = 10
	MaxVideoReferences      = MaxVideoReferenceImages + MaxVideoReferenceVideos + MaxVideoReferenceAudios

	defaultVideoReferenceImages             = 9
	defaultVideoReferenceVideos             = 3
	defaultVideoReferenceAudios             = 3
	defaultReferenceVideoDurationSeconds    = 15
	seedance25ReferenceVideoDurationSeconds = 29
)

var (
	videoDurationSuffixPattern   = regexp.MustCompile(`(?i)(?:^|[-_\s])(\d+)s(?:$|[-_\s])`)
	videoImageCountSuffixPattern = regexp.MustCompile(`(?i)(?:^|[-_\s])(\d+)img(?:$|[-_\s])`)
	videoResolutionPattern       = regexp.MustCompile(`(?i)(?:^|[-_\s])(\d+[pP])(?:$|[-_\s])`)
	videoGZSuffixPattern         = regexp.MustCompile(`(?i)(?:^|[-_\s])gz(?:$|[-_\s])`)
	videoFixedPricePattern       = regexp.MustCompile(`(?i)-(?:15|30)s`)
	videoNoVideoSuffixPattern    = regexp.MustCompile(`(?i)(?:^|[-_\s])nv(?:$|[-_\s])`)
	videoTrailingControlPattern  = regexp.MustCompile(`(?i)(?:[-_\s]+(?:\d+s|gz))$`)
)

type VideoModelConstraints struct {
	MaxSeconds                       int
	HasDurationSuffix                bool
	FixedSeconds                     bool
	FixedPrice                       bool
	RequiredImages                   int
	MaxReferenceImages               int
	MaxReferenceVideos               int
	MaxReferenceAudios               int
	MaxReferenceVideoDurationSeconds int
	DisableVideoReferences           bool
	DropVideoReferences              bool
	DisableAudioReferences           bool
	MinDirectSeconds                 int
	MaxDirectSeconds                 int
	Resolution                       string
}

type videoModelReferenceLimits struct {
	Images           int
	Videos           int
	Audios           int
	FixedPrice       bool
	Resolution       string
	MinDirectSeconds int
	MaxDirectSeconds int
}

var videoModelReferenceLimitsByName = map[string]videoModelReferenceLimits{
	"seedance2.0 720p-fast":            {Images: 4, Videos: 3, Audios: 3},
	"seedance2.0 720p-pro":             {Images: 9, Videos: 3, Audios: 3},
	"破甲seedance 720p-fast":             {Images: 9, Videos: 3, Audios: 3},
	"cc-seedance2.0 480p-fast-nsp":     {Images: 9, Videos: 0, Audios: 3},
	"cc-seedance2.0 480p-nsp":          {Images: 9, Videos: 0, Audios: 3},
	"mg-seedance2.0 -480p":             {Images: 4, Videos: 3, Audios: 1},
	"mg-seedance2.0 -480p fast":        {Images: 4, Videos: 3, Audios: 1},
	"mg-seedance2.0 -480p mini":        {Images: 4, Videos: 3, Audios: 1},
	"mg-seedance2.0 -720p fast":        {Images: 4, Videos: 3, Audios: 1},
	"mg-seedance2.0 -720p mini":        {Images: 4, Videos: 3, Audios: 1},
	"mg-seedance2.0 -720p pro":         {Images: 4, Videos: 3, Audios: 1},
	"mg-seedance2.0 -480p-fast-gz-15s": {Images: 9, Videos: 3, Audios: 3, FixedPrice: true},
	"mg-seedance2.0 -480p-gz-15s":      {Images: 9, Videos: 3, Audios: 3, FixedPrice: true},
	"mg-seedance2.0 -720p-fast-gz-15s": {Images: 9, Videos: 3, Audios: 3, FixedPrice: true},
	"mg-seedance2.0 -720p-gz-15s":      {Images: 9, Videos: 3, Audios: 3, FixedPrice: true},
	"mg-seedance2.0 -720p-mini-gz-15s": {Images: 9, Videos: 3, Audios: 3, FixedPrice: true},
	"xx-seedance 1080p-pro-nyp-15s":    {Images: 9, Videos: 3, Audios: 0, FixedPrice: true},
	"xx-seedance 720p-fast-nyp-15s":    {Images: 9, Videos: 3, Audios: 0, FixedPrice: true},
	"xx-seedance 720p-mini-nyp-15s":    {Images: 9, Videos: 3, Audios: 0, FixedPrice: true},
	"xx-seedance 720p-pro-nyp-15s":     {Images: 9, Videos: 3, Audios: 0, FixedPrice: true},
	"minimax-h3-2k":                    {Images: 5, Videos: 0, Audios: 3, Resolution: "1440P", MinDirectSeconds: 5, MaxDirectSeconds: 15},
	"kling video 3.0 omni":             {Images: 4, Videos: 1, Audios: 1, Resolution: "720P", MinDirectSeconds: 5, MaxDirectSeconds: 15},
}

func normalizeVideoModelConstraintKey(model string) string {
	return strings.ToLower(strings.Join(strings.Fields(model), " "))
}

func videoModelReferenceLimitsForName(model string) (videoModelReferenceLimits, bool) {
	key := normalizeVideoModelConstraintKey(model)
	if limits, ok := videoModelReferenceLimitsByName[key]; ok {
		return limits, true
	}

	// Duration and -gz are gateway control suffixes. A model variant such as
	// "seedance2.0 720p-fast-5s" keeps the media capabilities of its base model.
	baseKey := key
	for {
		trimmed := strings.TrimSpace(videoTrailingControlPattern.ReplaceAllString(baseKey, ""))
		if trimmed == baseKey {
			break
		}
		baseKey = trimmed
	}
	limits, ok := videoModelReferenceLimitsByName[baseKey]
	return limits, ok
}

func ParseVideoModelConstraints(model string) VideoModelConstraints {
	normalizedModel := normalizeVideoModelConstraintKey(model)
	constraints := VideoModelConstraints{
		FixedSeconds:                     videoGZSuffixPattern.MatchString(model),
		DropVideoReferences:              videoNoVideoSuffixPattern.MatchString(model),
		MaxReferenceImages:               defaultVideoReferenceImages,
		MaxReferenceVideos:               defaultVideoReferenceVideos,
		MaxReferenceAudios:               defaultVideoReferenceAudios,
		MaxReferenceVideoDurationSeconds: defaultReferenceVideoDurationSeconds,
	}
	if strings.Contains(normalizedModel, "seedance-2.5") {
		constraints.MaxReferenceImages = MaxVideoReferenceImages
		constraints.MaxReferenceVideos = MaxVideoReferenceVideos
		constraints.MaxReferenceAudios = MaxVideoReferenceAudios
		constraints.MaxReferenceVideoDurationSeconds = seedance25ReferenceVideoDurationSeconds
	}
	if limits, ok := videoModelReferenceLimitsForName(model); ok {
		constraints.MaxReferenceImages = limits.Images
		constraints.MaxReferenceVideos = limits.Videos
		constraints.MaxReferenceAudios = limits.Audios
		constraints.FixedPrice = limits.FixedPrice
		constraints.Resolution = limits.Resolution
		constraints.MinDirectSeconds = limits.MinDirectSeconds
		constraints.MaxDirectSeconds = limits.MaxDirectSeconds
	}
	if strings.Contains(normalizedModel, "seedance") || normalizedModel == "即梦" {
		constraints.MinDirectSeconds = 5
		constraints.MaxDirectSeconds = 15
	}
	if strings.Contains(normalizedModel, "seedance-2.5") {
		constraints.MaxDirectSeconds = 30
	}
	if constraints.FixedSeconds || videoFixedPricePattern.MatchString(model) {
		constraints.FixedPrice = true
	}
	if constraints.DropVideoReferences {
		constraints.MaxReferenceVideos = 0
	}
	constraints.DisableVideoReferences = constraints.MaxReferenceVideos == 0
	constraints.DisableAudioReferences = constraints.MaxReferenceAudios == 0
	if match := videoDurationSuffixPattern.FindStringSubmatch(model); len(match) == 2 {
		constraints.HasDurationSuffix = true
		constraints.MaxSeconds, _ = strconv.Atoi(match[1])
	}
	if match := videoImageCountSuffixPattern.FindStringSubmatch(model); len(match) == 2 {
		constraints.RequiredImages, _ = strconv.Atoi(match[1])
	}
	if match := videoResolutionPattern.FindStringSubmatch(model); len(match) == 2 {
		constraints.Resolution = match[1]
	}
	return constraints
}

func normalizeVideoReferenceList(field string, values []string, max int) ([]string, error) {
	if len(values) > max {
		return nil, fmt.Errorf("%s supports at most %d items", field, max)
	}
	for i := range values {
		values[i] = strings.TrimSpace(values[i])
		if values[i] == "" {
			return nil, fmt.Errorf("%s[%d] must not be empty", field, i)
		}
	}
	return values, nil
}

// NormalizeVideoReferences accepts the legacy single input_reference field and
// exposes all image references through the /v1/videos array contract.
func (t *TaskSubmitReq) NormalizeVideoReferences() error {
	if t == nil {
		return errors.New("video request is nil")
	}

	legacyReference := strings.TrimSpace(t.InputReference)
	if t.InputReference != "" && legacyReference == "" {
		return errors.New("input_reference must not be empty")
	}
	t.InputReference = legacyReference
	if legacyReference != "" {
		found := false
		for _, reference := range t.ReferenceImageURLs {
			if strings.TrimSpace(reference) == legacyReference {
				found = true
				break
			}
		}
		if !found {
			t.ReferenceImageURLs = append(t.ReferenceImageURLs, legacyReference)
		}
	}

	var err error
	t.ReferenceImageURLs, err = normalizeVideoReferenceList("reference_image_urls", t.ReferenceImageURLs, MaxVideoReferenceImages)
	if err != nil {
		return err
	}
	t.ReferenceVideos, err = normalizeVideoReferenceList("reference_videos", t.ReferenceVideos, MaxVideoReferenceVideos)
	if err != nil {
		return err
	}
	t.ReferenceAudios, err = normalizeVideoReferenceList("reference_audios", t.ReferenceAudios, MaxVideoReferenceAudios)
	if err != nil {
		return err
	}
	if len(t.ReferenceImageURLs)+len(t.ReferenceVideos)+len(t.ReferenceAudios) > MaxVideoReferences {
		return fmt.Errorf("video references support at most %d items in total", MaxVideoReferences)
	}

	if len(t.Images) == 0 && len(t.ReferenceImageURLs) > 0 {
		t.Images = append([]string(nil), t.ReferenceImageURLs...)
	}
	return nil
}

func (t *TaskSubmitReq) NormalizeVideoRequest() error {
	constraints := ParseVideoModelConstraints(t.Model)
	if constraints.DropVideoReferences {
		t.ReferenceVideos = nil
	}
	if err := t.NormalizeVideoReferences(); err != nil {
		return err
	}
	if len(t.ReferenceImageURLs) > constraints.MaxReferenceImages {
		return fmt.Errorf("model supports at most %d reference images", constraints.MaxReferenceImages)
	}
	if len(t.ReferenceVideos) > constraints.MaxReferenceVideos {
		return fmt.Errorf("model supports at most %d reference videos", constraints.MaxReferenceVideos)
	}
	if len(t.ReferenceAudios) > constraints.MaxReferenceAudios {
		return fmt.Errorf("model supports at most %d reference audios", constraints.MaxReferenceAudios)
	}

	t.Resolution = strings.TrimSpace(t.Resolution)
	t.Seconds = strings.TrimSpace(t.Seconds)
	t.MySeconds = strings.TrimSpace(t.MySeconds)
	if t.GridStrength != nil && (*t.GridStrength < 0.01 || *t.GridStrength > 0.5) {
		return errors.New("grid_strength must be between 0.01 and 0.5")
	}

	if constraints.RequiredImages > len(t.ReferenceImageURLs) {
		return fmt.Errorf("model requires at least %d reference images", constraints.RequiredImages)
	}
	if t.Resolution == "" && constraints.Resolution != "" {
		t.Resolution = constraints.Resolution
	}

	if constraints.FixedSeconds && !constraints.HasDurationSuffix {
		return errors.New("model suffix -gz requires a duration suffix such as -10s")
	}
	if constraints.HasDurationSuffix && (constraints.MaxSeconds <= 0 || constraints.MaxSeconds > MaxTaskDurationSeconds) {
		return fmt.Errorf("model duration suffix must be between 1 and %d seconds", MaxTaskDurationSeconds)
	}
	if !constraints.HasDurationSuffix {
		t.MySeconds = ""
		if constraints.MinDirectSeconds > 0 {
			if t.Seconds == "" && t.Duration > 0 {
				t.Seconds = strconv.Itoa(t.Duration)
			}
			seconds, err := strconv.Atoi(t.Seconds)
			if err != nil || seconds < constraints.MinDirectSeconds || seconds > constraints.MaxDirectSeconds {
				return fmt.Errorf("seconds must be an integer between %d and %d", constraints.MinDirectSeconds, constraints.MaxDirectSeconds)
			}
			t.Seconds = strconv.Itoa(seconds)
			t.Duration = seconds
		}
		return nil
	}

	t.Seconds = "1"
	if constraints.FixedSeconds {
		t.MySeconds = strconv.Itoa(constraints.MaxSeconds)
		return nil
	}
	if t.MySeconds == "" {
		t.MySeconds = strconv.Itoa(constraints.MaxSeconds)
		return nil
	}
	seconds, err := strconv.Atoi(t.MySeconds)
	if err != nil || seconds <= 0 || seconds > constraints.MaxSeconds {
		return fmt.Errorf("mySeconds must be a positive integer no greater than %d", constraints.MaxSeconds)
	}
	return nil
}

func (t *TaskSubmitReq) HasReferenceMedia() bool {
	return t.HasImage() || len(t.ReferenceVideos) > 0 || len(t.ReferenceAudios) > 0
}
