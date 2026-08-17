package service

import "github.com/Leshabeats/faultline/backend/internal/replaystore"

func exceedsStorageQuota(usage replaystore.Usage, additionalBytes int64, maxRecords int, maxBytes int64) bool {
	if maxRecords > 0 && usage.Records+1 > maxRecords {
		return true
	}
	if maxBytes > 0 && usage.Bytes+additionalBytes > maxBytes {
		return true
	}
	return false
}
