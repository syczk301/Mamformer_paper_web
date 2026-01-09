import json
import sqlite3
import uuid
from pathlib import Path


SQLITE_DB = Path("api/mamformer.db")
OUT_SQL = Path("supabase/migrations/0002_seed_from_sqlite.sql")


def _q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def _uuid(u: str | None) -> str:
    if u is None:
        return "null"
    return _q(str(uuid.UUID(hex=u)))


def _ts(v: str | None) -> str:
    if v is None:
        return "null"
    return _q(v) + "::timestamptz"


def _jsonb(v: str | None) -> str:
    if v is None:
        return "null"
    json.loads(v)
    return _q(v) + "::jsonb"


def main() -> None:
    if not SQLITE_DB.exists():
        raise SystemExit(f"SQLite DB not found: {SQLITE_DB}")

    OUT_SQL.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(SQLITE_DB))
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()

    lines: list[str] = []
    lines.append("begin;")

    cur.execute("select * from users")
    users = cur.fetchall()
    user_ids_hex = {r["id"] for r in users}
    for r in users:
        lines.append(
            "insert into public.users (id, username, email, password_hash, role, created_at, updated_at) values ("
            + ", ".join(
                [
                    _uuid(r["id"]),
                    _q(r["username"]),
                    _q(r["email"]),
                    _q(r["password_hash"]),
                    _q(r["role"]),
                    _ts(r["created_at"]),
                    _ts(r["updated_at"]),
                ]
            )
            + ") on conflict (id) do nothing;"
        )

    cur.execute("select * from data_files")
    data_files = cur.fetchall()
    data_file_ids_hex = {r["id"] for r in data_files}
    for r in data_files:
        lines.append(
            "insert into public.data_files (id, user_id, filename, file_path, rows, columns, column_info, uploaded_at) values ("
            + ", ".join(
                [
                    _uuid(r["id"]),
                    _uuid(r["user_id"]),
                    _q(r["filename"]),
                    _q(r["file_path"]),
                    str(int(r["rows"])),
                    str(int(r["columns"])),
                    _jsonb(r["column_info"]),
                    _ts(r["uploaded_at"]),
                ]
            )
            + ") on conflict (id) do nothing;"
        )

    cur.execute("select * from training_tasks")
    tasks = cur.fetchall()
    kept_task_ids_hex: set[str] = set()
    for r in tasks:
        if r["user_id"] not in user_ids_hex or r["data_id"] not in data_file_ids_hex:
            continue
        kept_task_ids_hex.add(r["id"])
        lines.append(
            "insert into public.training_tasks (id, user_id, data_id, status, config, started_at, completed_at, error_message, created_at) values ("
            + ", ".join(
                [
                    _uuid(r["id"]),
                    _uuid(r["user_id"]),
                    _uuid(r["data_id"]),
                    _q(r["status"]),
                    _jsonb(r["config"]),
                    _ts(r["started_at"]),
                    _ts(r["completed_at"]),
                    ("null" if r["error_message"] is None else _q(r["error_message"])),
                    _ts(r["created_at"]),
                ]
            )
            + ") on conflict (id) do nothing;"
        )

    cur.execute("select * from training_results")
    for r in cur.fetchall():
        if r["task_id"] not in kept_task_ids_hex:
            continue
        lines.append(
            "insert into public.training_results (id, task_id, r2_score, rmse, mae, mape, metrics, model_path, plot_path, predictions, created_at) values ("
            + ", ".join(
                [
                    _uuid(r["id"]),
                    _uuid(r["task_id"]),
                    str(float(r["r2_score"])),
                    str(float(r["rmse"])),
                    str(float(r["mae"])),
                    str(float(r["mape"])),
                    _jsonb(r["metrics"]),
                    _q(r["model_path"]),
                    ("null" if r["plot_path"] is None else _q(r["plot_path"])),
                    _jsonb(r["predictions"]),
                    _ts(r["created_at"]),
                ]
            )
            + ") on conflict (id) do nothing;"
        )

    cur.execute("select * from training_logs")
    for r in cur.fetchall():
        if r["task_id"] not in kept_task_ids_hex:
            continue
        lines.append(
            "insert into public.training_logs (id, task_id, epoch, train_loss, val_loss, metrics, logged_at) values ("
            + ", ".join(
                [
                    _uuid(r["id"]),
                    _uuid(r["task_id"]),
                    str(int(r["epoch"])),
                    str(float(r["train_loss"])),
                    ("null" if r["val_loss"] is None else str(float(r["val_loss"]))),
                    _jsonb(r["metrics"]),
                    _ts(r["logged_at"]),
                ]
            )
            + ") on conflict (id) do nothing;"
        )

    lines.append("commit;")

    OUT_SQL.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"Wrote seed migration: {OUT_SQL} ({len(lines)} lines)")


if __name__ == "__main__":
    main()
