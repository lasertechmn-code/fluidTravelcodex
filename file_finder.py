"""
File Finder - A PowerShell-backed file search utility with fuzzy matching.
"""
import customtkinter as ctk
import subprocess
import threading
import time
import os
import re
from datetime import datetime
from rapidfuzz import fuzz

# ── Theme ────────────────────────────────────────────────────────────────────
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

# ── Constants ────────────────────────────────────────────────────────────────
ACCENT      = "#1f6aa5"
BG_DARK     = "#1a1a2e"
BG_MID      = "#16213e"
BG_CARD     = "#0f3460"
TEXT_MAIN   = "#e0e0e0"
TEXT_DIM    = "#888888"
GREEN       = "#4caf50"
ORANGE      = "#ff9800"
RED         = "#f44336"
YELLOW      = "#ffeb3b"


# ── Result Row ───────────────────────────────────────────────────────────────
class ResultRow(ctk.CTkFrame):
    """One result card: icon | path | actions | match score."""

    def __init__(self, master, result: dict, row_index: int, **kwargs):
        super().__init__(master, fg_color=BG_CARD if row_index % 2 == 0 else BG_MID,
                         corner_radius=6, **kwargs)

        self.result = result
        self.columnconfigure(1, weight=1)

        # Icon
        icon = "📁" if result["type"] == "dir" else "📄"
        ctk.CTkLabel(self, text=icon, font=("Segoe UI", 16), width=30,
                     text_color=TEXT_MAIN).grid(row=0, column=0, padx=(8, 4), pady=6)

        # Path info
        info_frame = ctk.CTkFrame(self, fg_color="transparent")
        info_frame.grid(row=0, column=1, sticky="ew", pady=4)
        info_frame.columnconfigure(0, weight=1)

        ctk.CTkLabel(info_frame, text=result["name"],
                     font=("Segoe UI", 13, "bold"),
                     text_color=TEXT_MAIN, anchor="w").grid(row=0, column=0, sticky="w")

        ctk.CTkLabel(info_frame, text=result["parent"],
                     font=("Segoe UI", 10),
                     text_color=TEXT_DIM, anchor="w").grid(row=1, column=0, sticky="w")

        # Score badge
        score = result.get("score", 100)
        score_color = GREEN if score >= 80 else ORANGE if score >= 50 else TEXT_DIM
        ctk.CTkLabel(self, text=f"{score}%", font=("Segoe UI", 11, "bold"),
                     text_color=score_color, width=40).grid(row=0, column=2, padx=6)

        # Buttons
        btn_frame = ctk.CTkFrame(self, fg_color="transparent")
        btn_frame.grid(row=0, column=3, padx=(4, 8))

        ctk.CTkButton(btn_frame, text="Open Dir", width=80, height=26,
                      font=("Segoe UI", 11),
                      command=self._open_dir).pack(side="left", padx=2)

        if result["type"] == "file":
            ctk.CTkButton(btn_frame, text="Open File", width=80, height=26,
                          font=("Segoe UI", 11),
                          fg_color="#2a6496", hover_color="#1e4d72",
                          command=self._open_file).pack(side="left", padx=2)

    def _open_dir(self):
        folder = self.result["parent"]
        try:
            subprocess.Popen(["explorer", folder])
        except Exception:
            pass

    def _open_file(self):
        full = self.result["fullpath"]
        try:
            os.startfile(full)
        except Exception:
            pass


