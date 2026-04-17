package main

import (
	"context"
	"flag"
	"log/slog"
	"net/http"
	"os"
	"time"

	"guardmap/internal/api"
	"guardmap/internal/discovery"
)

func main() {
	addr := flag.String("addr", ":8080", "HTTP listen address")
	kubeconfig := flag.String("kubeconfig", "", "Path to kubeconfig (empty = in-cluster or ~/.kube/config)")
	flag.Parse()

	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	ctx := context.Background()

	k8sDisc, err := discovery.NewK8sDiscovery(*kubeconfig)
	if err != nil {
		slog.Error("failed to init k8s discovery", "err", err)
		os.Exit(1)
	}

	iamDisc, err := discovery.NewIAMDiscovery(ctx)
	if err != nil {
		slog.Error("failed to init IAM discovery", "err", err)
		os.Exit(1)
	}

	builder := discovery.NewGraphBuilder(k8sDisc, iamDisc)
	handler := api.NewHandler(builder)

	mux := http.NewServeMux()
	handler.RegisterRoutes(mux)

	srv := &http.Server{
		Addr:         *addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 90 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	slog.Info("GuardMap backend starting", "addr", *addr)
	if err := srv.ListenAndServe(); err != nil {
		slog.Error("server error", "err", err)
		os.Exit(1)
	}
}
