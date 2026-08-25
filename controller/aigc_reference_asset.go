package controller

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const aigcReferenceAssetRetention = 2 * time.Hour

const aigcReferenceAssetMaxRequestBytes = 466 * 1024 * 1024

var (
	aigcReferenceAssetDirectory = filepath.Join(os.TempDir(), "new-api-aigc-reference-assets")
	aigcReferenceAssetIDPattern = regexp.MustCompile(`^[a-f0-9]{32}\.(?:png|jpg|webp|gif|mp4|webm|weba|mov|mp3|wav|m4a|aac|ogg|flac)$`)
	aigcReferenceAssetKinds     = map[string]aigcReferenceAssetKind{
		"image": {
			maxBytes: 30 * 1024 * 1024,
			mimeExtensions: map[string]string{
				"image/png":  "png",
				"image/jpeg": "jpg",
				"image/webp": "webp",
				"image/gif":  "gif",
			},
		},
		"video": {
			maxBytes: 50 * 1024 * 1024,
			mimeExtensions: map[string]string{
				"video/mp4":       "mp4",
				"video/webm":      "webm",
				"video/quicktime": "mov",
			},
		},
		"audio": {
			maxBytes: 15 * 1024 * 1024,
			mimeExtensions: map[string]string{
				"audio/mpeg":  "mp3",
				"audio/wav":   "wav",
				"audio/x-wav": "wav",
				"audio/mp4":   "m4a",
				"audio/x-m4a": "m4a",
				"audio/aac":   "aac",
				"audio/ogg":   "ogg",
				"audio/webm":  "weba",
				"audio/flac":  "flac",
			},
		},
	}
	aigcReferenceAssetMIMETypes = map[string]string{
		".png":  "image/png",
		".jpg":  "image/jpeg",
		".webp": "image/webp",
		".gif":  "image/gif",
		".mp4":  "video/mp4",
		".webm": "video/webm",
		".weba": "audio/webm",
		".mov":  "video/quicktime",
		".mp3":  "audio/mpeg",
		".wav":  "audio/wav",
		".m4a":  "audio/mp4",
		".aac":  "audio/aac",
		".ogg":  "audio/ogg",
		".flac": "audio/flac",
	}
)

type aigcReferenceAssetKind struct {
	maxBytes       int64
	mimeExtensions map[string]string
}

type aigcReferenceAssetUpload struct {
	URL       string `json:"url"`
	Kind      string `json:"kind"`
	MIMEType  string `json:"mime_type"`
	Bytes     int64  `json:"bytes"`
	ExpiresAt int64  `json:"expires_at"`
	path      string
}

func UploadAigcReferenceAsset(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, aigcReferenceAssetMaxRequestBytes)
	form, err := c.MultipartForm()
	if err != nil {
		aigcReferenceAssetError(c, http.StatusBadRequest, "invalid reference upload")
		return
	}
	defer form.RemoveAll()
	files := form.File["file"]
	kinds := form.Value["kind"]
	if len(files) == 0 || len(files) != len(kinds) {
		aigcReferenceAssetError(c, http.StatusBadRequest, "reference file is required")
		return
	}
	if len(files) > 50 {
		aigcReferenceAssetError(c, http.StatusBadRequest, "reference upload supports at most 50 files")
		return
	}
	counts := map[string]int{}
	for index := range kinds {
		kinds[index] = strings.ToLower(strings.TrimSpace(kinds[index]))
		if _, ok := aigcReferenceAssetKinds[kinds[index]]; !ok {
			aigcReferenceAssetError(c, http.StatusBadRequest, "kind must be image, video, or audio")
			return
		}
		counts[kinds[index]]++
	}
	if counts["image"] > 30 || counts["video"] > 10 || counts["audio"] > 10 {
		aigcReferenceAssetError(c, http.StatusBadRequest, "reference upload supports at most 30 images, 10 videos, and 10 audios")
		return
	}

	if err = os.MkdirAll(aigcReferenceAssetDirectory, 0700); err != nil {
		aigcReferenceAssetError(c, http.StatusInternalServerError, "failed to initialize reference storage")
		return
	}
	cleanupExpiredAigcReferenceAssets(time.Now())
	uploads := make([]aigcReferenceAssetUpload, 0, len(files))
	for index, header := range files {
		upload, status, storeErr := storeAigcReferenceAsset(kinds[index], header)
		if storeErr != nil {
			for _, stored := range uploads {
				_ = os.Remove(stored.path)
			}
			aigcReferenceAssetError(c, status, storeErr.Error())
			return
		}
		uploads = append(uploads, upload)
	}
	scheduleAigcReferenceAssetCleanup(uploads)
	common.ApiSuccess(c, gin.H{"assets": uploads})
}

