package agent

import (
	"context"
	"fmt"
	"log/slog"
)

// SendHeartbeat updates last_seen_at for the cluster.
// Called by the heartbeat CronJob every 5 min.
// The future daemon will call this on a 60s ticker instead.
func SendHeartbeat(ctx context.Context, cfg Config) error {
	_, err := callRPC[any](ctx, cfg, "update_heartbeat", map[string]any{
		"p_api_key":      cfg.APIKey,
		"p_cluster_name": cfg.ClusterName,
	})
	if err != nil {
		return fmt.Errorf("heartbeat: %w", err)
	}
	slog.Info("heartbeat sent", "cluster", cfg.ClusterName)
	return nil
}
