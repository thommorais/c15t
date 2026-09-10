// Package sdk is a Go client for the consent API.
package sdk

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
	userAgent  string
}

type Option func(*Client)

func WithHTTPClient(c *http.Client) Option {
	return func(cl *Client) { cl.httpClient = c }
}

func WithUserAgent(ua string) Option {
	return func(cl *Client) { cl.userAgent = ua }
}

func New(baseURL, apiKey string, opts ...Option) (*Client, error) {
	if baseURL == "" {
		return nil, errors.New("sdk: baseURL is required")
	}
	if apiKey == "" {
		return nil, errors.New("sdk: apiKey is required")
	}
	if _, err := url.Parse(baseURL); err != nil {
		return nil, fmt.Errorf("sdk: invalid baseURL: %w", err)
	}

	c := &Client{
		baseURL:    strings.TrimRight(baseURL, "/"),
		apiKey:     apiKey,
		httpClient: &http.Client{Timeout: 10 * time.Second},
		userAgent:  "c15t-go-sdk",
	}

	for _, opt := range opts {
		opt(c)
	}

	return c, nil
}

type Location struct {
	CountryCode string `json:"countryCode,omitempty"`
	RegionCode  string `json:"regionCode,omitempty"`
}

type PolicyDecision struct {
	PolicyID     string `json:"policyId"`
	Fingerprint  string `json:"fingerprint"`
	MatchedBy    string `json:"matchedBy"`
	Jurisdiction string `json:"jurisdiction"`
}

type ResolvedConsent struct {
	ExpiryDays            *int     `json:"expiryDays,omitempty"`
	ScopeMode             string   `json:"scopeMode"`
	Categories            []string `json:"categories,omitempty"`
	PreselectedCategories []string `json:"preselectedCategories,omitempty"`
	GPC                   *bool    `json:"gpc,omitempty"`
}

type ResolvedPolicy struct {
	ID      string           `json:"id"`
	Model   string           `json:"model"`
	Consent *ResolvedConsent `json:"consent,omitempty"`
	UI      json.RawMessage  `json:"ui,omitempty"`
	Proof   json.RawMessage  `json:"proof,omitempty"`
}

type InitResult struct {
	Jurisdiction  string          `json:"jurisdiction"`
	Location      Location        `json:"location"`
	Policy        *ResolvedPolicy `json:"policy,omitempty"`
	Decision      *PolicyDecision `json:"policyDecision,omitempty"`
	SnapshotToken string          `json:"policySnapshotToken,omitempty"`
}

// GeoHints override the geo headers the server would otherwise read from the
// request, which is needed when the SDK calls on behalf of an end user.
type GeoHints struct {
	CountryCode string
	RegionCode  string
	GPCSignal   bool
	ForwardedIP string
	UserAgent   string
}

