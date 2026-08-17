# syntax=docker/dockerfile:1
FROM golang:1.22-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/faultline ./cmd/faultline

FROM alpine:3.20
RUN adduser -D -H faultline && mkdir -p /var/lib/faultline && chown faultline:faultline /var/lib/faultline
USER faultline
WORKDIR /home/faultline
COPY --from=build /out/faultline /usr/local/bin/faultline
ENV FAULTLINE_ENV=production \
    FAULTLINE_HTTP_ADDR=0.0.0.0:8787 \
    FAULTLINE_SQLITE_PATH=/var/lib/faultline/faultline.db \
    FAULTLINE_PUBLIC_SHARE_BASE=http://127.0.0.1:4173 \
    FAULTLINE_CORS_ORIGINS=http://127.0.0.1:4173
EXPOSE 8787
ENTRYPOINT ["/usr/local/bin/faultline"]
