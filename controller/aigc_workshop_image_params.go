package controller

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
)

const (
	aigcImageMinDimension      = 256
	aigcImageMaxDimension      = 3840
	aigcImageMaxCount          = 10
	aigcImageMaxReferenceCount = 9
)

type aigcWorkshopImageParameters struct {
	Model             string          `json:"model,omitempty"`
	N                 *uint           `json:"n,omitempty"`
	Size              string          `json:"size,omitempty"`
	Quality           string          `json:"quality,omitempty"`
	Seed              json.RawMessage `json:"seed,omitempty"`
	ResponseFormat    string          `json:"response_format,omitempty"`
	Background        string          `json:"background,omitempty"`
	Moderation        string          `json:"moderation,omitempty"`
	OutputFormat      string          `json:"output_format,omitempty"`
	OutputCompression *int            `json:"output_compression,omitempty"`
	PartialImages     *int            `json:"partial_images,omitempty"`
	Stream            *bool           `json:"stream,omitempty"`
	Image             json.RawMessage `json:"image,omitempty"`
	Images            json.RawMessage `json:"images,omitempty"`
	Mask              json.RawMessage `json:"mask,omitempty"`
	InputFidelity     string          `json:"input_fidelity,omitempty"`
}

func validateAigcWorkshopImageParameters(body []byte) error {
	_, err := normalizeAigcWorkshopImageRequest(body)
	return err
}

func normalizeAigcWorkshopImageRequest(body []byte) ([]byte, error) {
	var request aigcWorkshopImageParameters
	if err := common.Unmarshal(body, &request); err != nil {
		return nil, err
	}
	referenceImages, err := parseAigcReferenceImages(request.Image, request.Images)
	if err != nil {
		return nil, err
	}
	hasMask, err := validateAigcImageMask(request.Mask)
	if err != nil {
		return nil, err
	}

	if request.N != nil && (*request.N < 1 || *request.N > aigcImageMaxCount) {
		return nil, fmt.Errorf("n must be between 1 and %d", aigcImageMaxCount)
	}
	if err := validateGptImage2Size(request.Size); err != nil {
		return nil, err
	}
	if err := validateAigcImageOption("quality", request.Quality, "auto", "low", "medium", "high"); err != nil {
		return nil, err
	}
	if err := validateAigcImageOption("background", request.Background, "auto", "transparent", "opaque"); err != nil {
		return nil, err
	}
	if err := validateAigcImageOption("moderation", request.Moderation, "auto", "low"); err != nil {
		return nil, err
	}
	if err := validateAigcImageOption("output_format", request.OutputFormat, "png", "jpeg", "webp"); err != nil {
		return nil, err
	}
	if err := validateAigcImageOption("input_fidelity", request.InputFidelity, "low", "high"); err != nil {
		return nil, err
	}

	if hasAigcImageValue(request.Seed) {
		return nil, errors.New("seed is not supported by gpt-image-2")
	}
	if strings.TrimSpace(request.ResponseFormat) != "" {
		return nil, errors.New("response_format is not supported by gpt-image-2; use output_format")
	}
	if request.Stream != nil && *request.Stream {
		return nil, errors.New("streaming image responses are not supported by the AIGC workshop")
	}
	if request.PartialImages != nil && *request.PartialImages != 0 {
		return nil, errors.New("partial_images requires streaming and is not supported by the AIGC workshop")
	}
	if request.OutputCompression != nil {
		if *request.OutputCompression < 0 || *request.OutputCompression > 100 {
			return nil, errors.New("output_compression must be between 0 and 100")
		}
		if request.OutputFormat != "jpeg" && request.OutputFormat != "webp" {
			return nil, errors.New("output_compression is only supported for jpeg or webp output")
		}
	}
	if request.Background == "transparent" && request.OutputFormat == "jpeg" {
		return nil, errors.New("transparent background requires png or webp output")
	}

	hasReferenceImage := len(referenceImages) > 0
	if hasMask && !hasReferenceImage {
		return nil, errors.New("mask requires at least one reference image")
	}
	if request.InputFidelity != "" && !hasReferenceImage {
		return nil, errors.New("input_fidelity requires at least one reference image")
	}

	var payload map[string]json.RawMessage
	if err := common.Unmarshal(body, &payload); err != nil {
		return nil, err
	}
	normalizedModel := strings.ToLower(strings.TrimSpace(request.Model))
	if normalizedModel == "image-2" || normalizedModel == "gpt-image-2" || strings.HasPrefix(normalizedModel, "gpt-image-2-") {
		delete(payload, "input_fidelity")
	}
	delete(payload, "image")
	delete(payload, "images")
	if len(referenceImages) == 1 {
		encoded, err := common.Marshal(referenceImages[0])
		if err != nil {
			return nil, err
		}
		payload["image"] = encoded
	} else if len(referenceImages) > 1 {
		encoded, err := common.Marshal(referenceImages)
		if err != nil {
			return nil, err
		}
		payload["images"] = encoded
	}
	normalized, err := common.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return materializeAigcWorkshopImageReferences(normalized)
}