func (c *Client) Init(ctx context.Context, geo GeoHints) (*InitResult, error) {
	var out InitResult
	if err := c.do(ctx, http.MethodGet, "/api/c15t/init", nil, geo, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

type ConsentRequest struct {
	SubjectID     string         `json:"subjectId,omitempty"`
	ExternalID    string         `json:"externalId,omitempty"`
	Domain        string         `json:"domain"`
	Categories    []string       `json:"categories"`
	PolicyType    string         `json:"policyType,omitempty"`
	UISource      string         `json:"uiSource,omitempty"`
	Action        string         `json:"action,omitempty"`
	TCString      string         `json:"tcString,omitempty"`
	GivenAt       *time.Time     `json:"givenAt,omitempty"`
	SnapshotToken string         `json:"policySnapshotToken,omitempty"`
	Metadata      map[string]any `json:"metadata,omitempty"`
}

type ConsentRecord struct {
	ID         string     `json:"id"`
	SubjectID  string     `json:"subjectId"`
	PolicyID   string     `json:"policyId"`
	GivenAt    time.Time  `json:"givenAt"`
	ValidUntil *time.Time `json:"validUntil,omitempty"`
	Action     string     `json:"action,omitempty"`
	Duplicate  bool       `json:"duplicate,omitempty"`
}

func (c *Client) RecordConsent(ctx context.Context, req ConsentRequest, geo GeoHints) (*ConsentRecord, error) {
	if req.Domain == "" {
		return nil, errors.New("sdk: domain is required")
	}
	if req.SubjectID == "" && req.ExternalID == "" {
		return nil, errors.New("sdk: subjectId or externalId is required")
	}

	var out ConsentRecord
	if err := c.do(ctx, http.MethodPost, "/api/c15t/consent", req, geo, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *Client) ListConsent(ctx context.Context, subjectID string) ([]ConsentRecord, error) {
	if subjectID == "" {
		return nil, errors.New("sdk: subjectId is required")
	}

	var out struct {
		Consents []ConsentRecord `json:"consents"`
	}
	path := "/api/c15t/consent/" + url.PathEscape(subjectID)
	if err := c.do(ctx, http.MethodGet, path, nil, GeoHints{}, &out); err != nil {
		return nil, err
	}
	return out.Consents, nil
}

// APIError carries the server's status and message for a failed call.
type APIError struct {
	StatusCode int
	Message    string
	Body       string
}

func (e *APIError) Error() string {
	if e.Message != "" {
		return fmt.Sprintf("sdk: %d %s", e.StatusCode, e.Message)
	}
	return fmt.Sprintf("sdk: %d", e.StatusCode)
}

func (e *APIError) IsUnauthorized() bool {
	return e.StatusCode == http.StatusUnauthorized
}

func (e *APIError) IsInvalidRequest() bool {
	return e.StatusCode == http.StatusBadRequest
}

func (c *Client) do(ctx context.Context, method, path string, body any, geo GeoHints, out any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("sdk: encode request: %w", err)
		}
		reader = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return fmt.Errorf("sdk: build request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("User-Agent", c.userAgent)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	applyGeoHints(req, geo)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("sdk: request failed: %w", err)
	}
	defer resp.Body.Close()

	payload, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("sdk: read response: %w", err)
	}

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return &APIError{
			StatusCode: resp.StatusCode,
			Message:    extractMessage(payload),
			Body:       string(payload),
		}
	}

	if out == nil {
		return nil
	}

	if err := json.Unmarshal(payload, out); err != nil {
		return fmt.Errorf("sdk: decode response: %w", err)
	}

	return nil
}

func applyGeoHints(req *http.Request, geo GeoHints) {
	if geo.CountryCode != "" {
		req.Header.Set("X-C15T-Country", geo.CountryCode)
	}
	if geo.RegionCode != "" {
		req.Header.Set("X-C15T-Region", geo.RegionCode)
	}
	if geo.GPCSignal {
		req.Header.Set("Sec-GPC", "1")
	}
	if geo.ForwardedIP != "" {
		req.Header.Set("X-Forwarded-For", geo.ForwardedIP)
	}
	if geo.UserAgent != "" {
		req.Header.Set("User-Agent", geo.UserAgent)
	}
}

func extractMessage(payload []byte) string {
	var body struct {
		Message string `json:"message"`
	}
	if err := json.Unmarshal(payload, &body); err != nil {
		return ""
	}
	return body.Message
}

type CheckResult struct {
	HasConsent     bool `json:"hasConsent"`
	IsLatestPolicy bool `json:"isLatestPolicy"`
}

// CheckConsent reports whether an external identity has already consented to
// each of the given policy types. It returns no identifiers, so it is safe to
// call before a banner is shown.
func (c *Client) CheckConsent(ctx context.Context, externalID string, types []string) (map[string]CheckResult, error) {
	if externalID == "" {
		return nil, errors.New("sdk: externalId is required")
	}
	if len(types) == 0 {
		return nil, errors.New("sdk: at least one type is required")
	}

	var out struct {
		Results map[string]CheckResult `json:"results"`
	}

	path := "/api/c15t/consents/check?externalId=" + url.QueryEscape(externalID) +
		"&type=" + url.QueryEscape(strings.Join(types, ","))

	if err := c.do(ctx, http.MethodGet, path, nil, GeoHints{}, &out); err != nil {
		return nil, err
	}

	return out.Results, nil
}
