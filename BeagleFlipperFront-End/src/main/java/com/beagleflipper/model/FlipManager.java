package com.beagleflipper.model;

import com.beagleflipper.controller.ApiRequestHandler;
import lombok.RequiredArgsConstructor;
import lombok.Setter;
import lombok.extern.slf4j.Slf4j;
import okhttp3.OkHttpClient;

import javax.inject.Inject;
import javax.inject.Singleton;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * This class is essentially a cache of user flips that facilitates efficient access to the flips and statistics for
 * any time range and rs account(s) combination. Since after several years a (very) active user could have hundreds of
 * thousands of flips, it would be too slow to filter and re-calculate flips/statistics from scratch every time.
 * A bucketed aggregation strategy is used where we keep pre-computed weekly buckets of statistics and flips. For any
 * time range we can efficiently combine the weekly buckets and only have to re-calculate statistics for the partial
 * weeks on the boundaries of the time range. Have tested the UI experience with >100k flips.
 */
@Slf4j
@Singleton
@RequiredArgsConstructor(onConstructor_ = @Inject)
public class FlipManager {

    private static final int WEEK_SECS = 7 * 24 * 60 * 60;

    // dependencies
    private final ApiRequestHandler api;
    private final ScheduledExecutorService executorService;
    private final OkHttpClient okHttpClient;
    private final OsrsLoginManager osrsLoginManager;

    @Setter
    private Runnable flipsChangedCallback = () -> {};

    // state
    private String intervalDisplayName;
    private int intervalStartTime;
    private Stats intervalStats = new Stats();

    final Map<String, Integer> displayNameToAccountId = new HashMap<>();
    final Map<Integer, Map<Integer, FlipV2>> lastOpenFLipByItemId = new HashMap<>();
    // FIX: Ensure key type is String
    final Map<String, Integer> existingCloseTimes = new HashMap<>();
    final List<WeekAggregate> weeks = new ArrayList<>(365*5);

    private int resetSeq = 0;
    public volatile boolean flipsLoaded;

    public synchronized String getIntervalDisplayName() {
        return intervalDisplayName;
    }

    public synchronized List<String> getDisplayNameOptions() {
        return displayNameToAccountId.keySet().stream().sorted().collect(Collectors.toList());
    }

    public synchronized long estimateTransactionProfit(String displayName, Transaction t) {
        Integer accountId = displayNameToAccountId.get(displayName);
        if (accountId != null && lastOpenFLipByItemId.containsKey(accountId)) {
            FlipV2 flip = lastOpenFLipByItemId.get(accountId).get(t.getItemId());
            if(flip != null) {
                return flip.calculateProfit(t);
            }
        }
        return 0;
    }

    public synchronized void mergeFlips(List<FlipV2> flips, String displayName) {
        if(!flips.isEmpty() && displayName != null) {
            displayNameToAccountId.put(displayName, flips.get(0).getAccountId());
        }
        flips.forEach(this::mergeFlip_);
        flipsChangedCallback.run();
    }

    public synchronized Stats getIntervalStats() {
        return intervalStats.copy();
    }

    public synchronized Stats calculateStats(int startTime, String displayName) {
        if(displayName == null) {
            return calculateStatsAllAccounts(startTime);
        } else {
            return calculateStatsForAccount(startTime, displayNameToAccountId.getOrDefault(displayName, -1));
        }
    }

    public synchronized void setIntervalDisplayName(String displayName) {
        if (Objects.equals(displayName, intervalDisplayName)) {
            return;
        }
        if (displayName != null && !displayNameToAccountId.containsKey(displayName)) {
            displayNameToAccountId.put(displayName, -1);
        }
        intervalDisplayName = displayName;
        recalculateIntervalStats();
    }

    public synchronized void setIntervalStartTime(int startTime) {
        log.debug("time interval start set to: {}", Instant.ofEpochSecond(startTime));
        if (startTime == intervalStartTime) {
            return;
        }
        intervalStartTime = startTime;
        recalculateIntervalStats();
    }

    private void recalculateIntervalStats() {
        if(intervalDisplayName == null) {
            intervalStats = calculateStatsAllAccounts(intervalStartTime);
        } else {
            intervalStats = calculateStatsForAccount(intervalStartTime, displayNameToAccountId.getOrDefault(intervalDisplayName, -1));
        }
        log.debug("interval flips updated to {}, interval profit updated to {}", intervalStats.flipsMade, intervalStats.profit);
        flipsChangedCallback.run();
    }

    private Stats calculateStatsAllAccounts(int startTime) {
        Stats stats = new Stats();
        WeekAggregate w = getOrInitWeek(startTime);
        for (FlipV2 f : w.flipsAfter(startTime, false)) {
            stats.addFlip(f);
        }
        for(int i=w.pos+1; i < weeks.size(); i++) {
            stats.add(weeks.get(i).allStats);
        }
        return stats;
    }

