package controller

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"sort"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
)

// buildAigcWorkshopImageEditMultipart bridges the workshop's JSON contract to
// the multipart contract used by OpenAI-compatible image edit endpoints. The
// browser sends uploaded references as data URLs; relays must receive those
// bytes as actual image parts or the provider silently treats the request as a
// text-only generation.
func buildAigcWorkshopImageEditMultipart(body []byte) ([]byte, string, error) {
	var payload map[string]json.RawMessage
	if err := common.Unmarshal(body, &payload); err != nil {
		return nil, "", err
	}

	references, err := parseAigcReferenceImages(payload["image"], payload["images"])
	if err != nil {
		return nil, "", err
	}
	if len(references) == 0 {
		return nil, "", errors.New("image is required")
	}

	images := make([]aigcMultipartImage, 0, len(references))
	for index, reference := range references {
		image, err := decodeAigcWorkshopDataImage(reference)
		if err != nil {
			return nil, "", fmt.Errorf("image reference %d: %w", index+1, err)
		}
		images = append(images, image)
	}

	var mask *aigcMultipartImage
	if raw, ok := payload["mask"]; ok && hasAigcImageValue(raw) {
		var maskReference string
		if err := common.Unmarshal(raw, &maskReference); err != nil {
			return nil, "", errors.New("mask must be a string")
		}
		decoded, err := decodeAigcWorkshopDataImage(maskReference)
		if err != nil {
			return nil, "", fmt.Errorf("mask: %w", err)
		}
		mask = &decoded
	}

	var output bytes.Buffer
	writer := multipart.NewWriter(&output)
	keys := make([]string, 0, len(payload))
	for key := range payload {
		if key != "image" && key != "images" && key != "mask" {
			keys = append(keys, key)
		}
	}
	sort.Strings(keys)
	for _, key := range keys {
		value, ok, err := aigcWorkshopFormValue(payload[key])
		if err != nil {
			_ = writer.Close()
			return nil, "", fmt.Errorf("%s: %w", key, err)
		}
		if ok {
			if err := writer.WriteField(key, value); err != nil {
				_ = writer.Close()
				return nil, "", err
			}
		}
	}

	imageField := "image"
	if len(images) > 1 {
		imageField = "image[]"
	}
	for index, image := range images {
		filename := fmt.Sprintf("reference-%d.%s", index+1, image.extension)
		if err := writeAigcWorkshopImagePart(writer, imageField, filename, image); err != nil {
			_ = writer.Close()
			return nil, "", err
		}
	}
	if mask != nil {
		if err := writeAigcWorkshopImagePart(writer, "mask", "mask."+mask.extension, *mask); err != nil {
			_ = writer.Close()
			return nil, "", err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	return output.Bytes(), writer.FormDataContentType(), nil
}

type aigcMultipartImage struct {
	data      []byte
	mimeType  string
	extension string
}

// installAigcWorkshopImageEditMultipart swaps a JSON body for a replayable
// multipart body for the duration of Relay. The returned function restores the
// original storage and request metadata so logging and asset persistence still
// read the workshop's JSON request.
func installAigcWorkshopImageEditMultipart(c *gin.Context) (func(), error) {
	if c == nil || c.Request == nil || !strings.HasPrefix(strings.ToLower(c.Request.Header.Get("Content-Type")), "application/json") {
		return func() {}, nil
	}
	originalStorage, err := common.GetBodyStorage(c)
	if err != nil {
		return nil, err
	}
	originalBody, err := originalStorage.Bytes()
	if err != nil {
		return nil, err
	}
	multipartBody, contentType, err := buildAigcWorkshopImageEditMultipart(originalBody)
	if err != nil {
		return nil, err
	}
	multipartStorage, err := common.CreateBodyStorage(multipartBody)
	if err != nil {
		return nil, err
	}
	originalContentType := c.Request.Header.Get("Content-Type")
	originalLength := c.Request.ContentLength
	originalRequestBody := c.Request.Body
	originalMultipartForm := c.Request.MultipartForm
	originalPostForm := c.Request.PostForm
	originalSavedContentType, hadSavedContentType := c.Get("_original_multipart_ct")
	c.Set(common.KeyBodyStorage, multipartStorage)
	c.Request.Body = io.NopCloser(multipartStorage)
	c.Request.ContentLength = int64(len(multipartBody))
	c.Request.Header.Set("Content-Type", contentType)

	restored := false
	return func() {
		if restored {
			return
		}
		restored = true
		_ = multipartStorage.Close()
		c.Set(common.KeyBodyStorage, originalStorage)
		c.Request.Body = originalRequestBody
		c.Request.ContentLength = originalLength
		c.Request.Header.Set("Content-Type", originalContentType)
		c.Request.MultipartForm = originalMultipartForm
		c.Request.PostForm = originalPostForm
		if hadSavedContentType {
			c.Set("_original_multipart_ct", originalSavedContentType)
		} else if c.Keys != nil {
			delete(c.Keys, "_original_multipart_ct")
		}
	}, nil
}

func decodeAigcWorkshopDataImage(reference string) (aigcMultipartImage, error) {
	reference = strings.TrimSpace(reference)
	if !strings.HasPrefix(strings.ToLower(reference), "data:") {
		return aigcMultipartImage{}, errors.New("must be an uploaded data URL")
	}
	comma := strings.IndexByte(reference, ',')
	if comma < 0 {
		return aigcMultipartImage{}, errors.New("invalid data URL")
	}
	header := reference[:comma]
	encoded := reference[comma+1:]
	parts := strings.Split(header, ";")
	if len(parts) < 2 || !strings.EqualFold(parts[1], "base64") {
		return aigcMultipartImage{}, errors.New("reference data URL must use base64")
	}
	mimeType := strings.ToLower(strings.TrimPrefix(strings.TrimSpace(parts[0]), "data:"))
	extension := map[string]string{"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}[mimeType]
	if extension == "" {
		return aigcMultipartImage{}, fmt.Errorf("unsupported image type %s", mimeType)
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		data, err = base64.RawStdEncoding.DecodeString(encoded)
	}
	if err != nil || len(data) == 0 {
		return aigcMultipartImage{}, errors.New("invalid base64 image data")
	}
	if int64(len(data)) > aigcReferenceAssetKinds["image"].maxBytes {
		return aigcMultipartImage{}, fmt.Errorf("image exceeds %d MB", aigcReferenceAssetKinds["image"].maxBytes/(1024*1024))
	}
	detected := normalizeAigcReferenceMIMEType(http.DetectContentType(data))
	if detected != mimeType {
		return aigcMultipartImage{}, fmt.Errorf("image content does not match %s", mimeType)
	}
	return aigcMultipartImage{data: data, mimeType: mimeType, extension: extension}, nil
}

func aigcWorkshopFormValue(raw json.RawMessage) (string, bool, error) {
	value := bytes.TrimSpace(raw)
	if len(value) == 0 || string(value) == "null" {
		return "", false, nil
	}
	if value[0] == '"' {
		var text string
		if err := common.Unmarshal(value, &text); err != nil {
			return "", false, err
		}
		return text, text != "", nil
	}
	return string(value), true, nil
}

func writeAigcWorkshopImagePart(writer *multipart.Writer, field, filename string, image aigcMultipartImage) error {
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, field, filename))
	header.Set("Content-Type", image.mimeType)
	part, err := writer.CreatePart(header)
	if err != nil {
		return err
	}
	_, err = part.Write(image.data)
	return err
}
