FROM golang:1.23-alpine AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /guardmap-agent    ./cmd/agent/...
RUN CGO_ENABLED=0 GOOS=linux go build -o /guardmap-heartbeat ./cmd/heartbeat/...

FROM gcr.io/distroless/static:nonroot
COPY --from=builder /guardmap-agent     /guardmap-agent
COPY --from=builder /guardmap-heartbeat /guardmap-heartbeat
