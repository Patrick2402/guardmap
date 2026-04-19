package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sort"
	"strings"
	"time"

	"guardmap/internal/discovery"
)

func sendSlackNotification(
	ctx context.Context,
	webhookURL string,
	clusterName string,
	newFindings []discovery.Finding,
	prevScore, currScore int,
	dashboardURL string,
) error {
	payload := buildSlackPayload(clusterName, newFindings, prevScore, currScore, dashboardURL)
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal slack payload: %w", err)
	}

	var lastErr error
	delays := []time.Duration{0, 2 * time.Second, 4 * time.Second}
	for attempt, delay := range delays {
		if delay > 0 {
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				return ctx.Err()
			}
		}
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")

		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("attempt %d: %w", attempt+1, err)
			slog.Warn("slack attempt failed", "attempt", attempt+1, "err", err)
			continue
		}
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK {
			return nil
		}
		lastErr = fmt.Errorf("attempt %d: slack returned %d", attempt+1, resp.StatusCode)
		slog.Warn("slack attempt failed", "attempt", attempt+1, "status", resp.StatusCode)
	}
	return lastErr
}

func buildSlackPayload(clusterName string, findings []discovery.Finding, prevScore, currScore int, dashboardURL string) map[string]any {
	// Count per severity
	counts := map[string]int{}
	for _, f := range findings {
		counts[f.Severity]++
	}

	// Sort: critical → high → medium → low
	sorted := make([]discovery.Finding, len(findings))
	copy(sorted, findings)
	sort.Slice(sorted, func(i, j int) bool {
		return sevOrder(sorted[i].Severity) < sevOrder(sorted[j].Severity)
	})

	// Top 10 to display
	display := sorted
	truncated := 0
	if len(display) > 10 {
		truncated = len(display) - 10
		display = display[:10]
	}

	// Severity summary: 🔴 *9 critical*  ·  🟠 *44 high*  …
	var summaryParts []string
	for _, sev := range []string{"critical", "high", "medium", "low"} {
		if n := counts[sev]; n > 0 {
			summaryParts = append(summaryParts, fmt.Sprintf("%s  *%d %s*", severityEmoji(sev), n, sev))
		}
	}
	summary := strings.Join(summaryParts, "   ·   ")

	// Findings list — human-readable description + resource
	var lines string
	for _, f := range display {
		resource := truncateResource(f.Resource, 40)
		desc := f.Description
		if len(desc) > 72 {
			desc = desc[:69] + "…"
		}
		lines += fmt.Sprintf("\n%s  %s  —  `%s`", severityEmoji(f.Severity), desc, resource)
	}
	if truncated > 0 {
		lines += fmt.Sprintf("\n_...and %d more_", truncated)
	}

	// Score line
	var scoreText string
	switch {
	case currScore < prevScore:
		scoreText = fmt.Sprintf(":arrow_down:  Score dropped:  *%d*  →  *%d*", prevScore, currScore)
	case currScore > prevScore:
		scoreText = fmt.Sprintf(":arrow_up:  Score improved:  *%d*  →  *%d*", prevScore, currScore)
	default:
		scoreText = fmt.Sprintf(":white_small_square:  Security score:  *%d*", currScore)
	}

	blocks := []map[string]any{
		{
			"type": "header",
			"text": map[string]any{
				"type": "plain_text",
				"text": fmt.Sprintf("🚨  %d New Finding%s  —  %s", len(findings), pluralS(len(findings)), clusterName),
				"emoji": true,
			},
		},
		{
			"type": "section",
			"text": map[string]any{"type": "mrkdwn", "text": summary},
		},
		{"type": "divider"},
		{
			"type": "section",
			"text": map[string]any{"type": "mrkdwn", "text": "*Top findings:*  _description  —  resource_" + lines},
		},
		{"type": "divider"},
		{
			"type": "context",
			"elements": []map[string]any{
				{"type": "mrkdwn", "text": scoreText},
			},
		},
	}

	if dashboardURL != "" {
		blocks = append(blocks, map[string]any{
			"type": "actions",
			"elements": []map[string]any{
				{
					"type":  "button",
					"style": "primary",
					"text":  map[string]any{"type": "plain_text", "text": "View in GuardMap →", "emoji": true},
					"url":   dashboardURL + "/findings",
				},
			},
		})
	}

	return map[string]any{"blocks": blocks}
}

func diffFindings(current, previous []discovery.Finding) []discovery.Finding {
	prev := make(map[string]struct{}, len(previous))
	for _, f := range previous {
		prev[f.Type+"/"+f.Resource] = struct{}{}
	}
	var out []discovery.Finding
	for _, f := range current {
		if _, seen := prev[f.Type+"/"+f.Resource]; !seen {
			out = append(out, f)
		}
	}
	return out
}

func severityEmoji(sev string) string {
	switch sev {
	case "critical":
		return ":red_circle:"
	case "high":
		return ":large_orange_circle:"
	case "medium":
		return ":large_yellow_circle:"
	default:
		return ":large_blue_circle:"
	}
}

func sevOrder(sev string) int {
	switch sev {
	case "critical":
		return 0
	case "high":
		return 1
	case "medium":
		return 2
	default:
		return 3
	}
}

// truncateResource shortens long K8s resource paths to max n chars.
func truncateResource(r string, n int) string {
	if len(r) <= n {
		return r
	}
	parts := strings.SplitN(r, "/", 2)
	if len(parts) == 2 {
		ns := parts[0]
		rest := parts[1]
		avail := n - len(ns) - 4 // 4 = len("/…") + some padding
		if avail > 6 && len(rest) > avail {
			return ns + "/…" + rest[len(rest)-avail:]
		}
	}
	return r[:n-1] + "…"
}

func pluralS(n int) string {
	if n == 1 {
		return ""
	}
	return "s"
}
