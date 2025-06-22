class DebugTracker:
    def __init__(self):
        self.counts = {}

    def count(self, category):
        self.counts[category] = self.counts.get(category, 0) + 1

    def summary(self, total=None):
        if total is not None:
            print(f"--- Analysis Complete ---")
        for k, v in sorted(self.counts.items(), key=lambda x: -x[1]):
            print(f"{k:<20}: {v}")
        if total is not None:
            print(f"-------------------------\nFiltered out {sum(self.counts.values())} items total.")
