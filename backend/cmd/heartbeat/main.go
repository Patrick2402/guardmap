package main

import (
	"context"
	"log/slog"
	"os"

	"guardmap/internal/agent"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	cfg := agent.Config{
		APIKey:      mustEnv("GUARDMAP_API_KEY"),
		SupabaseURL: mustEnv("SUPABASE_URL"),
		AnonKey:     mustEnv("SUPABASE_ANON_KEY"),
		ClusterName: mustEnv("CLUSTER_NAME"),
	}

	if err := agent.SendHeartbeat(context.Background(), cfg); err != nil {
		slog.Error("heartbeat failed", "err", err)
		os.Exit(1)
	}
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		slog.Error("required env var missing", "key", key)
		os.Exit(1)
	}
	return v
}
