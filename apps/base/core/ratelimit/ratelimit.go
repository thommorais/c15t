// Package ratelimit caps how often a caller may hit an endpoint.
package ratelimit

import (
	"sync"
	"time"
)

type Rule struct {
	// Limit is the number of requests allowed per window. Zero disables the
	// rule entirely.
	Limit  int
	Window time.Duration
}

type counter struct {
	count int
	start time.Time
}

// Limiter is a fixed window counter, safe for concurrent use. State lives in
// memory, so each instance limits only the traffic it sees; with one deployment
// per client that is the whole of it.
type Limiter struct {
	rule Rule

	mu      sync.Mutex
	entries map[string]*counter
}

func New(rule Rule) *Limiter {
	return &Limiter{rule: rule, entries: map[string]*counter{}}
}

func (l *Limiter) Allow(key string, now time.Time) bool {
	if l.rule.Limit <= 0 {
		return true
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	l.prune(now)

	entry, ok := l.entries[key]
	if !ok || now.Sub(entry.start) >= l.rule.Window {
		l.entries[key] = &counter{count: 1, start: now}
		return true
	}

	if entry.count >= l.rule.Limit {
		return false
	}

	entry.count++
	return true
}

// RetryAfter reports how long until the caller's window resets, or zero when it
// is not currently limited.
func (l *Limiter) RetryAfter(key string, now time.Time) time.Duration {
	if l.rule.Limit <= 0 {
		return 0
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	entry, ok := l.entries[key]
	if !ok {
		return 0
	}

	remaining := l.rule.Window - now.Sub(entry.start)
	if remaining < 0 {
		return 0
	}

	return remaining
}

func (l *Limiter) Size() int {
	l.mu.Lock()
	defer l.mu.Unlock()

	return len(l.entries)
}

// prune drops windows that have already elapsed so idle keys do not accumulate.
func (l *Limiter) prune(now time.Time) {
	for key, entry := range l.entries {
		if now.Sub(entry.start) >= l.rule.Window {
			delete(l.entries, key)
		}
	}
}
