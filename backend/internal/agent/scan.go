package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"time"

	"guardmap/internal/discovery"
)

// RunScan performs a full cluster scan and submits results to Supabase.
// Extracted as a standalone function so the future daemon can call it on a ticker
// without any changes to the business logic.
func RunScan(ctx context.Context, cfg Config) error {
	start := time.Now()

	k8sDisc, err := discovery.NewK8sDiscovery(cfg.Kubeconfig)
	if err != nil {
		return fmt.Errorf("k8s init: %w", err)
	}

	iamDisc, iamErr := discovery.NewIAMDiscovery(ctx)
	if iamErr != nil {
		slog.Warn("IAM discovery unavailable, K8s-only scan", "err", iamErr)
		iamDisc = nil
	}

	snap, err := k8sDisc.DiscoverCluster(ctx)
	if err != nil {
		return fmt.Errorf("cluster discovery: %w", err)
	}

	builder := discovery.NewGraphBuilder(k8sDisc, iamDisc)
	graph, err := builder.Build(ctx)
	if err != nil {
		return fmt.Errorf("graph build: %w", err)
	}

	clusterInfo := snap.Info()
	report := discovery.ScanSecurity(snap, graph)
	score := computeScore(report.Critical, report.High, report.Medium, report.Low)
	durationMs := int(time.Since(start).Milliseconds())

	slog.Info("scan complete",
		"nodes", len(graph.Nodes),
		"edges", len(graph.Edges),
		"findings", len(report.Findings),
		"score", score,
		"critical", report.Critical,
		"high", report.High,
		"medium", report.Medium,
		"low", report.Low,
		"duration_ms", durationMs,
	)

	findingsJSON, err := json.Marshal(report.Findings)
	if err != nil {
		return fmt.Errorf("marshal findings: %w", err)
	}

	// Fetch notification config before submitting so we capture the PREVIOUS scan's findings.
	notifCfg, notifErr := getNotificationConfig(ctx, cfg)
	if notifErr != nil {
		slog.Warn("failed to fetch notification config, skipping Slack", "err", notifErr)
		notifCfg = notificationConfig{}
	}

	scanID, err := submitScan(ctx, cfg, graph, findingsJSON, score,
		report.Critical, report.High, report.Medium, report.Low, durationMs,
		clusterInfo.K8sVersion, clusterInfo.NodeCount, clusterInfo.Region)
	if err != nil {
		return fmt.Errorf("submit scan: %w", err)
	}

	slog.Info("scan submitted", "scan_id", scanID)

	if notifCfg.WebhookURL != "" {
		newFindings := diffFindings(report.Findings, notifCfg.LastFindings)
		if len(newFindings) > 0 {
			if slackErr := sendSlackNotification(ctx, notifCfg.WebhookURL, cfg.ClusterName, newFindings, notifCfg.LastScore, score, cfg.DashboardURL); slackErr != nil {
				slog.Warn("failed to send Slack notification", "err", slackErr)
			} else {
				slog.Info("Slack notification sent", "new_findings", len(newFindings))
			}
		}
	}

	return nil
}

type notificationConfig struct {
	WebhookURL   string              `json:"webhook_url"`
	LastFindings []discovery.Finding `json:"last_findings"`
	LastScore    int                 `json:"last_score"`
}

func getNotificationConfig(ctx context.Context, cfg Config) (notificationConfig, error) {
	return callRPC[notificationConfig](ctx, cfg, "get_notification_config", map[string]any{
		"p_api_key":      cfg.APIKey,
		"p_cluster_name": cfg.ClusterName,
	})
}

func computeScore(critical, high, medium, low int) int {
	deduct := func(count int, perIssue, cap float64) float64 {
		if count == 0 {
			return 0
		}
		return math.Min(cap, perIssue*(1-math.Pow(0.75, float64(count)))/0.25)
	}
	score := 100.0 -
		deduct(critical, 18, 42) -
		deduct(high, 10, 28) -
		deduct(medium, 4, 14) -
		deduct(low, 1, 6)
	return int(math.Round(math.Max(0, score)))
}

func submitScan(
	ctx context.Context,
	cfg Config,
	graph any,
	findingsJSON json.RawMessage,
	score, critical, high, medium, low, durationMs int,
	k8sVersion string, nodeCount int, region string,
) (string, error) {
	graphJSON, err := json.Marshal(graph)
	if err != nil {
		return "", fmt.Errorf("marshal graph: %w", err)
	}

	payload := map[string]any{
		"p_api_key":        cfg.APIKey,
		"p_cluster_name":   cfg.ClusterName,
		"p_graph_data":     json.RawMessage(graphJSON),
		"p_findings":       findingsJSON,
		"p_security_score": score,
		"p_critical_count": critical,
		"p_high_count":     high,
		"p_medium_count":   medium,
		"p_low_count":      low,
		"p_duration_ms":    durationMs,
		"p_k8s_version":    k8sVersion,
		"p_node_count":     nodeCount,
		"p_region":         region,
	}

	return callRPC[string](ctx, cfg, "submit_scan", payload)
}

func callRPC[T any](ctx context.Context, cfg Config, fn string, payload any) (T, error) {
	var zero T
	body, err := json.Marshal(payload)
	if err != nil {
		return zero, fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		cfg.SupabaseURL+"/rest/v1/rpc/"+fn, bytes.NewReader(body))
	if err != nil {
		return zero, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", cfg.AnonKey)
	req.Header.Set("Authorization", "Bearer "+cfg.AnonKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return zero, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	// 204 No Content = void RPC succeeded
	if resp.StatusCode == http.StatusNoContent {
		return zero, nil
	}
	if resp.StatusCode != http.StatusOK {
		return zero, fmt.Errorf("supabase %d: %s", resp.StatusCode, respBody)
	}

	var result T
	if err := json.Unmarshal(respBody, &result); err != nil {
		return zero, fmt.Errorf("parse response: %w", err)
	}
	return result, nil
}
