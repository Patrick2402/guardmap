package agent

// Config holds everything both the scanner and heartbeat need.
// The future daemon will use the same struct — just call RunScan on a ticker.
type Config struct {
	APIKey      string
	SupabaseURL string
	AnonKey     string
	ClusterName string
	Kubeconfig   string // empty → in-cluster
	DashboardURL string // optional — shown as button in Slack alerts
}