# ── Main App ─────────────────────────────────────────────────────────────────
class FileFinderApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("File Finder")
        self.geometry("1100x780")
        self.minsize(800, 600)

        self._search_thread: threading.Thread | None = None
        self._cancel_flag = threading.Event()
        self._results: list[dict] = []
        self._access_denied: list[str] = []
        self._stats = {"searched": 0, "found": 0, "denied": 0, "elapsed": 0.0}

        self._build_ui()

    # ── UI construction ───────────────────────────────────────────────────────
    def _build_ui(self):
        self.columnconfigure(0, weight=1)
        self.rowconfigure(1, weight=1)

        # ── Top bar ──
        top = ctk.CTkFrame(self, corner_radius=0, fg_color=BG_DARK, height=60)
        top.grid(row=0, column=0, sticky="nsew")
        top.columnconfigure(3, weight=1)

        ctk.CTkLabel(top, text="⚡ File Finder", font=("Segoe UI", 20, "bold"),
                     text_color=ACCENT).grid(row=0, column=0, padx=16, pady=12)

        # Dir path
        ctk.CTkLabel(top, text="Directory:", font=("Segoe UI", 12),
                     text_color=TEXT_DIM).grid(row=0, column=1, padx=(20, 4))
        self.dir_var = ctk.StringVar(
            value=r"\\mn10st9002\ENIshare\Projects\Infrastructure\Zetox")
        self.dir_entry = ctk.CTkEntry(top, textvariable=self.dir_var,
                                      width=380, font=("Consolas", 11))
        self.dir_entry.grid(row=0, column=2, padx=4)

        ctk.CTkButton(top, text="Browse", width=70, height=30,
                      command=self._browse).grid(row=0, column=3, padx=4, sticky="w")

        # ── Search bar ──
        search_bar = ctk.CTkFrame(self, corner_radius=0, fg_color=BG_MID, height=54)
        search_bar.grid(row=1, column=0, sticky="nsew")
        search_bar.columnconfigure(1, weight=1)
        # override row weight so only the results panel grows
        self.rowconfigure(1, weight=0)
        self.rowconfigure(2, weight=1)

        ctk.CTkLabel(search_bar, text="Search:", font=("Segoe UI", 13),
                     text_color=TEXT_DIM).grid(row=0, column=0, padx=(16, 6), pady=12)

        self.query_var = ctk.StringVar()
        self.query_entry = ctk.CTkEntry(search_bar, textvariable=self.query_var,
                                        placeholder_text="e.g. SystemEquipment  (partial & fuzzy ok)",
                                        font=("Segoe UI", 13), height=36)
        self.query_entry.grid(row=0, column=1, sticky="ew", padx=6, pady=8)
        self.query_entry.bind("<Return>", lambda _: self._start_search())

        # Fuzzy threshold
        ctk.CTkLabel(search_bar, text="Fuzzy %:", font=("Segoe UI", 11),
                     text_color=TEXT_DIM).grid(row=0, column=2, padx=(8, 2))
        self.threshold_var = ctk.IntVar(value=60)
        self.threshold_slider = ctk.CTkSlider(search_bar, from_=0, to=100,
                                               number_of_steps=100,
                                               variable=self.threshold_var, width=120)
        self.threshold_slider.grid(row=0, column=3, padx=4)
        self.threshold_label = ctk.CTkLabel(search_bar, text="60%",
                                             font=("Segoe UI", 11), width=36,
                                             text_color=TEXT_MAIN)
        self.threshold_label.grid(row=0, column=4, padx=(2, 8))
        self.threshold_var.trace_add("write", self._update_threshold_label)

        # Filter: files / dirs / both
        ctk.CTkLabel(search_bar, text="Type:", font=("Segoe UI", 11),
                     text_color=TEXT_DIM).grid(row=0, column=5, padx=(8, 2))
        self.type_var = ctk.StringVar(value="Both")
        ctk.CTkOptionMenu(search_bar, variable=self.type_var,
                          values=["Both", "Files only", "Dirs only"],
                          width=110).grid(row=0, column=6, padx=4)

        self.search_btn = ctk.CTkButton(search_bar, text="Search", width=90, height=36,
                                         font=("Segoe UI", 13, "bold"),
                                         command=self._start_search)
        self.search_btn.grid(row=0, column=7, padx=(8, 4))

        self.cancel_btn = ctk.CTkButton(search_bar, text="Cancel", width=80, height=36,
                                         font=("Segoe UI", 12),
                                         fg_color="#5a2d2d", hover_color="#7a3d3d",
                                         state="disabled",
                                         command=self._cancel_search)
        self.cancel_btn.grid(row=0, column=8, padx=(0, 16))

        # ── Main body: results + sidebar ──
        body = ctk.CTkFrame(self, fg_color="transparent")
        body.grid(row=2, column=0, sticky="nsew", padx=8, pady=(4, 4))
        body.columnconfigure(0, weight=1)
        body.columnconfigure(1, weight=0)
        body.rowconfigure(0, weight=1)

        # Results scroll area
        self.results_scroll = ctk.CTkScrollableFrame(
            body, fg_color=BG_DARK, corner_radius=8, label_text="")
        self.results_scroll.grid(row=0, column=0, sticky="nsew", padx=(0, 4))
        self.results_scroll.columnconfigure(0, weight=1)

        self.empty_label = ctk.CTkLabel(
            self.results_scroll,
            text="Enter a search term and press Search (or Enter).",
            font=("Segoe UI", 13), text_color=TEXT_DIM)
        self.empty_label.grid(row=0, column=0, pady=60)

        # Sidebar: telemetry + denied list
        sidebar = ctk.CTkFrame(body, width=260, fg_color=BG_MID, corner_radius=8)
        sidebar.grid(row=0, column=1, sticky="nsew")
        sidebar.columnconfigure(0, weight=1)
        sidebar.rowconfigure(3, weight=1)

        ctk.CTkLabel(sidebar, text="Telemetry", font=("Segoe UI", 14, "bold"),
                     text_color=ACCENT).grid(row=0, column=0, pady=(12, 4), padx=12, sticky="w")

        self.tele_frame = ctk.CTkFrame(sidebar, fg_color=BG_DARK, corner_radius=6)
        self.tele_frame.grid(row=1, column=0, padx=12, sticky="ew")
        self.tele_frame.columnconfigure(1, weight=1)

        self._tele_vars = {}
        tele_fields = [
            ("Files searched", "searched"),
            ("Matches found",  "found"),
            ("Access denied",  "denied"),
            ("Elapsed (s)",    "elapsed"),
            ("Last hit at",    "last_hit"),
        ]
        for i, (label, key) in enumerate(tele_fields):
            ctk.CTkLabel(self.tele_frame, text=label + ":",
                         font=("Segoe UI", 11), text_color=TEXT_DIM,
                         anchor="w").grid(row=i, column=0, padx=8, pady=3, sticky="w")
            v = ctk.StringVar(value="—")
            self._tele_vars[key] = v
            ctk.CTkLabel(self.tele_frame, textvariable=v,
                         font=("Segoe UI", 11, "bold"), text_color=TEXT_MAIN,
                         anchor="e").grid(row=i, column=1, padx=8, pady=3, sticky="e")

        ctk.CTkLabel(sidebar, text="Access Denied Paths",
                     font=("Segoe UI", 13, "bold"), text_color=RED).grid(
            row=2, column=0, pady=(14, 4), padx=12, sticky="w")

        self.denied_box = ctk.CTkTextbox(sidebar, font=("Consolas", 9),
                                          fg_color=BG_DARK, text_color=RED,
                                          state="disabled", wrap="word")
        self.denied_box.grid(row=3, column=0, padx=12, pady=(0, 12), sticky="nsew")

        # ── Status bar ──
        status_bar = ctk.CTkFrame(self, corner_radius=0, fg_color=BG_DARK, height=28)
        status_bar.grid(row=3, column=0, sticky="nsew")
        status_bar.columnconfigure(0, weight=1)

        self.status_var = ctk.StringVar(value="Ready.")
        ctk.CTkLabel(status_bar, textvariable=self.status_var,
                     font=("Segoe UI", 11), text_color=TEXT_DIM,
                     anchor="w").grid(row=0, column=0, padx=12, sticky="w")

        self.progress = ctk.CTkProgressBar(status_bar, width=180, height=10,
                                            mode="indeterminate")
        self.progress.grid(row=0, column=1, padx=12)
        self.progress.set(0)

    # ── Helpers ───────────────────────────────────────────────────────────────
    def _update_threshold_label(self, *_):
        self.threshold_label.configure(text=f"{self.threshold_var.get()}%")

    def _browse(self):
        from tkinter import filedialog
        folder = filedialog.askdirectory(initialdir=self.dir_var.get() or "/")
        if folder:
            self.dir_var.set(folder)

    def _clear_results(self):
        for w in self.results_scroll.winfo_children():
            w.destroy()
        self._results.clear()
        self._access_denied.clear()

    # ── Search orchestration ──────────────────────────────────────────────────
    def _start_search(self):
        query = self.query_var.get().strip()
        directory = self.dir_var.get().strip()
        if not query or not directory:
            self.status_var.set("⚠  Please enter both a directory and a search term.")
            return

        if self._search_thread and self._search_thread.is_alive():
            return

        self._cancel_flag.clear()
        self._clear_results()

        # Reset telemetry
        for k, v in self._tele_vars.items():
            v.set("—")

        self.empty_label = ctk.CTkLabel(
            self.results_scroll,
            text="Searching…",
            font=("Segoe UI", 13), text_color=TEXT_DIM)
        self.empty_label.grid(row=0, column=0, pady=60)

        self.search_btn.configure(state="disabled")
        self.cancel_btn.configure(state="normal")
        self.progress.configure(mode="indeterminate")
        self.progress.start()
        self.status_var.set(f"Searching '{directory}' for '{query}' …")

        self._search_thread = threading.Thread(
            target=self._run_search,
            args=(directory, query),
            daemon=True)
        self._search_thread.start()

    def _cancel_search(self):
        self._cancel_flag.set()
        self.status_var.set("Cancelling…")

    def _run_search(self, directory: str, query: str):
        """Background thread: runs PowerShell Get-ChildItem and streams results."""
        threshold = self.threshold_var.get()
        type_filter = self.type_var.get()

        # Build PowerShell command – retrieve all items then filter in Python for fuzzy
        ps_script = (
            "Get-ChildItem "
            f'-Path "{directory}" '
            "-Recurse "
            "-Force "
            "-ErrorAction Continue "
            "2>&1 | ForEach-Object { "
            "  if ($_ -is [System.Management.Automation.ErrorRecord]) { "
            "    'ERR::' + $_.Exception.Message "
            "  } else { "
            "    $_.FullName + '|' + $_.PSIsContainer "
            "  } "
            "}"
        )

        cmd = ["powershell", "-NoProfile", "-NonInteractive",
               "-ExecutionPolicy", "Bypass", "-Command", ps_script]

        t_start = time.perf_counter()
        searched = 0
        found = 0
        denied = 0
        last_hit_time = None

        try:
            proc = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                encoding="utf-8",
                errors="replace"
            )

            for raw_line in proc.stdout:
                if self._cancel_flag.is_set():
                    proc.terminate()
                    break

                line = raw_line.strip()
                if not line:
                    continue

                # Access-denied error lines
                if line.startswith("ERR::"):
                    msg = line[5:]
                    if "denied" in msg.lower() or "unauthorized" in msg.lower() or \
                       "permission" in msg.lower():
                        denied += 1
                        self._access_denied.append(msg)
                        self.after(0, self._update_denied_box)
                    continue

                # Normal item: fullpath|True/False
                if "|" not in line:
                    continue

                parts = line.rsplit("|", 1)
                if len(parts) != 2:
                    continue

                full_path, is_container = parts
                is_dir = is_container.strip().lower() == "true"
                name = os.path.basename(full_path)
                parent = os.path.dirname(full_path)

                # Type filter
                if type_filter == "Files only" and is_dir:
                    continue
                if type_filter == "Dirs only" and not is_dir:
                    continue

                searched += 1

                # Match: exact substring (case-insensitive) OR fuzzy
                q_lower = query.lower()
                name_lower = name.lower()

                score = 0
                if q_lower in name_lower:
                    # Exact partial match → 100%
                    score = 100
                else:
                    # Fuzzy: partial_ratio handles substring spelling errors
                    score = fuzz.partial_ratio(q_lower, name_lower)

                if score >= threshold:
                    found += 1
                    hit_time = time.perf_counter() - t_start
                    last_hit_time = hit_time
                    result = {
                        "name": name,
                        "parent": parent,
                        "fullpath": full_path,
                        "type": "dir" if is_dir else "file",
                        "score": score,
                        "hit_at": round(hit_time, 3),
                    }
                    self._results.append(result)

                    # Schedule GUI update on main thread
                    idx = len(self._results) - 1
                    elapsed = round(time.perf_counter() - t_start, 2)
                    self.after(0, lambda r=result, i=idx, s=searched,
                                        f=found, d=denied, e=elapsed,
                                        lh=hit_time: self._append_result(r, i, s, f, d, e, lh))

                # Update searched count periodically
                if searched % 500 == 0:
                    s_snap = searched
                    e_snap = round(time.perf_counter() - t_start, 2)
                    self.after(0, lambda s=s_snap, e=e_snap: self._update_tele_partial(s, e))

            proc.wait()

        except Exception as exc:
            self.after(0, lambda e=exc: self.status_var.set(f"Error: {e}"))

        elapsed_total = round(time.perf_counter() - t_start, 2)
        cancelled = self._cancel_flag.is_set()
        self.after(0, lambda: self._finish_search(
            searched, found, denied, elapsed_total, last_hit_time, cancelled))

    # ── GUI update callbacks (always on main thread) ──────────────────────────
    def _append_result(self, result, idx, searched, found, denied, elapsed, hit_at):
        # Remove placeholder label on first result
        for w in self.results_scroll.winfo_children():
            if isinstance(w, ctk.CTkLabel):
                w.destroy()

        row = ResultRow(self.results_scroll, result, idx)
        row.grid(row=idx, column=0, sticky="ew", pady=2, padx=4)
        self.results_scroll.columnconfigure(0, weight=1)

        # Telemetry live update
        self._tele_vars["searched"].set(str(searched))
        self._tele_vars["found"].set(str(found))
        self._tele_vars["denied"].set(str(denied))
        self._tele_vars["elapsed"].set(f"{elapsed}s")
        self._tele_vars["last_hit"].set(f"{hit_at:.3f}s")

    def _update_tele_partial(self, searched, elapsed):
        self._tele_vars["searched"].set(str(searched))
        self._tele_vars["elapsed"].set(f"{elapsed}s")

    def _update_denied_box(self):
        self.denied_box.configure(state="normal")
        self.denied_box.delete("1.0", "end")
        self.denied_box.insert("end", "\n".join(self._access_denied))
        self.denied_box.configure(state="disabled")

    def _finish_search(self, searched, found, denied, elapsed, last_hit, cancelled):
        self.progress.stop()
        self.progress.set(0)
        self.search_btn.configure(state="normal")
        self.cancel_btn.configure(state="disabled")

        # Final telemetry
        self._tele_vars["searched"].set(str(searched))
        self._tele_vars["found"].set(str(found))
        self._tele_vars["denied"].set(str(denied))
        self._tele_vars["elapsed"].set(f"{elapsed}s")
        if last_hit is not None:
            self._tele_vars["last_hit"].set(f"{last_hit:.3f}s")

        # Show empty state if nothing found
        if not self._results:
            for w in self.results_scroll.winfo_children():
                w.destroy()
            msg = ("Cancelled — no results." if cancelled
                   else f"No matches found in {searched:,} items ({elapsed}s).")
            ctk.CTkLabel(self.results_scroll, text=msg,
                         font=("Segoe UI", 13), text_color=TEXT_DIM).grid(
                row=0, column=0, pady=60)

        status = ("Cancelled. " if cancelled else "Done. ")
        status += (f"{found} match{'es' if found != 1 else ''} in "
                   f"{searched:,} items — {elapsed}s total.")
        self.status_var.set(status)


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    app = FileFinderApp()
    app.mainloop()
