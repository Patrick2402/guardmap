package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"time"

	"guardmap/internal/discovery"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	apiKey      := mustEnv("GUARDMAP_API_KEY")
	supabaseURL := mustEnv("SUPABASE_URL")
	anonKey     := mustEnv("SUPABASE_ANON_KEY")
	clusterName := mustEnv("CLUSTER_NAME")
	kubeconfig  := os.Getenv("KUBECONFIG")

	ctx   := context.Background()
	start := time.Now()

	k8sDisc, err := discovery.NewK8sDiscovery(kubeconfig)
	if err != nil {
		slog.Error("k8s init failed", "err", err)
		os.Exit(1)
	}

	// IAM is optional — minikube/non-EKS clusters won't have AWS creds
	iamDisc, iamErr := discovery.NewIAMDiscovery(ctx)
	if iamErr != nil {
		slog.Warn("IAM discovery unavailable, K8s-only scan", "err", iamErr)
		iamDisc = nil
	}

	// Discover cluster resources
	snap, err := k8sDisc.DiscoverCluster(ctx)
	if err != nil {
		slog.Error("cluster discovery failed", "err", err)
		os.Exit(1)
	}

	// Build graph (for IAM edges and frontend visualisation)
	builder := discovery.NewGraphBuilder(k8sDisc, iamDisc)
	graph, err := builder.Build(ctx)
	if err != nil {
		slog.Error("graph build failed", "err", err)
		os.Exit(1)
	}

	// Run comprehensive security scan
	clusterInfo := snap.Info()
	report      := discovery.ScanSecurity(snap, graph)
	score        := computeScore(report.Critical, report.High, report.Medium, report.Low)
	durationMs  := int(time.Since(start).Milliseconds())

	slog.Info("scan complete",
		"nodes", len(graph.Nodes),
		"edges", len(graph.Edges),
		"findings", len(report.Findings),
		"score", score,
		"critical", report.Critical,
		"high", report.High,
		"medium", report.Medium,
		"low", report.Low,
		"k8s_version", clusterInfo.K8sVersion,
		"node_count", clusterInfo.NodeCount,
		"region", clusterInfo.Region,
		"duration_ms", durationMs,
	)

	findingsJSON, err := json.Marshal(report.Findings)
	if err != nil {
		slog.Error("marshal findings failed", "err", err)
		os.Exit(1)
	}

	scanID, err := submitScan(ctx, supabaseURL, anonKey, apiKey, clusterName, graph,
		findingsJSON, score, report.Critical, report.High, report.Medium, report.Low, durationMs,
		clusterInfo.K8sVersion, clusterInfo.NodeCount, clusterInfo.Region)
	if err != nil {
		slog.Error("submit failed", "err", err)
		os.Exit(1)
	}

	slog.Info("scan submitted", "scan_id", scanID)
}

// computeScore mirrors the diminishing-returns formula in OverviewView.tsx exactly.
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
	supabaseURL, anonKey, apiKey, clusterName string,
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
		"p_api_key":        apiKey,
		"p_cluster_name":   clusterName,
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

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("marshal payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		supabaseURL+"/rest/v1/rpc/submit_scan", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("apikey", anonKey)
	req.Header.Set("Authorization", "Bearer "+anonKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("supabase returned %d: %s", resp.StatusCode, respBody)
	}

	var scanID string
	if err := json.Unmarshal(respBody, &scanID); err != nil {
		return "", fmt.Errorf("parse response: %w", err)
	}
	return scanID, nil
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required env var missing", "key", key)
		os.Exit(1)
	}
	return v
}
