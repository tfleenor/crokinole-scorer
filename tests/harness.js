/* Test harness: loaded into a copy of index.html by run-tests.ps1.
   Reads a scenario from window.SCENARIO, drives the real UI, and writes
   assertion results into a #test-log div for the runner to scrape. */
window.addEventListener("load", () => {
  const S = window.SCENARIO;
  const log = [];
  const assert = (name, cond, detail) =>
    log.push((cond ? "PASS" : "FAIL") + " " + name + (cond ? "" : " [" + detail + "]"));
  try {
    localStorage.clear();
    location.hash = ""; // ensure clean state; harness pages are file://
    // reload-free reset: the app booted with empty storage already in headless

    document.getElementById("mode").value = S.mode;
    document.getElementById("mode").dispatchEvent(new Event("change"));
    if (S.cutScoring) {
      document.getElementById("cut-scoring").value = S.cutScoring;
      document.getElementById("cut-scoring").dispatchEvent(new Event("change"));
    }
    if (S.discs) document.getElementById("discs").value = String(S.discs);
    document.getElementById("start").click();

    const tap = (side, value, times) => {
      for (let i = 0; i < times; i++) {
        document
          .querySelector('.counter[data-side="' + side + '"][data-value="' + value + '"] .inc')
          .click();
      }
    };
    for (const round of S.rounds) {
      for (const [side, value, times] of round) tap(side, value, times);
      document.getElementById("score-round").click();
    }

    const scores = Array.from(document.querySelectorAll("#scoreboard .pts"))
      .map((e) => e.textContent)
      .join(",");
    // scores may be mid count-up animation; read state from storage instead
    const st = JSON.parse(localStorage.getItem("crokinole-state-v2"));
    assert("scores", st.scores.join(",") === S.expectScores, st.scores.join(","));
    if (S.expectWinner !== undefined) {
      assert("winner", String(st.winner) === String(S.expectWinner), String(st.winner));
    }
    if (S.expectHistoryCount !== undefined) {
      const h = JSON.parse(localStorage.getItem("crokinole-history-v1") || "[]");
      assert("history", h.length === S.expectHistoryCount, "len=" + h.length);
    }
    if (S.maxDiscCheck) {
      // try to overfill: tap 20s far beyond the side's disc count
      tap(0, 20, 30);
      const t = JSON.parse(localStorage.getItem("crokinole-state-v2")).tally[0];
      const total = [20, 15, 10, 5].reduce((a, v) => a + t[v], 0);
      assert("disc-cap", total === S.maxDiscCheck, "total=" + total);
    }
  } catch (e) {
    log.push("FAIL exception [" + e.message + "]");
  }
  const d = document.createElement("div");
  d.id = "test-log";
  d.textContent = log.join(" ;; ");
  document.body.appendChild(d);
});