    private Stats calculateStatsForAccount(int startTime, int accountId) {
        Stats stats = new Stats();
        WeekAggregate w = getOrInitWeek(startTime);
        for (FlipV2 f : w.flipsAfterForAccount(startTime, accountId)) {
            stats.addFlip(f);
        }
        for(int i=w.pos+1; i < weeks.size(); i++) {
            stats.add(weeks.get(i).accountIdToStats.get(accountId));
        }
        return stats;
    }

    public synchronized List<FlipV2> getPageFlips(int page, int pageSize) {
        Integer accountId = intervalDisplayName == null ? null : displayNameToAccountId.getOrDefault(intervalDisplayName, -1);
        if (Objects.equals(accountId,-1)) {
            return new ArrayList<>();
        }

        int toSkip = (page -1) * pageSize;
        WeekAggregate intervalWeek = getOrInitWeek(intervalStartTime);
        List<FlipV2> resultFlips = new ArrayList<>(pageSize);
        for(int i=weeks.size()-1; i >= intervalWeek.pos; i--) {
            if (weeks.get(i).weekEnd <= intervalStartTime || resultFlips.size() == pageSize) {
                break;
            }
            WeekAggregate w = weeks.get(i);
            List<FlipV2> weekFlips = accountId == null ? w.flipsAfter(intervalStartTime, true) : w.flipsAfterForAccount(intervalStartTime, accountId);
            int n = weekFlips.size();
            if (n > toSkip) {
                // note: weekFlips are ascending order but we return pages of descending order
                int end = n - toSkip;
                int start = Math.max(0, end - (pageSize - resultFlips.size()));
                for(int ii=end-1; ii >= start; ii--) {
                    resultFlips.add(weekFlips.get(ii));
                }
                toSkip = 0;
            } else {
                toSkip -= n;
            }
        }
        return resultFlips;
    }

    public void loadFlipsAsync() {
        executorService.execute(() -> this.loadFlips(resetSeq));
    }

    private void loadFlips(int seq) {
        final String currentDisplayName = osrsLoginManager.getPlayerDisplayName();
        if (currentDisplayName == null) {
            log.debug("No display name available to load flips. Skipping.");
            return;
        }

        okHttpClient.dispatcher().executorService().submit(() -> {
            try {
                long s = System.nanoTime();
                Map<String, Integer> names = api.loadUserDisplayNames(currentDisplayName);
                synchronized (this) {
                    if (seq != resetSeq) {
                        return;
                    }
                    displayNameToAccountId.putAll(names);
                }
                log.debug("loading account names took {}ms", (System.nanoTime() - s) / 1000_000);
                s = System.nanoTime();
                List<FlipV2> flips = api.LoadFlips(currentDisplayName);
                log.debug("loading {} flips took {}ms", flips.size(), (System.nanoTime() - s) / 1000_000);
                s = System.nanoTime();
                synchronized (this) {
                    if (seq != resetSeq) {
                        return;
                    }
                    mergeFlips(flips, currentDisplayName);
                    log.debug("merging flips took {}ms", (System.nanoTime() - s) / 1000_000);
                    flipsLoaded = true;
                }
                flipsChangedCallback.run();
            }
            // Catch a broader exception here to log more details.
            catch (Exception e) {
                if (this.resetSeq == seq) {
                    log.warn("failed to load historical flips from server {}. Retrying in 10s. Stack: {}", e.getMessage(), e);
                    executorService.schedule(() -> this.loadFlips(seq), 10, TimeUnit.SECONDS);
                }
            }
        });
    }


    public synchronized void reset() {
        intervalDisplayName = null;
        intervalStartTime = 0;
        intervalStats = new Stats();
        displayNameToAccountId.clear();
        lastOpenFLipByItemId.clear();
        existingCloseTimes.clear(); // Clear existingCloseTimes, keys are String
        weeks.clear();
        flipsLoaded = false;
        resetSeq += 1;
    }

    private void mergeFlip_(FlipV2 flip) {
        // existingCloseTimes is Map<String, Integer>, flip.getId() is String
        // FIX: Ensure flip.getId() is treated as String
        Integer existingCloseTime = existingCloseTimes.get(flip.getId());

        Integer intervalAccountId = intervalDisplayName == null ? null : displayNameToAccountId.getOrDefault(intervalDisplayName, -1);

        if(existingCloseTime != null) {
            WeekAggregate wa = getOrInitWeek(existingCloseTime);
            // removeFlip now takes String ID
            FlipV2 removed = wa.removeFlip(flip.getId(), existingCloseTime, flip.getAccountId());
            if(removed.getClosedTime() >= intervalStartTime && (intervalAccountId == null || removed.getAccountId() == intervalAccountId)) {
                intervalStats.subtractFlip(removed);
            }
        }
        WeekAggregate wa = getOrInitWeek(flip.getClosedTime());
        wa.addFlip(flip);
        if(flip.getClosedTime() >= intervalStartTime && (intervalAccountId == null || flip.getAccountId() == intervalAccountId)) {
            intervalStats.addFlip(flip);
        }
        if(flip.getClosedQuantity() < flip.getOpenedQuantity()) {
            lastOpenFLipByItemId.computeIfAbsent(flip.getAccountId(), (k) -> new HashMap<>()).put(flip.getItemId(), flip);
        } else if (flip.isClosed()) {
            lastOpenFLipByItemId.computeIfAbsent(flip.getAccountId(), (k) -> new HashMap<>()).remove(flip.getItemId());
        }
        // FIX: Ensure flip.getId() is treated as String
        existingCloseTimes.put(flip.getId(), flip.getClosedTime());
    }

