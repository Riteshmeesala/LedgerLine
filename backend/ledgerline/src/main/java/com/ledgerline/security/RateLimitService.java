package com.ledgerline.security;

import com.ledgerline.exception.RateLimitExceededException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Single-instance in-memory rate limiter using fixed-window request counting.
 *
 * NOTE ON ARCHITECTURE:
 * This rate limiter is implemented strictly in-memory using concurrent data structures.
 * It protects a single application instance against burst floods and brute-force probing.
 * In a multi-node horizontal deployment, this must be backed by a centralized Redis cluster
 * or API gateway token bucket.
 */
@Service
public class RateLimitService {

    private static class WindowCounter {
        final long windowStartEpochSecond;
        final AtomicInteger count = new AtomicInteger(0);

        WindowCounter(long epochSecond) {
            this.windowStartEpochSecond = epochSecond;
        }
    }

    @org.springframework.beans.factory.annotation.Value("${ledgerline.rate-limit.enabled:true}")
    private boolean enabled;

    private final Map<String, WindowCounter> buckets = new ConcurrentHashMap<>();

    /**
     * Enforces rate limiting on a specific action key.
     *
     * @param key Identifies the bucket (e.g., "auth:" + ipAddress or "write:" + userId).
     * @param maxRequests Maximum requests permitted within the window duration.
     * @param windowSeconds Window length in seconds.
     */
    public void checkRateLimit(String key, int maxRequests, int windowSeconds) {
        if (!enabled) {
            return;
        }

        long currentEpochSecond = Instant.now().getEpochSecond();
        long windowBucketIndex = currentEpochSecond / windowSeconds;
        String bucketKey = key + ":" + windowBucketIndex;

        WindowCounter counter = buckets.computeIfAbsent(bucketKey, k -> new WindowCounter(currentEpochSecond));
        int currentCount = counter.count.incrementAndGet();

        if (currentCount > maxRequests) {
            throw new RateLimitExceededException("Rate limit exceeded. Maximum " + maxRequests + " requests allowed per " + windowSeconds + " seconds.");
        }

        // Housekeeping: remove old keys periodically
        if (buckets.size() > 10000) {
            buckets.entrySet().removeIf(entry -> (currentEpochSecond - entry.getValue().windowStartEpochSecond) > (windowSeconds * 2L));
        }
    }
}

