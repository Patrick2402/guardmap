package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"guardmap/internal/discovery"
)

type Handler struct {
	graph *discovery.GraphBuilder
}

func NewHandler(graph *discovery.GraphBuilder) *Handler {
	return &Handler{graph: graph}
}

func (h *Handler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/map", h.handleMap)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
}

func (h *Handler) handleMap(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	graph, err := h.graph.Build(ctx)
	if err != nil {
		slog.Error("graph build failed", "err", err)
		http.Error(w, "discovery failed: "+err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*")

	if err := json.NewEncoder(w).Encode(graph); err != nil {
		slog.Error("json encode failed", "err", err)
	}
}
