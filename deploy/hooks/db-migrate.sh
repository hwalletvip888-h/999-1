#!/usr/bin/env bash
# 在 deploy/remote-deploy.sh 里于 npm ci 之后调用。
# 当前仓库的 walletBackend 无持久化 DB；当你加入 Prisma 或 database/migrations/*.sql 时会自动执行。
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

if [[ -f prisma/schema.prisma ]] && command -v npx >/dev/null 2>&1; then
  echo "[db-migrate] 执行 prisma migrate deploy"
  npx prisma migrate deploy
  exit 0
fi

if [[ -n "${DATABASE_URL:-}" ]] && command -v psql >/dev/null 2>&1 && [[ -d database/migrations ]]; then
  shopt -s nullglob
  sqlfiles=(database/migrations/*.sql)
  shopt -u nullglob
  if ((${#sqlfiles[@]})); then
    while IFS= read -r f; do
      [[ -n "$f" ]] || continue
      echo "[db-migrate] psql $f"
      psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
    done < <(printf '%s\n' "${sqlfiles[@]}" | LC_ALL=C sort -V)
    exit 0
  fi
fi

echo "[db-migrate] 跳过（无 prisma/schema.prisma，或无 database/migrations/*.sql + DATABASE_URL + psql）"
exit 0
