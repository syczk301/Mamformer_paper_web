import sqlite3
import binascii


def main() -> None:
    conn = sqlite3.connect("api/mamformer.db")
    cur = conn.cursor()

    cur.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    print("tables:", [r[0] for r in cur.fetchall()])

    for t in ["users", "data_files", "training_tasks", "training_results", "training_logs"]:
        print("\n==", t)
        cur.execute(f"PRAGMA table_info({t})")
        cols = cur.fetchall()
        print("cols:", [(c[1], c[2]) for c in cols])
        cur.execute(f"SELECT * FROM {t} LIMIT 1")
        row = cur.fetchone()
        print("sample:", row)
        if row:
            for i, v in enumerate(row):
                if isinstance(v, (bytes, bytearray)):
                    print(
                        "bytes:",
                        cols[i][1],
                        "len=",
                        len(v),
                        "hex=",
                        binascii.hexlify(v).decode("ascii")[:64],
                    )


if __name__ == "__main__":
    main()