func storeAigcReferenceAsset(kindName string, header *multipart.FileHeader) (aigcReferenceAssetUpload, int, error) {
	kind := aigcReferenceAssetKinds[kindName]
	if header.Size <= 0 {
		return aigcReferenceAssetUpload{}, http.StatusBadRequest, errors.New("reference file is empty")
	}
	if header.Size > kind.maxBytes {
		return aigcReferenceAssetUpload{}, http.StatusRequestEntityTooLarge, fmt.Errorf("%s reference exceeds %d MB", kindName, kind.maxBytes/(1024*1024))
	}
	file, err := header.Open()
	if err != nil {
		return aigcReferenceAssetUpload{}, http.StatusBadRequest, errors.New("failed to read reference file")
	}
	defer file.Close()
	prefix := make([]byte, 512)
	prefixSize, readErr := io.ReadFull(file, prefix)
	if readErr != nil && !errors.Is(readErr, io.EOF) && !errors.Is(readErr, io.ErrUnexpectedEOF) {
		return aigcReferenceAssetUpload{}, http.StatusBadRequest, errors.New("failed to read reference file")
	}
	prefix = prefix[:prefixSize]
	mimeType, extension, err := aigcReferenceAssetType(kind, header.Header.Get("Content-Type"), prefix)
	if err != nil {
		return aigcReferenceAssetUpload{}, http.StatusBadRequest, err
	}

	assetID := strings.ReplaceAll(uuid.NewString(), "-", "") + "." + extension
	assetPath := filepath.Join(aigcReferenceAssetDirectory, assetID)
	output, err := os.OpenFile(assetPath, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return aigcReferenceAssetUpload{}, http.StatusInternalServerError, errors.New("failed to store reference file")
	}
	written, copyErr := io.Copy(output, io.LimitReader(io.MultiReader(bytes.NewReader(prefix), file), kind.maxBytes+1))
	closeErr := output.Close()
	if copyErr != nil || closeErr != nil || written > kind.maxBytes {
		_ = os.Remove(assetPath)
		if written > kind.maxBytes {
			return aigcReferenceAssetUpload{}, http.StatusRequestEntityTooLarge, fmt.Errorf("%s reference exceeds %d MB", kindName, kind.maxBytes/(1024*1024))
		}
		return aigcReferenceAssetUpload{}, http.StatusInternalServerError, errors.New("failed to store reference file")
	}
	publicURL, err := aigcReferenceAssetPublicURL(assetID)
	if err != nil {
		_ = os.Remove(assetPath)
		return aigcReferenceAssetUpload{}, http.StatusServiceUnavailable, err
	}
	return aigcReferenceAssetUpload{
		URL:       publicURL,
		Kind:      kindName,
		MIMEType:  mimeType,
		Bytes:     written,
		ExpiresAt: time.Now().Add(aigcReferenceAssetRetention).Unix(),
		path:      assetPath,
	}, http.StatusOK, nil
}

func GetAigcReferenceAsset(c *gin.Context) {
	assetID := strings.ToLower(strings.TrimSpace(c.Param("asset_id")))
	if !aigcReferenceAssetIDPattern.MatchString(assetID) {
		c.Status(http.StatusNotFound)
		return
	}
	assetPath := filepath.Join(aigcReferenceAssetDirectory, assetID)
	info, err := os.Lstat(assetPath)
	if err != nil || !info.Mode().IsRegular() {
		c.Status(http.StatusNotFound)
		return
	}
	remaining := time.Until(info.ModTime().Add(aigcReferenceAssetRetention))
	if remaining <= 0 {
		_ = os.Remove(assetPath)
		c.Status(http.StatusNotFound)
		return
	}

	mimeType := aigcReferenceAssetMIMETypes[strings.ToLower(filepath.Ext(assetID))]
	if mimeType == "" {
		c.Status(http.StatusNotFound)
		return
	}
	c.Header("Cache-Control", fmt.Sprintf("public, max-age=%d, immutable", max(1, int(remaining.Seconds()))))
	c.Header("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, assetID))
	c.Header("Content-Type", mimeType)
	c.Header("X-Content-Type-Options", "nosniff")
	c.File(assetPath)
}

func aigcReferenceAssetType(kind aigcReferenceAssetKind, declared string, prefix []byte) (string, string, error) {
	declared = normalizeAigcReferenceMIMEType(declared)
	detected := normalizeAigcReferenceMIMEType(http.DetectContentType(prefix))
	if extension, ok := kind.mimeExtensions[detected]; ok {
		return detected, extension, nil
	}
	if detected != "application/octet-stream" {
		return "", "", errors.New("reference file content does not match its media kind")
	}
	if extension, ok := kind.mimeExtensions[declared]; ok {
		return declared, extension, nil
	}
	return "", "", errors.New("unsupported reference media type")
}

func normalizeAigcReferenceMIMEType(value string) string {
	mediaType, _, err := mime.ParseMediaType(strings.TrimSpace(value))
	if err != nil {
		return strings.ToLower(strings.TrimSpace(value))
	}
	return strings.ToLower(mediaType)
}

func aigcReferenceAssetPublicURL(assetID string) (string, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(system_setting.ServerAddress), "/")
	parsed, err := url.Parse(baseURL)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", errors.New("configure ServerAddress with the public http(s) origin before uploading references")
	}
	parsed.Path = strings.TrimRight(parsed.Path, "/") + "/api/aigc/reference-assets/" + assetID
	parsed.RawPath = ""
	parsed.RawQuery = ""
	parsed.Fragment = ""
	return parsed.String(), nil
}

func cleanupExpiredAigcReferenceAssets(now time.Time) {
	entries, err := os.ReadDir(aigcReferenceAssetDirectory)
	if err != nil {
		return
	}
	cutoff := now.Add(-aigcReferenceAssetRetention)
	for _, entry := range entries {
		if entry.IsDir() || !aigcReferenceAssetIDPattern.MatchString(strings.ToLower(entry.Name())) {
			continue
		}
		info, err := entry.Info()
		if err == nil && info.ModTime().Before(cutoff) {
			_ = os.Remove(filepath.Join(aigcReferenceAssetDirectory, entry.Name()))
		}
	}
}

func scheduleAigcReferenceAssetCleanup(uploads []aigcReferenceAssetUpload) {
	paths := make([]string, 0, len(uploads))
	for _, upload := range uploads {
		paths = append(paths, upload.path)
	}
	time.AfterFunc(aigcReferenceAssetRetention, func() {
		for _, path := range paths {
			_ = os.Remove(path)
		}
	})
}

func aigcReferenceAssetError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{
		"success": false,
		"message": message,
	})
}
