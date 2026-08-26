package controller

import (
	"bytes"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestNormalizeAigcWorkshopImageRequestOmitsGptImage2InputFidelity(t *testing.T) {
	body := []byte(`{"model":"gpt-image-2","prompt":"keep the subject","image":"data:image/png;base64,AAAA","input_fidelity":"low"}`)

	normalized, err := normalizeAigcWorkshopImageRequest(body)
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, common.Unmarshal(normalized, &payload))
	require.Equal(t, "data:image/png;base64,AAAA", payload["image"])
	require.NotContains(t, payload, "input_fidelity")
}

func TestNormalizeAigcWorkshopImageRequestMaterializesLocalReferenceAssetURL(t *testing.T) {
	originalDirectory := aigcReferenceAssetDirectory
	originalServerAddress := system_setting.ServerAddress
	t.Cleanup(func() {
		aigcReferenceAssetDirectory = originalDirectory
		system_setting.ServerAddress = originalServerAddress
	})

	aigcReferenceAssetDirectory = t.TempDir()
	system_setting.ServerAddress = "https://api.example.test"
	assetID := "0123456789abcdef0123456789abcdef.jpg"
	assetBytes := []byte("reference-image-bytes")
	require.NoError(t, os.WriteFile(filepath.Join(aigcReferenceAssetDirectory, assetID), assetBytes, 0600))

	body, err := normalizeAigcWorkshopImageRequest([]byte(`{"model":"gpt-image-2","prompt":"replace background","image":"https://api.example.test/api/aigc/reference-assets/0123456789abcdef0123456789abcdef.jpg"}`))
	require.NoError(t, err)

	var payload map[string]string
	require.NoError(t, common.Unmarshal(body, &payload))
	require.Equal(t, "data:image/jpeg;base64,"+base64.StdEncoding.EncodeToString(assetBytes), payload["image"])
}

func TestBuildAigcWorkshopImageEditMultipartIncludesReferenceFile(t *testing.T) {
	imageBytes := []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0xff, 0xd9}
	body, err := common.Marshal(map[string]any{
		"model":         "gpt-image-2",
		"prompt":        "replace the background",
		"image":         "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(imageBytes),
		"n":             1,
		"size":          "1024x1536",
		"quality":       "low",
		"output_format": "png",
	})
	require.NoError(t, err)

	multipartBody, contentType, err := buildAigcWorkshopImageEditMultipart(body)
	require.NoError(t, err)
	require.Contains(t, contentType, "multipart/form-data")

	request, err := http.NewRequest(http.MethodPost, "/v1/images/edits", bytes.NewReader(multipartBody))
	require.NoError(t, err)
	request.Header.Set("Content-Type", contentType)
	require.NoError(t, request.ParseMultipartForm(32<<20))
	t.Cleanup(func() { _ = request.MultipartForm.RemoveAll() })
	require.Equal(t, "gpt-image-2", request.PostForm.Get("model"))
	require.Equal(t, "replace the background", request.PostForm.Get("prompt"))
	require.Equal(t, "1", request.PostForm.Get("n"))
	require.Equal(t, "1024x1536", request.PostForm.Get("size"))
	require.Equal(t, "png", request.PostForm.Get("output_format"))
	require.Len(t, request.MultipartForm.File["image"], 1)

	file, err := request.MultipartForm.File["image"][0].Open()
	require.NoError(t, err)
	defer file.Close()
	actual, err := io.ReadAll(file)
	require.NoError(t, err)
	require.Equal(t, imageBytes, actual)
	require.Equal(t, "image/jpeg", request.MultipartForm.File["image"][0].Header.Get("Content-Type"))
}

func TestInstallAigcWorkshopImageEditMultipartReplacesAndRestoresRequest(t *testing.T) {
	gin.SetMode(gin.TestMode)
	imageBytes := []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00, 0x01, 0xff, 0xd9}
	body, err := common.Marshal(map[string]any{
		"model":  "gpt-image-2",
		"prompt": "replace the background",
		"image":  "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(imageBytes),
	})
	require.NoError(t, err)

	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	c.Request = httptest.NewRequest(http.MethodPost, "/api/aigc/images/generations", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	originalStorage, err := common.CreateBodyStorage(body)
	require.NoError(t, err)
	defer originalStorage.Close()
	c.Set(common.KeyBodyStorage, originalStorage)

	restore, err := installAigcWorkshopImageEditMultipart(c)
	require.NoError(t, err)
	require.Contains(t, c.Request.Header.Get("Content-Type"), "multipart/form-data")
	require.Greater(t, c.Request.ContentLength, int64(len(imageBytes)))
	requestStorage, err := common.GetBodyStorage(c)
	require.NoError(t, err)
	require.NotSame(t, originalStorage, requestStorage)

	restore()
	require.Equal(t, "application/json", c.Request.Header.Get("Content-Type"))
	restoredStorage, err := common.GetBodyStorage(c)
	require.NoError(t, err)
	require.Same(t, originalStorage, restoredStorage)
	restoredBody, err := restoredStorage.Bytes()
	require.NoError(t, err)
	require.Equal(t, body, restoredBody)
}

func TestNormalizeAigcWorkshopImageRequestPreservesLegacyInputFidelity(t *testing.T) {
	body := []byte(`{"model":"gpt-image-1","prompt":"keep the subject","image":"data:image/png;base64,AAAA","input_fidelity":"high"}`)

	normalized, err := normalizeAigcWorkshopImageRequest(body)
	require.NoError(t, err)

	var payload map[string]any
	require.NoError(t, common.Unmarshal(normalized, &payload))
	require.Equal(t, "high", payload["input_fidelity"])
}