func parseAigcReferenceImages(fields ...json.RawMessage) ([]string, error) {
	references := make([]string, 0, aigcImageMaxReferenceCount)
	seen := make(map[string]bool)
	for _, raw := range fields {
		value := bytes.TrimSpace(raw)
		if len(value) == 0 || string(value) == "null" || string(value) == `""` || string(value) == "[]" {
			continue
		}

		var candidates []string
		switch value[0] {
		case '"':
			var reference string
			if err := common.Unmarshal(value, &reference); err != nil {
				return nil, errors.New("image references must be strings")
			}
			candidates = []string{reference}
		case '[':
			if err := common.Unmarshal(value, &candidates); err != nil {
				return nil, errors.New("image references must be strings")
			}
		default:
			return nil, errors.New("image and images must be a string or an array of strings")
		}

		for _, candidate := range candidates {
			candidate = strings.TrimSpace(candidate)
			if candidate == "" {
				return nil, errors.New("image references must not be empty")
			}
			if seen[candidate] {
				continue
			}
			seen[candidate] = true
			references = append(references, candidate)
			if len(references) > aigcImageMaxReferenceCount {
				return nil, fmt.Errorf("image references cannot exceed %d", aigcImageMaxReferenceCount)
			}
		}
	}
	return references, nil
}

func validateAigcImageMask(raw json.RawMessage) (bool, error) {
	value := bytes.TrimSpace(raw)
	if len(value) == 0 || string(value) == "null" || string(value) == `""` {
		return false, nil
	}
	if value[0] != '"' {
		return false, errors.New("mask must be a string")
	}
	var mask string
	if err := common.Unmarshal(value, &mask); err != nil {
		return false, errors.New("mask must be a string")
	}
	if strings.TrimSpace(mask) == "" {
		return false, errors.New("mask must not be empty")
	}
	return true, nil
}

func validateGptImage2Size(size string) error {
	size = strings.TrimSpace(strings.ToLower(size))
	if size == "" || size == "auto" {
		return nil
	}
	parts := strings.Split(size, "x")
	if len(parts) != 2 {
		return errors.New("size must use WIDTHxHEIGHT format")
	}
	width, err := strconv.Atoi(parts[0])
	if err != nil {
		return errors.New("size width must be an integer")
	}
	height, err := strconv.Atoi(parts[1])
	if err != nil {
		return errors.New("size height must be an integer")
	}
	if width < aigcImageMinDimension || height < aigcImageMinDimension || width > aigcImageMaxDimension || height > aigcImageMaxDimension {
		return fmt.Errorf("size dimensions must be between %d and %d", aigcImageMinDimension, aigcImageMaxDimension)
	}
	if width%16 != 0 || height%16 != 0 {
		return errors.New("size dimensions must be multiples of 16")
	}
	longEdge := width
	shortEdge := height
	if height > width {
		longEdge = height
		shortEdge = width
	}
	if longEdge > shortEdge*3 {
		return errors.New("size aspect ratio must not exceed 3:1")
	}
	return nil
}

func validateAigcImageOption(field string, value string, allowed ...string) error {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	for _, candidate := range allowed {
		if value == candidate {
			return nil
		}
	}
	return fmt.Errorf("%s must be one of %s", field, strings.Join(allowed, ", "))
}

func aigcImageOutputMIMEType(body []byte) string {
	var request struct {
		OutputFormat string `json:"output_format"`
	}
	if err := common.Unmarshal(body, &request); err != nil {
		return "image/png"
	}
	switch strings.ToLower(strings.TrimSpace(request.OutputFormat)) {
	case "jpeg":
		return "image/jpeg"
	case "webp":
		return "image/webp"
	default:
		return "image/png"
	}
}