    private WeekAggregate getOrInitWeek(int closeTime) {
        int ws = closeTime - (closeTime % WEEK_SECS);
        int i = bisect(weeks.size(), (a) ->  Integer.compare(weeks.get(a).weekStart, ws));
        if (i >= 0){
            WeekAggregate w = weeks.get(i);
            w.pos = i;
            return w;
        }
        WeekAggregate wf = new WeekAggregate();
        wf.weekStart = ws;
        wf.weekEnd = ws + WEEK_SECS;
        wf.pos = -i-1;
        weeks.add(wf.pos, wf);
        return wf;
    }

    class WeekAggregate {

        int pos; // note: only correct when returned by getOrInitWeek
        int weekStart;
        int weekEnd;

        Stats allStats = new Stats();
        Map<Integer, Stats> accountIdToStats = new HashMap<>(20);
        Map<Integer, List<FlipV2>> accountIdToFlips = new HashMap<>(20);

        void addFlip(FlipV2 flip) {
            int accountId = flip.getAccountId();
            allStats.addFlip(flip);
            accountIdToStats.computeIfAbsent(accountId, (k) -> new Stats()).addFlip(flip);
            List<FlipV2> flips = accountIdToFlips.computeIfAbsent(accountId, (k) -> new ArrayList<>());
            // Use String ID for comparison
            int i = bisect(flips.size(), closedTimeCmp(flips, flip.getId(), flip.getClosedTime()));
            flips.add(-i -1, flip);
        }

        FlipV2 removeFlip(String id, int closeTime, int accountId) { // FIX: Change id to String
            List<FlipV2> flips = accountIdToFlips.computeIfAbsent(accountId, (k) -> new ArrayList<>());
            // Use String ID for comparison
            int i = bisect(flips.size(), closedTimeCmp(flips, id, closeTime));
            FlipV2 flip = flips.get(i);
            allStats.subtractFlip(flip);
            flips.remove(i);
            accountIdToStats.get(accountId).subtractFlip(flip);
            return flip;
        }

        public List<FlipV2> flipsAfterForAccount(int time, int accountId) {
            if (weekEnd <= time) {
                return Collections.emptyList();
            }
            List<FlipV2> flips = accountIdToFlips.computeIfAbsent(accountId, (k) -> new ArrayList<>());
            if (time <= weekStart) {
                return flips;
            }
            // FIX: Pass a dummy string for ID comparison in bisect if no specific ID is relevant for the range
            // This string should be chosen such that it reliably sorts beyond any real ID for this purpose.
            // Using a high Unicode character is a common trick for string "max"
            int cut = -bisect(flips.size(), closedTimeCmp(flips, "\uFFFF", time)) - 1;
            return flips.subList(cut, flips.size());
        }

        public List<FlipV2> flipsAfter(int time, boolean requireSorted) {
            if (weekEnd <= time) {
                return Collections.emptyList();
            }
            List<FlipV2> combinedFlips = new ArrayList<>(allStats.flipsMade);
            accountIdToFlips.keySet().forEach(i -> combinedFlips.addAll(flipsAfterForAccount(time, i)));
            if (requireSorted) {
                combinedFlips.sort(Comparator.comparing(FlipV2::getClosedTime).thenComparing(FlipV2::getId));
            }
            return combinedFlips;
        }

        @Override
        public String toString() {
            return String.format("WeekAggregate[start=%s, flips=%d]", Instant.ofEpochSecond(weekStart), allStats.flipsMade);
        }
    }

    // FIX: Change id to String in closedTimeCmp signature
    private Function<Integer, Integer> closedTimeCmp(List<FlipV2> flips, String id, int time) {
        return (a) -> {
            int c = Integer.compare(flips.get(a).getClosedTime(), time);
            // If times are equal, use String comparison for IDs as a tie-breaker.
            // Objects.compare handles nulls gracefully and uses natural ordering for Strings.
            return c != 0 ? c : Objects.compare(id, flips.get(a).getId(), Comparator.naturalOrder());
        };
    }

    private int bisect(int size, Function<Integer, Integer> cmpFunc) {
        int high = size -1;
        int low = 0;
        while (low <= high) {
            int mid = (low + high) >>> 1;
            int cmp = cmpFunc.apply(mid);
            if (cmp < 0)
                low = mid + 1;
            else if (cmp > 0)
                high = mid - 1;
            else
                return mid; // key found
        }
        return -(low + 1);  // key not found (low = insertion point)
    }
}