package migrate

import (
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"strings"
)

//go:embed sql/*.sql
var files embed.FS

func Up(db *sql.DB) error {
	if _, err := db.Exec(`
CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
)`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}

	entries, err := fs.ReadDir(files, "sql")
	if err != nil {
		return err
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(entry.Name(), ".sql") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var exists int
		if err := db.QueryRow(`SELECT COUNT(1) FROM schema_migrations WHERE version = ?`, name).Scan(&exists); err != nil {
			return err
		}
		if exists > 0 {
			continue
		}
		body, err := files.ReadFile("sql/" + name)
		if err != nil {
			return err
		}
		if _, err := db.Exec(string(body)); err != nil {
			return fmt.Errorf("apply %s: %w", name, err)
		}
		if _, err := db.Exec(`INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))`, name); err != nil {
			return err
		}
	}
	return nil
}
